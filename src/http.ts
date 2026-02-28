#!/usr/bin/env node
import express from "express";
import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createComputer, registerTools } from "./server.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const COMPUTER_TYPE = (process.env.COMPUTER_TYPE as any) || "native";
const MAX_SCALING_DIMENSION = process.env.MAX_SCALING_DIMENSION;
const PORT = parseInt(process.env.PORT ?? "3000", 10);

// Share the computer instance - it's a wrapper for system calls and doesn't hold per-request state
const computer = createComputer(COMPUTER_TYPE, MAX_SCALING_DIMENSION);

function getMcpServer() {
  const server = new McpServer({
    name: "computermate",
    version: "0.3.0",
  });
  registerTools(server, computer);
  return server;
}

const app = express();

app.use(express.json());

app.post("/mcp", async (req: Request, res: Response) => {
  const server = getMcpServer();
  try {
    const transport = new StreamableHTTPServerTransport();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      console.log("Request closed");
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32_603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

const httpServer = app.listen(PORT, () => {
  console.log(`computermate MCP server (HTTP) listening on port ${PORT}`);
});

process.on("SIGINT", () => {
  httpServer.close();
  process.exit(0);
});
