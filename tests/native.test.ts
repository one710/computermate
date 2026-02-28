import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { McpTestClient } from "./test-helper.js";

// ---------------------------------------------------------------------------
// Determine which native computer type to test based on the runner OS
// ---------------------------------------------------------------------------

/** Detect the expected environment string returned by the server. */
function expectedEnv(): string {
  switch (process.platform) {
    case "linux":
      return "linux";
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

const type = expectedEnv();
const client = new McpTestClient("native");

describe(`native (${type}) MCP server`, () => {
  beforeAll(async () => {
    await client.setup();
  }, 15_000);

  afterAll(async () => {
    await client.teardown();
  });

  // -- tool listing -------------------------------------------------------

  it("lists all core tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);

    expect(names).toContain("screenshot");
    expect(names).toContain("click");
    expect(names).toContain("double_click");
    expect(names).toContain("scroll");
    expect(names).toContain("type");
    expect(names).toContain("keypress");
    expect(names).toContain("move");
    expect(names).toContain("drag");
    expect(names).toContain("wait");
    expect(names).toContain("get_dimensions");
    expect(names).toContain("get_environment");

    // Should NOT have Playwright-only tools
    expect(names).not.toContain("goto");
    expect(names).not.toContain("back");
    expect(names).not.toContain("forward");
    expect(names).not.toContain("get_current_url");
  });

  // -- get_environment ----------------------------------------------------

  it("get_environment returns correct type", async () => {
    const result = await client.callTool("get_environment");
    expect(McpTestClient.text(result)).toBe(type);
  });

  // -- get_dimensions -----------------------------------------------------

  it("get_dimensions returns width and height", async () => {
    const result = await client.callTool("get_dimensions");
    const dims = JSON.parse(McpTestClient.text(result));
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);
  });

  // -- screenshot ---------------------------------------------------------

  it("screenshot returns base64 PNG image", async () => {
    const result = await client.callTool("screenshot");
    const data = McpTestClient.imageData(result);
    expect(data.length).toBeGreaterThan(0);

    // Verify it's valid base64 by decoding the first few bytes
    const buf = Buffer.from(data, "base64");
    // PNG magic bytes: 137 80 78 71
    expect(buf[0]).toBe(137);
    expect(buf[1]).toBe(80); // P
    expect(buf[2]).toBe(78); // N
    expect(buf[3]).toBe(71); // G
  });

  // -- screenshot_region --------------------------------------------------

  it("screenshot_region returns base64 PNG image", async () => {
    const result = await client.callTool("screenshot_region", {
      x1: 10,
      y1: 10,
      x2: 110,
      y2: 110,
    });
    const data = McpTestClient.imageData(result);
    expect(data.length).toBeGreaterThan(0);

    const buf = Buffer.from(data, "base64");
    expect(buf[0]).toBe(137);
    expect(buf[1]).toBe(80);
  });

  it("screenshot_region rejects out-of-bounds coordinates", async () => {
    const result = await client.callTool("screenshot_region", {
      x1: -50,
      y1: -50,
      x2: 5000,
      y2: 5000,
    });
    expect(result.isError).toBe(true);
    expect(McpTestClient.text(result)).toMatch(/outside/i);
  });

  // -- click --------------------------------------------------------------

  it("click executes without error", async () => {
    const result = await client.callTool("click", { x: 100, y: 100 });
    expect(McpTestClient.text(result)).toBe("Clicked.");
  });

  it("click with right button", async () => {
    const result = await client.callTool("click", {
      x: 100,
      y: 100,
      button: "right",
    });
    expect(McpTestClient.text(result)).toBe("Clicked.");
  });

  // -- double_click -------------------------------------------------------

  it("double_click executes without error", async () => {
    const result = await client.callTool("double_click", { x: 200, y: 200 });
    expect(McpTestClient.text(result)).toBe("Double-clicked.");
  });

  // -- move ---------------------------------------------------------------

  it("move executes without error", async () => {
    const result = await client.callTool("move", { x: 300, y: 300 });
    expect(McpTestClient.text(result)).toBe("Moved.");
  });

  // -- scroll -------------------------------------------------------------

  it("scroll executes without error", async () => {
    const result = await client.callTool("scroll", {
      x: 400,
      y: 400,
      scroll_y: 3,
    });
    expect(McpTestClient.text(result)).toBe("Scrolled.");
  });

  // -- type ---------------------------------------------------------------

  it("type executes without error", async () => {
    const result = await client.callTool("type", { text: "hello" });
    expect(McpTestClient.text(result)).toBe("Typed.");
  });

  // -- keypress -----------------------------------------------------------

  it("keypress executes without error", async () => {
    const result = await client.callTool("keypress", { keys: ["enter"] });
    expect(McpTestClient.text(result)).toBe("Key(s) pressed.");
  });

  it("keypress combo", async () => {
    const result = await client.callTool("keypress", {
      keys: ["ctrl", "a"],
    });
    expect(McpTestClient.text(result)).toBe("Key(s) pressed.");
  });

  // -- drag ---------------------------------------------------------------

  it("drag executes without error", async () => {
    const result = await client.callTool("drag", {
      path: [
        { x: 100, y: 100 },
        { x: 200, y: 200 },
      ],
    });
    expect(McpTestClient.text(result)).toBe("Dragged.");
  });

  // -- wait ---------------------------------------------------------------

  it("wait completes in expected time", async () => {
    const start = Date.now();
    const result = await client.callTool("wait", { ms: 100 });
    const elapsed = Date.now() - start;

    expect(McpTestClient.text(result)).toBe("Waited 100ms.");
    expect(elapsed).toBeGreaterThanOrEqual(80); // allow some slack
    expect(elapsed).toBeLessThan(2000);
  });
});
