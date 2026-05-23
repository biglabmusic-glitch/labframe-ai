import { useEffect, useState } from 'react';
import { WebApp } from './webapp';

/**
 * Слушает изменение viewport (например, появление клавиатуры).
 * Возвращает stableHeight в px.
 */
export function useViewport() {
  const [stableHeight, setStableHeight] = useState<number>(
    WebApp?.viewportStableHeight ?? window.innerHeight,
  );

  useEffect(() => {
    if (!WebApp) return;
    const handler = () => setStableHeight(WebApp.viewportStableHeight);
    WebApp.onEvent('viewportChanged', handler);
    return () => WebApp.offEvent('viewportChanged', handler);
  }, []);

  return stableHeight;
}
