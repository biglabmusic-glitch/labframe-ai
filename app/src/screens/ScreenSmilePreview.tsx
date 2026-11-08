import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Screen } from '../components/Screen';
import { SmileCropBoundary } from '../components/SmileCropBoundary';
import { SmileProgress } from '../components/SmileProgress';
import { StepBadge } from '../components/StepBadge';
import type { PreparedSmileCrop } from '../lib/smile-crop';
import type { SmileCropPoint } from '../lib/smile-crop-geometry';
import {
  deleteSmileLocalSource, isSmileCropJob, loadSmileLocalSource,
  markSmileCropJob, saveSmileLocalSource,
} from '../lib/smile-local-source';
import { useApp } from '../state/AppContext';
import { useRouter } from '../router/Router';
import { useBackButton } from '../telegram/useBackButton';
import { useMainButton } from '../telegram/useMainButton';
import {
  UPPER_TEETH, SMILE_SHADES, deleteSmileJob, downloadSmilePng, generateSmilePreview, getSmileJobStatus, loadSmileResultBlob,
  isSmilePreviewReady, normalizeSmilePhoto, prepareSmileJob, readSmileJobId,
  rememberSmileJobId, smileErrorMessage, SmilePreviewError, uploadSmilePng,
  type NormalizedSmilePhoto, type SmileSettings, type SmileShade, type SmileShape, type SmileRehabilitationMode,
} from '../lib/smile-preview';
import '../styles/smile-preview.css';

type Photo = NormalizedSmilePhoto & { url: string };
type Phase = 'editing' | 'uploading' | 'processing' | 'pending' | 'prepared' | 'done' | 'failed';
type LocalSource = { jobId: string; photo: NormalizedSmilePhoto; crop: PreparedSmileCrop };
const POLL_LIMIT_MS = 12 * 60_000;
const PROGRESS_STAGES = ['Подготовка и загрузка', 'Обработка улыбки', 'Сохранение результата'];
const FORM_STEPS = [
  { title: 'Фото улыбки', hint: 'Загрузите портрет или обрезанную улыбку. Подготовим область рта сразу на устройстве.' },
  { title: 'Вариант реабилитации', hint: 'Режим уже выбран. Можно продолжить или изменить его.' },
  { title: 'Цвет зубов', hint: 'Один оттенок для всех изменяемых зубов обеих челюстей.' },
  { title: 'Форма зубов', hint: 'Выберите форму и прозрачность режущего края.' },
  { title: 'Проверка и запуск', hint: 'Проверьте настройки и фрагмент улыбки, затем создайте примерку.' },
];
const MODES: Array<{ id: SmileRehabilitationMode; label: string; description: string }> = [
  { id: 'total', label: 'Тотальная реабилитация', description: 'Все видимые зубы сверху и снизу' },
  { id: 'front', label: 'Фронтальная реабилитация', description: 'От клыка до клыка на обеих челюстях' },
];
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

function cropErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'multiple_faces') return 'На фото несколько лиц. Выберите отдельный портрет человека с открытой улыбкой.';
  if (code === 'no_face') return 'Не удалось найти улыбку автоматически. Если на фото только рот, выберите «Обрезанная улыбка» и подтвердите область.';
  if (code === 'mouth_closed') return 'Зубы почти не видны. Выберите фото с открытой улыбкой.';
  if (code === 'mouth_too_small') return 'Улыбка слишком мелкая. Выберите более крупное и чёткое фото.';
  if (code === 'output_dimensions') return 'Размер ответа не совпал с фрагментом улыбки. Вклейка остановлена; исходное фото сохранено.';
  return 'Не удалось подготовить фрагмент улыбки на этом устройстве. Повторите определение области или выберите другое фото.';
}

