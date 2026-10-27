import assert from "node:assert/strict";
import test from "node:test";
import { deriveUploadAssetType, uploadLibraryMedia } from "./upload-library-media";

test("files without browser MIME metadata still use the approved media extensions", () => {
  assert.equal(deriveUploadAssetType(new File([""], "clip.MOV")), "video_clip");
  assert.equal(deriveUploadAssetType(new File([""], "voice.m4a"), "sfx"), "sfx");
  assert.equal(deriveUploadAssetType(new File([""], "photo.heic")), "still");
  assert.equal(deriveUploadAssetType(new File([""], "unknown.exe")), null);
});

test("import sends bytes immediately, reports transfer progress and handles server failure", async () => {
  const previous = globalThis.XMLHttpRequest;
  let status = 200;
  class RequestStub {
    upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
    responseType = "";
    status = status;
    response = status === 200 ? { asset: { source_url: "/media/clip.mov" }, processing: { status: "queued" } } : { error: "Disk full" };
    onload?: () => void;
    open(method: string, url: string) { assert.equal(method, "POST"); assert.equal(url, "/api/projects/test/uploaded-assets"); }
    headers: Record<string, string> = {};
    setRequestHeader(name: string, value: string) { this.headers[name] = value; }
    send(body: File) {
      // The file itself is the body so the server can stream it to disk, whatever its size.
      assert.ok(body instanceof File);
      assert.equal(this.headers["x-dreamcut-asset-type"], "video_clip");
      assert.equal(decodeURIComponent(this.headers["x-dreamcut-filename"]), body.name);
      this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
      this.onload?.();
    }
  }
  globalThis.XMLHttpRequest = RequestStub as unknown as typeof XMLHttpRequest;
  try {
    const progress: number[] = [];
    const result = await uploadLibraryMedia("test", new File(["video"], "clip one.mov"), "music", value => progress.push(value));
    assert.equal(result.sourceUrl, "/media/clip.mov");
    assert.deepEqual(progress, [50]);
    status = 507;
    await assert.rejects(uploadLibraryMedia("test", new File(["video"], "clip.mov")), /Disk full/);
  } finally { globalThis.XMLHttpRequest = previous; }
});
