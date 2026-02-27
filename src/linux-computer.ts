import { execSync } from "node:child_process";
import { Computer, Environment, MouseButton, Point } from "./computer.js";

// ---------------------------------------------------------------------------
// Key name mapping — CUA / friendly names → xdotool key names
// ---------------------------------------------------------------------------

const KEY_MAP: Record<string, string> = {
  enter: "Return",
  return: "Return",
  left: "Left",
  right: "Right",
  up: "Up",
  down: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  arrowup: "Up",
  arrowdown: "Down",
  esc: "Escape",
  escape: "Escape",
  space: "space",
  backspace: "BackSpace",
  delete: "Delete",
  tab: "Tab",
  home: "Home",
  end: "End",
  pageup: "Page_Up",
  pagedown: "Page_Down",
  capslock: "Caps_Lock",
  insert: "Insert",

  // Modifiers
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  shift: "shift",
  super: "super",
  meta: "super",
  cmd: "super",
  win: "super",
};

// ---------------------------------------------------------------------------
// Mouse-button mapping
// ---------------------------------------------------------------------------

const MOUSE_BUTTON_MAP: Record<MouseButton, number> = {
  left: 1,
  middle: 2,
  right: 3,
};

// ---------------------------------------------------------------------------
// LinuxComputer
// ---------------------------------------------------------------------------

/**
 * Computer implementation for Linux / X11 environments.
 *
 * Uses `xdotool` for input automation and ImageMagick `import` for
 * screenshots. Designed to run inside the Docker container (Xvfb + fluxbox).
 */
export class LinuxComputer implements Computer {
  private readonly display: string;
  private cachedDimensions: [number, number] | null = null;

  constructor(display?: string) {
    this.display = display ?? process.env.DISPLAY ?? ":99";
  }

  // ---- helpers ----------------------------------------------------------

  private exec(cmd: string): string {
    return execSync(cmd, {
      env: { ...process.env, DISPLAY: this.display },
      encoding: "utf-8",
    }).trim();
  }

  // ---- Computer interface -----------------------------------------------

  getEnvironment(): Environment {
    return "linux";
  }

  async getDimensions(): Promise<[number, number]> {
    if (this.cachedDimensions) return this.cachedDimensions;

    try {
      const geometry = this.exec("xdotool getdisplaygeometry");
      const [w, h] = geometry.split(/\s+/).map(Number);
      if (w > 0 && h > 0) {
        this.cachedDimensions = [w, h];
        return this.cachedDimensions;
      }
      throw new Error("Invalid dimensions");
    } catch {
      return [1280, 800]; // fallback
    }
  }

  async screenshot(): Promise<string> {
    // ImageMagick `import` grabs the root window and pipes base64 PNG to stdout.
    return this.exec("import -window root png:- | base64 -w 0");
  }

  async screenshotRegion(p1: Point, p2: Point): Promise<string> {
    const [sw, sh] = await this.getDimensions();
    const xMin = Math.max(0, Math.min(p1.x, p2.x));
    const yMin = Math.max(0, Math.min(p1.y, p2.y));
    const xMax = Math.min(sw, Math.max(p1.x, p2.x));
    const yMax = Math.min(sh, Math.max(p1.y, p2.y));

    const w = Math.max(1, xMax - xMin);
    const h = Math.max(1, yMax - yMin);

    // Geometry format: widthxheight+x+y
    return this.exec(
      `import -window root -crop ${w}x${h}+${xMin}+${yMin} png:- | base64 -w 0`,
    );
  }

  async click(
    x: number,
    y: number,
    button: MouseButton = "left",
  ): Promise<void> {
    const b = MOUSE_BUTTON_MAP[button] ?? 1;
    this.exec(`xdotool mousemove ${x} ${y} click ${b}`);
  }

  async doubleClick(x: number, y: number): Promise<void> {
    this.exec(`xdotool mousemove ${x} ${y} click --repeat 2 1`);
  }

  async scroll(
    x: number,
    y: number,
    _scrollX: number,
    scrollY: number,
  ): Promise<void> {
    this.exec(`xdotool mousemove ${x} ${y}`);

    // xdotool button 4 = scroll up, 5 = scroll down
    const clicks = Math.abs(scrollY);
    const btn = scrollY < 0 ? 4 : 5;
    for (let i = 0; i < clicks; i++) {
      this.exec(`xdotool click ${btn}`);
    }
  }

  async type(text: string): Promise<void> {
    // Escape single quotes for the shell: ' → '\''
    const safe = text.replace(/'/g, "'\\''");
    this.exec(`xdotool type -- '${safe}'`);
  }

  async wait(ms = 1000): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async move(x: number, y: number): Promise<void> {
    this.exec(`xdotool mousemove ${x} ${y}`);
  }

  async keypress(keys: string[]): Promise<void> {
    const mapped = keys.map((k) => KEY_MAP[k.toLowerCase()] ?? k);
    const combo = mapped.join("+");
    this.exec(`xdotool key ${combo}`);
  }

  async drag(path: Point[]): Promise<void> {
    if (path.length === 0) return;

    const { x: sx, y: sy } = path[0];
    this.exec(`xdotool mousemove ${sx} ${sy} mousedown 1`);

    for (const { x, y } of path.slice(1)) {
      this.exec(`xdotool mousemove ${x} ${y}`);
    }

    this.exec("xdotool mouseup 1");
  }
}