export function ScreenSmilePreview() {
  const { user, balanceLoaded } = useApp();
  const { history, back, reset } = useRouter();
  const leaveStudio = useCallback(() => history.length > 1 ? back() : reset('home'), [history.length, back, reset]);

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [formStep, setFormStep] = useState(0);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const [normalizing, setNormalizing] = useState(false);
  const [photoProgress, setPhotoProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [processingStage, setProcessingStage] = useState<'submitting' | 'processing'>('submitting');
  const [photoKind, setPhotoKind] = useState<'portrait' | 'cropped'>('portrait');
  const [manualBoundary, setManualBoundary] = useState<SmileCropPoint[] | null>(null);
  const [mode, setMode] = useState<SmileRehabilitationMode>('total');
  const [shade, setShade] = useState<SmileShade>('BL1');
  const [shape, setShape] = useState<SmileShape>('original');
  const [translucency, setTranslucency] = useState<SmileSettings['translucency']>('natural');
  const [imageResolution, setImageResolution] = useState<'1K' | '2K'>('2K');
  const [zenithMode, setZenithMode] = useState<SmileSettings['zenithMode']>('preserve');
  const [zenithInstruction, setZenithInstruction] = useState('');
  const [crop, setCrop] = useState<PreparedSmileCrop | null>(null);
  const [cropPreviewUrl, setCropPreviewUrl] = useState('');
  const [cropState, setCropState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [cropNote, setCropNote] = useState('');
  const [cropAttempt, setCropAttempt] = useState(0);
  const [consent, setConsent] = useState(false);
  const [jobId, setJobId] = useState<string | null>(readSmileJobId);
  const [phase, setPhase] = useState<Phase>(() => readSmileJobId() ? 'processing' : 'editing');
  const [resultUrl, setResultUrl] = useState('');
  const [cropOnlyResult, setCropOnlyResult] = useState(false);
  const [localSourceSaved, setLocalSourceSaved] = useState(true);
  const [error, setError] = useState('');
  const [comparison, setComparison] = useState(50);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const submitController = useRef<AbortController | null>(null);
  const normalizingRevision = useRef(0);
  const cropRevision = useRef(0);
  const activeSource = useRef<LocalSource | null>(null);
  const submitting = useRef(false);
  const allowed = Boolean(user.canSmilePreview) && isSmilePreviewReady();
  const busy = phase === 'uploading' || phase === 'processing';
  const editing = phase === 'editing';
  const canGenerate = allowed && editing && !normalizing && !deleting && cropState === 'ready' &&
    Boolean(photo && crop && consent) && (zenithMode === 'preserve' || Boolean(zenithInstruction.trim()));
  const canContinue = !normalizing && !deleting && (formStep === 0 ? Boolean(photo && crop && cropState === 'ready') :
    formStep === 3 ? zenithMode === 'preserve' || Boolean(zenithInstruction.trim()) : true);
  const goBack = useCallback(() => {
    if (editing && formStep > 0) setFormStep((step) => step - 1);
    else leaveStudio();
  }, [editing, formStep, leaveStudio]);
  useBackButton(goBack);
  useMainButton(balanceLoaded && allowed && editing ? {
    text: formStep === FORM_STEPS.length - 1 ? 'Создать примерку' : normalizing ? 'Подготавливаем фото…' :
      formStep === 0 && cropState === 'loading' ? 'Подготавливаем область…' : 'Далее',
    enabled: formStep === FORM_STEPS.length - 1 ? canGenerate : canContinue,
    progress: normalizing || (formStep === 0 && cropState === 'loading'),
    onClick: () => {
      if (formStep === FORM_STEPS.length - 1) { void generate(); return; }
      if (canContinue) setFormStep((step) => Math.min(FORM_STEPS.length - 1, step + 1));
    },
  } : null);

  useEffect(() => {
    if (!editing) return;
    window.scrollTo({ top: 0, behavior: 'auto' });
    stepHeading.current?.focus({ preventScroll: true });
  }, [formStep, editing]);

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  useEffect(() => () => { if (cropPreviewUrl) URL.revokeObjectURL(cropPreviewUrl); }, [cropPreviewUrl]);
  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);
  useEffect(() => () => { normalizingRevision.current++; submitController.current?.abort(); }, []);

  useEffect(() => {
    if (!photo || !editing) return;
    if (photoKind === 'cropped' && !manualBoundary) {
      setCrop(null); setCropPreviewUrl(''); setCropState('idle');
      setCropNote('Подтвердите область улыбки на обрезанном снимке.');
      return;
    }
    const controller = new AbortController(), revision = ++cropRevision.current;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 45_000);
    setCrop(null); setCropPreviewUrl(''); setCropState('loading');
    setCropNote(photoKind === 'cropped' ? 'Готовим подтверждённый фрагмент улыбки на устройстве.' : 'Находим улыбку на устройстве. Полное фото никуда не отправляется.');
    void import('../lib/smile-crop').then((module) => photoKind === 'cropped' && manualBoundary
      ? module.prepareManualSmileCrop(photo, manualBoundary, controller.signal)
      : module.prepareSmileCrop(photo, controller.signal)).then((prepared) => {
      if (controller.signal.aborted || cropRevision.current !== revision) return;
      setCrop(prepared); setCropPreviewUrl(URL.createObjectURL(prepared.photo));
      setCropState('ready'); setCropNote('');
    }).catch((err) => {
      if (cropRevision.current !== revision || (controller.signal.aborted && !timedOut)) return;
      setCrop(null); setCropState('failed'); setCropNote(cropErrorMessage(err));
    }).finally(() => clearTimeout(timer));
    return () => { cropRevision.current++; controller.abort(); clearTimeout(timer); };
  }, [photo, editing, cropAttempt, photoKind, manualBoundary]);

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
            setFinishing(true);
            const edited = await loadSmileResultBlob(result, controller.signal);
            const local = activeSource.current?.jobId === jobId ? activeSource.current : await loadSmileLocalSource(jobId);
            controller.signal.throwIfAborted();
            let image = edited;
            if (local) {
              const { compositeSmileCrop } = await import('../lib/smile-crop');
              image = await compositeSmileCrop(local.photo, edited, local.crop, controller.signal);
            }
            controller.signal.throwIfAborted();
            if (local) {
              activeSource.current = { jobId, photo: local.photo, crop: local.crop };
              setPhoto({ ...local.photo, url: URL.createObjectURL(local.photo.blob) });
            }
            setCropOnlyResult(!local && isSmileCropJob(jobId));
            setResultUrl(URL.createObjectURL(image)); setError(''); setPhase('done'); return;
          }
          if (result.status === 'failed') {
            setError(smileErrorMessage(new SmilePreviewError(result.error ?? 'generation_failed')));
            setPhase('failed'); return;
          }
          if (result.status === 'prepared') {
            setError('Отправка не завершена: сервер ещё не запустил обработку. Можно подготовить новую примерку.');
            setPhase('prepared'); return;
          }
          if (result.stage === 'confirmation_pending') {
            setError('Сервис обработки не ответил вовремя. Примерка сохранена — проверьте её статус позже. Повторно отправлять фото не нужно.');
            setPhase('pending'); return;
          }
          setProcessingStage(result.stage === 'submitting' ? 'submitting' : 'processing');
          setError('');
        } catch (err) {
          if (controller.signal.aborted) return;
          const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
          if (err instanceof SmilePreviewError && err.status === 404) {
            setError(smileErrorMessage(err)); setPhase('failed'); return;
          }
          if (code === 'output_dimensions' || code === 'crop_unavailable') {
            setError(cropErrorMessage(err)); setPhase('pending'); return;
          }
          if (err instanceof SmilePreviewError && ([401, 403].includes(err.status) ||
            ['decryption_failed', 'missing_result', 'invalid_encrypted_image'].includes(err.code))) {
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

  async function pickPhoto(file: File | undefined) {
    if (!file || busy) return;
    const revision = ++normalizingRevision.current;
    setNormalizing(true); setPhotoProgress(0); setError('');
    try {
      const normalized = await normalizeSmilePhoto(file, (value) => {
        if (revision === normalizingRevision.current) setPhotoProgress(value);
      });
      if (revision !== normalizingRevision.current) return;
      setPhoto({ ...normalized, url: URL.createObjectURL(normalized.blob) });
      setCrop(null); setConsent(false); setResultUrl(''); setCropOnlyResult(false);
      setManualBoundary(null);
      setLocalSourceSaved(true); activeSource.current = null;
      rememberSmileJobId(null); setJobId(null); setPhase('editing');
      setFormStep(0);
    } catch (err) {
      if (revision === normalizingRevision.current) setError(smileErrorMessage(err));
    } finally {
      if (revision === normalizingRevision.current) setNormalizing(false);
    }
  }

  function changePhotoKind(next: 'portrait' | 'cropped') {
    if (next === photoKind) return;
    setPhotoKind(next); setManualBoundary(null); setCrop(null); setCropPreviewUrl(''); setFormStep(0);
    setCropState('idle'); setCropNote(''); setConsent(false);
  }

  function changeBoundary() {
    setManualBoundary(null); setCrop(null); setCropPreviewUrl(''); setCropState('idle'); setConsent(false);
  }

  async function generate() {
    if (!canGenerate || !photo || !crop || submitting.current) return;
    submitting.current = true;
    const controller = new AbortController();
    submitController.current = controller;
    // Lower FDI IDs also make an older server fail explicitly instead of silently editing only the upper row.
    const teeth = mode === 'front' ? [13, 12, 11, 21, 22, 23, 43, 42, 41, 31, 32, 33]
      : [...UPPER_TEETH, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36];
    const settings: SmileSettings = {
      rehabilitationMode: mode, shade, teeth,
      shades: Object.fromEntries(teeth.map((id) => [String(id), shade])),
      shape, translucency, zenithMode, imageResolution,
      ...(zenithMode === 'allow' ? { zenithInstruction: zenithInstruction.trim() } : {}),
    };
    const source = { photo: { blob: photo.blob, width: photo.width, height: photo.height }, crop };
    setError(''); setUploadProgress(5); setFinishing(false); setProcessingStage('submitting'); setPhase('uploading');
    let preparedId: string | null = null;
    try {
      const prepared = await prepareSmileJob(controller.signal, user.smileProvider ?? 'polza');
      if (!prepared.rehabilitationModes?.includes(mode)) {
        await deleteSmileJob(prepared.jobId, controller.signal).catch(() => {});
        throw new SmilePreviewError('smile_update_required');
      }
      preparedId = prepared.jobId;
      activeSource.current = { jobId: preparedId, ...source };
      markSmileCropJob(preparedId);
      rememberSmileJobId(preparedId); setJobId(preparedId);
      setLocalSourceSaved(await saveSmileLocalSource(preparedId, source));
      controller.signal.throwIfAborted();
      setUploadProgress(15);
      const fractions = { photo: 0, mask: 0 };
      const reportUpload = (kind: 'photo' | 'mask', fraction: number) => {
        if (controller.signal.aborted) return;
        fractions[kind] = fraction;
        const transferred = (crop.photo.size + 29) * fractions.photo + (crop.mask.size + 29) * fractions.mask;
        setUploadProgress(15 + Math.round(18 * transferred / (crop.photo.size + crop.mask.size + 58)));
      };
      await Promise.all([
        uploadSmilePng(prepared.photo.uploadUrl, crop.photo, prepared.encryption, preparedId, 'photo', controller.signal, (fraction) => reportUpload('photo', fraction)),
        uploadSmilePng(prepared.mask.uploadUrl, crop.mask, prepared.encryption, preparedId, 'mask', controller.signal, (fraction) => reportUpload('mask', fraction)),
      ]);
      await generateSmilePreview(preparedId, settings, controller.signal);
      if (!controller.signal.aborted) setPhase('processing');
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(smileErrorMessage(err));
        // Keep the same task after ambiguous submission; never create a second paid generation automatically.
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
        catch (err) { if (!(err instanceof SmilePreviewError && err.status === 404)) throw err; }
        await deleteSmileLocalSource(jobId);
      }
      if (controller.signal.aborted) return;
      rememberSmileJobId(null); setJobId(null); setPhase('editing');
      setFormStep(0);
      activeSource.current = null; setResultUrl(''); setConsent(false); setCropOnlyResult(false);
      setManualBoundary(null); setCrop(null); setCropPreviewUrl(''); setCropState('idle');
      if (!keepPhoto) { setPhoto(null); setCrop(null); setCropPreviewUrl(''); setCropState('idle'); }
    } catch (err) {
      if (!controller.signal.aborted) setError(smileErrorMessage(err));
    } finally {
      if (!controller.signal.aborted) setDeleting(false);
    }
  }

  function newPreview() { void removePreview(true); }

  async function download() {
    if (!resultUrl || !jobId || downloading) return;
    setDownloading(true); setError('');
    try { await downloadSmilePng(resultUrl, jobId); }
    catch (err) { setError(smileErrorMessage(err)); }
    finally { setDownloading(false); }
  }

  return <Screen>
    <div className="smile-page">
      <div className="smile-topline"><button type="button" className="smile-back" onClick={goBack}><span aria-hidden="true">←</span>{editing && formStep > 0 ? 'Назад' : 'В студию'}</button><span className="smile-pilot mono">ДЕМО · ПО ПРИГЛАШЕНИЮ</span></div>
      {allowed && editing && <div className="smile-wizard-step"><StepBadge n={formStep + 1} total={FORM_STEPS.length} /></div>}
      <header className="smile-hero">
        <span className="smile-eyebrow mono">LABFRAME · SMILE STUDIO</span>
        <h1 ref={stepHeading} tabIndex={-1}>{allowed && editing ? FORM_STEPS[formStep].title : <>Примерить <span>улыбку</span></>}</h1>
        <p>{allowed && editing ? FORM_STEPS[formStep].hint : 'Выберите вариант реабилитации, форму и оттенок. Можно загрузить портрет или обрезанную улыбку.'}</p>
      </header>
      {(!editing || formStep === FORM_STEPS.length - 1) && <p className="smile-disclaimer"><span aria-hidden="true">i</span>Визуальная примерка. Не клинический план и не гарантия результата лечения.</p>}

      {!balanceLoaded ? <div className="smile-status" role="status">Проверяем доступ…</div> : !allowed ?
        <div className="smile-status"><h2>Закрытый тест</h2><p>{!isSmilePreviewReady() ? 'Для примерки нужно подключение к серверу. Откройте рабочее мини-приложение в Telegram.' : 'Доступ к примерке выдаёт администратор. После приглашения откройте приложение заново.'}</p><button type="button" className="smile-secondary" onClick={() => reset('home')}>На главную</button></div> : <>
        {error && <div className="smile-error" role="alert">{error}</div>}
        {!localSourceSaved && <p className="smile-error" role="status">Браузер не сохранил исходник для возврата к примерке. Не закрывайте эту страницу до скачивания полного фото.</p>}

        {busy && <div className="smile-status" role="status" aria-live="polite">
          <SmileProgress value={phase === 'uploading' ? uploadProgress : finishing ? 95 : processingStage === 'submitting' ? 33 : 67}
            label={phase === 'uploading' ? 'Загрузка' : finishing ? 'Сохранение' : processingStage === 'submitting' ? 'Запуск AI' : 'Обработка AI'} stages={PROGRESS_STAGES}
            activeStage={phase === 'uploading' ? 0 : finishing ? 2 : 1} />
          <h2>{phase === 'uploading' ? 'Загружаем фрагмент улыбки' : finishing ? 'Сохраняем готовую улыбку' : processingStage === 'submitting' ? 'Передаём запрос в AI' : 'Создаём вариант улыбки'}</h2>
          <p>{phase === 'uploading' ? 'Шифруем и загружаем только область рта. Полное фото остаётся на устройстве.' : finishing ? 'Получаем результат и вклеиваем его в исходное фото на этом устройстве.' : 'AI обрабатывает фрагмент улыбки. Процент показывает текущий этап работы.'}</p>
          <p className="smile-hint">{phase === 'processing' ? 'Проверяем готовность той же задачи без повторного запуска.' : 'Параметры отправляются один раз.'}</p>
        </div>}

        {(phase === 'pending' || phase === 'prepared' || phase === 'failed') && <div className="smile-status"><h2>{phase === 'failed' ? 'Примерка не завершилась' : phase === 'prepared' ? 'Загрузка не завершена' : 'Проверим текущую примерку'}</h2><p>Задача сохранена. Если исходник доступен в браузере этого устройства, результат будет вклеен в полное фото.</p><div className="smile-actions">
          {phase === 'pending' && <button type="button" className="smile-primary" disabled={deleting} onClick={() => { setError(''); setPhase('processing'); }}>Проверить статус</button>}
          {phase !== 'pending' && <button type="button" className="smile-secondary" disabled={deleting} onClick={newPreview}>Подготовить новую примерку</button>}
          <button type="button" className="smile-text-button" disabled={deleting} onClick={() => void removePreview()}>{deleting ? 'Удаляем…' : 'Удалить примерку'}</button>
        </div></div>}

        {phase === 'done' && resultUrl && <section className="smile-section smile-result">
          <p className="smile-complete mono">✓ 100% · Готово</p>
          <div className="smile-section-heading"><span className="smile-step">✓</span><h2>{cropOnlyResult ? 'Фрагмент улыбки готов' : 'Примерка готова'}</h2></div>
          <div className="smile-comparison" style={{ aspectRatio: photo && !cropOnlyResult ? String(photo.width) + ' / ' + photo.height : undefined }}>
            <img src={resultUrl} alt={cropOnlyResult ? 'Обработанный фрагмент улыбки' : 'Вариант улыбки после визуальной примерки'} className="smile-after-image" />
            {photo && !cropOnlyResult && <><img src={photo.url} alt="Исходное фото до примерки" className="smile-before-image" style={{ clipPath: 'inset(0 ' + (100 - comparison) + '% 0 0)' }} /><span className="smile-comparison-divider" style={{ left: comparison + '%' }} /><span className="smile-image-label smile-label-before">До</span><span className="smile-image-label smile-label-after">После</span></>}
          </div>
          {photo && !cropOnlyResult && <label className="smile-comparison-control">До <input type="range" min="0" max="100" value={comparison} onChange={(event) => setComparison(Number(event.target.value))} aria-label="Граница сравнения до и после" /> После</label>}
          {cropOnlyResult && <p className="smile-hint">Исходник больше недоступен на этом устройстве, поэтому показан только фрагмент. Полное фото на сервер не отправлялось.</p>}
          <p className="smile-hint">Перед использованием проверьте форму, цвет и границы зубов.</p>
          <div className="smile-actions"><button type="button" className="smile-primary" onClick={() => void download()} disabled={downloading || deleting}>{downloading ? 'Скачиваем…' : cropOnlyResult ? 'Скачать фрагмент PNG' : 'Скачать PNG'}</button><button type="button" className="smile-secondary" disabled={deleting} onClick={newPreview}>Настроить новую примерку</button><button type="button" className="smile-text-button" disabled={deleting} onClick={() => void removePreview()}>{deleting ? 'Удаляем…' : 'Удалить примерку'}</button></div>
          <p className="smile-micro">Удаление очищает файлы LabFrame и локальный исходник этой примерки. Оно не распространяется на фрагмент у внешнего AI.</p>
        </section>}

        {editing && <>
          {formStep === 0 && <>
          <FormSection step="01" title="Начнём с фотографии" hint="Подойдёт портрет или уже обрезанное фото улыбки. Видимые зубы должны быть чёткими.">
            <div className="smile-photo-kinds" role="group" aria-label="Вид фотографии">
              <button type="button" className={photoKind === 'portrait' ? 'is-selected' : ''} aria-pressed={photoKind === 'portrait'} onClick={() => changePhotoKind('portrait')}><strong>Портрет</strong><span>Найдём рот автоматически на устройстве</span></button>
              <button type="button" className={photoKind === 'cropped' ? 'is-selected' : ''} aria-pressed={photoKind === 'cropped'} onClick={() => changePhotoKind('cropped')}><strong>Обрезанная улыбка</strong><span>Фото рта без полного лица</span></button>
            </div>
            <input ref={fileInput} className="smile-file-input" type="file" accept="image/*" onChange={(event) => { void pickPhoto(event.target.files?.[0]); event.target.value = ''; }} disabled={normalizing} aria-label="Выбрать фотографию пациента" />
            {normalizing && <div className="smile-photo-progress" role="status"><SmileProgress value={photoProgress} label="Подготовка фото" /></div>}
            <button type="button" className={'smile-upload' + (photo ? ' has-photo' : '')} onClick={() => fileInput.current?.click()} disabled={normalizing}>
              {photo ? <><img src={photo.url} alt="Исходное фото, которое остаётся на устройстве" /><span className="smile-upload-overlay">Заменить фото ↗</span></> : <><span className="smile-upload-icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.5" /><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" /><path d="m4 17 5-5 4 4 3-3 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span><strong>{normalizing ? 'Подготавливаем фото…' : 'Выбрать фотографию'}</strong><span>Открытая улыбка, хороший свет, зубы в фокусе</span><span className="smile-upload-formats mono">JPEG / PNG · до 20 МБ</span></>}
            </button>
            {photo && <p className="smile-photo-meta mono">PNG · {photo.width} × {photo.height} · {(photo.blob.size / 1024 / 1024).toFixed(1)} МБ</p>}
            {!photo && <p className="smile-micro">{photoKind === 'portrait' ? 'Полное фото остаётся на устройстве. Для AI автоматически подготовим только область рта.' : 'Полное лицо не требуется. После загрузки подтвердите область улыбки.'}</p>}
          </FormSection>

          {photo && <FormSection step="01" title="Область улыбки" hint="Подготовка начинается сразу после загрузки, независимо от режима реабилитации.">
            {photoKind === 'cropped' && <SmileCropBoundary key={photo.url} url={photo.url} width={photo.width} height={photo.height}
              initialBoundary={manualBoundary} preparing={cropState === 'loading'} onChange={changeBoundary} onConfirm={(points) => { setConsent(false); setManualBoundary(points); }} />}
            {cropState === 'loading' && <p role="status" aria-live="polite" className="smile-hint">{cropNote}</p>}
            {cropState === 'failed' && <p role="alert" className="smile-hint">{cropNote}</p>}
            {photoKind === 'portrait' && cropState !== 'loading' && <button type="button" className="smile-text-button" onClick={() => { setConsent(false); setCropAttempt((n) => n + 1); }}>Определить область заново</button>}
            {photoKind === 'portrait' && cropState === 'failed' && <button type="button" className="smile-secondary" onClick={() => changePhotoKind('cropped')}>Продолжить с обрезанной улыбкой</button>}
            {cropState === 'ready' && <p className="smile-mask-note is-ready">{photoKind === 'portrait' ? '✓ Фрагмент улыбки подготовлен автоматически' : '✓ Подтверждённый фрагмент улыбки готов'}</p>}
            {photoKind === 'cropped' && cropState === 'idle' && <p className="smile-micro">Подтвердите область улыбки, затем нажмите «Далее».</p>}
          </FormSection>}
          </>}

          {photo && formStep === 1 && <>
            <FormSection step="02" title="Вариант улыбки">
              <div className="smile-modes" role="group" aria-label="Вариант реабилитации">{MODES.map((option) => <button type="button" key={option.id} className={mode === option.id ? 'is-selected' : ''} aria-pressed={mode === option.id} onClick={() => setMode(option.id)}><strong>{option.label}</strong><span>{option.description}</span></button>)}</div>
              {mode === 'front' && <p className="smile-micro">Меняем передние зубы и клыки. Жевательные зубы просим AI сохранить.</p>}
            </FormSection>
          </>}
          {photo && formStep === 2 && <>
            <FormSection step="03" title="Оттенок зубов">
              <div className="smile-palette" role="group" aria-label="Общий оттенок зубов">{SMILE_SHADES.map((option, index) => <button type="button" key={option} className={shade === option ? 'is-selected' : ''} aria-pressed={shade === option} onClick={() => setShade(option)}><span className="smile-swatch" style={{ background: SHADE_COLORS[index] }} aria-hidden="true" /><span>{option}</span></button>)}</div>
              <p className="smile-micro">Один оттенок для всех изменяемых зубов. Образцы на экране условны.</p>
            </FormSection>
          </>}
          {photo && formStep === 3 && <>
            <FormSection step="04" title="Форма и прозрачность">
              <div className="smile-shapes" role="group" aria-label="Форма зубов">{SHAPES.map((option) => <button type="button" key={option.id} className={shape === option.id ? 'is-selected' : ''} aria-pressed={shape === option.id} onClick={() => setShape(option.id)}><ShapeGlyph shape={option.id} /><span>{option.label}</span></button>)}</div>
              <h3>Прозрачность режущего края</h3><div className="smile-segmented" role="group" aria-label="Прозрачность режущего края"><button type="button" className={translucency === 'none' ? 'is-selected' : ''} aria-pressed={translucency === 'none'} onClick={() => setTranslucency('none')}>Без прозрачности</button><button type="button" className={translucency === 'natural' ? 'is-selected' : ''} aria-pressed={translucency === 'natural'} onClick={() => setTranslucency('natural')}>Естественная</button></div>
              <details className="smile-details"><summary>Дополнительные настройки</summary>
                <h3>Детализация</h3><div className="smile-segmented" role="group" aria-label="Детализация генерации"><button type="button" className={imageResolution === '1K' ? 'is-selected' : ''} aria-pressed={imageResolution === '1K'} onClick={() => setImageResolution('1K')}>1K</button><button type="button" className={imageResolution === '2K' ? 'is-selected' : ''} aria-pressed={imageResolution === '2K'} onClick={() => setImageResolution('2K')}>2K</button></div>
                <h3>Десневые зениты</h3><div className="smile-segmented" role="group" aria-label="Коррекция десневых зенитов"><button type="button" className={zenithMode === 'preserve' ? 'is-selected' : ''} aria-pressed={zenithMode === 'preserve'} onClick={() => setZenithMode('preserve')}>Сохранить</button><button type="button" className={zenithMode === 'allow' ? 'is-selected' : ''} aria-pressed={zenithMode === 'allow'} onClick={() => setZenithMode('allow')}>Разрешить коррекцию</button></div>
                {zenithMode === 'allow' && <label className="smile-instruction">Точное указание для области улыбки<textarea maxLength={160} rows={3} value={zenithInstruction} onChange={(event) => setZenithInstruction(event.target.value)} placeholder="Опишите требуемое изменение десневого контура" required /><span className="smile-micro">{zenithInstruction.length} / 160</span></label>}
              </details>
            </FormSection>
          </>}
          {photo && formStep === 4 && <>
            <FormSection step="05" title="Создание примерки">
              {cropPreviewUrl && <img className="smile-crop-preview" src={cropPreviewUrl} alt="Только эта область рта будет отправлена AI" />}
              <div className="smile-summary"><span>Режим</span><strong>{MODES.find((option) => option.id === mode)?.label}</strong><span>Челюсти</span><strong>Верхняя и нижняя · только видимые зубы</strong><span>Цвет</span><strong>{shade}</strong><span>Форма</span><strong>{SHAPES.find((option) => option.id === shape)?.label}</strong></div>
              <details className="smile-details smile-privacy"><summary>На сервер — только область рта</summary><p>Для возврата к задаче исходник сохраняется только в браузере этого устройства. Он доступен для вклейки 24 часа; после этого очищается при следующем обращении к примерке. Удаление примерки очищает его сразу.</p><p>Фрагмент и результат хранятся в LabFrame зашифрованными. Внешний AI видит фрагмент; он может оставаться узнаваемым. {user.smileProvider === 'fal' ? 'Обработка — fal.ai.' : 'Обработка — Polza.ai.'} У внешнего сервиса свои условия хранения и удаления.</p></details>
              <label className="smile-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>У меня есть разрешение использовать это фото и передать показанный фрагмент улыбки внешнему AI.</span></label>
              <p className="smile-cost-note">В закрытом тесте примерки не списываются с вашего баланса генераций.</p>
              {cropState !== 'ready' && <p className="smile-micro" role="status">Вернитесь на шаг «Фото улыбки» и подготовьте область рта.</p>}
              {cropState === 'ready' && !consent && <p className="smile-micro">Для запуска отметьте согласие на обработку фото.</p>}
            </FormSection>
          </>}
        </>}
      </>}
    </div>
  </Screen>;
}
