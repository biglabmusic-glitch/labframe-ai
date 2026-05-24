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
import { WebApp } from '../telegram/webapp';

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
    };
  }
  return {
    name: 'Гость',
    initials: 'Г',
    plan: 'free',
    usage: { used: 0, limit: 3, period: 'месяц' },
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

  // Перечитать пользователя, когда WebApp реально прогрузится (initDataUnsafe иногда заполняется позже)
  useEffect(() => {
    const tg = WebApp?.initDataUnsafe?.user;
    if (tg && !user.telegramId) {
      setUserState(buildInitialUser());
    }
  }, [user.telegramId]);

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

  // expose setHistoryState через ничего — пока история ведётся локально, она появляется
  // когда юзер закончит флоу (см. ScreenResult). Метод вернём, если станет нужен снаружи.
  void setHistoryState;

  const value = useMemo<AppContextValue>(
    () => ({ user, brand, draft, history, onboarded, setUser, setBrand, setDraft, resetDraft, completeOnboarding }),
    [user, brand, draft, history, onboarded, setUser, setBrand, setDraft, resetDraft, completeOnboarding],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
