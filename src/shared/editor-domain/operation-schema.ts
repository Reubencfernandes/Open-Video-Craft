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
