import { z } from 'zod';
import { resolveLocator, locatorTargetSchema } from '../session/locator.js';
import { DEFAULT_ACTION_TIMEOUT_MS, jsonContent, sessionIdSchema } from './utils.js';
import type { ToolDefinition } from './types.js';

const inputSchema = {
  sessionId: sessionIdSchema,
  target: locatorTargetSchema,
  text: z.string().describe('Text to type into the element.'),
  clear: z
    .boolean()
    .default(true)
    .describe('true (default) replaces the current value (fill). false appends keystroke-by-keystroke (pressSequentially).'),
  pressEnter: z.boolean().default(false).describe('Press Enter after typing (e.g. to submit).'),
  timeoutMs: z
    .number()
    .int()
    .min(500)
    .max(120000)
    .optional()
    .describe(`Action timeout in milliseconds (default ${DEFAULT_ACTION_TIMEOUT_MS}).`),
};

export const typeTool: ToolDefinition<typeof inputSchema> = {
  name: 'type',
  title: 'Type text',
  description:
    'Types text into an element (input, textarea, contenteditable). By default replaces the ' +
    'current value; set clear:false to append. Targets support selectors or getBy* locators.',
  inputSchema,
  tier: 'free',
  handler: async (args, context) => {
    const locator = resolveLocator(context.session.page, args.target);
    const timeout = args.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS;
    if (args.clear) {
      await locator.fill(args.text, { timeout });
    } else {
      await locator.pressSequentially(args.text, { timeout });
    }
    if (args.pressEnter) {
      await locator.press('Enter', { timeout });
    }
    return jsonContent({
      actionId: context.actionId,
      typed: true,
      clear: args.clear,
      pressEnter: args.pressEnter,
      url: context.session.page.url(),
    });
  },
};
