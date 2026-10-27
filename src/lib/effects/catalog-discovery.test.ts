import test from 'node:test';
import assert from 'node:assert/strict';
import type {GuideEffect} from './guide';
import {isCatalogEntry,CATALOG_CATEGORIES,catalogLabel,catalogType,catalogSource,matchesCatalog} from './catalog-discovery';
const effect:GuideEffect={skill:'motion-graphics',title:'Bloom',description:'Flowing ribbons',prompt:'',inputs:[],kind:'look',family:{id:'poster',title:'Poster',variant:'Bloom'}};
test('one search spans kind and family metadata without requiring a category first',()=>{
 assert.equal(matchesCatalog(effect,{type:'All',family:'All',query:'  POSTER '}),true);
 assert.equal(matchesCatalog(effect,{type:'Look',family:'Poster',query:'ribbons'}),true);
 assert.equal(matchesCatalog(effect,{type:'Effect',family:'Poster',query:''}),false);
 assert.equal(matchesCatalog(effect,{type:'All',family:'Print',query:''}),false);
});
test('source filters keep community results distinct from built-in and personal items',()=>{
 assert.equal(catalogSource(effect),'shared');
 assert.equal(catalogSource({...effect,origin:'user'}),'user');
 assert.equal(catalogSource({...effect,source:'community',origin:'shared'}),'community');
});
test('looks, generated compositions and clip effects retain distinct metadata',()=>{
 assert.equal(catalogType(effect),'Look');
 assert.equal(catalogType({...effect,kind:undefined,brings:{step:'Your words',request:'make a title'}}),'Template');
 assert.equal(catalogType({...effect,kind:undefined,id:'FX-WORD-SEARCH-TRACE'}),'Effect');
 assert.equal(catalogType({...effect,kind:undefined,skill:'mask-glitch'}),'Effect');
});

test('catalog labels distinguish graphic creation from footage effects and remain searchable',()=>{
 const graphic={...effect,kind:undefined,brings:{step:'Your words',request:'make a title'}};
 assert.equal(catalogLabel(effect),'Look');
 assert.equal(catalogLabel(graphic),'Motion graphic');
 assert.equal(catalogLabel({...effect,kind:undefined}),'Effect');
 assert.equal(matchesCatalog(graphic,{type:'Template',family:'All',query:'motion graphic'}),true);
});

test('visible catalog offers only looks and effects, excluding graphic builders',()=>{
 assert.deepEqual(CATALOG_CATEGORIES.map(item=>item.value),['All','Look','Effect']);
 assert.equal(isCatalogEntry(effect),true);
 assert.equal(isCatalogEntry({...effect,kind:undefined,skill:'mask-glitch'}),true);
 assert.equal(isCatalogEntry({...effect,kind:undefined,brings:{step:'Your words',request:'make a chart'}}),false);
 assert.equal(isCatalogEntry({...effect,kind:undefined,id:'FX-WORD-SEARCH-TRACE'}),true);
});
