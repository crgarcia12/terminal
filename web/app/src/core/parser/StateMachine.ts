// Ported (conceptually) from src/terminal/parser/StateMachine.cpp
// A table-driven VT/ANSI parser. Emits typed events to a sink.

export type SgrParam = number;

export interface VTSink {
  print(ch: string): void;
  execute(byte: number): void; // C0 / C1 control byte
  csi(final: string, params: number[], intermediates: string, priv: string): void;
  esc(final: string, intermediates: string): void;
  osc(id: number, data: string): void;
  dcs(final: string, params: number[], data: string): void;
}

const enum S {
  Ground,
  Escape,
  EscIntermediate,
  CsiEntry,
  CsiParam,
  CsiIntermediate,
  CsiIgnore,
  OscString,
  DcsEntry,
  DcsParam,
  DcsIntermediate,
  DcsPassthrough,
  DcsIgnore,
  SosPmApcString,
}

export class StateMachine {
  private state: S = S.Ground;
  private params: number[] = [];
  private curParam = -1;
  private intermediates = "";
  private priv = "";
  private oscBuf = "";
  private oscId = 0;
  private oscParsedId = false;
  private dcsFinal = "";
  private dcsData = "";

  constructor(private sink: VTSink) {}

  feed(data: Uint8Array | string): void {
    const isString = typeof data === "string";
    const len = isString ? (data as string).length : (data as Uint8Array).length;
    for (let i = 0; i < len; i++) {
      const c = isString ? (data as string).charCodeAt(i) : (data as Uint8Array)[i];
      this.step(c);
    }
  }

  private addParam(c: number) {
    if (this.curParam < 0) this.curParam = 0;
    this.curParam = this.curParam * 10 + (c - 0x30);
    if (this.curParam > 0xffff) this.curParam = 0xffff;
  }

  private flushParam() {
    this.params.push(this.curParam < 0 ? 0 : this.curParam);
    this.curParam = -1;
  }

  private resetCsi() {
    this.params = [];
    this.curParam = -1;
    this.intermediates = "";
    this.priv = "";
  }

  private resetOsc() {
    this.oscBuf = "";
    this.oscId = 0;
    this.oscParsedId = false;
  }

  private dispatchCsi(final: string) {
    if (this.curParam >= 0 || this.params.length > 0) this.flushParam();
    this.sink.csi(final, this.params, this.intermediates, this.priv);
  }

  private dispatchOsc() {
    let id = this.oscId;
    let data = this.oscBuf;
    if (!this.oscParsedId) {
      const semi = this.oscBuf.indexOf(";");
      if (semi >= 0) {
        const n = parseInt(this.oscBuf.slice(0, semi), 10);
        if (!isNaN(n)) { id = n; data = this.oscBuf.slice(semi + 1); }
      }
    }
    this.sink.osc(id, data);
  }

