// Canvas2D renderer. Conceptually replaces src/renderer/atlas/.
// WebGL2 path omitted from this slice but the API is shaped to allow a swap.
import { Terminal } from "../../core/terminal/Terminal.js";
import { Cell, DEFAULT_FG, DEFAULT_BG } from "../../core/buffer/TextBuffer.js";

export interface RendererOptions {
  fontFace?: string;
  fontSize?: number;
  bg?: number;
  fg?: number;
  cursorColor?: number;
  cursorShape?: "block" | "bar" | "underline";
}

export class Canvas2DRenderer {
  private ctx: CanvasRenderingContext2D;
  cellW = 0;
  cellH = 0;
  fontFace: string;
  fontSize: number;
  bg: number;
  fg: number;
  cursorColor: number;
  cursorShape: "block" | "bar" | "underline";
  dpr = 1;

  constructor(public canvas: HTMLCanvasElement, public terminal: Terminal, opts: RendererOptions = {}) {
    this.ctx = canvas.getContext("2d")!;
    this.fontFace = opts.fontFace ?? "Cascadia Mono, Menlo, Consolas, monospace";
    this.fontSize = opts.fontSize ?? 14;
    this.bg = opts.bg ?? 0x0c0c0c;
    this.fg = opts.fg ?? 0xcccccc;
    this.cursorColor = opts.cursorColor ?? 0xffffff;
    this.cursorShape = opts.cursorShape ?? "block";
    this.measure();
  }

  setColors(bg: number, fg: number) { this.bg = bg; this.fg = fg; }
  setFont(face: string, size: number) { this.fontFace = face; this.fontSize = size; this.measure(); }

  measure() {
    const probe = document.createElement("span");
    probe.style.cssText = `position:absolute;visibility:hidden;font:${this.fontSize}px ${this.fontFace};`;
    probe.textContent = "M".repeat(80);
    document.body.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    this.cellW = rect.width / 80;
    this.cellH = Math.ceil(this.fontSize * 1.3);
    document.body.removeChild(probe);
  }

  fitToContainer(container: HTMLElement): { cols: number; rows: number } {
    this.dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const cols = Math.max(20, Math.floor(w / this.cellW));
    const rows = Math.max(5, Math.floor(h / this.cellH));
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return { cols, rows };
  }

  toHex(c: number, fallback: number): string {
    const v = c < 0 ? fallback : c;
    return "#" + v.toString(16).padStart(6, "0");
  }

  render() {
    const t = this.terminal;
    const b = t.buffer;
    const ctx = this.ctx;
    ctx.fillStyle = this.toHex(this.bg, 0x0c0c0c);
    ctx.fillRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    ctx.font = `${this.fontSize}px ${this.fontFace}`;
    ctx.textBaseline = "top";

    for (let y = 0; y < b.height; y++) {
      const row = b.visibleRow(y);
      if (!row) continue;
      for (let x = 0; x < row.cells.length; x++) {
        const cell = row.cells[x];
        const inverse = (cell.attrs & 4) !== 0;
        const fg = inverse ? (cell.bg < 0 ? this.bg : cell.bg) : (cell.fg < 0 ? this.fg : cell.fg);
        const bg = inverse ? (cell.fg < 0 ? this.fg : cell.fg) : (cell.bg < 0 ? this.bg : cell.bg);
        if (bg !== this.bg || inverse) {
          ctx.fillStyle = this.toHex(bg, this.bg);
          ctx.fillRect(x * this.cellW, y * this.cellH, this.cellW + 0.5, this.cellH);
        }
        if (cell.ch !== " " || (cell.attrs & 2)) {
          ctx.fillStyle = this.toHex(fg, this.fg);
          const bold = (cell.attrs & 1) !== 0;
          const italic = (cell.attrs & 8) !== 0;
          ctx.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${this.fontSize}px ${this.fontFace}`;
          ctx.fillText(cell.ch, x * this.cellW, y * this.cellH + 2);
          if (cell.attrs & 2) {
            ctx.fillRect(x * this.cellW, y * this.cellH + this.cellH - 2, this.cellW, 1);
          }
        }
      }
    }

    // Cursor
    if (t.cursorVisible && b.viewOffset === 0) {
      const cx = b.cursorX * this.cellW;
      const cy = b.cursorY * this.cellH;
      ctx.fillStyle = this.toHex(this.cursorColor, 0xffffff);
      if (this.cursorShape === "block") {
        ctx.globalAlpha = 0.6;
        ctx.fillRect(cx, cy, this.cellW, this.cellH);
        ctx.globalAlpha = 1;
      } else if (this.cursorShape === "bar") {
        ctx.fillRect(cx, cy, 2, this.cellH);
      } else {
        ctx.fillRect(cx, cy + this.cellH - 2, this.cellW, 2);
      }
    }
  }
}
