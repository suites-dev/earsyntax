/**
 * `earsyntax doctor` — read-only project health report.
 *
 * Runs a fixed checklist and returns it as `checks`, mirroring every
 * non-passing check into the base `diagnostics` array so agents read one array
 * for problems while humans get the full ordered checklist. `ok` is true only
 * when no check produced an error.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CommandContext } from '../context.js';
import type { FacadeDiagnostic, FacadeSeverity } from '../facade-types.js';
import { loadConfig, requireRoot, resolveInput } from '../project.js';
import { buildResponse, emit } from '../response.js';
import { CLI_VERSION } from '../version.js';
import { isStale, listSlugs, readManifest, workPaths } from '../workspace.js';
import { wrapperFilesFor } from '../tool-wrappers.js';

interface DoctorCheck {
  name: string;
  ok: boolean;
  severity: FacadeSeverity;
  message: string;
}

export function doctorCommand(context: CommandContext): number {
  const root = requireRoot(context.cwd);
  // Throws exit 2 when the config is unreadable/invalid.
  const config = loadConfig(root, context.global.config);

  const checks: DoctorCheck[] = [];

  checks.push({
    name: 'config',
    ok: true,
    severity: 'info',
    message: '.earsyntax/config.json exists and parses.',
  });

  const workDirExists = existsSync(resolve(root, config.workDir));
  checks.push({
    name: 'workDir',
    ok: workDirExists,
    severity: workDirExists ? 'info' : 'error',
    message: workDirExists
      ? `Work directory ${config.workDir} exists.`
      : `Work directory ${config.workDir} is missing.`,
  });

  checks.push({
    name: 'version',
    ok: true,
    severity: 'info',
    message: `earsyntax ${CLI_VERSION} supports facade contract 1.`,
  });

  // Per-work-item checks: referenced sources exist, accepted items are not stale.
  for (const slug of listSlugs(root, config)) {
    const manifest = readManifest(workPaths(root, config, slug));
    if (manifest === undefined) {
      continue;
    }
    if (manifest.source?.path !== undefined) {
      const sourceExists = existsSync(resolveInput(root, manifest.source.path));
      checks.push({
        name: `source:${slug}`,
        ok: sourceExists,
        severity: sourceExists ? 'info' : 'warning',
        message: sourceExists
          ? `Source for ${slug} exists.`
          : `Source ${manifest.source.path} for ${slug} is missing.`,
      });
    }
    if (manifest.status === 'accepted') {
      const stale = isStale(root, manifest);
      checks.push({
        name: `stale:${slug}`,
        ok: !stale,
        severity: stale ? 'warning' : 'info',
        message: stale
          ? `Accepted item ${slug} is stale: its source changed after acceptance.`
          : `Accepted item ${slug} is up to date.`,
      });
    }
  }

  // Configured tool wrappers are present.
  for (const tool of config.tools) {
    for (const wrapper of wrapperFilesFor(tool)) {
      const present = existsSync(resolve(root, wrapper.path));
      checks.push({
        name: `tool:${wrapper.path}`,
        ok: present,
        severity: present ? 'info' : 'info',
        message: present ? `${wrapper.path} is present.` : `${wrapper.path} is missing.`,
      });
    }
  }

  const diagnostics: FacadeDiagnostic[] = checks
    .filter((check) => !check.ok)
    .map((check) => ({ code: `doctor.${check.name}`, severity: check.severity, message: check.message }));

  const hasError = checks.some((check) => !check.ok && check.severity === 'error');

  const response = buildResponse(
    { command: 'doctor', ok: !hasError, root, diagnostics, next: [] },
    { checks },
  );

  const pretty = checks
    .map((check) => `  [${check.ok ? 'ok' : check.severity}] ${check.name}: ${check.message}`)
    .join('\n');
  emit(context.emitter, response, pretty);
  return 0;
}