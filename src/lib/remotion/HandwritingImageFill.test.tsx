import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup as renderMarkup } from 'react-dom/server';
import { FrameContext, FrameSession } from '../frame-runtime';
import '../timeline/handwriting-packs-sync';
import { PermanentMarkerText } from './PermanentMarkerText';
import { HandwritingImageFill } from './HandwritingImageFill';
const renderToStaticMarkup = (node: React.ReactNode) => renderMarkup(<FrameContext.Provider value={{ frame: 0, fps: 30, width: 1080, height: 1920, durationInFrames: 300, rendering: false, playing: false, muted: true, volume: 1, playbackRate: 1, session: new FrameSession() }}>{node}</FrameContext.Provider>);

test('moving handwriting fill keeps video outside SVG and embeds every completed glyph in its mask', () => {
  const html = renderToStaticMarkup(<PermanentMarkerText text="BEG → BUD" progress={1} fontSize={94} maxWidth={900} singleLine align="center" color="white"
    imageFill={{ videoUrl: '/original.mp4',  urls: [], localSeconds: 1.2, secondsPerImage: 1, crossfadeSeconds: 0, scale: 1, panPercent: 0 }} />);
  assert.ok(html.includes('data-handwriting-image-fill="true"'));
  assert.ok(html.includes('aria-label="BEG → BUD"'));
  assert.ok(!html.includes('<foreignObject'), 'video must not be composited inside SVG');
  const encoded = html.match(/data:image\/svg\+xml,([^&]*?)&quot;/)?.[1];
  assert.ok(encoded, 'mask must be self-contained');
  const mask = decodeURIComponent(encoded);
  assert.equal((mask.match(/<mask /g) ?? []).length, 6, 'all six route letters retain their pen masks');
  assert.ok(mask.includes('→'), 'the arrow stays in the same mask');
  assert.ok(mask.includes('stroke-dashoffset="0"'), 'completed strokes stay visible');
});

test('partial write-on clips inside glyph alpha, never the HTML video layer', () => {
  const fill = { urls: ['/sky.png'], localSeconds: 0, secondsPerImage: 1, crossfadeSeconds: 0, scale: 1, panPercent: 0, revealProgress: .25 };
  const render = (progress: number) => renderToStaticMarkup(<HandwritingImageFill fill={{ ...fill, revealProgress: progress }} width={200} height={100} displayWidth={200} displayHeight={100} label="arrow"><path d="M10 50H190" stroke="white" strokeWidth="10"/></HandwritingImageFill>);
  const html = render(.25);
  const mask = decodeURIComponent(html.match(/data:image\/svg\+xml,([^&]*?)&quot;/)![1]);
  assert.ok(mask.includes('<rect width="50" height="100"'));
  assert.ok(mask.includes('clip-path="url(#ink-reveal)"'));
  assert.ok(!html.includes('clip-path:inset'), 'no separately composited rectangular edge');
  assert.ok(render(0).includes('opacity:0'));
  const completed = decodeURIComponent(render(1).match(/data:image\/svg\+xml,([^&]*?)&quot;/)![1]);
  assert.ok(!completed.includes('ink-reveal'), 'completed arrow uses only its glyph alpha');
});
