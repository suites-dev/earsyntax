/**
 * Renderer surface for `earsyntax init`.
 *
 * Re-exports the agent and host renderers and the shared protocol primitives so
 * the init command imports one module. The renderers are pure: given the same
 * agents and hosts they return the same bytes, with no clock or filesystem
 * access.
 */

export * from './protocol.js';
export { AGENTS, type Agent, renderAgent } from './agents.js';
export { HOSTS, type Host, HOST_VALIDATE, renderHost } from './hosts.js';
