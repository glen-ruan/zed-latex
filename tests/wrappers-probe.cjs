'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),core=require('../server/core.cjs'),resolver=require('../server/paths.cjs'),completion=require('../server/completion.cjs'),wrappers=require('../server/wrappers.cjs');
const temp=path.resolve('.dev');fs.mkdirSync(temp,{recursive:true});const dir=fs.mkdtempSync(path.join(temp,'wrapper-probe ')),main=path.join(dir,'main.tex');
function write(name,text=''){const file=path.join(dir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);return file;}
try{
 const cls=write('local.cls',String.raw`\InputIfFileExists{modules.def}{}{}`);
 const module=write('modules.def',String.raw`\newcommand\readrows[2][default]{\CatchFileDef\rows{#2}{}\rows}\newcommand{\theoremwrap}[3][unused]{\newtheorem{#2}[shared]{#3}}\newcommand\notcalled{\readrows{ghost.tex}}`);
 const rows=write('tables/rows.tex',String.raw`\newcommand\rowmarker{yes}`);
 write('ghost.tex');write('replacement.tex');
 const source=String.raw`\readrows{tables/rows.tex}\documentclass{local}\theoremwrap{claim}{Claim}\begin{claim}text\end{claim}`;write('main.tex',source);
 const graph=resolver.graph(main),idx=core.index([...graph.files]);
 assert(graph.files.has(core.key(cls)));assert(graph.files.has(core.key(module)));assert(graph.files.has(core.key(rows)));assert(!graph.files.has(core.key(path.join(dir,'ghost.tex'))));
 assert(idx.commands.has('rowmarker'));assert(idx.environments.has('claim'));const entry=idx.environments.get('claim');assert.equal(entry.file,core.key(main));assert.equal(core.offset(source,entry.range.start),source.indexOf('{claim}')+1);
 assert.match(entry.detail,/theoremwrap.*Claim/);
 const loc=completion.pathDefinition(source,core.position(source,source.indexOf('rows.tex')+3),main,main);assert.equal(core.key(core.file(loc[0].uri)),core.key(rows));
 const partial=String.raw`\readrows[custom]{tables/ro`,context=completion.context(partial,core.position(partial,partial.length),graph.wrappers);assert.equal(context.prefix,'tables/ro');assert.equal(context.command,'CatchFileDef');assert(completion.paths(main,main,context.command,context.prefix,null,context).some(item=>item.label==='tables/rows.tex'));
 const complete=String.raw`\readrows{tables/rows.tex}`,middle=complete.indexOf('rows.tex')+2,edit=completion.context(complete,core.position(complete,middle),graph.wrappers);assert.equal(complete.slice(edit.start,edit.end),'tables/rows.tex');
 assert.equal(wrappers.references(String.raw`% \readrows{ghost.tex}`+'\n'+String.raw`\verb|\readrows{ghost.tex}|`,graph.wrappers).length,0);
 assert.equal(wrappers.references(String.raw`\newcommand\unused{\readrows{ghost.tex}}`,graph.wrappers).length,0);
 assert.equal(wrappers.references(String.raw`\\readrows{ghost.tex}`,graph.wrappers).length,0);
 const docs=new Map([[core.key(module),{text:String.raw`\newcommand\readrows[1]{\CatchFileEdef\rows{#1}{}}\newcommand\theoremwrap[2]{\newtheorem*{#1}{#2}}`}],[core.key(main),{text:String.raw`\documentclass{local}\readrows{replacement.tex}\theoremwrap{statement}{Statement}`}]]);
 const changed=resolver.graph(main,docs);assert(!changed.files.has(core.key(rows)));assert(changed.files.has(core.key(path.join(dir,'replacement.tex'))));const revised=core.index([...changed.files],docs);assert(revised.environments.has('statement'));assert(!revised.environments.has('claim'));
 const models=wrappers.models([...graph.files]);assert.equal(wrappers.references(String.raw`\readrows{\dynamic}`,models).length,1);assert.equal(resolver.resolve(main,main,'CatchFileDef',String.raw`\dynamic`).length,0);
 const modernSource='\\NewDocumentCommand\\entry{s O{default} m}{\\middle{#3}{#2}}\\newcommand\\middle[2]{\\last[#2]{#1}}\\DeclareDocumentCommand\\last{o m}{\\CatchFileDef\\rows{#2}{}}\\NewDocumentCommand\\envEntry{m O{Heading} m}{\\envMiddle{#3}{#1}}\\newcommand\\envMiddle[2]{\\newtheorem{#2}{#1}}\\NewDocumentCommand\\optionalFile{O{none} m}{\\input{#1}}\\NewDocumentCommand\\unsupported{d<> m}{\\input{#2}}\\newcommand\\nested[1]{\\newcommand\\inner{\\input{#1}}}\\newcommand\\cycleA[1]{\\cycleB{#1}}\\newcommand\\cycleB[1]{\\cycleA{#1}\\input{#1}}';
 const modernModels=new Map(wrappers.definitions(modernSource).map(item=>[item.name,item]));
 const use='\\entry*[custom]{tables/rows.tex}',refs=wrappers.references(use,modernModels);assert.equal(refs.length,1);assert.equal(refs[0].argument.value,'tables/rows.tex');assert.equal(refs[0].command,'CatchFileDef');
 assert.equal(wrappers.references('\\entry{tables/rows.tex}',modernModels)[0].argument.value,'tables/rows.tex');
 const p='\\entry*[custom]{tables/ro',modernContext=completion.context(p,core.position(p,p.length),modernModels);assert.equal(modernContext.prefix,'tables/ro');
 const opt='\\optionalFile[tables/rows.tex]{unused}',optEnd=opt.indexOf('rows.tex')+3,optContext=completion.context(opt,core.position(opt,optEnd),modernModels);assert.equal(opt.slice(optContext.start,optContext.end),'tables/rows.tex');
 const envs=wrappers.environments('\\envEntry{modernenv}{Title}',modernModels);assert.equal(envs[0].name,'modernenv');assert.equal(envs[0].heading,'Title');
 assert.equal(wrappers.references('\\unsupported<value>{ghost.tex}',modernModels).length,0);assert.equal(wrappers.references('\\nested{ghost.tex}',modernModels).length,0);
 assert.equal(wrappers.references('\\cycleA{tables/rows.tex}',modernModels).length,1);
 const forwarded='\\NewDocumentCommand\\outer{s O{default} m}{\\middle[#2]{#3}}\\NewDocumentCommand\\middle{O{default} m}{\\CatchFileDef\\rows{#2}{}}';
 write('modules.def',forwarded);write('main.tex','\\documentclass{local}\\outer*[note]{tables/rows.tex}');const multi=resolver.graph(main);assert(multi.files.has(core.key(rows)));assert.equal(core.key(core.rootFile(rows,[dir])),core.key(main));
 const redefined=new Map([[core.key(module),{text:forwarded+'\\RenewDocumentCommand\\middle{m}{#1}'}]]);assert(!resolver.graph(main,redefined).files.has(core.key(rows)));
 console.log('PASS wrappers: modern/legacy argument mapping, star/default/optional completion, multi-hop forwarding, cycle limits, redefinition invalidation, generated environments and source exclusions');
}finally{assert(path.resolve(dir).startsWith(temp+path.sep));fs.rmSync(dir,{recursive:true,force:true});}
