import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { Computer, Environment, MouseButton, Point } from "./computer.js";

// ---------------------------------------------------------------------------
// CUA / friendly key names → Playwright key identifiers
// See: https://playwright.dev/docs/api/class-keyboard
// ---------------------------------------------------------------------------

const KEY_MAP: Record<string, string> = {
  "/": "Divide",
  "\\": "Backslash",
  alt: "Alt",
  option: "Alt",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  arrowup: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  backspace: "Backspace",
  capslock: "CapsLock",
  cmd: "Meta",
  command: "Meta",
  meta: "Meta",
  super: "Meta",
  win: "Meta",
  ctrl: "Control",
  control: "Control",
  delete: "Delete",
  end: "End",
  enter: "Enter",
  return: "Enter",
  esc: "Escape",
  escape: "Escape",
  home: "Home",
  insert: "Insert",
  pagedown: "PageDown",
  pageup: "PageUp",
  shift: "Shift",
  space: " ",
  tab: "Tab",
};

// ---------------------------------------------------------------------------
// PlaywrightComputer options
// ---------------------------------------------------------------------------

export interface PlaywrightComputerOptions {
  /** Run the browser headlessly. Default `false`. */
  headless?: boolean;

  /**
   * Browser channel to use. Default `"chrome"` (system-installed Google Chrome).
   *
   * Other values: `"chrome-beta"`, `"chrome-dev"`, `"chrome-canary"`,
   * `"msedge"`, or `"chromium"` (Playwright's bundled Chromium).
   */
  channel?: string;

  /** URL to navigate to on startup. Default `"about:blank"`. */
  startUrl?: string;

  /** Viewport / window width. Default `1024`. */
  width?: number;

  /** Viewport / window height. Default `768`. */
  height?: number;

  /** Enable a virtual mouse cursor in the browser. Default `false`. */
  virtualCursor?: boolean;
}

// ---------------------------------------------------------------------------
// PlaywrightComputer
// ---------------------------------------------------------------------------

/**
 * Browser-only Computer implementation powered by Playwright.
 *
 * Launches a local Chrome instance, exposes the standard Computer interface
 * against the browser viewport, and adds `goto()`, `back()`, and `forward()`
 * helpers for direct navigation.
 *
 * **Lifecycle**: call {@link start} before using and {@link stop} when done.
 *
 * ```ts
 * const computer = new PlaywrightComputer({ channel: "chrome" });
 * await computer.start();
 * // ... use computer ...
 * await computer.stop();
 * ```
 */
export class PlaywrightComputer implements Computer {
  private readonly headless: boolean;
  private readonly channel: string;
  private readonly startUrl: string;
  private readonly width: number;
  private readonly height: number;
  private readonly virtualCursor: boolean;

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(options: PlaywrightComputerOptions = {}) {
    this.headless = options.headless ?? true;
    this.channel = options.channel ?? "chrome";
    this.startUrl = options.startUrl ?? "about:blank";
    this.width = options.width ?? 1024;
    this.height = options.height ?? 768;
    this.virtualCursor = options.virtualCursor ?? false;
  }

  // ---- lifecycle --------------------------------------------------------

  /** Launch the browser and navigate to the start URL. */
  async start(): Promise<void> {
    this.browser = await chromium.launch({
      channel: this.channel === "chromium" ? undefined : this.channel,
      headless: this.headless,
      args: [
        `--window-size=${this.width},${this.height}`,
        "--disable-extensions",
        "--disable-file-system",
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: this.width, height: this.height },
    });

    if (this.virtualCursor) {
      await this.context.addInitScript(`
        if (window.self === window.top) {
          function initCursor() {
            const CURSOR_ID = '__vcursor__';
            if (document.getElementById(CURSOR_ID)) return;

            const cursor = document.createElement('div');
            cursor.id = CURSOR_ID;
            Object.assign(cursor.style, {
              position: 'fixed',
              top: '0px',
              left: '0px',
              width: '20px',
              height: '20px',
              backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 28 28\\' fill=\\'black\\' stroke=\\'white\\' stroke-width=\\'1.5\\' stroke-linejoin=\\'round\\' stroke-linecap=\\'round\\'><path d=\\'M3,3l0,21.3l6.3-6.3l3.7,8.7l3.2-1.4l-3.7-8.7l8.7,0L3,3z\\'/></svg>")',
              backgroundSize: 'cover',
              pointerEvents: 'none',
              zIndex: '999999',
              transform: 'translate(-2px, -2px)',
            });

            document.body.appendChild(cursor);

            document.addEventListener('mousemove', (e) => {
              cursor.style.top = e.clientY + 'px';
              cursor.style.left = e.clientX + 'px';
            });
          }

          requestAnimationFrame(function checkBody() {
            if (document.body) {
              initCursor();
            } else {
              requestAnimationFrame(checkBody);
            }
          });
        }
      `);
    }

    // Track new pages (popups, target=_blank, etc.)
    this.context.on("page", (newPage) => this.handleNewPage(newPage));

    this.page = await this.context.newPage();
    this.page.on("close", (closedPage) => this.handlePageClose(closedPage));

    if (this.startUrl !== "about:blank") {
      await this.page.goto(this.startUrl);
    }
  }

