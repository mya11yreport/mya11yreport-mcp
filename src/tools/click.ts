import { z } from 'zod';
import { resolveLocator, locatorTargetSchema } from '../session/locator.js';
import { DEFAULT_ACTION_TIMEOUT_MS, jsonContent, sessionIdSchema } from './utils.js';
import type { ToolDefinition } from './types.js';

const inputSchema = {
  sessionId: sessionIdSchema,
  target: locatorTargetSchema,
  timeoutMs: z
    .number()
    .int()
    .min(500)
    .max(120000)
    .optional()
    .describe(`Action timeout in milliseconds (default ${DEFAULT_ACTION_TIMEOUT_MS}).`),
};

export const clickTool: ToolDefinition<typeof inputSchema> = {
  name: 'click',
  title: 'Click element',
  description:
    'Clicks an element in the session page. Auto-waits for the element to be visible, stable, and ' +
    'actionable. Targets support CSS selectors or accessibility-first locators (getByRole, ' +
    'getByText, getByLabel, ...).',
  inputSchema,
  tier: 'free',
  handler: async (args, context) => {
    const locator = resolveLocator(context.session.page, args.target);
    await locator.click({ timeout: args.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS });
    return jsonContent({
      actionId: context.actionId,
      clicked: true,
      url: context.session.page.url(),
    });
  },
};
