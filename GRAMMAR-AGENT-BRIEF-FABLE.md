# Task Brief: Author `GRAMMAR.md` for earsyntax

You are writing the reference grammar for EARS (Easy Approach to Requirements
Syntax). No formal grammar for EARS has ever been published — only Alistair
Mavin's prose ruleset. This document is therefore not internal documentation:
it is the artifact that makes earsyntax the reference implementation. Write it
as a normative specification, in the register of an RFC or a language spec,
not a README.

The file lives at the repository root as `GRAMMAR.md`. It is versioned with
the package and linked prominently from the README.

---

## 1. Authority hierarchy

Resolve every question in this order:

1. **Mavin's published ruleset** (alistairmavin.com/ears, the RE'09 paper,
   and "Ten Years of EARS", IEEE Software 2019). Canon:
   - zero or many preconditions
   - zero or one trigger
   - one system name
   - one or many system responses
   - clauses appear in temporal order
   - the modal is **shall**
     The five patterns: Ubiquitous, State-driven (`While`), Event-driven
     (`When`), Optional feature (`Where`), Unwanted behaviour (`If … then`),
     plus Complex (combinations). Quote the ruleset once, briefly, with
     attribution; do not paraphrase it into something new.
2. **The implemented parser.** The grammar must describe what the CLI
   actually accepts and rejects. Where the parser and Mavin's prose
   conflict, do NOT silently paper over it: either fix the parser or record
   the divergence as an open issue reference in the Decisions section.
   The grammar document may never be aspirational about the strict core.
3. **Our adjudication.** Where Mavin's prose is silent (comma placement,
   case, negation, etc.), we decide. Every such decision is recorded
   explicitly — see §4.

## 2. Required document structure

Produce these sections in this order:

1. **Status** — semver of this document, conformance keywords (RFC 2119:
   MUST/SHOULD/MAY), and a one-paragraph statement of intent: this document
   formalizes Mavin's canonical ruleset; it does not extend EARS in the
   strict core.
2. **Conformance levels** — define exactly three:
   - `strict` (default): Mavin's ruleset, nothing more.
   - `profile:kiro`: dialect acceptance for AWS Kiro's requirements.md
     style (see §5).
   - `profile:ears-x`: earsyntax extensions (see §5).
     A conforming implementation MUST implement `strict`; profiles are opt-in
     and MUST be supersets or relaxations that are explicitly enumerated —
     never silent.
3. **Lexical layer** — keywords (`When`, `While`, `Where`, `If`, `then`,
   `shall`, and the system-name article), case policy (strict core:
   keyword-initial capitalization as in Mavin's examples; case-insensitive
   matching is a profile concern), sentence terminator (full stop required),
   and the metadata layer: `REQ-###` identifiers and `[source: path:line]`
   tags are **frame metadata**, not part of the EARS sentence grammar —
   define them in their own subsection with their own productions.
4. **The patterns** — one subsection per pattern (Ubiquitous, Event-driven,
   State-driven, Unwanted behaviour, Optional feature, Complex). Each
   subsection MUST contain:
   - the template in Mavin's wording
   - the EBNF production(s)
   - at least 3 valid examples
   - at least 3 invalid examples, each annotated with the exact diagnostic
     ID the validator emits for it
     For Complex: clause composition rules and the temporal-order constraint
     (precondition clauses before trigger clause before system clause), with
     at least one While+When and one Where+If example.
5. **EBNF appendix** — one complete, self-contained grammar block covering
   everything, machine-readable (ISO-style EBNF; pick one dialect and name
   it). This block is authoritative; the per-pattern productions in §4 are
   excerpts of it, never variants.
6. **Decisions** — see §4 below.
7. **Profiles** — see §5 below.
8. **Prior art and non-goals** — see §6 below.
9. **Diagnostics mapping** — a table from every grammar rule to the stable
   diagnostic ID(s) it can raise. Diagnostic IDs come from the append-only
   registry in the codebase; do not invent new IDs in the document — if a
   rule has no ID yet, add it to the registry first, then reference it.
10. **Conformance test suite** — state that `fixtures/valid/**` and
    `fixtures/invalid/**` are the executable definition of this grammar,
    and that every production and every Decision entry MUST be witnessed by
    at least one fixture on each side of the line it draws.

## 3. Grammar content rules

- Every example in the document MUST round-trip through the actual CLI
  before you commit: valid examples pass `earsyntax validate`, invalid
  examples fail with exactly the diagnostic ID stated. Run them; do not
  transcribe from memory. If an example doesn't behave as documented, the
  parser or the document is wrong — resolve it, don't fudge it.
- Placeholders in templates use angle brackets (`<trigger>`, `<system>`,
  `<response>`) and are defined once in the lexical section.
- Response grammar: define what a single response is, and specify that
  responses joined by `and` within one requirement are permitted by Mavin
  ("one or many system responses") but SHOULD-level linted when they bundle
  independently testable obligations (the compound-response lint). The
  grammar accepts; the linter advises. Keep that split explicit.
- Do not define semantics. This is a syntax specification. Vague-term
  detection (the INCOSE word list), weak modals (`should`, `must`, `will`),
  and testability advice are **lint rules**, documented in the diagnostics
  mapping as warnings — they are not grammar productions and must not be
  presented as conformance requirements.

## 4. Decisions section — the edges you must adjudicate

