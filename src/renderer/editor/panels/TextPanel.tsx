/** Controls for adding, styling, and positioning freeform text. */
import { Plus, Trash2 } from "lucide-react";
import { BubbleActionButton } from "../../BubbleActionButton";
import { FloatingSelect } from "../FloatingSelect";
import { RangeControl } from "../controls";
import type { TextAnimation, TextFontFamily, TextOverlay } from "../types";
import { TextColorPicker } from "./TextColorPicker";

const animationOptions: Array<{ value: TextAnimation; label: string }> = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade in" },
  { value: "pop", label: "Pop" },
  { value: "slide-up", label: "Slide up" }
];

const fontOptions: Array<{ value: TextFontFamily; label: string }> = [
  { value: "sans", label: "Modern sans" },
  { value: "rounded", label: "Rounded" },
  { value: "serif", label: "Editorial serif" },
  { value: "mono", label: "Monospace" }
];

const weightOptions = [
  { value: "400", label: "Regular" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extra bold" }
] as const;

export function TextPanel(props: {
  overlays: TextOverlay[];
  selectedOverlayId: string | null;
  selectedOverlay: TextOverlay | null;
  onAdd: () => void;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<TextOverlay>) => void;
  onRemove: (id: string) => void;
}) {
  const selected = props.selectedOverlay;

  return (
    <div className="grid min-h-0 min-w-0 content-start gap-3 overflow-auto">
      <BubbleActionButton
        className="min-h-11 w-full min-w-0 rounded-xl px-4 text-sm font-extrabold"
        data-add-text-to-viewport
        onClick={props.onAdd}
      >
        <Plus size={17} strokeWidth={2.5} />
        <span className="truncate">Add text to viewport</span>
      </BubbleActionButton>

      {props.overlays.length > 0 ? (
        <div
          className="text-layer-list"
          data-text-layer-stack
        >
          {props.overlays.map((overlay) => {
            const isSelected = props.selectedOverlayId === overlay.id;

            return (
              <button
                className="text-layer-list-item"
                data-selected={isSelected}
                data-text-layer-option
                type="button"
                key={overlay.id}
                aria-label={`Select text layer: ${overlay.text || "Empty text"}`}
                aria-pressed={isSelected}
                onClick={() => props.onSelect(overlay.id)}
              >
                <span className="text-layer-list-dot" aria-hidden="true" />
                <span className="min-w-0 truncate">{overlay.text || "Empty text"}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {!selected ? (
        <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs leading-5 text-slate-500">
          Add text to the current frame, then style and position it here.
        </div>
      ) : (
        <div className="grid min-w-0 gap-3 border-t border-white/10 pt-3">
          <label className="grid min-w-0 gap-1.5 text-[0.68rem] font-semibold text-slate-400">
            Text
            <textarea
              className="editor-field min-h-24 w-full min-w-0 resize-y p-3 text-sm font-semibold leading-5 text-white"
              value={selected.text}
              onChange={(event) => props.onUpdate(selected.id, { text: event.target.value })}
            />
          </label>

          <button
            className="editor-choice-button inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-3 text-xs font-bold text-[#111114] transition hover:bg-neutral-200"
            type="button"
            onClick={() => props.onRemove(selected.id)}
          >
            <Trash2 size={14} /> Remove text
          </button>

          <LabeledSelect
            label="Animation"
            ariaLabel="Text animation"
            value={selected.animation}
            options={animationOptions}
            onChange={(animation) => props.onUpdate(selected.id, { animation })}
          />

          <RangeField label="Horizontal" value={selected.x} min={0} max={100} suffix="%" onChange={(x) => props.onUpdate(selected.id, { x })} />
          <RangeField label="Vertical" value={selected.y} min={0} max={100} suffix="%" onChange={(y) => props.onUpdate(selected.id, { y })} />
          <RangeField label="Size" value={selected.size} min={12} max={160} suffix="px" onChange={(size) => props.onUpdate(selected.id, { size })} />

          <TextColorPicker
            color={selected.color}
            opacity={selected.opacity ?? 100}
            onColorChange={(color) => props.onUpdate(selected.id, { color })}
            onOpacityChange={(opacity) => props.onUpdate(selected.id, { opacity })}
          />

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(8.5rem,100%),1fr))] gap-2">
            <LabeledSelect
              label="Font"
              ariaLabel="Text font"
              value={selected.fontFamily ?? "sans"}
              options={fontOptions}
              onChange={(fontFamily) => props.onUpdate(selected.id, { fontFamily })}
            />
            <LabeledSelect
              label="Weight"
              ariaLabel="Text weight"
              value={String(selected.weight) as "400" | "600" | "700" | "800"}
              options={weightOptions}
              onChange={(weight) => props.onUpdate(selected.id, {
                weight: Number(weight) as TextOverlay["weight"]
              })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function LabeledSelect<T extends string>(props: {
  label: string;
  ariaLabel: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-[0.68rem] font-semibold text-slate-400">
      {props.label}
      <FloatingSelect
        ariaLabel={props.ariaLabel}
        value={props.value}
        options={props.options}
        onChange={props.onChange}
      />
    </label>
  );
}

function RangeField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <RangeControl
      label={props.label}
      min={props.min}
      max={props.max}
      value={props.value}
      suffix={props.suffix}
      formatValue={(value) => `${Math.round(value)}${props.suffix}`}
      onChange={props.onChange}
    />
  );
}
