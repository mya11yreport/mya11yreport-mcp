import { z } from 'zod';
import { jsonContent, sessionIdSchema } from './utils.js';
import type { ToolDefinition } from './types.js';

/**
 * Page-structure collector. The page function is self-contained because
 * Playwright serializes its source into the page. Top frame only, open shadow
 * roots only, iframe content is not traversed.
 */

export interface StructureRegion {
  role: string;
  name: string;
  tagName: string;
  path: string[];
  selector: string;
}

export interface StructureHeading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  tagName: string;
  path: string[];
  selector: string;
  regionId: number | null;
}

export interface StructureListItem {
  text: string;
  path: string[];
  selector: string;
  lists: StructureList[];
}

export interface StructureList {
  tag: 'ul' | 'ol' | 'dl';
  items: StructureListItem[];
  path: string[];
  selector: string;
  regionId: number | null;
}

export interface StructureFrame {
  title: string;
  src: string;
  path: string[];
  selector: string;
  regionId: number | null;
}

export interface PageStructure {
  regions: StructureRegion[];
  headings: StructureHeading[];
  lists: StructureList[];
  frames: StructureFrame[];
}

function collectStructure(): PageStructure {
  const LANDMARK_ROLES = new Set([
    'banner',
    'complementary',
    'contentinfo',
    'form',
    'main',
    'navigation',
    'region',
    'search',
  ]);
  const LANDMARK_BY_TAG: Record<string, string> = {
    header: 'banner',
    footer: 'contentinfo',
    nav: 'navigation',
    main: 'main',
    aside: 'complementary',
    form: 'form',
    section: 'region',
  };

  const regions: StructureRegion[] = [];
  const headings: StructureHeading[] = [];
  const lists: StructureList[] = [];
  const frames: StructureFrame[] = [];
  const seen = new Set<Element>();
  const landmarkIndex = new Map<Element, number>();
  const itemRecords = new Map<Element, StructureListItem>();

  const labelOf = (element: Element): string => {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      return labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    return '';
  };

  const accessibleName = (element: Element): string =>
    labelOf(element) || (element.textContent?.replace(/\s+/g, ' ').trim() ?? '');

  const buildPath = (element: Element): string[] => {
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
  };

  const regionOf = (element: Element): number | null => {
    let scope: Element | null = element.parentElement;
    while (scope) {
      const index = landmarkIndex.get(scope);
      if (index !== undefined) return index;

      const root = scope.getRootNode();
      if (root instanceof ShadowRoot) {
        scope = root.host;
      } else {
        scope = scope.parentElement;
      }
    }
    return null;
  };

  const closestOf = (element: Element, matches: (candidate: Element) => boolean): Element | null => {
    let scope: Element | null = element.parentElement;
    while (scope) {
      if (matches(scope)) return scope;

      const root = scope.getRootNode();
      if (root instanceof ShadowRoot) {
        scope = root.host;
      } else {
        scope = scope.parentElement;
      }
    }
    return null;
  };

  const itemTextOf = (element: Element): string => {
    let text = '';
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent ?? '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = (node as Element).tagName.toLowerCase();
        if (tag !== 'ul' && tag !== 'ol' && tag !== 'dl') text += node.textContent ?? '';
      }
    }
    return text.replace(/\s+/g, ' ').trim();
  };

  const landmarkRoleOf = (element: Element): string | null => {
    const explicit = element.getAttribute('role');
    if (explicit && explicit !== 'none' && explicit !== 'presentation') {
      if (LANDMARK_ROLES.has(explicit)) return explicit;
      return null;
    }

    const implicit = LANDMARK_BY_TAG[element.tagName.toLowerCase()];
    if (!implicit) return null;

    if (implicit === 'region') {
      const ariaLabel = element.getAttribute('aria-label');
      const labelledBy = element.getAttribute('aria-labelledby');
      if (!ariaLabel && !labelledBy) return null;
    }

    return implicit;
  };

  const recordRegion = (element: Element): void => {
    const role = landmarkRoleOf(element);
    if (role === null) return;
    seen.add(element);

    const path = buildPath(element);
    landmarkIndex.set(element, regions.length);
    regions.push({
      role,
      name: labelOf(element),
      tagName: element.tagName.toLowerCase(),
      path,
      selector: path.join(' >>> '),
    });
  };

  const recordHeading = (element: Element): void => {
    let level: number | null = null;

    const tag = element.tagName.toLowerCase();
    const match = /^h([1-6])$/.exec(tag);
    if (match) {
      level = Number(match[1]);
    } else {
      if (element.getAttribute('role') !== 'heading') return;
      const ariaLevel = Number(element.getAttribute('aria-level'));
      if (ariaLevel >= 1 && ariaLevel <= 6) level = ariaLevel;
    }
    if (level === null) return;
    if (seen.has(element)) return;
    seen.add(element);

    const path = buildPath(element);
    headings.push({
      level: level as StructureHeading['level'],
      text: accessibleName(element),
      tagName: tag,
      path,
      selector: path.join(' >>> '),
      regionId: regionOf(element),
    });
  };

  const recordList = (element: Element): void => {
    const tag = element.tagName.toLowerCase();
    if (tag !== 'ul' && tag !== 'ol' && tag !== 'dl') return;
    if (seen.has(element)) return;
    seen.add(element);

    const path = buildPath(element);
    const record: StructureList = {
      tag: tag as StructureList['tag'],
      items: [],
      path,
      selector: path.join(' >>> '),
      regionId: regionOf(element),
    };

    const itemTags = tag === 'dl' ? ['dt', 'dd'] : ['li'];
    for (const child of Array.from(element.children)) {
      if (itemTags.indexOf(child.tagName.toLowerCase()) === -1) continue;
      const itemPath = buildPath(child);
      const item: StructureListItem = {
        text: itemTextOf(child),
        path: itemPath,
        selector: itemPath.join(' >>> '),
        lists: [],
      };
      itemRecords.set(child, item);
      record.items.push(item);
    }

    const containingList = closestOf(element, (candidate) => {
      const name = candidate.tagName.toLowerCase();
      return name === 'ul' || name === 'ol' || name === 'dl';
    });
    if (containingList) {
      const host = closestOf(element, (candidate) => {
        const name = candidate.tagName.toLowerCase();
        return name === 'li' || name === 'dt' || name === 'dd';
      });
      const hostItem = host ? itemRecords.get(host) : undefined;
      if (hostItem) hostItem.lists.push(record);
      else lists.push(record);
    } else {
      lists.push(record);
    }
  };

  const recordFrame = (element: Element): void => {
    if (element.tagName !== 'IFRAME') return;
    if (seen.has(element)) return;
    seen.add(element);

    const path = buildPath(element);
    frames.push({
      title: element.getAttribute('title') ?? '',
      src: element.getAttribute('src') ?? '',
      path,
      selector: path.join(' >>> '),
      regionId: regionOf(element),
    });
  };

  const visitElement = (element: Element): void => {
    recordRegion(element);
    recordHeading(element);
    recordList(element);
    recordFrame(element);

    if (element.shadowRoot) {
      for (const child of element.shadowRoot.querySelectorAll('*')) {
        visitElement(child);
      }
    }
  };

  for (const element of document.querySelectorAll('*')) {
    visitElement(element);
  }
  return { regions, headings, lists, frames };
}

