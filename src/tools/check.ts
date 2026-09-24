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

export const checkTool: ToolDefinition<typeof inputSchema> = {
  name: 'check',
  title: 'Check checkbox/radio',
  description:
    'Checks a checkbox or radio input in the session page. No-op if already checked. Targets ' +
    'support selectors or getBy* locators (e.g. getByRole with name).',
  inputSchema,
  tier: 'free',
  handler: async (args, context) => {
    const locator = resolveLocator(context.session.page, args.target);
    await locator.check({ timeout: args.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS });
    return jsonContent({
      actionId: context.actionId,
      checked: true,
      url: context.session.page.url(),
    });
  },
};

export const uncheckTool: ToolDefinition<typeof inputSchema> = {
  name: 'uncheck',
  title: 'Uncheck checkbox',
  description: 'Unchecks a checkbox in the session page. No-op if already unchecked.',
  inputSchema,
  tier: 'free',
  handler: async (args, context) => {
    const locator = resolveLocator(context.session.page, args.target);
    await locator.uncheck({ timeout: args.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS });
    return jsonContent({
      actionId: context.actionId,
      checked: false,
      url: context.session.page.url(),
    });
  },
};
