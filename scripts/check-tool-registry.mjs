import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { validateEditorAgentAccess } from "../mcp/capability-catalog.mjs";

const root=process.cwd();
const registry=JSON.parse(fs.readFileSync("docs/tools/registry.json","utf8"));
const catalog=JSON.parse(execFileSync(process.execPath,["mcp/server.mjs","--catalog","--profile=full"],{encoding:"utf8",maxBuffer:64*1024*1024,env:{...process.env,DREAMCUT_TOOL_FAMILIES:""}}));
const actual=new Set(catalog.tools.map(t=>t.name)),seen=new Set(),ids=new Set();
const fail=message=>{throw new Error(message);};
if(registry.schema_version!==1) fail("Unsupported tool registry version");
// Every capability states the in-editor agent's access; the session and allowlist derive from it.
const accessProblems=validateEditorAgentAccess(registry);
if(accessProblems.length) fail(`Editor agent access:\n- ${accessProblems.join("\n- ")}`);
for(const cap of registry.capabilities){
  if(!cap.id || ids.has(cap.id)) fail(`Duplicate/missing capability: ${cap.id}`);ids.add(cap.id);
  if(!["existing","planned"].includes(cap.status)) fail(`Invalid status: ${cap.id}`);
  if(!cap.outcome || !cap.authority || !cap.acceptance || !cap.evolution) fail(`Incomplete contract: ${cap.id}`);
  if(!Array.isArray(cap.search_aliases) || !cap.search_aliases.length || cap.search_aliases.some(alias=>typeof alias!=="string" || !alias.trim() || alias.length>100) || new Set(cap.search_aliases.map(alias=>alias.trim().toLowerCase())).size!==cap.search_aliases.length) fail(`Invalid/missing search aliases: ${cap.id}`);
  for(const file of [...cap.owners,cap.evolution]) {
    if(path.isAbsolute(file)||file.split("/").includes("..")||!fs.existsSync(path.join(root,file))) fail(`Missing/unsafe owner: ${file}`);
  }
  for(const tool of cap.tools){if(!actual.has(tool)||seen.has(tool)) fail(`Unknown/duplicate tool: ${tool}`);seen.add(tool);}
}
for(const tool of actual) if(!seen.has(tool)) fail(`Register the capability owning ${tool}`);
const audit=JSON.parse(fs.readFileSync("docs/tools/script-inventory.json","utf8"));
const paths=new Set();
for(const entry of audit.scripts){if(paths.has(entry.path)||!fs.existsSync(entry.path)||!entry.disposition||!entry.reason) fail(`Invalid inventory entry: ${entry.path}`);paths.add(entry.path);}
const current=execFileSync("git",["ls-files","--cached","--others","--exclude-standard","scripts"],{encoding:"utf8"}).trim().split("\n").filter(Boolean);
for(const file of current) if(!file.split("/").some(part=>part.startsWith("."))&&fs.existsSync(file)&&!paths.has(file)) fail(`Classify this script in the inventory: ${file}`);
console.log(`Tool registry: ${ids.size} capabilities, ${seen.size} published tools; ${paths.size} inventoried script files. Runtime conformance requires separate tests.`);
