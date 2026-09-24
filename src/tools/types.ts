import type { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from '../logger.js';
import type { SessionEntry, SessionManager } from '../session/sessionManager.js';

export interface ToolContext {
  /**
   * The resolved session for this call. Absent only for tools that opt out of
   * session resolution (resolveSession: false) and manage sessions themselves.
   */
  session?: SessionEntry;
  sessionManager: SessionManager;
  logger: Logger;
  /** Hex id assigned to this tool call; also the screenshot filename stem. */
  actionId: string;
}

/** Context for tools that operate on the resolved session's page. */
export interface SessionToolContext extends ToolContext {
  session: SessionEntry;
}

export type ToolTier = 'free' | 'paid';

export interface ToolSchemaShape {
  [key: string]: z.ZodType;
}

type ShapeOutput<S extends ToolSchemaShape> = {
  [K in keyof S]: z.output<S[K]>;
};

export type ToolArgs<S extends ToolSchemaShape> = ShapeOutput<S>;

/** Registry-level definition: loosest context so all tools are storable. */
export type AnyToolDefinition = ToolDefinition<ToolSchemaShape, ToolContext>;

export interface ToolDefinition<S extends ToolSchemaShape = ToolSchemaShape, C extends ToolContext = SessionToolContext> {
  name: string;
  title?: string;
  description: string;
  inputSchema: S;
  /**
   * Extensibility seam for the future tier system: v1 is unlimited free
   * access, but every tool already declares its tier so entitlement checks
   * (rate limits, API keys for paid tools) can be added in one place.
   */
  tier: ToolTier;
  /**
   * When false (default true), the server does not resolve/create a session
   * before the handler runs; the handler manages sessions itself and the
   * action is not written to a session history file.
   */
  resolveSession?: boolean;
  // Method syntax keeps parameter checking bivariant so specific tool
  // definitions (with narrower args/context) can live in a generic registry.
  handler(args: ToolArgs<S>, context: C): Promise<CallToolResult>;
}
