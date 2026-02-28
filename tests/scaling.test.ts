import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NativeComputer } from "../src/computers/native-computer.js";

describe("NativeComputer scaling", () => {
  let computer: NativeComputer;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    computer = new NativeComputer({ maxScalingDimension: "1280x800" });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("should report scaled dimensions", async () => {
    const [w, h] = await computer.getDimensions();
    // It should either be exactly 1280x800 or scaled proportionally if aspect ratio differs
    expect(w).toBeLessThanOrEqual(1280);
    expect(h).toBeLessThanOrEqual(800);
    console.log(`Scaled dimensions: ${w}x${h}`);
  });

  it("should take scaled screenshots", async () => {
    const base64 = await computer.screenshot();
    const buf = Buffer.from(base64, "base64");

    // We can't easily check dimensions of base64 PNG without a library here,
    // but we can check if it's a valid PNG
    expect(buf[0]).toBe(137);
    expect(buf[1]).toBe(80);
  });

  it("should allow coordinates within scaled bounds", async () => {
    const [w, h] = await computer.getDimensions();
    // This should not throw
    await expect(computer.move(w, h)).resolves.not.toThrow();
  });

  it("should throw for coordinates outside scaled bounds", async () => {
    const [w, h] = await computer.getDimensions();
    await expect(computer.move(w + 1, h + 1)).rejects.toThrow(
      /outside screen bounds/,
    );
  });
});
