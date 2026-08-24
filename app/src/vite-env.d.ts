/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Ник владельца в Telegram без «@» — куда ведёт кнопка покупки пакета.
   *  Не задана или пустая — кнопки покупки скрываются. */
  readonly VITE_OWNER_TG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
