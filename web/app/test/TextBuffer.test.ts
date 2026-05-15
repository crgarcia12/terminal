import { describe, it, expect } from "vitest";
import { TextBuffer } from "../src/core/buffer/TextBuffer.js";

describe("TextBuffer", () => {
  it("creates a buffer of given size", () => {
    const b = new TextBuffer(80, 24);
    expect(b.rows.length).toBe(24);
    expect(b.rows[0].cells.length).toBe(80);
  });
  it("resizes rows/cols", () => {
    const b = new TextBuffer(80, 24);
    b.resize(100, 30);
    expect(b.rows.length).toBe(30);
    expect(b.rows[0].cells.length).toBe(100);
  });
  it("scrolls up moving line into scrollback", () => {
    const b = new TextBuffer(10, 3);
    b.rowAt(0).cells[0].ch = "X";
    b.scrollUp(1);
    expect(b.scrollback.length).toBe(1);
    expect(b.scrollback[0].cells[0].ch).toBe("X");
  });
  it("limits scrollback by maxScrollback", () => {
    const b = new TextBuffer(10, 1, 3);
    for (let i = 0; i < 10; i++) { b.rowAt(0).cells[0].ch = String(i); b.scrollUp(1); }
    expect(b.scrollback.length).toBe(3);
  });
});
