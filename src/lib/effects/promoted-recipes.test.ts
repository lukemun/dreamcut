import test from 'node:test';
import assert from 'node:assert/strict';
import {promotedRecipes, withoutPromotedCopies, recipeStatusLabel} from './promoted-recipes';
import {effectRecipeRequest} from './agent-request';
import {creatorGuideFor} from './creator-guides';
test('promoted workflows work without demonstrations or private source paths',()=>{
 assert.ok(promotedRecipes.length>=3);
 for(const recipe of promotedRecipes){
  assert.equal(recipe.origin,'shared'); assert.equal(recipe.video,undefined); assert.equal(recipe.status,undefined);
  assert.ok(creatorGuideFor(recipe)); assert.match(recipeStatusLabel(recipe),/Implemented/);
  assert.doesNotMatch(JSON.stringify(recipe),/\/Users\/|\/projects\/|user-effects\//);
  assert.match(effectRecipeRequest(recipe),/promoted-recipes.ts/);
  assert.doesNotMatch(effectRecipeRequest(recipe),/catalog.json entry/);
  assert.ok(recipe.limitations?.length);
 }
});
test('promotion replaces only the matching private discovery cards',()=>{
 const original=promotedRecipes.filter(r=>r.promotedFrom).map(r=>({...r,id:r.promotedFrom,origin:'user' as const}));
 const unrelated={...original[0],id:'user-unbuilt-reference'};
 const result=withoutPromotedCopies([...original,unrelated,...promotedRecipes]);
 assert.equal(result.length,promotedRecipes.length+1);assert.ok(result.includes(unrelated));assert.equal(original.length,3);
});
