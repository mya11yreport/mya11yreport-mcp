import { z } from 'zod';
import {
  CONTRAST_THRESHOLDS,
  contrastRatio,
  formatRatio,
  gradeContrast,
  isLargeText,
  normalizeHex,
} from '../contrastMath.js';
import { jsonContent } from './utils.js';
import type { ToolContext, ToolDefinition } from './types.js';

const inputSchema = {
  foreground: z.string().min(1).describe('Foreground (text) color. Accepts hex (#RGB/#RRGGBB) or rgb()/rgba().'),
  background: z.string().min(1).describe('Background color. Accepts hex (#RGB/#RRGGBB) or rgb()/rgba().'),
  fontSizePx: z
    .number()
    .positive()
    .optional()
    .describe('Optional font size in CSS pixels; used with fontWeight to classify WCAG large text.'),
  fontWeight: z
    .union([z.string(), z.number()])
    .optional()
    .describe('Optional font weight (e.g. 700 or "bold"); used with fontSizePx to classify WCAG large text.'),
};

export const checkColorContrastTool: ToolDefinition<typeof inputSchema, ToolContext> = {
  name: 'check_color_contrast',
  title: 'Check color contrast',
  description:
    'Computes the WCAG 2.2 contrast ratio between two colors and which of the four AA/AAA ' +
    'thresholds they clear. Accepts hex or rgb()/rgba() colors. Needs no session and no browser. ' +
    'Pass fontSizePx and fontWeight to also classify the pair as WCAG large text.',
  inputSchema,
  tier: 'free',
  resolveSession: false,
  handler: async (args, context) => {
    const foreground = normalizeHex(args.foreground);
    const background = normalizeHex(args.background);
    if (!foreground || !background) {
      throw new Error(
        `Unparseable color (foreground: ${JSON.stringify(args.foreground)}, ` +
          `background: ${JSON.stringify(args.background)}). Use hex like "#099250" or "rgb(9, 146, 80)".`,
      );
    }

    const ratio = contrastRatio(foreground, background)!;
    const largeText = isLargeText(args.fontSizePx, args.fontWeight);

    return jsonContent({
      actionId: context.actionId,
      foreground,
      background,
      ratio,
      formatted: formatRatio(ratio),
      grades: gradeContrast(ratio),
      thresholds: CONTRAST_THRESHOLDS,
      isLargeText: largeText,
    });
  },
};
