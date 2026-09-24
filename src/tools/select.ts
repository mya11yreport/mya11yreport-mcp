import { z } from 'zod';
import { resolveLocator, locatorTargetSchema } from '../session/locator.js';
import { DEFAULT_ACTION_TIMEOUT_MS, jsonContent, sessionIdSchema } from './utils.js';
import type { ToolDefinition } from './types.js';

const inputSchema = {
  sessionId: sessionIdSchema,
  target: locatorTargetSchema,
  value: z
    .string()
    .describe("The option to select, matched against the <option>'s value attribute."),
  timeoutMs: z
    .number()
    .int()
    .min(500)
    .max(120000)
    .optional()
    .describe(`Action timeout in milliseconds (default ${DEFAULT_ACTION_TIMEOUT_MS}).`),
};

export const selectOptionTool: ToolDefinition<typeof inputSchema> = {
  name: 'select_option',
  title: 'Select option',
  description:
    "Selects an <option> inside a <select> element on the session page, matched by the option's " +
    "value attribute. Waits for the element to be actionable. Targets support selectors or " +
    'getBy* locators, same as type.',
  inputSchema,
  tier: 'free',
  handler: async (args, context) => {
    const locator = resolveLocator(context.session.page, args.target);
    await locator.selectOption(args.value, { timeout: args.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS });
    return jsonContent({
      actionId: context.actionId,
      selected: args.value,
      url: context.session.page.url(),
    });
  },
};
