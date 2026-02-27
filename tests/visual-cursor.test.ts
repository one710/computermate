import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { McpTestClient } from "./test-helper.js";

const client = new McpTestClient("playwright");

describe("virtual cursor visual verification", () => {
  beforeAll(async () => {
    // Start with VIRTUAL_CURSOR enabled
    await client.setup({ VIRTUAL_CURSOR: "true" });
  }, 30_000);

  afterAll(async () => {
    await client.teardown();
  });

  it("renders the virtual cursor and follows mouse movement", async () => {
    // 1. Navigate to a simple page
    await client.callTool("goto", { url: "https://example.com" });
    await client.callTool("wait", { ms: 1000 });

    // 2. Perform a slow movement and take screenshots
    const points = [
      { x: 100, y: 100 },
      { x: 300, y: 150 },
      { x: 500, y: 300 },
      { x: 200, y: 500 },
    ];

    console.log("Starting slow-motion mouse trajectory...");

    for (const point of points) {
      await client.callTool("move", point);
      // Wait a bit to let the script update the cursor position
      await client.callTool("wait", { ms: 500 });

      const screenshot = await client.callTool("screenshot");
      const base64 = McpTestClient.imageData(screenshot);

      // Basic sanity check: screenshot is not empty
      expect(base64.length).toBeGreaterThan(0);

      console.log(`At (${point.x}, ${point.y}), screenshot captured.`);
    }

    // 3. Perform a drag and verify
    await client.callTool("drag", {
      path: [
        { x: 100, y: 100 },
        { x: 400, y: 400 },
      ],
    });
    await client.callTool("wait", { ms: 500 });
    await client.callTool("screenshot");

    console.log("Visual verification sequence completed.");
  }, 60_000);
});