export interface HeadingNode {
  heading: StructureHeading;
  children: HeadingNode[];
  skipped: boolean;
  extraH1: boolean;
}

export interface HeadingGroup {
  region: StructureRegion | null;
  trees: HeadingNode[];
}

export function buildHeadingTree(headings: StructureHeading[]): HeadingNode[] {
  const roots: HeadingNode[] = [];
  const stack: HeadingNode[] = [];

  for (const heading of headings) {
    const node: HeadingNode = { heading, children: [], skipped: false, extraH1: false };

    while (stack.length > 0 && stack[stack.length - 1].heading.level >= heading.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

export function groupHeadingTrees(
  headings: StructureHeading[],
  regions: StructureRegion[],
): HeadingGroup[] {
  const extraH1 = new Set<StructureHeading>();
  let firstH1Seen = false;
  for (const heading of headings) {
    if (heading.level !== 1) continue;
    if (firstH1Seen) extraH1.add(heading);
    else firstH1Seen = true;
  }

  const skipped = new Set<StructureHeading>();
  let previousLevel: number | null = null;
  for (const heading of headings) {
    if (previousLevel !== null && heading.level > previousLevel + 1) skipped.add(heading);
    previousLevel = heading.level;
  }

  const byRegion = new Map<number | null, StructureHeading[]>();
  for (const heading of headings) {
    const bucket = byRegion.get(heading.regionId);
    if (bucket) bucket.push(heading);
    else byRegion.set(heading.regionId, [heading]);
  }

  const markSkips = (nodes: HeadingNode[], firstSkipUsed: boolean): boolean => {
    let used = firstSkipUsed;
    for (const node of nodes) {
      if (skipped.has(node.heading)) {
        if (used) node.skipped = false;
        else {
          node.skipped = true;
          used = true;
        }
      }
      used = markSkips(node.children, used);
    }
    return used;
  };

  const markExtra = (nodes: HeadingNode[]) => {
    for (const node of nodes) {
      if (extraH1.has(node.heading)) node.extraH1 = true;
      markExtra(node.children);
    }
  };

  const groups: HeadingGroup[] = regions
    .map((region, id) => {
      const trees = buildHeadingTree(byRegion.get(id) ?? []);
      markSkips(trees, false);
      markExtra(trees);
      return { region, trees };
    })
    .filter((group) => group.trees.length > 0);

  const ungrouped = buildHeadingTree(byRegion.get(null) ?? []);
  markSkips(ungrouped, false);
  markExtra(ungrouped);
  if (ungrouped.length > 0) groups.push({ region: null, trees: ungrouped });

  return groups;
}

const STRUCTURE_PARTS = ['regions', 'headings', 'lists', 'frames'] as const;
type StructurePart = (typeof STRUCTURE_PARTS)[number];

const inputSchema = {
  sessionId: sessionIdSchema,
  include: z
    .array(z.enum(STRUCTURE_PARTS))
    .optional()
    .describe(
      "Optional subset of categories to return: 'regions' | 'headings' | 'lists' | 'frames'. " +
        'Defaults to all four. Counts always cover every category.',
    ),
};

export const getStructureTool: ToolDefinition<typeof inputSchema> = {
  name: 'get_structure',
  title: 'Get page structure',
  description:
    'Reads the page structure: landmark regions, headings, ' +
    'lists (nested) and iframes, each with a shadow-piercing selector. A heading outline grouped ' +
    'by region with skipped-level and repeated-H1 flags is included when both regions and headings ' +
    'are returned. Top frame only, open shadow roots only.',
  inputSchema,
  tier: 'free',
  handler: async (args, context) => {
    const page = context.session.page;
    const structure = await page.evaluate(collectStructure);

    const requested = new Set<StructurePart>(args.include ?? STRUCTURE_PARTS);
    const counts = {
      regions: structure.regions.length,
      headings: structure.headings.length,
      lists: structure.lists.length,
      frames: structure.frames.length,
    };

    const includeHeadings = requested.has('headings') && requested.has('regions');

    return jsonContent({
      actionId: context.actionId,
      url: page.url(),
      counts,
      ...(requested.has('regions') ? { regions: structure.regions } : {}),
      ...(requested.has('headings') ? { headings: structure.headings } : {}),
      ...(requested.has('lists') ? { lists: structure.lists } : {}),
      ...(requested.has('frames') ? { frames: structure.frames } : {}),
      ...(includeHeadings
        ? { headingGroups: groupHeadingTrees(structure.headings, structure.regions) }
        : {}),
    });
  },
};
