import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {ToolListChangedNotificationSchema} from '@modelcontextprotocol/sdk/types.js';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {explainInvalidArguments} from './argument-errors.mjs';
import {argumentsRejectedSignal,sendSignal} from './product-signals.mjs';
import {randomUUID} from 'node:crypto';
import {desktopServiceAuth} from './desktop-service-auth.mjs';
import { readEnv } from './env-name.mjs';
import { editorAgentTools } from './capability-catalog.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
// Derived from the registry's editor_agent fields; never hand-edit a second list.
const OPERATOR_TOOLS=editorAgentTools();

export function editingMcpRuntimeEnv(env = {}) {
  return Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL']
    .filter(key => typeof env[key] === 'string').map(key => [key, env[key]]));
}

/** Host-owned configuration only. Model inputs never select executables or authority. */
export async function connectEditingMcp({projectId,baseUrl='http://127.0.0.1:3123',families,profile='editing',probeReceipt,probeTimeoutMs=120000,onEvent=()=>{},timeoutMs=30000,visionBackends,serviceToken,projectsDirectory,runtimeEnv}={}) {
  if(!probeReceipt && (!projectId || !Array.isArray(families) || !families.length))throw Error('Production MCP requires a project and explicit nonempty family allowlist');
  const url=new URL(baseUrl);
  if(url.protocol!=='http:' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Editor endpoint must be local HTTP');
  const auth=desktopServiceAuth(baseUrl,serviceToken);
  // Rejections here never reach the server, so this layer records its own product signal.
  const signalSession=randomUUID();
  const recordRejection=(tool,schema,args,message)=>void sendSignal(body=>fetch(new URL('/api/agent/product-signals',baseUrl),{method:'POST',redirect:'error',signal:AbortSignal.timeout(1000),headers:{...auth,'content-type':'application/json'},body:JSON.stringify(body)}),
    argumentsRejectedSignal({sessionId:signalSession,client:'dreamcut-harness',projectId},{tool,layer:'harness_schema',schema,args,message}));
  const client=new Client({name:'dreamcut-editing-harness',version:'1'},{capabilities:{}});
  let dirty=true,schemas=[];
  const validator=new AjvJsonSchemaValidator();let validators=new Map();
  client.setNotificationHandler(ToolListChangedNotificationSchema,()=>{dirty=true;onEvent({kind:'tools_changed'});});
  const transport=new StdioClientTransport({command:process.execPath,cwd:root,stderr:'pipe',
    args:probeReceipt?[path.join(root,'mcp/client-refresh-probe.mjs'),'serve',path.resolve(probeReceipt),profile,String(probeTimeoutMs)]:[path.join(root,'mcp/server.mjs'),`--profile=${profile}`],
    env:{...editingMcpRuntimeEnv(runtimeEnv),DREAMCUT_MCP_CLIENT:'dreamcut-harness',TIMELINE_EDITOR_BASE_URL:baseUrl,DREAMCUT_TOOL_FAMILIES:families?.join(',')??'',...(serviceToken?{DREAMCUT_MCP_SERVICE_TOKEN:serviceToken}:{}),...(process.versions.electron?{ELECTRON_RUN_AS_NODE:'1'}:{}),...((projectsDirectory||process.env.TIMELINE_PROJECTS_DIR)?{TIMELINE_PROJECTS_DIR:projectsDirectory||process.env.TIMELINE_PROJECTS_DIR}:{}),...(visionBackends?{DREAMCUT_VISION_BACKENDS:JSON.stringify(visionBackends)}:readEnv("VISION_BACKENDS")?{DREAMCUT_VISION_BACKENDS:readEnv("VISION_BACKENDS")}:{})}});
  // Drain diagnostic stream; avoid embedding private server output in shared logs.
  transport.stderr?.on('data',()=>{});
  try {await client.connect(transport,{timeout:timeoutMs});}catch(e){await transport.close();throw e;}
  const list=async()=>{
    if(dirty){dirty=false;const next=[];let cursor;
      do{const result=await client.listTools(cursor?{cursor}:{},{timeout:timeoutMs});next.push(...result.tools);cursor=result.nextCursor;}while(cursor);
      schemas=probeReceipt?next:next.filter(t=>OPERATOR_TOOLS.has(t.name));
      // A tool that shares another tool's shape (preflight and proposal_create) is checked with the full schema.
      const fullSchema=t=>(schemas.find(o=>o.name===t._meta?.dreamcut_validated_as)??t).inputSchema;
      validators=new Map(schemas.map(t=>[t.name,{check:validator.getValidator(fullSchema(t)),schema:fullSchema(t)}]));
      onEvent({kind:'tools_registered',names:schemas.map(t=>t.name)});
    }
    return structuredClone(schemas);
  };
  // Pre-dispatch refusals are definite non-execution: return them as tool errors. A throw
  // reads as an unknown outcome to journaled callers and blocks the whole conversation.
  const refuse=(code,message)=>({isError:true,structuredContent:{code,state_changed:false,message},content:[{type:'text',text:message}]});
  return {list,async call(name,args,suppliedNames){
    if(!suppliedNames?.includes(name))return refuse('TOOL_NOT_SUPPLIED','Tool was not supplied on this model turn; nothing was run');
    if(!schemas.some(t=>t.name===name))return refuse('TOOL_NOT_REGISTERED','Tool is not registered; nothing was run');
    if(!probeReceipt && args?.project_id!==undefined && args.project_id!==projectId)return refuse('OUTSIDE_PROJECT','Tool project is outside the session scope; nothing was run');
    const {check,schema}=validators.get(name);const validation=check(args);
    if(!validation.valid){const message=explainInvalidArguments(schema,args,validation.errorMessage);if(!probeReceipt)recordRejection(name,schema,args,validation.errorMessage);return refuse('INVALID_ARGUMENTS',message);}
    // run_instrument extra_args are bounded by the server's own flag allowlist (mcp/instrument-args.mjs).
    if(!probeReceipt && !OPERATOR_TOOLS.has(name))return refuse('OUTSIDE_AUTHORITY','Tool is outside the initial editing operator authority; nothing was run');
    onEvent({kind:'tool_dispatch',name});
    const result=await client.callTool({name,arguments:args},undefined,{timeout:timeoutMs});
    if(name==='capability_catalog' && args.action==='load' && !result.isError)dirty=true;
    onEvent({kind:'tool_result',name,isError:result.isError===true});
    return result;
  },async close(){await client.close();}};
}
