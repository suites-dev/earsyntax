import { describe, expect, it } from 'vitest';
import { extractJson } from './json.js';

describe('extractJson', () => {
  it('extracts requirements with ids and best-effort line numbers', () => {
    const content = JSON.stringify(
      {
        requirements: [
          {
            id: 'REQ-001',
            text: 'When a payment webhook is received, the billing service shall verify the HMAC signature.',
          },
          {
            id: 'REQ-002',
            text: 'If the HMAC signature is invalid, then the billing service shall reject the webhook.',
          },
        ],
      },
      null,
      2,
    );

    const { items, errors } = extractJson(content, 'requirements.json');

    expect(errors).toEqual([]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'REQ-001',
      text: 'When a payment webhook is received, the billing service shall verify the HMAC signature.',
    });
    expect(items[0].source!.file).toBe('requirements.json');
    expect(items[0].source!.line).toBe(4);
    expect(items[1].source!.line).toBe(8);
  });

  it('tolerates missing ids', () => {
    const content =
      '{ "requirements": [ { "text": "The billing service shall retain receipts." } ] }';

    const { items, errors } = extractJson(content);

    expect(errors).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBeUndefined();
    expect(items[0].text).toBe('The billing service shall retain receipts.');
  });

  it('reports an error for an entry missing text but keeps the others', () => {
    const content = JSON.stringify({
      requirements: [
        { id: 'REQ-001' },
        { id: 'REQ-002', text: 'The billing service shall reject invalid webhooks.' },
      ],
    });

    const { items, errors } = extractJson(content, 'requirements.json');

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('REQ-002');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('requirements[0]');
  });

  it('reports malformed JSON clearly', () => {
    const { items, errors } = extractJson('{ "requirements": [ { "id": "REQ-001", ', 'broken.json');

    expect(items).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Malformed JSON');
    expect(errors[0].file).toBe('broken.json');
  });

  it('reports a clear error when the shape is wrong', () => {
    const { errors } = extractJson('{ "items": [] }');

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('requirements');
  });
});
