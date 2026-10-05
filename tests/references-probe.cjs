'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('../server/core.cjs'),ref=require('../server/references.cjs');
fs.mkdirSync('.dev',{recursive:true});const root=fs.mkdtempSync(path.resolve('.dev/references '));
const main=path.join(root,'main.tex'),chapter=path.join(root,'chapter.tex'),bib=path.join(root,'refs.bib');
fs.writeFileSync(main,String.raw`\label{sec:a} \ref{sec:a} \cite[page 2]{paper, other} \nocite{*}
% \ref{sec:a}
\verb|\ref{sec:a}|`);
fs.writeFileSync(chapter,String.raw`\cref{sec:a,sec:b} \begin{verbatim}\ref{sec:a}\end{verbatim}`);
fs.writeFileSync(bib,'@comment{ @article{fake, title={hidden}} }\n@article{paper, title={Text}, crossref={parent}}\n@book{parent, title={Book}}');
const files=[main,chapter,bib],items=ref.occurrences(files);assert.equal(items.filter(x=>x.name==='sec:a').length,3);assert(!items.some(x=>x.name==='fake'||x.name==='*'));
const label=items.find(x=>x.name==='sec:a');const edits=ref.rename(items,label,'sec:new');assert.equal(Object.values(edits.changes).flat().length,3);assert.throws(()=>ref.rename(items,label,'sec:b'),/already used/);assert.throws(()=>ref.rename(items,label,'bad,key'),/invalid/);
const cite=items.find(x=>x.name==='paper');assert.equal(Object.values(ref.rename(items,cite,'new-paper').changes).flat().length,2);
assert.equal(items.filter(x=>x.name==='parent').length,2);
fs.writeFileSync(bib,'@article(paper, title={text ) crossref={fake}}, note="crossref={also-fake}", crossref={parent})\n@book{parent,title={Book}}\n% @book{commented,title={Hidden}}');
const nested=ref.occurrences(files);assert.equal(nested.filter(x=>x.name==='parent').length,2);assert(!nested.some(x=>['fake','also-fake','commented'].includes(x.name)));

const docs=new Map([[core.key(chapter),{text:String.raw`\ref{sec:a}\ref{sec:a}`}]]);assert.equal(ref.occurrences(files,docs).filter(x=>x.name==='sec:a').length,4);
fs.writeFileSync(chapter,String.raw`\label{sec:a}`);assert.throws(()=>ref.rename(ref.occurrences(files),label,'sec:new'),/exactly one/);
fs.rmSync(root,{recursive:true,force:true});
console.log('PASS references: cross-file labels/citations, comments, verbatim, duplicate definitions, collisions and unsaved buffers');
