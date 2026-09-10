import { useEffect } from "react";

type ManagedModal = {
  overlay: HTMLElement;
  panel: HTMLElement;
  toolbar: HTMLDivElement;
  restore: HTMLButtonElement;
  x: number;
  y: number;
  dragging: boolean;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  previousPanelPosition: string;
  previousPanelTranslate: string;
  previousOverlayBackground: string;
  previousOverlayBackdrop: string;
  previousOverlayPointerEvents: string;
};

const managed = new Map<HTMLElement, ManagedModal>();

function isCandidateOverlay(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.tagName === "BUTTON") return false;
  if (element.dataset.naviloGlobalModal === "managed") return false;
  if (element.querySelector('[aria-label="Minimize modal"]')) return false;
  if (element.classList.contains("lg:hidden")) return false;

  const classes = Array.from(element.classList);
  const looksLikeOverlay = classes.includes("fixed") && classes.includes("inset-0");
  const explicitDialog = element.getAttribute("role") === "dialog" || Boolean(element.querySelector('[role="dialog"]'));
  if (!looksLikeOverlay && !explicitDialog) return false;

  const text = element.textContent || "";
  if (text.includes("Professional Print Preview") || text.includes("Print / Save PDF")) return false;

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return true;
}

function findPanel(overlay: HTMLElement): HTMLElement | null {
  const directChildren = Array.from(overlay.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  const direct = directChildren.find((child) => child.tagName !== "BUTTON" && !child.dataset.naviloModalRestore);
  if (direct) return direct;
  const dialog = overlay.querySelector('[role="dialog"]');
  return dialog instanceof HTMLElement ? dialog : null;
}

function modalTitle(panel: HTMLElement): string {
  const heading = panel.querySelector("h1,h2,h3,h4,[data-modal-title]");
  const text = heading?.textContent?.trim();
  return text || "Open window / کھلی ونڈو";
}

function restoreModal(state: ManagedModal) {
  state.panel.style.display = "";
  state.overlay.style.background = state.previousOverlayBackground;
  state.overlay.style.backdropFilter = state.previousOverlayBackdrop;
  state.overlay.style.pointerEvents = state.previousOverlayPointerEvents;
  state.restore.style.display = "none";
}

function minimizeModal(state: ManagedModal) {
  state.panel.style.display = "none";
  state.overlay.style.setProperty("background", "transparent", "important");
  state.overlay.style.setProperty("backdrop-filter", "none", "important");
  state.overlay.style.pointerEvents = "none";
  state.restore.style.display = "flex";
}

function enhanceOverlay(overlay: HTMLElement) {
  if (managed.has(overlay) || overlay.dataset.naviloGlobalModal === "managed") return;
  const panel = findPanel(overlay);
  if (!panel) return;

  overlay.dataset.naviloGlobalModal = "managed";
  const computedPosition = window.getComputedStyle(panel).position;
  const previousPanelPosition = panel.style.position;
  if (computedPosition === "static") panel.style.position = "relative";

  const toolbar = document.createElement("div");
  toolbar.dataset.naviloModalTools = "true";
  toolbar.setAttribute("aria-label", "Window controls");
  toolbar.style.cssText = [
    "position:absolute",
    "top:8px",
    "right:40px",
    "z-index:2147483000",
    "display:flex",
    "align-items:center",
    "gap:4px",
    "padding:3px",
    "border:1px solid #e2e8f0",
    "border-radius:8px",
    "background:rgba(255,255,255,.96)",
    "box-shadow:0 4px 14px rgba(15,23,42,.12)",
  ].join(";");

  const move = document.createElement("button");
  move.type = "button";
  move.textContent = "↔";
  move.title = "Drag to move / پکڑ کر منتقل کریں";
  move.setAttribute("aria-label", "Move window");
  move.style.cssText = "border:0;background:transparent;padding:3px 7px;cursor:move;color:#475569;font-weight:700;border-radius:6px";

  const minimize = document.createElement("button");
  minimize.type = "button";
  minimize.textContent = "—";
  minimize.title = "Minimize / چھوٹا کریں";
  minimize.setAttribute("aria-label", "Minimize custom modal");
  minimize.style.cssText = "border:0;background:transparent;padding:3px 7px;cursor:pointer;color:#475569;font-weight:700;border-radius:6px";

  toolbar.append(move, minimize);
  panel.appendChild(toolbar);

  const restore = document.createElement("button");
  restore.type = "button";
  restore.dataset.naviloModalRestore = "true";
  restore.innerHTML = `<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700">${modalTitle(panel)}</span><span style="font-size:11px;color:#64748b;white-space:nowrap">Restore / واپس کھولیں</span>`;
  restore.style.cssText = [
    "display:none",
    "pointer-events:auto",
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:2147483646",
    "max-width:min(440px,calc(100vw - 32px))",
    "align-items:center",
    "gap:12px",
    "padding:10px 14px",
    "border:1px solid #cbd5e1",
    "border-radius:12px",
    "background:#fff",
    "color:#0f172a",
    "box-shadow:0 16px 40px rgba(15,23,42,.24)",
    "cursor:pointer",
  ].join(";");
  document.body.appendChild(restore);

  const state: ManagedModal = {
    overlay,
    panel,
    toolbar,
    restore,
    x: 0,
    y: 0,
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    previousPanelPosition,
    previousPanelTranslate: panel.style.translate,
    previousOverlayBackground: overlay.style.background,
    previousOverlayBackdrop: overlay.style.backdropFilter,
    previousOverlayPointerEvents: overlay.style.pointerEvents,
  };
  managed.set(overlay, state);

  minimize.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    minimizeModal(state);
  });
  restore.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    restoreModal(state);
  });

  move.addEventListener("pointerdown", (event) => {
    if (window.innerWidth < 768) return;
    event.preventDefault();
    event.stopPropagation();
    state.dragging = true;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.originX = state.x;
    state.originY = state.y;
    move.setPointerCapture?.(event.pointerId);
    document.body.style.userSelect = "none";
  });
}

