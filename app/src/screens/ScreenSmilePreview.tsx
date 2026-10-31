import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { SmileMaskEditor, type SmileSegmentPoint } from '../components/SmileMaskEditor';
import type { SmileMaskSession } from '../lib/auto-smile-mask';
import { useApp } from '../state/AppContext';
import { useRouter } from '../router/Router';
import { useBackButton } from '../telegram/useBackButton';
import { useMainButton } from '../telegram/useMainButton';
import {
  UPPER_TEETH, SMILE_SHADES, deleteSmileJob, downloadSmilePng, generateSmilePreview, getSmileJobStatus, loadSmileResult,
  isSmilePreviewReady, normalizeSmilePhoto, prepareSmileJob, readSmileJobId,
  rememberSmileJobId, smileErrorMessage, SmilePreviewError, uploadSmilePng,
  type NormalizedSmilePhoto, type SmileSettings, type SmileShade, type SmileShape,
} from '../lib/smile-preview';
import '../styles/smile-preview.css';

type Photo = NormalizedSmilePhoto & { url: string };
type Phase = 'editing' | 'uploading' | 'processing' | 'pending' | 'prepared' | 'done' | 'failed';
const POLL_LIMIT_MS = 12 * 60_000;
const SHAPES: Array<{ id: SmileShape; label: string }> = [
  { id: 'original', label: 'Исходная' }, { id: 'square', label: 'Квадратная' },
  { id: 'triangular', label: 'Треугольная' }, { id: 'rounded', label: 'Округлая' },
];
const SHADE_COLORS = [
  '#fcfbf3', '#f8f6e9', '#f4efdb', '#eee7cc', '#eee5cd', '#e7d7b8', '#ddc8a0', '#d4bb90', '#c8ac80',
  '#f0ebd8', '#e8dfbd', '#ddcda2', '#d2be88', '#e1ddce', '#d1cbb9', '#bdb6a1', '#a7a18b', '#dfd5c3', '#d1c3ac', '#c4b69c',
];

function FormSection({ step, title, hint, children }: { step: string; title: string; hint?: string; children: ReactNode }) {
  return <section className="smile-section" aria-label={title}>
    <div className="smile-section-heading"><span className="smile-step mono">{step}</span><h2>{title}</h2></div>
    {hint && <p className="smile-hint">{hint}</p>}
    {children}
  </section>;
}

function ShapeGlyph({ shape }: { shape: SmileShape }) {
  const paths: Record<SmileShape, string> = {
    original: 'M13 8Q23 4 32 8L34 33Q32 39 24 38L14 39Q9 37 10 30Z',
    square: 'M12 8Q22 4 33 8L34 35Q34 39 29 39H14Q10 39 10 35Z',
    triangular: 'M17 7Q23 4 29 7L36 35Q36 39 31 39H13Q8 39 9 35Z',
    rounded: 'M13 9Q23 3 32 9Q38 22 33 34Q23 44 12 34Q7 22 13 9Z',
  };
  return <svg viewBox="0 0 46 46" width="44" height="44" aria-hidden="true"><path d={paths[shape]} fill="currentColor" /><path d="M16 14Q20 10 26 11" fill="none" stroke="var(--c-bg)" strokeOpacity=".12" strokeWidth="2" strokeLinecap="round" /></svg>;
}

