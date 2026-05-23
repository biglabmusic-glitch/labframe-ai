import { useEffect } from 'react';
import { WebApp } from './webapp';

/**
 * Управляет нативной Telegram.WebApp.BackButton.
 * Передайте `null`, чтобы скрыть кнопку.
 */
export function useBackButton(onBack: (() => void) | null) {
  useEffect(() => {
    const bb = WebApp.BackButton;
    if (!bb) return;

    if (!onBack) {
      bb.hide();
      return;
    }

    bb.onClick(onBack);
    bb.show();

    return () => {
      bb.offClick(onBack);
      bb.hide();
    };
  }, [onBack]);
}
