// Terminal: wires VT parser → text buffer. Conceptual port of TerminalCore/Terminal.cpp.
import { StateMachine, VTSink } from "../parser/StateMachine.js";
import { Cell, Row, TextBuffer, DEFAULT_FG, DEFAULT_BG } from "../buffer/TextBuffer.js";

const ANSI_16: number[] = [
  0x0c0c0c, 0xc50f1f, 0x13a10e, 0xc19c00, 0x0037da, 0x881798, 0x3a96dd, 0xcccccc,
  0x767676, 0xe74856, 0x16c60c, 0xf9f1a5, 0x3b78ff, 0xb4009e, 0x61d6d6, 0xf2f2f2,
];

function ansi256(i: number): number {
  if (i < 16) return ANSI_16[i];
  if (i < 232) {
    const n = i - 16;
    const r = Math.floor(n / 36), g = Math.floor((n % 36) / 6), b = n % 6;
    const v = (x: number) => x === 0 ? 0 : 55 + x * 40;
    return (v(r) << 16) | (v(g) << 8) | v(b);
  }
  const c = 8 + (i - 232) * 10;
  return (c << 16) | (c << 8) | c;
}

export interface TerminalListener {
  onUpdate(): void;
  onWrite?(data: string): void;
  onBell?(): void;
  onTitle?(t: string): void;
}

export class Terminal implements VTSink {
  parser: StateMachine;
  buffer: TextBuffer;
  fg = DEFAULT_FG;
  bg = DEFAULT_BG;
  attrs = 0;
  title = "Web Terminal";
  cursorVisible = true;
  bracketedPaste = false;
  appCursorKeys = false;
  private utf8Buf = new Uint8Array(4);
  private utf8Len = 0;
  private utf8Need = 0;
  private dirty = true;
  private rafScheduled = false;

  constructor(public cols: number, public rows: number, public listener: TerminalListener) {
    this.parser = new StateMachine(this);
    this.buffer = new TextBuffer(cols, rows);
  }

  resize(cols: number, rows: number) {
    this.cols = cols; this.rows = rows;
    this.buffer.resize(cols, rows);
    this.markDirty();
  }

  write(data: Uint8Array): void {
    // UTF-8 decode then feed
    for (let i = 0; i < data.length; i++) {
      const b = data[i];
      if (this.utf8Need > 0) {
        this.utf8Buf[this.utf8Len++] = b;
        this.utf8Need--;
        if (this.utf8Need === 0) {
          try {
            const s = new TextDecoder().decode(this.utf8Buf.slice(0, this.utf8Len));
            for (const ch of s) this.feedChar(ch.charCodeAt(0));
          } catch { /* ignore */ }
          this.utf8Len = 0;
        }
        continue;
      }
      if (b < 0x80) { this.parser.feed(Uint8Array.of(b)); continue; }
      if (b >= 0xc0) {
        const lead = b;
        if (lead < 0xe0) this.utf8Need = 1;
        else if (lead < 0xf0) this.utf8Need = 2;
        else this.utf8Need = 3;
        this.utf8Buf[0] = b; this.utf8Len = 1;
      }
    }
    this.markDirty();
  }

  private feedChar(code: number) {
    this.print(String.fromCharCode(code));
  }

  private markDirty() {
    this.dirty = true;
    if (!this.rafScheduled) {
      this.rafScheduled = true;
      queueMicrotask(() => {
        this.rafScheduled = false;
        if (this.dirty) { this.dirty = false; this.listener.onUpdate(); }
      });
    }
  }

  // ─── VTSink ─────────────────────────────────────────────────────────
  print(ch: string): void {
    const b = this.buffer;
    if (b.cursorX >= b.cols) {
      b.cursorX = 0;
      this.lineFeed();
    }
    const row = b.rowAt(b.cursorY);
    row.cells[b.cursorX] = { ch, fg: this.fg, bg: this.bg, attrs: this.attrs };
    row.dirty = true;
    b.cursorX++;
  }

  execute(c: number): void {
    const b = this.buffer;
    switch (c) {
      case 0x07: this.listener.onBell?.(); return;
      case 0x08: if (b.cursorX > 0) b.cursorX--; return;
      case 0x09: { // tab
        const next = Math.min(b.cols - 1, (Math.floor(b.cursorX / 8) + 1) * 8);
        b.cursorX = next; return;
      }
      case 0x0a: case 0x0b: case 0x0c: this.lineFeed(); return;
      case 0x0d: b.cursorX = 0; return;
    }
  }

  private lineFeed() {
    const b = this.buffer;
    if (b.cursorY === b.scrollBottom) b.scrollUp(1);
    else b.cursorY++;
  }

