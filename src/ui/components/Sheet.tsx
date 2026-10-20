import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}

export function Sheet({ title, onClose, children, testId }: Props) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A sheet that opens on pointer-up (tapping a route) receives the tap's synthesized click.
  // Only close when the press itself started on the backdrop.
  const pressedBackdrop = useRef(false);

  return (
    <div
      className="sheet-backdrop"
      onPointerDown={(e) => (pressedBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => {
        const close = pressedBackdrop.current && e.target === e.currentTarget;
        pressedBackdrop.current = false;
        if (close) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} data-testid={testId} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-button" aria-label={t("common.close")} onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
