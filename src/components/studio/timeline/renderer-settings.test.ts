import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PreviewPlaybackSettings,rendererOptions} from './PreviewPlaybackSettings';
const props={projectId:'fixture',nativeAvailable:true,renderer:'gpu' as const,preparation:'gpu' as const,onRendererChange:()=>{},onPreparationChange:()=>{},reason:null};
test('settings expose one renderer for both preview and export',()=>{
 const html=renderToStaticMarkup(React.createElement(PreviewPlaybackSettings,props));
 assert.match(html,/Renderer for preview/);assert.doesNotMatch(html,/Export engine|Preview renderer/);
 assert.match(html,/Graphics card · fastest/);assert.match(html,/Playback quality/);assert.doesNotMatch(html,/Proxy|Browser GPU|Preparation: automatic/);
});
test('migration and fallback explain why exporting is blocked',()=>{
 const migration=renderToStaticMarkup(React.createElement(PreviewPlaybackSettings,{...props,needsConfirmation:true}));
 assert.match(migration,/Choose a renderer before exporting/);
 const failure=renderToStaticMarkup(React.createElement(PreviewPlaybackSettings,{...props,reason:'GPU device unavailable'}));
 assert.match(failure,/Export blocked/);
});
test('the renderer is its own section, not under Advanced, with Rust listed first',()=>{
 const html=renderToStaticMarkup(React.createElement(PreviewPlaybackSettings,{...props,preparation:'prepared' as const,renderer:'standard' as const}));
 const advanced=html.indexOf('<details');
 assert.ok(advanced>html.indexOf('Renderer for preview'),'Advanced comes after the renderer');
 assert.deepEqual(rendererOptions(true).map(option=>option.label),['Rust · experimental','Graphics card · fastest','Browser · works everywhere']);
 assert.ok(!rendererOptions(false).some(option=>option.value==='rust'));
});
