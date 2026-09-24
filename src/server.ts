import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SharedBrowser } from './session/browser.js';
import { capValue, extractPayload, type ActionEntry } from './session/actionLog.js';
import { hexId } from './session/pageStore.js';
import { SessionManager, type SessionEntry } from './session/sessionManager.js';
import { SERVER_INSTRUCTIONS } from './instructions.js';
import { logger } from './logger.js';
import { toolRegistry } from './tools/index.js';
import type { ToolContext } from './tools/types.js';

const SERVER_NAME = 'mya11y-audit';
const SERVER_VERSION = '2.0.0';

const HINTS: Array<[RegExp, string]> = [
  [/Timeout \d+ms exceeded|timed out/i, ' The element was not found/actionable in time, or the page did not load. Try get_page_snapshot to discover targets, or retry with a larger timeoutMs.'],
  [/ERR_NAME_NOT_RESOLVED/, ' DNS lookup failed — check the URL hostname.'],
  [/ERR_CONNECTION_REFUSED/, ' The host refused the connection.'],
  [/ERR_FILE_NOT_FOUND/, ' file:// path does not exist — check the path.'],
  [/Failed to launch|Executable doesn't exist/, ' Run `mya11yreport-mcp install chromium` to install the browser.'],
];

function toErrorResult(error: unknown): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  const message = error instanceof Error ? error.message : String(error);
  const hint = HINTS.find(([pattern]) => pattern.test(message))?.[1] ?? '';
  logger.error(`Tool call failed: ${message}`);
  return {
    content: [{ type: 'text', text: `Action failed: ${message}.${hint}` }],
    isError: true,
  };
}

/**
 * Transport-agnostic server factory. index.ts owns the stdio transport; a
 * future hosted server can reuse this with a streamable-HTTP transport and
 * different session/browsing backends.
 *
 * Uniform per-call pipeline for every registered tool: hex actionId ->
 * session resolution -> queued execution -> action logged to the session's
 * history file -> errors mapped to helpful MCP error results.
 */
export function createServer(): { server: McpServer; close: () => Promise<void> } {
  const browser = new SharedBrowser();
  const sessionManager = new SessionManager(browser);

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  for (const definition of toolRegistry) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
        _meta: { tier: definition.tier },
      },
      async (rawArgs) => {
        const args = (rawArgs ?? {}) as { sessionId?: unknown };
        const actionId = hexId();
        const startedAt = Date.now();
        let entry: SessionEntry | undefined;
        try {
          if (definition.resolveSession === false) {
            // Session-lifecycle tools (start_session/close_session) run
            // without a resolved session and log nothing to a history file.
            const context: ToolContext = { sessionManager, logger, actionId };
            return await definition.handler(rawArgs, context);
          }
          const sessionId = typeof args.sessionId === 'string' ? args.sessionId.trim() : '';
          if (!sessionId) {
            throw new Error(
              'Missing required sessionId — call start_session first, then pass the returned sessionId.',
            );
          }
          entry = await sessionManager.resolve(sessionId);
          const session = entry;
          const context: ToolContext = { session, sessionManager, logger, actionId };
          const result = await sessionManager.run(session, async () => {
            // Stop the idle timer while this action runs.
            sessionManager.clearIdleTimer(session);
            return definition.handler(rawArgs, context);
          });
          session.actionLog.append({
            id: actionId,
            at: new Date(startedAt).toISOString(),
            tool: definition.name,
            ms: Date.now() - startedAt,
            args: capValue(rawArgs, 2_000),
            ok: true,
            result: capValue(extractPayload(result), 64 * 1024),
            url: session.page.url(),
          });
          await session.actionLog.flush();
          return result;
        } catch (error) {
          if (entry) {
            const failed: ActionEntry = {
              id: actionId,
              at: new Date(startedAt).toISOString(),
              tool: definition.name,
              ms: Date.now() - startedAt,
              args: capValue(rawArgs, 2_000),
              ok: false,
              error: error instanceof Error ? error.message : String(error),
              url: entry.page.url(),
            };
            entry.actionLog.append(failed);
            await entry.actionLog.flush().catch(() => undefined);
          }
          return toErrorResult(error);
        } finally {
          // Re-arm the idle-close timer after every action (success or failure).
          if (entry) sessionManager.armIdleClose(entry);
        }
      },
    );
  }

  return {
    server,
    close: () => sessionManager.closeAll(),
  };
}
