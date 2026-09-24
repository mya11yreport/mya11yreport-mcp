import { chromium, type Browser } from 'playwright';

/** Default headless mode, overridable via env; a per-call param wins. */
export const DEFAULT_HEADLESS = (process.env.PLAYWRIGHT_HEADLESS ?? 'true') !== 'false';

/**
 * Shared Chromium instances keyed by headless mode (a browser process cannot
 * switch modes after launch). Sessions pick a mode at creation time; each
 * mode is launched lazily and shared by all sessions of that mode.
 */
export class SharedBrowser {
  private browserPromises = new Map<boolean, Promise<Browser>>();

  get(headless: boolean): Promise<Browser> {
    let pending = this.browserPromises.get(headless);
    if (!pending) {
      pending = chromium
        .launch({
          headless,
          channel: 'chromium',
          args: ['--disable-site-isolation-trials'],
        })
        .catch((error: unknown) => {
          this.browserPromises.delete(headless);
          throw new Error(
            `Failed to launch Chromium (headless: ${headless}): ` +
              `${error instanceof Error ? error.message : String(error)}. ` +
              'Ensure browsers are installed with `mya11yreport-mcp install chromium`.',
          );
        });
      this.browserPromises.set(headless, pending);
    }
    return pending;
  }

  async close(): Promise<void> {
    const pending = [...this.browserPromises.values()];
    this.browserPromises.clear();
    for (const promise of pending) {
      const browser = await promise.catch(() => null);
      if (browser) await browser.close().catch(() => undefined);
    }
  }
}
