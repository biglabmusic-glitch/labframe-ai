import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { BrandData, Draft, Job, User } from './types';

interface AppState {
  user: User;
  brand: BrandData;
  draft: Draft;
  history: Job[];
}

interface AppContextValue extends AppState {
  setUser: (u: Partial<User>) => void;
  setBrand: (b: Partial<BrandData>) => void;
  setDraft: (d: Partial<Draft>) => void;
  resetDraft: () => void;
}

const initialUser: User = {
  name: 'Иван Петров',
  initials: 'ИП',
  plan: 'pro',
  usage: { used: 21, limit: 150, period: 'месяц' },
};

const initialBrand: BrandData = {
  logoFileName: 'petrov_lab_logo.png',
  masterName: 'Керамист Иван Петров',
  labName: 'Petrov Ceramic Lab',
  defaultStyle: 'dark',
  logoPlacement: 'bottom-right',
  hashtags: ['#petrov_lab', '#керамика', '#виниры', '#eMax', '#dentalart', '#ceramist'],
};

const initialDraft: Draft = {
  status: 'created',
};

const initialHistory: Job[] = [
  { id: '1', style: 'dark',  format: '1x1',  createdAt: Date.now() - 86400000, thumbBg: '#0F1221', dark: true },
  { id: '2', style: 'clean', format: '4x5',  createdAt: Date.now() - 172800000, thumbBg: '#F4F6FB' },
  { id: '3', style: 'soft',  format: '9x16', createdAt: Date.now() - 259200000, thumbBg: 'linear-gradient(135deg,#D6EEF3,#EFF3FF)' },
];

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User>(initialUser);
  const [brand, setBrandState] = useState<BrandData>(initialBrand);
  const [draft, setDraftState] = useState<Draft>(initialDraft);
  const [history] = useState<Job[]>(initialHistory);

  const setUser = useCallback((u: Partial<User>) => setUserState((p) => ({ ...p, ...u })), []);
  const setBrand = useCallback((b: Partial<BrandData>) => setBrandState((p) => ({ ...p, ...b })), []);
  const setDraft = useCallback((d: Partial<Draft>) => setDraftState((p) => ({ ...p, ...d })), []);
  const resetDraft = useCallback(() => setDraftState(initialDraft), []);

  const value = useMemo<AppContextValue>(
    () => ({ user, brand, draft, history, setUser, setBrand, setDraft, resetDraft }),
    [user, brand, draft, history, setUser, setBrand, setDraft, resetDraft],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