export function ScreenSmilePreview() {
  const { user, balanceLoaded } = useApp();
  const { history, back, reset } = useRouter();
  const goBack = useCallback(() => history.length > 1 ? back() : reset('home'), [history.length, back, reset]);
  useBackButton(goBack);
  useMainButton(null);

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [normalizing, setNormalizing] = useState(false);
  const [teeth, setTeeth] = useState<number[]>([...UPPER_TEETH]);
  const [shades, setShades] = useState<Record<string, string>>(() => Object.fromEntries(UPPER_TEETH.map((id) => [id, 'BL1'])));
  const [activeTooth, setActiveTooth] = useState(11);
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const [shape, setShape] = useState<SmileShape>('original');
  const [translucency, setTranslucency] = useState<SmileSettings['translucency']>('natural');
  const [imageResolution, setImageResolution] = useState<'1K' | '2K'>('2K');
  const [zenithMode, setZenithMode] = useState<SmileSettings['zenithMode']>('preserve');
  const [zenithInstruction, setZenithInstruction] = useState('');
  const [mask, setMask] = useState<Blob | null>(null);
  const [autoMask, setAutoMask] = useState<{ mask: Blob; center: { x: number; y: number } } | null>(null);
  const [autoState, setAutoState] = useState<'idle' | 'loading' | 'ready' | 'points' | 'manual'>('idle');
  const [autoNote, setAutoNote] = useState('');
  const [autoAttempt, setAutoAttempt] = useState(0);
  const [segmentPoints, setSegmentPoints] = useState<SmileSegmentPoint[]>([]);
  const [segmentAttempt, setSegmentAttempt] = useState(0);
  const [segmentationPending, setSegmentationPending] = useState(false);
  const [autoCenter, setAutoCenter] = useState<{ x: number; y: number }>();
  const [maskConfirmed, setMaskConfirmed] = useState(false);
  const [consent, setConsent] = useState(false);
  const [jobId, setJobId] = useState<string | null>(readSmileJobId);
  const [phase, setPhase] = useState<Phase>(() => readSmileJobId() ? 'processing' : 'editing');
  const [resultUrl, setResultUrl] = useState('');
  const [error, setError] = useState('');
  const [comparison, setComparison] = useState(50);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const submitController = useRef<AbortController | null>(null);
  const normalizingRevision = useRef(0);
  const autoRevision = useRef(0);
  const autoController = useRef<AbortController | null>(null);
  const segmentSession = useRef<SmileMaskSession | null>(null);
  const segmentPointsRef = useRef<SmileSegmentPoint[]>([]);
  const seedCount = useRef(0);
  const segmentRevision = useRef(0);
  const segmentController = useRef<AbortController | null>(null);
  const segmentChain = useRef<Promise<void>>(Promise.resolve());
  const disposedSessions = useRef(new WeakSet<SmileMaskSession>());
  const submitting = useRef(false);
  const allowed = Boolean(user.canSmilePreview) && isSmilePreviewReady();
  const busy = phase === 'uploading' || phase === 'processing';
  const editing = phase === 'editing';
  const selected = UPPER_TEETH.filter((id) => teeth.includes(id));
  const chosenShade = (shades[activeTooth] ?? 'BL1') as SmileShade;
  const maskKey = `${photo?.url ?? ''}:${selected.join('-')}:${zenithMode}`;
  const autoEligible = selected.length === UPPER_TEETH.length && zenithMode === 'preserve';
  const canRefineMask = Boolean(segmentSession.current) && autoEligible && autoState !== 'loading';
  const canGenerate = allowed && editing && !normalizing && !deleting && autoState !== 'loading' && !segmentationPending && maskConfirmed && Boolean(photo && mask && selected.length && consent) &&
    (zenithMode === 'preserve' || Boolean(zenithInstruction.trim()));

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);
  useEffect(() => () => { normalizingRevision.current++; submitController.current?.abort(); }, []);
  useEffect(() => { setMask(null); setMaskConfirmed(false); }, [maskKey]);
  const onMaskChange = useCallback((blob: Blob | null) => { setMask(blob); setMaskConfirmed(false); }, []);

  function disposeSegmentSession(session: SmileMaskSession) {
    if (disposedSessions.current.has(session)) return;
    disposedSessions.current.add(session);
    // Disposing immediately terminates the image worker and any native inference.
    session.dispose();
  }

  const addSegmentPoint = useCallback((point: SmileSegmentPoint) => {
    if (!segmentSession.current || busy || !editing) return;
    if (segmentPointsRef.current.length >= 32) {
      setAutoNote('Для этого снимка уже достаточно касаний. Уберите последнюю точку или уточните края кистью.');
      return;
    }
    const next = [...segmentPointsRef.current, point];
    segmentPointsRef.current = next; setSegmentPoints(next);
    setMask(null); setMaskConfirmed(false);
    if (!next.some((item) => item.label === 1)) {
      setSegmentationPending(false); setAutoState('points');
      setAutoNote('Сначала добавьте касание + на верхнем зубе. Затем можно исключить лишние участки касанием −.');
      return;
    }
    setSegmentationPending(true);
    setSegmentAttempt((value) => value + 1);
  }, [busy, editing]);

  function undoSegmentPoint() {
    if (!segmentSession.current || segmentPointsRef.current.length <= seedCount.current) return;
    const next = segmentPointsRef.current.slice(0, -1);
    segmentPointsRef.current = next; setSegmentPoints(next);
    setMask(null); setMaskConfirmed(false);
    if (!next.some((item) => item.label === 1)) {
      segmentRevision.current++; segmentController.current?.abort();
      setSegmentAttempt(0); setSegmentationPending(false); setAutoMask(null); setAutoState('points');
      setAutoNote('Коснитесь верхнего зуба в режиме «Добавить касанием», чтобы построить область заново.');
      return;
    }
    setSegmentationPending(true);
    setSegmentAttempt((value) => value + 1);
  }

  function resetSegmentPoints() {
    if (!segmentSession.current || busy) return;
    segmentRevision.current++; segmentController.current?.abort();
    segmentPointsRef.current = []; seedCount.current = 0;
    setSegmentPoints([]); setSegmentAttempt(0); setSegmentationPending(false);
    setMask(null); setMaskConfirmed(false); setAutoMask(null); setAutoState('points');
    setAutoNote('Все точки сброшены. Коснитесь верхнего зуба в режиме «Добавить касанием»; лишние участки исключите касанием −.');
  }

  function useManualMask() {
    autoRevision.current++; autoController.current?.abort();
    segmentRevision.current++; segmentController.current?.abort();
    const session = segmentSession.current; segmentSession.current = null;
    if (session) disposeSegmentSession(session);
    segmentPointsRef.current = []; seedCount.current = 0;
    setSegmentPoints([]); setSegmentationPending(false); setMaskConfirmed(false);
    setAutoState('manual'); setAutoNote('Ручное уточнение включено. Увеличьте фото и выделите только разрешённые верхние зубы.');
  }

  useEffect(() => {
    if (!photo || !editing) return;
    segmentPointsRef.current = []; seedCount.current = 0;
    setSegmentPoints([]); setSegmentAttempt(0); setSegmentationPending(false); setAutoCenter(undefined);
    if (!autoEligible) {
      setAutoMask(null); setAutoState('manual');
      setAutoNote(zenithMode === 'allow' ? 'Для коррекции десны уточните разрешённую область вручную.'
        : 'Для отдельных номеров зубов выделите область вручную: автоматика не определяет номера FDI.');
      return;
    }
    const controller = new AbortController(), revision = ++autoRevision.current;
    autoController.current = controller;
    let ownedSession: SmileMaskSession | null = null;
    setAutoMask(null); setMask(null); setMaskConfirmed(false); setAutoState('loading'); setAutoNote('Ищем область зубов на устройстве…');
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('model_timeout')); }, 90_000);
    });
    void Promise.race([
      import('../lib/auto-smile-mask').then((module) => module.prepareSmileMask(photo, controller.signal)).then((session) => {
        if (controller.signal.aborted || autoRevision.current !== revision) { disposeSegmentSession(session); throw new Error('cancelled'); }
        return session;
      }), timeout,
    ]).then((session) => {
      if (controller.signal.aborted || autoRevision.current !== revision) { disposeSegmentSession(session); return; }
      ownedSession = session; segmentSession.current = session;
      segmentPointsRef.current = [...session.points]; seedCount.current = session.points.length;
      setSegmentPoints([...session.points]); setAutoCenter(session.center);
      setAutoMask(session.initial); setAutoState(session.initial ? 'ready' : 'points');
      setAutoNote(session.initial
        ? 'Предварительная область готова. Уточняйте её касаниями +/−, затем проверьте границы на увеличении.'
        : 'Уверенно определить границы не удалось. Нажмите «Добавить касанием» и коснитесь верхних зубов; лишнее исключите касанием −.');
    }).catch((err) => {
      if (autoRevision.current !== revision) return;
      setAutoState('manual');
      setAutoNote(err?.code === 'no_face' ? 'Не найдено одно лицо с хорошо видимой улыбкой. Выделите зубы вручную на увеличенном фото.'
        : err?.code === 'uncertain' ? 'Границы верхних зубов определились неуверенно. Увеличьте фото и выделите область вручную.'
        : 'Автовыделение недоступно на этом снимке или устройстве. Ручное выделение и увеличение работают.');
    }).finally(() => clearTimeout(timer));
    return () => {
      autoRevision.current++; controller.abort(); clearTimeout(timer);
      segmentRevision.current++; segmentController.current?.abort();
      if (segmentSession.current === ownedSession) segmentSession.current = null;
      if (ownedSession) disposeSegmentSession(ownedSession);
    };
  }, [photo, editing, autoEligible, autoAttempt]);

  useEffect(() => {
    const session = segmentSession.current;
    if (!session || !editing || segmentAttempt === 0) return;
    const controller = new AbortController(), revision = ++segmentRevision.current;
    segmentController.current = controller;
    const points = [...segmentPointsRef.current];
    if (!points.some((point) => point.label === 1)) return;
    const timer = setTimeout(() => {
      // Serialize actual inference even when a newer tap aborts delivery of the previous result.
      segmentChain.current = segmentChain.current.catch(() => {}).then(async () => {
        if (controller.signal.aborted || segmentSession.current !== session) return;
        try {
          const proposal = await session.refine(points, controller.signal);
          if (controller.signal.aborted || segmentRevision.current !== revision || segmentSession.current !== session) return;
          setAutoMask(proposal); setAutoCenter(proposal.center); setAutoState('ready');
          setAutoNote('Область уточнена по касаниям. Проверьте, что выделены только нужные верхние зубы.');
        } catch (error) {
          if (controller.signal.aborted || segmentRevision.current !== revision || segmentSession.current !== session) return;
          setMask(null); setMaskConfirmed(false); setAutoState('points');
          if (error && typeof error === 'object' && 'code' in error && ['model_unavailable', 'disposed'].includes(String(error.code))) {
            segmentSession.current = null; disposeSegmentSession(session);
            segmentPointsRef.current = []; seedCount.current = 0; setSegmentPoints([]); setSegmentationPending(false);
            setAutoState('manual'); setAutoNote('Локальная модель недоступна на этом устройстве или не успела ответить. Выделите зубы кистью либо повторите определение области.');
            return;
          }
          setAutoNote('По этим точкам границы получились неуверенными. Добавьте касание + на зубе или − на лишнем участке; можно перейти к кисти.');
        } finally {
          if (!controller.signal.aborted && segmentRevision.current === revision && segmentSession.current === session) setSegmentationPending(false);
        }
      });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [segmentAttempt, photo, editing]);

  useEffect(() => {
    if (!allowed || phase !== 'processing' || !jobId) return;
    const controller = new AbortController();
    const deadline = Date.now() + POLL_LIMIT_MS;
    let wake: ReturnType<typeof setTimeout> | undefined;
    let stopWait: (() => void) | undefined;
    const wait = () => new Promise<void>((resolve) => { stopWait = resolve; wake = setTimeout(resolve, 4000); });
    void (async () => {
      while (!controller.signal.aborted && Date.now() < deadline) {
        try {
          const result = await getSmileJobStatus(jobId, controller.signal);
          if (controller.signal.aborted) return;
          if (result.status === 'done') {
            const url = await loadSmileResult(result, controller.signal);
            if (controller.signal.aborted) { URL.revokeObjectURL(url); return; }
            setResultUrl(url); setError(''); setPhase('done'); return;
          }
          if (result.status === 'failed') {
            setError(smileErrorMessage(new SmilePreviewError(result.error ?? 'generation_failed')));
            setPhase('failed'); return;
          }
          if (result.status === 'prepared') {
            setError('Отправка не завершена: сервер ещё не запустил обработку. Можно подготовить новую примерку.');
            setPhase('prepared'); return;
          }
          setError('');
        } catch (err) {
          if (controller.signal.aborted) return;
          if (err instanceof SmilePreviewError && err.status === 404) {
            setError(smileErrorMessage(err)); setPhase('failed'); return;
          }
          if (err instanceof SmilePreviewError && [401, 403].includes(err.status)) {
            setError(smileErrorMessage(err)); setPhase('pending'); return;
          }
          if (err instanceof SmilePreviewError && ['decryption_failed', 'missing_result', 'invalid_encrypted_image'].includes(err.code)) {
            setError(smileErrorMessage(err)); setPhase('pending'); return;
          }
          setError('Связь с сервером прервалась. Продолжаем проверять эту же примерку.');
        }
        await wait();
      }
      if (!controller.signal.aborted) {
        setError('Примерка ещё не подтвердила готовность. Проверьте её статус — новый запуск не нужен.');
        setPhase('pending');
      }
    })();
    return () => { controller.abort(); clearTimeout(wake); stopWait?.(); };
  }, [allowed, phase, jobId]);

  function changeSelection(next: number[]) {
    const ordered: number[] = UPPER_TEETH.filter((id) => next.includes(id));
    setTeeth(ordered);
    if (!ordered.includes(activeTooth)) setActiveTooth(ordered[0] ?? 11);
  }

  function selectTooth(tooth: number) {
    if (rangeMode) {
      if (rangeAnchor === null) { setRangeAnchor(tooth); return; }
      const start = UPPER_TEETH.findIndex((id) => id === rangeAnchor);
      const end = UPPER_TEETH.findIndex((id) => id === tooth);
      changeSelection(UPPER_TEETH.slice(Math.min(start, end), Math.max(start, end) + 1));
      setRangeAnchor(null); setRangeMode(false);
    } else {
      changeSelection(teeth.includes(tooth) ? teeth.filter((id) => id !== tooth) : [...teeth, tooth]);
      if (!teeth.includes(tooth)) setActiveTooth(tooth);
    }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file || busy) return;
    const revision = ++normalizingRevision.current;
    setNormalizing(true); setError('');
    try {
      const normalized = await normalizeSmilePhoto(file);
      if (revision !== normalizingRevision.current) return;
      setPhoto({ ...normalized, url: URL.createObjectURL(normalized.blob) });
      setMask(null); setConsent(false); setResultUrl('');
      rememberSmileJobId(null); setJobId(null); setPhase('editing');
    } catch (err) {
      if (revision === normalizingRevision.current) setError(smileErrorMessage(err));
    } finally {
      if (revision === normalizingRevision.current) setNormalizing(false);
    }
  }

  async function generate() {
    if (!canGenerate || !photo || !mask || submitting.current) return;
    submitting.current = true;
    const controller = new AbortController();
    submitController.current = controller;
    const settings: SmileSettings = {
      teeth: [...selected],
      shades: Object.fromEntries(selected.map((id) => [String(id), shades[id] ?? 'BL1'])),
      shape, translucency, zenithMode, imageResolution,
      ...(zenithMode === 'allow' ? { zenithInstruction: zenithInstruction.trim() } : {}),
    };
    setError(''); setPhase('uploading');
    let preparedId: string | null = null;
    try {
      const prepared = await prepareSmileJob(controller.signal);
      preparedId = prepared.jobId;
      rememberSmileJobId(preparedId); setJobId(preparedId);
      await Promise.all([
        uploadSmilePng(prepared.photo.uploadUrl, photo.blob, prepared.encryption, preparedId, 'photo', controller.signal),
        uploadSmilePng(prepared.mask.uploadUrl, mask, prepared.encryption, preparedId, 'mask', controller.signal),
      ]);
      await generateSmilePreview(preparedId, settings, controller.signal);
      if (!controller.signal.aborted) setPhase('processing');
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(smileErrorMessage(err));
        // The server may have accepted generate before the connection failed.
        // Keep its ID and offer status checking, never repeat generate automatically.
        setPhase(preparedId ? 'pending' : 'editing');
        controller.abort();
      }
    } finally {
      submitting.current = false;
    }
  }

  async function removePreview(keepPhoto = false) {
    if (busy || deleting || submitting.current) return;
    const controller = new AbortController();
    submitController.current = controller;
    setDeleting(true); setError('');
    try {
      if (jobId) {
        try { await deleteSmileJob(jobId, controller.signal); }
        catch (err) {
          if (!(err instanceof SmilePreviewError && err.status === 404)) throw err;
        }
      }
      if (controller.signal.aborted) return;
      rememberSmileJobId(null); setJobId(null); setPhase('editing');
      setResultUrl(''); setMask(null); setConsent(false);
      if (!keepPhoto) setPhoto(null);
    } catch (err) {
      if (!controller.signal.aborted) setError(smileErrorMessage(err));
    } finally {
      if (!controller.signal.aborted) setDeleting(false);
    }
  }

  function newPreview() {
    void removePreview(true);
  }

  async function download() {
    if (!resultUrl || !jobId || downloading) return;
    setDownloading(true); setError('');
    try { await downloadSmilePng(resultUrl, jobId); }
    catch (err) { setError(smileErrorMessage(err)); }
    finally { setDownloading(false); }
  }

  return <Screen>
    <div className="smile-page">
      <div className="smile-topline"><button type="button" className="smile-text-button" onClick={goBack}>← Назад</button><span className="smile-pilot mono">Закрытый тест</span></div>
      <ScreenIntro eyebrow="LabFrame · Smile preview" title="Примерить улыбку" sub="Выберите зубы и задайте эстетику. Лицо и остальные области фото сохранятся без изменений." style={{ padding: '12px 0 20px' }} />
      <p className="smile-disclaimer">Визуальная примерка. Не клинический план и не гарантия результата лечения.</p>

      {!balanceLoaded ? <div className="smile-status" role="status">Проверяем доступ…</div> : !allowed ?
        <div className="smile-status"><h2>Закрытый тест</h2><p>{!isSmilePreviewReady() ? 'Для примерки нужно подключение к серверу. Откройте рабочее мини-приложение в Telegram.' : 'Доступ к примерке выдаёт администратор. После приглашения откройте приложение заново.'}</p><button type="button" className="smile-secondary" onClick={() => reset('home')}>На главную</button></div> : <>
        {error && <div className="smile-error" role="alert">{error}</div>}

        {busy && <div className="smile-status" role="status" aria-live="polite"><span className="smile-spinner" /><h2>{phase === 'uploading' ? 'Шифруем и загружаем фото' : 'Создаём вариант улыбки'}</h2><p>{phase === 'uploading' ? 'Фото и маска шифруются на устройстве перед загрузкой.' : 'Внешний AI обрабатывает только фрагмент улыбки. Можно вернуться позже — проверим ту же задачу.'}</p><p className="smile-hint">{phase === 'processing' ? 'Проверяем готовность без повторного запуска. Большая примерка может занять несколько минут.' : 'Параметры отправляются один раз.'}</p></div>}

        {(phase === 'pending' || phase === 'prepared' || phase === 'failed') && <div className="smile-status"><h2>{phase === 'failed' ? 'Примерка не завершилась' : phase === 'prepared' ? 'Загрузка не завершена' : 'Проверим текущую примерку'}</h2><p>Идентификатор задачи сохранён в этой сессии. Фото и маска не записываются в хранилище браузера.</p><div className="smile-actions">
          {phase === 'pending' && <button type="button" className="smile-primary" disabled={deleting} onClick={() => { setError(''); setPhase('processing'); }}>Проверить статус</button>}
          {phase !== 'pending' && <button type="button" className="smile-secondary" disabled={deleting} onClick={newPreview}>Подготовить новую примерку</button>}
          <button type="button" className="smile-text-button" disabled={deleting} onClick={() => void removePreview()}>{deleting ? 'Удаляем…' : 'Удалить фото и результат из LabFrame'}</button>
        </div></div>}

        {phase === 'done' && resultUrl && <section className="smile-section smile-result">
          <div className="smile-section-heading"><span className="smile-step">✓</span><h2>Примерка готова</h2></div>
          <div className="smile-comparison" style={{ aspectRatio: photo ? `${photo.width} / ${photo.height}` : undefined }}>
            <img src={resultUrl} alt="Вариант улыбки после визуальной примерки" className="smile-after-image" />
            {photo && <><img src={photo.url} alt="Исходное фото до примерки" className="smile-before-image" style={{ clipPath: `inset(0 ${100 - comparison}% 0 0)` }} /><span className="smile-comparison-divider" style={{ left: `${comparison}%` }} /><span className="smile-image-label smile-label-before">До</span><span className="smile-image-label smile-label-after">После</span></>}
          </div>
          {photo ? <label className="smile-comparison-control">До <input type="range" min="0" max="100" value={comparison} onChange={(event) => setComparison(Number(event.target.value))} aria-label="Граница сравнения до и после" /> После</label> : <p className="smile-hint">Исходное фото не сохраняется в браузере после перезапуска, поэтому сейчас показан только результат.</p>}
          <p className="smile-hint">Результат расшифрован только в памяти этого устройства. Перед использованием проверьте его вручную.</p>
          <div className="smile-actions"><button type="button" className="smile-primary" onClick={() => void download()} disabled={downloading || deleting}>{downloading ? 'Скачиваем…' : 'Скачать PNG'}</button><button type="button" className="smile-secondary" disabled={deleting} onClick={newPreview}>Настроить новую примерку</button><button type="button" className="smile-text-button" disabled={deleting} onClick={() => void removePreview()}>{deleting ? 'Удаляем…' : 'Удалить фото и результат из LabFrame'}</button></div>
          <p className="smile-micro">Новая примерка удалит предыдущую с сервера LabFrame. Удаление не распространяется на фрагмент у внешнего AI.</p>
        </section>}

        {editing && <>
          <FormSection step="01" title="Фото пациента" hint="Портрет с открытой улыбкой или крупный снимок зубов. Подготовим PNG до 1600 px по длинной стороне, сохранив пропорции.">
            <input ref={fileInput} className="smile-file-input" type="file" accept="image/*" onChange={(event) => { void pickPhoto(event.target.files?.[0]); event.target.value = ''; }} disabled={normalizing} aria-label="Выбрать фотографию пациента" />
            <button type="button" className={`smile-upload${photo ? ' has-photo' : ''}`} onClick={() => fileInput.current?.click()} disabled={normalizing}>
              {photo ? <><img src={photo.url} alt="Выбранное исходное фото пациента" /><span className="smile-upload-overlay">Заменить фото</span></> : <><span className="smile-upload-icon" aria-hidden="true">＋</span><strong>{normalizing ? 'Подготавливаем фото…' : 'Выбрать фото'}</strong><span>JPEG, PNG или другой доступный формат · до 20 МБ</span></>}
            </button>
            {photo && <p className="smile-photo-meta mono">PNG · {photo.width} × {photo.height} · {(photo.blob.size / 1024 / 1024).toFixed(1)} МБ</p>}
          </FormSection>

          {photo && <>
            <FormSection step="02" title="Верхние зубы" hint="Нумерация FDI. Нажмите зубы, которые разрешено изменить.">
              <div className="smile-selection-tools"><button type="button" onClick={() => { changeSelection([...UPPER_TEETH]); setRangeMode(false); setRangeAnchor(null); }}>Весь видимый ряд</button><button type="button" onClick={() => { changeSelection([]); setRangeMode(false); setRangeAnchor(null); }}>Сбросить</button><button type="button" className={rangeMode ? 'is-active' : ''} aria-pressed={rangeMode} onClick={() => { setRangeMode(!rangeMode); setRangeAnchor(null); }}>Диапазон</button></div>
              {rangeMode && <p className="smile-range-hint" role="status">{rangeAnchor === null ? 'Нажмите первый зуб диапазона.' : `Начало — ${rangeAnchor}. Нажмите последний зуб.`}</p>}
              <div className="smile-orientation"><span>Правая сторона пациента</span><span>Левая сторона пациента</span></div>
              <div className="smile-teeth-scroll"><div className="smile-teeth" role="group" aria-label="Выбор верхних зубов справа налево у пациента">{UPPER_TEETH.map((id) => <button type="button" key={id} className={`smile-tooth${teeth.includes(id) ? ' is-selected' : ''}${id === rangeAnchor ? ' is-anchor' : ''}${id === 21 ? ' smile-midline' : ''}`} aria-pressed={teeth.includes(id)} aria-label={`Зуб ${id}${teeth.includes(id) ? `, оттенок ${shades[id] ?? 'BL1'}` : ''}`} onClick={() => selectTooth(id)}><span className="mono">{id}</span><span className="smile-tooth-glyph" aria-hidden="true" /><small>{teeth.includes(id) ? shades[id] : '—'}</small></button>)}</div></div>
              <div className="smile-shade-heading"><h3>Индивидуальные оттенки</h3><span className="mono">{selected.length} / 12</span></div>
              {selected.length ? <>
                <p className="smile-hint">Сначала выберите номер, затем оттенок для этого зуба.</p>
                <div className="smile-tooth-tabs" role="group" aria-label="Зуб для назначения оттенка">{selected.map((id) => <button type="button" key={id} className={activeTooth === id ? 'is-active' : ''} aria-pressed={activeTooth === id} onClick={() => setActiveTooth(id)}><strong>{id}</strong><span>{shades[id]}</span></button>)}</div>
                <div className="smile-palette" role="group" aria-label={`Оттенок зуба ${activeTooth}`}>{SMILE_SHADES.map((shade, index) => <button type="button" key={shade} className={chosenShade === shade ? 'is-selected' : ''} aria-pressed={chosenShade === shade} onClick={() => setShades((previous) => ({ ...previous, [activeTooth]: shade }))}><span className="smile-swatch" style={{ background: SHADE_COLORS[index] }} aria-hidden="true" /><span>{shade}</span></button>)}</div>
                <button type="button" className="smile-text-button smile-apply-shade" onClick={() => setShades((previous) => ({ ...previous, ...Object.fromEntries(selected.map((id) => [id, chosenShade])) }))}>Назначить {chosenShade} всем выбранным</button>
                <p className="smile-micro">Цветовые образцы на экране условны.</p>
              </> : <p className="smile-hint">Выберите хотя бы один верхний зуб.</p>}
            </FormSection>

            <FormSection step="03" title="Форма и детали">
              <h3>Детализация</h3>
              <div className="smile-segmented" role="group" aria-label="Детализация генерации">
                {(['1K', '2K'] as const).map((resolution) => <button type="button" key={resolution} className={imageResolution === resolution ? 'is-selected' : ''} aria-pressed={imageResolution === resolution} onClick={() => setImageResolution(resolution)}>{resolution === '2K' ? '2K · подробнее' : '1K · сравнить'}</button>)}
              </div>
              <p className="smile-micro">2K запрашивает больше деталей и может обрабатываться дольше. Для сравнения используйте одинаковые фото, область и настройки.</p>
              <div className="smile-shapes" role="group" aria-label="Форма выбранных зубов">{SHAPES.map((option) => <button type="button" key={option.id} className={shape === option.id ? 'is-selected' : ''} aria-pressed={shape === option.id} onClick={() => setShape(option.id)}><ShapeGlyph shape={option.id} /><span>{option.label}</span></button>)}</div>
              <h3>Прозрачность режущего края</h3><div className="smile-segmented" role="group" aria-label="Прозрачность режущего края"><button type="button" className={translucency === 'none' ? 'is-selected' : ''} aria-pressed={translucency === 'none'} onClick={() => setTranslucency('none')}>Без прозрачности</button><button type="button" className={translucency === 'natural' ? 'is-selected' : ''} aria-pressed={translucency === 'natural'} onClick={() => setTranslucency('natural')}>Естественная</button></div>
              <h3>Десневые зениты</h3><div className="smile-segmented" role="group" aria-label="Коррекция десневых зенитов"><button type="button" className={zenithMode === 'preserve' ? 'is-selected' : ''} aria-pressed={zenithMode === 'preserve'} onClick={() => setZenithMode('preserve')}>Сохранить</button><button type="button" className={zenithMode === 'allow' ? 'is-selected' : ''} aria-pressed={zenithMode === 'allow'} onClick={() => setZenithMode('allow')}>Разрешить коррекцию</button></div>
              {zenithMode === 'allow' && <label className="smile-instruction">Точное указание для выбранных зубов<textarea maxLength={160} rows={3} value={zenithInstruction} onChange={(event) => setZenithInstruction(event.target.value)} placeholder="Укажите номера зубов и требуемое изменение контура" required /><span className="smile-micro">{zenithInstruction.length} / 160 · Без указания запуск недоступен.</span></label>}
            </FormSection>

            <FormSection step="04" title="Область улыбки" hint="Предварительная автообласть строится на устройстве. Проверьте её: губы, нижние зубы и защищённая десна должны остаться вне выделения.">
              <p role="status" aria-live="polite" className="smile-hint">{autoState === 'loading' ? 'Готовим локальное выделение… При первом запуске загружаются модель и компоненты обработки; это может занять до 90 секунд. Фото не отправляется.' : autoNote}</p>
              {autoState === 'loading' && <button type="button" className="smile-secondary" onClick={useManualMask}>Не ждать · выделить кистью</button>}
              {autoEligible && autoState !== 'loading' && <div className="smile-mask-actions">
                <button type="button" className="smile-text-button" disabled={busy || segmentationPending} onClick={() => setAutoAttempt((n) => n + 1)}>Определить область заново</button>
                {canRefineMask && <button type="button" className="smile-text-button" disabled={busy} onClick={useManualMask}>Перейти к ручной кисти</button>}
              </div>}
              {selected.length ? <SmileMaskEditor key={maskKey} imageUrl={photo.url} width={photo.width} height={photo.height}
                onChange={onMaskChange} initialMask={autoMask?.mask} focusPoint={autoMask?.center ?? autoCenter}
                onSegmentPoint={canRefineMask ? addSegmentPoint : undefined} points={segmentPoints} segmentationPending={segmentationPending}
                disabled={busy || autoState === 'loading'} allowGumline={zenithMode === 'allow'} /> : <p className="smile-hint">Сначала выберите зубы на шаге 02.</p>}
              {canRefineMask && <>
                <div className="smile-mask-actions">
                  <button type="button" className="smile-text-button" disabled={busy || segmentPoints.length <= seedCount.current} onClick={undoSegmentPoint}>Убрать последнее касание</button>
                  <button type="button" className="smile-text-button" disabled={busy || segmentPoints.length === 0} onClick={resetSegmentPoints}>Сбросить все точки</button>
                </div>
                <p className="smile-micro">Зелёные точки добавляют область, красные убирают. Новый пересчёт по касаниям заменяет правки кистью. Если автоматика ошиблась, сбросьте все точки и начните с верхнего зуба.</p>
              </>}
              <p className={`smile-mask-note${mask ? ' is-ready' : ''}`}>{mask ? '✓ Маска подготовлена' : 'Маска обязательна для запуска'}</p><p className="smile-micro">После смены зубов или разрешения на коррекцию десны проверьте область заново.</p>
              <label className="smile-consent"><input type="checkbox" checked={maskConfirmed} disabled={!mask || autoState === 'loading' || segmentationPending} onChange={(event) => setMaskConfirmed(event.target.checked)} /><span>Проверил область: выделены только те зубы и участки, которые разрешено менять.</span></label>
            </FormSection>

            <FormSection step="05" title="Проверка и запуск">
              <div className="smile-summary"><span>Зубы</span><strong>{selected.join(', ') || 'Не выбраны'}</strong><span>Форма</span><strong>{SHAPES.find((option) => option.id === shape)?.label}</strong><span>Зениты</span><strong>{zenithMode === 'preserve' ? 'Сохранить' : 'По точному указанию'}</strong></div>
              <div className="smile-privacy"><strong>Защита фотографий</strong><p>Исходное фото и результат хранятся в LabFrame зашифрованными. Внешний AI получает только фрагмент улыбки; у него собственные условия хранения. По документации Polza результаты обработки хранятся у сервиса 7 дней.</p><p>Для пилота используйте учебные или собственные тестовые фото с разрешением на обработку. Хранилище LabFrame пока размещено вне РФ. Кнопка удаления удаляет файлы LabFrame.</p></div>
              <label className="smile-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>У меня есть разрешение использовать это фото для примерки и передать фрагмент улыбки внешнему AI с указанными условиями хранения.</span></label>
              <p className="smile-cost-note">В закрытом тесте примерки не списываются с вашего баланса генераций.</p>
              <button type="button" className="smile-primary smile-generate" disabled={!canGenerate} onClick={() => void generate()}>Создать примерку <span aria-hidden="true">↗</span></button>
              {(!mask || !maskConfirmed) && <p className="smile-micro">Проверьте и подтвердите выделенную область на шаге 04.</p>}
            </FormSection>
          </>}
        </>}
      </>}
    </div>
  </Screen>;
}
