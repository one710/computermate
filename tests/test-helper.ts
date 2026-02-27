import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Spawns the computermate MCP server as a child process and connects an MCP
 * client to it via stdio. Provides helpers for calling tools and asserting on
 * responses.
 */
export class McpTestClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  constructor(private readonly computerType: string) {}

  /** Start the server process and connect the MCP client. */
  async setup(): Promise<void> {
    this.transport = new StdioClientTransport({
      command: "node",
      args: ["dist/index.js", this.computerType],
    });

    this.client = new Client({ name: "test-client", version: "0.0.1" });
    await this.client.connect(this.transport);
  }

  /** Shut down the client and the server process. */
  async teardown(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    // Transport is closed automatically when client closes
    this.transport = null;
  }

  /** Call a tool by name and return the result. */
  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<CallToolResult> {
    if (!this.client) throw new Error("Client not connected. Call setup().");
    return this.client.callTool({
      name,
      arguments: args,
    }) as Promise<CallToolResult>;
  }

  /** List all tools registered on the server. */
  async listTools() {
    if (!this.client) throw new Error("Client not connected. Call setup().");
    return this.client.listTools();
  }

  /** Extract text from the first text content block. */
  static text(result: CallToolResult): string {
    const block = result.content.find(
      (c: { type: string }) => c.type === "text",
    );
    if (!block || block.type !== "text") throw new Error("No text content.");
    return block.text;
  }

  /** Extract image data from the first image content block. */
  static imageData(result: CallToolResult): string {
    const block = result.content.find(
      (c: { type: string }) => c.type === "image",
    );
    if (!block || block.type !== "image") throw new Error("No image content.");
    return block.data;
  }
}
