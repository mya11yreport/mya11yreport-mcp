import { clickTool } from './click.js';
import { checkTool, uncheckTool } from './check.js';
import { checkColorContrastTool } from './contrast.js';
import { evaluateTool } from './evaluate.js';
import { getAuditGuideTool } from './auditGuide.js';
import { listImagesTool } from './images.js';
import { navigateTool } from './navigate.js';
import { pressKeyTool } from './pressKey.js';
import { runA11yAuditTool } from './runA11yAudit.js';
import { selectOptionTool } from './select.js';
import { closeSessionTool, startSessionTool } from './session.js';
import { getStructureTool } from './structure.js';
import { getTabOrderTool } from './tabOrder.js';
import {
  getViewportSizeTool,
  getScrollPositionTool,
  scrollByTool,
} from './scroll.js';
import { getPageSnapshotTool, screenshotTool } from './inspect.js';
import { typeTool } from './type.js';
import type { AnyToolDefinition } from './types.js';

/**
 * All MCP tools exposed by this server. Add new tools by appending definitions
 * here; server.ts registers, error-wraps, action-ids, and logs every entry
 * uniformly.
 */
export const toolRegistry: AnyToolDefinition[] = [
  startSessionTool,
  closeSessionTool,
  getAuditGuideTool,
  runA11yAuditTool,
  checkColorContrastTool,
  listImagesTool,
  getStructureTool,
  getTabOrderTool,
  navigateTool,
  clickTool,
  typeTool,
  pressKeyTool,
  checkTool,
  uncheckTool,
  selectOptionTool,
  scrollByTool,
  screenshotTool,
  getPageSnapshotTool,
  getViewportSizeTool,
  getScrollPositionTool,
  evaluateTool,
];
