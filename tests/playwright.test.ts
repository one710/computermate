import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { McpTestClient } from "./test-helper.js";

const client = new McpTestClient("playwright");

describe("playwright MCP server", () => {
  beforeAll(async () => {
    await client.setup();
  }, 30_000); // browser launch can be slow

  afterAll(async () => {
    await client.teardown();
  }, 10_000);

  // -- tool listing -------------------------------------------------------

  it("lists core + playwright-specific tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);

    // Core tools
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

    // Playwright-only tools
    expect(names).toContain("goto");
    expect(names).toContain("back");
    expect(names).toContain("forward");
    expect(names).toContain("get_current_url");
  });

  // -- get_environment ----------------------------------------------------

  it("get_environment returns browser", async () => {
    const result = await client.callTool("get_environment");
    expect(McpTestClient.text(result)).toBe("browser");
  });

  // -- get_dimensions -----------------------------------------------------

  it("get_dimensions returns viewport size", async () => {
    const result = await client.callTool("get_dimensions");
    const dims = JSON.parse(McpTestClient.text(result));
    expect(dims.width).toBe(1024);
    expect(dims.height).toBe(768);
  });

  // -- screenshot ---------------------------------------------------------

  it("screenshot returns valid PNG", async () => {
    const result = await client.callTool("screenshot");
    const data = McpTestClient.imageData(result);
    expect(data.length).toBeGreaterThan(0);

    const buf = Buffer.from(data, "base64");
    expect(buf[0]).toBe(137); // PNG magic
    expect(buf[1]).toBe(80);
    expect(buf[2]).toBe(78);
    expect(buf[3]).toBe(71);
  });

  // -- screenshot_region --------------------------------------------------

  it("screenshot_region returns valid PNG", async () => {
    const result = await client.callTool("screenshot_region", {
      x1: 50,
      y1: 50,
      x2: 150,
      y2: 150,
    });
    const data = McpTestClient.imageData(result);
    expect(data.length).toBeGreaterThan(0);

    const buf = Buffer.from(data, "base64");
    expect(buf[0]).toBe(137);
    expect(buf[1]).toBe(80);
  });

  it("screenshot_region handles out-of-bounds gracefully", async () => {
    const result = await client.callTool("screenshot_region", {
      x1: -100,
      y1: -100,
      x2: 2000,
      y2: 2000,
    });
    const data = McpTestClient.imageData(result);
    expect(data.length).toBeGreaterThan(0);
  });

  // -- goto + get_current_url ---------------------------------------------

  it("goto navigates and get_current_url confirms", async () => {
    const gotoResult = await client.callTool("goto", {
      url: "https://example.com",
    });
    expect(McpTestClient.text(gotoResult)).toContain("example.com");

    const urlResult = await client.callTool("get_current_url");
    expect(McpTestClient.text(urlResult)).toContain("example.com");
  });

  // -- back + forward -----------------------------------------------------

  it("back and forward navigate browser history", async () => {
    // Navigate to two pages
    await client.callTool("goto", { url: "https://example.com" });
    await client.callTool("goto", { url: "https://example.org" });

    // Go back
    await client.callTool("back");
    const backUrl = await client.callTool("get_current_url");
    expect(McpTestClient.text(backUrl)).toContain("example.com");

    // Go forward
    await client.callTool("forward");
    const fwdUrl = await client.callTool("get_current_url");
    expect(McpTestClient.text(fwdUrl)).toContain("example.org");
  });

  // -- click --------------------------------------------------------------

  it("click executes without error", async () => {
    const result = await client.callTool("click", { x: 100, y: 100 });
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
    const result = await client.callTool("type", { text: "hello world" });
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
    expect(elapsed).toBeGreaterThanOrEqual(80);
    expect(elapsed).toBeLessThan(2000);
  });
});
