#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PlaywrightComputer } from "./computers/playwright-computer.js";
import {
  ComputerType,
  createComputer,
  registerTools,
  registerPlaywrightTools,
} from "./server.js";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const VALID_TYPES: ComputerType[] = ["playwright", "native"];

function parseArgs(): ComputerType {
  const arg = process.argv[2];
  if (!arg || !VALID_TYPES.includes(arg as ComputerType)) {
    console.error(
      `Usage: computermate <${VALID_TYPES.join(" | ")}>\n` +
        `  e.g. computermate native`,
    );
    process.exit(1);
  }
  return arg as ComputerType;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const type = parseArgs();
  const computer = createComputer(type);

  const server = new McpServer({
    name: "computermate",
    version: "0.0.1",
  });

  // Register core tools
  registerTools(server, computer);

  // Register extra browser tools for Playwright
  if (computer instanceof PlaywrightComputer) {
    await computer.start();
    registerPlaywrightTools(server, computer);
  }

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  const shutdown = async () => {
    if (computer instanceof PlaywrightComputer) {
      await computer.stop();
    }
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