  csi(final: string, params: number[], intermediates: string, priv: string): void {
    const b = this.buffer;
    const p = (i: number, def = 0) => (params[i] === undefined || params[i] === 0 ? def : params[i]);
    switch (final) {
      case "A": b.cursorY = Math.max(0, b.cursorY - p(0, 1)); return;
      case "B": b.cursorY = Math.min(b.height - 1, b.cursorY + p(0, 1)); return;
      case "C": b.cursorX = Math.min(b.cols - 1, b.cursorX + p(0, 1)); return;
      case "D": b.cursorX = Math.max(0, b.cursorX - p(0, 1)); return;
      case "G": b.cursorX = Math.max(0, Math.min(b.cols - 1, p(0, 1) - 1)); return;
      case "H": case "f": {
        b.cursorY = Math.max(0, Math.min(b.height - 1, p(0, 1) - 1));
        b.cursorX = Math.max(0, Math.min(b.cols - 1, p(1, 1) - 1));
        return;
      }
      case "J": this.eraseDisplay(p(0)); return;
      case "K": this.eraseLine(p(0)); return;
      case "L": { // IL: insert lines
        const n = p(0, 1);
        if (b.cursorY >= b.scrollTop && b.cursorY <= b.scrollBottom) {
          for (let i = 0; i < n; i++) {
            b.rows.splice(b.scrollBottom, 1);
            b.rows.splice(b.cursorY, 0, new Row(b.cols));
          }
        }
        return;
      }
      case "M": { // DL: delete lines
        const n = p(0, 1);
        if (b.cursorY >= b.scrollTop && b.cursorY <= b.scrollBottom) {
          for (let i = 0; i < n; i++) {
            b.rows.splice(b.cursorY, 1);
            b.rows.splice(b.scrollBottom, 0, new Row(b.cols));
          }
        }
        return;
      }
      case "P": { // DCH
        const row = b.rowAt(b.cursorY);
        const n = p(0, 1);
        row.cells.splice(b.cursorX, n);
        while (row.cells.length < b.cols) row.cells.push({ ch: " ", fg: this.fg, bg: this.bg, attrs: 0 });
        row.dirty = true;
        return;
      }
      case "X": { // ECH
        const row = b.rowAt(b.cursorY);
        const n = p(0, 1);
        for (let i = 0; i < n && b.cursorX + i < b.cols; i++) {
          row.cells[b.cursorX + i] = { ch: " ", fg: this.fg, bg: this.bg, attrs: 0 };
        }
        row.dirty = true;
        return;
      }
      case "@": { // ICH
        const row = b.rowAt(b.cursorY);
        const n = p(0, 1);
        for (let i = 0; i < n; i++) row.cells.splice(b.cursorX, 0, { ch: " ", fg: this.fg, bg: this.bg, attrs: 0 });
        row.cells.length = b.cols;
        row.dirty = true;
        return;
      }
      case "d": b.cursorY = Math.max(0, Math.min(b.height - 1, p(0, 1) - 1)); return;
      case "h": case "l": this.setMode(final === "h", params, priv); return;
      case "m": this.sgr(params); return;
      case "n":
        if (p(0) === 6) this.listener.onWrite?.(`\x1b[${b.cursorY + 1};${b.cursorX + 1}R`);
        return;
      case "r": {
        b.scrollTop = Math.max(0, p(0, 1) - 1);
        b.scrollBottom = Math.min(b.height - 1, p(1, b.height) - 1);
        b.cursorX = 0; b.cursorY = 0;
        return;
      }
      case "s": b.savedCursor = { x: b.cursorX, y: b.cursorY }; return;
      case "u":
        if (b.savedCursor) { b.cursorX = b.savedCursor.x; b.cursorY = b.savedCursor.y; }
        return;
    }
  }

  esc(final: string, _inter: string): void {
    const b = this.buffer;
    switch (final) {
      case "D": this.lineFeed(); return;
      case "E": b.cursorX = 0; this.lineFeed(); return;
      case "M": if (b.cursorY === b.scrollTop) b.scrollDown(1); else b.cursorY--; return;
      case "7": b.savedCursor = { x: b.cursorX, y: b.cursorY }; return;
      case "8":
        if (b.savedCursor) { b.cursorX = b.savedCursor.x; b.cursorY = b.savedCursor.y; }
        return;
      case "c": // RIS — full reset
        this.fg = DEFAULT_FG; this.bg = DEFAULT_BG; this.attrs = 0;
        this.buffer = new TextBuffer(this.cols, this.rows);
        return;
    }
  }

