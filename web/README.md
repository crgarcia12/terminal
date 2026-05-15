# Web Terminal

A browser-deliverable port of the Windows Terminal interactive surface, written in TypeScript.

This is a **first vertical slice** that ports the core rendering, parsing, and input layers from the C++ codebase to TypeScript so the terminal can run in any modern browser, backed by a WebSocket-PTY bridge.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ Browser                                                              │
│  ┌────────────┐   ┌───────────────────────────────────────────────┐ │
│  │ UI shell   │──▶│  Terminal (TS)                                │ │
│  │ tabs/panes │   │   ├─ StateMachine (VT/ANSI parser)            │ │
│  │ settings   │   │   ├─ TextBuffer (rows + scrollback)           │ │
│  │ keybinds   │   │   ├─ KeyTranslator (KeyboardEvent → VT bytes) │ │
│  └────────────┘   │   └─ Canvas2DRenderer (60fps glyph draw)      │ │
│                   └────────┬──────────────────────────────────────┘ │
│                            │ PtyTransport                            │
│                            ▼                                          │
│                       WebSocketPty ─────────────┐                    │
└─────────────────────────────────────────────────┼────────────────────┘
                                                  ▼
                                       Node server (Express + ws)
                                       → node-pty / child_process
                                       → user's default shell
```

### C++ → TypeScript mapping

| C++ source                                    | TypeScript module                          |
|-----------------------------------------------|--------------------------------------------|
| `src/terminal/parser/StateMachine.cpp`        | `app/src/core/parser/StateMachine.ts`      |
| `src/buffer/out/textBuffer.cpp`               | `app/src/core/buffer/TextBuffer.ts`        |
| `src/cascadia/TerminalCore/Terminal.cpp`      | `app/src/core/terminal/Terminal.ts`        |
| `src/terminal/input/terminalInput.cpp`        | `app/src/core/input/KeyTranslator.ts`      |
| `src/renderer/atlas/*`                        | `app/src/renderer/canvas2d/Renderer.ts`    |
| `src/cascadia/TerminalApp/TabBase.cpp`        | `app/src/main.ts` (tab UI)                 |
| `src/cascadia/TerminalApp/Pane.cpp`           | `app/src/main.ts` (split panes)            |
| `src/cascadia/TerminalSettingsModel/*`        | `app/src/ui/settings.ts`                   |

## Development

```bash
# from repo root
cd web/app && npm install && cd ..
cd web/server && npm install && cd ..

# build & start (in one command):
cd web/server && node dev.mjs
# opens http://localhost:8080 (or whatever $PORT is set to)
```

Run tests:

```bash
cd web/app
npm test                # run unit tests
npm run test:parser     # parser-only suite (used by spec acceptance)
npm run typecheck
```

Production bundle:

```bash
cd web/app && npm run build
# emits web/app/dist/{index.html, assets/app.js}
```

## PTY Transports

The web app talks to the PTY through the `PtyTransport` interface (`app/src/pty/transport.ts`).
Two implementations ship:

1. **WebSocketPty** — used in production. Binary frames carry stdin/stdout; JSON control frames carry `resize` events. Connects to `<page-base>/pty`.
2. **LocalNodePty** (dev-only) — runs in the same Node process as the dev server and uses `node-pty` directly.

The server (`web/server/src/index.mjs`) prefers `node-pty` and falls back to a plain `child_process.spawn` of the user's shell if native modules are unavailable in the deployment image.

The shell is selected by the `SHELL` environment variable, defaulting to `/bin/bash` on Linux/macOS and `powershell.exe` on Windows.

## Settings

User settings are loaded from `localStorage` under the key `settings.json` and validated against the existing Windows Terminal profile schema. Supported keys in this slice:

- `colorScheme` (Campbell, Campbell Powershell, One Half Dark, Solarized Dark, Vintage)
- `fontFace`, `fontSize`
- `cursorShape` (`block` | `bar` | `underline`), `cursorColor`
- `padding`, `tabTitle`
- `useAcrylic` (best-effort, uses CSS `backdrop-filter`)

## Out of Scope

This first slice deliberately omits the following — they remain in the C++ tree and are documented in `doc/specs/web-terminal.md`:

- `conhost.exe`, the Win32 console API surface, ConPTY, and everything under `src/host/`, `src/server/`, `src/interactivity/win32/`.
- WinUI / XAML Islands UI in `src/cascadia/TerminalApp/`, `TerminalControl/`, `WindowsTerminal/`.
- ColorTool, OpenConsole tests, TAEF tests, Helix pipelines, PGO, MSIX packaging.
- DirectWrite / DirectX / Direct2D / Atlas HLSL shaders. The browser uses Canvas2D (a WebGL2 renderer is planned, see `doc/specs/web-terminal.md`).
- Sixel, ReGIS, Kitty/iTerm2 inline images, Quake-mode window.
- Modifying the existing C++ build (`Directory.Build.props`, `.sln`, `.vcxproj`, `build/pipelines/`).
- Authentication, multi-user session management, production hosting of the WebSocket PTY server.
- Mobile/touch input optimization, screen-reader UIA bridge, Jump List integration.
