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
 assert.equal(result.length,promotedRecipes.length+1);assert.ok(result.includes(unrelated));assert.equal(original.length,4);
});
test('a promoted template keeps the creator\'s own reference video when the profile has it',()=>{
 const speed=promotedRecipes.find(r=>r.promotedFrom==='user-speed-entrance-exit')!;
 const own={...speed,id:'user-speed-entrance-exit',origin:'user' as const,promotedFrom:undefined,exampleKind:'reference' as const,
  video:'/api/guide/user-effects/speed-entrance-exit/media?v=abc',tutorialVideo:'/api/guide/user-effects/speed-entrance-exit/media?full=1',credit:'Reference creator'};
 const shown=withoutPromotedCopies([own,speed]);
 assert.equal(shown.length,1);
 assert.equal(shown[0].id,speed.id);
 assert.equal(shown[0].video,own.video);assert.equal(shown[0].tutorialVideo,own.tutorialVideo);assert.equal(shown[0].referenceCredit,'Reference creator');
 // The creator's own result and supplied footage come along too.
 const withResult=withoutPromotedCopies([{...own,ownResultVideo:'/api/guide/user-effects/speed-entrance-exit/media?result=1',suppliedVideos:[{video:'/api/guide/user-effects/speed-entrance-exit/media?supplied=0',label:'Your take'}]},speed]);
 assert.equal(withResult[0].ownResultVideo,'/api/guide/user-effects/speed-entrance-exit/media?result=1');
 assert.deepEqual(withResult[0].suppliedVideos,[{video:'/api/guide/user-effects/speed-entrance-exit/media?supplied=0',label:'Your take'}]);
 assert.equal(shown[0].ownResultVideo,undefined);
 assert.equal(shown[0].fromYours,true,'the creator made it, so it lists under Yours');
 assert.equal(withoutPromotedCopies([speed])[0].fromYours,undefined);
 // Without the creator's copy the shared card stays brief-only.
 assert.equal(withoutPromotedCopies([speed])[0].video,undefined);
});
