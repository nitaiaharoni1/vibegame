import { describe, expect, it } from 'vitest';
import { mimeFromDataUrl, parseDataUrl } from '../data-url.js';

describe('parseDataUrl', () => {
  it('splits mime and base64', () => {
    const p = parseDataUrl('data:image/png;base64,QUJD');
    expect(p).toEqual({ mimeType: 'image/png', base64: 'QUJD' });
  });

  it('takes mime before first semicolon (charset)', () => {
    const p = parseDataUrl('data:image/svg+xml;charset=UTF-8;base64,PHN2Zz4KPC9zdmc+');
    expect(p?.mimeType).toBe('image/svg+xml');
    expect(p?.base64).toBe('PHN2Zz4KPC9zdmc+');
  });

  it('returns null for invalid input', () => {
    expect(parseDataUrl('not-data')).toBeNull();
    expect(parseDataUrl('data:nocomma')).toBeNull();
  });
});

describe('mimeFromDataUrl', () => {
  it('reads mime before first semicolon', () => {
    expect(mimeFromDataUrl('data:image/webp;base64,xxx')).toBe('image/webp');
  });
});