  /** Shut down the browser. */
  async stop(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  // ---- page tracking ----------------------------------------------------

  private handleNewPage(page: Page): void {
    this.page = page;
    page.on("close", (p) => this.handlePageClose(p));
  }

  private handlePageClose(closedPage: Page): void {
    if (this.page !== closedPage) return;

    const pages = this.context?.pages() ?? [];
    this.page = pages.length > 0 ? pages[pages.length - 1] : null;
  }

  // ---- Computer interface -----------------------------------------------

  private requirePage(): Page {
    if (!this.page) {
      throw new Error(
        "PlaywrightComputer: no active page. Call start() first.",
      );
    }
    return this.page;
  }

  getEnvironment(): Environment {
    return "browser";
  }

  async getDimensions(): Promise<[number, number]> {
    return [this.width, this.height];
  }

  async screenshot(): Promise<string> {
    const page = this.requirePage();
    const buf = await page.screenshot({ fullPage: false });
    return buf.toString("base64");
  }

  async screenshotRegion(p1: Point, p2: Point): Promise<string> {
    const page = this.requirePage();
    const xMin = Math.max(0, Math.min(p1.x, p2.x));
    const yMin = Math.max(0, Math.min(p1.y, p2.y));
    const xMax = Math.min(this.width, Math.max(p1.x, p2.x));
    const yMax = Math.min(this.height, Math.max(p1.y, p2.y));

    const width = Math.max(1, xMax - xMin);
    const height = Math.max(1, yMax - yMin);

    const buf = await page.screenshot({
      clip: { x: xMin, y: yMin, width, height },
    });
    return buf.toString("base64");
  }

  async click(
    x: number,
    y: number,
    button: MouseButton = "left",
  ): Promise<void> {
    const page = this.requirePage();
    const mapping: Record<string, "left" | "right" | "middle"> = {
      left: "left",
      right: "right",
      middle: "middle",
    };
    await page.mouse.click(x, y, { button: mapping[button] ?? "left" });
  }

  async doubleClick(x: number, y: number): Promise<void> {
    const page = this.requirePage();
    await page.mouse.dblclick(x, y);
  }

  async scroll(
    x: number,
    y: number,
    scrollX: number,
    scrollY: number,
  ): Promise<void> {
    const page = this.requirePage();
    await page.mouse.move(x, y);
    await page.evaluate(`window.scrollBy(${scrollX}, ${scrollY})`);
  }

  async type(text: string): Promise<void> {
    const page = this.requirePage();
    await page.keyboard.type(text);
  }

  async wait(ms = 1000): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async move(x: number, y: number): Promise<void> {
    const page = this.requirePage();
    await page.mouse.move(x, y);
  }

  async keypress(keys: string[]): Promise<void> {
    const page = this.requirePage();
    const mapped = keys.map((k) => KEY_MAP[k.toLowerCase()] ?? k);

    // Press all keys down, then release in reverse order
    for (const key of mapped) {
      await page.keyboard.down(key);
    }
    for (const key of mapped.reverse()) {
      await page.keyboard.up(key);
    }
  }

  async drag(path: Point[]): Promise<void> {
    if (path.length === 0) return;
    const page = this.requirePage();

    await page.mouse.move(path[0].x, path[0].y);
    await page.mouse.down();
    for (const { x, y } of path.slice(1)) {
      await page.mouse.move(x, y);
    }
    await page.mouse.up();
  }

  async getCurrentUrl(): Promise<string | null> {
    return this.page?.url() ?? null;
  }

  // ---- extra browser actions --------------------------------------------

  /** Navigate to a URL. */
  async goto(url: string): Promise<void> {
    const page = this.requirePage();
    try {
      await page.goto(url);
    } catch (err) {
      console.error(`PlaywrightComputer: error navigating to ${url}:`, err);
    }
  }

  /** Go back in browser history. */
  async back(): Promise<void> {
    const page = this.requirePage();
    await page.goBack();
  }

  /** Go forward in browser history. */
  async forward(): Promise<void> {
    const page = this.requirePage();
    await page.goForward();
  }
}