  private step(c: number): void {
    // C0 controls are handled in any state except OSC/DCS passthrough.
    if (c === 0x18 || c === 0x1a) { this.state = S.Ground; this.sink.execute(c); return; }
    if (c === 0x1b) {
      // If we were in a string-collection state, terminate it first (ESC \ form of ST).
      if (this.state === S.OscString) this.dispatchOsc();
      else if (this.state === S.DcsPassthrough) {
        if (this.curParam >= 0 || this.params.length > 0) this.flushParam();
        this.sink.dcs(this.dcsFinal, this.params, this.dcsData);
        this.dcsData = "";
      }
      this.state = S.Escape; this.resetCsi(); return;
    }

    switch (this.state) {
      case S.Ground:
        if (c < 0x20) { this.sink.execute(c); return; }
        if (c === 0x7f) return;
        // UTF-8: collect a code point starting here
        this.sink.print(String.fromCharCode(c));
        return;

      case S.Escape:
        if (c < 0x20) { this.sink.execute(c); return; }
        if (c === 0x5b) { this.state = S.CsiEntry; this.resetCsi(); return; } // [
        if (c === 0x5d) { this.state = S.OscString; this.resetOsc(); return; } // ]
        if (c === 0x50) { this.state = S.DcsEntry; this.resetCsi(); this.dcsData = ""; return; } // P
        if (c === 0x58 || c === 0x5e || c === 0x5f) { this.state = S.SosPmApcString; return; }
        if (c >= 0x20 && c <= 0x2f) { this.intermediates += String.fromCharCode(c); this.state = S.EscIntermediate; return; }
        if (c >= 0x30 && c <= 0x7e) { this.sink.esc(String.fromCharCode(c), this.intermediates); this.state = S.Ground; return; }
        this.state = S.Ground;
        return;

      case S.EscIntermediate:
        if (c >= 0x20 && c <= 0x2f) { this.intermediates += String.fromCharCode(c); return; }
        if (c >= 0x30 && c <= 0x7e) { this.sink.esc(String.fromCharCode(c), this.intermediates); this.state = S.Ground; return; }
        return;

      case S.CsiEntry:
        if (c < 0x20) { this.sink.execute(c); return; }
        if (c >= 0x3c && c <= 0x3f) { this.priv += String.fromCharCode(c); this.state = S.CsiParam; return; }
        if (c >= 0x30 && c <= 0x39) { this.addParam(c); this.state = S.CsiParam; return; }
        if (c === 0x3b) { this.flushParam(); this.state = S.CsiParam; return; }
        if (c >= 0x20 && c <= 0x2f) { this.intermediates += String.fromCharCode(c); this.state = S.CsiIntermediate; return; }
        if (c >= 0x40 && c <= 0x7e) { this.dispatchCsi(String.fromCharCode(c)); this.state = S.Ground; return; }
        this.state = S.CsiIgnore;
        return;

      case S.CsiParam:
        if (c < 0x20) { this.sink.execute(c); return; }
        if (c >= 0x30 && c <= 0x39) { this.addParam(c); return; }
        if (c === 0x3b || c === 0x3a) { this.flushParam(); return; }
        if (c >= 0x20 && c <= 0x2f) { this.intermediates += String.fromCharCode(c); this.state = S.CsiIntermediate; return; }
        if (c >= 0x40 && c <= 0x7e) { this.dispatchCsi(String.fromCharCode(c)); this.state = S.Ground; return; }
        this.state = S.CsiIgnore;
        return;

      case S.CsiIntermediate:
        if (c >= 0x20 && c <= 0x2f) { this.intermediates += String.fromCharCode(c); return; }
        if (c >= 0x40 && c <= 0x7e) { this.dispatchCsi(String.fromCharCode(c)); this.state = S.Ground; return; }
        if (c >= 0x30 && c <= 0x3f) { this.state = S.CsiIgnore; return; }
        return;

      case S.CsiIgnore:
        if (c >= 0x40 && c <= 0x7e) { this.state = S.Ground; }
        return;

      case S.OscString:
        if (c === 0x07) { this.dispatchOsc(); this.state = S.Ground; return; }
        if (c === 0x9c) { this.dispatchOsc(); this.state = S.Ground; return; }
        // ESC \ ST is handled by Escape→\, but for simplicity also check here:
        if (!this.oscParsedId && c === 0x3b) {
          const n = parseInt(this.oscBuf, 10);
          if (!isNaN(n)) { this.oscId = n; this.oscBuf = ""; this.oscParsedId = true; return; }
        }
        this.oscBuf += String.fromCharCode(c);
        return;

      case S.DcsEntry:
        if (c >= 0x30 && c <= 0x39) { this.addParam(c); this.state = S.DcsParam; return; }
        if (c === 0x3b) { this.flushParam(); this.state = S.DcsParam; return; }
        if (c >= 0x20 && c <= 0x2f) { this.intermediates += String.fromCharCode(c); this.state = S.DcsIntermediate; return; }
        if (c >= 0x40 && c <= 0x7e) { this.dcsFinal = String.fromCharCode(c); this.state = S.DcsPassthrough; return; }
        this.state = S.DcsIgnore;
        return;

      case S.DcsParam:
        if (c >= 0x30 && c <= 0x39) { this.addParam(c); return; }
        if (c === 0x3b) { this.flushParam(); return; }
        if (c >= 0x40 && c <= 0x7e) { this.dcsFinal = String.fromCharCode(c); this.state = S.DcsPassthrough; return; }
        return;

      case S.DcsIntermediate:
        if (c >= 0x40 && c <= 0x7e) { this.dcsFinal = String.fromCharCode(c); this.state = S.DcsPassthrough; return; }
        return;

      case S.DcsPassthrough:
        if (c === 0x9c) {
          if (this.curParam >= 0 || this.params.length > 0) this.flushParam();
          this.sink.dcs(this.dcsFinal, this.params, this.dcsData);
          this.dcsData = "";
          this.state = S.Ground;
          return;
        }
        this.dcsData += String.fromCharCode(c);
        return;

      case S.DcsIgnore:
        if (c === 0x9c) { this.state = S.Ground; }
        return;

      case S.SosPmApcString:
        if (c === 0x9c) { this.state = S.Ground; }
        return;
    }
  }
}
