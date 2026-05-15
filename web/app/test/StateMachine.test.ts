import { describe, it, expect } from "vitest";
import { StateMachine, VTSink } from "../src/core/parser/StateMachine.js";

class Recorder implements VTSink {
  events: any[] = [];
  print(ch: string) { this.events.push(["print", ch]); }
  execute(b: number) { this.events.push(["exec", b]); }
  csi(f: string, p: number[], i: string, priv: string) { this.events.push(["csi", f, p, i, priv]); }
  esc(f: string, i: string) { this.events.push(["esc", f, i]); }
  osc(id: number, data: string) { this.events.push(["osc", id, data]); }
  dcs(f: string, p: number[], d: string) { this.events.push(["dcs", f, p, d]); }
}

function feed(s: string) {
  const r = new Recorder();
  const sm = new StateMachine(r);
  sm.feed(s);
  return r.events;
}

describe("StateMachine", () => {
  it("prints plain text", () => {
    expect(feed("abc")).toEqual([["print", "a"], ["print", "b"], ["print", "c"]]);
  });
  it("handles C0 controls", () => {
    expect(feed("\x07\x08\x0a\x0d")).toEqual([
      ["exec", 7], ["exec", 8], ["exec", 10], ["exec", 13],
    ]);
  });
  it("parses CSI without params", () => {
    expect(feed("\x1b[H")).toEqual([["csi", "H", [], "", ""]]);
  });
  it("parses CSI with single param", () => {
    expect(feed("\x1b[5A")).toEqual([["csi", "A", [5], "", ""]]);
  });
  it("parses CSI with multiple params", () => {
    expect(feed("\x1b[10;20H")).toEqual([["csi", "H", [10, 20], "", ""]]);
  });
  it("parses private CSI", () => {
    expect(feed("\x1b[?25h")).toEqual([["csi", "h", [25], "", "?"]]);
  });
  it("parses SGR with default param", () => {
    // Empty param list is dispatched as []; the Terminal layer defaults this to 0.
    expect(feed("\x1b[m")).toEqual([["csi", "m", [], "", ""]]);
  });
  it("parses CSI with intermediates", () => {
    const e = feed("\x1b[ q");
    expect(e[0][0]).toBe("csi");
    expect(e[0][3]).toBe(" ");
  });
  it("parses ESC final without bracket", () => {
    expect(feed("\x1bD")).toEqual([["esc", "D", ""]]);
    expect(feed("\x1b7")).toEqual([["esc", "7", ""]]);
  });
  it("parses ESC with intermediate", () => {
    expect(feed("\x1b(B")).toEqual([["esc", "B", "("]]);
  });
  it("parses OSC terminated by BEL", () => {
    expect(feed("\x1b]0;hello\x07")).toEqual([["osc", 0, "hello"]]);
  });
  it("parses OSC terminated by ST (ESC \\)", () => {
    const e = feed("\x1b]2;title\x1b\\");
    // ESC closes OSC -> dispatches; then ESC consumes \\ as ESC + final
    expect(e[0]).toEqual(["osc", 2, "title"]);
  });
  it("parses OSC 8 hyperlink", () => {
    const e = feed("\x1b]8;;http://x\x07");
    expect(e[0][0]).toBe("osc");
    expect(e[0][1]).toBe(8);
  });
  it("parses OSC 52 clipboard", () => {
    const e = feed("\x1b]52;c;aGVsbG8=\x07");
    expect(e).toEqual([["osc", 52, "c;aGVsbG8="]]);
  });
  it("parses DCS", () => {
    const e = feed("\x1bP1;2qhello\x9c");
    expect(e[0][0]).toBe("dcs");
    expect(e[0][3]).toBe("hello");
  });
  it("ignores garbled CSI gracefully", () => {
    expect(() => feed("\x1b[abc;def;Z")).not.toThrow();
  });
  it("CAN cancels sequence", () => {
    expect(feed("\x1b[1\x18")).toEqual([["exec", 0x18]]);
  });
  it("SUB cancels sequence", () => {
    expect(feed("\x1b[1\x1a")).toEqual([["exec", 0x1a]]);
  });
  it("nested ESC resets state", () => {
    const e = feed("\x1b[1\x1b[2A");
    expect(e[e.length - 1]).toEqual(["csi", "A", [2], "", ""]);
  });
  it("CSI with empty params separated", () => {
    const e = feed("\x1b[;5H");
    expect(e[0]).toEqual(["csi", "H", [0, 5], "", ""]);
  });
  it("colon-separated SGR sub-params (38:2:...)", () => {
    const e = feed("\x1b[38:2::255:0:0m");
    expect(e[0][0]).toBe("csi");
  });
  it("mixed printable and control", () => {
    const e = feed("a\x1b[31mb");
    expect(e[0]).toEqual(["print", "a"]);
    expect(e[1]).toEqual(["csi", "m", [31], "", ""]);
    expect(e[2]).toEqual(["print", "b"]);
  });
  it("SS3 (ESC O P) — ESC O treated as a plain ESC final", () => {
    const e = feed("\x1bOP");
    // In this slice we do not specially handle SS3 prefix; ESC O is dispatched and 'P' prints/starts DCS.
    expect(e[0]).toEqual(["esc", "O", ""]);
  });
  it("APC string is consumed silently", () => {
    expect(feed("\x1b_xyz\x9c")).toEqual([]);
  });
  it("does not emit print for DEL (0x7f) in Ground", () => {
    expect(feed("\x7f")).toEqual([]);
  });
  it("handles large parameter clamped to 0xffff", () => {
    const e = feed("\x1b[9999999A");
    expect(e[0][2][0]).toBeLessThanOrEqual(0xffff);
  });
});
