/**
 * Shared types and the Computer interface that all platform implementations must satisfy.
 *
 * Designed for LLM computer-use agents: every action the model might need
 * (screenshot, click, type, drag, etc.) is represented as an async method.
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type MouseButton = "left" | "middle" | "right";

export type Environment = "windows" | "mac" | "linux" | "browser";

export interface Point {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Computer interface
// ---------------------------------------------------------------------------

export interface Computer {
  /** Which OS / environment this implementation targets. */
  getEnvironment(): Environment;

  /** Returns the screen (or viewport) dimensions as [width, height]. */
  getDimensions(): Promise<[width: number, height: number]>;

  /** Capture a screenshot and return it as a base64-encoded PNG string. */
  screenshot(): Promise<string>;

  /** Move the pointer to (x, y) and perform a mouse click. */
  click(x: number, y: number, button?: MouseButton): Promise<void>;

  /** Move the pointer to (x, y) and double-click. */
  doubleClick(x: number, y: number): Promise<void>;

  /** Move the pointer to (x, y) and scroll by the given deltas. */
  scroll(x: number, y: number, scrollX: number, scrollY: number): Promise<void>;

  /** Type the given text string as keyboard input. */
  type(text: string): Promise<void>;

  /** Wait for the specified number of milliseconds (default 1 000). */
  wait(ms?: number): Promise<void>;

  /** Move the pointer to (x, y) without clicking. */
  move(x: number, y: number): Promise<void>;

  /**
   * Press a key combination.
   *
   * Each element in `keys` is a key name (e.g. `"ctrl"`, `"a"`, `"Enter"`).
   * For combos like Ctrl+C, pass `["ctrl", "c"]`.
   */
  keypress(keys: string[]): Promise<void>;

  /**
   * Perform a drag along the given path of points.
   *
   * The first point is where the mouse button is pressed down; the last is
   * where it is released.
   */
  drag(path: Point[]): Promise<void>;
}
