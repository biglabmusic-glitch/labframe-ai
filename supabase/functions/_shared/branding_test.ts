import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';
import { analyzeLogo, applyLogo, prepareLogo, resizeArea } from './branding.ts';

// Картинки собираем прямо в тесте: настоящие логотипы пользователей
// в репозиторий не кладём.

function solid(w: number, h: number, rgba: [number, number, number, number]): Image {
  return new Image(w, h).fill(Image.rgbaToColor(...rgba));
}

function rect(img: Image, x: number, y: number, w: number, h: number, rgba: [number, number, number, number]) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const i = (yy * img.width + xx) * 4;
      img.bitmap.set(rgba, i);
    }
  }
}

/** Скриншот телефона: белый знак в центре чёрного кадра с огромными полями. */
function phoneScreenshotLogo(): Image {
  const img = solid(576, 1024, [0, 0, 0, 255]);
  rect(img, 238, 462, 100, 100, [255, 255, 255, 255]);
  return img;
}

/** «Фото»: у каждого пикселя свой цвет, рамка пёстрая. */
function photo(): Image {
  const img = new Image(400, 400);
  for (let i = 0; i < img.bitmap.length; i += 4) {
    const n = (i * 2654435761) >>> 0;
    img.bitmap.set([n & 255, (n >> 8) & 255, (n >> 16) & 255, 255], i);
  }
  return img;
}

function luminanceAt(img: Image, x: number, y: number): number {
  const i = (y * img.width + x) * 4;
  return 0.299 * img.bitmap[i] + 0.587 * img.bitmap[i + 1] + 0.114 * img.bitmap[i + 2];
}

Deno.test('однотонная подложка распознаётся, фото — нет', () => {
  assertEquals(analyzeLogo(phoneScreenshotLogo()).kind, 'solid');
  assertEquals(analyzeLogo(photo()).kind, 'photo');

  const png = new Image(200, 200);
  rect(png, 50, 50, 100, 100, [200, 30, 30, 255]);
  assertEquals(analyzeLogo(png).kind, 'transparent');
});

Deno.test('поля обрезаются: от скриншота остаётся только знак', () => {
  const logo = prepareLogo(phoneScreenshotLogo());
  assert(logo);
  assertEquals([logo.width, logo.height], [100, 100]);
});

Deno.test('фото вместо логотипа не накладываем', async () => {
  const base = await solid(1024, 1024, [230, 235, 240, 255]).encodeJPEG(90);
  const out = await applyLogo(base, await photo().encode(), 'bottom-right');
  assertEquals(out, null);
});

Deno.test('знак, сливающийся с фоном, перекрашивается — а не превращается в сплошной квадрат', async () => {
  // Раньше тёмный логотип на тёмном кадре заливался светлым целиком,
  // вместе с подложкой, и в углу поста появлялся серый прямоугольник.
  const logoImg = solid(600, 600, [0, 0, 0, 255]);
  rect(logoImg, 200, 200, 200, 200, [90, 90, 90, 255]);
  const base = await solid(1024, 1024, [60, 60, 60, 255]).encodeJPEG(95);

  const out = await Image.decode((await applyLogo(base, await logoImg.encode(), 'bottom-right'))!);
  const pad = Math.round(1024 * 0.04);
  // Знак квадратный: сторона — 14% кадра.
  const side = Math.round(1024 * 0.14);
  const cx = 1024 - pad - side / 2;
  const cy = 1024 - pad - side / 2;

  assert(luminanceAt(out, Math.round(cx), Math.round(cy)) > 180, 'знак должен стать светлым');
  // Сразу за краем знака — снова тёмный кадр, никакой подложки.
  assert(luminanceAt(out, 1024 - pad - side - 12, Math.round(cy)) < 100, 'вокруг знака не должно быть заливки');
});

Deno.test('уменьшение усредняет, а не выбрасывает пиксели', () => {
  // Шахматка из однопиксельных клеток: «ближайший сосед» оставит чистый
  // чёрный или белый, усреднение — ровный серый.
  const img = new Image(64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const v = (x + y) % 2 ? 255 : 0;
      img.bitmap.set([v, v, v, 255], (y * 64 + x) * 4);
    }
  }
  const small = resizeArea(img, 8, 8);
  for (let i = 0; i < small.bitmap.length; i += 4) {
    assert(Math.abs(small.bitmap[i] - 128) < 3, `пиксель ${i / 4}: ${small.bitmap[i]}`);
  }
});
