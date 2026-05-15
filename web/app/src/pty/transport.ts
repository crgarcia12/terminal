// PTY transport interface and WebSocket implementation.
export interface PtyTransport {
  write(data: Uint8Array | string): void;
  onData(cb: (data: Uint8Array) => void): void;
  resize(cols: number, rows: number): void;
  dispose(): void;
}

export class WebSocketPty implements PtyTransport {
  private ws: WebSocket;
  private listeners: Array<(d: Uint8Array) => void> = [];
  private queue: Array<Uint8Array | string> = [];
  private ready = false;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";
    this.ws.addEventListener("open", () => {
      this.ready = true;
      for (const m of this.queue) this.sendRaw(m);
      this.queue = [];
    });
    this.ws.addEventListener("message", (ev) => {
      if (typeof ev.data === "string") {
        const bytes = new TextEncoder().encode(ev.data);
        for (const l of this.listeners) l(bytes);
      } else {
        const bytes = new Uint8Array(ev.data as ArrayBuffer);
        for (const l of this.listeners) l(bytes);
      }
    });
    this.ws.addEventListener("close", () => {
      const msg = new TextEncoder().encode("\r\n[connection closed]\r\n");
      for (const l of this.listeners) l(msg);
    });
  }

  private sendRaw(data: Uint8Array | string) {
    if (typeof data === "string") this.ws.send(data);
    else this.ws.send(data);
  }

  write(data: Uint8Array | string): void {
    if (!this.ready) { this.queue.push(data); return; }
    this.sendRaw(data);
  }

  onData(cb: (data: Uint8Array) => void): void { this.listeners.push(cb); }

  resize(cols: number, rows: number): void {
    const msg = JSON.stringify({ type: "resize", cols, rows });
    if (this.ready) this.ws.send(msg);
    else this.queue.push(msg);
  }

  dispose(): void { try { this.ws.close(); } catch {} }
}
