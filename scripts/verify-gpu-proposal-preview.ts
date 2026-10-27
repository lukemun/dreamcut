/** Isolated synthetic real-editor proof. Never approves/rejects or edits an existing project. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium,type Page} from 'playwright-core';
import sharp from 'sharp';
import { readEnv } from '../src/lib/env-name';

export function fixtureDirectory(root:string,id:string){
 const absolute=fs.realpathSync(root);
 if(absolute===path.resolve('projects')||!/^gpu-proposal-proof-[a-f0-9-]+$/.test(id))throw Error('Only a fresh isolated GPU proposal fixture is allowed');
 const directory=path.join(absolute,id);
 if(fs.existsSync(directory))throw Error('Refusing to reuse or overwrite an existing project');
 return directory;
}
export function assertProposalOnlyRequest(method:string,url:string){
 const pathname=new URL(url).pathname;
 if(method==='DELETE'&&/^\/api\/projects\/gpu-proposal-proof-[a-f0-9-]+\/prepared-preview$/.test(pathname))return;
 if(method==='DELETE'||/\/(approve|reject|history\/restore)(?:\/|$)/.test(pathname))throw Error('Proposal proof cannot apply, reject or restore');
 if(['POST','PATCH','PUT'].includes(method)&&/\/timeline(?:\/|$)/.test(pathname)&&!/\/proposals(?:\/|$)/.test(pathname))throw Error('Proposal proof cannot mutate working timeline');
}
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
async function main(){
 const root=process.env.TIMELINE_PROJECTS_DIR,base=process.env.TIMELINE_EDITOR_BASE_URL;
 if(!root||!base||readEnv("SYNTHETIC_PROPOSAL_PROOF")!=='1')throw Error('Set isolated TIMELINE_PROJECTS_DIR, its TIMELINE_EDITOR_BASE_URL and DREAMCUT_SYNTHETIC_PROPOSAL_PROOF=1');
 const id=`gpu-proposal-proof-${randomUUID()}`,directory=fixtureDirectory(root,id);
 const {createProject,writeTimeline}=await import('../src/lib/local-store/store');
 const {timelineRevision}=await import('../src/lib/agent/timeline-editor-agent-apply');
 createProject(id,'web','Synthetic GPU proposal proof',{outputAspectRatio:'16:9'});
 const actorId=randomUUID(),now=new Date().toISOString();
 writeTimeline(id,{transitions:[],elements:[{id:actorId,project_id:id,type:'caption_text',source_url:null,timeline_start:0,duration:4,lane_key:'captions_0',lane_index:0,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,created_at:now,updated_at:now,removed_at:null,props:{title:'Proof caption',text:'GPU PROPOSAL',fontPreset:'classic_serif',fontSizePx:90,styleVariant:'none',positionPreset:'center',textColor:'#ffffff',animationIn:'none',animationOut:'none'}}]},'synthetic-gpu-proposal-fixture');
 const timelinePath=path.join(directory,'timeline.json'),before=fs.readFileSync(timelinePath),revision=timelineRevision(id);
 fs.mkdirSync(path.resolve('testing/results/gpu-preview'),{recursive:true});
 const output=fs.mkdtempSync(path.resolve('testing/results/gpu-preview/proposal-'));
 const receipt:any={passed:false,project:id,output,scope:'Fresh synthetic editor project only; no approvals, rejections or working-timeline edits',revision,checks:{},errors:[]};
 const save=()=>fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2));
 const phase=(value:string)=>{receipt.phase=value;save();};save();
 const json=async(url:string,body?:unknown)=>{const response=await fetch(`${base}${url}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});const data=await response.json();if(!response.ok)throw Error(`${response.status}: ${JSON.stringify(data)}`);return data;};
 const timeline=await json(`/api/projects/${id}/timeline`);assert.equal(timeline.elements[0]?.id,actorId,'Server must use the isolated fixture storage');
 const proposal={schema_version:2,project_id:id,expected_revision:revision,mode:'workshop',decision:'propose',summary:'Synthetic caption color preview',assumptions:[],unresolved_gaps:[],caps:{max_mutations:2,requested_mutations:2,max_renders:0},options:[{id:'color',label:'GPU color proof',recommended:true,summary:'Change the synthetic caption color',review_controls:[{operation_index:0,target:'props',field:'fontSizePx'}],requested_mutations:2,operations:[{element_id:actorId,props:{textColor:'#ff3300',fontSizePx:110},rationale:'Synthetic visible preview invalidation proof'}]}]};
 phase('proposal-preflight');
 await json(`/api/projects/${id}/timeline/proposals/preflight`,{proposal});
 const created=await json(`/api/projects/${id}/timeline/proposals`,{proposal});receipt.proposalId=created.proposal_id;save();
 const server=await chromium.launchServer({channel:'chrome',headless:true,args:['--force-color-profile=srgb','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--mute-audio']});
 const browser=await chromium.connect(server.wsEndpoint());
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript('globalThis.__name = (value) => value');
  await context.addInitScript(()=>{const original=OffscreenCanvas.prototype.getContext;(window as any).__proposalWebGL=[];OffscreenCanvas.prototype.getContext=function(...args:any[]){const result=(original as any).apply(this,args);if(result&&args[0]==='webgl2')(window as any).__proposalWebGL.push(result);return result;} as typeof original;});
  await context.addInitScript(()=>{localStorage.setItem('dreamcut.preview-preparation','gpu');localStorage.setItem('dreamcut.playback-engine','standard');});
  const page=await context.newPage();page.on('pageerror',error=>receipt.errors.push(error.message));
  await page.route('**/api/**',async route=>{try{assertProposalOnlyRequest(route.request().method(),route.request().url());await route.continue();}catch(error){receipt.errors.push(String(error));await route.abort();}});
  phase('navigation');await page.goto(`${base}/p/${id}`,{waitUntil:'domcontentloaded'});
  const seek=async(frame:number)=>{await page.getByRole('button',{name:'Pause preview',exact:true}).click({timeout:500}).catch(()=>{});await page.getByRole('slider',{name:'Seek preview',exact:true}).fill(String(frame));await page.waitForFunction(frame=>document.querySelector<HTMLElement>('[data-gpu-preview]')?.dataset.gpuPreviewFrame===String(frame),frame,{timeout:30000});};
  const png=async()=>{assert.equal(await page.locator('[data-gpu-preview]').getAttribute('data-gpu-compositor'),'canvaskit');return Buffer.from((await page.locator('[data-gpu-preview]').evaluate(node=>(node as HTMLCanvasElement).toDataURL('image/png'))).split(',')[1],'base64');};
  const colorCounts=async(bytes:Buffer)=>{const {data}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});let red=0,green=0,white=0;for(let i=0;i<data.length;i+=4){if(data[i]>120&&data[i]>data[i+1]*1.5)red++;if(data[i+1]>120&&data[i+1]>data[i]*1.5)green++;if(data[i]>160&&data[i+1]>160&&data[i+2]>160)white++;}return {red,green,white};};
  await page.locator('[data-gpu-preview][data-gpu-preview-frame]').waitFor({timeout:60000});await seek(30);
  const live=await png();fs.writeFileSync(path.join(output,'live.png'),live);assert.ok((await colorCounts(live)).white>100);
  // Drawer and preview are the same controls available to a human editor.
  phase('preview');await page.getByRole('button',{name:/Proposals/i}).first().click();
  await page.getByRole('button',{name:'Replay GPU color proof',exact:true}).click();await seek(30);
  const waitColor=async(color:'red'|'green')=>{for(let attempt=0;attempt<60;attempt++){const image=await png();if((await colorCounts(image))[color]>100)return image;await page.waitForTimeout(100);}throw Error(`No visible ${color} proposal caption`);};
  const proposed=await waitColor('red');fs.writeFileSync(path.join(output,'proposed.png'),proposed);receipt.checks.preview=true;
  phase('tune');const control=page.locator('[data-proposal-control="fontSizePx"]');
  await control.getByRole('spinbutton').fill('160');await control.getByRole('spinbutton').press('Tab');
  await seek(30);
  for(let attempt=0;attempt<60&&hash(await png())===hash(proposed);attempt++)await page.waitForTimeout(100);
  const tuned=await png();assert.ok((await colorCounts(tuned)).red>(await colorCounts(proposed)).red*1.1,'Tuned size must visibly enlarge the caption');fs.writeFileSync(path.join(output,'tuned.png'),tuned);receipt.checks.tune=true;
  await seek(70);await waitColor('red');await seek(30);assert.equal(hash(await png()),hash(tuned),'Backward seek changed tuned proposal');receipt.checks.seek=true;
  phase('reset');await control.getByRole('button',{name:/Reset/}).click();await seek(30);for(let attempt=0;attempt<60&&hash(await png())!==hash(proposed);attempt++)await page.waitForTimeout(100);const reset=await png();assert.equal(hash(reset),hash(proposed),'Reset did not restore authored proposal');receipt.checks.reset=true;
  phase('cancel-preview');await page.getByRole('checkbox',{name:'Select GPU color proof for review',exact:true}).uncheck();await seek(30);
  for(let attempt=0;attempt<60&&hash(await png())!==hash(live);attempt++)await page.waitForTimeout(100);
  assert.equal(hash(await png()),hash(live),'Exiting preview did not restore working picture');receipt.checks.cancelPreview=true;
  phase('context-loss-fallback');
  await page.getByRole('button',{name:'Preview & export settings',exact:true}).click();
  const renderer=page.getByRole('combobox',{name:'Preview renderer',exact:true});
  const exportControl=page.getByRole('combobox',{name:'Export engine',exact:true});
  const exportBefore=await exportControl.count()?await exportControl.inputValue():null;
  assert.equal(await renderer.inputValue(),'gpu');
  await page.evaluate(()=>{const contexts=(window as any).__proposalWebGL as WebGL2RenderingContext[];const context=contexts.findLast(item=>!item.isContextLost());if(!context)throw Error('No actual CanvasKit WebGL2 context');const extension=context.getExtension('WEBGL_lose_context');if(!extension)throw Error('Context-loss injection unavailable');extension.loseContext();});
  await page.waitForFunction(()=>!document.querySelector('[data-gpu-preview]'),undefined,{timeout:30000});
  const status=page.getByRole('status').filter({hasText:'Graphics card preview unavailable. Displaying with Browser.'}).first();
  await status.waitFor({timeout:30000});receipt.fallbackMessage=await status.innerText();
  assert.equal(await renderer.inputValue(),'gpu','Fallback must preserve requested GPU selection');
  if(exportBefore!==null)assert.equal(await exportControl.inputValue(),exportBefore,'Fallback changed export choice');
  await page.waitForFunction(()=>{const button=document.querySelector<HTMLButtonElement>('[aria-label="Play preview"]');return !!button&&!button.disabled;},undefined,{timeout:30000});
  receipt.checks.explicitStandardFallback=true;receipt.checks.fallbackReadinessReleased=true;
  // Reselect using the visible settings, without reloading or touching the edit.
  await renderer.selectOption('standard');await renderer.selectOption('gpu');
  await page.locator('[data-gpu-preview][data-gpu-compositor="canvaskit"]').waitFor({timeout:30000});
  await seek(30);assert.equal(hash(await png()),hash(live),'Recovered CanvasKit did not restore the complete live picture');
  assert.equal(await renderer.inputValue(),'gpu');if(exportBefore!==null)assert.equal(await exportControl.inputValue(),exportBefore);
  assert.equal(await status.count(),0,'Recovered preview retained a stale fallback error');
  receipt.checks.contextLossRecovery=true;receipt.checks.exportChoicePreserved=true;
  assert.deepEqual(fs.readFileSync(timelinePath),before,'Working timeline changed during proposal review');
  const record=await json(`/api/projects/${id}/timeline/proposals/${created.proposal_id}`);assert.equal(record.status,'pending');
  receipt.checks.timelinePreserved=true;receipt.checks.pendingProposal=true;receipt.browser=browser.version();receipt.compositorEngine='canvaskit';assert.deepEqual(receipt.errors,[]);receipt.passed=true;phase('complete');
 }catch(error){receipt.failure=String(error);throw error;}finally{receipt.finalTimelineHash=hash(fs.readFileSync(timelinePath));save();await browser.close();await server.kill();}
 console.log(JSON.stringify({passed:receipt.passed,output,checks:receipt.checks}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().catch(error=>{console.error(error);process.exitCode=1;});
