// Text buffer with scrollback. Conceptual port of src/buffer/out/.
export interface Cell {
  ch: string;
  fg: number; // 0xRRGGBB | -1 default
  bg: number;
  attrs: number; // bit flags: 1 bold, 2 underline, 4 inverse, 8 italic, 16 dim, 32 strike
}

export const DEFAULT_FG = -1;
export const DEFAULT_BG = -1;

export function blankCell(): Cell {
  return { ch: " ", fg: DEFAULT_FG, bg: DEFAULT_BG, attrs: 0 };
}

export class Row {
  cells: Cell[];
  dirty = true;
  constructor(public cols: number) {
    this.cells = new Array(cols);
    for (let i = 0; i < cols; i++) this.cells[i] = blankCell();
  }
  resize(cols: number) {
    if (cols === this.cols) return;
    if (cols > this.cols) {
      for (let i = this.cols; i < cols; i++) this.cells.push(blankCell());
    } else {
      this.cells.length = cols;
    }
    this.cols = cols;
    this.dirty = true;
  }
}

export class TextBuffer {
  rows: Row[] = [];
  scrollback: Row[] = [];
  maxScrollback: number;
  cols: number;
  height: number;
  cursorX = 0;
  cursorY = 0;
  scrollTop = 0;
  scrollBottom: number;
  savedCursor: { x: number; y: number } | null = null;
  // viewOffset: number of lines scrolled up from the live viewport (0 = at bottom)
  viewOffset = 0;

  constructor(cols: number, height: number, maxScrollback = 10000) {
    this.cols = cols;
    this.height = height;
    this.scrollBottom = height - 1;
    this.maxScrollback = maxScrollback;
    for (let i = 0; i < height; i++) this.rows.push(new Row(cols));
  }

  resize(cols: number, height: number) {
    this.cols = cols;
    if (height > this.height) {
      for (let i = this.height; i < height; i++) this.rows.push(new Row(cols));
    } else if (height < this.height) {
      this.rows.length = height;
    }
    this.height = height;
    this.scrollBottom = height - 1;
    for (const r of this.rows) r.resize(cols);
    if (this.cursorY >= height) this.cursorY = height - 1;
    if (this.cursorX >= cols) this.cursorX = cols - 1;
  }

  rowAt(y: number): Row {
    return this.rows[y];
  }

  // Get the row visible at viewport position y, accounting for viewOffset
  visibleRow(y: number): Row | null {
    if (this.viewOffset === 0) return this.rows[y];
    const sb = this.viewOffset;
    if (y < sb) {
      const idx = this.scrollback.length - sb + y;
      return idx >= 0 ? this.scrollback[idx] : null;
    }
    return this.rows[y - sb];
  }

  scrollUp(n = 1) {
    for (let i = 0; i < n; i++) {
      const top = this.rows[this.scrollTop];
      if (this.scrollTop === 0 && this.scrollBottom === this.height - 1) {
        this.scrollback.push(top);
        if (this.scrollback.length > this.maxScrollback) this.scrollback.shift();
      }
      this.rows.splice(this.scrollTop, 1);
      this.rows.splice(this.scrollBottom, 0, new Row(this.cols));
    }
  }

  scrollDown(n = 1) {
    for (let i = 0; i < n; i++) {
      this.rows.splice(this.scrollBottom, 1);
      this.rows.splice(this.scrollTop, 0, new Row(this.cols));
    }
  }

  scrollViewBy(delta: number) {
    const max = this.scrollback.length;
    this.viewOffset = Math.min(max, Math.max(0, this.viewOffset + delta));
  }

  totalLines(): number {
    return this.scrollback.length + this.height;
  }
}
