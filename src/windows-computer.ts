import { execSync } from "node:child_process";
import { Computer, Environment, MouseButton, Point } from "./computer.js";

// ---------------------------------------------------------------------------
// Key mapping — friendly names → SendKeys format
// See: https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.sendkeys
// ---------------------------------------------------------------------------

const SENDKEYS_MAP: Record<string, string> = {
  enter: "{ENTER}",
  return: "{ENTER}",
  tab: "{TAB}",
  esc: "{ESC}",
  escape: "{ESC}",
  backspace: "{BACKSPACE}",
  delete: "{DELETE}",
  space: " ",
  up: "{UP}",
  arrowup: "{UP}",
  down: "{DOWN}",
  arrowdown: "{DOWN}",
  left: "{LEFT}",
  arrowleft: "{LEFT}",
  right: "{RIGHT}",
  arrowright: "{RIGHT}",
  home: "{HOME}",
  end: "{END}",
  pageup: "{PGUP}",
  pagedown: "{PGDN}",
  insert: "{INSERT}",
  capslock: "{CAPSLOCK}",

  f1: "{F1}",
  f2: "{F2}",
  f3: "{F3}",
  f4: "{F4}",
  f5: "{F5}",
  f6: "{F6}",
  f7: "{F7}",
  f8: "{F8}",
  f9: "{F9}",
  f10: "{F10}",
  f11: "{F11}",
  f12: "{F12}",
};

/** SendKeys modifier prefixes. */
const MODIFIER_PREFIX: Record<string, string> = {
  ctrl: "^",
  control: "^",
  alt: "%",
  option: "%",
  shift: "+",
  cmd: "^", // Windows has no Cmd; map to Ctrl
  command: "^",
  meta: "^",
  super: "^",
  win: "^",
};

// ---------------------------------------------------------------------------
// Mouse button constants — Win32 mouse_event flags
// ---------------------------------------------------------------------------

const MOUSE_FLAGS: Record<MouseButton, { down: string; up: string }> = {
  left: { down: "0x0002", up: "0x0004" },
  middle: { down: "0x0020", up: "0x0040" },
  right: { down: "0x0008", up: "0x0010" },
};

// ---------------------------------------------------------------------------
// WindowsComputer
// ---------------------------------------------------------------------------

/**
 * Computer implementation for Windows.
 *
 * Uses PowerShell for everything: screenshots via .NET `Graphics.CopyFromScreen`,
 * mouse via `SetCursorPos` / `mouse_event`, keyboard via `SendKeys`.
 *
 * Designed to run on a Windows host or inside a Windows VM.
 */
export class WindowsComputer implements Computer {
  private cachedDimensions: [number, number] | null = null;
  // ---- helpers ----------------------------------------------------------

  private ps(script: string): string {
    // Run a PowerShell command using -EncodedCommand (UTF-16LE Base64).
    // This avoids all shell quoting and interpolation issues.
    const buffer = Buffer.from(script, "utf16le");
    const encoded = buffer.toString("base64");

    return execSync(
      `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
      {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024, // 10MB to fit screenshots
      },
    ).trim();
  }

  // ---- Computer interface -----------------------------------------------

  getEnvironment(): Environment {
    return "windows";
  }

  async getDimensions(): Promise<[number, number]> {
    if (this.cachedDimensions) return this.cachedDimensions;

    try {
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen
        Write-Output "$($screen.Bounds.Width) $($screen.Bounds.Height)"
      `;
      const result = this.ps(script);
      const parts = result.split(/\s+/).filter(Boolean).map(Number);
      if (parts.length < 2) throw new Error("Invalid output");
      const [w, h] = parts;
      if (w > 0 && h > 0) {
        this.cachedDimensions = [w, h];
        return this.cachedDimensions;
      }
      throw new Error("Invalid dimensions");
    } catch {
      return [1920, 1080];
    }
  }

