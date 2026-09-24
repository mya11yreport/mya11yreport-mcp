import { z } from 'zod';
import { DEFAULT_HEADLESS } from '../session/browser.js';
import { jsonContent, sessionIdSchema } from './utils.js';
import type { ToolContext, ToolDefinition } from './types.js';

const IDLE_CLOSE_NOTE =
  'Sessions auto-close after 5 minutes of inactivity (MYA11Y_MCP_IDLE_CLOSE_MS overrides).';

const startSchema = {
  alias: z
    .string()
    .min(1)
    .max(225)
    .optional()
    .describe(
      'Free-form session alias (max 225 chars). Becomes the sessionId after sanitizing to ' +
        '[A-Za-z0-9_-]; omit for a generated hex id. Starting an id that already exists returns it.',
    ),
  headless: z
    .boolean()
    .default(DEFAULT_HEADLESS)
    .describe('Run the browser headless (default true) or headed (false, visible window).'),
};

export const startSessionTool: ToolDefinition<typeof startSchema, ToolContext> = {
  name: 'start_session',
  title: 'Start session',
  description:
    'Starts a browser session and returns its sessionId — pass that sessionId to every ' +
    'subsequent tool call (navigate, click, type, run_a11y_audit, ...). Each session is an ' +
    'isolated page with its own cookies, audit history, and action log. ' +
    IDLE_CLOSE_NOTE,
  inputSchema: startSchema,
  tier: 'free',
  resolveSession: false,
  handler: async (args, context) => {
    const { entry, created } = await context.sessionManager.start({
      alias: args.alias,
      headless: args.headless,
    });
    return jsonContent({
      actionId: context.actionId,
      sessionId: entry.id,
      alias: entry.alias,
      headless: entry.headless,
      created,
      logDir: entry.actionLog.dir,
    });
  },
};

const closeSchema = {
  sessionId: sessionIdSchema,
};

export const closeSessionTool: ToolDefinition<typeof closeSchema, ToolContext> = {
  name: 'close_session',
  title: 'Close session',
  description:
    "Stops a session and terminates its browser context (page state and cookies are gone; the " +
    "session's history file is finalized with a closedAt timestamp). Returns closed:false plus " +
    'the active sessions when the id is unknown. A closed session can be started again later; ' +
    'its previous history is archived, not overwritten.',
  inputSchema: closeSchema,
  tier: 'free',
  resolveSession: false,
  handler: async (args, context) => {
    const closed = await context.sessionManager.close(args.sessionId, {
      id: context.actionId,
      tool: 'close_session',
      reason: 'requested',
    });
    return jsonContent({
      actionId: context.actionId,
      closed,
      activeSessions: context.sessionManager.listSessions(),
    });
  },
};
