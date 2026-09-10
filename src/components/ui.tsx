import React, { useEffect, useRef, useState } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700",
    planned: "bg-slate-100 text-slate-700",
    confirmed: "bg-blue-100 text-blue-700",
    in_progress: "bg-amber-100 text-amber-700",
    shipped: "bg-indigo-100 text-indigo-700",
    received: "bg-indigo-100 text-indigo-700",
    completed: "bg-emerald-100 text-emerald-700",
    posted: "bg-emerald-100 text-emerald-700",
    approved: "bg-emerald-100 text-emerald-700",
    closed: "bg-slate-200 text-slate-600",
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[status] ?? "bg-slate-100 text-slate-700"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="card p-12 text-center text-slate-400">
      {message}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
      {message}
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="card p-12 text-center text-slate-400">
      Loading…
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  message,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="card p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="btn-secondary">Cancel / منسوخ کریں</button>
          <button onClick={onConfirm} className="btn-danger">Confirm / تصدیق کریں</button>
        </div>
      </div>
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  panelClassName = "",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  panelClassName?: string;
}) {
  const [minimized, setMinimized] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  useEffect(() => {
    if (open) {
      setMinimized(false);
      setOffset({ x: 0, y: 0 });
    }
  }, [open]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragState.current.dragging || window.innerWidth < 768) return;
      const dx = event.clientX - dragState.current.startX;
      const dy = event.clientY - dragState.current.startY;
      const panel = panelRef.current;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      const nextX = dragState.current.originX + dx;
      const nextY = dragState.current.originY + dy;
      const halfW = rect.width / 2;
      const halfH = Math.min(rect.height / 2, window.innerHeight / 2);
      const maxX = Math.max(0, window.innerWidth / 2 - halfW - 8);
      const maxY = Math.max(0, window.innerHeight / 2 - halfH - 8);

      setOffset({
        x: Math.max(-maxX, Math.min(maxX, nextX)),
        y: Math.max(-maxY, Math.min(maxY, nextY)),
      });
    };

    const onUp = () => {
      dragState.current.dragging = false;
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
    };
  }, []);

  if (!open) return null;

  if (minimized) {
    return (
      <div className="pointer-events-none fixed inset-0 z-50">
        <div className="pointer-events-auto fixed bottom-4 right-4 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-2xl">
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="min-w-0 flex-1 text-left"
            title="Restore modal"
          >
            <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
            <div className="text-[11px] text-slate-500">Minimized — click to restore / چھوٹا کیا گیا</div>
          </button>
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            aria-label="Restore modal"
          >
            Restore
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (window.innerWidth < 768) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, [data-no-drag]")) return;

    dragState.current = {
      dragging: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    document.body.style.userSelect = "none";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div
        ref={panelRef}
        className={`card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto p-6 shadow-2xl transition-shadow ${panelClassName}`}
        style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 z-10 -mx-1 mb-4 flex cursor-default items-center justify-between gap-3 bg-white/95 px-1 pb-2 backdrop-blur md:cursor-move"
          onPointerDown={startDrag}
          title="Drag to move / پکڑ کر منتقل کریں"
        >
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-slate-900">{title}</h3>
            <div className="hidden text-[10px] text-slate-400 md:block">Drag header to move / ہیڈر پکڑ کر منتقل کریں</div>
          </div>
          <div className="flex shrink-0 items-center gap-1" data-no-drag>
            <button
              type="button"
              onClick={() => setMinimized(true)}
              className="rounded-md px-2.5 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Minimize modal"
              title="Minimize / چھوٹا کریں"
            >
              —
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close modal"
              title="Close / بند کریں"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// Updated to PKR Format (Rs.)
export function formatCurrency(n: number): string {
  return `Rs. ${Number(n || 0).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(s: string): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" });
}
