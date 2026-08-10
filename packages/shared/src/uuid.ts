import { v7 } from 'uuid';

/** Generate a monotonic RFC 9562 UUIDv7 in every supported JS runtime. */
export function newUuidV7(): string {
  return v7();
}
