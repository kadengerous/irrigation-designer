import {
  useLayoutEffect,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type HTMLAttributes,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { GripVertical } from "lucide-react";
import {
  placeFloating,
  workspaceBounds,
  floatingObstacles,
  dockAt,
  placeTooltip,
  type Box,
  type TooltipBox,
} from "./floating-layout";

/** Share measured free edges with fixed dimension forms, without changing the drawing. */
export function WorkspacePanelBounds() {
  useLayoutEffect(() => {
    const shell = document.querySelector<HTMLElement>('.app-shell[data-mobile="false"]');
    if (!shell) return;
    let frame = 0;
    let previous = "";
    const update = () => {
      const bounds = workspaceBounds();
      // Keyboard pinning can make the shell the containing block of fixed forms.
      const transformed = getComputedStyle(shell).transform !== "none";
      const shellRect = shell.getBoundingClientRect();
      const origin = transformed ? shellRect.left : 0;
      const containingWidth = transformed ? shellRect.width : window.innerWidth;
      const left = bounds.x - origin;
      const right = Math.max(0, containingWidth - left - bounds.width);
      const headerBottom = (shell.querySelector(".app-header")?.getBoundingClientRect().bottom ?? shellRect.top) - shellRect.top + 8;
      const signature = `${left},${right},${bounds.width},${headerBottom}`;
      if (signature !== previous) {
        shell.style.setProperty("--workspace-free-left", `${left}px`);
        shell.style.setProperty("--workspace-free-right", `${right}px`);
        shell.style.setProperty("--workspace-free-width", `${bounds.width}px`);
        shell.style.setProperty("--workspace-header-clearance", `${headerBottom}px`);
        previous = signature;
      }
      frame = requestAnimationFrame(update);
    };
    update();
    return () => {
      cancelAnimationFrame(frame);
      for (const property of ["--workspace-free-left", "--workspace-free-right", "--workspace-free-width", "--workspace-header-clearance"])
        shell.style.removeProperty(property);
    };
  }, []);
  return null;
}

export function useFloatingPlacement(
  ref: RefObject<HTMLElement | null>,
  preferred: (b: Box) => { x: number; y: number },
  priority: number,
  enabled = true,
) {
  const preference = useRef(preferred);
  preference.current = preferred;
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    if (!enabled) { setBox(null); return; }
    let timer = 0;
    let alive = true;
    const update = () => {
      cancelAnimationFrame(timer);
      const el = ref.current;
      if (el) {
        const bounds = workspaceBounds();
        // scroll dimensions preserve the desired size after a temporary constraint.
        const width = Number(el.dataset.naturalWidth) || Math.max(el.scrollWidth, el.offsetWidth);
        const height =
          Number(el.dataset.naturalHeight) || Math.max(el.scrollHeight, el.offsetHeight);
        const next = placeFloating(
          bounds,
          { width, height },
          preference.current(bounds),
          floatingObstacles(el, priority),
        );
        setBox((old) =>
          old &&
          Object.keys(next).every((k) => Math.abs(old[k as keyof Box] - next[k as keyof Box]) < 0.5)
            ? old
            : next,
        );
      }
      if (alive) timer = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      alive = false;
      cancelAnimationFrame(timer);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [enabled, priority, ref]);
  return box;
}

export function AdaptiveTooltip({ label, children }: { label: string; children: ReactNode }) {
  return <span className="floating-tool-anchor" data-tool-label={label}>{children}</span>;
}

const TOOLTIP_SCOPE = ".app-header,.app-footer,.workspace-tool-strip,.mobile-tool-strip,.mobile-tool-grid";
function tooltipButton(target: EventTarget | null): HTMLButtonElement | null {
  const button = target instanceof Element ? target.closest("button") : null;
  return button?.closest(TOOLTIP_SCOPE) && !button.closest(".project-menu,[data-no-tooltip]") ? button : null;
}

/** A single tooltip system covers native buttons and shared Button components alike. */
export function WorkspaceTooltips() {
  const [active, setActive] = useState<{ button: HTMLButtonElement; label: string } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined, pending: HTMLButtonElement | null = null;
    let touchFocus = false;
    const labelFor = (button: HTMLButtonElement) => button.closest<HTMLElement>("[data-tool-label]")?.dataset.toolLabel ||
      button.getAttribute("aria-label") || button.getAttribute("title") || button.dataset.toolTitle || button.textContent?.trim() || "";
    const prepare = () => {
      for (const button of document.querySelectorAll<HTMLButtonElement>("button[title]")) {
        if (!tooltipButton(button)) continue;
        button.dataset.toolTitle = button.title;
        button.removeAttribute("title");
      }
    };
    const hide = () => { clearTimeout(timer); pending = null; setActive(null); };
    const show = (button: HTMLButtonElement | null, delay: number) => {
      if (!button) { hide(); return; }
      if (pending === button) return;
      hide(); pending = button;
      timer = setTimeout(() => {
        const label = labelFor(button);
        if (button.isConnected && label) setActive({ button, label });
      }, delay);
    };
    const over = (e: PointerEvent) => { if (e.pointerType !== "touch") show(tooltipButton(e.target), 350); };
    const out = (e: PointerEvent) => { if (tooltipButton(e.target) !== tooltipButton(e.relatedTarget)) hide(); };
    const focus = (e: FocusEvent) => { if (!touchFocus) show(tooltipButton(e.target), 0); };
    const down = (e: PointerEvent) => { touchFocus = e.pointerType === "touch"; hide(); };
    const key = (e: KeyboardEvent) => { touchFocus = false; if (["Escape", "Enter", " "].includes(e.key)) hide(); };
    prepare();
    const observer = new MutationObserver(prepare);
    observer.observe(document.querySelector(".app-shell") ?? document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });
    document.addEventListener("pointerover", over, true);
    document.addEventListener("pointerout", out, true);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("click", hide, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", key);
    window.addEventListener("blur", hide);
    return () => {
      clearTimeout(timer); observer.disconnect();
      document.removeEventListener("pointerover", over, true);
      document.removeEventListener("pointerout", out, true);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("click", hide, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", key);
      window.removeEventListener("blur", hide);
      for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-tool-title]")) {
        button.title = button.dataset.toolTitle!; delete button.dataset.toolTitle;
      }
    };
  }, []);
  return active ? <WorkspaceTooltipBubble button={active.button} label={active.label}/> : null;
}

