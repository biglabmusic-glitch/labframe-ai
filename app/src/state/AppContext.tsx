import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BrandData, Draft, Job, User } from './types';
import { WebApp, getStartParam } from '../telegram/webapp';
import { api, isBackendReady, type SaveBrandInput } from '../api/client';
import { PRIVACY_VERSION } from '../lib/privacy';
import { isReturningAccount, startupFailure, syncStartup } from './startup';

interface AppState {
  user: User;
  brand: BrandData;
  draft: Draft;
  history: Job[];
  onboarded: boolean;
}

interface AppContextValue extends AppState {
  setUser: (u: Partial<User>) => void;
  setBrand: (b: Partial<BrandData>) => void;
  setDraft: (d: Partial<Draft>) => void;
  resetDraft: () => void;
  completeOnboarding: () => void;
  addToHistory: (j: Job) => void;
  /** Сохранить бренд на сервере + локально. Возвращает Promise чтобы вызывающий мог дождаться. */
  syncBrandToServer: (b: Partial<BrandData> & { removeLogo?: boolean }) => Promise<void>;
  /** true пока проверяем профиль через /me; история загружается независимо. */
  syncing: boolean;
  /**
   * false, пока /me ни разу не ответил. До этого момента user.credits равен нулю
   * просто потому, что настоящего значения ещё нет, — и выдавать его за «генерации
   * закончились» нельзя.
   */
  balanceLoaded: boolean;
  /**
   * Ответил ли /me с балансом. false после неудачи означает «мы не знаем»,
   * а не «генераций нет»: показывать ноль в этом случае нельзя — человек
   * с полным счётом увидит «генерации закончились».
   */
  balanceKnown: boolean;
  startupError: 'session' | 'connection' | null;
  retryStartup: () => void;
  /** Когда принята политика обработки данных. null — не принимал, пускать нельзя. */
  consentAt: string | null;
  /**
   * Ответил ли /me. Без этого признака нельзя отличить «согласия нет» от
   * «сервер не ответил»: и там и там consentAt пустой, но во втором случае
   * запирать человека на экране согласия нельзя — сохранить он всё равно
   * не сможет, а согласие мог дать давным-давно.
   */
  consentKnown: boolean;
  /** Зафиксировать согласие текущей версии политики на сервере. */
  giveConsent: () => Promise<void>;
}

function storageKey(): string|null {
  const id=WebApp?.initDataUnsafe?.user?.id;
  return id ? `labframe.v2:${id}` : null;
}

function getInitials(first?: string, last?: string, username?: string): string {
  const a = (first ?? username ?? '?').trim();
  const b = (last ?? '').trim();
  return (a[0] ?? '').toUpperCase() + (b[0] ?? '').toUpperCase() || (a[0] ?? '?').toUpperCase();
}

function buildInitialUser(): User {
  const tg = WebApp?.initDataUnsafe?.user;
  if (tg) {
    const name = [tg.first_name, tg.last_name].filter(Boolean).join(' ') || (tg.username ?? 'Пользователь');
    return {
      telegramId: tg.id,
      username: tg.username,
      name,
      initials: getInitials(tg.first_name, tg.last_name, tg.username),
      avatarUrl: tg.photo_url,
      // Ноль намеренно: реальный баланс придёт из /me. Показывать до ответа
      // сервера выдуманную пятёрку значило бы обещать генерации, которых может
      // не быть.
      credits: 0,
    };
  }
  return {
    name: 'Гость',
    initials: 'Г',
    credits: 0,
  };
}

const emptyBrand: BrandData = {
  logoPlacement: 'bottom-right',
  hashtags: [],
};

const initialDraft: Draft = { status: 'created' };

interface PersistedDraft {
  draft: Draft;
  savedAt: number;
}

interface PersistedState {
  brand?: Partial<BrandData>;
  onboarded?: boolean;
  history?: Job[];
  draft?: PersistedDraft;
}

const DRAFT_TTL_MS = 30 * 60 * 1000;            // 30 минут — потом считаем устаревшим

// blob://-URL живёт только в текущей JS-сессии; после reload фронта он невалиден.
// При сохранении draft срезаем blob-URL, оставляя только серверный photoPath.
function sanitizeDraftForPersist(d: Draft): Draft {
  if (!d.photo) return d;
  const { url, ...photoRest } = d.photo;
  void url;
  return { ...d, photo: photoRest };
}

function loadPersisted(): PersistedState {
  try {
    localStorage.removeItem('labframe.v1');
    const key=storageKey();
    const raw = key ? localStorage.getItem(key):null;
    return raw ? JSON.parse(raw) as PersistedState : {};
  } catch {
    return {};
  }
}

