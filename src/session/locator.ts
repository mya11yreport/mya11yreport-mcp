import type { Locator, Page } from 'playwright';
import { z } from 'zod';

const roleOptionsSchema = z.object({
  name: z.string().optional(),
  exact: z.boolean().optional(),
  checked: z.boolean().optional(),
  disabled: z.boolean().optional(),
  expanded: z.boolean().optional(),
  includeHidden: z.boolean().optional(),
  level: z.number().int().optional(),
  pressed: z.boolean().optional(),
  selected: z.boolean().optional(),
});

const textOptionsSchema = z.object({ exact: z.boolean().optional() });

const textArgs = z.tuple([z.string(), textOptionsSchema.optional()]);

export const locatorFnSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('getByRole'), args: z.tuple([z.string(), roleOptionsSchema.optional()]) }),
  z.object({ name: z.literal('getByText'), args: textArgs }),
  z.object({ name: z.literal('getByLabel'), args: textArgs }),
  z.object({ name: z.literal('getByPlaceholder'), args: textArgs }),
  z.object({ name: z.literal('getByAltText'), args: textArgs }),
  z.object({ name: z.literal('getByTitle'), args: textArgs }),
]);

export const locatorTargetSchema = z
  .union([
    z.object({ selector: z.string().min(1).describe("Playwright selector, e.g. '#id', 'css=...', 'xpath=...'") }),
    z.object({ fn: locatorFnSchema.describe('Locator method call, mirroring page.getBy*(...)') }),
  ])
  .describe(
    'How to locate the element: {"selector": "#id"} or {"fn": {"name": "getByRole", "args": ["button", {"name": "Sign in"}]}}.',
  );

export type LocatorTarget = z.output<typeof locatorTargetSchema>;

/**
 * Resolves a tool target into a Playwright Locator: either a raw selector or
 * one of the page.getBy* accessibility-first methods with verbatim args.
 */
export function resolveLocator(page: Page, target: LocatorTarget): Locator {
  if ('selector' in target) {
    return page.locator(target.selector);
  }
  const { name, args } = target.fn;
  const [first, second] = args;
  switch (name) {
    case 'getByRole':
      return page.getByRole(first as Parameters<Page['getByRole']>[0], second);
    case 'getByText':
      return page.getByText(first, second);
    case 'getByLabel':
      return page.getByLabel(first, second);
    case 'getByPlaceholder':
      return page.getByPlaceholder(first, second);
    case 'getByAltText':
      return page.getByAltText(first, second);
    case 'getByTitle':
      return page.getByTitle(first, second);
  }
}
