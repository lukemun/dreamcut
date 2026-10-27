import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

export const PLUGIN_NAME = 'dreamcut-desktop';
export const PLUGIN_VERSION = '0.1.2';
const json = value => `${JSON.stringify(value, null, 2)}\n`;

/** Register only this plugin. Never change permissions, existing projects, or other marketplace entries. */
export function installPlugin({ home = os.homedir(), node = process.execPath, payload = path.dirname(fileURLToPath(import.meta.url)) } = {}) {
  home = path.resolve(home);
  const market = path.join(home, '.agents/plugins/marketplace.json');
  const original = fs.existsSync(market) ? fs.readFileSync(market, 'utf8') : null;
  const catalog = original === null ? { name: 'personal', interface: { displayName: 'Personal' }, plugins: [] } : JSON.parse(original);
  if (!catalog || typeof catalog.name !== 'string' || !Array.isArray(catalog.plugins)) throw new Error('The existing plugin catalog is invalid. It was not changed.');
  const parent = path.join(home, '.codex/plugins');
  const dest = path.join(parent, PLUGIN_NAME);
  const id = randomUUID();
  const stage = path.join(parent, `.${PLUGIN_NAME}-${id}`);
  const backup = `${dest}.previous`;
  const appData = path.join(home, 'Library/Application Support/DreamCut');
  fs.mkdirSync(parent, { recursive: true });
  fs.mkdirSync(path.dirname(market), { recursive: true });
  fs.mkdirSync(appData, { recursive: true });
  const existing = fs.existsSync(dest);
  // Only replace packages owned by this installer, never an unrelated manually created folder.
  for (const owned of [dest, backup]) {
    if (fs.existsSync(owned) && (fs.lstatSync(owned).isSymbolicLink() || !fs.existsSync(path.join(owned, '.dreamcut-installer')))) {
      throw new Error(`An unmanaged plugin folder exists at ${owned}. It was not changed.`);
    }
  }
  let movedOld = false, installed = false;
  const pendingMarket = `${market}.${id}.tmp`;
  try {
    fs.mkdirSync(stage);
    fs.writeFileSync(path.join(stage, '.dreamcut-installer'), PLUGIN_VERSION+'\n');
    fs.cpSync(path.join(payload, 'launcher'), path.join(stage, 'launcher'), { recursive: true });
    fs.cpSync(path.join(payload, 'launcher/skills'), path.join(stage, 'skills'), { recursive: true });
    fs.cpSync(path.join(payload, 'assets'), path.join(stage, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(stage, '.codex-plugin'));
    fs.writeFileSync(path.join(stage, '.codex-plugin/plugin.json'), json({
      name: PLUGIN_NAME, version: PLUGIN_VERSION, author: { name: 'DreamCut', url: 'https://dreamcut.io' },
      description: 'Edit local video with ChatGPT. Review and approve changes in DreamCut.',
      skills: './skills/', mcpServers: './.mcp.json', requires_local_executor: true,
      interface: { displayName: 'DreamCut', shortDescription: 'Edit video with ChatGPT', longDescription: 'A local video editor. Your original video files remain on your Mac. Tool results, including transcripts and selected preview images, can be shared with ChatGPT when those tools are used.', developerName: 'DreamCut', category: 'Productivity', capabilities: ['Read', 'Write'], websiteURL: 'https://dreamcut.io', supportURL: 'https://dreamcut.io/feedback', privacyPolicyURL: 'https://dreamcut.io/privacy', termsOfServiceURL: 'https://dreamcut.io/terms', logo: './assets/icon.png', composerIcon: './assets/icon.png', defaultPrompt: ['Open DreamCut'] },
    }));
    fs.writeFileSync(path.join(stage, '.mcp.json'), json({ mcpServers: { dreamcut: {
      command: node, args: ['${PLUGIN_ROOT}/launcher/bin/dreamcut.mjs', 'mcp', '--profile=full'], cwd: appData,
      env: { PATH: `${path.dirname(node)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`, DREAMCUT_APP_DATA_DIR: appData, DREAMCUT_CLOUD_INGEST_URL: 'off', TIMELINE_EDITOR_BASE_URL: '', DREAMCUT_MCP_SERVICE_TOKEN: '' },
    } } }));
    const entry = { name: PLUGIN_NAME, source: { source: 'local', path: `./.codex/plugins/${PLUGIN_NAME}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' };
    catalog.plugins = [...catalog.plugins.filter(item => item.name !== PLUGIN_NAME), entry];
    // Preserve the first catalog for manual recovery, and refuse to overwrite concurrent edits.
    if (original !== null && !fs.existsSync(`${market}.before-dreamcut-desktop`)) fs.writeFileSync(`${market}.before-dreamcut-desktop`, original, { flag: 'wx' });
    fs.writeFileSync(pendingMarket, json(catalog), { flag: 'wx' });
    const current = fs.existsSync(market) ? fs.readFileSync(market, 'utf8') : null;
    if (current !== original) throw new Error('Your plugin catalog changed during setup. Run setup again.');
    if (existing) {
      fs.rmSync(backup, { recursive: true, force: true });
      fs.renameSync(dest, backup); movedOld = true;
    }
    fs.renameSync(stage, dest); installed = true;
    fs.renameSync(pendingMarket, market);
    return { dest, marketplace: catalog.interface?.displayName ?? catalog.name };
  } catch (error) {
    if (installed) fs.rmSync(dest, { recursive: true, force: true });
    if (movedOld) fs.renameSync(backup, dest);
    throw error;
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
    fs.rmSync(pendingMarket, { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--home')) throw new Error('Use --home <folder> only for a disposable setup test.');
    const result = installPlugin({ home: args[1] ?? os.homedir() });
    console.log(`\nDreamCut is ready to install in ChatGPT.\n\n1. Restart the ChatGPT desktop app.\n2. Open Plugins, choose ${result.marketplace}, and install DreamCut.\n3. Start a local chat, enable DreamCut, and ask “Open DreamCut”.\n\nThe editor downloads on first use (about 300 MB).\nYour original footage stays on this Mac. Transcripts and selected previews may be sent to ChatGPT when requested.\nHelp: https://dreamcut.io/install`);
  } catch (error) { console.error(`DreamCut setup stopped: ${error.message}`); process.exitCode = 1; }
}
