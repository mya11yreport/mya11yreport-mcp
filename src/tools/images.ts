import { z } from 'zod';
import { jsonContent, sessionIdSchema } from './utils.js';
import type { ToolDefinition } from './types.js';

/**
 * Alt-text collector. The page function is self-contained because Playwright
 * serializes its source into the page. Top frame only, open shadow roots only,
 * <img> and inline <svg> only, with accessible-name ordering
 * (aria-label -> aria-labelledby -> alt, or -> title -> desc for svg).
 */

export type AltSource = 'aria-label' | 'aria-labelledby' | 'alt' | 'title' | 'desc' | 'none';

export interface PageImage {
  kind: 'img' | 'svg';
  path: string[];
  selector: string;
  src: string;
  currentSrc: string;
  svgMarkup: string;
  alt: string;
  altSource: AltSource;
  decorative: boolean;
}

type ImageFilter = 'all' | 'decorative' | 'missing-alt' | 'has-alt';

function collectImages(): PageImage[] {
  const seen = new Set<Element>();
  const images: PageImage[] = [];

  function ariaName(element: Element): { name: string; source: 'aria-label' | 'aria-labelledby' | null } {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return { name: ariaLabel, source: 'aria-label' };

    const labelledby = element.getAttribute('aria-labelledby');
    if (labelledby) {
      const text = labelledby
        .split(/\s+/)
        .map((ref) => document.getElementById(ref)?.textContent ?? '')
        .join(' ')
        .trim();
      if (text) return { name: text, source: 'aria-labelledby' };
    }
    return { name: '', source: null };
  }

  function imgAccessibleName(img: Element): { name: string; source: AltSource } {
    const aria = ariaName(img);
    if (aria.source) return { name: aria.name, source: aria.source };

    const alt = img.getAttribute('alt');
    if (alt !== null) return { name: alt, source: 'alt' };
    return { name: '', source: 'none' };
  }

  function svgAccessibleName(svg: Element): { name: string; source: AltSource } {
    const aria = ariaName(svg);
    if (aria.source) return { name: aria.name, source: aria.source };

    const title = svg.querySelector('title');
    if (title && (title.textContent ?? '').trim()) {
      return { name: title.textContent ?? '', source: 'title' };
    }
    const desc = svg.querySelector('desc');
    if (desc && (desc.textContent ?? '').trim()) {
      return { name: desc.textContent ?? '', source: 'desc' };
    }
    return { name: '', source: 'none' };
  }

  function svgMarkup(svg: Element): string {
    const clone = svg.cloneNode(true) as Element;
    clone.querySelectorAll('script, foreignObject').forEach((node) => node.remove());
    for (const node of [clone, ...clone.querySelectorAll('*')]) {
      for (const attr of Array.from(node.attributes)) {
        if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
      }
    }
    return clone.outerHTML;
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

  function visitElement(element: Element): void {
    if (seen.has(element)) return;
    seen.add(element);

    const isImg = element.tagName === 'IMG';
    const isSvg = element.localName === 'svg';

    if (isImg || isSvg) {
      const ariaHidden = element.getAttribute('aria-hidden');
      const ariaHiddenDecorative = ariaHidden !== null && ariaHidden !== 'false';
      const path = buildPath(element);

      if (isImg) {
        const name = imgAccessibleName(element);
        const emptyAltDecorative = name.source === 'alt' && name.name === '';
        images.push({
          kind: 'img',
          path,
          selector: path.join(' >>> '),
          src: element.getAttribute('src') ?? '',
          currentSrc: (element as HTMLImageElement).currentSrc || '',
          svgMarkup: '',
          alt: name.name,
          altSource: name.source,
          decorative: ariaHiddenDecorative || emptyAltDecorative,
        });
      } else {
        const name = svgAccessibleName(element);
        images.push({
          kind: 'svg',
          path,
          selector: path.join(' >>> '),
          src: '',
          currentSrc: '',
          svgMarkup: svgMarkup(element),
          alt: name.name,
          altSource: name.source,
          decorative: ariaHiddenDecorative,
        });
      }
    }

    if (element.shadowRoot) {
      for (const descendant of element.shadowRoot.querySelectorAll('*')) {
        visitElement(descendant);
      }
    }
  }

  for (const element of document.querySelectorAll('*')) visitElement(element);
  return images;
}

function isGenuinelyMissingAlt(image: PageImage): boolean {
  return !image.decorative && image.alt.trim().length === 0;
}

function matchesFilter(image: PageImage, filter: ImageFilter): boolean {
  switch (filter) {
    case 'decorative':
      return image.decorative;
    case 'missing-alt':
      return isGenuinelyMissingAlt(image);
    case 'has-alt':
      return !image.decorative && !isGenuinelyMissingAlt(image);
    default:
      return true;
  }
}

const inputSchema = {
  sessionId: sessionIdSchema,
  filter: z
    .enum(['all', 'decorative', 'missing-alt', 'has-alt'])
    .default('all')
    .describe(
      "Which images to return: 'all' (default), 'decorative', 'missing-alt' (not decorative and no " +
        "accessible name), or 'has-alt' (not decorative and named). Counts always cover every image.",
    ),
};

export const listImagesTool: ToolDefinition<typeof inputSchema> = {
  name: 'list_images',
  title: 'List images and alt text',
  description:
    'Lists every <img> and inline <svg> on the session page with its accessible name, the source ' +
    'that name came from (aria-label, aria-labelledby, alt, title, desc or none), its src/currentSrc ' +
    'and sanitized SVG markup, a decorative flag, and a shadow-piercing selector. Derived flags ' +
    'mark genuinely missing alt text and overly long alt text (>250 chars). Top frame only, open ' +
    'shadow roots only.',
  inputSchema,
  tier: 'free',
  handler: async (args, context) => {
    const page = context.session.page;
    const collected = await page.evaluate(collectImages);

    const enriched = collected.map((image) => {
      const missingAlt = isGenuinelyMissingAlt(image);
      return {
        ...image,
        missingAlt,
        longAlt: !missingAlt && image.alt.length > 250,
      };
    });

    const counts = {
      total: enriched.length,
      decorative: enriched.filter((image) => image.decorative).length,
      missingAlt: enriched.filter((image) => image.missingAlt).length,
      hasAlt: enriched.filter((image) => !image.decorative && !image.missingAlt).length,
      longAlt: enriched.filter((image) => image.longAlt).length,
    };

    return jsonContent({
      actionId: context.actionId,
      url: page.url(),
      filter: args.filter,
      counts,
      images: enriched.filter((image) => matchesFilter(image, args.filter)),
    });
  },
};
