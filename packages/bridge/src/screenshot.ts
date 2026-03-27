export interface ScreenshotOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** 'canvas' captures only the <canvas> element (default). 'viewport' captures the full page including DOM overlays. */
  mode?: 'canvas' | 'viewport';
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
  const opts: ScreenshotOptions = typeof options === 'number' ? { quality: options } : options;
  const { maxWidth, maxHeight } = opts;

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

  // Use PNG for broad MCP client compatibility (WebP decoding not universally supported)
  const dataUrl = source.toDataURL('image/png');

  return { dataUrl, width: source.width, height: source.height };
}

/**
 * Capture the full viewport including DOM overlays on top of the game canvas.
 *
 * Uses html2canvas to render the page, but first captures the game canvas ourselves
 * (handles WebGL canvases where html2canvas's drawImage would return blank) and
 * injects that capture into the cloned DOM so the final image is correct.
 */
export async function captureViewport(
  canvas: HTMLCanvasElement | null,
  options: ScreenshotOptions = {},
): Promise<ScreenshotResult> {
  const { maxWidth, maxHeight } = options;

  const gameCanvas = canvas ?? findCanvas();

  // Capture the game canvas ourselves before html2canvas clones the DOM.
  // WebGL canvases need toDataURL called in the same frame as the last render,
  // and html2canvas cannot reliably do this.
  let canvasDataUrl: string | null = null;
  if (gameCanvas !== null) {
    try {
      canvasDataUrl = gameCanvas.toDataURL('image/png');
    } catch {
      // Canvas tainted or unavailable — html2canvas will do its best
    }
  }

  const html2canvas = (await import('html2canvas')).default;

  const result = await html2canvas(document.body, {
    useCORS: true,
    allowTaint: true,
    backgroundColor: null,
    // Swap the game canvas for a static <img> in the cloned DOM so that
    // html2canvas doesn't try (and fail) to read a WebGL canvas.
    onclone: (clonedDoc: Document) => {
      if (canvasDataUrl === null || gameCanvas === null) return;
      const clonedCanvas = clonedDoc.querySelector('canvas');
      if (clonedCanvas === null) return;

      const img = clonedDoc.createElement('img');
      img.src = canvasDataUrl;
      // Preserve the exact layout dimensions
      img.style.cssText = window.getComputedStyle(gameCanvas).cssText;
      img.style.width = `${gameCanvas.offsetWidth}px`;
      img.style.height = `${gameCanvas.offsetHeight}px`;
      img.style.display = 'block';
      clonedCanvas.parentElement?.replaceChild(img, clonedCanvas);
    },
  });

  // Downscale if requested
  let source: HTMLCanvasElement = result;
  const needsScale =
    (maxWidth !== undefined && result.width > maxWidth) ||
    (maxHeight !== undefined && result.height > maxHeight);
  if (needsScale) {
    const scale = Math.min(
      maxWidth !== undefined ? maxWidth / result.width : 1,
      maxHeight !== undefined ? maxHeight / result.height : 1,
    );
    const w = Math.round(result.width * scale);
    const h = Math.round(result.height * scale);
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d');
    if (ctx !== null) {
      ctx.drawImage(result, 0, 0, w, h);
      source = offscreen;
    }
  }

  const dataUrl = source.toDataURL('image/png');
  return { dataUrl, width: source.width, height: source.height };
}

export function findCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector('canvas');
}
