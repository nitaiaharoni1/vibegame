/**
 * Computes the visual difference between two screenshot data URLs.
 * Returns a value from 0 (identical) to 1 (completely different).
 */
export async function frameDiff(prevDataUrl: string, currDataUrl: string): Promise<number> {
  if (prevDataUrl === '' || currDataUrl === '') return 1;

  const size = 64;
  const [prevPixels, currPixels] = await Promise.all([
    getPixelData(prevDataUrl, size),
    getPixelData(currDataUrl, size),
  ]);

  if (prevPixels === null || currPixels === null) return 1;

  let totalDiff = 0;
  const pixelCount = size * size;

  for (let i = 0; i < prevPixels.length; i += 4) {
    // Compare RGB channels, ignore alpha
    totalDiff += Math.abs((prevPixels[i] ?? 0) - (currPixels[i] ?? 0));
    totalDiff += Math.abs((prevPixels[i + 1] ?? 0) - (currPixels[i + 1] ?? 0));
    totalDiff += Math.abs((prevPixels[i + 2] ?? 0) - (currPixels[i + 2] ?? 0));
  }

  // Mean absolute difference across all RGB channels, normalized to [0, 1]
  return totalDiff / (pixelCount * 3 * 255);
}

async function getPixelData(dataUrl: string, size: number): Promise<Uint8ClampedArray | null> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return null;

    const img = new Image();
    // Must await load — drawImage on an unloaded image draws nothing
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image load failed'));
      img.src = dataUrl;
    });

    ctx.drawImage(img, 0, 0, size, size);
    return ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null;
  }
}
