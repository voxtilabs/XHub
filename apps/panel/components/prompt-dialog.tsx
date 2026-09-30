"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icon";

type PromptOptions = {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: string;
};
type PromptRequest = PromptOptions & { id: number; label: string; defaultValue: string; returnFocusTo: HTMLElement | null };

/** UI equivalent of window.prompt: raw text on confirmation, null on dismissal. */
export function usePrompt() {
  const [request, setRequest] = useState<PromptRequest | null>(null);
  const sequence = useRef(0);
  const trigger = useRef<HTMLElement | null>(null);
  const pending = useRef<{ id: number; resolve: (answer: string | null) => void } | null>(null);
  const ask = useCallback((label: string, defaultValue = "", options: PromptOptions = {}) =>
    new Promise<string | null>((resolve) => {
      // Superseding a request abandons it; only explicit user dismissal returns null.
      const id = ++sequence.current;
      pending.current = { id, resolve };
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const returnFocusTo = trigger.current?.isConnected ? trigger.current : active;
      setRequest({ id, label, defaultValue, returnFocusTo, ...options });
    }), []);
  const answer = useCallback((id: number, value: string | null) => {
    // A queued native close event from the previous step must not cancel the next.
    if (pending.current?.id !== id) return;
    const resolve = pending.current.resolve;
    pending.current = null;
    setRequest(null);
    resolve(value);
  }, []);
  useEffect(() => {
    // WebKit does not necessarily focus a button when it is clicked. Remember
    // the actual trigger before React handles its click, including keyboard clicks.
    const rememberTrigger = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button, a[href], input, select, textarea, [tabindex]") : null;
      if (target instanceof HTMLElement && !target.closest(".xhub-prompt-dialog")) trigger.current = target;
    };
    document.addEventListener("click", rememberTrigger, true);
    return () => {
      document.removeEventListener("click", rememberTrigger, true);
      // Leaving the page must not resume an action whose explicit cancel means
      // "continue without a value" (for example closing a lost opportunity).
      pending.current = null;
      trigger.current = null;
    };
  }, []);
  return {
    ask,
    dialog: request ? <PromptDialog key={request.id} request={request} onAnswer={answer} /> : null,
  };
}

function PromptDialog({ request, onAnswer }: { request: PromptRequest; onAnswer: (id: number, value: string | null) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(request.defaultValue);
  const id = useId();
  const finish = (result: string | null) => {
    dialog.current?.close();
    onAnswer(request.id, result);
  };
  useEffect(() => {
    const modal = dialog.current;
    const opener = request.returnFocusTo;
    if (modal && !modal.open) modal.showModal();
    input.current?.focus();
    input.current?.select();
    return () => {
      if (modal?.open) modal.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog ref={dialog} className="xhub-prompt-dialog" aria-labelledby={`${id}-title`} aria-describedby={request.description ? `${id}-description` : undefined}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]'));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onCancel={(event) => { event.preventDefault(); finish(null); }}
      onClose={() => { if (!dialog.current?.open) onAnswer(request.id, null); }}>
      <form onSubmit={(event) => { event.preventDefault(); finish(value); }}>
        <div className="xhub-prompt-heading">
          <span className="xhub-prompt-icon"><Icon name={request.icon ?? "note-pencil"} weight="regular" /></span>
          <button type="button" className="xhub-prompt-close" onClick={() => finish(null)} aria-label={request.cancelLabel ?? "Cancelar"}><Icon name="x" weight="regular" /></button>
        </div>
        <h2 id={`${id}-title`}>{request.title ?? "Completa este dato"}</h2>
        {request.description && <p id={`${id}-description`}>{request.description}</p>}
        <label htmlFor={`${id}-value`}>{request.label}</label>
        <Input ref={input} id={`${id}-value`} value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" />
        <div className="xhub-prompt-actions">
          <Button type="button" variant="secondary" onClick={() => finish(null)}>{request.cancelLabel ?? "Cancelar"}</Button>
          <Button type="submit">{request.confirmLabel ?? "Continuar"}<Icon name="arrow-right" weight="regular" /></Button>
        </div>
      </form>
    </dialog>
  );
}
