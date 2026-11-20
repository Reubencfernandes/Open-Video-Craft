/**
 * `HostNs` travels as a decimal string in JSON because the values exceed
 * 2^53 (DATA_MODEL §5). Parsing and formatting stay in `bigint` so no value is
 * ever routed through a double.
 */
import type { HostNs } from "./ticks";

const HOST_NS_PATTERN = /^-?\d+$/;

/** Raised when a `…HostNs` field is not a plain decimal integer string. */
export class HostNsParseError extends Error {
  readonly value: string;

  constructor(value: string) {
    super(`invalid HostNs decimal string: ${JSON.stringify(value)}`);
    this.name = "HostNsParseError";
    this.value = value;
  }
}

export function parseHostNs(value: string): HostNs {
  if (typeof value !== "string" || !HOST_NS_PATTERN.test(value)) {
    throw new HostNsParseError(value);
  }
  return BigInt(value);
}

export function serializeHostNs(value: HostNs): string {
  return value.toString();
}
