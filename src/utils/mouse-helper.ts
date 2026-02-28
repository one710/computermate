import type { BrowserContext } from "playwright";

/**
 * Injects a visual cursor into the page that tracks mouse movement and clicks.
 * Useful for debugging or providing visual feedback of the virtual cursor.
 */
export async function installMouseHelper(
  context: BrowserContext,
): Promise<void> {
  await context.addInitScript(() => {
    if (window.self !== window.top) return;

    const init = () => {
      if (document.getElementById("vcursor-pointer")) return;

      const cursor = document.createElement("vcursor-pointer");
      cursor.id = "vcursor-pointer";
      Object.assign(cursor.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "20px",
        height: "20px",
        background: "rgba(0, 0, 0, 0.4)",
        border: "1px solid white",
        borderRadius: "50%",
        pointerEvents: "none",
        zIndex: "1000000",
        transform: "translate(-50%, -50%)",
        transition: "background 0.2s, border-radius 0.2s, border-color 0.2s",
      });

      const update = (e: MouseEvent) => {
        cursor.style.left = `${e.clientX}px`;
        cursor.style.top = `${e.clientY}px`;
        cursor.style.display = "block";

        // Visualize mouse buttons (left=black, right=blue, middle=square, etc.)
        const { buttons } = e;
        cursor.style.background =
          buttons & 1 ? "rgba(0, 0, 0, 0.9)" : "rgba(0, 0, 0, 0.4)";
        cursor.style.borderColor = buttons & 2 ? "blue" : "white";
        cursor.style.borderRadius = buttons & 4 ? "4px" : "50%";
      };

      document.addEventListener("mousemove", update, true);
      document.addEventListener("mousedown", update, true);
      document.addEventListener("mouseup", update, true);
      document.addEventListener("contextmenu", (e) => e.preventDefault(), true);

      document.addEventListener(
        "mouseleave",
        () => (cursor.style.display = "none"),
        true,
      );
      document.addEventListener(
        "mouseenter",
        () => (cursor.style.display = "block"),
        true,
      );

      document.body.appendChild(cursor);
    };

    if (document.body) init();
    else window.addEventListener("DOMContentLoaded", init);
  });
}
