import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Computer } from "./computer.js";
import { LinuxComputer } from "./linux-computer.js";
import { MacComputer } from "./mac-computer.js";
import { WindowsComputer } from "./windows-computer.js";
import { PlaywrightComputer } from "./playwright-computer.js";

export type ComputerType = "linux" | "mac" | "windows" | "playwright";

// ---------------------------------------------------------------------------
// Computer factory
// ---------------------------------------------------------------------------

export function createComputer(type: ComputerType): Computer {
  switch (type) {
    case "linux":
      return new LinuxComputer();
    case "mac":
      return new MacComputer();
    case "windows":
      return new WindowsComputer();
    case "playwright":
      return new PlaywrightComputer({ channel: "chrome" });
  }
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerTools(server: McpServer, computer: Computer): void {
  // -- screenshot ---------------------------------------------------------
  server.registerTool(
    "screenshot",
    {
      description: "Take a screenshot and return it as a base64-encoded PNG.",
    },
    async () => {
      const base64 = await computer.screenshot();
      return {
        content: [{ type: "image", data: base64, mimeType: "image/png" }],
      };
    },
  );

  // -- click --------------------------------------------------------------
  server.registerTool(
    "click",
    {
      description: "Move the pointer to (x, y) and click.",
      inputSchema: {
        x: z.number().describe("X coordinate"),
        y: z.number().describe("Y coordinate"),
        button: z
          .enum(["left", "middle", "right"])
          .default("left")
          .describe("Mouse button to click"),
      },
    },
    async ({ x, y, button }) => {
      await computer.click(x, y, button);
      return { content: [{ type: "text", text: "Clicked." }] };
    },
  );

  // -- double_click -------------------------------------------------------
  server.registerTool(
    "double_click",
    {
      description: "Move the pointer to (x, y) and double-click.",
      inputSchema: {
        x: z.number().describe("X coordinate"),
        y: z.number().describe("Y coordinate"),
      },
    },
    async ({ x, y }) => {
      await computer.doubleClick(x, y);
      return { content: [{ type: "text", text: "Double-clicked." }] };
    },
  );

  // -- scroll -------------------------------------------------------------
  server.registerTool(
    "scroll",
    {
      description: "Move the pointer to (x, y) and scroll by the given deltas.",
      inputSchema: {
        x: z.number().describe("X coordinate"),
        y: z.number().describe("Y coordinate"),
        scroll_x: z.number().default(0).describe("Horizontal scroll delta"),
        scroll_y: z.number().describe("Vertical scroll delta"),
      },
    },
    async ({ x, y, scroll_x, scroll_y }) => {
      await computer.scroll(x, y, scroll_x, scroll_y);
      return { content: [{ type: "text", text: "Scrolled." }] };
    },
  );

  // -- type ---------------------------------------------------------------
  server.registerTool(
    "type",
    {
      description: "Type the given text as keyboard input.",
      inputSchema: {
        text: z.string().describe("Text to type"),
      },
    },
    async ({ text }) => {
      await computer.type(text);
      return { content: [{ type: "text", text: "Typed." }] };
    },
  );

  // -- keypress -----------------------------------------------------------
  server.registerTool(
    "keypress",
    {
      description:
        'Press a key combination. For combos like Ctrl+C, pass ["ctrl", "c"].',
      inputSchema: {
        keys: z
          .array(z.string())
          .describe('Key names, e.g. ["ctrl", "a"] or ["Enter"]'),
      },
    },
    async ({ keys }) => {
      await computer.keypress(keys);
      return { content: [{ type: "text", text: "Key(s) pressed." }] };
    },
  );

  // -- move ---------------------------------------------------------------
  server.registerTool(
    "move",
    {
      description: "Move the pointer to (x, y) without clicking.",
      inputSchema: {
        x: z.number().describe("X coordinate"),
        y: z.number().describe("Y coordinate"),
      },
    },
    async ({ x, y }) => {
      await computer.move(x, y);
      return { content: [{ type: "text", text: "Moved." }] };
    },
  );

  // -- drag ---------------------------------------------------------------
  server.registerTool(
    "drag",
    {
      description:
        "Drag along a path of points. The first point is mouse-down, the last is mouse-up.",
      inputSchema: {
        path: z
          .array(z.object({ x: z.number(), y: z.number() }))
          .min(2)
          .describe("Array of {x, y} points"),
      },
    },
    async ({ path }) => {
      await computer.drag(path);
      return { content: [{ type: "text", text: "Dragged." }] };
    },
  );

  // -- wait ---------------------------------------------------------------
  server.registerTool(
    "wait",
    {
      description: "Wait for a duration in milliseconds.",
      inputSchema: {
        ms: z.number().default(1000).describe("Milliseconds to wait"),
      },
    },
    async ({ ms }) => {
      await computer.wait(ms);
      return { content: [{ type: "text", text: `Waited ${ms}ms.` }] };
    },
  );

  // -- get_dimensions -----------------------------------------------------
  server.registerTool(
    "get_dimensions",
    {
      description: "Get the screen or viewport dimensions as [width, height].",
    },
    async () => {
      const [w, h] = await computer.getDimensions();
      return {
        content: [
          { type: "text", text: JSON.stringify({ width: w, height: h }) },
        ],
      };
    },
  );

  // -- get_environment ----------------------------------------------------
  server.registerTool(
    "get_environment",
    {
      description:
        'Get the environment type: "linux", "mac", "windows", or "browser".',
    },
    async () => {
      return {
        content: [{ type: "text", text: computer.getEnvironment() }],
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Playwright-only extra tools
// ---------------------------------------------------------------------------

export function registerPlaywrightTools(
  server: McpServer,
  computer: PlaywrightComputer,
): void {
  server.registerTool(
    "goto",
    {
      description: "Navigate the browser to a URL.",
      inputSchema: {
        url: z.string().url().describe("URL to navigate to"),
      },
    },
    async ({ url }) => {
      await computer.goto(url);
      return { content: [{ type: "text", text: `Navigated to ${url}` }] };
    },
  );

  server.registerTool(
    "back",
    {
      description: "Go back in browser history.",
    },
    async () => {
      await computer.back();
      return { content: [{ type: "text", text: "Went back." }] };
    },
  );

  server.registerTool(
    "forward",
    {
      description: "Go forward in browser history.",
    },
    async () => {
      await computer.forward();
      return { content: [{ type: "text", text: "Went forward." }] };
    },
  );

  server.registerTool(
    "get_current_url",
    {
      description: "Get the current browser URL.",
    },
    async () => {
      const url = await computer.getCurrentUrl();
      return {
        content: [{ type: "text", text: url ?? "No active page." }],
      };
    },
  );
}
