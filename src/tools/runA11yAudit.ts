import { z } from 'zod';
import { AxeBuilder } from '@axe-core/playwright';
import { summarizeAxeResults } from '../audit/results.js';
import { DEFAULT_NAV_TIMEOUT_MS, httpUrlSchema, jsonContent, sessionIdSchema } from './utils.js';
import type { ToolDefinition } from './types.js';

const inputSchema = {
  sessionId: sessionIdSchema,
  url: httpUrlSchema
    .optional()
    .describe('Optional URL to navigate to before auditing. Omit to audit the current session page.'),
  detail: z
    .enum(['summary', 'full'])
    .default('summary')
    .describe(
      "'summary' returns violation details plus rule counts (default). " +
        "'full' additionally embeds the complete raw axe-core JSON report inside each audit entry.",
    ),
  tags: z
    .array(z.string())
    .optional()
    .describe('Optional axe-core rule tag filters, e.g. ["wcag2a", "wcag2aa"]. Defaults to all rules.'),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(120000)
    .optional()
    .describe(`Page-load timeout in milliseconds when url is given (default ${DEFAULT_NAV_TIMEOUT_MS}).`),
};

export const runA11yAuditTool: ToolDefinition<typeof inputSchema> = {
  name: 'run_a11y_audit',
  title: 'Run accessibility audit',
  description:
    'Runs an axe-core accessibility audit on the session page (or on url if provided, navigating ' +
    'first). Returns the session audit history: pages (hex ids, one per URL) and audits ' +
    '({pageId, audit} entries) including the fresh result. Each audit contains violation counts ' +
    'by impact, per-violation details (rule id, help, selectors, failure summaries), and ' +
    'pass/incomplete rule counts.',
  inputSchema,
  tier: 'free',
  handler: async (args, context) => {
    const page = context.session.page;
    if (args.url) {
      await page.goto(args.url, {
        waitUntil: 'networkidle',
        timeout: args.timeoutMs ?? DEFAULT_NAV_TIMEOUT_MS,
      });
    }
    let builder = new AxeBuilder({ page });
    if (args.tags && args.tags.length > 0) {
      builder = builder.withTags(args.tags);
    }
    const results = await builder.analyze();
    const summary = summarizeAxeResults(results, {
      includeRaw: args.detail === 'full',
      maxNodesPerViolation: 5,
      tags: args.tags ?? [],
    });
    context.session.pageStore.appendAudit(page.url(), summary);
    return jsonContent({
      actionId: context.actionId,
      url: page.url(),
      ...context.session.pageStore.snapshot(),
    });
  },
};
