/**
 * Composition layers of the preview (S17, S25).
 *
 * One recorded screen/window or imported video is the base picture; a webcam is
 * the layer above it. Selecting a webcam clip on the timeline chooses that
 * webcam for the Layout presets, and hidden or cut-away clips fall through to
 * the next visible channel of the same role. The geometry comes from the shared
 * `getCompositionLayout`, so the exporter renders the same picture.
 */
import {
  getCompositionLayout,
  resolveCameraStyle,
  resolveCompositionLayers,
  type CompositionClip,
  type CompositionLayout,
  type CompositionRole,
  type ResolvedCameraStyle
} from "../../shared/editor-domain/timeline-visibility";
import { resolveClipLayout } from "./timeline-utils";
import type {
  CameraFrame,
  EditorMediaItem,
  LayoutMode,
  ScreenAspectRatio,
  TimelineMediaClip
} from "./types";

/** Copy shown when the camera-only preset has no webcam to fill it. */
export const noCameraRecordingMessage = "No camera recording for this project.";

/** Timeline clip tagged with the composition role its media plays. */
export type CompositionMediaClip = TimelineMediaClip & {
  readonly role: CompositionRole;
  /** Timeline end of the clip; the shared resolver is half-open on [start, end). */
  readonly end: number;
};

/** Base-role media: recorded screens/windows, imports, images. */
export function compositionRoleForItem(item: EditorMediaItem): CompositionRole {
  return item.track === "camera" ? "camera" : "base";
}

/** Tags every video clip with its role so the shared resolver can compose it. */
export function withCompositionRoles(
  clips: readonly TimelineMediaClip[]
): CompositionMediaClip[] {
  return clips.map((clip) => ({
    ...clip,
    role: compositionRoleForItem(clip.item),
    end: clip.start + clip.duration
  }));
}

/**
 * The placeholder belongs to the camera-only preset only: every other preset
 * keeps showing the screen, and a project with a webcam must never claim it has
 * none.
 */
export function shouldShowNoCameraRecording(
  layoutMode: LayoutMode,
  hasCamera: boolean
): boolean {
  return layoutMode === "camera-only" && !hasCamera;
}

export interface PreviewComposition {
  readonly base: TimelineMediaClip | null;
  readonly camera: TimelineMediaClip | null;
  readonly primary: TimelineMediaClip | null;
  /**
   * Media rendered in the camera layer: the webcam clip on screen, or the
   * project's single-camera overlay that has no channel of its own.
   */
  readonly cameraItem: EditorMediaItem | null;
  readonly layoutMode: LayoutMode;
  readonly layout: CompositionLayout;
  /** Webcam shape and border in force, clip style first, project style after. */
  readonly cameraStyle: ResolvedCameraStyle;
  readonly showNoCameraRecording: boolean;
}

export interface PreviewCompositionInput {
  readonly clips: readonly TimelineMediaClip[];
  readonly time: number;
  readonly projectLayout: LayoutMode;
  /** Clip the owner selected; an active webcam clip wins over the lane order. */
  readonly selectedSegmentId?: string | null;
  readonly screenAspectRatio?: ScreenAspectRatio;
  readonly screenIntrinsicAspect?: number | null;
  readonly cameraFrame?: CameraFrame;
  /** Camera style chosen in Layout; a webcam clip may override each property. */
  readonly projectCameraStyle?: ResolvedCameraStyle;
  /** Single-camera recordings keep their floating webcam without a clip. */
  readonly overlayCamera?: EditorMediaItem | null;
}

/** Project camera style for a state that never chose one. */
const defaultCameraStyle: ResolvedCameraStyle = { shape: "circle", border: "light" };

/**
 * Resolves the layers the canvas shows at `time`: the base picture, the webcam
 * above it, the layout in force and whether the camera placeholder applies.
 */
export function resolvePreviewComposition(input: PreviewCompositionInput): PreviewComposition {
  const layers = resolveCompositionLayers(
    withCompositionRoles(input.clips),
    input.time,
    input.selectedSegmentId ?? null
  );
  // A clip may impose its own layout while it is on screen; the base picture
  // decides first because it is the layer the presets arrange.
  const layoutMode = resolveClipLayout(
    layers.base?.layout ?? layers.camera?.layout,
    input.projectLayout
  );
  const layout = getCompositionLayout({
    layoutMode,
    screenAspectRatio: input.screenAspectRatio ?? "auto",
    screenIntrinsicAspect: input.screenIntrinsicAspect ?? null,
    ...(input.cameraFrame === undefined ? {} : { cameraFrame: input.cameraFrame })
  });
  // The webcam clip on screen styles the camera layer; a clip style overrides
  // the project style per property, exactly as the exporter resolves it.
  const cameraStyle = resolveCameraStyle(
    layers.camera?.cameraStyle,
    input.projectCameraStyle ?? defaultCameraStyle
  );
  const cameraItem = layout.camera === null
    ? null
    : layers.camera?.item ?? input.overlayCamera ?? null;

  return {
    base: layers.base,
    camera: layers.camera,
    primary: layers.primary,
    cameraItem,
    layoutMode,
    layout,
    cameraStyle,
    showNoCameraRecording: shouldShowNoCameraRecording(layoutMode, cameraItem !== null)
  };
}
