/**
 * Matrix-style popup cards. The host owns positioning and animation; every
 * visual value comes from the popup options so callers can fully customize it.
 */
import { X } from "lucide-react";
import type { CSSProperties } from "react";
import type { MatrixPopup } from "./matrix-popup-store";

type MatrixPopupStyle = CSSProperties & Record<`--matrix-${string}`, string>;

export function MatrixPopupHost(props: {
  popups: readonly MatrixPopup[];
  onDismiss: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
}) {
  return (
    <div className="matrix-popup-layer pointer-events-none fixed inset-0 z-[90]" data-matrix-popup-layer>
      {props.popups.map((popup) => (
        <MatrixPopupCard
          key={popup.id}
          popup={popup}
          onDismiss={props.onDismiss}
          onPause={props.onPause}
          onResume={props.onResume}
        />
      ))}
    </div>
  );
}

function MatrixPopupCard(props: {
  popup: MatrixPopup;
  onDismiss: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
}) {
  const popup = props.popup;
  const style: MatrixPopupStyle = {
    "--matrix-accent": popup.accentColor,
    "--matrix-bg": popup.backgroundColor,
    "--matrix-text": popup.textColor,
    "--matrix-font": popup.fontFamily,
    "--matrix-size": `${popup.fontSize}px`,
    "--matrix-weight": String(popup.fontWeight),
    "--matrix-radius": `${popup.borderRadius}px`,
    "--matrix-pad": `${popup.padding}px`,
    width: `min(${popup.width}px, calc(100vw - 2rem))`
  };

  return (
    <section
      className="matrix-popup-card pointer-events-auto"
      data-matrix-popup={popup.id}
      data-phase={popup.phase}
      data-position={popup.position}
      data-tone={popup.tone}
      data-scanlines={String(popup.scanlines)}
      style={style}
      role={popup.tone === "error" ? "alert" : "status"}
      aria-live={popup.tone === "error" ? "assertive" : "polite"}
      onMouseEnter={popup.pauseOnHover ? () => props.onPause?.(popup.id) : undefined}
      onMouseLeave={popup.pauseOnHover ? () => props.onResume?.(popup.id) : undefined}
    >
      {popup.scanlines ? <span className="matrix-popup-scanlines" aria-hidden="true" /> : null}
      {popup.closable ? (
        <button
          className="matrix-popup-close"
          type="button"
          aria-label="Dismiss notification"
          onClick={() => props.onDismiss(popup.id)}
        >
          <X size={14} />
        </button>
      ) : null}
      <div className="matrix-popup-content">
        {popup.title === undefined ? null : (
          <h2 className="matrix-popup-title">{popup.title}</h2>
        )}
        <p className="matrix-popup-text">{popup.text}</p>
      </div>
    </section>
  );
}
