import { Terminal } from "./core/terminal/Terminal.js";
import { Canvas2DRenderer } from "./renderer/canvas2d/Renderer.js";
import { KeyTranslator } from "./core/input/KeyTranslator.js";
import { WebSocketPty, PtyTransport } from "./pty/transport.js";
import { SCHEMES, loadSettings, applyAcrylic, hexToInt } from "./ui/settings.js";

interface PaneState {
  el: HTMLDivElement;
  canvas: HTMLCanvasElement;
  terminal: Terminal;
  renderer: Canvas2DRenderer;
  keyTr: KeyTranslator;
  pty: PtyTransport;
  resizeObserver: ResizeObserver;
}

interface TabState {
  id: number;
  el: HTMLDivElement;
  panesContainer: HTMLDivElement;
  panes: PaneState[];
  focusedPane: number;
  splitDirection: "h" | "v";
}

const settings = loadSettings();
const scheme = SCHEMES[settings.colorScheme ?? "Campbell"] ?? SCHEMES["Campbell"];
const fontFace = settings.fontFace ?? "Cascadia Mono, Menlo, Consolas, monospace";
const fontSize = settings.fontSize ?? 14;
const cursorShape = settings.cursorShape ?? "block";
const cursorColor = settings.cursorColor ? hexToInt(settings.cursorColor) : scheme.cursorColor;

document.body.style.background = "#" + scheme.background.toString(16).padStart(6, "0");
const appEl = document.getElementById("app") as HTMLDivElement;
applyAcrylic(appEl, !!settings.useAcrylic);

const tabsEl = document.getElementById("tabs") as HTMLDivElement;
const addTabEl = document.getElementById("addtab") as HTMLDivElement;
const panesEl = document.getElementById("panes") as HTMLDivElement;
const statusEl = document.getElementById("status") as HTMLDivElement;

const tabs: TabState[] = [];
let activeTab = -1;
let nextTabId = 1;

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  // Use page's URL as base so the path-prefix from the proxy is preserved.
  const path = location.pathname.endsWith("/") ? location.pathname + "pty" : location.pathname + "/pty";
  return `${proto}//${location.host}${path}`;
}

function createPane(container: HTMLDivElement): PaneState {
  const el = document.createElement("div");
  el.className = "pane";
  el.tabIndex = 0;
  const canvas = document.createElement("canvas");
  el.appendChild(canvas);
  container.appendChild(el);

  const terminal = new Terminal(80, 24, {
    onUpdate: () => renderer.render(),
    onWrite: (s) => pty.write(s),
    onTitle: (t) => { statusEl.textContent = t; },
  });
  const renderer = new Canvas2DRenderer(canvas, terminal, {
    fontFace, fontSize, bg: scheme.background, fg: scheme.foreground,
    cursorColor, cursorShape,
  });
  const keyTr = new KeyTranslator({
    appCursorKeys: () => terminal.appCursorKeys,
    bracketedPaste: () => terminal.bracketedPaste,
  });
  const pty = new WebSocketPty(wsUrl());
  pty.onData((d) => terminal.write(d));

  const fit = () => {
    const { cols, rows } = renderer.fitToContainer(el);
    terminal.resize(cols, rows);
    pty.resize(cols, rows);
    renderer.render();
  };
  const resizeObserver = new ResizeObserver(fit);
  resizeObserver.observe(el);
  requestAnimationFrame(fit);

  el.addEventListener("mousedown", () => el.focus());
  el.addEventListener("keydown", (e) => {
    // App-level shortcuts handled in window listener; here only chars.
    if (e.ctrlKey && e.shiftKey && (e.key === "T" || e.key === "D" || e.key === "W" || e.key === "C" || e.key === "V")) return;
    const s = keyTr.translate(e);
    if (s !== null) { pty.write(s); e.preventDefault(); }
  });
  el.addEventListener("wheel", (e) => {
    const lines = Math.sign(e.deltaY) * 3;
    terminal.buffer.scrollViewBy(-lines);
    renderer.render();
  });
  el.addEventListener("paste", async (e) => {
    e.preventDefault();
    const txt = e.clipboardData?.getData("text") ?? "";
    pty.write(keyTr.paste(txt));
  });

  const pane: PaneState = { el, canvas, terminal, renderer, keyTr, pty, resizeObserver };
  return pane;
}

