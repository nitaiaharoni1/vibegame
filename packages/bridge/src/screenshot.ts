export interface ScreenshotOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface ScreenshotResult {
  dataUrl: string;
  width: number;
  height: number;
}

export function captureScreenshot(
  canvas: HTMLCanvasElement | null,
  options: ScreenshotOptions | number = {},
): ScreenshotResult {
  // Accept legacy numeric quality arg for backwards compat
  const opts: ScreenshotOptions = typeof options === 'number' ? { quality: options } : options;
  const { quality = 0.85, maxWidth, maxHeight } = opts;

  const target = canvas ?? findCanvas();
  if (target === null) {
    throw new Error('No canvas element found for screenshot');
  }

  // Downscale if the canvas exceeds requested dimensions
  let source: HTMLCanvasElement = target;
  const needsScale =
    (maxWidth !== undefined && target.width > maxWidth) ||
    (maxHeight !== undefined && target.height > maxHeight);
  if (needsScale) {
    const scale = Math.min(
      maxWidth !== undefined ? maxWidth / target.width : 1,
      maxHeight !== undefined ? maxHeight / target.height : 1,
    );
    const w = Math.round(target.width * scale);
    const h = Math.round(target.height * scale);
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d');
    if (ctx !== null) {
      ctx.drawImage(target, 0, 0, w, h);
      source = offscreen;
    }
  }

  // WebP is ~40-50% smaller than JPEG at same quality; fall back to JPEG if unsupported
  let dataUrl = source.toDataURL('image/webp', quality);
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = source.toDataURL('image/jpeg', quality);
  }

  return { dataUrl, width: source.width, height: source.height };
}

export function findCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector('canvas');
}
