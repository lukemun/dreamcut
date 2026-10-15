/** Test instruments use exactly the browser renderer that ships with DreamCut. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { chromium } from "playwright-core";
import { renderBrowserStill, renderBrowserVideo } from "./browser-renderer";
type Spec = { id: string; width: number; height: number; fps: number; durationInFrames: number; defaultProps?: Record<string, any> };
const baseUrl = () => process.env.TIMELINE_EDITOR_BASE_URL || "http://127.0.0.1:3123";
export async function prepareFixture(_options: {entryPoint: string; [key: string]: unknown}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-fixture-"));
  fs.writeFileSync(path.join(directory, "server.json"), JSON.stringify({baseUrl: baseUrl()}));
  return directory;
}
function server(serveUrl: string) { return JSON.parse(fs.readFileSync(path.join(serveUrl,"server.json"),"utf8")).baseUrl as string; }
export async function selectFixture(options: { serveUrl: string; id: string; [key: string]: any }): Promise<Spec> {
  if (options.id === "TimelineComposition") return {id: options.id,width:1920,height:1080,fps:30,durationInFrames:900};
  const browser = await chromium.launch({channel:"chrome",headless:true});
  try {
    const page = await browser.newPage();
    await page.goto(`${server(options.serveUrl)}/render-frame`,{waitUntil:"networkidle"});
    await page.waitForFunction(()=>Boolean(window.__dreamcutRender));
    const fixtures = await page.evaluate(()=>window.__dreamcutRender!.fixtures());
    const selected = fixtures.find(f=>f.id===options.id);
    if (!selected) throw new Error(`Unknown fixture ${options.id}`);
    return selected;
  } finally { await browser.close(); }
}
export async function renderFixtureStill(options: { composition: Spec; serveUrl: string; output: string; inputProps?: Record<string, any>; frame?: number; imageFormat?: "png" | "jpeg"; jpegQuality?: number; [key: string]: any }) {
  const {composition: c} = options;
  await renderBrowserStill({baseUrl:server(options.serveUrl),output:options.output,...c, fixtureId:c.id==="TimelineComposition"?undefined:c.id, frame:options.frame??0, inputProps:options.inputProps??c.defaultProps??{},transparent:true,imageFormat:options.imageFormat,jpegQuality:options.jpegQuality});
}
export async function renderFixtureVideo(options: { composition: Spec; serveUrl: string; outputLocation: string; inputProps?: Record<string, any>; [key: string]: any }) {
  const {composition: c} = options;
  await renderBrowserVideo({baseUrl:server(options.serveUrl), outputLocation:options.outputLocation,...c,fixtureId:c.id==="TimelineComposition"?undefined:c.id,inputProps:options.inputProps??c.defaultProps??{},concurrency:options.concurrency,frameRange:options.frameRange,crf:options.crf,imageFormat:options.imageFormat});
}
