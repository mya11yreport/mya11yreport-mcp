import { z } from 'zod';
import { resolveLocator, locatorTargetSchema } from '../session/locator.js';
import { DEFAULT_ACTION_TIMEOUT_MS, jsonContent, sessionIdSchema } from './utils.js';
import type { ToolDefinition } from './types.js';

const inputSchema = {
  sessionId: sessionIdSchema,
  key: z
    .string()
    .min(1)
    .describe(
      'Key or chord to press, using Playwright key names: "Enter", "Tab", "Escape", "ArrowDown", ' +
        '"Space", "Shift+Tab", "Control+A", "Meta+Enter", "F1", "Backspace", "PageDown". To type a ' +
        'literal character use "type" instead.',
    ),
  target: locatorTargetSchema
    .optional()
    .describe(
      'Optional element to focus first and send the key to (Playwright locator.press). Omit to send ' +
        'the key to the page\'s currently focused element (page.keyboard.press).',
    ),
  timeoutMs: z
    .number()
    .int()
    .min(500)
    .max(120000)
    .optional()
    .describe(`Action timeout in milliseconds when a target is given (default ${DEFAULT_ACTION_TIMEOUT_MS}).`),
};

export const pressKeyTool: ToolDefinition<typeof inputSchema> = {
  name: 'press_key',
  title: 'Press key',
  description:
    'Presses a key or chord (Enter, Tab, Escape, arrows, Space, Shift+Tab, Control+A, ...) in the ' +
    'session page. With a target, focuses that element and sends the key to it; without one, sends ' +
    'the key to the currently focused element. Use it for keyboard navigation, submitting a form ' +
    'with Enter, closing a dialog with Escape, or exercising keyboard-only interactions.',
  inputSchema,
  tier: 'free',
  handler: async (args, context) => {
    const page = context.session.page;
    const timeout = args.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS;

    if (args.target) {
      const locator = resolveLocator(page, args.target);
      await locator.press(args.key, { timeout });
    } else {
      await page.keyboard.press(args.key);
    }

    return jsonContent({
      actionId: context.actionId,
      pressed: args.key,
      target: args.target ?? null,
      url: page.url(),
    });
  },
};
