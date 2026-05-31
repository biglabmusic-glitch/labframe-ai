import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { BrandData, Draft, Job, User } from './types';
import { WebApp, getStartParam } from '../telegram/webapp';
import { api, isBackendReady, type SaveBrandInput } from '../api/client';

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
  /** true пока тянем /me и /list-jobs при старте — UI может показать спиннер если нужно. */
  syncing: boolean;
}

const STORAGE_KEY = 'labframe.v1';

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
      plan: 'free',
      usage: { used: 0, limit: 3, period: 'месяц' },
      premium: { used: 0, limit: 3 },
    };
  }
  return {
    name: 'Гость',
    initials: 'Г',
    plan: 'free',
    usage: { used: 0, limit: 3, period: 'месяц' },
    premium: { used: 0, limit: 3 },
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
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as PersistedState : {};
  } catch {
    return {};
  }
}

function savePersisted(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore (private mode, quota etc.)
  }
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const persisted = loadPersisted();

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

  // Перечитать пользователя, когда WebApp реально прогрузится (initDataUnsafe иногда заполняется позже)
  useEffect(() => {
    const tg = WebApp?.initDataUnsafe?.user;
    if (tg && !user.telegramId) {
      setUserState(buildInitialUser());
    }
  }, [user.telegramId]);

  // Синхронизация с сервером на старте: /me даёт бренд+тариф+usage,
  // /list-jobs даёт ленту «ваши работы». Локальный localStorage остаётся
  // как кэш до ответа сервера — UI не моргает между устройствами.
  useEffect(() => {
    if (!isBackendReady()) return;
    let cancelled = false;
    (async () => {
      setSyncing(true);
      try {
        const [me, jobs] = await Promise.all([api.me(), api.listJobs(24)]);
        if (cancelled) return;

        // Если зашли по реф-ссылке (start_param='ref_<CODE>') — тихо привязываемся.
        // Бэк сам отсечёт «не новый юзер»/самоприглашение. Награда — позже, при оплате.
        const sp = getStartParam();
        if (sp.startsWith('ref_')) {
          api.applyReferral({ startParam: sp }).catch(() => { /* молча */ });
        }
        if (me?.user) {
          setUserState((p) => ({
            ...p,
            telegramId: me.user!.telegramId,
            username:   me.user!.username   ?? p.username,
            name:       [me.user!.firstName, me.user!.lastName].filter(Boolean).join(' ') || p.name,
            initials:   getInitials(me.user!.firstName, me.user!.lastName, me.user!.username),
            avatarUrl:  me.user!.photoUrl   ?? p.avatarUrl,
            plan:       me.user!.plan,
            usage:      { used: me.user!.usageUsed, limit: me.user!.usageLimit, period: 'месяц' },
            premium:    { used: me.user!.premiumUsed ?? 0, limit: me.user!.premiumLimit ?? 3 },
            isAdmin:    me.user!.isAdmin ?? false,
            refCode:        me.user!.refCode ?? p.refCode,
            referralsCount: me.user!.referralsCount ?? 0,
            referralsPaid:  me.user!.referralsPaid ?? 0,
          }));
        }
        if (me?.brand) {
          setBrandState((p) => ({ ...p, ...me.brand! }));
        }
        if (jobs?.items?.length) {
          setHistoryState(jobs.items.map((j) => ({
            id:          j.id,
            style:       j.style,
            format:      j.format,
            workType:    j.workType,
            createdAt:   j.createdAt,
            thumbBg:     'var(--c-card-dd)',
            dark:        j.style === 'dark',
            resultUrl:   j.resultUrl,
            captionMain: j.captionMain,
          })));
        }
      } catch {
        // молча — на iPhone мог быть кратковременный сетевой сбой,
        // в следующий раз подтянется. Локальный кэш остаётся.
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
    () => ({ user, brand, draft, history, onboarded, setUser, setBrand, setDraft, resetDraft, completeOnboarding, addToHistory, syncBrandToServer, syncing }),
    [user, brand, draft, history, onboarded, setUser, setBrand, setDraft, resetDraft, completeOnboarding, addToHistory, syncBrandToServer, syncing],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
