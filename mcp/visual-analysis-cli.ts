import {prepareVisualAnalysis,getVisualAnalysis,executeVisualAnalysis} from '../src/lib/agent/visual-analysis';
async function main(){
const [action,project,id]=process.argv.slice(2);
try{
 if(action==='work')await executeVisualAnalysis(project,id);
 else if(action==='status')console.log(JSON.stringify({result:await getVisualAnalysis(project,id)}));
 else if(action==='prepare'){
  const chunks:Buffer[]=[];let size=0;
  for await(const chunk of process.stdin){size+=chunk.length;if(size>16384)throw Error('Analysis request exceeds byte limit');chunks.push(chunk);}
  console.log(JSON.stringify({result:await prepareVisualAnalysis(project,JSON.parse(Buffer.concat(chunks).toString('utf8')))}));
 }else throw Error('Unknown visual analysis action');
}catch(error){console.log(JSON.stringify({error:error instanceof Error?error.message:'Analysis failed',toolError:(error as {toolError?:unknown}).toolError}));process.exitCode=1;}

}
void main();
