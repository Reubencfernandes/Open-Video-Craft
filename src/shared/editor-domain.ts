/**
 * Public editor-domain API.
 *
 * Consumers import this compatibility barrel instead of reaching into the
 * implementation modules. The domain is split into:
 * - types: serializable contracts
 * - schema: defaults, migration, and runtime validation
 * - operations: atomic timeline-edit geometry
 */
export * from "./editor-domain/types";
export * from "./editor-domain/schema";
export * from "./editor-domain/operations";
export * from "./editor-domain/audio-levels";
