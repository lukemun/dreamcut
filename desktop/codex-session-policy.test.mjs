import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { restrictedCodexSession } from './codex-session-policy.mjs';

test('editing session policy resolves paths and removes inherited external tool access', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-session-policy-'));
  try {
    const project = path.join(temporary, 'project');
    const bin = path.join(temporary, 'runtime/bin');
    await fs.mkdir(project); await fs.mkdir(bin, { recursive: true });
    const executable = path.join(bin, 'codex');
    await fs.writeFile(executable, 'fixture');
    const alias = path.join(temporary, 'codex-link'); await fs.symlink(executable, alias);
    const policy = await restrictedCodexSession({ projectDirectory: project, executable: alias, mcpServerNames: ['personal_server'] });
    assert.equal(policy.connectionExecutable, await fs.realpath(executable));
    assert.equal(policy.approvalPolicy, 'never');
    assert.equal(policy.config['mcp_servers.personal_server.enabled'], false);
    assert.equal(policy.config.project_doc_max_bytes, 0);
    assert.equal(policy.config['features.apps'], false);
    assert.equal(policy.config['features.plugins'], false);
    assert.equal(policy.config['features.shell_tool'], false);
    assert.equal(policy.config['permissions.dreamcut_editing.network.enabled'], false);
    assert.deepEqual(policy.config['permissions.dreamcut_editing.filesystem'], {
      ':minimal': 'read', [await fs.realpath(project)]: 'read', [await fs.realpath(bin)]: 'read',
    });
    assert.equal(policy.config.default_permissions, policy.permissions);
    await assert.rejects(restrictedCodexSession({ projectDirectory: project, executable, mcpServerNames: ['unknown.syntax'] }), /explicit configuration/);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});
