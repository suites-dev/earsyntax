# Facade JSON API

The JSON contract for every `earsyntax` command is documented alongside its usage
in the [CLI reference](cli.md), so there is one page per command with its flags,
exit codes, pretty output, and `--json` envelope together. This page is a pointer
to avoid a second copy that could drift.

Start here:

- [The JSON envelope](cli.md#the-json-envelope): the base shape every `--json`
  response shares, and the difference between facade `diagnostics` and lint
  `findings`.
- [Exit codes](cli.md#exit-codes): `0`, `1`, `2` and what each means.
- Per-command payloads: [`validate`](cli.md#validate-paths-),
  [`extract`](cli.md#extract-paths-),
  [`instructions`](cli.md#instructions-authorconvertrepairreview---file-path---from-source),
  [`explain`](cli.md#explain-diagnostic-id), [`profiles`](cli.md#profiles),
  [`doctor`](cli.md#doctor), [`init`](cli.md#init---agent-agents---host-hosts),
  and [`version`](cli.md#version---features).

Normative contracts that the CLI projects:

- [`docs/contracts/findings.md`](contracts/findings.md): the frozen Findings
  model returned in a `validate` response and embedded in `instructions
repair`/`review`.
- [`docs/refactor/host-native-facade.md`](refactor/host-native-facade.md): the
  frozen command surface, global flags, and envelope definition.
- [`docs/diagnostics.md`](diagnostics.md): the diagnostic id registry the
  findings reference.
