import { describe, expect, it } from 'vitest';
import { extractYaml } from './yaml.js';

describe('extractYaml', () => {
  it('extracts requirements with ids and best-effort line numbers', () => {
    const content = [
      'requirements:',
      '  - id: REQ-001',
      '    text: When a payment webhook is received, the billing service shall verify the HMAC signature.',
      '  - id: REQ-002',
      '    text: If the HMAC signature is invalid, then the billing service shall reject the webhook.',
    ].join('\n');

    const { items, errors } = extractYaml(content, 'requirements.yaml');

    expect(errors).toEqual([]);
    expect(items).toEqual([
      {
        id: 'REQ-001',
        text: 'When a payment webhook is received, the billing service shall verify the HMAC signature.',
        source: { file: 'requirements.yaml', line: 2 },
      },
      {
        id: 'REQ-002',
        text: 'If the HMAC signature is invalid, then the billing service shall reject the webhook.',
        source: { file: 'requirements.yaml', line: 4 },
      },
    ]);
  });

  it('tolerates missing ids', () => {
    const content = ['requirements:', '  - text: The billing service shall retain receipts for seven years.'].join('\n');

    const { items, errors } = extractYaml(content);

    expect(errors).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBeUndefined();
    expect(items[0].text).toBe('The billing service shall retain receipts for seven years.');
    expect(items[0].source).toEqual({ line: 2 });
  });

  it('reports an error for an entry missing text but keeps the others', () => {
    const content = ['requirements:', '  - id: REQ-001', '  - id: REQ-002', '    text: The billing service shall reject invalid webhooks.'].join(
      '\n',
    );

    const { items, errors } = extractYaml(content, 'requirements.yaml');

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('REQ-002');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('requirements[0]');
    expect(errors[0].file).toBe('requirements.yaml');
  });

  it('reports malformed YAML clearly with a line number', () => {
    const content = ['requirements:', '  - id: REQ-001', '    text: "unterminated'].join('\n');

    const { items, errors } = extractYaml(content, 'broken.yaml');

    expect(items).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Malformed YAML');
    expect(errors[0].file).toBe('broken.yaml');
    expect(typeof errors[0].line).toBe('number');
  });

  it('reports a clear error when the requirements key is absent', () => {
    const { errors } = extractYaml('title: some other document\n');

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('requirements');
  });

  it('returns no items for an empty document', () => {
    expect(extractYaml('')).toEqual({ items: [], errors: [{ message: 'Expected a top-level "requirements" sequence.' }] });
  });
});
