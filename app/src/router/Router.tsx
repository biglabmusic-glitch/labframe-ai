import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { WebApp } from '../telegram/webapp';

export type RouteId =
  | 'welcome'
  | 'home'
  | 'upload'
  | 'worktype'
  | 'style'
  | 'brand'
  | 'format'
  | 'text'
  | 'proc'
  | 'result'
  | 'mybrand'
  | 'examples'
  | 'pricing'
  | 'help';

interface RouterValue {
  route: RouteId;
  history: RouteId[];
  push: (r: RouteId) => void;
  replace: (r: RouteId) => void;
  back: () => void;
  reset: (r: RouteId) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({
  children,
  initial = 'welcome',
}: {
  children: ReactNode;
  initial?: RouteId;
}) {
  const [history, setHistory] = useState<RouteId[]>([initial]);
  const route = history[history.length - 1];

  const push = useCallback((r: RouteId) => {
    setHistory((h) => [...h, r]);
  }, []);

  const replace = useCallback((r: RouteId) => {
    setHistory((h) => [...h.slice(0, -1), r]);
  }, []);

  const back = useCallback(() => {
    setHistory((h) => {
      if (h.length <= 1) {
        // Если стек пуст — закрываем мини-апп
        WebApp?.close?.();
        return h;
      }
      return h.slice(0, -1);
    });
  }, []);

  const reset = useCallback((r: RouteId) => setHistory([r]), []);

  const value = useMemo<RouterValue>(
    () => ({ route, history, push, replace, back, reset }),
    [route, history, push, replace, back, reset],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside <RouterProvider>');
  return ctx;
}
