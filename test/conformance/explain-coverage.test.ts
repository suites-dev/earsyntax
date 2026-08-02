import { describe, expect, it } from 'vitest';
import { runCliJson } from './helpers.js';
// Data-only import of the built registry (not a command internal): the same
// frozen table `explain` resolves against. Requires `pnpm build` to have run,
// which the conformance chain guarantees before this suite executes.
import { DIAGNOSTIC_REGISTRY } from '../../packages/core/dist/index.js';

/**
 * Explain coverage.
 *
 * Every registry id must resolve through `explain`, and every deprecated alias
 * (the entry's old dotted code) must resolve to the same current id and carry a
 * deprecation note. This is a thin runner over the registry, not a duplicate of
 * the unit logic: it proves the shipped binary answers for the whole table.
 */

interface RegistryEntry {
  id: string;
  oldCode: string;
}

const entries = DIAGNOSTIC_REGISTRY as RegistryEntry[];

describe('explain resolves every registry id', () => {
  it.each(entries.map((entry) => entry.id))('explains %s', (id) => {
    const { result, json } = runCliJson(['explain', id, '--json']);
    expect(result.code).toBe(0);
    expect(json.id).toBe(id);
  });
});

describe('explain resolves every deprecated alias', () => {
  it.each(entries.map((entry) => [entry.oldCode, entry.id] as const))(
    'resolves alias %s to %s',
    (oldCode, id) => {
      const { result, json } = runCliJson(['explain', oldCode, '--json']);
      expect(result.code).toBe(0);
      expect(json.id).toBe(id);
      expect(json.alias).toBe(true);
      expect(String(json.deprecationNote)).toContain('deprecated alias');
    },
  );
});