function savePersisted(state: PersistedState) {
  try {
    const key=storageKey();
    if(!key)return;
    // Private signed URLs expire and must not be kept as a durable credential.
    const {logoUrl,...brand}=state.brand ?? {};
    void logoUrl;
    const safe={...state,brand,history:state.history?.map(({resultUrl,thumbUrl,...job})=>{void resultUrl;void thumbUrl;return job;})};
    localStorage.setItem(key, JSON.stringify(safe));
  } catch {
    // ignore (private mode, quota etc.)
  }
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [persisted] = useState(loadPersisted);

  const [user, setUserState] = useState<User>(buildInitialUser);
  const [brand, setBrandState] = useState<BrandData>({ ...emptyBrand, ...(persisted.brand ?? {}) });
  const [draft, setDraftState] = useState<Draft>(() => {
    // Восстанавливаем draft из localStorage, если он не устарел.
    // Спасает от Telegram WebView reload (особенно на mobile), который иначе
    // ронял всё состояние выбранных параметров между шагами.
    const p = persisted.draft;
    if (p && Date.now() - p.savedAt < DRAFT_TTL_MS) return p.draft;
    return initialDraft;
  });
  const [history, setHistoryState] = useState<Job[]>(persisted.history ?? []);
  const [onboarded, setOnboarded] = useState<boolean>(persisted.onboarded ?? false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [balanceLoaded, setBalanceLoaded] = useState<boolean>(false);
  const [balanceKnown, setBalanceKnown] = useState<boolean>(false);
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [consentKnown, setConsentKnown] = useState<boolean>(false);
  const [startupError, setStartupError] = useState<'session' | 'connection' | null>(null);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const retryStartup = useCallback(() => setStartupAttempt((attempt) => attempt + 1), []);
  const lastHistoryRefresh=useRef(0);
  useEffect(()=>{
    if(!isBackendReady())return;
    let active=true;
    const refresh=async()=>{
      if(document.visibilityState==='hidden' || Date.now()-lastHistoryRefresh.current<30_000)return;
      lastHistoryRefresh.current=Date.now();
      try {
        const jobs=await api.listJobs(24);
        if(active)setHistoryState(jobs.items.map((j)=>({...j,thumbBg:'var(--c-card-dd)',dark:j.style==='dark'})));
      }catch{ /* keep current history through a temporary outage */ }
    };
    const timer=setInterval(()=>{void refresh();},30*60*1000);
    const foreground=()=>{void refresh();};
    document.addEventListener('visibilitychange',foreground);
    return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',foreground);};
  },[]);

  // Согласие пишем на сервере: localStorage чистится вместе с кэшем и ничего
  // не подтверждает, а дата в базе — подтверждает.
  const giveConsent = useCallback(async () => {
    const { consentAt: at } = await api.giveConsent(PRIVACY_VERSION);
    setConsentAt(at);
  }, []);

  // Перечитать пользователя, когда WebApp реально прогрузится (initDataUnsafe иногда заполняется позже)
  useEffect(() => {
    const tg = WebApp?.initDataUnsafe?.user;
    if (tg && !user.telegramId) {
      setUserState(buildInitialUser());
    }
  }, [user.telegramId]);

  // Синхронизация с сервером на старте: /me даёт бренд + баланс генераций,
  // /list-jobs даёт ленту «ваши работы». Локальный localStorage остаётся
  // как кэш до ответа сервера — UI не моргает между устройствами.
  useEffect(() => {
    // Без бэкенда (mock-режим) ждать нечего — сразу показываем то, что есть локально.
    if (!isBackendReady()) { setBalanceLoaded(true); return; }
    let cancelled = false;

    setStartupError(null);
    // After six seconds show an honest retry screen, never a new-account route.
    // A late successful response still restores the profile before router mount.
    const failsafe = setTimeout(() => {
      if (!cancelled) { setStartupError('connection'); setBalanceLoaded(true); }
    }, 6000);

    (async () => {
      setSyncing(true);
      try {
        let historyCount = 0;
        let verifiedProfile: Awaited<ReturnType<typeof api.me>> = null;
        await syncStartup(api.me, () => api.listJobs(24), (me) => {
          if (cancelled) return;
          if (!me?.user) throw new Error('Profile unavailable');
          verifiedProfile = me;
          setStartupError(null);

          // Если зашли по реф-ссылке (start_param='ref_<CODE>') — тихо привязываемся.
          // Бэк сам отсечёт «не новый юзер»/самоприглашение. Награда — позже, при оплате.
          const sp = getStartParam();
          if (sp.startsWith('ref_')) {
            api.applyReferral({ startParam: sp }).catch(() => { /* молча */ });
          }
          if (me?.user) {
            // Согласие с политикой: по нему решается, пускать ли дальше входа.
            setConsentKnown(true);
            setBalanceKnown(true);
            setConsentAt(
              me.user.consentAt && me.user.consentVersion === PRIVACY_VERSION
                ? me.user.consentAt
                : null,
            );
            setUserState((p) => ({
              ...p,
              telegramId: me.user!.telegramId,
              username:   me.user!.username   ?? p.username,
              name:       [me.user!.firstName, me.user!.lastName].filter(Boolean).join(' ') || p.name,
              initials:   getInitials(me.user!.firstName, me.user!.lastName, me.user!.username),
              avatarUrl:  me.user!.photoUrl   ?? p.avatarUrl,
              credits:    me.user!.credits ?? 0,
              isAdmin:    me.user!.isAdmin ?? false,
              canSmilePreview: me.user!.canSmilePreview ?? false,
              smileProvider: me.user!.smileProvider ?? 'polza',
              smileInviteStatus: me.user!.smileInviteStatus,
              refCode:        me.user!.refCode ?? p.refCode,
              referralsCount: me.user!.referralsCount ?? 0,
              referralsPaid:  me.user!.referralsPaid ?? 0,
            }));
            // A dentist coming for the pilot does not need marketing-brand setup.
            if (sp.startsWith('smile_') && me.user.canSmilePreview) setOnboarded(true);
            if (isReturningAccount(me, historyCount)) setOnboarded(true);
          }
          if (me?.brand) {
            setBrandState((p) => ({ ...p, ...me.brand! }));
          }
        }, (jobs) => {
          if (cancelled) return;
          historyCount = jobs.items.length;
          if (verifiedProfile && isReturningAccount(verifiedProfile, historyCount)) setOnboarded(true);
          if (jobs?.items) {
            setHistoryState(jobs.items.map((j) => ({
              id:          j.id,
              style:       j.style,
              format:      j.format,
              workType:    j.workType,
              createdAt:   j.createdAt,
              thumbBg:     'var(--c-card-dd)',
              dark:        j.style === 'dark',
              resultUrl:   j.resultUrl,
              thumbUrl:    j.thumbUrl,
              captionMain: j.captionMain,
            })));
          }
        });
      } catch (error) {
        if (!cancelled) setStartupError(startupFailure(error));
      } finally {
        clearTimeout(failsafe);
        if (!cancelled) {
          setSyncing(false);
          // Ставим и при ошибке: иначе карточка баланса навсегда осталась бы
          // в состоянии «загружаем».
          setBalanceLoaded(true);
        }
      }
    })();
    return () => { cancelled = true; clearTimeout(failsafe); };
  }, [startupAttempt]);

  // Сохраняем то, что должно жить между сессиями
  useEffect(() => {
    savePersisted({
      brand,
      onboarded,
      history,
      draft: { draft: sanitizeDraftForPersist(draft), savedAt: Date.now() },
    });
  }, [brand, onboarded, history, draft]);

  const setUser  = useCallback((u: Partial<User>)      => setUserState((p) => ({ ...p, ...u })), []);
  const setBrand = useCallback((b: Partial<BrandData>) => setBrandState((p) => ({ ...p, ...b })), []);
  const setDraft = useCallback((d: Partial<Draft>)     => setDraftState((p) => ({ ...p, ...d })), []);
  const resetDraft = useCallback(() => setDraftState(initialDraft), []);
  const completeOnboarding = useCallback(() => setOnboarded(true), []);

  // Добавить в локальную ленту истории (вызывается из ScreenResult при `done`).
  // Дедуп по id: если уже есть — обновляем (например, resultUrl пришёл позже).
  // Храним до 24 последних, чтобы localStorage не распух.
  const addToHistory = useCallback((j: Job) => {
    setHistoryState((p) => {
      const without = p.filter((x) => x.id !== j.id);
      return [j, ...without].slice(0, 24);
    });
  }, []);

  // Сохранить бренд на сервере + локально. Используется в ScreenMyBrand → MainButton «Сохранить».
  // Если бэкенд не настроен (mock-режим) — только локальный setBrand.
  const syncBrandToServer = useCallback(async (b: Partial<BrandData> & { removeLogo?: boolean }) => {
    setBrandState((p) => ({ ...p, ...b }));
    if (!isBackendReady()) return;
    const payload: SaveBrandInput = {
      masterName:    b.masterName,
      labName:       b.labName,
      defaultStyle:  b.defaultStyle,
      logoPlacement: b.logoPlacement,
      hashtags:      b.hashtags,
      removeLogo:    b.removeLogo,
      logoPath:      b.logoPath,
      fontId:        b.fontId,
    };
    try { await api.saveBrand(payload); }
    catch { /* локально уже обновили, в следующий раз /me перетянет с сервера */ }
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({ user, brand, draft, history, onboarded, setUser, setBrand, setDraft, resetDraft, completeOnboarding, addToHistory, syncBrandToServer, syncing, balanceLoaded, balanceKnown, startupError, retryStartup, consentAt, consentKnown, giveConsent }),
    [user, brand, draft, history, onboarded, setUser, setBrand, setDraft, resetDraft, completeOnboarding, addToHistory, syncBrandToServer, syncing, balanceLoaded, balanceKnown, startupError, retryStartup, consentAt, consentKnown, giveConsent],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
