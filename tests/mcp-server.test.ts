import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { NativeComputer } from "../src/computers/native-computer.js";
import { registerTools } from "../src/server.js";

// ---------------------------------------------------------------------------
// In-memory MCP server + client wired together (no child process)
// ---------------------------------------------------------------------------

let client: Client;
let server: McpServer;
let computer: NativeComputer;

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

describe("in-memory MCP server (linux)", () => {
  beforeAll(async () => {
    computer = new NativeComputer();

    server = new McpServer({ name: "computermate", version: "0.0.1" });
    registerTools(server, computer);

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    client = new Client({ name: "test-client", version: "0.0.1" });
    await client.connect(clientTransport);
  }, 10_000);

  afterAll(async () => {
    await client.close();
    await server.close();
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
    expect(names).not.toContain("goto");
  });

  // -- get_environment ----------------------------------------------------

  it("get_environment returns correct platform", async () => {
    const result = (await client.callTool({
      name: "get_environment",
    })) as CallToolResult;
    const expected =
      process.platform === "darwin"
        ? "macos"
        : process.platform === "win32"
          ? "windows"
          : "linux";
    expect(text(result)).toBe(expected);
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
    expect(buf[0]).toBe(137);
    expect(buf[1]).toBe(80);
    expect(buf[2]).toBe(78);
    expect(buf[3]).toBe(71);
  }, 30_000);

  // -- click --------------------------------------------------------------

  it("click", async () => {
    const result = (await client.callTool({
      name: "click",
      arguments: { x: 100, y: 100 },
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
    expect(elapsed).toBeLessThan(2000);
  });
});
