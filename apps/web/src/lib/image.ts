const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 1280;

export class ImageError extends Error {}

export async function compressImageFile(file: File): Promise<string> {
  if (!ACCEPTED.includes(file.type)) {
    throw new ImageError('Choose a JPEG, PNG or WebP photo.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageError('That photo is larger than 15 MB. Try a smaller one.');
  }
  if (file.size < 1024) {
    throw new ImageError('That file looks empty. Try another photo.');
  }

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new ImageError('Your browser could not process this image.');
  context.drawImage(bitmap, 0, 0, width, height);
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  if (dataUrl.length > 7_500_000) throw new ImageError('The compressed photo is still too large. Try another image.');
  return dataUrl;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to the <img> path (Safari older versions)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new ImageError('This image could not be read.'));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Math.floor((base64.length * 3) / 4);
}
