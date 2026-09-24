# MyA11yReport MCP server

An open-source [Model Context Protocol](https://modelcontextprotocol.io) server
that gives AI agents real accessibility-auditing abilities. It runs axe-core
audits and drives a real browser through Playwright (navigate, click, type,
check/uncheck, scroll, screenshots, aria snapshots, page JavaScript), plus page
reviews for alt text, structure and tab order, and a session-free WCAG 2.2
color-contrast checker.

Built for agents: sessions are explicit, every action is logged, and audit
history is keyed by URL. It speaks MCP over stdio and needs no account, no API
key and no network service of its own.

## What you get

- **Automated audits** — `run_a11y_audit` runs axe-core on the current page and
  accumulates results per URL.
- **Browser control** — `navigate`, `click`, `type`, `press_key`, `check`,
  `uncheck`, `select_option`, `scroll_by`, `screenshot`, `get_page_snapshot`,
  `evaluate`, `get_viewport_size`, `get_scroll_position`.
- **Page reviews** — `list_images` (alt text), `get_structure` (landmarks,
  headings, lists, frames), `get_tab_order` (focus order).
- **Contrast maths** — `check_color_contrast` computes the WCAG 2.2 ratio for
  any two colors, with no session or browser.
- **Audit guide** — `get_audit_guide` returns the full step-by-step audit
  workflow as markdown, including which checks must be done by a human.

## Requirements

- **Node.js 20 or newer** (`node --version`)
- **Chromium**, installed once with one command (see below). It is ~150 MB.
- For `headless: false` sessions, a machine with a real display.

## Install

### From npm (recommended)

```bash
npm i -g @mya11yreport/mcp
mya11yreport-mcp install chromium
```

The second step downloads the Chromium build that matches the server's
Playwright version. It is a separate step rather than a post-install script
because some machines block npm lifecycle scripts. If you skip it, the server
still starts and simply tells you to run the command the first time a browser
tool is used.

Prefer not to install globally? Use `npx`:

```bash
npx -y @mya11yreport/mcp install chromium
```

To confirm the server starts on your machine:

```bash
echo '{}' | mya11yreport-mcp
```

It should exit cleanly; EOF on stdin closes the server.

### From source

Clone the repository and build it locally:

```bash
git clone <repository-url> mya11yreport-mcp
cd mya11yreport-mcp
npm install
npm run build
node dist/index.js install chromium
```

Then run the server from the checkout:

```bash
node /path/to/mya11yreport-mcp/dist/index.js
```

Optionally put the `mya11yreport-mcp` command on your `PATH` with `npm link`, so
you can use it anywhere:

```bash
npm link
mya11yreport-mcp install chromium
```

## Connect it to your MCP client

Point your MCP client at the server over stdio. In
[opencode](https://opencode.ai), add it to your project `opencode.json` or your
global `~/.config/opencode/opencode.json`.

After a global install or `npm link`:

```json
{
  "mcp": {
    "mya11y-audit": {
      "type": "local",
      "command": ["mya11yreport-mcp"],
      "enabled": true
    }
  }
}
```

Without a global install, use `npx`:

```json
"command": ["npx", "-y", "@mya11yreport/mcp"]
```

When running from a local checkout, point at the built entry file directly:

```json
"command": ["node", "/path/to/mya11yreport-mcp/dist/index.js"]
```

Other MCP clients use the same idea — run the server executable with no
arguments over stdio. Restart the client after changing its configuration.

## Using the server

You do not call tools yourself: once the server is connected, your agent does.
The typical flow is:

0. `get_audit_guide` — needs **no session**: returns the full step-by-step audit
   workflow as markdown (sitemap enumeration, the automated pass, the
   structure/tab-order/images/contrast reviews, report format, and the
   human-only checks). Call it before a full audit. The same guide is published
   at <https://mya11y.report/mcp/auditor-skill>.
1. `start_session` — returns a `sessionId` (pass an optional free-form alias,
   max 225 chars, sanitized to `[A-Za-z0-9_-]`; omit for a hex id). Also picks
   `headless: true|false`.
2. Pass `sessionId` to every call: `navigate`, `click`, `type`, `press_key`,
   `check`, `uncheck`, `scroll_by`, `screenshot`, `get_page_snapshot`, `evaluate`,
   `get_viewport_size`, `get_scroll_position`, `run_a11y_audit`, `list_images`,
   `get_structure`, `get_tab_order`.
3. Targets are `{"selector": "#id"}` or
   `{"fn": {"name": "getByRole", "args": ["button", {"name": "Sign in"}]}}`
   (getByRole | getByText | getByLabel | getByPlaceholder | getByAltText |
   getByTitle).
4. `run_a11y_audit` audits the current session page (or navigates to `url`
   first) and returns the session's audit history:
   `{pages: string[], audits: [{pageId, audit}]}` — one hex `pageId` per URL,
   audits accumulate per page.
5. `evaluate` runs a JavaScript expression or function in the page via
   `page.evaluate` and returns the serialized value (non-serializable or
   `undefined` results come back as `null` with `serializable: false`). Use it
   to read computed styles, geometry or custom element state.
6. `check_color_contrast` needs **no session and no browser**: pass two colors
   (hex or `rgb()`/`rgba()`) and optionally `fontSizePx`/`fontWeight`, and it
   returns the WCAG 2.2 ratio, the AA/AAA grades, and whether the pair counts as
   large text.
7. `list_images` returns every `<img>` / inline `<svg>` with its accessible name
   and source, `src`/`currentSrc`, sanitized SVG markup, a decorative flag and
   derived `missingAlt`/`longAlt` flags plus counts. Filter with
   `filter: all | decorative | missing-alt | has-alt`.
8. `get_structure` returns landmark regions, headings, nested lists and iframes,
   plus a heading outline grouped by region with skipped-level / repeated-H1
   flags. Narrow with `include: [...]`.
9. `get_tab_order` returns the Tab order (positive `tabindex` first, then
   document order) with each stop's tag, label, effective `tabindex`,
   shadow-piercing selector and an `outOfOrder` flag.
10. `close_session` when done.

The three review tools (`list_images`, `get_structure`, `get_tab_order`) inspect
the top frame and open shadow roots only. `get_tab_order` uses the same
`tabbable` engine, vendored into the build.

## Sessions and logs

- Sessions auto-close after 5 minutes of inactivity.
- Every session writes an action history to
  `.mya11yreport-mcp/logs/<sessionId>/<sessionId>.json`. Screenshots land in the
  same directory as `<actionId>.png`.
- Nothing is sent off your machine; the logs are plain local files you can
  inspect or delete at any time.

## Configuration

| Variable                   | Default                         | Purpose                                 |
| -------------------------- | ------------------------------- | --------------------------------------- |
| `MYA11Y_MCP_IDLE_CLOSE_MS` | `300000` (5 min)                | Idle auto-close delay (min 1000)        |
| `MYA11Y_MCP_LOG_DIR`       | `<cwd>/.mya11yreport-mcp/logs`  | Session log directory                   |
| `PLAYWRIGHT_HEADLESS`      | `true`                          | Default headless mode (param overrides) |

`headless: false` needs a real display on the host machine.

## Troubleshooting

- **"Run `mya11yreport-mcp install chromium`"** — you have not installed the
  browser yet. Run that command once.
- **Timeouts or "element not found"** — the target was not actionable in time.
  Ask the agent to call `get_page_snapshot` to discover targets, or retry with a
  larger `timeoutMs`.
- **Server exits immediately** — that is expected when stdin closes (for example
  in the smoke test above). It is not an error.
