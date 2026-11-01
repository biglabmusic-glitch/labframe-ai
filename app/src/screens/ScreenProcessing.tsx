import { useEffect, useRef, useState } from 'react';
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { StepBadge } from '../components/StepBadge';
import { IconCheck, IconClose } from '../components/primitives/icons';
import { useApp } from '../state/AppContext';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import { api, isBackendReady, friendlyError } from '../api/client';
import { clearPendingRequest, pendingRequestKey } from '../lib/job-request';
import { SUPPORT_URL } from '../constants';

const STEPS = [
  'Подготовка',
  'Обработка изображения',
  'Сохранение и подпись',
];

interface ProcessingError {
  title: string;
  sub: string;
  terminal?: boolean;
  needsUpload?: boolean;
}

export function ScreenProcessing() {
  const { draft: initialDraft, setDraft, user } = useApp();
  const draft = useRef(initialDraft).current;
  const { replace, reset } = useRouter();
  const [activeIdx, setActiveIdx] = useState(0);
  const [error, setError] = useState<ProcessingError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [jobSaved,setJobSaved]=useState(false);

  useBackButton(null);
  useMainButton(null);

  // Повтор после сбоя связи использует тот же requestKey и продолжает работу.
  useEffect(() => {
    const controller=new AbortController();
    let mockTimer: ReturnType<typeof setInterval>|undefined;
    let delayed: ReturnType<typeof setTimeout>|undefined;

    (async () => {
      // Defence-in-depth: если попали сюда без обязательных полей (state
      // мог сброситься на mobile WebView reload), не падаем create-job-ом
      // missing_fields, а возвращаем юзера на загрузку фото.
      if (isBackendReady()) {
        const need: string[] = [];
        if (!draft.photo?.photoPath) need.push('фото');
        if (!draft.style)            need.push('стиль');
        if (!draft.format)           need.push('формат');
        if (need.length) {
          setError({ title: 'Нужно загрузить фото заново', sub: `Не сохранились данные: ${need.join(', ')}. Выберите фото и настройки ещё раз.`, needsUpload: true });
          return;
        }
      }

      setDraft({ status: 'processing' });

      if (!isBackendReady() || !draft.photo) {
        // Mock-режим — фейковый прогресс
        const ms = 1800;
        const t = mockTimer = setInterval(() => {
          setActiveIdx((i) => {
            if (i >= STEPS.length - 1) {
              clearInterval(t);
              delayed=setTimeout(() => {
                setDraft({ status: 'done' });
                replace('result');
              }, 600);
              return i;
            }
            return i + 1;
          });
        }, ms);
        return;
      }

      try {
        const input = {
          photoPath: draft.photo.photoPath ?? draft.photo.url ?? '',
          workType:  draft.workType,
          style:     draft.style!,
          format:    draft.format!,
          branding:  draft.branding ?? 'none',
          textType:  draft.textType ?? 'short',
          decorPreset:   draft.decor?.preset,
          decorAddition: draft.decor?.addition,
        };
        const requestKey=pendingRequestKey(sessionStorage,user.telegramId ?? 0,input);
        const job = await api.createJob({...input,requestKey},controller.signal);
        if(controller.signal.aborted)return;
        setJobSaved(true);
        const finalJob = await api.waitForJob(job.id,(j)=>{
          if(!controller.signal.aborted)setActiveIdx(j.stage==='caption'?2:j.stage==='image'?1:0);
        },2000,undefined,controller.signal);
        if(controller.signal.aborted)return;
        clearPendingRequest(sessionStorage,user.telegramId ?? 0);
        if (finalJob.status === 'done') {
          setActiveIdx(STEPS.length - 1);
          setDraft({
            status: 'done',
            // result в state мы не храним, тянем по id из get-job на ScreenResult.
            // Сохраняем id, чтобы Result знал куда смотреть.
            // (Маленький хак: пихаем в photo.url, либо расширить тип позднее.)
          });
          // Используем sessionStorage для передачи jobId
          sessionStorage.setItem('labframe.lastJobId', finalJob.id);
          replace('result');
        } else {
          setDraft({ status: 'failed' });
          setError({ ...friendlyError(finalJob.error ?? 'processing_failed'), terminal: true });
        }
      } catch (e) {
        if(controller.signal.aborted)return;
        setError(friendlyError(e instanceof Error ? e.message : 'Ошибка обработки'));
      }
    })();
    return ()=>{controller.abort();clearInterval(mockTimer);clearTimeout(delayed);};
  }, [draft, replace, setDraft, user.telegramId, attempt]);

  const progress = Math.min(95,Math.round(((activeIdx + 1) / STEPS.length) * 100));
  const dashTotal = 490;
  const dashOffset = dashTotal * (1 - progress / 100);

  return (
    <Screen>
      <div style={{ padding: '12px 22px 14px' }}>
        <StepBadge n={8} total={8} />
      </div>
      <ScreenIntro
        title={error ? error.title : 'AI обрабатывает фото...'}
        sub={
          error
            ? error.sub
            : 'Обычно около минуты. Можно свернуть Telegram — работа продолжится, а готовый результат появится в истории.'
        }
      />

      {error ? <div style={{ padding: '0 22px 24px', display: 'grid', gap: 16 }} role="alert">
        <div aria-hidden="true" style={{ width: 64, height: 64, border: '1.5px solid var(--c-accent)', borderRadius: 999, display: 'grid', placeItems: 'center', margin: '0 auto 8px' }}>
          <IconClose size={30} color="var(--c-accent)" />
        </div>
        {error.terminal && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--c-on-dark-2)' }}>За эту попытку генерация не списана. Фото и настройки сохранены.</p>}
        {!error.terminal && !error.needsUpload && jobSaved && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--c-on-dark-2)' }}>Работа сохранена на сервере и может ещё обрабатываться. Повторное подключение проверит ту же работу.</p>}
        <button type="button" className="main-action-button" onClick={() => {
          if (error.needsUpload) { replace('upload'); return; }
          setError(null);
          setActiveIdx(0);
          setAttempt((value) => value + 1);
        }}>{error.needsUpload ? 'Загрузить фото' : error.terminal ? 'Попробовать снова' : 'Повторить подключение'}</button>
        <button type="button" onClick={() => reset('home')} style={{ minHeight: 48, padding: '12px 16px', border: '1px solid rgba(239,243,255,0.2)', borderRadius: 'var(--r-md)', background: 'transparent', color: 'var(--c-on-dark)', font: 'inherit' }}>На главную</button>
        <a href={SUPPORT_URL} target="_blank" rel="noreferrer" style={{ minHeight: 44, display: 'grid', placeItems: 'center', color: 'var(--c-accent)', fontSize: 14 }}>Написать в поддержку</a>
      </div> : <>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 28px' }}>
        <div style={{ position: 'relative', width: 180, height: 180 }}>
          <svg width="180" height="180" viewBox="0 0 180 180" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="90" cy="90" r="78" stroke="rgba(239,243,255,0.06)" strokeWidth="10" fill="none" />
            <circle cx="90" cy="90" r="78" stroke="var(--c-accent)" strokeWidth="10" fill="none"
              strokeDasharray={dashTotal} strokeDashoffset={dashOffset} strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <div style={{ fontSize: 38, fontWeight: 600, letterSpacing: -1.5, color: 'var(--c-on-dark)' }}>
              {progress}<span style={{ fontSize: 18, opacity: 0.5 }}>%</span>
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--c-on-dark-3)', letterSpacing: 0.8, marginTop: 2 }}>
              {jobSaved ? 'РАБОТА СОХРАНЕНА' : 'ПОДГОТОВКА'}
            </div>
          </div>
        </div>
      </div>
      <div style={{ padding: '0 22px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {STEPS.map((label, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          const pending = i > activeIdx;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                background: done ? 'var(--c-accent)' : 'transparent',
                border: active ? '1.5px solid var(--c-accent)' : done ? 'none' : '1.5px solid rgba(239,243,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {done && <IconCheck size={13} color="var(--c-ink)" />}
                {active && <div style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--c-accent)' }} />}
              </div>
              <div style={{ flex: 1, fontSize: 14, fontWeight: active ? 600 : 400,
                color: pending ? 'var(--c-on-dark-3)' : 'var(--c-on-dark)' }}>
                {label}
              </div>
              {active && (
                <span className="mono" style={{ fontSize: 11, color: 'var(--c-accent)' }}>идёт…</span>
              )}
            </div>
          );
        })}
      </div>
      </>}
    </Screen>
  );
}
