// Доступ к секретам Supabase Functions через Deno.env.
// Все ключи задаются в Supabase Dashboard → Settings → Edge Functions → Secrets.

export const env = {
  SUPABASE_URL:              required('SUPABASE_URL'),
  SUPABASE_ANON_KEY:         required('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),

  REPLICATE_API_TOKEN:       required('REPLICATE_API_TOKEN'),
  REPLICATE_MODEL:           Deno.env.get('REPLICATE_MODEL') ?? 'black-forest-labs/flux-kontext-pro',

  POLZA_API_KEY:             required('POLZA_API_KEY'),
  POLZA_BASE_URL:            Deno.env.get('POLZA_BASE_URL') ?? 'https://api.polza.ai/api/v1',
  POLZA_MODEL:               Deno.env.get('POLZA_MODEL') ?? 'gpt-4o-mini',

  BOT_TOKEN:                 required('BOT_TOKEN'),

  // Секрет для авторизации Telegram WebApp initData — проверка подписи
  TG_INITDATA_VERIFY_SECRET: Deno.env.get('TG_INITDATA_VERIFY_SECRET') ?? '',
};

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`env ${name} is required`);
  return v;
}
