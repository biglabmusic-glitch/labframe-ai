// Ужимает логотип, чтобы он влезал в квадрат targetSize×targetSize,
// СОХРАНЯЯ пропорции. Возвращает File.
//
// Раньше здесь был center-crop по короткой стороне: широкий логотип с названием
// лаборатории терял края, от 1200×300 оставался квадрат 300×300 из середины.
// Логотипы почти всегда горизонтальные, так что резать их — последнее, что
// нужно делать. Размещением в кадре занимается наложение, ему прямоугольник
// не мешает.
//
// Сохраняем тип: PNG → PNG (прозрачность не теряется), JPEG → JPEG (вес меньше).

export async function fitLogoFile(
  file: File,
  targetSize = 1024,
): Promise<File> {
  const objUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objUrl);
    const scale = Math.min(
      1,
      targetSize / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');

    // Если PNG — сохраняем прозрачность (фон не заливаем).
    // Если JPEG — заливаем белым (иначе чёрные артефакты прозрачности).
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9);
    });
    if (!blob) throw new Error('canvas.toBlob returned null');

    // Сохраняем расширение в имени, чтобы /sign-upload корректно сгенерил path.
    const ext = file.type === 'image/png' ? 'png' : 'jpg';
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'logo';
    return new File([blob], `${baseName}.${ext}`, { type: blob.type });
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}
