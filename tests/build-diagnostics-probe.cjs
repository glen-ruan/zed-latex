'use strict';
const assert=require('node:assert/strict'),core=require('../server/core.cjs'),{BuildDiagnostics}=require('../server/build-diagnostics.cjs');
const a='fixture/a.tex',b='fixture/b.tex',shared='fixture/shared.tex',old='fixture/removed.tex',issue={source:'latex-workshop',message:'Shared error',severity:1,range:{start:{line:2,character:1},end:{line:2,character:3}}};
const store=new BuildDiagnostics();store.replace(a,new Map([[shared,[issue]],[old,[{...issue,message:'Old dependency'}]]]));store.replace(b,new Map([[shared,[issue,{...issue,message:'B-only warning',severity:2}]]]));
assert(store.hasErrors(a));assert(store.hasErrors(b));assert.equal(store.merged().get(core.key(shared)).length,2);assert.equal(store.merged().get(core.key(shared))[0].relatedInformation.length,2);
store.replace(a,new Map());assert(!store.hasErrors(a));assert(store.hasErrors(b));assert(!store.merged().has(core.key(old)));assert.equal(store.merged().get(core.key(shared))[0].relatedInformation.length,1);
store.add(a,a,{...issue,message:'A tool failed'});assert.equal(store.merged().get(core.key(a))[0].message,'A tool failed');store.replace(b,new Map());assert(store.hasErrors(a));assert(!store.merged().has(core.key(shared)));assert(!store.hasErrors(b));store.replace(a,new Map());assert.equal(store.merged().size,0);
assert.equal(issue.relatedInformation,undefined,'Aggregation mutated parser diagnostics');
console.log('PASS build diagnostic ownership: shared roots, duplicate merging, stale dependencies, root-specific fallback and independent cleanup');
