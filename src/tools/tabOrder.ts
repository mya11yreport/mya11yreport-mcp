import { z } from 'zod';
import { TABBABLE_UMD } from '../vendor/tabbable.js';
import { jsonContent, sessionIdSchema } from './utils.js';
import type { SessionToolContext, ToolDefinition } from './types.js';

/**
 * Tab-order collector. Ordering is delegated to the `tabbable` library, injected
 * into the page from the vendored UMD build in ../vendor/tabbable.ts. The page
 * function is self-contained because Playwright serializes its source into the
 * page.
 */

export interface TabStop {
  index: number;
  path: string[];
  selector: string;
  tag: string;
  /**
   * The accessible name: aria-label, aria-labelledby, an associated <label>,
   * alt/title/placeholder/value, or the element's own text. '' flags a stop
   * with no accessible name at all.
   */
  text: string;
  tabindex: number;
  /** The aria-label attribute verbatim, or '' when absent. */
  ariaLabel: string;
  /** The aria-labelledby attribute (raw id list) verbatim, or '' when absent. */
  ariaLabelledby: string;
  /** Which step produced `text`. */
  nameSource: string;
  /** True when `text` is non-empty — false flags a stop with no label. */
  hasLabel: boolean;
  /** aria-hidden, or (an <img> only) an empty alt that nothing else named — labelling is intentional. */
  decorative: boolean;
}

interface TabbableNamespace {
  tabbable(container: Element, options?: { getShadowRoot?: boolean }): Element[];
}

function collectTabOrder(): TabStop[] {
  const ns = (window as unknown as { tabbable?: TabbableNamespace }).tabbable;
  if (!ns || typeof ns.tabbable !== 'function') {
    throw new Error('tabbable engine was not injected into the page');
  }

  function buildPath(element: Element): string[] {
    const path: string[] = [];
    let chain: string[] = [];
    let scope: Element | null = element;
    while (
      scope &&
      scope.nodeType === 1 &&
      scope !== document.body &&
      scope !== document.documentElement
    ) {
      let selector = scope.tagName.toLowerCase();
      if (scope.id) {
        selector += `#${CSS.escape(scope.id)}`;
      } else {
        const parent = scope.parentElement;
        if (parent) {
          const index = Array.prototype.indexOf.call(parent.children, scope);
          let sameTag = 0;
          for (let i = 0; i < index; i++) {
            if (parent.children[i].tagName === scope.tagName) sameTag++;
          }
          if (sameTag > 0) selector += `:nth-of-type(${sameTag + 1})`;
        }
      }
      chain.unshift(selector);

      const root = scope.getRootNode();
      if (root instanceof ShadowRoot) {
        path.unshift(chain.join(' > '));
        chain = [];
        scope = root.host;
      } else {
        scope = scope.parentElement;
      }
    }
    path.unshift(chain.join(' > '));
    return path;
  }

  /**
   * The accessible name an element computes to, following the order a screen
   * reader prefers: aria-label, aria-labelledby, an associated <label> for a
   * labelable control, then the element's own native alternatives (alt, title,
   * placeholder, value) and finally its text. Inlined because Playwright
   * serialises this function into the page.
   */
  function accessibleNameOf(element: Element): {
    ariaLabel: string;
    ariaLabelledby: string;
    accessibleName: string;
    nameSource: string;
    hasLabel: boolean;
    decorative: boolean;
  } {
    const ariaLabel = element.getAttribute('aria-label') ?? '';
    const ariaLabelledby = element.getAttribute('aria-labelledby') ?? '';

    let accessibleName = '';
    let nameSource = 'none';

    const trimmedLabel = ariaLabel.trim();
    if (trimmedLabel) {
      accessibleName = trimmedLabel;
      nameSource = 'aria-label';
    } else if (ariaLabelledby) {
      const text = ariaLabelledby
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) {
        accessibleName = text;
        nameSource = 'aria-labelledby';
      }
    }

    // `.labels` exists only on labelable elements; an associated <label> (for=
    // or wrapping) is the native naming technique that must not read as missing.
    if (!accessibleName) {
      const labels = (element as HTMLInputElement).labels;
      if (labels && labels.length > 0) {
        const text = Array.from(labels)
          .map((label) => label.textContent ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (text) {
          accessibleName = text;
          nameSource = 'label';
        }
      }
    }

    if (!accessibleName) {
      const alt = element.getAttribute('alt');
      if (alt && alt.trim()) {
        accessibleName = alt.trim();
        nameSource = 'alt';
      }
    }
    if (!accessibleName) {
      const title = element.getAttribute('title');
      if (title && title.trim()) {
        accessibleName = title.trim();
        nameSource = 'title';
      }
    }
    if (!accessibleName) {
      const placeholder = element.getAttribute('placeholder');
      if (placeholder && placeholder.trim()) {
        accessibleName = placeholder.trim();
        nameSource = 'placeholder';
      }
    }
    if (!accessibleName) {
      const value = (element as HTMLInputElement).value;
      if (value && value.trim()) {
        accessibleName = value.trim();
        nameSource = 'value';
      }
    }
    if (!accessibleName) {
      let text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (!text) {
        // A link or button whose only content is an image or icon takes its
        // name from that descendant's alt/title/value.
        const parts: string[] = [];
        for (const node of element.querySelectorAll('img[alt], area[alt], svg title, input[value]')) {
          const candidate =
            node.getAttribute('alt') ?? node.getAttribute('value') ?? node.textContent ?? '';
          if (candidate.trim()) parts.push(candidate.trim());
        }
        text = parts.join(' ').replace(/\s+/g, ' ').trim();
      }
      if (text) {
        accessibleName = text;
        nameSource = 'text';
      }
    }

    const ariaHidden = element.getAttribute('aria-hidden');
    const ariaHiddenHidden = ariaHidden !== null && ariaHidden !== 'false';
    const emptyAltDecorative =
      element.tagName === 'IMG' && element.getAttribute('alt') === '' && nameSource === 'none';

    return {
      ariaLabel,
      ariaLabelledby,
      accessibleName,
      nameSource,
      hasLabel: accessibleName.length > 0,
      decorative: ariaHiddenHidden || emptyAltDecorative,
    };
  }

  return ns
    .tabbable(document.documentElement, { getShadowRoot: true })
    .map((element, position) => {
      const path = buildPath(element);
      const aria = accessibleNameOf(element);
      return {
        index: position + 1,
        path,
        selector: path.join(' >>> '),
        tag: element.tagName.toLowerCase(),
        text: aria.accessibleName,
        tabindex: (element as HTMLElement).tabIndex,
        ariaLabel: aria.ariaLabel,
        ariaLabelledby: aria.ariaLabelledby,
        nameSource: aria.nameSource,
        hasLabel: aria.hasLabel,
        decorative: aria.decorative,
      };
    });
}

