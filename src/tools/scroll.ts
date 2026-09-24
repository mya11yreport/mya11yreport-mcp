import { z } from 'zod';
import { jsonContent, sessionIdSchema } from './utils.js';
import type { ToolDefinition } from './types.js';

const scrollBySchema = {
  sessionId: sessionIdSchema,
  x: z.number().int().optional().describe('Horizontal scroll delta in pixels (negative scrolls left). Default 0.'),
  y: z.number().int().optional().describe('Vertical scroll delta in pixels (negative scrolls up). Default 0.'),
  behavior: z
    .enum(['auto', 'instant', 'smooth'])
    .default('auto')
    .describe("Scroll behavior (default 'auto')."),
};

const querySchema = {
  sessionId: sessionIdSchema,
};

export const scrollByTool: ToolDefinition<typeof scrollBySchema> = {
  name: 'scroll_by',
  title: 'Scroll page',
  description:
    'Scrolls the session page window by the given deltas (window.scrollBy) and returns the new ' +
    'scroll position. For lazy-loaded content, scroll then re-run get_page_snapshot.',
  inputSchema: scrollBySchema,
  tier: 'free',
  handler: async (args, context) => {
    const position = await context.session.page.evaluate(
      ({ x, y, behavior }) => {
        window.scrollBy({ left: x, top: y, behavior });
        return { scrollX: window.scrollX, scrollY: window.scrollY };
      },
      { x: args.x ?? 0, y: args.y ?? 0, behavior: args.behavior },
    );
    return jsonContent({ actionId: context.actionId, ...position });
  },
};

export const getScrollPositionTool: ToolDefinition<typeof querySchema> = {
  name: 'get_scroll_position',
  title: 'Get scroll position',
  description:
    'Returns the current scroll position of the session page plus document scroll dimensions ' +
    'and the viewport size — useful for planning further scroll_by deltas.',
  inputSchema: querySchema,
  tier: 'free',
  handler: async (args, context) => {
    const page = context.session.page;
    const info = await page.evaluate(() => ({
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    return jsonContent({ actionId: context.actionId, viewport: page.viewportSize(), ...info });
  },
};

export const getViewportSizeTool: ToolDefinition<typeof querySchema> = {
  name: 'get_viewport_size',
  title: 'Get viewport size',
  description: "Returns the session page's viewport size in CSS pixels.",
  inputSchema: querySchema,
  tier: 'free',
  handler: async (args, context) => {
    return jsonContent({ actionId: context.actionId, ...context.session.page.viewportSize() });
  },
};
