/**
 * Server instructions delivered to MCP clients during initialization.
 * Clients surface these to the agent as usage guidance for this server.
 */
export const SERVER_INSTRUCTIONS = `# MyA11yReport Server Instructions & Workflow Rules

You are interacting with the local MyA11yReport accessibility engine. Adhere strictly to the following execution sequence:

0. AUDIT WORKFLOW:
   - Before running a full audit, call 'get_audit_guide' to read the step-by-step workflow: which tools to use at each step, how to enumerate URLs from a sitemap, the report format, and which checks are human-only (keyboard navigation, screen-reader compatibility, image meaning). It needs no session.

1. SESSION INITIALIZATION:
   - Always invoke 'start_session' before executing any browser or audit tool.
   - Retain the returned 'sessionId' and pass it to every subsequent tool invocation.

2. NAVIGATION & AUDITING:
   - Use 'navigate' to load URLs.
   - Run 'run_a11y_audit' to gather automated axe-core audit results.
   - If user interaction is required (e.g., expanding an accordion, opening a modal, or triggering hover states), use 'click', 'type', or 'press_key' before re-running 'run_a11y_audit'. Use 'press_key' for keyboard interactions (Enter, Tab, Escape, arrows, Shift+Tab).
   - Use 'check_color_contrast' to compute the WCAG 2.2 ratio for any two colors (hex or rgb()) with no session or browser needed. Use 'evaluate' to inspect the live DOM via page JavaScript when 'get_page_snapshot' is not enough.
   - Use 'list_images' to review every <img>/inline <svg> and its alt text, 'get_structure' to review landmarks, headings, lists and frames, and 'get_tab_order' to review the focus order (including positive-tabindex elements pulled out of document order).

3. FALSE-POSITIVE & INCOMPLETE ("NEEDS REVIEW") EVALUATION:
   - Automated axe audits output two critical buckets requiring expert reasoning:
     a) 'violations': Automated failures that may be false positives (e.g., text overlaying complex gradient scrims or image backdrops that axe-core cannot compute).
     b) 'incomplete': Items flagged as indeterminate / "needs review" where the engine could not definitively confirm compliance (e.g., background image bleed, pseudo-elements, dynamic blend modes, target size ambiguity).
   - Investigate ambiguous items yourself with the available tools: use 'evaluate' to read computed styles, geometry and the rendered stack, 'check_color_contrast' for ratio arithmetic, and 'get_page_snapshot' for roles/names. Treat an automated result as unconfirmed until you have done so.
   - Do NOT estimate contrast ratios or pixel values from raw screenshots; use 'check_color_contrast' for the arithmetic.

4. CLEANUP:
   - Always call 'close_session' once auditing and triage are complete to release browser memory.`;