const inputSchema = {
  sessionId: sessionIdSchema,
};

async function ensureTabbable(page: SessionToolContext['session']['page']): Promise<void> {
  const loaded = await page.evaluate(() => {
    const ns = (window as unknown as { tabbable?: { tabbable?: unknown } }).tabbable;
    return Boolean(ns && typeof ns.tabbable === 'function');
  });
  if (loaded) return;

  await page.addScriptTag({ content: TABBABLE_UMD });

  const stillMissing = await page.evaluate(() => {
    const ns = (window as unknown as { tabbable?: { tabbable?: unknown } }).tabbable;
    return !(ns && typeof ns.tabbable === 'function');
  });
  if (stillMissing) {
    throw new Error('Failed to inject the tabbable engine into the page.');
  }
}

export const getTabOrderTool: ToolDefinition<typeof inputSchema> = {
  name: 'get_tab_order',
  title: 'Get tab order',
  description:
    'Lists the page\'s tab stops in the order the Tab key reaches them, using the tabbable ' +
    'algorithm: positive tabindex values first (ascending), then ' +
    'everything else in document order. Each stop reports its position, tag, accessible name ' +
    '(`text`), effective `tabindex`, shadow-piercing selector, the raw `ariaLabel`/`ariaLabelledby` ' +
    'attributes, the `nameSource` that produced the name, a `hasLabel` flag, and an `outOfOrder` ' +
    'flag when tabindex is positive. Top frame only; hidden/disabled/inert elements are excluded.',
  inputSchema,
  tier: 'free',
  handler: async (args, context) => {
    const page = context.session.page;
    await ensureTabbable(page);

    const collected = await page.evaluate(collectTabOrder);
    const stops = collected.map((stop) => ({ ...stop, outOfOrder: stop.tabindex > 0 }));

    return jsonContent({
      actionId: context.actionId,
      url: page.url(),
      total: stops.length,
      positiveTabindexCount: stops.filter((stop) => stop.outOfOrder).length,
      stops,
    });
  },
};
