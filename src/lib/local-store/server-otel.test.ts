import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
test("server owns collector startup/shutdown, propagates endpoint, and survives missing collector", async () => {
  const probe = net.createServer();
  await new Promise<void>((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const port = (probe.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "server-otel-test-"));
  const binary = path.join(root, "collector");
  const stopped = path.join(root, "stopped");
  fs.writeFileSync(binary, `#!${process.execPath}\nconst fs=require('fs');const server=require('http').createServer((req,res)=>{req.resume();res.end('{}')}).listen(${port},'127.0.0.1');process.on('SIGTERM',()=>{fs.writeFileSync(${JSON.stringify(stopped)},'stopped');server.close()});`, { mode: 0o700 });
  function launch(executable: string, serverCode: string) {
    const script = `require('./src/lib/observability/server-otel.ts').runServerWithOtel(process.execPath, ['-e', ${JSON.stringify(serverCode)}], {binary:${JSON.stringify(executable)},config:'unused',port:${port}}).then(code=>process.exitCode=code).catch(e=>{console.error(e);process.exitCode=1});`;
    const child = spawn(process.execPath, ["--import", "tsx", "-e", script], { env: { ...process.env, DREAMCUT_OTEL_AUTOSTART: "1", DREAMCUT_CODEX_OTEL_ENDPOINT: "", DREAMCUT_OTELCOL_EXECUTABLE: executable, DREAMCUT_OTEL_DIR: root }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", data => { output += data; }); child.stderr.on("data", data => { output += data; });
    const done = once(child, "exit");
    return { child, done, output: () => output };
  }
  const children: ReturnType<typeof launch>[] = [];
  try {
    const normal = launch(binary, `if(process.env.DREAMCUT_CODEX_OTEL_ENDPOINT !== 'http://127.0.0.1:${port}/v1/logs') process.exit(9); process.exit(7)`); children.push(normal);
    assert.equal((await normal.done)[0], 7, normal.output());
    assert.ok(fs.existsSync(stopped));
    fs.unlinkSync(stopped);
    const signal = launch(binary, "console.log('SERVER_READY');setInterval(()=>{},1000)"); children.push(signal);
    for (let i=0;i<100 && !signal.output().includes('SERVER_READY');i++) await delay(100);
    assert.ok(signal.output().includes('SERVER_READY'), signal.output());
    signal.child.kill('SIGTERM');
    assert.equal((await signal.done)[0], 143, signal.output());
    assert.ok(fs.existsSync(stopped));
    const missing = launch(path.join(root, 'missing'), "if(process.env.DREAMCUT_CODEX_OTEL_ENDPOINT) process.exit(9)"); children.push(missing);
    assert.equal((await missing.done)[0], 0, missing.output());
    assert.match(missing.output(), /monitoring unavailable/);
    await new Promise<void>(resolve => probe.listen(port, "127.0.0.1", resolve));
    const occupied = launch(binary, "if(process.env.DREAMCUT_CODEX_OTEL_ENDPOINT) process.exit(9)"); children.push(occupied);
    assert.equal((await occupied.done)[0], 0, occupied.output());
    assert.match(occupied.output(), /already in use/);
    assert.ok(probe.listening, "An existing listener must not be stopped");

  } finally {
    if (probe.listening) await new Promise<void>(resolve => probe.close(() => resolve()));
    for (const {child} of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    fs.rmSync(root, {recursive:true,force:true});
  }
});
