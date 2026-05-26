// Кропит и/или ужимает картинку до квадрата ≤ targetSize x targetSize, возвращает File.
// Используем для логотипа: даже если юзер выбрал прямоугольное фото,
// мы делаем center-crop по короткой стороне и ужимаем до 1024×1024 max.
//
// Сохраняем тип: PNG → PNG (прозрачность не теряется), JPEG → JPEG (вес меньше).

export async function cropToSquareFile(
  file: File,
  targetSize = 1024,
): Promise<File> {
  const objUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objUrl);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const size = Math.min(targetSize, side);
    const sx = Math.floor((img.naturalWidth - side) / 2);
    const sy = Math.floor((img.naturalHeight - side) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');

    // Если PNG — сохраняем прозрачность (фон не заливаем).
    // Если JPEG — заливаем белым (иначе чёрные артефакты прозрачности).
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
    }
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

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
