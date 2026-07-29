import { describe, expect, it } from 'vitest';
import { extractEars } from './ears.js';

describe('extractEars', () => {
  it('extracts one requirement per non-empty line with ids and line numbers', () => {
    const content = [
      'REQ-001: When a payment webhook is received, the billing service shall verify the HMAC signature.',
      'REQ-002: If the HMAC signature is invalid, then the billing service shall reject the webhook.',
    ].join('\n');

    const { items, errors } = extractEars(content, 'requirements.ears');

    expect(errors).toEqual([]);
    expect(items).toEqual([
      {
        id: 'REQ-001',
        text: 'When a payment webhook is received, the billing service shall verify the HMAC signature.',
        source: { file: 'requirements.ears', line: 1 },
      },
      {
        id: 'REQ-002',
        text: 'If the HMAC signature is invalid, then the billing service shall reject the webhook.',
        source: { file: 'requirements.ears', line: 2 },
      },
    ]);
  });

  it('omits id when no ID prefix is present', () => {
    const content =
      'When a payment webhook is received, the billing service shall verify the HMAC signature.';

    const { items } = extractEars(content);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBeUndefined();
    expect(items[0].text).toBe(content);
    expect(items[0].source).toEqual({ line: 1 });
  });

  it('does not treat a colon inside requirement prose as an id prefix', () => {
    const content =
      'When the report is ready, the billing service shall emit: a summary and a total.';

    const { items } = extractEars(content);

    expect(items[0].id).toBeUndefined();
    expect(items[0].text).toBe(content);
  });

  it('ignores comment lines and blank lines while keeping line numbers accurate', () => {
    const content = [
      '# billing requirements',
      '',
      'REQ-001: The billing service shall retain receipts.',
      '   ',
      '# trailing note',
    ].join('\n');

    const { items } = extractEars(content);

    expect(items).toEqual([
      {
        id: 'REQ-001',
        text: 'The billing service shall retain receipts.',
        source: { line: 3 },
      },
    ]);
  });

  it('parses the metadata prefix form and uses the declared source reference', () => {
    const content =
      'REQ-001 [source: specs/checkout.md:14]: When a payment webhook is received, the billing service shall verify the HMAC signature.';

    const { items, errors } = extractEars(content, 'requirements.ears');

    expect(errors).toEqual([]);
    expect(items).toEqual([
      {
        id: 'REQ-001',
        text: 'When a payment webhook is received, the billing service shall verify the HMAC signature.',
        source: { file: 'specs/checkout.md', line: 14 },
      },
    ]);
  });

  it('parses the metadata prefix source range, using the start line', () => {
    const content =
      'REQ-002 [source: specs/checkout.md:12-14]: If the HMAC signature is invalid, then the billing service shall reject the webhook.';

    const { items } = extractEars(content, 'requirements.ears');

    expect(items[0].id).toBe('REQ-002');
    expect(items[0].source).toEqual({ file: 'specs/checkout.md', line: 12 });
    expect(items[0].text).toBe(
      'If the HMAC signature is invalid, then the billing service shall reject the webhook.',
    );
  });

  it('strips a malformed [source:] segment, keeps the id, and falls back to the physical location', () => {
    const content = 'REQ-003 [source: not-a-real-ref]: The billing service shall retain receipts.';

    const { items, errors } = extractEars(content, 'requirements.ears');

    expect(errors).toEqual([]);
    expect(items).toEqual([
      {
        id: 'REQ-003',
        text: 'The billing service shall retain receipts.',
        source: { file: 'requirements.ears', line: 1 },
      },
    ]);
  });

  it('returns no items for an empty file', () => {
    expect(extractEars('')).toEqual({ items: [], errors: [] });
    expect(extractEars('\n\n   \n')).toEqual({ items: [], errors: [] });
  });
});
