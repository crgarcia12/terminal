// Minimal color-scheme set & settings loader.
export interface ColorScheme {
  name: string;
  background: number;
  foreground: number;
  cursorColor: number;
}

export const SCHEMES: Record<string, ColorScheme> = {
  "Campbell": {
    name: "Campbell",
    background: 0x0c0c0c,
    foreground: 0xcccccc,
    cursorColor: 0xffffff,
  },
  "Campbell Powershell": {
    name: "Campbell Powershell",
    background: 0x012456,
    foreground: 0xcccccc,
    cursorColor: 0xffffff,
  },
  "One Half Dark": {
    name: "One Half Dark",
    background: 0x282c34,
    foreground: 0xdcdfe4,
    cursorColor: 0xdcdfe4,
  },
  "Solarized Dark": {
    name: "Solarized Dark",
    background: 0x002b36,
    foreground: 0x839496,
    cursorColor: 0x839496,
  },
  "Vintage": {
    name: "Vintage",
    background: 0x000000,
    foreground: 0xc0c0c0,
    cursorColor: 0xc0c0c0,
  },
};

export interface UserSettings {
  colorScheme?: string;
  fontFace?: string;
  fontSize?: number;
  cursorShape?: "block" | "bar" | "underline";
  cursorColor?: string;
  padding?: string;
  tabTitle?: string;
  useAcrylic?: boolean;
}

export function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem("settings.json");
    if (!raw) return {};
    return JSON.parse(raw) as UserSettings;
  } catch { return {}; }
}

export function applyAcrylic(el: HTMLElement, on: boolean) {
  el.style.backdropFilter = on ? "blur(10px) saturate(180%)" : "";
}

export function hexToInt(hex: string): number {
  return parseInt(hex.replace(/^#/, ""), 16) || 0;
}
