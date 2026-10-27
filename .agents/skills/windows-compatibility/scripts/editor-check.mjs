// Use the Windows editor as a person would, in the VM's Chrome driven from this Mac over the DevTools
// protocol: create a project, import two clips, add them to the timeline, play the preview, export, and
// inspect the MP4 inside the VM. Run open-editor.sh first and pass the link it printed.
//   node editor-check.mjs '<sign-in link>'
// Uses the same settings as vm.sh; DREAMCUT_VM_CDP_PORT as in open-editor.sh. Writes one project into the
// VM's DreamCut projects; nothing on this Mac changes.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const link = process.argv[2];
if (!/^http:\/\/127\.0\.0\.1:\d+\/__dreamcut\/session\?code=/.test(link ?? '')) throw new Error('Pass the sign-in link open-editor.sh printed.');
const origin = new URL(link).origin;
const here = path.dirname(fileURLToPath(import.meta.url));
const vm = command => execFileSync(path.join(here, 'vm.sh'), [command], { encoding: 'utf8' });
const results = [];
const check = (ok, name, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); return ok; };
const note = text => console.log(`NOTE ${text}`);

// Two generated clips: a portrait clip with a tone (the export must carry its sound) and a shorter
// landscape clip without sound. Generated, so the check needs no private or licensed media.
const fixtures = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamcut-windows-check-'));
const clips = [
  { name: 'portrait-tone.mp4', args: ['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:a', 'aac', '-shortest'] },
  { name: 'landscape-silent.mp4', args: ['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=3'] },
];
for (const clip of clips) execFileSync('ffmpeg', ['-v', 'error', '-y', ...clip.args, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(fixtures, clip.name)]);

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.DREAMCUT_VM_CDP_PORT ?? 9229}`);
const page = browser.contexts()[0].pages()[0] ?? await browser.contexts()[0].newPage();
// A hidden or covered window gets no animation frames and every click waits forever.
await page.bringToFront();
const failures = [];
page.on('response', response => { if (response.status() >= 400 && !/agent-chat/.test(response.url())) failures.push(`${response.status()} ${response.request().method()} ${response.url().replace(origin, '')}`); });
const until = async (test, ms, step = 1000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await test()) return true; await page.waitForTimeout(step); } return false; };
const notFound = () => page.getByText('This page could not be found').count().then(count => count > 0);
let projectId = null;

try {
  await page.goto(link);
  check(await until(() => page.getByRole('link', { name: 'Projects' }).first().isVisible(), 30_000), 'the sign-in link opens the dashboard');

  // Earlier runs may have saved a renderer choice in this Chrome profile; start from the default.
  await page.evaluate(() => localStorage.removeItem('dreamcut.renderer'));
  // New project lives on the Projects page; the dashboard opens with the chat box.
  await page.goto(`${origin}/?view=projects`);
  await until(() => page.getByRole('button', { name: 'New project' }).first().isVisible(), 30_000);

  const title = `windows-check-${Date.now().toString(36)}`;
  await page.getByRole('button', { name: 'New project' }).first().click();
  const create = page.locator('[role=dialog]');
  await create.getByLabel('Project name').fill(title);
  await create.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/p\/[^/]+$/, { timeout: 30_000 });
  projectId = new URL(page.url()).pathname.split('/')[2];
  const opened = await until(async () => !(await notFound()) && await page.getByRole('button', { name: 'Open Library' }).isVisible(), 20_000);
  if (!check(opened, 'a new project opens in the editor', opened ? projectId : 'the page was not found until reloaded')) await page.reload();

  await page.goto(`${origin}/p/${projectId}/library`);
  await page.getByText('Video', { exact: true }).first().click();
  // The upload starts on selection; the input may detach as the page re-renders, so a timeout here is not a failure.
  await page.locator('input[type=file]').first().setInputFiles(clips.map(clip => path.join(fixtures, clip.name)), { timeout: 15_000 }).catch(() => {});
  const imported = await until(async () => /Video\s*2\b/.test(await page.locator('body').innerText()), 300_000, 5000);
  check(imported, 'two clips import and prepare through the Library page');

  await page.goto(`${origin}/p/${projectId}`);
  await page.getByRole('button', { name: 'Open Library' }).click();
  const adds = page.getByRole('button', { name: /^Add .+ to timeline$/ });
  await until(async () => (await adds.count()) >= 2, 20_000);
  let placed = 0;
  for (let index = 0; index < 2; index += 1) {
    const response = page.waitForResponse(r => r.url().endsWith('/timeline/elements') && r.request().method() === 'POST', { timeout: 20_000 }).catch(() => null);
    await adds.nth(index).click();
    const result = await response;
    if (result?.ok()) placed += 1; else note(`adding clip ${index + 1}: ${result ? `${result.status()} ${(await result.text()).slice(0, 200)}` : 'no request'}`);
    await page.waitForTimeout(1500);
  }
  check(placed === 2, 'both clips are added to the timeline', `${placed}/2`);
  await page.getByRole('button', { name: 'Close Library drawer' }).click().catch(() => {});
  check(await until(() => page.locator('[data-preview-proxy-blocked="true"]').count().then(count => count === 0), 15_000),
    'added clips preview without reloading the page');

  await page.getByRole('button', { name: 'Play preview' }).click();
  await page.waitForTimeout(2500);
  // The Browser renderer plays the prepared clips in <video> elements; the Graphics card renderer reports the frames it showed.
  const playing = await page.evaluate(() => [...document.querySelectorAll('video')].filter(v => v.currentSrc.includes('/.prepared/')).map(v => v.currentTime));
  const gpu = await page.evaluate(() => { const metrics = JSON.parse(document.querySelector('canvas[data-gpu-playback-metrics]')?.dataset.gpuPlaybackMetrics ?? 'null'); return metrics && { shown: metrics.presentations, late: metrics.latePresentations, maxGapMs: Math.round(metrics.maxGapMs) }; });
  await page.getByRole('button', { name: /Pause preview|Play preview/ }).click().catch(() => {});
  check(playing.some(time => time > 1) || (gpu?.shown ?? 0) >= 30, 'the preview plays the prepared clips',
    gpu ? `Graphics card renderer: ${gpu.shown} frames shown in 2.5 s, ${gpu.late} late, longest gap ${gpu.maxGapMs} ms` : playing.map(t => t.toFixed(1)).join(', ') || 'no prepared video');

  // This VM has only Microsoft's basic display driver: the Graphics card renderer draws in software, at half
  // size, and export needs no manual renderer choice.
  await page.getByRole('button', { name: 'Preview settings' }).click();
  const settings = (await page.locator('.preview-settings').innerText()).replace(/\s+/g, ' ');
  check(!/Export blocked|unavailable/.test(settings), 'preview and export work without a graphics card', settings.slice(0, 200));
  await page.keyboard.press('Escape');
  await page.locator('button[title="Export video"]').click();
  const dialog = page.locator('[role=dialog]');
  await dialog.locator('button').filter({ hasText: /^Export$/ }).click();
  const heading = page.locator('#timeline-export-title');
  await until(async () => /complete|failed/i.test(await heading.innerText().catch(() => '')), 900_000, 5000);
  const outcome = await heading.innerText().catch(() => 'no export dialog');
  check(/complete/i.test(outcome), 'the export finishes', /complete/i.test(outcome) ? '' : (await dialog.innerText().catch(() => outcome)).replace(/\s+/g, ' ').slice(-300));

  if (/complete/i.test(outcome)) {
    const probe = JSON.parse(vm(`$f = Get-ChildItem "$env:LOCALAPPDATA\\DreamCut\\projects\\${projectId}\\renders" -Recurse -Filter *.mp4 | Sort-Object LastWriteTime | Select-Object -Last 1; ffprobe -v error -show_entries format=duration:stream=codec_type,width,height -of json $f.FullName`));
    const video = probe.streams.find(s => s.codec_type === 'video'), audio = probe.streams.find(s => s.codec_type === 'audio');
    const duration = Number(probe.format.duration);
    check(Boolean(video && audio) && Math.abs(duration - 4) < 0.25, 'the MP4 has picture, sound and the timeline\'s length',
      `${video?.width}x${video?.height}, ${audio ? 'sound' : 'no sound'}, ${duration.toFixed(2)} s`);
  }
} catch (error) {
  check(false, 'the check ran to the end', error.message.split('\n')[0]);
} finally {
  if (failures.length) note(`failed requests:\n  ${[...new Set(failures)].join('\n  ')}`);
  if (projectId) note(`project ${projectId} is left in the VM for inspection`);
  fs.rmSync(fixtures, { recursive: true, force: true });
  await browser.close().catch(() => {});
}
console.log(`${results.filter(Boolean).length}/${results.length} checks passed.`);
process.exit(results.every(Boolean) ? 0 : 1);
