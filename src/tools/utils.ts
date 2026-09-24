import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const DEFAULT_ACTION_TIMEOUT_MS = 10_000;
export const DEFAULT_NAV_TIMEOUT_MS = 30_000;

const ALLOWED_PROTOCOLS = ['http:', 'https:', 'file:'];

export const sessionIdSchema = z
  .string()
  .min(1)
  .max(225)
  .describe('Session id returned by start_session. Required on every stateful tool call.');

export const httpUrlSchema = z
  .string()
  .describe('Absolute URL. Supported schemes: http://, https://, file://')
  .refine((value) => {
    try {
      return ALLOWED_PROTOCOLS.includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, 'Must be an absolute URL using http://, https://, or file://');

export function jsonContent(payload: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}
