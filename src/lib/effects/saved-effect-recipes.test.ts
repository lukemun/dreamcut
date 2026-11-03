import test from 'node:test';
import assert from 'node:assert/strict';
import {savedEffectRecipe} from './saved-effect-recipes';
import {effectRecipeQuickRequest} from './agent-request';
import {recipeStatusLabel} from './promoted-recipes';
import type {PersonalStyle} from '../local-store/personal-styles';

test('saved bundles enter the recipe catalog without asserting verified recreation or losing pinned identity',()=>{
 const saved:PersonalStyle={schema_version:1,id:'11111111-1111-4111-8111-111111111111',revision:3,name:'Gentle entrance',description:'Saved settings',bundles:[{skill:'motion-graphics',parameters:{duration:0.4}}],authorization:{kind:'explicit_request',instruction:'Save this'},created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',source_edit:{project_id:'private-project',title:'Private source title',timeline_revision:'private-revision'}};
 const original=JSON.stringify(saved), effect=savedEffectRecipe(saved);
 assert.equal(effect.origin,'user');assert.equal(effect.savedRecipe?.revision,3);
 assert.equal(effect.implementation,undefined);assert.equal(effect.status,undefined);
 assert.match(recipeStatusLabel(effect),/adapt/);
 assert.equal(effectRecipeQuickRequest(effect),'Use my "Gentle entrance" template with my footage.');
 assert.doesNotMatch(JSON.stringify(effect),/Private source title|private-project/);
 assert.equal(JSON.stringify(saved),original);
});
