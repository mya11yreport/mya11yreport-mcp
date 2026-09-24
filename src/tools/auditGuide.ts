import { AUDIT_GUIDE_MARKDOWN } from '../auditGuide.js';
import type { ToolContext, ToolDefinition } from './types.js';

const inputSchema = {};

export const getAuditGuideTool: ToolDefinition<typeof inputSchema, ToolContext> = {
  name: 'get_audit_guide',
  title: 'Get audit guide',
  description:
    'Returns the step-by-step accessibility audit workflow for agents as markdown: how to enumerate ' +
    'URLs from a sitemap, run the automated axe-core pass, the structure/tab-order/images/contrast ' +
    'reviews, the output-report format, and exactly which checks (keyboard navigation, ' +
    'screen-reader compatibility, image meaning) must be done by a human. Call this before ' +
    'starting an audit. Needs no session or browser. Also published at ' +
    'https://mya11y.report/mcp/auditor-skill.',
  inputSchema,
  tier: 'free',
  resolveSession: false,
  handler: async () => {
    return { content: [{ type: 'text', text: AUDIT_GUIDE_MARKDOWN }] };
  },
};