function renderTabbar() {
  tabsEl.innerHTML = "";
  for (let i = 0; i < tabs.length; i++) {
    const t = tabs[i];
    const e = document.createElement("div");
    e.className = "tab" + (i === activeTab ? " active" : "");
    e.textContent = settings.tabTitle ?? `Terminal ${t.id}`;
    const close = document.createElement("span");
    close.className = "close";
    close.textContent = "×";
    close.addEventListener("click", (ev) => { ev.stopPropagation(); closeTab(i); });
    e.appendChild(close);
    e.addEventListener("click", () => setActiveTab(i));
    tabsEl.appendChild(e);
  }
}

function setActiveTab(i: number) {
  if (i < 0 || i >= tabs.length) return;
  activeTab = i;
  for (let j = 0; j < tabs.length; j++) tabs[j].panesContainer.style.display = j === i ? "flex" : "none";
  renderTabbar();
  const p = tabs[i].panes[tabs[i].focusedPane];
  if (p) p.el.focus();
}

function newTab() {
  const panesContainer = document.createElement("div");
  panesContainer.style.cssText = "flex:1;display:flex;flex-direction:row;width:100%;height:100%;";
  panesEl.appendChild(panesContainer);

  const tab: TabState = {
    id: nextTabId++,
    el: panesContainer,
    panesContainer,
    panes: [],
    focusedPane: 0,
    splitDirection: "h",
  };
  const pane = createPane(panesContainer);
  tab.panes.push(pane);
  tabs.push(tab);
  setActiveTab(tabs.length - 1);
  updateFocus();
}

function splitActivePane(direction: "h" | "v") {
  if (activeTab < 0) return;
  const tab = tabs[activeTab];
  tab.splitDirection = direction;
  tab.panesContainer.style.flexDirection = direction === "h" ? "row" : "column";
  const pane = createPane(tab.panesContainer);
  tab.panes.push(pane);
  tab.focusedPane = tab.panes.length - 1;
  updateFocus();
  setTimeout(() => pane.el.focus(), 0);
}

function updateFocus() {
  if (activeTab < 0) return;
  const tab = tabs[activeTab];
  for (let i = 0; i < tab.panes.length; i++) {
    tab.panes[i].el.classList.toggle("focused", i === tab.focusedPane);
  }
}

function closeTab(i: number) {
  const t = tabs[i];
  for (const p of t.panes) { p.pty.dispose(); p.resizeObserver.disconnect(); }
  t.panesContainer.remove();
  tabs.splice(i, 1);
  if (tabs.length === 0) { newTab(); return; }
  setActiveTab(Math.min(i, tabs.length - 1));
}

addTabEl.addEventListener("click", () => newTab());

window.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey && e.shiftKey)) return;
  const k = e.key.toUpperCase();
  if (k === "T") { e.preventDefault(); newTab(); }
  else if (k === "W") { e.preventDefault(); if (activeTab >= 0) closeTab(activeTab); }
  else if (k === "D") { e.preventDefault(); splitActivePane("h"); }
  else if (k === "R") { e.preventDefault(); location.reload(); }
  else if (k === "C") {
    // Copy selection if any text is selected in document
    const sel = window.getSelection()?.toString();
    if (sel) { e.preventDefault(); navigator.clipboard?.writeText(sel).catch(() => {}); }
  }
});

window.addEventListener("focusin", (e) => {
  const target = e.target as HTMLElement;
  if (activeTab < 0) return;
  const tab = tabs[activeTab];
  const idx = tab.panes.findIndex(p => p.el === target);
  if (idx >= 0) { tab.focusedPane = idx; updateFocus(); }
});

// Boot first tab
newTab();
