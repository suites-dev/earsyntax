/**
 * `@earsyntax/cli` public API surface.
 *
 * The package ships the `earsyntax` binary (see `bin/run.js`). It also exports
 * {@link run} for embedding and tests, plus the facade JSON types so consumers
 * can type responses they parse.
 */

export { run, type RunOptions } from './cli.js';
export { CLI_VERSION, FACADE_CONTRACT, FEATURES } from './version.js';
export type * from './facade-types.js';