function cleanupDetached() {
  for (const [overlay, state] of managed) {
    if (document.documentElement.contains(overlay)) continue;
    state.restore.remove();
    managed.delete(overlay);
  }
}

function scan() {
  const elements = Array.from(document.querySelectorAll("body *"));
  for (const element of elements) {
    if (isCandidateOverlay(element)) enhanceOverlay(element);
  }
  cleanupDetached();
}

export default function GlobalModalManager() {
  useEffect(() => {
    let frame = 0;
    const scheduleScan = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    };

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "role"] });

    const onMove = (event: PointerEvent) => {
      for (const state of managed.values()) {
        if (!state.dragging) continue;
        const dx = event.clientX - state.startX;
        const dy = event.clientY - state.startY;
        const rect = state.panel.getBoundingClientRect();
        const nextX = state.originX + dx;
        const nextY = state.originY + dy;
        const maxX = Math.max(0, window.innerWidth - Math.min(rect.width, window.innerWidth) - 16);
        const maxY = Math.max(0, window.innerHeight - Math.min(rect.height, window.innerHeight) - 16);
        state.x = Math.max(-maxX, Math.min(maxX, nextX));
        state.y = Math.max(-maxY, Math.min(maxY, nextY));
        state.panel.style.translate = `${state.x}px ${state.y}px`;
      }
    };

    const onUp = () => {
      let hadDrag = false;
      for (const state of managed.values()) {
        if (state.dragging) hadDrag = true;
        state.dragging = false;
      }
      if (hadDrag) document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    scheduleScan();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      document.body.style.userSelect = "";
      for (const state of managed.values()) {
        state.toolbar.remove();
        state.restore.remove();
        state.panel.style.position = state.previousPanelPosition;
        state.panel.style.translate = state.previousPanelTranslate;
        restoreModal(state);
      }
      managed.clear();
    };
  }, []);

  return null;
}
