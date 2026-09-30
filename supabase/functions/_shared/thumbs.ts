// Миниатюры для истории работ на главном экране.
//
// В квадратик истории раньше грузилась полная картинка ~350 КБ: 24 работы —
// 8 МБ при каждом открытии приложения. Этот трафик и выбил бесплатный тариф
// Supabase. Миниатюра ~30 КБ лежит рядом с результатом: <юзер>/<id>_t.jpg.
import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';
import { resizeArea } from './branding.ts';
import { db } from './db.ts';
import { fetchBytes, publicUrl, uploadBytes } from './storage.ts';

// Квадратик истории — около 110 точек; втрое больше покрывает экраны с
// высокой плотностью пикселей.
const THUMB_SIDE = 360;
const THUMB_QUALITY = 80;

export function thumbPathFor(resultPath: string): string {
  return resultPath.replace(/\.jpg$/i, '') + '_t.jpg';
}

export async function makeThumb(bytes: Uint8Array): Promise<Uint8Array> {
  const img = await Image.decode(bytes);
  const scale = Math.min(1, THUMB_SIDE / Math.min(img.width, img.height));
  const small = scale < 1
    ? resizeArea(img, Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)))
    : img;
  return await small.encodeJPEG(THUMB_QUALITY);
}

/** Делает миниатюру и записывает путь к ней. null — не вышло, это не страшно. */
export async function saveThumb(jobId: string, resultPath: string, bytes: Uint8Array): Promise<string | null> {
  try {
    const path = thumbPathFor(resultPath);
    await uploadBytes('results', path, await makeThumb(bytes));
    await db.from('jobs').update({ thumb_path: path }).eq('id', jobId);
    return path;
  } catch (e) {
    // Без миниатюры история покажет полную картинку — медленнее, но работает.
    console.error(`миниатюра для ${jobId} не сделалась:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Доделывает миниатюры старым работам, по нескольку за раз.
 *
 * Зовётся из process-job, когда очереди нет: воркер и так просыпается раз в
 * минуту, а простаивает почти всегда. Новые работы получают миниатюру сразу,
 * так что это разовая догонка — когда старые кончатся, запрос вернёт пусто.
 */
export async function backfillThumbs(limit: number): Promise<number> {
  const { data: jobs } = await db
    .from('jobs')
    .select('id, result_path')
    .eq('status', 'done')
    .not('result_path', 'is', null)
    .is('thumb_path', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  let done = 0;
  for (const job of jobs ?? []) {
    try {
      const bytes = await fetchBytes(publicUrl('results', job.result_path));
      if (await saveThumb(job.id, job.result_path, bytes)) done++;
    } catch (e) {
      // Результат пропал из хранилища — помечаем, чтобы не спотыкаться о него
      // каждую минуту. История для такой работы всё равно пустая.
      console.error(`догонка миниатюры ${job.id}:`, e instanceof Error ? e.message : e);
      await db.from('jobs').update({ thumb_path: '' }).eq('id', job.id);
    }
  }
  return done;
}
