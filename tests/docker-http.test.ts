import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const IMAGE = "computermate";
const CONTAINER = "computermate-test";
const HOST_PORT = 13710;
const MCP_URL = `http://localhost:${HOST_PORT}`;

// How long to wait for the container's MCP server to become ready (ms)
const STARTUP_TIMEOUT = 60_000;
const POLL_INTERVAL = 1_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function text(result: CallToolResult): string {
  const block = result.content.find((c: { type: string }) => c.type === "text");
  if (!block || block.type !== "text") throw new Error("No text content.");
  return block.text;
}

function imageData(result: CallToolResult): string {
  const block = result.content.find(
    (c: { type: string }) => c.type === "image",
  );
  if (!block || block.type !== "image") throw new Error("No image content.");
  return block.data;
}

/** Wait for the MCP HTTP endpoint to be reachable. */
async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // A simple GET — the transport may return 405 or 200, either means it's up
      const res = await fetch(url, { method: "GET" });
      if (res.status < 500) return;
    } catch {
      // Server not ready yet (connection refused, etc.)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
  throw new Error(
    `MCP server at ${url} did not become ready in ${timeoutMs}ms`,
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

let client: Client;
let transport: StreamableHTTPClientTransport;

describe("docker HTTP MCP server", () => {
  beforeAll(async () => {
    // Stop any stale container
    try {
      execSync(`docker rm -f ${CONTAINER}`, { stdio: "ignore" });
    } catch {
      // ignore
    }

    // Start the container
    execSync(
      `docker run -d --name ${CONTAINER} --platform linux/amd64 -p ${HOST_PORT}:3000 ${IMAGE}`,
      { stdio: "inherit" },
    );

    // Wait for the MCP HTTP server inside the container to be ready
    await waitForServer(MCP_URL, STARTUP_TIMEOUT);

    // Connect MCP client via Streamable HTTP
    transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
    client = new Client({ name: "docker-test-client", version: "0.0.1" });
    await client.connect(transport);
  }, 120_000); // 2 min timeout for docker + startup

  afterAll(async () => {
    try {
      await client.close();
    } catch {
      // ignore
    }
    try {
      execSync(`docker rm -f ${CONTAINER}`, { stdio: "ignore" });
    } catch {
      // ignore
    }
  }, 15_000);

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
  });

  // -- get_environment ----------------------------------------------------

  it("get_environment returns linux", async () => {
    const result = (await client.callTool({
      name: "get_environment",
    })) as CallToolResult;
    expect(text(result)).toBe("linux");
  });

  // -- get_dimensions -----------------------------------------------------

  it("get_dimensions returns positive values", async () => {
    const result = (await client.callTool({
      name: "get_dimensions",
    })) as CallToolResult;
    const dims = JSON.parse(text(result));
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);
  });

  // -- screenshot ---------------------------------------------------------

  it("screenshot returns valid PNG", async () => {
    const result = (await client.callTool({
      name: "screenshot",
    })) as CallToolResult;
    const data = imageData(result);
    expect(data.length).toBeGreaterThan(0);

    const buf = Buffer.from(data, "base64");
    expect(buf[3]).toBe(71);
  });

  // -- screenshot_region --------------------------------------------------

  it("screenshot_region returns valid PNG", async () => {
    const result = (await client.callTool({
      name: "screenshot_region",
      arguments: { x1: 50, y1: 50, x2: 150, y2: 150 },
    })) as CallToolResult;
    const data = imageData(result);
    expect(data.length).toBeGreaterThan(0);

    const buf = Buffer.from(data, "base64");
    expect(buf[0]).toBe(137);
    expect(buf[1]).toBe(80);
  });

  it("screenshot_region handles out-of-bounds gracefully", async () => {
    const result = (await client.callTool({
      name: "screenshot_region",
      arguments: { x1: -100, y1: -100, x2: 3000, y2: 3000 },
    })) as CallToolResult;
    const data = imageData(result);
    expect(data.length).toBeGreaterThan(0);
  });

  // -- click --------------------------------------------------------------

  it("click", async () => {
    const result = (await client.callTool({
      name: "click",
      arguments: { x: 100, y: 100 },
    })) as CallToolResult;
    expect(text(result)).toBe("Clicked.");
  });

  it("click with right button", async () => {
    const result = (await client.callTool({
      name: "click",
      arguments: { x: 100, y: 100, button: "right" },
    })) as CallToolResult;
    expect(text(result)).toBe("Clicked.");
  });

  // -- double_click -------------------------------------------------------

  it("double_click", async () => {
    const result = (await client.callTool({
      name: "double_click",
      arguments: { x: 200, y: 200 },
    })) as CallToolResult;
    expect(text(result)).toBe("Double-clicked.");
  });

  // -- move ---------------------------------------------------------------

  it("move", async () => {
    const result = (await client.callTool({
      name: "move",
      arguments: { x: 300, y: 300 },
    })) as CallToolResult;
    expect(text(result)).toBe("Moved.");
  });

  // -- scroll -------------------------------------------------------------

  it("scroll", async () => {
    const result = (await client.callTool({
      name: "scroll",
      arguments: { x: 400, y: 400, scroll_y: 3 },
    })) as CallToolResult;
    expect(text(result)).toBe("Scrolled.");
  });

  // -- type ---------------------------------------------------------------

  it("type", async () => {
    const result = (await client.callTool({
      name: "type",
      arguments: { text: "hello" },
    })) as CallToolResult;
    expect(text(result)).toBe("Typed.");
  });

  // -- keypress -----------------------------------------------------------

  it("keypress single key", async () => {
    const result = (await client.callTool({
      name: "keypress",
      arguments: { keys: ["enter"] },
    })) as CallToolResult;
    expect(text(result)).toBe("Key(s) pressed.");
  });

  it("keypress combo", async () => {
    const result = (await client.callTool({
      name: "keypress",
      arguments: { keys: ["ctrl", "a"] },
    })) as CallToolResult;
    expect(text(result)).toBe("Key(s) pressed.");
  });

  // -- drag ---------------------------------------------------------------

  it("drag", async () => {
    const result = (await client.callTool({
      name: "drag",
      arguments: {
        path: [
          { x: 100, y: 100 },
          { x: 200, y: 200 },
        ],
      },
    })) as CallToolResult;
    expect(text(result)).toBe("Dragged.");
  });

  // -- wait ---------------------------------------------------------------

  it("wait", async () => {
    const start = Date.now();
    const result = (await client.callTool({
      name: "wait",
      arguments: { ms: 100 },
    })) as CallToolResult;
    const elapsed = Date.now() - start;

    expect(text(result)).toBe("Waited 100ms.");
    expect(elapsed).toBeGreaterThanOrEqual(80);
    expect(elapsed).toBeLessThan(5000); // generous for HTTP round-trip
  });
});
