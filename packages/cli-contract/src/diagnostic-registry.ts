/**
 * The registry of diagnostic codes with short human-readable descriptions.
 *
 * This is the single source of truth the SARIF builder uses to declare tool
 * rules, and any renderer can use it to look up a code's short description.
 * The record is keyed by the frozen {@link DiagnosticCode} union, so adding a
 * code to `@earsyntax/core` without describing it here is a compile error.
 */

import type { DiagnosticCode } from '@earsyntax/core';

/**
 * A one-line description for every {@link DiagnosticCode}.
 *
 * Descriptions are stable, third-person, and neutral. They describe what the
 * code means, not how to fix it. The key set is exhaustive by construction
 * (`Record<DiagnosticCode, string>`).
 */
export const DIAGNOSTIC_DESCRIPTIONS: Record<DiagnosticCode, string> = {
  // EARS shell diagnostics.
  'ears.no_match': 'Text does not match any EARS shell pattern.',
  'ears.invalid_clause_order': 'EARS clauses appear in an invalid order.',
  'ears.missing_system': 'Requirement is missing a system before shall.',
  'ears.missing_shall': 'Requirement is missing the shall keyword.',
  'ears.multiple_shall': 'Requirement contains more than one shall keyword.',
  'ears.invalid_if_then_form': 'If/then unwanted-behaviour form is malformed.',
  'ears.empty_clause': 'A clause body is empty.',
  'ears.empty_response': 'The response after shall is empty.',
  // Expression diagnostics.
  'expr.unbalanced_parentheses': 'Clause expression has unbalanced parentheses.',
  'expr.invalid_operator_sequence': 'Clause expression has an invalid operator sequence.',
  'expr.empty_subexpression': 'Clause expression contains an empty subexpression.',
  'expr.operator_precedence_warning': 'Mixed operators rely on implicit precedence.',
  'expr.unknown_term': 'A clause term does not resolve to a catalog entry.',
  'expr.ambiguous_term': 'A clause term matches more than one catalog entry.',
  'expr.mixed_unresolved_terms': 'A clause mixes resolved and unresolved terms.',
  // Catalog diagnostics: system role.
  'catalog.system_unresolved': 'The system does not resolve to a catalog entry.',
  'catalog.system_ambiguous': 'The system matches more than one catalog entry.',
  // Catalog diagnostics: state role.
  'catalog.state_unresolved': 'A state term does not resolve to a catalog entry.',
  'catalog.state_ambiguous': 'A state term matches more than one catalog entry.',
  // Catalog diagnostics: event role.
  'catalog.event_unresolved': 'An event term does not resolve to a catalog entry.',
  'catalog.event_ambiguous': 'An event term matches more than one catalog entry.',
  // Catalog diagnostics: feature role.
  'catalog.feature_unresolved': 'A feature term does not resolve to a catalog entry.',
  'catalog.feature_ambiguous': 'A feature term matches more than one catalog entry.',
  // Catalog coverage.
  'catalog.term_unreferenced': 'A catalog entry is never referenced by any requirement.',
  // Lint diagnostics.
  'lint.multiple_responses': 'A requirement declares more than one response.',
  'lint.vague_response': 'A response uses vague, unverifiable wording.',
  'lint.unparsed_tail': 'Trailing text after the requirement could not be parsed.',
  'lint.alias_used': 'A term was matched via an alias rather than its canonical name.',
  'lint.suspicious_text_shape': 'Requirement text has a suspicious shape.',
};

/**
 * Every diagnostic code, sorted lexicographically.
 *
 * Sorting makes the SARIF rule list deterministic regardless of the key order
 * the registry object was written in.
 */
export const DIAGNOSTIC_CODES: DiagnosticCode[] = (
  Object.keys(DIAGNOSTIC_DESCRIPTIONS) as DiagnosticCode[]
).sort();
