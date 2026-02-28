import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { generatePath } from "../utils/mouse-path.js";
import {
  Computer,
  ComputerOptions,
  Environment,
  MouseButton,
  Point,
} from "./computer.js";
import { installMouseHelper } from "../utils/mouse-helper.js";
import { compressImage } from "../utils/compress-image.js";

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

const TYPING_CHUNK_SIZE = 3;
const TYPING_DELAY_MS = 100;

// ---------------------------------------------------------------------------
// PlaywrightComputer options
// ---------------------------------------------------------------------------

export interface PlaywrightComputerOptions extends ComputerOptions {
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
  private lastMousePos: Point = { x: 0, y: 0 };

  constructor(options: PlaywrightComputerOptions = {}) {
    this.headless = options.headless ?? false;
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

    if (this.virtualCursor && this.context) {
      await installMouseHelper(this.context);
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
    const buf = await page.screenshot();
    const compressed = await compressImage(buf);
    return compressed.toString("base64");
  }

  async screenshotRegion(p1: Point, p2: Point): Promise<string> {
    this.isWithinBounds(p1.x, p1.y);
    this.isWithinBounds(p2.x, p2.y);
    const page = this.requirePage();
    const xMin = Math.max(0, Math.min(p1.x, p2.x));
    const yMin = Math.max(0, Math.min(p1.y, p2.y));
    const width = Math.max(1, Math.abs(p1.x - p2.x));
    const height = Math.max(1, Math.abs(p1.y - p2.y));

    const buf = await page.screenshot({
      clip: { x: xMin, y: yMin, width, height },
    });
    const compressed = await compressImage(buf);
    return compressed.toString("base64");
  }

  async click(
    x: number,
    y: number,
    button: MouseButton = "left",
  ): Promise<void> {
    const page = this.requirePage();
    await this.move(x, y);

    const mapping: Record<string, "left" | "right" | "middle"> = {
      left: "left",
      right: "right",
      middle: "middle",
    };
    await page.mouse.click(x, y, { button: mapping[button] ?? "left" });
  }

  async doubleClick(x: number, y: number): Promise<void> {
    const page = this.requirePage();
    await this.move(x, y);
    await page.mouse.dblclick(x, y);
  }

  async scroll(
    x: number,
    y: number,
    scrollX: number,
    scrollY: number,
  ): Promise<void> {
    this.isWithinBounds(x, y);
    const page = this.requirePage();
    await this.move(x, y);
    // Playwright's mouse.wheel is usually more reliable for "computer use"
    // than page.evaluate(() => window.scrollBy)
    await page.mouse.wheel(scrollX, scrollY);
  }

  async type(text: string): Promise<void> {
    const page = this.requirePage();
    for (let i = 0; i < text.length; i += TYPING_CHUNK_SIZE) {
      const chunk = text.slice(i, i + TYPING_CHUNK_SIZE);
      await page.keyboard.type(chunk);
      await this.wait(chunk.length * TYPING_DELAY_MS);
    }
  }

  async wait(ms = 1000): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async move(x: number, y: number): Promise<void> {
    this.isWithinBounds(x, y);
    const page = this.requirePage();
    const target = { x, y };
    const trajectory = generatePath(this.lastMousePos, target);

    for (const point of trajectory) {
      await page.mouse.move(point.x, point.y);
    }
    this.lastMousePos = target;
  }

  private isWithinBounds(x: number, y: number): void {
    if (x < 0 || x > this.width || y < 0 || y > this.height) {
      throw new Error(
        `Coordinates (${x}, ${y}) are outside viewport bounds (${this.width}x${this.height})`,
      );
    }
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
    for (const pt of path) {
      this.isWithinBounds(pt.x, pt.y);
    }

    const page = this.requirePage();

    await this.move(path[0].x, path[0].y);
    await page.mouse.down();
    for (const { x, y } of path.slice(1)) {
      await this.move(x, y);
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
