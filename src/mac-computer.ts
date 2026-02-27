import { execSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Computer, Environment, MouseButton, Point } from "./computer.js";

// ---------------------------------------------------------------------------
// Key mapping — friendly / CUA names → AppleScript key-code + modifiers
//
// AppleScript uses *key code* for special keys and *keystroke* for printable
// characters.  For modifier combos we use `using {control down, …}`.
// ---------------------------------------------------------------------------

/** Maps a friendly name to the AppleScript key-code integer. */
const SPECIAL_KEY_CODES: Record<string, number> = {
  return: 36,
  enter: 36,
  tab: 48,
  space: 49,
  delete: 51,
  backspace: 51,
  escape: 53,
  esc: 53,
  left: 123,
  arrowleft: 123,
  right: 124,
  arrowright: 124,
  down: 125,
  arrowdown: 125,
  up: 126,
  arrowup: 126,
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,
  insert: 114,
  capslock: 57,

  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111,
};

/** Modifier display names → AppleScript modifier phrase. */
const MODIFIER_MAP: Record<string, string> = {
  ctrl: "control down",
  control: "control down",
  alt: "option down",
  option: "option down",
  shift: "shift down",
  cmd: "command down",
  command: "command down",
  meta: "command down",
  super: "command down",
  win: "command down",
};

// ---------------------------------------------------------------------------
// Mouse-button mapping for cliclick
// ---------------------------------------------------------------------------

const CLICLICK_BUTTON: Record<MouseButton, string> = {
  left: "", // cliclick default
  middle: "", // cliclick has no middle-button support; fall back to left
  right: "-r ", // right-click flag
};

// ---------------------------------------------------------------------------
// MacComputer
// ---------------------------------------------------------------------------

/**
 * Computer implementation for macOS.
 *
 * Uses:
 * - `screencapture` for screenshots
 * - `cliclick` (https://github.com/BlueM/cliclick) for mouse automation
 * - `osascript` / AppleScript for keyboard input
 *
 * Requires macOS and `cliclick` to be installed (`brew install cliclick`).
 */
export class MacComputer implements Computer {
  private cachedDimensions: [number, number] | null = null;
  // ---- helpers ----------------------------------------------------------

  private exec(cmd: string): string {
    return execSync(cmd, { encoding: "utf-8" }).trim();
  }

  private osascript(script: string): string {
    // -e takes an inline script
    const safe = script.replace(/'/g, "'\\''");
    return this.exec(`osascript -e '${safe}'`);
  }

  private getTempPath(): string {
    const filename = `computermate_${randomBytes(8).toString("hex")}.png`;
    return join(tmpdir(), filename);
  }

  // ---- Computer interface -----------------------------------------------

  getEnvironment(): Environment {
    return "mac";
  }

  async getDimensions(): Promise<[number, number]> {
    if (this.cachedDimensions) return this.cachedDimensions;

    try {
      const script =
        'tell application "Finder" to get bounds of window of desktop';
      const result = this.osascript(script); // "0, 0, 1920, 1080"
      const parts = result.split(",").map((s) => Number(s.trim()));
      if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
        this.cachedDimensions = [parts[2], parts[3]];
        return this.cachedDimensions;
      }
    } catch {
      // ignore
    }

    // Fallback: use system_profiler
    try {
      const raw = this.exec(
        "system_profiler SPDisplaysDataType | grep Resolution",
      );
      const match = raw.match(/(\d+)\s*x\s*(\d+)/);
      if (match) {
        this.cachedDimensions = [Number(match[1]), Number(match[2])];
        return this.cachedDimensions;
      }
    } catch {
      // ignore
    }

    return [1920, 1080]; // sensible default
  }

