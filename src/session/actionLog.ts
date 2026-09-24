import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PageStore } from './pageStore.js';

export interface ActionEntry {
  id: string;
  at: string;
  tool: string;
  ms: number;
  args?: unknown;
  ok: boolean;
  result?: unknown;
  error?: string;
  url?: string;
}

const MAX_ARG_STRING = 2_000;
const MAX_RESULT_STRING = 64 * 1024;
const MAX_DEPTH = 6;
const MAX_ARRAY = 50;
const MAX_KEYS = 100;

function capString(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…(+${value.length - max} chars)` : value;
}

/** Recursively caps string lengths and collection sizes so log files stay small. */
export function capValue(value: unknown, maxStringLength: number, depth = 0): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'string' ? capString(value, maxStringLength) : value;
  }
  if (depth > MAX_DEPTH) return '[depth limit]';
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((item) => capValue(item, maxStringLength, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS)) {
    out[key] = capValue(item, maxStringLength, depth + 1);
  }
  return out;
}

/** Unwraps a CallToolResult into the payload worth logging. */
export function extractPayload(result: { content?: Array<{ type: string; text?: string }> }): unknown {
  const items = result.content ?? [];
  if (items.length === 1 && items[0].type === 'text' && typeof items[0].text === 'string') {
    try {
      return JSON.parse(items[0].text);
    } catch {
      return items[0].text;
    }
  }
  return result;
}

export interface ActionLogMeta {
  alias?: string | null;
  headless: boolean;
}

/**
 * Durable per-session history: every action is appended in memory and the
 * whole document is atomically rewritten to <sessionId>.json after each call.
 */
export class ActionLog {
  readonly dir: string;
  private readonly file: string;
  private readonly startedAt = new Date().toISOString();
  private readonly actions: ActionEntry[] = [];
  private closedAt: string | null = null;

  constructor(
    private readonly sessionId: string,
    dir: string,
    private readonly pageStore: PageStore,
    private readonly meta: ActionLogMeta = { alias: null, headless: true },
  ) {
    this.dir = dir;
    this.file = join(dir, `${sessionId}.json`);
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    // A recreated session must not overwrite the finalized history of its
    // previous incarnation.
    if (existsSync(this.file)) {
      await rename(this.file, join(this.dir, `${this.sessionId}-${Date.now()}.json`));
    }
  }

  markClosed(): void {
    this.closedAt = new Date().toISOString();
  }

  append(entry: ActionEntry): void {
    this.actions.push(entry);
  }

  async flush(): Promise<void> {
    const doc = {
      v: 1,
      sessionId: this.sessionId,
      alias: this.meta.alias ?? null,
      headless: this.meta.headless,
      startedAt: this.startedAt,
      savedAt: new Date().toISOString(),
      closedAt: this.closedAt,
      auditStore: capValue(this.pageStore.toJSON(), MAX_RESULT_STRING),
      actions: this.actions,
    };
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(doc, null, 2), 'utf8');
    await rename(tmp, this.file);
  }
}
