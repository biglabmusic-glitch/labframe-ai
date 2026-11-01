import { useEffect } from 'react';
import { WebApp } from './webapp';
import { mainActionStore, type MainAction } from './main-action-store';

export type MainButtonOptions = MainAction;

/**
 * Registers the screen action rendered by Screen inside the WebView.
 * Native Telegram MainButton can disappear in a client; navigation must not
 * depend on it. Keep the existing hook contract for every step of the flow.
 */
export function useMainButton(opts: MainButtonOptions | null) {
  useEffect(() => {
    const release = mainActionStore.publish(opts);
    // The DOM action remains available even when Telegram's bridge throws.
    try { WebApp.MainButton?.hideProgress(); WebApp.MainButton?.hide(); } catch { /* optional bridge */ }
    return release;
  }, [
    opts?.text,
    opts?.enabled,
    opts?.progress,
    opts?.visible,
    opts?.onClick,
  ]);
}
