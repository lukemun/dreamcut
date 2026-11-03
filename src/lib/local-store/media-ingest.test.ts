import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { before, after } from "node:test";

import { ingestMediaBuffer, ingestMediaPath, readProjectSourceManifest } from "./media-ingest";
import { listMediaFiles } from "./media";
import { projectMediaDir } from "./paths";
import { createProject } from "./store";

// These tests exercise ingestion/provenance, not detached proxy preparation.
// A worker racing temp-directory cleanup can recreate files during rmSync.
const previousAutostart = process.env.MEDIA_PREPARATION_AUTOSTART;
before(() => { process.env.MEDIA_PREPARATION_AUTOSTART = "0"; });
after(() => {
  if (previousAutostart === undefined) delete process.env.MEDIA_PREPARATION_AUTOSTART;
  else process.env.MEDIA_PREPARATION_AUTOSTART = previousAutostart;
});

test("path imports copy bytes into the project by default and record provenance", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-ingest-copy-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  try {
    const source = path.join(root, "photo.jpg");
    fs.writeFileSync(source, "original bytes");
    createProject("fixture", "web");

    const asset = ingestMediaPath({ projectId: "fixture", sourcePath: source });
    const imported = path.join(projectMediaDir("fixture"), asset.media_path);
    assert.equal(asset.storage_mode, "managed_copy");
    assert.equal(asset.source_path, source);
    assert.equal(fs.readFileSync(imported, "utf8"), "original bytes");
    assert.equal(fs.lstatSync(imported).isSymbolicLink(), false);

    fs.writeFileSync(source, "changed later");
    assert.equal(fs.readFileSync(imported, "utf8"), "original bytes");
    assert.equal(readProjectSourceManifest("fixture").assets.length, 1);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("external references are created only when explicitly requested", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-ingest-reference-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  try {
    const source = path.join(root, "library.mov");
    fs.writeFileSync(source, "external bytes");
    createProject("fixture", "web");

    const asset = ingestMediaPath({
      projectId: "fixture",
      sourcePath: source,
      storageMode: "external_reference",
    });
    const imported = path.join(projectMediaDir("fixture"), asset.media_path);
    assert.equal(asset.storage_mode, "external_reference");
    assert.equal(fs.lstatSync(imported).isSymbolicLink(), true);
    assert.equal(fs.realpathSync(imported), fs.realpathSync(source));
    assert.equal(listMediaFiles("fixture").some((media) => media.relPath === asset.media_path), true);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("browser uploads are managed copies with filename provenance", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-ingest-buffer-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  try {
    createProject("fixture", "web");
    const asset = ingestMediaBuffer({
      projectId: "fixture",
      buffer: Buffer.from("uploaded bytes"),
      originalFilename: "camera photo.png",
    });
    assert.equal(asset.storage_mode, "managed_copy");
    assert.equal(asset.source_path, null);
    assert.equal(asset.media_path, path.join("sources", "camera photo.png"));
    assert.equal(readProjectSourceManifest("fixture").assets[0].asset_id, asset.asset_id);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failed manifest commit leaves no unregistered media copy or external link', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'media-ingest-write-fail-'));
  const previous=process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR=path.join(root,'projects');
  try {
    createProject('fixture','web');
    const source=path.join(root,'original.bin');fs.writeFileSync(source,'preserved bytes');
    const timeline=fs.readFileSync(path.join(root,'projects/fixture/timeline.json'));
    const directory=path.join(projectMediaDir('fixture'),'sources');fs.mkdirSync(directory,{recursive:true});
    const rename=fs.renameSync;
    for(const mode of ['buffer','managed_copy','external_reference'] as const) {
      const fault=t.mock.method(fs,'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
        if(String(to).endsWith('source-manifest.json')) throw Object.assign(Error('manifest write refused'),{code:'EACCES'});
        return rename(from,to);
      });
      try {
        assert.throws(()=>mode==='buffer'
          ? ingestMediaBuffer({projectId:'fixture',buffer:Buffer.from('preserved bytes'),originalFilename:'original.bin'})
          : ingestMediaPath({projectId:'fixture',sourcePath:source,storageMode:mode}), /manifest write refused/);
      } finally {fault.mock.restore();}
      assert.deepEqual(fs.readdirSync(directory),[]);
      assert.equal(fs.readFileSync(source,'utf8'),'preserved bytes');
      assert.deepEqual(fs.readFileSync(path.join(root,'projects/fixture/timeline.json')),timeline);
    }
    const asset=ingestMediaPath({projectId:'fixture',sourcePath:source});
    assert.equal(asset.media_path,path.join('sources','original.bin'));
    assert.equal(readProjectSourceManifest('fixture').assets.length,1);
  } finally {
    if(previous===undefined) delete process.env.TIMELINE_PROJECTS_DIR;else process.env.TIMELINE_PROJECTS_DIR=previous;
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('an error after manifest rename preserves committed media and path retry reuses it', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'media-ingest-late-fail-'));
  const previous=process.env.TIMELINE_PROJECTS_DIR;process.env.TIMELINE_PROJECTS_DIR=path.join(root,'projects');
  try {
    createProject('fixture','web');
    const source=path.join(root,'original.bin');fs.writeFileSync(source,'preserved bytes');
    const sync=fs.fsyncSync;
    const fault=t.mock.method(fs,'fsyncSync',(descriptor:number)=>{
      if(fs.fstatSync(descriptor).isDirectory()) throw Error('directory flush failed after rename');
      return sync(descriptor);
    });
    try {assert.throws(()=>ingestMediaPath({projectId:'fixture',sourcePath:source}),/directory flush failed/);}
    finally{fault.mock.restore();}
    const manifest=readProjectSourceManifest('fixture');assert.equal(manifest.assets.length,1);
    const asset=manifest.assets[0];
    assert.equal(fs.readFileSync(path.join(projectMediaDir('fixture'),asset.media_path),'utf8'),'preserved bytes');
    assert.equal(ingestMediaPath({projectId:'fixture',sourcePath:source}).asset_id,asset.asset_id);
    assert.equal(readProjectSourceManifest('fixture').assets.length,1);
    assert.equal(fs.readFileSync(source,'utf8'),'preserved bytes');
  }finally{
    if(previous===undefined)delete process.env.TIMELINE_PROJECTS_DIR;else process.env.TIMELINE_PROJECTS_DIR=previous;
    fs.rmSync(root,{recursive:true,force:true});
  }
});
