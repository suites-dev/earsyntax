/**
 * Architecture rules for earsyntax.
 *
 * Package boundaries (centripetal: outer packages depend inward, never outward):
 *
 *   @earsyntax/core          parser, AST, linter, diagnostics. No runtime deps.
 *   @earsyntax/cli-contract  shared report output contracts. Depends on core types.
 *   @earsyntax/extract       requirement extraction from files. Depends on core types.
 *   @earsyntax/cli           command-line tool. Depends on core, extract, cli-contract.
 *
 * core must never depend on extract, cli-contract, or cli.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies are not allowed.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-stays-pure',
      severity: 'error',
      comment:
        'packages/core is the deterministic parser core and must not depend on the extract, cli-contract, or cli packages.',
      from: { path: '^packages/core/src/' },
      to: { path: '^packages/(extract|cli-contract|cli)/src/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
