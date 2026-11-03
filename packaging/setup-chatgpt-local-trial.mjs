#!/usr/bin/env node
/** Install the local desktop plugin: the restricted developer trial, run from this checkout. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = process.env.DREAMCUT_PLUGIN_HOME || os.homedir();
if (process.argv.length > 2) throw new Error('This setup takes no options.');
// Put this known Node first on PATH, including when a desktop host has a minimal PATH.
const nodeDir = path.dirname(process.execPath);
const dest = path.join(home, '.codex/plugins/dreamcut-local-trial');
const state = path.join(home, '.codex/dreamcut-local-trial');
// Preserve the previous plugin package before changing its access boundary.
if (fs.existsSync(dest)) fs.cpSync(dest, `${dest}.backup-${Date.now()}`, { recursive: true });
fs.mkdirSync(path.join(dest,'.codex-plugin'),{recursive:true});
fs.mkdirSync(path.join(dest,'skills'),{recursive:true});
fs.mkdirSync(path.join(state,'projects'),{recursive:true});
fs.cpSync(path.join(root,'.agents/skills/chatgpt-local-trial'),path.join(dest,'skills','chatgpt-local-trial'),{recursive:true});
const write = (file,value) => fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
write(path.join(dest,'.codex-plugin/plugin.json'),{name:'dreamcut-local-trial',version:'0.1.0',description:'Private desktop trial: numeric edit proposals, local media, human review.',skills:'./skills/',mcpServers:'./.mcp.json',requires_local_executor:true,interface:{displayName:'DreamCut Local Trial',shortDescription:'Test local editing without sharing footage.',developerName:'DreamCut',category:'Productivity'}});
write(path.join(dest,'.mcp.json'),{mcpServers:{dreamcut:{command:process.execPath,args:[path.join(root,'bin/dreamcut.mjs'),'mcp','--profile=full','--local-media-only'],cwd:root,env:{PATH:[nodeDir,process.env.PATH??''].join(path.delimiter),DREAMCUT_APP_DATA_DIR:state,DREAMCUT_PROFILE_DIR:path.join(state,'profile'),TIMELINE_PROJECTS_DIR:path.join(state,'projects'),DREAMCUT_CLOUD_INGEST_URL:'off',TIMELINE_EDITOR_BASE_URL:'',DREAMCUT_MCP_SERVICE_TOKEN:''}}}});
const market=path.join(home,'.agents/plugins/marketplace.json');
fs.mkdirSync(path.dirname(market),{recursive:true});
const data=fs.existsSync(market)?JSON.parse(fs.readFileSync(market,'utf8')):{name:'personal',interface:{displayName:'Personal'},plugins:[]};
if (!Array.isArray(data.plugins)) throw new Error('Invalid existing marketplace; not changed.');
if(fs.existsSync(market)&&!fs.existsSync(market+'.before-dreamcut-trial')) fs.copyFileSync(market,market+'.before-dreamcut-trial');
const entry={name:'dreamcut-local-trial',source:{source:'local',path:'./.codex/plugins/dreamcut-local-trial'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Productivity'};
data.plugins=[...data.plugins.filter(p=>p.name!==entry.name),entry];
write(market+'.tmp',data);fs.renameSync(market+'.tmp',market);
console.log(`Prepared ${dest}\nMarketplace: ${data.interface?.displayName??data.name}\nTest projects: ${state}/projects\nRestart ChatGPT desktop, install DreamCut Local Trial from this marketplace, then start a new local chat. Uses the current checkout; edits take effect on restart.`);
