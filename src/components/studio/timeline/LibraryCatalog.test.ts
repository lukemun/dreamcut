import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "src/components/studio/timeline/LibraryCatalog.tsx"), "utf8");
const assetsRouteSource = fs.readFileSync(path.join(process.cwd(), "src/app/api/projects/[projectId]/timeline/assets/route.ts"), "utf8");
const globalsSource = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

test("library uses media tabs instead of one long stacked page", () => {
  assert.match(source, /role="tablist"/);
  // One vocabulary with the editor Library and rail (creator direction 2026-10-12).
  assert.match(source, /id: "stills", label: "Images"/);
  assert.match(source, /id: "videos", label: "Video"/);
  assert.match(source, /id: "music", label: "Music"/);
  assert.match(source, /id: "sfx", label: "Sounds"/);
  assert.match(source, /const SOURCE_LABELS = LIBRARY_BUCKET_LABELS;/);
  assert.match(source, /id: "exports", label: "Exports"/);
  assert.doesNotMatch(source, /Description pending/);
  assert.match(source, /activeTab === "sfx"/);
  assert.match(globalsSource, /\.memory-tabs button\[aria-selected=true\].*background:var\(--chrome-deep\)/);
  assert.match(globalsSource, /box-shadow:inset 0 2px 5px/);
  assert.match(source, /aria-selected=\{activeTab === tab\.id\}/);
});

test("library exposes useful catalog filters and searchable metadata", () => {
  // Filters share the search row as label-free tab selectors.
  assert.match(source, /<FilterButtons inline label="Source"/);
  assert.match(source, /<FilterButtons inline label="Search in"/);
  assert.doesNotMatch(source, /NativeSelect/);
  assert.match(source, /<FilterButtons label="Category"/);
  assert.match(source, /<FilterButtons label="Motion"/);
  assert.match(source, /<FilterButtons label="Mood"/);
  assert.match(source, /<FilterButtons label="Energy"/);
  assert.match(source, /Search sounds or use cases/);
  assert.match(source, /Search music or use cases/);
  assert.match(source, /track\.tags/);
  assert.match(source, /annotationSearchValues/);
  assert.match(source, /annotation\.cultural_context/);
  assert.match(source, /Cultural context &amp; usage/);
});

test("visual library renders researched annotations and playable looping video", () => {
  assert.match(assetsRouteSource, /readVisualCatalog\(\)/);
  assert.match(assetsRouteSource, /catalog_visual_id: asset\.id/);
  assert.match(assetsRouteSource, /readLibraryAnnotations\(projectId\)/);
  assert.match(assetsRouteSource, /library_annotation: libraryAnnotation/);
  assert.match(source, /<AnnotationSummary annotation=\{asset\.library_annotation\}/);
  assert.match(source, /preload="metadata"/);
  assert.match(source, /<MediaGallery/);
  assert.match(source, /data-media-preview/);
  assert.doesNotMatch(source, /aspect-video w-full object-cover/);
  assert.match(source, /aria-label="Video preview size"/);
  assert.doesNotMatch(source, /Videos per row|Reset view/);
  assert.match(source, /onLoadedMetadata/);
});

test("music and sound effects have playable previews", () => {
  assert.match(source, /const togglePreview/);
  assert.match(source, /new Audio\(catalogAudioPreviewUrl\(track\.source_url\)\)/);
  assert.match(source, /renderPreviewButton\(track\)/);
  assert.match(source, /PauseIcon/);
  assert.match(source, /PlayIcon/);
});

test("library hides source compilations and provenance-only SFX tags", () => {
  assert.doesNotMatch(source, /SFX_MAX_LIBRARY_DURATION_SECONDS/);
  // Library SFX are cleared to place, so only music marks reference-only provenance.
  assert.equal(source.match(/Reference · rights unverified/g)?.length, 1);
  assert.doesNotMatch(source.slice(source.indexOf('title="Sounds"')), /rights unverified/);
  assert.match(source, /track\.category !== "collection"/);
  assert.match(source, /sfx_tracks\.filter\(\(track\) => Boolean\(track\.source_url\)\)/);
  assert.match(source, /PROVENANCE_TAG_PATTERN/);
  assert.match(source, /displayTags\(track\.tags\)/);
});

test("asset API lists shared SFX for download and omits personal rows whose audio file is missing", () => {
  assert.doesNotMatch(assetsRouteSource, /effect\.source_status !== "reference_only"/);
  assert.doesNotMatch(assetsRouteSource, /effect\.analysis\?\.audibility_status !== "silent"/);
  assert.doesNotMatch(assetsRouteSource, /effect\.analysis\?\.audibility_status !== "sparse"/);
  assert.doesNotMatch(assetsRouteSource, /effect\.analysis\?\.audibility_status !== "too_quiet"/);
  assert.match(assetsRouteSource, /!effect\.personal \|\| sfxCatalogFileExists\(effect\.file\)/);
  assert.match(assetsRouteSource, /file_available: !effect\.personal \|\| sfxCatalogFileExists\(effect\.file\)/);
  assert.match(assetsRouteSource, /access: effect\.access \?\? "free"/);
});

test("music and sound effects expose waveform scrubbing", () => {
  const waveform = fs.readFileSync(path.join(process.cwd(), "src/components/studio/timeline/WaveformPreview.tsx"), "utf8");
  assert.match(source, /import \{ WaveformPreview \} from "\.\/WaveformPreview"/);
  assert.match(source, /<WaveformPreview/);
  assert.match(waveform, /function WaveformPreview/);
  assert.match(waveform, /decodeAndExtractPeaks/);
  assert.match(waveform, /role="slider"/);
  assert.match(source, /onSeek=/);
});
