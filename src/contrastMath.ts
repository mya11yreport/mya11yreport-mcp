/**
 * Canonical WCAG 2.2 contrast maths for this server, kept dependency-free so the
 * published package stays self-contained (dist/ + package.json only).
 *
 * Note the linearisation cutoff is 0.04045, not the 0.03928 printed in the WCAG
 * text — that figure is a known erratum; axe-core and colorjs.io both use
 * 0.04045.
 */

export const CONTRAST_THRESHOLDS = {
  aaNormal: 4.5,
  aaLarge: 3,
  aaaNormal: 7,
  aaaLarge: 4.5,
} as const;

/** WCAG's large-text definition: >= 24px, or >= 18.66px when bold. */
export const LARGE_TEXT_PX = 24;
export const LARGE_TEXT_BOLD_PX = 18.66;
export const BOLD_WEIGHT = 700;

/** "rgb(9, 146, 80)" / "#099250" / "#FFF" / "099250" -> "#099250". Null if unparseable. */
export function normalizeHex(color: string | null | undefined): string | null {
  if (!color) return null;
  const trimmed = String(color).trim();

  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(trimmed);
  if (rgb) {
    const [, r, g, b] = rgb;
    return '#' + [r, g, b].map((part) => Number(part).toString(16).padStart(2, '0')).join('');
  }

  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (!hex) return null;
  const digits =
    hex[1].length === 3
      ? hex[1]
          .split('')
          .map((d) => d + d)
          .join('')
      : hex[1];
  return '#' + digits.toLowerCase();
}

function relativeLuminance(hex: string): number {
  const value = parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * WCAG 2.2 contrast ratio between two colors, 1 to 21. Returns null if either
 * color is unparseable, so callers can distinguish "no contrast" from "no answer".
 */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = normalizeHex(foreground);
  const bg = normalizeHex(background);
  if (!fg || !bg) return null;

  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

export function isLargeText(
  fontSizePx: number | null | undefined,
  fontWeight: number | string | null | undefined,
): boolean {
  if (fontSizePx == null || Number.isNaN(fontSizePx)) return false;
  const numeric = typeof fontWeight === 'number' ? fontWeight : parseFloat(String(fontWeight));
  const bold =
    String(fontWeight).toLowerCase() === 'bold' || (!Number.isNaN(numeric) && numeric >= BOLD_WEIGHT);
  return fontSizePx >= LARGE_TEXT_PX || (bold && fontSizePx >= LARGE_TEXT_BOLD_PX);
}

export interface ContrastGrades {
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
}

/** Which of the four WCAG bars a ratio clears. */
export function gradeContrast(ratio: number): ContrastGrades {
  return {
    aaNormal: ratio >= CONTRAST_THRESHOLDS.aaNormal,
    aaLarge: ratio >= CONTRAST_THRESHOLDS.aaLarge,
    aaaNormal: ratio >= CONTRAST_THRESHOLDS.aaaNormal,
    aaaLarge: ratio >= CONTRAST_THRESHOLDS.aaaLarge,
  };
}

/** Ratios are conventionally quoted to two decimals, truncated rather than rounded up. */
export function formatRatio(ratio: number): string {
  return `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
}
