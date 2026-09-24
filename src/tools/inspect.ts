import { join } from 'node:path';
import { z } from 'zod';
import { jsonContent, sessionIdSchema } from './utils.js';
import type { ToolDefinition } from './types.js';

const inputSchema = {
  sessionId: sessionIdSchema,
};

export const screenshotTool: ToolDefinition<typeof inputSchema> = {
  name: 'screenshot',
  title: 'Take screenshot',
  description:
    'Captures the current viewport of the session page (what is on screen after scrolling — not ' +
    'the full page). Saved as <actionId>.png inside the session log directory; returns the file ' +
    'path plus the scroll position and viewport at capture time.',
  inputSchema,
  tier: 'free',
  handler: async (args, context) => {
    const page = context.session.page;
    const path = join(context.session.actionLog.dir, `${context.actionId}.png`);
    await page.screenshot({ path, type: 'png', fullPage: false });
    const scroll = await page.evaluate(() => ({ scrollX: window.scrollX, scrollY: window.scrollY }));
    return jsonContent({
      actionId: context.actionId,
      path,
      url: page.url(),
      ...scroll,
      viewport: page.viewportSize(),
    });
  },
};

export const getPageSnapshotTool: ToolDefinition<typeof inputSchema> = {
  name: 'get_page_snapshot',
  title: 'Get page snapshot',
  description:
    'Returns a YAML accessibility-tree snapshot of the session page (roles, names, states). Use ' +
    'it to discover roles/names to target with getByRole/getByText/getByLabel in click/type/check.',
  inputSchema,
  tier: 'free',
  handler: async (args, context) => {
    const page = context.session.page;
    const snapshot = await page.locator('html').ariaSnapshot();
    return jsonContent({ actionId: context.actionId, url: page.url(), snapshot });
  },
};