function WorkspaceTooltipBubble({ button, label }: { button: HTMLButtonElement; label: string }) {
  const ref = useRef<HTMLDivElement>(null), id = useId();
  const [box, setBox] = useState<TooltipBox | null>(null);
  useLayoutEffect(() => {
    let frame = 0;
    const update = () => {
      const el = ref.current, r = button.getBoundingClientRect();
      if (el && button.isConnected && r.width && r.height) {
        const v = window.visualViewport;
        const bounds = { x: (v?.offsetLeft ?? 0) + 8, y: (v?.offsetTop ?? 0) + 8,
          width: (v?.width ?? window.innerWidth) - 16, height: (v?.height ?? window.innerHeight) - 16 };
        const bars = Array.from(document.querySelectorAll<HTMLElement>(".app-header,.app-footer")).map(bar => {
          const b = bar.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height };
        });
        const measure = el.querySelector<HTMLElement>(".workspace-tooltip-measure")!;
        const css = getComputedStyle(el);
        const chromeX = parseFloat(css.paddingLeft) + parseFloat(css.paddingRight) + parseFloat(css.borderLeftWidth) + parseFloat(css.borderRightWidth);
        const chromeY = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom) + parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
        const anchor = { x: r.left, y: r.top, width: r.width, height: r.height };
        const obstacles = [...floatingObstacles(el), ...bars];
        const fit = (availableWidth: number) => {
          // Measure the full label independently of its previously constrained box.
          // The small rounding reserve avoids clipping the final character in Safari.
          measure.style.maxWidth = `${Math.max(1, availableWidth - chromeX - 2)}px`;
          const text = measure.getBoundingClientRect();
          const size = { width: Math.ceil(text.width + chromeX + 2), height: Math.ceil(text.height + chromeY) };
          return placeTooltip(bounds, size, anchor, obstacles);
        };
        let next = fit(bounds.width);
        // If only a narrower slot is free, measure the complete wrapped label there.
        for (let pass = 0; pass < 2 && next.width > chromeX + 2; pass++) {
          const previousWidth = next.width;
          next = fit(previousWidth);
          if (next.width >= previousWidth) break;
        }
        setBox(old => old && Object.keys(next).every(key => old[key as keyof TooltipBox] === next[key as keyof TooltipBox]) ? old : next);
      } else setBox(null);
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [button, label]);
  useEffect(() => {
    button.setAttribute("aria-describedby", [button.getAttribute("aria-describedby"), id].filter(Boolean).join(" "));
    return () => {
      const remaining = (button.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(value => value !== id).join(" ");
      if (remaining) button.setAttribute("aria-describedby", remaining); else button.removeAttribute("aria-describedby");
    };
  }, [button, id]);
  return createPortal(<div ref={ref} id={id} role="tooltip" className="adaptive-tooltip workspace-tooltip" data-floating-priority="0" data-side={box?.side}
    style={{ left: box?.x ?? 0, top: box?.y ?? 0, width: box?.width, maxWidth: box?.width, maxHeight: box?.height,
      visibility: box && box.width > 0 && box.height > 0 ? "visible" : "hidden", "--tooltip-arrow": `${box?.arrow ?? 12}px` } as CSSProperties}>
    <span className="workspace-tooltip-label">{label}</span>
    <span className="workspace-tooltip-measure" aria-hidden="true">{label}</span>
  </div>, document.body);
}

export function FloatingToolbar({
  children,
}: { children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [dock, setDock] = useState("top");
  const [wanted, setWanted] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [restored, setRestored] = useState(false);
  useLayoutEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("irrigation-toolbar-position-v1") || "null");
      if (saved && ["top", "bottom", "left", "right"].includes(saved.dock) &&
          Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        setDock(saved.dock);
        setWanted({ x: saved.x, y: saved.y });
      }
    } catch { /* An unavailable preference must not prevent opening the drawing. */ }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored || dragging || !wanted) return;
    try {
      // Persist the user's preference, never a temporary collision adjustment.
      localStorage.setItem("irrigation-toolbar-position-v1", JSON.stringify({ ...wanted, dock }));
    } catch { /* Storage can be disabled in private browsing. */ }
  }, [restored, dragging, wanted, dock]);
  const drag = useRef<{
    id: number;
    dx: number;
    dy: number;
    start: { x: number; y: number } | null;
    dock: string;
  } | null>(null);
  const vertical = dock === "left" || dock === "right";
  const box = useFloatingPlacement(
    ref,
    (b) => ({ x: b.x + (wanted?.x ?? 0), y: b.y + (wanted?.y ?? 0) }),
    60,
  );
  const beforeFlip = useRef<Map<Element, DOMRect> | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      const count = el.querySelectorAll(".floating-tool-anchor").length;
      el.dataset.naturalWidth = String(vertical ? 54 : Math.max(160, 38 + count * 44));
      el.dataset.naturalHeight = String(vertical ? 38 + count * 44 : 54);
      if (beforeFlip.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        for (const [child, old] of beforeFlip.current) {
          const next = child.getBoundingClientRect();
          child.animate?.(
            [
              { transform: `translate(${old.x - next.x}px,${old.y - next.y}px)` },
              { transform: "translate(0,0)" },
            ],
            { duration: 160, easing: "ease-out" },
          );
        }
      }
      beforeFlip.current = null;
    }
  }, [vertical, children]);
  const finish = (cancel = false) => {
    if (cancel && drag.current) {
      setWanted(drag.current.start);
      setDock(drag.current.dock);
    }
    drag.current = null;
    setDragging(false);
  };
  // iPad's keyboard pinning temporarily transforms the shell, making it the
  // containing block for fixed children. Keep viewport calculations unchanged.
  const shell = ref.current?.closest<HTMLElement>(".app-shell");
  const origin = shell && getComputedStyle(shell).transform !== "none" ? shell.getBoundingClientRect() : null;
  return (
    <div
      ref={ref}
      className="workspace-tool-strip adaptive-toolbar"
      role="toolbar"
      aria-label="Инструменты черчения"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      data-orientation={vertical ? "vertical" : "horizontal"}
      data-floating-priority="60"
      data-dragging={dragging}
      style={{
        left: (box?.x ?? 0) - (origin?.left ?? 0),
        top: (box?.y ?? 0) - (origin?.top ?? 0),
        maxWidth: box?.width,
        maxHeight: box?.height,
        visibility: box && box.width > 0 && box.height > 0 ? "visible" : "hidden",
      }}
    >
      <button
        type="button"
        className="floating-grip"
        aria-label="Переместить панель инструментов"
        aria-pressed={dragging}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          const r = ref.current!.getBoundingClientRect();
          drag.current = {
            id: e.pointerId,
            dx: e.clientX - r.left,
            dy: e.clientY - r.top,
            start: wanted,
            dock,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
        }}
        onPointerMove={(e) => {
          const g = drag.current;
          if (!g || g.id !== e.pointerId) return;
          e.preventDefault();
          e.stopPropagation();
          const b = workspaceBounds();
          setWanted({ x: e.clientX - g.dx - b.x, y: e.clientY - g.dy - b.y });
          const next = dockAt({ x: e.clientX, y: e.clientY }, b, dock);
          if (next !== dock) {
            beforeFlip.current = new Map(
              Array.from(ref.current!.querySelectorAll(".floating-tool-anchor")).map((el) => [
                el,
                el.getBoundingClientRect(),
              ]),
            );
            setDock(next);
          }
        }}
        onPointerUp={(e) => {
          if (drag.current?.id === e.pointerId) {
            finish();
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onPointerCancel={() => finish(true)}
        onLostPointerCapture={() => {
          if (drag.current) finish(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            finish(true);
            return;
          }
          const delta: Record<string, [number, number]> = {
            ArrowLeft: [-20, 0],
            ArrowRight: [20, 0],
            ArrowUp: [0, -20],
            ArrowDown: [0, 20],
          };
          const d = delta[e.key];
          if (!d) return;
          e.preventDefault();
          const b = workspaceBounds(),
            p = { x: (wanted?.x ?? 0) + d[0], y: (wanted?.y ?? 0) + d[1] };
          setWanted(p);
          setDock((old) => dockAt({ x: b.x + p.x, y: b.y + p.y }, b, old));
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <GripVertical size={20} />
      </button>
      <div className="floating-tool-buttons">{children}</div>
    </div>
  );
}
