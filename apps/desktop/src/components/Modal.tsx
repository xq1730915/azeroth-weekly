import { useEffect, useRef, type ReactNode } from "react";
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const el = ref.current!;
    const items = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,[tabindex="0"]',
        ),
      ).filter((x) => !(x as HTMLInputElement).disabled);
    (items()[0] ?? el).focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const a = items(),
          first = a[0],
          last = a.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    el.addEventListener("keydown", handler);
    return () => {
      el.removeEventListener("keydown", handler);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={"modal " + (wide ? "wide" : "")}
      >
        <header>
          <div>
            <span className="eyebrow">WEEKLY PLANNER</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
