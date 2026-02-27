# 🤖 ComputerMate

> **"Your AI's hands and eyes on any machine."**  
> _(The forbidden MCP of the AI era...)_

[![Test Status](https://github.com/one710/computermate/actions/workflows/test.yml/badge.svg)](https://github.com/one710/computermate/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/@one710/computermate.svg)](https://www.npmjs.com/package/@one710/computermate)
[![npm downloads](https://img.shields.io/npm/dm/@one710/computermate.svg)](https://www.npmjs.com/package/@one710/computermate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)](#installation)

**ComputerMate** is a powerful Model Context Protocol (MCP) server that grants AI models the ability to interact with your computer just like a human would. From taking screenshots to clicking buttons and typing text, ComputerMate exposes your local machine (or a sandboxed Docker container) as a set of tools for LLMs.

---

## ✨ Features & Highlights

- 🖥️ **Cross-Platform**: Full support for **Linux (X11)**, **macOS (AppleScript)**, and **Windows (PowerShell)**.
- 🐳 **Docker-First**: Run in a fully isolated Linux desktop environment with VNC access and state persistence.
- 🖱️ **Virtual Cursor**: Enable a visual mouse cursor in Playwright by setting `VIRTUAL_CURSOR=true`.
- 🌐 **Web Automation**: Integrated **Playwright** support for high-performance, browser-only computer use.
- � **Secure Transport**: Supports both `stdio` (local) and `HTTP` (remote/Docker) transports.

---

## 🛠️ Available Tools

ComputerMate exposes the following tools to the LLM:

| Tool | AI-Friendly Description |
| :--- | :--- |
| `screenshot` | Take a full screenshot of the current screen or browser viewport. |
| `screenshot_region` | Capture a specific rectangular area by providing two diagonal points. |
| `click` | Move pointer and click (left, middle, right supported). |
| `double_click` | Rapidly click twice at the given coordinates. |
| `scroll` | Scroll the window content at (x, y) by given amount. |
| `type` | Send keyboard text input to the active window. |
| `keypress` | Send key combinations (e.g. `["ctrl", "c"]`, `["alt", "tab"]`). |
| `move` | Move the mouse pointer without clicking. |
| `drag` | Drag the mouse from start point along a path of coordinates. |
| `wait` | Pause execution for a set number of milliseconds. |
| `get_dimensions` | Retrieve the screen or viewport width and height. |
| `get_environment` | Returns the current platform (`linux`, `mac`, `windows`, `browser`). |
| `goto` | **(Playwright only)** Navigate to a specific URL. |
| `back` | **(Playwright only)** Go back in history. |
| `forward` | **(Playwright only)** Go forward in history. |
| `get_current_url`| **(Playwright only)** Retrieve the current active page URL. |

---

## 🚀 Quick Start

### 📦 Using npx (Local)

Run the server directly without installing:

# MacOS
npx @one710/computermate mac

# Linux
npx @one710/computermate linux

# Windows
npx @one710/computermate windows

# Playwright (Browser only)
npx @one710/computermate playwright
```

### 🐳 Using Docker (Safe & Persistent)

The recommended way to use ComputerMate is via Docker. This provides a sandboxed environment and VNC access.

```bash
# Clone the repository
git clone https://github.com/one710/computermate.git
cd computermate

# Start the server with persistence
docker-compose up --build
```

- **MCP Endpoint**: `http://localhost:3000`
- **VNC View**: `localhost:5900` (Password: `one710`)

---

## 🛠️ Prerequisites & Installation

Depending on your OS, you may need to install a few system dependencies.

### 🐧 Ubuntu / Debian Desktop

```bash
sudo apt-get update
sudo apt-get install -y xvfb xdotool imagemagick
```

### 🍎 macOS

```bash
# Requires AppleScript (built-in)
# For better mouse control:
brew install cliclick
```

### 🪟 Windows

No external binaries are required! ComputerMate uses native PowerShell commands and `SendKeys` to interact with the OS.

---

## ⚠️ Important Warnings

> [!CAUTION]
> **This tool grants significant control over your system.**
> An LLM with access to ComputerMate can read your files, access your browser, and execute commands as the current user.
>
> - **Use with Caution**: Do not run this on a machine with sensitive data or production access.
> - **Sandbox Recommended**: Use the [Docker](#using-docker-safe--persistent) environment for maximum safety.
> - **Monitor closely**: Always keep an eye on what the AI is doing.

---

## 🛠️ MCP Configuration

Add this to your `claude_desktop_config.json` (or equivalent MCP client config):

```json
{
  "mcpServers": {
    "computermate": {
      "command": "npx",
      "args": ["-y", "@one710/computermate", "mac"]
    }
  }
}
```

### 🐳 Docker (HTTP)

If you're running ComputerMate in Docker, you'll first need to start the container and expose the MCP port (3000):

```bash
docker run -d --name computermate -p 3000:3000 ghcr.io/one710/computermate:latest
```

To test the connection, you can use the **MCP Inspector**:

```bash
npx @modelcontextprotocol/inspector http://localhost:3000
```

> [!NOTE]
> For production use in clients like Claude Desktop, ensure your client supports HTTP MCP transports natively, or use an MCP-to-stdio bridge like `mcp-remote`.

### 🌉 Stdio-to-Docker Bridge (mcp-remote)

If your MCP client (like Cursor or older versions of Claude Desktop) only supports `stdio` transports, you can bridge it to the ComputerMate Docker container using `mcp-remote`:

```json
{
  "mcpServers": {
    "computermate-docker": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@latest",
        "http://localhost:3000/sse",
        "--allow-http"
      ]
    }
  }
}
```

This command starts a local `stdio` server that transparently forwards all requests to the ComputerMate container running at `http://localhost:3000`.

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ❤️ by the <b>One710 Softworks</b> Team.
</p>