Record each as: **ES-D-### — question — ruling — rationale — fixtures**.
Rulings you must include (rule as specified here; if the implemented parser
disagrees, reconcile first):

- **ES-D-001 Comma after leading clause.** Strict core: REQUIRED after a
  precondition/trigger clause (`When <trigger>, the …`). Rationale:
  Mavin's examples are consistent; determinism needs a delimiter.
  `profile:kiro` relaxes to optional.
- **ES-D-002 `then` keyword.** REQUIRED in Unwanted behaviour
  (`If <condition>, then …`); FORBIDDEN elsewhere. This is the discriminator
  between If-pattern and When-pattern misuse.
- **ES-D-003 Multiple triggers.** One trigger clause maximum (Mavin: "zero
  or one trigger"). Two `When` clauses in one requirement is an error, with
  a fix-message telling the author to split.
- **ES-D-004 Negative responses (`shall not`).** The most important entry —
  write it as a full paragraph. Canonical EARS and classical RM practice
  disallow negative requirements because an absence is not conventionally
  verifiable. Strict core therefore flags `shall not` as an error whose
  message states this rationale. `profile:ears-x` legalizes it as a distinct
  **prohibition** requirement kind (its own production, its own diagnostic
  space), because the downstream verification layer (Suites Blackbox
  `forbids`) can verify absence at runtime. The document states this
  reasoning explicitly: the profile exists because verification technology
  changed, not because the classical rule was wrong.
- **ES-D-005 System name.** Exactly one, definite-article form
  (`the <system name>`). Pronouns (`it`) as system reference: error.
- **ES-D-006 Timing/quantity qualifiers (`within`, `at least`, `exactly`).**
  Not in the strict core. RESERVED in `profile:ears-x` with productions
  marked _(reserved, not yet implemented)_ and a pointer to the limitations
  doc. Do not silently omit this; naming the gap is required.
- **ES-D-007 Case sensitivity.** Strict core: keywords as capitalized in
  the templates, `shall` lowercase. `profile:kiro`: fully case-insensitive
  keywords, all-caps accepted.
- **ES-D-008 One requirement per line/sentence.** Exactly one EARS sentence
  per requirement entry; a second `shall` outside an `and`-joined response
  list is an error.

Add further ES-D entries for any edge you hit while verifying examples
against the parser. Silence is the only forbidden ruling.

## 5. Profiles

- **`profile:kiro`** — enumerate exactly what it relaxes relative to
  strict, nothing else: case-insensitive/all-caps keywords, literal
  `THE SYSTEM` as system name, optional comma, tolerance for the
  user-story wrapper lines (`As a … I want …` and `#### Acceptance
Criteria` headers are skipped as non-EARS frame content, not parsed).
  Each relaxation gets a fixture pair (accepted under profile, rejected
  under strict).
- **`profile:ears-x`** — enumerate exactly what it adds: `REQ-###` ID
  frame, `[source: path:line]` tags, the prohibition kind (ES-D-004),
  reserved timing qualifiers (ES-D-006). State that ears-x is a strict
  superset: every strict-valid requirement is ears-x-valid unchanged.

## 6. Prior art and non-goals

- **Adv-EARS**: one paragraph. Cite Majumdar et al., ACITY 2011 (Springer
  CCIS 198). State plainly: it published a formal grammar for a _modified_
  EARS dialect aimed at deriving UML use-case models; this document instead
  formalizes Mavin's canonical ruleset as written, unmodified, for
  validation purposes. This paragraph preempts "a grammar already exists."
- **GEARS**: one sentence acknowledging the 2026 community variant exists
  and is out of scope; fragmentation of the notation is part of why a
  reference grammar is needed.
- **Non-goals**: semantic contradiction checking, requirement quality
  scoring beyond lint warnings, code or test generation, natural-language
  conversion (that is the agent's job; this grammar defines what the agent's
  output must satisfy).

## 7. Style constraints

- Normative voice. RFC 2119 keywords in small caps or bold consistently.
- No marketing, no comparisons to competitors, no adjectives about
  ourselves. The document's authority comes from precision.
- Attribute Mavin by name wherever the ruleset is stated. The tone toward
  the canonical source is deferential: we formalize, we do not amend (the
  strict core), and we clearly fence what is ours (profiles, decisions).
- Keep total length in the 600–900 line range. Every line either defines,
  exemplifies, or adjudicates. No filler.

## 8. Acceptance criteria

The task is complete when all of the following hold:

- The document shall contain a single authoritative EBNF block from which
  every per-pattern production is an exact excerpt.
- Every valid example shall pass `earsyntax validate` under the stated
  conformance level, verified by execution in this session.
- Every invalid example shall fail with exactly the diagnostic ID printed
  beside it, verified by execution in this session.
- Every ES-D decision shall reference at least one fixture on each side of
  its ruling, and those fixtures shall exist in the repository.
- The diagnostics table shall reference only IDs present in the registry,
  and every grammar-layer registry ID shall appear in the table.
- `README.md` shall link to `GRAMMAR.md` from its first screen.
- If any divergence between parser and document was found and could not be
  fixed in-session, it shall be recorded in Decisions with an issue link —
  zero silent divergences.

Sequencing: read the parser and the diagnostic registry first; draft the
EBNF against the implementation; verify every example by running the CLI;
only then write prose. If you find the parser accepts something this brief
rules out (or vice versa), stop and reconcile before continuing the
document.
