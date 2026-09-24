export interface Logger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * stderr-only logger. stdout is reserved for the MCP protocol transport.
 */
export const logger: Logger = {
  info: (...args: unknown[]) => console.error('[mya11yreport-mcp]', ...args),
  error: (...args: unknown[]) => console.error('[mya11yreport-mcp]', ...args),
};
