"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type MotionState = "active" | "reduced";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
const POINTER_QUERY = "(hover: hover) and (pointer: fine)";
const HEROES = ".xhub-page-heading[data-hero],.crm-person-hero,.xhub-public-hero";
const METRICS = ".xhub-inbox-metric,.crm-insight-card,.xhub-ticket-metric-card,.xhub-stat,.crm-pipeline-summary>div";
const AMBIENT = `${HEROES},${METRICS},.xhub-inbox-console,.xhub-ticket-chart,.crm-insight-chart`;
const REVEALS = `${METRICS},.crm-record-card,.xhub-ticket-chart,.xhub-team-card,.xhub-fleet-card`;
const OBSERVED_TARGETS = `${AMBIENT},${REVEALS}`;
const EXCLUDED = "[draggable],.fixed,dialog,.xhub-session-menu,.xhub-topbar,.xhub-sidebar,.xhub-user-actions";
const POINTER_PROPERTIES = ["--xhub-pointer-x", "--xhub-pointer-y", "--xhub-tilt-x", "--xhub-tilt-y"];

function clearPointer(element: HTMLElement) {
  element.removeAttribute("data-xhub-pointer");
  POINTER_PROPERTIES.forEach(property => element.style.removeProperty(property));
}

/** Decorative observers only: no polling, business requests or React pointer updates. */
function observeWorkspace(revealed: WeakSet<HTMLElement>): () => void {
  const ambient = new Set<HTMLElement>();
  const revealTargets = new Set<HTMLElement>();
  const finePointer = window.matchMedia(POINTER_QUERY);
  let disposed = false;
  let scanFrame = 0;
  let pointerFrame = 0;
  let pointerTarget: HTMLElement | null = null;
  let pendingPointer: { element: HTMLElement; x: number; y: number } | null = null;

  const resetPointer = () => {
    if (pointerFrame) cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    pendingPointer = null;
    if (pointerTarget) clearPointer(pointerTarget);
    pointerTarget = null;
  };

  const ambientObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
    for (const entry of entries) {
      const element = entry.target as HTMLElement;
      if (!element.isConnected) continue;
      const visible = entry.isIntersecting && entry.intersectionRatio > 0;
      element.dataset.xhubAmbient = visible ? "visible" : "offscreen";
      if (!visible && element === pointerTarget) resetPointer();
    }
  }, { threshold: 0 });

  const revealObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
    for (const entry of entries) {
      const element = entry.target as HTMLElement;
      if (!entry.isIntersecting || entry.intersectionRatio <= 0 || !element.isConnected) continue;
      element.dataset.xhubReveal = "shown";
      revealed.add(element);
      revealObserver?.unobserve(element);
    }
  }, { threshold: 0 });

  const eligible = (element: HTMLElement) => !element.closest(EXCLUDED);
  const scan = () => {
    scanFrame = 0;
    if (disposed) return;
    for (const element of ambient) {
      if (element.isConnected && eligible(element)) continue;
      ambientObserver?.unobserve(element);
      element.removeAttribute("data-xhub-ambient");
      if (pointerTarget === element) resetPointer();
      ambient.delete(element);
    }
    for (const element of revealTargets) {
      if (element.isConnected && eligible(element)) continue;
      revealObserver?.unobserve(element);
      element.removeAttribute("data-xhub-reveal");
      revealTargets.delete(element);
    }
    document.querySelectorAll<HTMLElement>(AMBIENT).forEach(element => {
      if (ambient.has(element) || !eligible(element)) return;
      ambient.add(element);
      const rect = element.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
      element.dataset.xhubAmbient = !ambientObserver || visible ? "visible" : "offscreen";
      ambientObserver?.observe(element);
    });
    document.querySelectorAll<HTMLElement>(REVEALS).forEach(element => {
      if (revealed.has(element) || revealTargets.has(element) || !eligible(element)) return;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      if (revealObserver && rect.top >= innerHeight) {
        // Waiting is a hook for motion, never a hidden or inaccessible state.
        element.dataset.xhubReveal = "waiting";
        revealTargets.add(element);
        revealObserver.observe(element);
      } else {
        revealed.add(element);
      }
    });
  };

  const containsObservedTarget = (node: Node) => node instanceof Element &&
    (node.matches(OBSERVED_TARGETS) || node.querySelector(OBSERVED_TARGETS) !== null);
  const mutationObserver = new MutationObserver(records => {
    if (scanFrame || disposed) return;
    // Text, menu icons and other unrelated updates cannot add or remove motion targets.
    const relevant = records.some(record => {
      if (record.target instanceof Element && record.target.closest(EXCLUDED)) return false;
      return Array.from(record.addedNodes).some(containsObservedTarget) ||
        Array.from(record.removedNodes).some(containsObservedTarget);
    });
    if (relevant) scanFrame = requestAnimationFrame(scan);
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });
  scan();

  const onPointerMove = (event: PointerEvent) => {
    if (!finePointer.matches || event.pointerType !== "mouse" || event.buttons !== 0 || !(event.target instanceof Element)) {
      resetPointer();
      return;
    }
    const element = event.target.closest<HTMLElement>(AMBIENT);
    if (!element || !ambient.has(element) || !eligible(element)) {
      resetPointer();
      return;
    }
    if (pointerTarget !== element) {
      resetPointer();
      pointerTarget = element;
    }
    pendingPointer = { element, x: event.clientX, y: event.clientY };
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      const pending = pendingPointer;
      pendingPointer = null;
      if (!pending || !pending.element.isConnected || disposed) return;
      const rect = pending.element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = Math.max(0, Math.min(1, (pending.x - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (pending.y - rect.top) / rect.height));
      pending.element.style.setProperty("--xhub-pointer-x", `${(x * 100).toFixed(2)}%`);
      pending.element.style.setProperty("--xhub-pointer-y", `${(y * 100).toFixed(2)}%`);
      pending.element.style.setProperty("--xhub-tilt-x", `${((0.5 - y) * 6).toFixed(2)}deg`);
      pending.element.style.setProperty("--xhub-tilt-y", `${((x - 0.5) * 6).toFixed(2)}deg`);
      pending.element.dataset.xhubPointer = "active";
    });
  };
  const onPointerOut = (event: PointerEvent) => {
    if (!pointerTarget || (event.relatedTarget instanceof Node && pointerTarget.contains(event.relatedTarget))) return;
    resetPointer();
  };
  const onPointerPreference = () => { if (!finePointer.matches) resetPointer(); };
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerout", onPointerOut, { passive: true });
  document.addEventListener("pointercancel", resetPointer, { passive: true });
  document.addEventListener("dragstart", resetPointer, { passive: true });
  window.addEventListener("blur", resetPointer);
  window.addEventListener("scroll", resetPointer, { passive: true, capture: true });
  finePointer.addEventListener("change", onPointerPreference);

  return () => {
    disposed = true;
    mutationObserver.disconnect();
    ambientObserver?.disconnect();
    revealObserver?.disconnect();
    if (scanFrame) cancelAnimationFrame(scanFrame);
    resetPointer();
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerout", onPointerOut);
    document.removeEventListener("pointercancel", resetPointer);
    document.removeEventListener("dragstart", resetPointer);
    window.removeEventListener("blur", resetPointer);
    window.removeEventListener("scroll", resetPointer, true);
    finePointer.removeEventListener("change", onPointerPreference);
    ambient.forEach(element => element.removeAttribute("data-xhub-ambient"));
    revealTargets.forEach(element => element.removeAttribute("data-xhub-reveal"));
  };
}

export function WorkspaceMotionProvider({ children }: { children: ReactNode }) {
  const revealed = useRef(new WeakSet<HTMLElement>());
  const [state, setState] = useState<MotionState>("active");
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reduced = window.matchMedia(REDUCED_QUERY);
    const onReducedChange = () => {
      const effective: MotionState = reduced.matches ? "reduced" : "active";
      document.documentElement.dataset.xhubMotion = effective;
      setState(effective);
    };
    const onVisibility = () => {
      const next = document.visibilityState !== "hidden";
      document.documentElement.dataset.xhubVisibility = next ? "visible" : "hidden";
      setVisible(next);
    };
    onReducedChange();
    onVisibility();
    setReady(true);
    reduced.addEventListener("change", onReducedChange);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      reduced.removeEventListener("change", onReducedChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!ready || !visible || state !== "active") return;
    return observeWorkspace(revealed.current);
  }, [ready, visible, state]);

  return <>{children}</>;
}
