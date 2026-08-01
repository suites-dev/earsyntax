import { describe, expect, it } from 'vitest';
import { extractMarkdown } from './markdown.js';

describe('extractMarkdown', () => {
  it('extracts bullet lists with and without ids', () => {
    const content = [
      '# Billing requirements',
      '',
      'Some prose describing the webhook flow that must be ignored.',
      '',
      '- REQ-001: When a payment webhook is received, the billing service shall verify the HMAC signature.',
      '- If the HMAC signature is invalid, then the billing service shall reject the webhook.',
      '* REQ-003: The billing service shall retain receipts for seven years.',
    ].join('\n');

    const { items, errors } = extractMarkdown(content, 'requirements.md');

    expect(errors).toEqual([]);
    expect(items).toEqual([
      {
        id: 'REQ-001',
        text: 'When a payment webhook is received, the billing service shall verify the HMAC signature.',
        source: { file: 'requirements.md', line: 5 },
      },
      {
        text: 'If the HMAC signature is invalid, then the billing service shall reject the webhook.',
        source: { file: 'requirements.md', line: 6 },
      },
      {
        id: 'REQ-003',
        text: 'The billing service shall retain receipts for seven years.',
        source: { file: 'requirements.md', line: 7 },
      },
    ]);
  });

  it('extracts numbered lists', () => {
    const content = [
      '1. REQ-001: The billing service shall verify the HMAC signature.',
      '2) The billing service shall reject invalid webhooks.',
    ].join('\n');

    const { items } = extractMarkdown(content);

    expect(items).toEqual([
      {
        id: 'REQ-001',
        text: 'The billing service shall verify the HMAC signature.',
        source: { line: 1 },
      },
      { text: 'The billing service shall reject invalid webhooks.', source: { line: 2 } },
    ]);
  });

  it('extracts an ID/Requirement table, taking ids from the id column', () => {
    const content = [
      '| ID      | Requirement                                                                              |',
      '| ------- | ---------------------------------------------------------------------------------------- |',
      '| REQ-001 | When a payment webhook is received, the billing service shall verify the HMAC signature. |',
      '| REQ-002 | If the HMAC signature is invalid, then the billing service shall reject the webhook.      |',
    ].join('\n');

    const { items } = extractMarkdown(content, 'reqs.md');

    expect(items).toEqual([
      {
        id: 'REQ-001',
        text: 'When a payment webhook is received, the billing service shall verify the HMAC signature.',
        source: { file: 'reqs.md', line: 3 },
      },
      {
        id: 'REQ-002',
        text: 'If the HMAC signature is invalid, then the billing service shall reject the webhook.',
        source: { file: 'reqs.md', line: 4 },
      },
    ]);
  });

  it('extracts a single-column requirement table and lifts an inline id prefix', () => {
    const content = [
      '| Requirement |',
      '| --- |',
      '| REQ-001: The billing service shall verify the HMAC signature. |',
      '| The billing service shall reject invalid webhooks. |',
    ].join('\n');

    const { items } = extractMarkdown(content);

    expect(items).toEqual([
      {
        id: 'REQ-001',
        text: 'The billing service shall verify the HMAC signature.',
        source: { line: 3 },
      },
      { text: 'The billing service shall reject invalid webhooks.', source: { line: 4 } },
    ]);
  });

  it('ignores fenced code blocks entirely', () => {
    const content = [
      '- REQ-001: The billing service shall verify the HMAC signature.',
      '',
      '```ears',
      '- REQ-999: This bullet lives inside a code fence and must be ignored.',
      '| ID | Requirement |',
      '| -- | ----------- |',
      '| REQ-998 | Also ignored. |',
      '```',
      '',
      '~~~',
      '- REQ-997: Ignored under a tilde fence.',
      '~~~',
      '',
      '- REQ-002: The billing service shall reject invalid webhooks.',
    ].join('\n');

    const { items } = extractMarkdown(content);

    expect(items.map((item) => item.id)).toEqual(['REQ-001', 'REQ-002']);
    expect(items[1].source).toEqual({ line: 14 });
  });

  it('ignores prose, headings, and horizontal rules', () => {
    const content = [
      '# Heading',
      '',
      'Just a paragraph of prose.',
      '',
      '---',
      '',
      '- REQ-001: The billing service shall verify signatures.',
    ].join('\n');

    const { items } = extractMarkdown(content);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('REQ-001');
  });

  it('parses the metadata prefix form in bullets, using the declared source reference', () => {
    const content = [
      '- REQ-001 [source: specs/checkout.md:14]: When a payment webhook is received, the billing service shall verify the HMAC signature.',
      '- REQ-002 [source: specs/checkout.md:12-14]: If the HMAC signature is invalid, then the billing service shall reject the webhook.',
    ].join('\n');

    const { items } = extractMarkdown(content, 'requirements.md');

    expect(items).toEqual([
      {
        id: 'REQ-001',
        text: 'When a payment webhook is received, the billing service shall verify the HMAC signature.',
        source: { file: 'specs/checkout.md', line: 14 },
      },
      {
        id: 'REQ-002',
        text: 'If the HMAC signature is invalid, then the billing service shall reject the webhook.',
        source: { file: 'specs/checkout.md', line: 12 },
      },
    ]);
  });

  it('parses the metadata prefix form inside a single-column table cell', () => {
    const content = [
      '| Requirement |',
      '| --- |',
      '| REQ-001 [source: specs/checkout.md:14]: The billing service shall verify the HMAC signature. |',
    ].join('\n');

    const { items } = extractMarkdown(content, 'requirements.md');

    expect(items).toEqual([
      {
        id: 'REQ-001',
        text: 'The billing service shall verify the HMAC signature.',
        source: { file: 'specs/checkout.md', line: 14 },
      },
    ]);
  });

  it('strips a malformed [source:] segment in a bullet and falls back to the physical location', () => {
    const content =
      '- REQ-003 [source: not-a-real-ref]: The billing service shall retain receipts.';

    const { items } = extractMarkdown(content, 'requirements.md');

    expect(items).toEqual([
      {
        id: 'REQ-003',
        text: 'The billing service shall retain receipts.',
        source: { file: 'requirements.md', line: 1 },
      },
    ]);
  });

  it('returns no items for an empty document', () => {
    expect(extractMarkdown('')).toEqual({ items: [], errors: [] });
  });

  it('joins indented continuation lines of a list item', () => {
    const content = [
      '- When a payment webhook is received, the billing service',
      '  shall verify the HMAC signature.',
      '- The billing service shall retain receipts.',
    ].join('\n');
    const { items } = extractMarkdown(content, 'requirements.md');
    expect(items.map((item) => item.text)).toEqual([
      'When a payment webhook is received, the billing service shall verify the HMAC signature.',
      'The billing service shall retain receipts.',
    ]);
  });

  it('accepts a GFM table without leading or trailing pipes', () => {
    const content = [
      'ID | Requirement',
      '--- | ---',
      'REQ-001 | The billing service shall verify the HMAC signature.',
    ].join('\n');
    const { items } = extractMarkdown(content, 'requirements.md');
    expect(items).toEqual([
      {
        id: 'REQ-001',
        text: 'The billing service shall verify the HMAC signature.',
        source: { file: 'requirements.md', line: 3 },
      },
    ]);
  });
});
