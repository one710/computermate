import robot from "robotjs";
import { Monitor } from "node-screenshots";
import { Computer, Environment, MouseButton, Point } from "./computer.js";
import { path as generatePath } from "ghost-cursor";

// ---------------------------------------------------------------------------
// robotjs key mapping
// ---------------------------------------------------------------------------

const KEY_MAP: Record<string, string> = {
  enter: "enter",
  return: "enter",
  tab: "tab",
  space: "space",
  backspace: "backspace",
  delete: "delete",
  escape: "escape",
  esc: "escape",
  left: "left",
  right: "right",
  up: "up",
  down: "down",
  home: "home",
  end: "end",
  pageup: "pageup",
  pagedown: "pagedown",
  alt: "alt",
  option: "alt",
  ctrl: "control",
  control: "control",
  shift: "shift",
  command: "command",
  cmd: "command",
  meta: "command",
  f1: "f1",
  f2: "f2",
  f3: "f3",
  f4: "f4",
  f5: "f5",
  f6: "f6",
  f7: "f7",
  f8: "f8",
  f9: "f9",
  f10: "f10",
  f11: "f11",
  f12: "f12",
};

/**
 * Unified Computer implementation using robotjs and node-screenshots.
 * Works across MacOS, Windows, and Linux.
 */
export class NativeComputer implements Computer {
  private cachedDimensions: [number, number] | null = null;
  private lastMousePos: Point;

  constructor() {
    const pos = robot.getMousePos();
    this.lastMousePos = { x: pos.x, y: pos.y };
  }

  getEnvironment(): Environment {
    switch (process.platform) {
      case "darwin":
        return "macos";
      case "win32":
        return "windows";
      default:
        return "linux";
    }
  }

  async getDimensions(): Promise<[number, number]> {
    if (this.cachedDimensions) return this.cachedDimensions;

    try {
      const monitors = Monitor.all();
      const primary =
        monitors.find((m: Monitor) => m.isPrimary()) || monitors[0];
      if (primary) {
        this.cachedDimensions = [primary.width(), primary.height()];
        return this.cachedDimensions;
      }
      throw new Error("No monitor found");
    } catch (error) {
      console.error("Failed to get dimensions:", error);
      // Fallback
      return [1280, 800];
    }
  }

  async screenshot(): Promise<string> {
    const monitors = Monitor.all();
    const primary = monitors.find((m: Monitor) => m.isPrimary()) || monitors[0];
    if (!primary) throw new Error("No monitor found");
    const image = await primary.captureImage();
    const pngBuf = await image.toPng();
    return pngBuf.toString("base64");
  }

  async screenshotRegion(p1: Point, p2: Point): Promise<string> {
    const monitors = Monitor.all();
    const primary = monitors.find((m: Monitor) => m.isPrimary()) || monitors[0];
    if (!primary) throw new Error("No monitor found");

    const xMin = Math.max(0, Math.min(p1.x, p2.x));
    const yMin = Math.max(0, Math.min(p1.y, p2.y));
    const xMax = Math.min(primary.width(), Math.max(p1.x, p2.x));
    const yMax = Math.min(primary.height(), Math.max(p1.y, p2.y));

    const w = Math.max(1, xMax - xMin);
    const h = Math.max(1, yMax - yMin);

    const image = await primary.captureImage();
    const cropped = await image.crop(xMin, yMin, w, h);
    const pngBuf = await cropped.toPng();
    return pngBuf.toString("base64");
  }

  async click(
    x: number,
    y: number,
    button: MouseButton = "left",
  ): Promise<void> {
    await this.move(x, y);
    robot.mouseClick(button);
  }

  async doubleClick(x: number, y: number): Promise<void> {
    await this.move(x, y);
    robot.mouseClick("left", true);
  }

  async scroll(
    x: number,
    y: number,
    scrollX: number,
    scrollY: number,
  ): Promise<void> {
    await this.move(x, y);
    robot.scrollMouse(scrollX, scrollY);
  }

  async type(text: string): Promise<void> {
    robot.typeString(text);
  }

  async wait(ms = 1000): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async move(x: number, y: number): Promise<void> {
    const target = { x, y };
    const trajectory = generatePath(this.lastMousePos, target);

    for (const point of trajectory) {
      robot.moveMouse(point.x, point.y);
    }
    this.lastMousePos = target;
  }

  async keypress(keys: string[]): Promise<void> {
    const modifiers: string[] = [];
    let mainKey: string | null = null;

    for (const k of keys) {
      const lower = k.toLowerCase();
      const mapped = KEY_MAP[lower] || lower;
      if (["alt", "control", "shift", "command"].includes(mapped) && !mainKey) {
        modifiers.push(mapped);
      } else {
        mainKey = mapped;
      }
    }

    if (mainKey) {
      robot.keyTap(mainKey, modifiers);
    }
  }

  async drag(path: Point[]): Promise<void> {
    if (path.length < 2) return;

    await this.move(path[0].x, path[0].y);
    robot.mouseToggle("down", "left");

    for (const pt of path.slice(1)) {
      await this.move(pt.x, pt.y);
    }

    robot.mouseToggle("up", "left");
  }
}
