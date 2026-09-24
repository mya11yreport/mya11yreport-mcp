import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { devices, type BrowserContext, type Page } from 'playwright';
import { DEFAULT_HEADLESS, SharedBrowser } from './browser.js';
import { ActionLog } from './actionLog.js';
import { PageStore, hexId } from './pageStore.js';
import { logger } from '../logger.js';

const MAX_SESSIONS = 4;
const USER_AGENT_SUFFIX = '+MyA11yAuditMcp/1.0';

/**
 * Idle sessions auto-close this many milliseconds after their last action
 * (the timer is cleared at the start of every action and re-armed after it).
 * Default: 5 minutes; override with MYA11Y_MCP_IDLE_CLOSE_MS (>= 1000).
 */
const IDLE_CLOSE_MS = Math.max(1000, Number(process.env.MYA11Y_MCP_IDLE_CLOSE_MS) || 300_000);

export function sanitizeSessionId(input: string): string {
  const cleaned = input
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 225);
  return cleaned || hexId();
}

export interface SessionEntry {
  id: string;
  alias: string | null;
  headless: boolean;
  context: BrowserContext;
  page: Page;
  pageStore: PageStore;
  actionLog: ActionLog;
  lastUsedAt: number;
  idleTimer: NodeJS.Timeout | null;
}

export interface SessionInfo {
  id: string;
  alias: string | null;
  headless: boolean;
  logDir: string;
  lastUsedAt: string;
}

/**
 * Owns named sessions. Sessions are explicit: created via start() (returning
 * the id agents pass to every tool), closed via close()/idle timer/shutdown.
 * Every session is an isolated BrowserContext + page (own cookies/storage)
 * plus its own audit history and action log, all backed by one shared
 * Chromium instance per headless mode.
 */
export class SessionManager {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly queueTails = new Map<string, Promise<unknown>>();
  private readonly baseDir: string;

  constructor(private readonly browser: SharedBrowser) {
    this.baseDir =
      process.env.MYA11Y_MCP_LOG_DIR ?? join(process.cwd(), '.mya11yreport-mcp', 'logs');
  }

  listSessions(): SessionInfo[] {
    return [...this.sessions.values()].map((entry) => ({
      id: entry.id,
      alias: entry.alias,
      headless: entry.headless,
      logDir: entry.actionLog.dir,
      lastUsedAt: new Date(entry.lastUsedAt).toISOString(),
    }));
  }

  /** Returns an existing session; throws when the id is unknown. */
  async resolve(sessionId: string): Promise<SessionEntry> {
    const id = sessionId.trim();
    const existing = this.sessions.get(id);
    if (!existing) {
      const active = this.listSessions().map((session) => session.id);
      throw new Error(
        `Unknown session '${id}'. Active sessions: ${active.length > 0 ? active.join(', ') : 'none'}. ` +
          'Call start_session first.',
      );
    }
    existing.lastUsedAt = Date.now();
    return existing;
  }

  /**
   * Creates a session and returns its id. The alias (free-form, max 225
   * chars) becomes the sessionId after sanitization; omit it for a generated
   * hex id. Starting an id that already exists returns that session.
   */
  async start(options: { alias?: unknown; headless?: unknown }): Promise<{ entry: SessionEntry; created: boolean }> {
    const alias = typeof options.alias === 'string' ? options.alias.trim() : '';
    const id = alias ? sanitizeSessionId(alias) : hexId();
    const existing = this.sessions.get(id);
    if (existing) {
      existing.lastUsedAt = Date.now();
      this.clearIdleTimer(existing);
      this.armIdleClose(existing);
      return { entry: existing, created: false };
    }
    await this.evict();
    const headless = typeof options.headless === 'boolean' ? options.headless : DEFAULT_HEADLESS;
    const context = await (await this.browser.get(headless)).newContext({
      ...devices['Desktop Chrome'],
      userAgent: `${devices['Desktop Chrome'].userAgent}${USER_AGENT_SUFFIX}`,
    });
    const page = await context.newPage();
    const dir = join(this.baseDir, id);
    const pageStore = new PageStore();
    const actionLog = new ActionLog(id, dir, pageStore, { alias: alias || null, headless });
    await actionLog.init();
    const entry: SessionEntry = {
      id,
      alias: alias || null,
      headless,
      context,
      page,
      pageStore,
      actionLog,
      lastUsedAt: Date.now(),
      idleTimer: null,
    };
    this.sessions.set(id, entry);
    this.armIdleClose(entry);
    logger.info(`Session '${id}' started (headless: ${headless}, log dir: ${dir})`);
    return { entry, created: true };
  }

  /** Cancels the pending idle-close timer (called when an action begins). */
  clearIdleTimer(entry: SessionEntry): void {
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }
  }

  /** Re-arms the idle-close timer (called after each action completes). */
  armIdleClose(entry: SessionEntry): void {
    this.clearIdleTimer(entry);
    entry.idleTimer = setTimeout(() => {
      entry.idleTimer = null;
      void this.close(entry.id, {
        id: hexId(),
        tool: 'idle_close',
        reason: `idle for ${IDLE_CLOSE_MS}ms`,
      });
    }, IDLE_CLOSE_MS);
    entry.idleTimer.unref();
  }

  /**
   * Serializes actions within a session (concurrent tool calls must not
   * interleave on the same page) while leaving separate sessions in parallel.
   */
  run<T>(entry: SessionEntry, fn: () => Promise<T>): Promise<T> {
    const tail = (this.queueTails.get(entry.id) ?? Promise.resolve()).then(fn, fn);
    this.queueTails.set(entry.id, tail.catch(() => undefined));
    return tail;
  }

  /**
   * Closes a session: finalizes its history file (with closedAt) and tears
   * down the browser context. Returns false when the session doesn't exist.
   */
  async close(sessionId: string, action?: { id: string; tool: string; reason?: string }): Promise<boolean> {
    const id = sessionId.trim();
    const entry = this.sessions.get(id);
    if (!entry) return false;
    this.clearIdleTimer(entry);
    if (action) {
      entry.actionLog.append({
        id: action.id,
        at: new Date().toISOString(),
        tool: action.tool,
        ms: 0,
        ok: true,
        result: { closed: true, reason: action.reason ?? 'requested' },
        url: entry.page.url(),
      });
    }
    entry.actionLog.markClosed();
    await entry.actionLog.flush().catch(() => undefined);
    this.sessions.delete(id);
    this.queueTails.delete(id);
    await entry.context.close().catch(() => undefined);
    logger.info(`Session '${id}' closed (${action?.reason ?? 'requested'})`);
    return true;
  }

  async closeAll(): Promise<void> {
    for (const entry of this.sessions.values()) {
      this.clearIdleTimer(entry);
      entry.actionLog.markClosed();
      await entry.actionLog.flush().catch(() => undefined);
      await entry.context.close().catch(() => undefined);
    }
    this.sessions.clear();
    this.queueTails.clear();
    await this.browser.close();
  }

  /** Hard cap backstop: evict the least-recently-used sessions to make room. */
  private async evict(): Promise<void> {
    while (this.sessions.size >= MAX_SESSIONS) {
      const oldest = [...this.sessions.values()].sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];
      if (!oldest) return;
      this.clearIdleTimer(oldest);
      this.sessions.delete(oldest.id);
      this.queueTails.delete(oldest.id);
      await oldest.context.close().catch(() => undefined);
      logger.info(`Session '${oldest.id}' evicted (cap ${MAX_SESSIONS})`);
    }
  }
}