  async screenshot(): Promise<string> {
    // Capture screen → save to temp PNG → read as base64
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $screen = [System.Windows.Forms.Screen]::PrimaryScreen
      if ($null -eq $screen) {
        $bmp = New-Object System.Drawing.Bitmap(1, 1)
      } else {
        $bounds = $screen.Bounds
        $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
        $gfx = [System.Drawing.Graphics]::FromImage($bmp)
        $gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
        $gfx.Dispose()
      }
      $ms = New-Object System.IO.MemoryStream
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      $bmp.Dispose()
      [Convert]::ToBase64String($ms.ToArray())
      $ms.Dispose()
    `;
    return this.ps(script);
  }

  async screenshotRegion(p1: Point, p2: Point): Promise<string> {
    const [sw, sh] = await this.getDimensions();
    const xMin = Math.max(0, Math.min(p1.x, p2.x));
    const yMin = Math.max(0, Math.min(p1.y, p2.y));
    const xMax = Math.min(sw, Math.max(p1.x, p2.x));
    const yMax = Math.min(sh, Math.max(p1.y, p2.y));

    const w = Math.max(1, xMax - xMin);
    const h = Math.max(1, yMax - yMin);

    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $bmp = New-Object System.Drawing.Bitmap(${w}, ${h})
      $gfx = [System.Drawing.Graphics]::FromImage($bmp)
      $gfx.CopyFromScreen(${xMin}, ${yMin}, 0, 0, $bmp.Size)
      $gfx.Dispose()
      $ms = New-Object System.IO.MemoryStream
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      $bmp.Dispose()
      [Convert]::ToBase64String($ms.ToArray())
      $ms.Dispose()
    `;
    return this.ps(script);
  }

  async click(
    x: number,
    y: number,
    button: MouseButton = "left",
  ): Promise<void> {
    const flags = MOUSE_FLAGS[button] ?? MOUSE_FLAGS.left;
    this.ps(
      `Add-Type -MemberDefinition '` +
      `[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);` +
      `[DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int i);` +
      `' -Name U -Namespace W;` +
      `[W.U]::SetCursorPos(${x}, ${y});` +
      `[W.U]::mouse_event(${flags.down}, 0, 0, 0, 0);` +
      `[W.U]::mouse_event(${flags.up}, 0, 0, 0, 0)`,
    );
  }

  async doubleClick(x: number, y: number): Promise<void> {
    await this.click(x, y, "left");
    await this.click(x, y, "left");
  }

  async scroll(
    x: number,
    y: number,
    _scrollX: number,
    scrollY: number,
  ): Promise<void> {
    // MOUSEEVENTF_WHEEL = 0x0800, positive delta = up, negative = down
    const delta = scrollY < 0 ? 120 : -120; // 120 per notch
    const clicks = Math.abs(scrollY);
    this.ps(
      `Add-Type -MemberDefinition '` +
      `[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);` +
      `[DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int i);` +
      `' -Name U -Namespace W;` +
      `[W.U]::SetCursorPos(${x}, ${y});` +
      `1..${clicks} | ForEach-Object { [W.U]::mouse_event(0x0800, 0, 0, ${delta}, 0) }`,
    );
  }

  async type(text: string): Promise<void> {
    // Escape text for SendKeys — braces, parens, etc. need wrapping
    const escaped = text.replace(/([+^%~{}[\]()])/g, "{$1}");
    this.ps(
      `Add-Type -AssemblyName System.Windows.Forms; ` +
      `[System.Windows.Forms.SendKeys]::SendWait("${escaped.replace(/"/g, '`"')}")`,
    );
  }

  async wait(ms = 1000): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async move(x: number, y: number): Promise<void> {
    this.ps(
      `Add-Type -MemberDefinition '` +
      `[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);` +
      `' -Name U -Namespace W;` +
      `[W.U]::SetCursorPos(${x}, ${y})`,
    );
  }

  async keypress(keys: string[]): Promise<void> {
    // Build a SendKeys string.  Modifiers become prefixes for the main key.
    let prefix = "";
    let main = "";

    for (const k of keys) {
      const lower = k.toLowerCase();
      if (MODIFIER_PREFIX[lower]) {
        prefix += MODIFIER_PREFIX[lower];
      } else {
        main = SENDKEYS_MAP[lower] ?? k;
      }
    }

    const combo = main ? `${prefix}${main}` : prefix;
    if (!combo) return;

    this.ps(
      `Add-Type -AssemblyName System.Windows.Forms; ` +
      `[System.Windows.Forms.SendKeys]::SendWait("${combo}")`,
    );
  }

  async drag(path: Point[]): Promise<void> {
    if (path.length < 2) return;

    const pInvoke =
      `Add-Type -MemberDefinition '` +
      `[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);` +
      `[DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int i);` +
      `' -Name U -Namespace W;`;

    const { x: sx, y: sy } = path[0];
    this.ps(
      `${pInvoke}` +
      `[W.U]::SetCursorPos(${sx}, ${sy});` +
      `[W.U]::mouse_event(0x0002, 0, 0, 0, 0)`,
    );

    for (const { x, y } of path.slice(1)) {
      this.ps(
        `${pInvoke}` +
        `[W.U]::SetCursorPos(${x}, ${y});` +
        `[W.U]::mouse_event(0x0001, 0, 0, 0, 0)`,
      );
    }

    this.ps(`${pInvoke}[W.U]::mouse_event(0x0004, 0, 0, 0, 0)`);
  }
}
