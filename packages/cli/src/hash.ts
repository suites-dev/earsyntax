/**
 * Content hashing for source and output files.
 *
 * Hashes are `sha256:` followed by 64 lowercase hex characters, computed over
 * the UTF-8 bytes of the content. Used for source-drift (stale) detection and
 * to catch a `.ears` file edited after it was validated.
 */

import { createHash } from 'node:crypto';

/** Hash a string as `sha256:<64 hex>`. */
export function hashContent(content: string): string {
  const digest = createHash('sha256').update(content, 'utf8').digest('hex');
  return `sha256:${digest}`;
}
