import robot from "robotjs";
import { Monitor } from "node-screenshots";
import { generatePath } from "../utils/mouse-path.js";
import {
  Computer,
  ComputerOptions,
  Environment,
  MouseButton,
  Point,
} from "./computer.js";
import { compressImage } from "../utils/compress-image.js";

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

const TYPING_CHUNK_SIZE = 3;
const TYPING_DELAY_MS = 100;

export interface NativeComputerOptions extends ComputerOptions {}

/**
 * Unified Computer implementation using robotjs and node-screenshots.
 * Works across MacOS, Windows, and Linux.
 */
export class NativeComputer implements Computer {
  private cachedDimensions: [number, number] | null = null;
  private lastMousePos: Point;
  private targetWidth: number | null = null;
  private targetHeight: number | null = null;
  private scalingFactor: number = 1;

  constructor(options: NativeComputerOptions = {}) {
    const pos = robot.getMousePos();
    this.lastMousePos = { x: pos.x, y: pos.y };

    if (options.maxScalingDimension) {
      const [w, h] = options.maxScalingDimension
        .split("x")
        .map((s) => parseInt(s, 10));
      this.initializeScaling(w || null, h || null);
    }
  }

  private async initializeScaling(
    maxW: number | null,
    maxH: number | null,
  ): Promise<void> {
    const [realW, realH] = await this.getDimensions();
    const ratio = realW / realH;

    if (maxW && maxH) {
      // Fit into both, preserving aspect ratio
      const scaleW = maxW / realW;
      const scaleH = maxH / realH;
      const scale = Math.min(scaleW, scaleH);

      if (scale < 1) {
        this.scalingFactor = scale;
        this.targetWidth = Math.round(realW * scale);
        this.targetHeight = Math.round(realH * scale);
      }
    } else if (maxW && maxW < realW) {
      this.scalingFactor = maxW / realW;
      this.targetWidth = maxW;
      this.targetHeight = Math.round(maxW / ratio);
    } else if (maxH && maxH < realH) {
      this.scalingFactor = maxH / realH;
      this.targetHeight = maxH;
      this.targetWidth = Math.round(maxH * ratio);
    }

    if (this.targetWidth) {
      console.log(
        `Scaling enabled: ${realW}x${realH} -> ${this.targetWidth}x${this.targetHeight} (factor: ${this.scalingFactor.toFixed(4)})`,
      );
    }
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
    if (this.targetWidth && this.targetHeight) {
      return [this.targetWidth, this.targetHeight];
    }

    if (this.cachedDimensions) return this.cachedDimensions;

    try {
      const monitors = Monitor.all();
      const primary =
        monitors.find((m: Monitor) => m.isPrimary()) || monitors[0];
      if (primary) {
        this.cachedDimensions = [primary.width(), primary.height()];
        return this.cachedDimensions;
      }
    } catch (error) {
      console.warn("Failed to get dimensions via node-screenshots:", error);
    }

    // Fallback to robotjs
    try {
      const size = robot.getScreenSize();
      this.cachedDimensions = [size.width, size.height];
      return this.cachedDimensions;
    } catch (error) {
      console.error("Failed to get dimensions via robotjs:", error);
      return [1280, 800];
    }
  }

  async screenshot(): Promise<string> {
    const monitors = Monitor.all();
    const primary = monitors.find((m: Monitor) => m.isPrimary()) || monitors[0];
    if (!primary) throw new Error("No monitor found");
    const image = await primary.captureImage();
    const pngBuf = await image.toPng();

    const resize =
      this.targetWidth && this.targetHeight
        ? { width: this.targetWidth, height: this.targetHeight }
        : undefined;

    const compressed = await compressImage(pngBuf, resize);
    return compressed.toString("base64");
  }

  async screenshotRegion(p1: Point, p2: Point): Promise<string> {
    const realP1 = this.toRealCoordinate(p1);
    const realP2 = this.toRealCoordinate(p2);

    const monitors = Monitor.all();
    const primary = monitors.find((m: Monitor) => m.isPrimary()) || monitors[0];
    if (!primary) throw new Error("No monitor found");

    const xMin = Math.max(0, Math.min(realP1.x, realP2.x));
    const yMin = Math.max(0, Math.min(realP1.y, realP2.y));
    const xMax = Math.min(primary.width(), Math.max(realP1.x, realP2.x));
    const yMax = Math.min(primary.height(), Math.max(realP1.y, realP2.y));

    const w = Math.max(1, xMax - xMin);
    const h = Math.max(1, yMax - yMin);

    const image = await primary.captureImage();
    const cropped = await image.crop(xMin, yMin, w, h);
    const pngBuf = await cropped.toPng();

    const resize = this.targetWidth
      ? {
          width: Math.round(w * this.scalingFactor),
          height: Math.round(h * this.scalingFactor),
        }
      : undefined;

    const compressed = await compressImage(pngBuf, resize);
    return compressed.toString("base64");
  }

  async click(
    x: number,
    y: number,
    button: MouseButton = "left",
  ): Promise<void> {
    await this.isWithinBounds(x, y);
    await this.move(x, y);
    robot.mouseClick(button);
  }

  async doubleClick(x: number, y: number): Promise<void> {
    await this.isWithinBounds(x, y);
    await this.move(x, y);
    robot.mouseClick("left", true);
  }

  async scroll(
    x: number,
    y: number,
    scrollX: number,
    scrollY: number,
  ): Promise<void> {
    await this.isWithinBounds(x, y);
    await this.move(x, y);
    robot.scrollMouse(scrollX, scrollY);
  }

  async type(text: string): Promise<void> {
    for (let i = 0; i < text.length; i += TYPING_CHUNK_SIZE) {
      const chunk = text.slice(i, i + TYPING_CHUNK_SIZE);
      robot.typeString(chunk);
      await this.wait(chunk.length * TYPING_DELAY_MS);
    }
  }

  async wait(ms = 1000): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async move(x: number, y: number): Promise<void> {
    await this.isWithinBounds(x, y);
    const realTarget = this.toRealCoordinate({ x, y });

    const trajectory = generatePath(this.lastMousePos, realTarget);

    for (const point of trajectory) {
      robot.moveMouse(point.x, point.y);
    }
    this.lastMousePos = realTarget;
  }

  private async isWithinBounds(x: number, y: number): Promise<void> {
    const [width, height] = await this.getDimensions();
    if (x < 0 || x > width || y < 0 || y > height) {
      throw new Error(
        `Coordinates (${x}, ${y}) are outside screen bounds (${width}x${height})`,
      );
    }
  }

  private toRealCoordinate(p: Point): Point {
    return {
      x: Math.round(p.x / this.scalingFactor),
      y: Math.round(p.y / this.scalingFactor),
    };
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

    for (const pt of path) {
      await this.isWithinBounds(pt.x, pt.y);
    }

    await this.move(path[0].x, path[0].y);
    robot.mouseToggle("down", "left");

    for (const pt of path.slice(1)) {
      await this.move(pt.x, pt.y);
    }

    robot.mouseToggle("up", "left");
  }
}
