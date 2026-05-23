// Supabase service-role client. Все edge-функции пишут в БД через него.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { env } from './env.ts';

export const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
