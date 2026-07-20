/**
 * Zod runtime schema for `EditorEditOperation` — the single source of truth
 * for validating edit plans coming from untrusted agents (the MCP server and
 * the built-in Gemini assistant). Keep in sync with the TypeScript union in
 * ./types.ts.
 */
import { z } from "zod";

export const editRangeSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().positive()
});

export const editSubtitleSchema = z.object({
  id: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  text: z.string(),
  words: z
    .array(
      z.object({
        start: z.number().nonnegative(),
        end: z.number().positive(),
        text: z.string()
      })
    )
    .optional()
});

export const operationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("remove_ranges"), ranges: z.array(editRangeSchema).min(1), ripple: z.literal(true) }),
  z.object({ type: z.literal("split_clip"), segmentId: z.string(), at: z.number().nonnegative() }),
  z.object({ type: z.literal("trim_clip"), segmentId: z.string(), timelineStart: z.number().nonnegative().optional(), timelineEnd: z.number().positive().optional() }),
  z.object({ type: z.literal("delete_clip"), segmentId: z.string(), ripple: z.boolean() }),
  z.object({ type: z.literal("move_clip"), segmentId: z.string(), timelineStart: z.number().nonnegative(), lane: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("sequence_clips"), segmentIds: z.array(z.string()).min(1), start: z.number().nonnegative(), gap: z.number().nonnegative() }),
  z.object({ type: z.literal("set_audio"), itemId: z.string(), gainDb: z.number().min(-60).max(12), muted: z.boolean() }),
  z.object({ type: z.literal("set_audio_lane"), lane: z.number().int().nonnegative(), gainDb: z.number().min(-60).max(12), muted: z.boolean() }),
  z.object({ type: z.literal("set_master_volume"), volume: z.number().min(0).max(100) }),
  z.object({ type: z.literal("set_background_audio"), itemIds: z.array(z.string()).max(200) }),
  z.object({ type: z.literal("set_layout"), layoutMode: z.enum(["screen-only", "camera-only", "bubble", "bubble-fill", "presenter", "side-by-side", "side-overlap"]) }),
  z.object({
    type: z.literal("set_background"),
    style: z.enum(["real-world-1", "real-world-2", "real-world-3", "real-world-4", "real-world-5", "real-world-6", "gradient-1", "gradient-2", "gradient-3", "custom"]),
    category: z.enum(["image", "gradient"]),
    customImportId: z.string().nullable().optional()
  }),
  z.object({
    type: z.literal("set_camera"),
    size: z.number().min(8).max(60).optional(),
    position: z.enum(["top-left", "top-center", "top-right", "middle-left", "middle-center", "middle-right", "bottom-left", "bottom-center", "bottom-right"]).optional(),
    shape: z.enum(["circle", "rounded", "square"]).optional(),
    borderStyle: z.enum(["none", "light", "accent"]).optional(),
    contentTransform: z.object({ x: z.number().min(-100).max(100), y: z.number().min(-100).max(100), scale: z.number().min(50).max(300), mirrored: z.boolean() }).optional(),
    frame: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100), size: z.number().min(8).max(60) }).optional()
  }),
  z.object({
    type: z.literal("set_screen"),
    position: z.object({ x: z.number().min(-100).max(100), y: z.number().min(-100).max(100), scale: z.number().min(10).max(300) }).optional(),
    aspectRatio: z.enum(["auto", "16:9", "16:10", "4:3"]).optional(),
    cornerStyle: z.enum(["flat", "soft", "round"]).optional()
  }),
  z.object({ type: z.literal("set_text_overlay"), overlay: z.object({
    id: z.string().min(1).max(128), start: z.number().nonnegative(), end: z.number().positive(),
    text: z.string().max(500), x: z.number().min(0).max(100), y: z.number().min(0).max(100),
    size: z.number().min(12).max(240), color: z.string().regex(/^#[0-9a-f]{6}$/i),
    weight: z.union([z.literal(400), z.literal(600), z.literal(700), z.literal(800)]),
    animation: z.enum(["none", "fade", "pop", "slide-up"])
  }) }),
  z.object({ type: z.literal("remove_text_overlay"), id: z.string().min(1).max(128) }),
  z.object({ type: z.literal("set_subtitle_preferences"), language: z.string().nullable().optional(), style: z.enum(["clean", "karaoke", "boxed", "pop"]).optional() }),
  z.object({ type: z.literal("set_editor_view"), previewQuality: z.enum(["high", "low"]).optional(), timelineZoom: z.number().min(1).max(10).optional(), previewZoom: z.number().min(0.65).max(1.6).optional() }),
  z.object({
    type: z.literal("import_media"), paths: z.array(z.string().min(1)).min(1).max(20),
    placement: z.enum(["media-bin", "timeline", "background-audio", "custom-background"]),
    timelineStart: z.number().nonnegative().optional()
  }),
  z.object({ type: z.literal("generate_music"), engine: z.enum(["lyria-clip", "lyria-pro"]), prompt: z.string().min(1).max(2000), lyrics: z.string().max(5000).optional() }),
  z.object({
    type: z.literal("set_zoom"),
    id: z.string().min(1).max(128),
    start: z.number().nonnegative(),
    end: z.number().positive(),
    speed: z.enum(["slow", "medium", "fast"]),
    easing: z.enum(["linear", "ease-in", "ease-out", "ease-in-out", "custom"]).optional(),
    bezier: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
    scale: z.number().min(1).max(4),
    targetX: z.number().min(0).max(100),
    targetY: z.number().min(0).max(100)
  }),
  z.object({ type: z.literal("remove_zoom"), id: z.string().min(1).max(128) }),
  z.object({
    type: z.literal("set_speed"), id: z.string().min(1).max(128),
    start: z.number().nonnegative(), end: z.number().positive(), rate: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
  }),
  z.object({ type: z.literal("remove_speed"), id: z.string().min(1).max(128) }),
  z.object({
    type: z.literal("set_transition"),
    fromSegmentId: z.string().min(1),
    toSegmentId: z.string().min(1),
    transition: z.enum(["crossfade", "fade-black", "slide-left", "wipe-left"]),
    duration: z.number().min(0.1).max(2)
  }),
  z.object({ type: z.literal("remove_transition"), fromSegmentId: z.string().min(1), toSegmentId: z.string().min(1) }),
  z.object({ type: z.literal("replace_subtitles"), language: z.string().nullable(), style: z.enum(["clean", "karaoke", "boxed", "pop"]), segments: z.array(editSubtitleSchema) }),
  z.object({ type: z.literal("update_subtitle"), id: z.string(), start: z.number().nonnegative().optional(), end: z.number().positive().optional(), text: z.string().optional() }),
  z.object({ type: z.literal("set_export_range"), start: z.number().nonnegative(), end: z.number().positive() })
]);
