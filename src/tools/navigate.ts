import { z } from 'zod';
import { DEFAULT_NAV_TIMEOUT_MS, httpUrlSchema, jsonContent, sessionIdSchema } from './utils.js';
import type { ToolDefinition } from './types.js';

const inputSchema = {
  sessionId: sessionIdSchema,
  url: httpUrlSchema.describe('Absolute URL to open in the session page.'),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(120000)
    .optional()
    .describe(`Navigation timeout in milliseconds (default ${DEFAULT_NAV_TIMEOUT_MS}).`),
  waitUntil: z
    .enum(['load', 'domcontentloaded', 'networkidle', 'commit'])
    .default('load')
    .describe("Navigation completion condition (default 'load')."),
};

export const navigateTool: ToolDefinition<typeof inputSchema> = {
  name: 'navigate',
  title: 'Navigate',
  description:
    'Opens a URL in the session page and waits for it to load. Returns the final URL, page ' +
    'title, HTTP status, the session headless mode, and the hex pageId assigned to this URL ' +
    'for audit tracking.',
  inputSchema,
  tier: 'free',
  handler: async (args, context) => {
    const page = context.session.page;
    const response = await page.goto(args.url, {
      waitUntil: args.waitUntil,
      timeout: args.timeoutMs ?? DEFAULT_NAV_TIMEOUT_MS,
    });
    const pageId = context.session.pageStore.record(page.url()).id;
    return jsonContent({
      actionId: context.actionId,
      url: page.url(),
      title: await page.title(),
      status: response ? response.status() : null,
      headless: context.session.headless,
      pageId,
    });
  },
};
