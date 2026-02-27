#!/usr/bin/env node

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { LinuxComputer } from "./linux-computer.js";
import { registerTools } from "./server.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? "3000", 10);

async function main() {
  const computer = new LinuxComputer();
  const server = new McpServer({ name: "computermate", version: "0.0.1" });
  registerTools(server, computer);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error(`Error handling ${req.method} ${req.url}:`, err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal Server Error" }));
      }
    }
  });

  httpServer.listen(PORT, () => {
    console.log(`computermate MCP server (HTTP) listening on port ${PORT}`);
  });

  process.on("SIGINT", () => {
    httpServer.close();
    process.exit(0);
  });

  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
