# Web Terminal — Design Notes

A TypeScript vertical slice of Windows Terminal that runs in a browser. See
`web/README.md` for the user-facing summary.

## Goals
- Reproduce the visible Windows Terminal UX (grid, tabs, splits, settings) in any
  modern browser without modifying the existing C++ tree.
- Reuse Windows Terminal's existing settings schema so users can carry their
  `settings.json` between native and web.
- Keep a clean PTY transport abstraction so additional backends (SSH-over-WS,
  serverless cloud shells) can be plugged in later.

## C++ → TypeScript module map
See the table in `web/README.md`.

## Renderer
- `Canvas2DRenderer` ships in slice 1. It measures glyph metrics once at startup
  and draws cell-by-cell using a per-row dirty flag.
- A WebGL2 atlas renderer is planned (`renderer/webgl/AtlasRenderer.ts`) that
  builds an `OffscreenCanvas` glyph atlas and draws via instanced quads. The
  `RendererOptions` type is shaped so the two are drop-in interchangeable.

## Out of scope (slice 1)
- conhost / ConPTY / Win32 console API
- WinUI / XAML Islands
- DirectWrite / Direct2D / Atlas HLSL
- Sixel / ReGIS / Kitty / iTerm2 inline images
- MSIX, PGO, Helix, TAEF tests
- Auth / multi-user session management
- Mobile touch, UIA bridge, Jump List
