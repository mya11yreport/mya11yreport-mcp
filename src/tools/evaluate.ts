import { z } from 'zod';
import { jsonContent, sessionIdSchema } from './utils.js';
import type { ToolDefinition } from './types.js';

const inputSchema = {
  sessionId: sessionIdSchema,
  expression: z
    .string()
    .min(1)
    .describe(
      'JavaScript evaluated in the page context. Either a plain expression (e.g. "document.title") ' +
        'or a function/arrow-function body (e.g. "() => document.querySelectorAll(\\"a\\").length", ' +
        'or "(n) => n + 1"). Functions are invoked with `arg`; plain expressions ignore it. ' +
        'Multi-statement logic needs a function body.',
    ),
  arg: z
    .unknown()
    .optional()
    .describe(
      'Optional JSON-serializable value passed as the first argument when `expression` is a function. ' +
        'Ignored for plain expressions.',
    ),
};

export const evaluateTool: ToolDefinition<typeof inputSchema> = {
  name: 'evaluate',
  title: 'Evaluate JavaScript',
  description:
    'Evaluates a JavaScript expression or function in the session page via Playwright ' +
    'page.evaluate and returns its value. Use it to inspect the live DOM (computed styles, ' +
    'geometry, custom element state) when get_page_snapshot is not enough. The result must be ' +
    'serializable across the Playwright boundary; non-serializable or undefined values come back ' +
    'as null with serializable:false. This runs arbitrary page JavaScript — only evaluate code ' +
    'you intend to run.',
  inputSchema,
  tier: 'free',
  handler: async (args, context) => {
    const page = context.session.page;
    // Playwright's page.evaluate(string) only evaluates an expression — it never
    // invokes a function string, so an arg would be dropped. Wrap the input so a
    // plain expression returns its value while a function body is called with arg.
    const runner = new Function(
      'arg',
      `const value = (${args.expression}); return typeof value === 'function' ? value(arg) : value;`,
    );
    const raw = await page.evaluate(runner as (arg: unknown) => unknown, args.arg);

    let result = raw;
    let serializable = raw !== undefined;
    if (!serializable) {
      result = null;
    } else {
      try {
        JSON.stringify(raw);
      } catch {
        serializable = false;
        result = String(raw);
      }
    }

    return jsonContent({
      actionId: context.actionId,
      url: page.url(),
      result,
      serializable,
    });
  },
};
