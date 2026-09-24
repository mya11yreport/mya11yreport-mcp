import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Generates the audit-guide artefact from its single source of truth:
 *
 *   docs/audit-guide.md
 *     -> src/auditGuide.ts   (base64 constant the get_audit_guide tool returns)
 *
 * Run from the repo root:  node scripts/embed-audit-guide.mjs
 * Re-run whenever docs/audit-guide.md changes.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const sourcePath = join(repoRoot, 'docs', 'audit-guide.md');
const mcpOutPath = join(repoRoot, 'src', 'auditGuide.ts');

const guide = readFileSync(sourcePath, 'utf8').trimEnd() + '\n';

const tsOut = `/**
 * GENERATED FILE — do not edit by hand.
 * Source: docs/audit-guide.md
 * Regenerate: node scripts/embed-audit-guide.mjs
 *
 * The audit workflow returned by the get_audit_guide tool. Base64-encoded so the
 * markdown (which is full of backticks and pipes) survives intact, and so the
 * published package stays self-contained.
 */

export const AUDIT_GUIDE_MARKDOWN = Buffer.from(
  '${Buffer.from(guide, 'utf8').toString('base64')}',
  'base64',
).toString('utf8');
`;

writeFileSync(mcpOutPath, tsOut);

console.log(`Wrote ${mcpOutPath}`);
