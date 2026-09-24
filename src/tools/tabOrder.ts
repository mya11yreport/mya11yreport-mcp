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
  text: string;
  tabindex: number;
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

  function labelOf(element: Element): string {
    const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (text) return text;

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.placeholder || element.value || '';
    }
    if (element instanceof HTMLSelectElement) {
      const chosen = element.selectedOptions.item(0);
      return chosen?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    }
    return '';
  }

  return ns
    .tabbable(document.documentElement, { getShadowRoot: true })
    .map((element, position) => {
      const path = buildPath(element);
      return {
        index: position + 1,
        path,
        selector: path.join(' >>> '),
        tag: element.tagName.toLowerCase(),
        text: labelOf(element),
        tabindex: (element as HTMLElement).tabIndex,
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
    'everything else in document order. Each stop reports its position, tag, label, effective ' +
    'tabindex, shadow-piercing selector and an outOfOrder flag when tabindex is positive. Top frame ' +
    'only; hidden/disabled/inert elements are excluded.',
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
