import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';

// thumbs.ts тянет клиент базы, а тот читает секреты при импорте.
for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'REPLICATE_API_TOKEN', 'POLZA_API_KEY', 'BOT_TOKEN']) {
  Deno.env.set(name, name === 'SUPABASE_URL' ? 'http://localhost' : 'test');
}
const { makeThumb, thumbPathFor } = await import('./thumbs.ts');

Deno.test('миниатюра лежит рядом с результатом', () => {
  assertEquals(thumbPathFor('123/abc.jpg'), '123/abc_t.jpg');
});

Deno.test('миниатюра — короткая сторона 360 и в разы легче оригинала', async () => {
  // Пёстрая картинка 1024×1280: однотонная сжалась бы в ничто и ничего не доказала.
  const img = new Image(1024, 1280);
  for (let i = 0; i < img.bitmap.length; i += 4) {
    const n = (i * 2654435761) >>> 0;
    img.bitmap.set([n & 255, (n >> 8) & 255, (n >> 16) & 255, 255], i);
  }
  const original = await img.encodeJPEG(92);
  const thumb = await makeThumb(original);
  const decoded = await Image.decode(thumb);

  assertEquals(Math.min(decoded.width, decoded.height), 360);
  assertEquals(decoded.height, 450); // пропорции 4:5 сохранены
  assert(thumb.length * 5 < original.length, `миниатюра ${thumb.length} против ${original.length}`);
});

Deno.test('маленькую картинку не растягиваем', async () => {
  const small = await new Image(200, 200).fill(0xff0000ff).encodeJPEG(90);
  const decoded = await Image.decode(await makeThumb(small));
  assertEquals([decoded.width, decoded.height], [200, 200]);
});
