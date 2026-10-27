#!/usr/bin/env node
/** Install the local desktop plugin. Full mode uses npm; the restricted developer trial uses the checkout. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = process.env.DREAMCUT_PLUGIN_HOME || os.homedir();
const fullAccess = process.argv.includes('--full-access');
if (process.argv.slice(2).some(arg => arg !== '--full-access')) throw new Error('Use --full-access to upgrade, or no flags for the restricted trial.');
// Run npm with this known Node, including when a desktop host has a minimal PATH.
const nodeDir = path.dirname(process.execPath);
const npmCli = fullAccess ? (process.platform === 'win32'
  ? path.join(nodeDir, 'node_modules/npm/bin/npm-cli.js')
  : fs.realpathSync(path.join(nodeDir, 'npm'))) : null;
if (npmCli && !fs.existsSync(npmCli)) throw new Error('Install npm alongside Node before configuring the plugin.');
const dest = path.join(home, '.codex/plugins/dreamcut-local-trial');
const state = path.join(home, '.codex/dreamcut-local-trial');
// Preserve the previous plugin package before changing its access boundary.
if (fs.existsSync(dest)) fs.cpSync(dest, `${dest}.backup-${Date.now()}`, { recursive: true });
fs.mkdirSync(path.join(dest,'.codex-plugin'),{recursive:true});
fs.mkdirSync(path.join(dest,'skills'),{recursive:true});
fs.mkdirSync(path.join(state,'projects'),{recursive:true});
// Reuse the shipping DreamCut entry skills in full mode, not the restricted trial instructions.
const skillRoot = fullAccess ? 'full-skills' : 'skills';
fs.mkdirSync(path.join(dest, skillRoot), { recursive: true });
if (fullAccess) fs.cpSync(path.join(root,'packaging/launcher/skills'),path.join(dest,skillRoot),{recursive:true});
else fs.cpSync(path.join(root,'.agents/skills/chatgpt-local-trial'),path.join(dest,skillRoot,'chatgpt-local-trial'),{recursive:true});
const write = (file,value) => fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
write(path.join(dest,'.codex-plugin/plugin.json'),{name:'dreamcut-local-trial',version:fullAccess?'0.3.0':'0.1.0',description:fullAccess?'Local DreamCut: transcription, media analysis and reviewable edits.':'Private desktop trial: numeric edit proposals, local media, human review.',skills:`./${skillRoot}/`,mcpServers:'./.mcp.json',requires_local_executor:true,interface:{displayName:fullAccess?'DreamCut Local':'DreamCut Local Trial',shortDescription:fullAccess?'Transcribe and edit local footage with human review.':'Test local editing without sharing footage.',developerName:'DreamCut',category:'Productivity'}});
// Full mode uses the public installer and Dreamcut.io updates. The unpublished restricted policy stays checkout-backed.
write(path.join(dest,'.mcp.json'),{mcpServers:{dreamcut:{command:process.execPath,args:fullAccess?[npmCli,'exec','--yes','--package=dreamcut@0.2.2','--','dreamcut','mcp','--profile=full']:[path.join(root,'bin/dreamcut.mjs'),'mcp','--profile=full','--local-media-only'],cwd:fullAccess?state:root,env:{PATH:[nodeDir,process.env.PATH??''].join(path.delimiter),DREAMCUT_APP_DATA_DIR:state,DREAMCUT_PROFILE_DIR:path.join(state,'profile'),TIMELINE_PROJECTS_DIR:path.join(state,'projects'),DREAMCUT_CLOUD_INGEST_URL:'off',TIMELINE_EDITOR_BASE_URL:'',DREAMCUT_MCP_SERVICE_TOKEN:''}}}});
const market=path.join(home,'.agents/plugins/marketplace.json');
fs.mkdirSync(path.dirname(market),{recursive:true});
const data=fs.existsSync(market)?JSON.parse(fs.readFileSync(market,'utf8')):{name:'personal',interface:{displayName:'Personal'},plugins:[]};
if (!Array.isArray(data.plugins)) throw new Error('Invalid existing marketplace; not changed.');
if(fs.existsSync(market)&&!fs.existsSync(market+'.before-dreamcut-trial')) fs.copyFileSync(market,market+'.before-dreamcut-trial');
const entry={name:'dreamcut-local-trial',source:{source:'local',path:'./.codex/plugins/dreamcut-local-trial'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Productivity'};
data.plugins=[...data.plugins.filter(p=>p.name!==entry.name),entry];
write(market+'.tmp',data);fs.renameSync(market+'.tmp',market);
console.log(`Prepared ${dest}\nMarketplace: ${data.interface?.displayName??data.name}\nTest projects: ${state}/projects\n${fullAccess ? 'Full DreamCut access configured. Refresh the installed plugin and reconnect the chat; media evidence and transcripts can now reach the connected model.' : 'Restart ChatGPT desktop, install DreamCut Local Trial from this marketplace, then start a new local chat.'} ${fullAccess ? 'Uses dreamcut@0.2.2 from npm and runtime updates from Dreamcut.io; no development checkout is needed.' : 'Uses the current checkout; edits take effect on restart.'}`);