  async screenshot(): Promise<string> {
    const tmp = this.getTempPath();
    try {
      this.exec(`screencapture -x ${tmp}`);
      const buf = readFileSync(tmp);
      return buf.toString("base64");
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        // ignore
      }
    }
  }

  async screenshotRegion(p1: Point, p2: Point): Promise<string> {
    const [sw, sh] = await this.getDimensions();
    const xMin = Math.max(0, Math.min(p1.x, p2.x));
    const yMin = Math.max(0, Math.min(p1.y, p2.y));
    const xMax = Math.min(sw, Math.max(p1.x, p2.x));
    const yMax = Math.min(sh, Math.max(p1.y, p2.y));

    const w = Math.max(1, xMax - xMin);
    const h = Math.max(1, yMax - yMin);

    const tmp = this.getTempPath();
    try {
      // screencapture -R x,y,w,h
      this.exec(`screencapture -x -R${xMin},${yMin},${w},${h} ${tmp}`);
      const buf = readFileSync(tmp);
      return buf.toString("base64");
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        // ignore
      }
    }
  }

  async click(
    x: number,
    y: number,
    button: MouseButton = "left",
  ): Promise<void> {
    const flag = CLICLICK_BUTTON[button] ?? "";
    this.exec(`cliclick ${flag}c:${x},${y}`);
  }

  async doubleClick(x: number, y: number): Promise<void> {
    this.exec(`cliclick dc:${x},${y}`);
  }

  async scroll(
    x: number,
    y: number,
    _scrollX: number,
    scrollY: number,
  ): Promise<void> {
    // Move to position first
    this.exec(`cliclick m:${x},${y}`);

    // cliclick has no scroll command — use CoreGraphics via JXA.
    // CGEventCreateScrollWheelEvent(source, units, wheelCount, delta)
    // Negative delta = scroll down, positive = scroll up
    const delta = scrollY < 0 ? Math.abs(scrollY) : -scrollY;
    this.exec(
      `osascript -l JavaScript -e 'ObjC.import("CoreGraphics"); var e = $.CGEventCreateScrollWheelEvent(null, 0, 1, ${delta}); $.CGEventPost(0, e);'`,
    );
  }

  async type(text: string): Promise<void> {
    // Use AppleScript to type, which handles special characters better
    const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    this.osascript(
      `tell application "System Events" to keystroke "${escaped}"`,
    );
  }

  async wait(ms = 1000): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async move(x: number, y: number): Promise<void> {
    this.exec(`cliclick m:${x},${y}`);
  }

  async keypress(keys: string[]): Promise<void> {
    // Separate modifiers from the main key
    const modifiers: string[] = [];
    let mainKey: string | null = null;

    for (const k of keys) {
      const lower = k.toLowerCase();
      if (MODIFIER_MAP[lower]) {
        modifiers.push(MODIFIER_MAP[lower]);
      } else {
        mainKey = lower;
      }
    }

    const modClause =
      modifiers.length > 0 ? ` using {${modifiers.join(", ")}}` : "";

    if (mainKey && SPECIAL_KEY_CODES[mainKey] !== undefined) {
      // Special key → key code
      this.osascript(
        `tell application "System Events" to key code ${SPECIAL_KEY_CODES[mainKey]}${modClause}`,
      );
    } else if (mainKey) {
      // Printable character → keystroke
      this.osascript(
        `tell application "System Events" to keystroke "${mainKey}"${modClause}`,
      );
    } else if (modifiers.length > 0) {
      // Modifier-only press (rare but possible)
      this.osascript(
        `tell application "System Events" to key code 0${modClause}`,
      );
    }
  }

  async drag(path: Point[]): Promise<void> {
    if (path.length < 2) return;

    const start = path[0];
    const end = path[path.length - 1];

    // cliclick dd (drag down) at start, then dm (drag move) through
    // intermediate points, then du (drag up) at end
    this.exec(`cliclick dd:${start.x},${start.y}`);

    for (const pt of path.slice(1, -1)) {
      this.exec(`cliclick dm:${pt.x},${pt.y}`);
    }

    this.exec(`cliclick du:${end.x},${end.y}`);
  }
}
