import { app } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Protocol-only fixture: no installed account, model call or project access.
const server = `
const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
require('node:readline').createInterface({input:process.stdin}).on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') send({id:message.id,result:{pid:process.pid}});
});
setInterval(()=>{},1000);
`;
void app.whenReady().then(async () => {
const transport = process.env.DREAMCUT_QA_CODEX_HOST_ROOT
  ? pathToFileURL(path.join(process.env.DREAMCUT_QA_CODEX_HOST_ROOT, 'codex-connection.mjs')).href
  : new URL('./codex-connection.mjs', import.meta.url).href;
const { connectCodex } = await import(transport);
const client = await connectCodex(process.execPath, { args: ['-e', server], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
const pid = client.initialized.pid;
process.kill(-pid, 'SIGSTOP');
console.log('DREAMCUT_CODEX_FIXTURE:' + pid);

}).catch(error => { console.error(error.message); app.exit(1); });
