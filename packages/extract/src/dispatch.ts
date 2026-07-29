/**
 * Format dispatch and the single disk-reading wrapper.
 *
 * {@link extractFromContent} routes a string to the right parser by the file
 * name's extension. {@link extractFromFile} is the only function in the package
 * that touches the file system; every parser stays pure string-in.
 */

import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { ExtractResult } from './types.js';
import { extractEars } from './ears.js';
import { extractMarkdown } from './markdown.js';
import { extractYaml } from './yaml.js';
import { extractJson } from './json.js';

/**
 * Extract requirements from raw content, choosing the parser by the extension
 * of `filename`. The name is also recorded as each item's source file.
 *
 * Supported extensions: `.ears`, `.md`, `.markdown`, `.yaml`, `.yml`, `.json`.
 * An unsupported extension yields a single {@link ExtractError} and no items.
 *
 * @param content Raw file contents.
 * @param filename File name or path used to pick the parser and label sources.
 */
export function extractFromContent(content: string, filename: string): ExtractResult {
  const extension = extname(filename).toLowerCase();
  switch (extension) {
    case '.ears':
      return extractEars(content, filename);
    case '.md':
    case '.markdown':
      return extractMarkdown(content, filename);
    case '.yaml':
    case '.yml':
      return extractYaml(content, filename);
    case '.json':
      return extractJson(content, filename);
    default:
      return {
        items: [],
        errors: [{ message: `Unsupported file extension: "${extension || filename}".`, file: filename }],
      };
  }
}

/**
 * Read a file from disk and extract its requirements. This is the only function
 * that performs I/O. A read failure is reported as an {@link ExtractError}
 * rather than thrown.
 *
 * @param filePath Path to the file to read and extract.
 */
export function extractFromFile(filePath: string): ExtractResult {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (error) {
    return {
      items: [],
      errors: [
        {
          message: `Could not read file: ${error instanceof Error ? error.message : String(error)}`,
          file: filePath,
        },
      ],
    };
  }
  return extractFromContent(content, filePath);
}
