// Key translator: KeyboardEvent → VT bytes.
// Conceptual port of src/terminal/input/terminalInput.cpp.

export interface KeyTranslatorOptions {
  appCursorKeys?: () => boolean;
  bracketedPaste?: () => boolean;
}

export class KeyTranslator {
  constructor(private opts: KeyTranslatorOptions = {}) {}

  translate(e: KeyboardEvent): string | null {
    const k = e.key;
    const ctrl = e.ctrlKey;
    const alt = e.altKey;
    const shift = e.shiftKey;

    // Plain characters
    if (k.length === 1 && !ctrl && !alt && !e.metaKey) return k;

    // Alt-prefix: ESC + char
    if (alt && k.length === 1 && !ctrl) return "\x1b" + k;

    // Ctrl + letter
    if (ctrl && !alt && k.length === 1) {
      const c = k.toLowerCase().charCodeAt(0);
      if (c >= 0x61 && c <= 0x7a) return String.fromCharCode(c - 0x60);
      if (k === " ") return "\x00";
      if (k === "[") return "\x1b";
      if (k === "\\") return "\x1c";
      if (k === "]") return "\x1d";
      if (k === "^") return "\x1e";
      if (k === "_") return "\x1f";
      if (k === "?") return "\x7f";
    }

    const appCursor = this.opts.appCursorKeys?.() ?? false;
    const mod = modParam(e);

    const csi = (final: string) => `\x1b[${mod ? `1;${mod}` : ""}${final}`;
    const ss3 = (final: string) => `\x1b${appCursor ? "O" : "["}${mod ? `1;${mod}` : ""}${final}`;

    switch (k) {
      case "Enter": return "\r";
      case "Tab": return shift ? "\x1b[Z" : "\t";
      case "Backspace": return "\x7f";
      case "Escape": return "\x1b";
      case "ArrowUp": return ss3("A");
      case "ArrowDown": return ss3("B");
      case "ArrowRight": return ss3("C");
      case "ArrowLeft": return ss3("D");
      case "Home": return ss3("H");
      case "End": return ss3("F");
      case "Insert": return `\x1b[2${mod ? `;${mod}` : ""}~`;
      case "Delete": return `\x1b[3${mod ? `;${mod}` : ""}~`;
      case "PageUp": return `\x1b[5${mod ? `;${mod}` : ""}~`;
      case "PageDown": return `\x1b[6${mod ? `;${mod}` : ""}~`;
      case "F1": return csi("P");
      case "F2": return csi("Q");
      case "F3": return csi("R");
      case "F4": return csi("S");
      case "F5": return `\x1b[15${mod ? `;${mod}` : ""}~`;
      case "F6": return `\x1b[17${mod ? `;${mod}` : ""}~`;
      case "F7": return `\x1b[18${mod ? `;${mod}` : ""}~`;
      case "F8": return `\x1b[19${mod ? `;${mod}` : ""}~`;
      case "F9": return `\x1b[20${mod ? `;${mod}` : ""}~`;
      case "F10": return `\x1b[21${mod ? `;${mod}` : ""}~`;
      case "F11": return `\x1b[23${mod ? `;${mod}` : ""}~`;
      case "F12": return `\x1b[24${mod ? `;${mod}` : ""}~`;
    }
    return null;
  }

  paste(text: string): string {
    if (this.opts.bracketedPaste?.()) return `\x1b[200~${text}\x1b[201~`;
    return text;
  }
}

function modParam(e: KeyboardEvent): number {
  let m = 0;
  if (e.shiftKey) m |= 1;
  if (e.altKey) m |= 2;
  if (e.ctrlKey) m |= 4;
  return m === 0 ? 0 : m + 1;
}
