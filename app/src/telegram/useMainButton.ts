import { useEffect } from 'react';
import { WebApp } from './webapp';
import { TG_THEME } from '../constants';

export interface MainButtonOptions {
  text: string;
  onClick: () => void;
  enabled?: boolean;
  progress?: boolean;
  visible?: boolean;
}

/**
 * Управляет нативной Telegram.WebApp.MainButton.
 * Когда компонент с этим хуком монтируется — кнопка показывается.
 * Размонтирование скрывает её.
 */
export function useMainButton(opts: MainButtonOptions | null) {
  useEffect(() => {
    const mb = WebApp.MainButton;
    if (!mb || !opts) {
      mb?.hide();
      return;
    }

    mb.setParams({
      text: opts.text,
      color: TG_THEME.mainButtonColor,
      text_color: TG_THEME.mainButtonTextColor,
      is_active: opts.enabled !== false,
      is_visible: opts.visible !== false,
    });

    if (opts.progress) mb.showProgress(false);
    else mb.hideProgress();

    const handler = () => opts.onClick();
    mb.onClick(handler);

    if (opts.visible !== false) mb.show();

    return () => {
      mb.offClick(handler);
      mb.hideProgress();
      mb.hide();
    };
  }, [
    opts?.text,
    opts?.enabled,
    opts?.progress,
    opts?.visible,
    opts?.onClick,
  ]);
}
