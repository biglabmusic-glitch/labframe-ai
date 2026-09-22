// Кому писать о важном: оплата пришла, деньги у провайдера кончаются.
//
// Админы — это ADMIN_IDS из env (те, с кого всё началось) плюс отмеченные
// флагом is_admin в базе. Тот же состав, что пускает в админку.
import { db } from './db.ts';
import { sendMessage } from './telegram.ts';

export function envAdminIds(): number[] {
  return (Deno.env.get('ADMIN_IDS') ?? '')
    .split(',').map((s) => Number(s.trim())).filter(Boolean);
}

export async function adminIds(): Promise<number[]> {
  const ids = new Set(envAdminIds());
  const { data } = await db.from('users').select('id').eq('is_admin', true);
  for (const row of data ?? []) ids.add(Number(row.id));
  return [...ids];
}

/**
 * Сообщение всем админам.
 *
 * Никогда не бросает: это уведомление о событии, которое уже произошло.
 * Уронить из-за него оплату или замер остатка было бы хуже, чем промолчать.
 */
export async function notifyAdmins(text: string): Promise<void> {
  try {
    for (const id of await adminIds()) {
      try {
        await sendMessage(id, text);
      } catch (e) {
        console.error(`админ ${id} не получил уведомление:`, e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error('не смогли собрать список админов:', e instanceof Error ? e.message : e);
  }
}
