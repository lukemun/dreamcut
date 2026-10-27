import assert from "node:assert/strict";
import test from "node:test";

import { absolutizeMediaUrls } from "@/lib/render/pipeline";

test("render media resolution includes nested image-fill caption sources", () => {
  const [element] = absolutizeMediaUrls([{
    source_url: null,
    props: {
      mediaFillUrls: [
        "/api/projects/proof/media/page-01.png",
        "https://cdn.example.com/page-02.png",
      ],
      mediaFillVideoUrl: "/api/projects/proof/media/sky.mp4",
      mediaFillVideoPreviewUrl: "/api/projects/proof/media/sky-preview.mp4",
      text_mask_url: "/api/projects/proof/media/title-mask.png",
    },
  }], "http://127.0.0.1:3123/");

  assert.deepEqual(element?.props?.mediaFillUrls, [
    "http://127.0.0.1:3123/api/projects/proof/media/page-01.png",
    "https://cdn.example.com/page-02.png",
  ]);
  assert.equal(element?.props?.mediaFillVideoUrl, "http://127.0.0.1:3123/api/projects/proof/media/sky.mp4");
  assert.equal(element?.props?.mediaFillVideoPreviewUrl, "http://127.0.0.1:3123/api/projects/proof/media/sky-preview.mp4");
  assert.equal(
    element?.props?.text_mask_url,
    "http://127.0.0.1:3123/api/projects/proof/media/title-mask.png",
  );
});
