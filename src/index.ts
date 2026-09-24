#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const require = createRequire(import.meta.url);

const HELP = `mya11yreport-mcp — offline MCP server for accessibility audits

Usage:
  mya11yreport-mcp                    Start the MCP server (stdio transport)
  mya11yreport-mcp install            Download the Chromium build Playwright needs
  mya11yreport-mcp install chromium   Same; the browser name is optional
  mya11yreport-mcp --help

Run \`mya11yreport-mcp install\` once after installing the package. It downloads the
browser that \`run_a11y_audit\` and the browser tools drive. Without MCP arguments
the server speaks the Model Context Protocol over stdin/stdout.`;

/** Absolute path to the Playwright CLI shipped as a dependency. */
function playwrightCliPath(): string {
  const resolved = require.resolve('playwright');
  return join(dirname(resolved), 'cli.js');
}

/** Runs `playwright install <browsers>` with inherited stdio; resolves to its exit code. */
function installBrowsers(browsers: string[]): Promise<number> {
  const targets = browsers.length > 0 ? browsers : ['chromium'];
  const cli = playwrightCliPath();

  console.error(`[mya11yreport-mcp] Installing Playwright browser(s): ${targets.join(', ')}`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'install', ...targets], { stdio: 'inherit' });
    child.on('error', (error) => {
      console.error('[mya11yreport-mcp] Could not run the Playwright installer:', error);
      resolve(1);
    });
    child.on('exit', (code) => {
      if ((code ?? 1) === 0) {
        console.error(
          `[mya11yreport-mcp] Done — ${targets.join(', ')} ${targets.length === 1 ? 'is' : 'are'} ready.`,
        );
      }
      resolve(code ?? 1);
    });
  });
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (command === 'install' || command === 'install-browsers') {
    process.exit(await installBrowsers(rest));
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP);
    return;
  }

  if (command) {
    console.error(`[mya11yreport-mcp] Unknown command: ${command}\n`);
    console.error(HELP);
    process.exit(1);
  }

  const { server, close } = createServer();

  process.on('SIGINT', () => void close().finally(() => process.exit(0)));
  process.on('SIGTERM', () => void close().finally(() => process.exit(0)));

  const transport = new StdioServerTransport();
  await server.connect(transport);
  await close();
}

main().catch((error) => {
  console.error('[mya11yreport-mcp] Fatal:', error);
  process.exit(1);
});
