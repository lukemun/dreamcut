import fs from 'node:fs/promises';
import path from 'node:path';

// Host-selected paths only. This policy is not sufficient by itself for editing:
// a separately validated proposal-tool bridge must be attached before UI exposure.
export async function restrictedCodexSession({ projectDirectory, executable, mcpServerNames = [] }) {
  const cwd = await fs.realpath(projectDirectory);
  if (!(await fs.stat(cwd)).isDirectory()) throw Error('Codex project directory is unavailable.');
  const connectionExecutable = await fs.realpath(executable);
  const profile = 'dreamcut_editing';
  const config = {
    default_permissions: profile,
    // This editing harness supplies its own instructions and tool boundary.
    // Ancestor coding instructions live outside the read-only project grant.
    project_doc_max_bytes: 0,
    [`permissions.${profile}.filesystem`]: { ':minimal': 'read', [cwd]: 'read', [path.dirname(connectionExecutable)]: 'read' },
    [`permissions.${profile}.network.enabled`]: false,
    'features.apps': false,
    'features.plugins': false,
    'features.shell_tool': false,
    'features.unified_exec': false,
    'features.skill_mcp_dependency_install': false,
    web_search: 'disabled',
  };
  for (const name of mcpServerNames) {
    // Fail closed for unfamiliar config key syntax rather than leave a server active.
    if (!/^[A-Za-z0-9_-]+$/.test(name)) throw Error('An installed MCP server name needs explicit configuration support.');
    config[`mcp_servers.${name}.enabled`] = false;
  }
  return { connectionExecutable, cwd, config, permissions: profile, approvalPolicy: 'never' };
}
