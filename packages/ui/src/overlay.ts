let overlayElement: HTMLElement | null = null;

export function getOrCreateOverlay(): HTMLElement {
  if (overlayElement) return overlayElement;
  if (typeof document === 'undefined') throw new Error('DOM not available');

  const el = document.createElement('div');
  el.id = 'vigame-ui-overlay';
  el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;';
  document.body.appendChild(el);
  overlayElement = el;
  return el;
}

export function clearOverlay(): void {
  if (overlayElement) {
    overlayElement.innerHTML = '';
  }
}

export function removeOverlay(): void {
  overlayElement?.remove();
  overlayElement = null;
}

// Simple reactive HTML panel
export class UIPanel {
  private el: HTMLElement;

  constructor(id: string, css?: string) {
    if (typeof document === 'undefined') {
      this.el = {} as HTMLElement; // stub for SSR/Node
      return;
    }
    const overlay = getOrCreateOverlay();
    let existing = overlay.querySelector<HTMLElement>(`#${id}`);
    if (!existing) {
      existing = document.createElement('div');
      existing.id = id;
      overlay.appendChild(existing);
    }
    this.el = existing;
    if (css) this.el.style.cssText += css;
  }

  setHTML(html: string): void {
    if (typeof document === 'undefined') return;
    if (this.el.innerHTML !== html) this.el.innerHTML = html;
  }

  setVisible(visible: boolean): void {
    if (typeof document === 'undefined') return;
    this.el.style.display = visible ? '' : 'none';
  }

  remove(): void {
    if (typeof document === 'undefined') return;
    this.el.remove();
  }
}
