/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** '0' — показывать лимиты и тарифы. Не задана или любое другое значение — демо-режим. */
  readonly VITE_LIMITS_DISABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