  osc(id: number, data: string): void {
    if (id === 0 || id === 2) { this.title = data; this.listener.onTitle?.(data); return; }
    // OSC 8 hyperlinks: tracked but not visually rendered in this slice
    // OSC 52: clipboard
    if (id === 52) {
      const semi = data.indexOf(";");
      if (semi >= 0) {
        try {
          const b64 = data.slice(semi + 1);
          const text = atob(b64);
          navigator.clipboard?.writeText(text).catch(() => {});
        } catch { /* ignore */ }
      }
      return;
    }
    // OSC 4/10/11/12 color queries: ignore (could respond with default)
  }

  dcs(_final: string, _params: number[], _data: string): void {
    // DCS sequences accepted but not rendered (Sixel etc. out of scope).
  }

  // ─── helpers ────────────────────────────────────────────────────────
  private eraseDisplay(mode: number) {
    const b = this.buffer;
    const blank = () => ({ ch: " ", fg: this.fg, bg: this.bg, attrs: 0 });
    if (mode === 2 || mode === 3) {
      for (const r of b.rows) { for (let i = 0; i < r.cells.length; i++) r.cells[i] = blank(); r.dirty = true; }
    } else if (mode === 1) {
      for (let y = 0; y <= b.cursorY; y++) {
        const r = b.rowAt(y);
        const end = y === b.cursorY ? b.cursorX : r.cols - 1;
        for (let i = 0; i <= end; i++) r.cells[i] = blank();
        r.dirty = true;
      }
    } else {
      const r = b.rowAt(b.cursorY);
      for (let i = b.cursorX; i < r.cols; i++) r.cells[i] = blank();
      r.dirty = true;
      for (let y = b.cursorY + 1; y < b.height; y++) {
        const rr = b.rowAt(y);
        for (let i = 0; i < rr.cells.length; i++) rr.cells[i] = blank();
        rr.dirty = true;
      }
    }
  }

  private eraseLine(mode: number) {
    const b = this.buffer;
    const r = b.rowAt(b.cursorY);
    const blank = () => ({ ch: " ", fg: this.fg, bg: this.bg, attrs: 0 });
    if (mode === 2) for (let i = 0; i < r.cells.length; i++) r.cells[i] = blank();
    else if (mode === 1) for (let i = 0; i <= b.cursorX; i++) r.cells[i] = blank();
    else for (let i = b.cursorX; i < r.cells.length; i++) r.cells[i] = blank();
    r.dirty = true;
  }

  private setMode(set: boolean, params: number[], priv: string) {
    if (priv === "?") {
      for (const m of params) {
        switch (m) {
          case 1: this.appCursorKeys = set; break;
          case 25: this.cursorVisible = set; break;
          case 1049: { // alt screen
            const b = this.buffer;
            if (set) { b.savedCursor = { x: b.cursorX, y: b.cursorY }; this.buffer = new TextBuffer(this.cols, this.rows); }
            else { this.buffer = new TextBuffer(this.cols, this.rows); }
            break;
          }
          case 2004: this.bracketedPaste = set; break;
        }
      }
    }
  }

  private sgr(params: number[]) {
    if (params.length === 0) params = [0];
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      if (p === 0) { this.fg = DEFAULT_FG; this.bg = DEFAULT_BG; this.attrs = 0; }
      else if (p === 1) this.attrs |= 1;
      else if (p === 2) this.attrs |= 16;
      else if (p === 3) this.attrs |= 8;
      else if (p === 4) this.attrs |= 2;
      else if (p === 7) this.attrs |= 4;
      else if (p === 9) this.attrs |= 32;
      else if (p === 22) this.attrs &= ~(1 | 16);
      else if (p === 23) this.attrs &= ~8;
      else if (p === 24) this.attrs &= ~2;
      else if (p === 27) this.attrs &= ~4;
      else if (p === 29) this.attrs &= ~32;
      else if (p >= 30 && p <= 37) this.fg = ANSI_16[p - 30];
      else if (p === 38) {
        if (params[i + 1] === 5) { this.fg = ansi256(params[i + 2] || 0); i += 2; }
        else if (params[i + 1] === 2) { this.fg = ((params[i + 2] || 0) << 16) | ((params[i + 3] || 0) << 8) | (params[i + 4] || 0); i += 4; }
      }
      else if (p === 39) this.fg = DEFAULT_FG;
      else if (p >= 40 && p <= 47) this.bg = ANSI_16[p - 40];
      else if (p === 48) {
        if (params[i + 1] === 5) { this.bg = ansi256(params[i + 2] || 0); i += 2; }
        else if (params[i + 1] === 2) { this.bg = ((params[i + 2] || 0) << 16) | ((params[i + 3] || 0) << 8) | (params[i + 4] || 0); i += 4; }
      }
      else if (p === 49) this.bg = DEFAULT_BG;
      else if (p >= 90 && p <= 97) this.fg = ANSI_16[p - 90 + 8];
      else if (p >= 100 && p <= 107) this.bg = ANSI_16[p - 100 + 8];
    }
  }
}
