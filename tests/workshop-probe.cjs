'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');const core=require('../server/core.cjs');
const tempBase=path.resolve('.dev');fs.mkdirSync(tempBase,{recursive:true});
const root=fs.mkdtempSync(path.join(tempBase,'zed-workshop space '));
const fixtures=path.join(__dirname,'fixtures/multifile');for(const name of ['main.tex','chapter.tex','references.bib'])fs.copyFileSync(path.join(fixtures,name),path.join(root,name));
const main=path.join(root,'main.tex'),chapter=path.join(root,'chapter.tex'),bib=path.join(root,'references.bib');
function unit(){
 assert.deepEqual(core.workspaceRoots({workspaceFolders:[],rootUri:core.uri(root)}),[root]);
 assert.deepEqual(core.workspaceRoots({workspaceFolders:[],rootUri:null,rootPath:root}),[root]);
 assert.deepEqual(core.workspaceRoots({workspaceFolders:[],rootUri:null},root),[root]);
 assert.deepEqual(core.workspaceRoots({workspaceFolders:[{uri:core.uri(root)}],rootUri:null}),[root]);
 assert.equal(core.rootFile(chapter,[root]),main);assert.equal(core.rootFile(bib,[root]),main);
 const p=core.placeholders(main,'build',root);assert.equal(p.expand('%DOC_EXT%'),main);assert.equal(p.expand('%DOC%'),path.join(root,'main'));assert.equal(p.expand('%DOCFILE_EXT%'),'main.tex');assert.equal(p.output,path.join(root,'build'));
 const cycle=path.join(root,'cycle.tex');fs.writeFileSync(cycle,'% !TeX root = cycle.tex');assert.throws(()=>core.rootFile(cycle,[root]),/Cycle/);fs.unlinkSync(cycle);
 const other=path.join(root,'other.tex');fs.writeFileSync(other,'\\documentclass{article}\\input{chapter}');assert.throws(()=>core.rootFile(chapter,[root]),/Multiple main/);fs.writeFileSync(chapter,'% !TeX root = main.tex\n'+fs.readFileSync(chapter,'utf8'));assert.equal(core.rootFile(chapter,[root]),main);fs.unlinkSync(other);
 const idx=core.index([...core.dependencies(main)]);assert(idx.labels.has('sec:test'));assert(idx.citations.has('sample'));
 for(const extension of ['bibtex','biblatex']){const alias=path.join(root,'alias.'+extension);fs.copyFileSync(bib,alias);assert(core.SOURCE.test(alias));assert(core.index([alias]).citations.has('sample'));fs.unlinkSync(alias);}
 assert.equal(core.syntaxDiagnostics('\\begin{document}\n{','x.tex').length,2);assert.deepEqual(core.syntaxDiagnostics('FUNCTION {test} { "\\cite{" crossref * "}" * }','x.bst'),[]);
 assert.equal(core.mask('% \\section{hidden}\n\\section{shown}').split('\n')[0].trim(),'');
 const symbols=core.symbols('\\section{One}\n\\subsection{Child}\n\\section{Two}');assert.equal(symbols.length,2);assert.equal(symbols[0].children[0].name,'Child');
 const cfg=core.settings({'latex.recipes':[{name:'sequence',tools:['one','two']}],'latex.tools':[{name:'one',command:'echo',args:['%DOC_EXT%'],cwd:'%DIR%'},{name:'two',command:'echo',args:['%DOCFILE%']}]});const r=core.recipe(main,cfg,root);assert.equal(r.steps.length,2);assert.equal(r.steps[0].cwd,root);assert.equal(r.steps[1].args[0],'main');
 console.log('PASS core: roots, cycles, ambiguity, placeholders, recipes, indexing, structure, syntax');
}
unit();
fs.mkdirSync(path.join(root,'.vscode'),{recursive:true});fs.writeFileSync(path.join(root,'.vscode/settings.json'),JSON.stringify({'latex-workshop.latex.autoBuild.run':'onSave'}));
const cfg={'latex.autoBuild.run':'never','latex.autoBuild.interval':100,'latex.tools':[{name:'latexmk-xelatex',command:process.env.LATEXMK || 'latexmk',args:core.DEFAULTS['latex.tools'][0].args}]};
const child=spawn(process.execPath,[path.join(__dirname,'../server/server.cjs')],{env:process.env});
let buffer=Buffer.alloc(0),id=0;const pending=new Map(),diagnostics=new Map();let logs='',shownDocument=null;
function send(message){const body=Buffer.from(JSON.stringify({jsonrpc:'2.0',...message}));child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);child.stdin.write(body);}
function request(method,params){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});send({id:n,method,params});});}
child.stdout.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);while(true){const end=buffer.indexOf('\r\n\r\n');if(end<0)return;const size=Number(/Content-Length:\s*(\d+)/i.exec(buffer.subarray(0,end).toString())[1]);if(buffer.length<end+4+size)return;const m=JSON.parse(buffer.subarray(end+4,end+4+size));buffer=buffer.subarray(end+4+size);if(m.method==='workspace/configuration')send({id:m.id,result:m.params.items.map(item=>item.section?(cfg[item.section]??null):cfg)});else if(m.method==='window/showDocument'){shownDocument=m.params;send({id:m.id,result:{success:true}});}else if(m.method==='textDocument/publishDiagnostics')diagnostics.set(core.key(core.file(m.params.uri)),m.params.diagnostics);else if(m.method==='window/logMessage'||m.method==='window/showMessage')logs+=m.params.message+'\n';else if(pending.has(m.id)){const item=pending.get(m.id);pending.delete(m.id);m.error?item.reject(new Error(m.error.message)):item.resolve(m.result);}}});
child.stderr.on('data',chunk=>process.stderr.write(chunk));
const timeout=setTimeout(()=>{console.error('FAIL timeout\n'+logs);child.kill();process.exitCode=1;},60000);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function open(file,languageId='latex'){send({method:'textDocument/didOpen',params:{textDocument:{uri:core.uri(file),languageId,version:1,text:fs.readFileSync(file,'utf8')}}});}
function change(file,source,version){send({method:'textDocument/didChange',params:{textDocument:{uri:core.uri(file),version},contentChanges:[{text:source}]}});}
(async()=>{
 const init=await request('initialize',{workspaceFolders:[],rootUri:core.uri(root),capabilities:{workspace:{configuration:true}},initializationOptions:cfg});assert(init.capabilities.documentFormattingProvider);send({method:'initialized',params:{}});
 open(main);open(chapter);open(bib,'bibtex');await pause(50);
 send({method:'textDocument/didSave',params:{textDocument:{uri:core.uri(chapter)}}});await pause(350);assert(!logs.includes('Building '+main+' with'),'Zed never override was lost after workspace/configuration');
 console.log('PASS Zed configuration: never override survives imported onSave and configuration response');
 const base=fs.readFileSync(chapter,'utf8');const src=base+'\n\\ref{sec:}\n\\cite{sa}';change(chapter,src,2);
 const ref=await request('textDocument/completion',{textDocument:{uri:core.uri(chapter)},position:core.position(src,src.indexOf('sec:}')+4)});assert(ref.some(x=>x.label==='sec:test'));
 const cite=await request('textDocument/completion',{textDocument:{uri:core.uri(chapter)},position:core.position(src,src.lastIndexOf('sa}')+2)});assert(cite.some(x=>x.label==='sample'));
 const def=await request('textDocument/definition',{textDocument:{uri:core.uri(chapter)},position:core.position(base,base.indexOf('sec:test')+3)});assert.equal(core.key(core.file(def[0].uri)),core.key(main));
 const sym=await request('textDocument/documentSymbol',{textDocument:{uri:core.uri(main)}});assert.equal(sym[0].name,'Test');
 const actions=await request('textDocument/codeAction',{textDocument:{uri:core.uri(chapter)},range:core.range(base,0),context:{diagnostics:[]}});assert(actions.some(x=>x.command.command==='latex-workshop.build'));assert(actions.some(x=>x.command.command==='latex-workshop.clean'));
 const lens=await request('textDocument/codeLens',{textDocument:{uri:core.uri(main)}});assert.equal(lens.length,2);assert.equal(lens[0].command.command,'latex-workshop.build');assert.equal(lens[0].range.start.line,0);
 assert.deepEqual(await request('textDocument/codeLens',{textDocument:{uri:core.uri(bib)}}),[]);
 await assert.rejects(request('textDocument/build',{textDocument:{uri:core.uri(chapter)}}),/Save changes before building/);
 change(chapter,base,3);
 const defaultTools=cfg['latex.tools'];cfg['latex.autoBuild.cleanAndRetry.enabled']=false;
 cfg['latex.tools']=[{name:'latexmk-xelatex',command:process.execPath,args:['-e',"process.stderr.write('xdvipdfmx:fatal: File ended prematurely\\n');process.exit(12)"]}];send({method:'workspace/didChangeConfiguration',params:{settings:cfg}});
 const converterFailure=await request('textDocument/build',{textDocument:{uri:core.uri(chapter)}});assert.equal(converterFailure.status,1);assert.match(converterFailure.message,/File ended prematurely/);assert(fs.readFileSync(core.file(converterFailure.log),'utf8').includes('xdvipdfmx:fatal'));assert((diagnostics.get(core.key(main))||[]).some(item=>item.severity===1&&item.message.includes('File ended prematurely')));
 await request('workspace/executeCommand',{command:'latex-workshop.showLog',arguments:[core.uri(chapter)]});assert.equal(shownDocument.uri,converterFailure.log);assert.equal(shownDocument.external,false);
 cfg['latex.tools']=[{name:'latexmk-xelatex',command:path.join(root,'missing-compiler'),args:[]}];send({method:'workspace/didChangeConfiguration',params:{settings:cfg}});
 const missingCompiler=await request('textDocument/build',{textDocument:{uri:core.uri(chapter)}});assert.equal(missingCompiler.status,2);assert.match(missingCompiler.message,/Cannot find executable/);assert(fs.readFileSync(core.file(missingCompiler.log),'utf8').includes('missing-compiler'));
 const counter=path.join(root,'build-count');cfg['latex.tools']=[{name:'latexmk-xelatex',command:process.execPath,args:['-e',"require('node:fs').appendFileSync(process.argv[1],'x');setTimeout(()=>process.stdout.write('Completed'),200)",counter]}];send({method:'workspace/didChangeConfiguration',params:{settings:cfg}});
 const duplicate=await Promise.all([request('textDocument/build',{textDocument:{uri:core.uri(main)}}),request('workspace/executeCommand',{command:'latex-workshop.build',arguments:[core.uri(chapter)]}),assert.rejects(request('textDocument/build',{textDocument:{uri:core.uri(main)},recipe:'another recipe'}),/different recipe/)]);assert(duplicate.slice(0,2).every(item=>item.status===0));assert.equal(fs.readFileSync(counter,'utf8'),'x','Duplicate build commands spawned multiple compilers');assert(!(diagnostics.get(core.key(main))||[]).some(item=>item.severity===1));
 cfg['latex.tools']=defaultTools;cfg['latex.autoBuild.cleanAndRetry.enabled']=true;send({method:'workspace/didChangeConfiguration',params:{settings:cfg}});
 console.log('PASS build UX: CodeLens, unsaved guard, converter/missing-tool diagnostics, persistent log, showDocument and duplicate request coalescing');
 const formatted=await request('textDocument/formatting',{textDocument:{uri:core.uri(bib)},options:{tabSize:2,insertSpaces:true}});assert(Array.isArray(formatted));assert.deepEqual(await request('textDocument/formatting',{textDocument:{uri:core.uri(chapter)},options:{tabSize:2,insertSpaces:true}}),[]);
 const labelSource=fs.readFileSync(chapter,'utf8'),labelOffset=labelSource.indexOf('sec:test');
 const labelPosition=core.position(labelSource,labelOffset+2),labelParams={textDocument:{uri:core.uri(chapter)},position:labelPosition};
 assert((await request('textDocument/prepareRename',labelParams)).placeholder==='sec:test');
 const usages=await request('textDocument/references',{...labelParams,context:{includeDeclaration:true}});assert(usages.length>=1);
 const rename=await request('textDocument/rename',{...labelParams,newName:'sec:renamed'});assert(Object.values(rename.changes).flat().length>=1);assert.equal(fs.readFileSync(chapter,'utf8'),labelSource);
 console.log('PASS LSP references/rename: precise key range, project edits returned without writing source');
 console.log('PASS LSP: completion, definition, outline, build actions, BibTeX formatting');
 if(process.env.SKIP_TEX_BUILD!=='1'){
  change(chapter,base,3);const built=await request('workspace/executeCommand',{command:'latex-workshop.build',arguments:[core.uri(chapter)]});assert.equal(built.status,0,logs);const pdf=path.join(root,'build/main.pdf');assert(fs.existsSync(pdf));
  console.log('PASS XeLaTeX: multi-file root build with spaces and bibliography');
  const fdb=path.join(root,'build/main.fdb_latexmk');
  function stale(){let changes=0;const data=fs.readFileSync(fdb,'utf8').replace(/(\["xdvipdfmx"\][^\r\n]* )0(?=\r?$)/gm,(_,prefix)=>{changes++;return prefix+'2'});assert.equal(changes,1);fs.writeFileSync(fdb,data);}
  const cleanMessage='编译失败，清理辅助文件后自动重试一次。';
  const incrementalSource=base+' Incremental edit.';fs.writeFileSync(chapter,incrementalSource);change(chapter,incrementalSource,3);const incrementalCleanCount=logs.split(cleanMessage).length;const incremental=await request('textDocument/build',{textDocument:{uri:core.uri(chapter)}});assert.equal(incremental.status,0,logs);assert.equal(logs.split(cleanMessage).length,incrementalCleanCount,'Normal incremental edit required cleanup');
  console.log('PASS incremental editing: changed child rebuilds main without cleanup');
  stale();cfg['latex.autoBuild.cleanAndRetry.enabled']=false;send({method:'workspace/didChangeConfiguration',params:{settings:cfg}});await pause(100);
  let beforeRetry=logs.split(cleanMessage).length;let attempt=await request('textDocument/build',{textDocument:{uri:core.uri(chapter)}});assert.equal(attempt.status,1);assert.equal(logs.split(cleanMessage).length,beforeRetry);
  cfg['latex.autoBuild.cleanAndRetry.enabled']=true;send({method:'workspace/didChangeConfiguration',params:{settings:cfg}});await pause(100);
  attempt=await request('textDocument/build',{textDocument:{uri:core.uri(chapter)}});assert.equal(attempt.status,0,logs);assert.equal(logs.split(cleanMessage).length,beforeRetry+1);
  if(process.platform==='win32'){
    stale();const marker=path.join(root,'pdf-locked'),ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
    const script='$h=[IO.File]::Open($env:LOCK_PDF,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None);[IO.File]::WriteAllText($env:LOCK_MARKER,"ready");try{[Threading.Thread]::Sleep(30000)}finally{$h.Dispose()}';
    const locker=spawn(ps,['-NoProfile','-Command',script],{windowsHide:true,stdio:'ignore',env:{...process.env,LOCK_PDF:pdf,LOCK_MARKER:marker}});
    try{for(let i=0;i<100&&!fs.existsSync(marker);i++)await pause(50);assert(fs.existsSync(marker));beforeRetry=logs.split(cleanMessage).length;attempt=await request('textDocument/build',{textDocument:{uri:core.uri(chapter)}});assert.equal(attempt.status,1);assert(logs.includes('PDF 无法写入'));assert.equal(logs.split(cleanMessage).length,beforeRetry);assert(fs.existsSync(fdb));}
    finally{const exited=new Promise(resolve=>locker.once('exit',resolve));locker.kill();await exited;}
    attempt=await request('textDocument/build',{textDocument:{uri:core.uri(chapter)}});assert.equal(attempt.status,0,logs);assert.equal(logs.split(cleanMessage).length,beforeRetry+1);
  }
  beforeRetry=logs.split(cleanMessage).length;attempt=await request('textDocument/build',{textDocument:{uri:core.uri(chapter)}});assert.equal(attempt.status,0);assert.equal(logs.split(cleanMessage).length,beforeRetry);
  const cleaned=await request('workspace/executeCommand',{command:'latex-workshop.clean',arguments:[core.uri(chapter)]});assert.equal(cleaned.status,0);assert(!fs.existsSync(path.join(root,'build/main.aux')));assert(fs.existsSync(pdf));
  attempt=await request('textDocument/build',{textDocument:{uri:core.uri(chapter)}});assert.equal(attempt.status,0,logs);
  console.log('PASS plugin cleanup/retry: disabled setting, cached failure, real PDF lock/unlock, incremental success and clean action');

  const broken=base+'\n\\DefinitelyUndefinedControlSequence';fs.writeFileSync(chapter,broken);change(chapter,broken,4);
  const failure=await request('textDocument/build',{textDocument:{uri:core.uri(chapter)}});assert.equal(failure.status,1);assert((diagnostics.get(core.key(chapter))||[]).some(x=>/Undefined control sequence/i.test(x.message)),logs);
  fs.writeFileSync(chapter,base+' Saved change.');change(chapter,base+' Saved change.',5);await request('textDocument/build',{textDocument:{uri:core.uri(chapter)}});assert(!(diagnostics.get(core.key(chapter))||[]).some(x=>/Undefined control sequence/i.test(x.message)));
  console.log('PASS diagnostics: compile error on child, cleared after successful rebuild');
  cfg['latex.autoBuild.run']='onSave';send({method:'workspace/didChangeConfiguration',params:{settings:cfg}});await pause(100);let before=fs.statSync(pdf).mtimeMs;
  const saved=base+' Auto-build change.';fs.writeFileSync(chapter,saved);change(chapter,saved,6);send({method:'textDocument/didSave',params:{textDocument:{uri:core.uri(chapter)},text:saved}});
  for(let i=0;i<100 && fs.statSync(pdf).mtimeMs<=before;i++)await pause(100);assert(fs.statSync(pdf).mtimeMs>before,logs);await pause(800);
  console.log('PASS auto build: child save rebuilds main');
  cfg['latex.autoBuild.run']='onFileChange';send({method:'workspace/didChangeConfiguration',params:{settings:cfg}});await pause(1100);before=fs.statSync(pdf).mtimeMs;
  fs.writeFileSync(chapter,saved+' External change.');
  for(let i=0;i<100 && fs.statSync(pdf).mtimeMs<=before;i++)await pause(100);assert(fs.statSync(pdf).mtimeMs>before,logs);await pause(800);
  console.log('PASS auto build: external dependency change rebuilds main');
 }
 if(process.env.TEX_FMT){
  cfg['latex.autoBuild.run']='never';cfg['formatting.latex']='tex-fmt';cfg['formatting.tex-fmt.path']=process.env.TEX_FMT;send({method:'workspace/didChangeConfiguration',params:{settings:cfg}});
  const unformatted='\\begin{itemize}\n\\item Test\n\\end{itemize}\n'.replace(/\\\\/g,'\\');change(chapter,unformatted,7);
  const edits=await request('textDocument/formatting',{textDocument:{uri:core.uri(chapter)},options:{tabSize:2,insertSpaces:true}});
  assert.equal(edits.length,1);assert.match(edits[0].newText,/\n  \\item Test/);assert.equal(fs.readFileSync(chapter,'utf8').includes('\\begin{itemize}'),false);
  change(chapter,edits[0].newText,8);assert.deepEqual(await request('textDocument/formatting',{textDocument:{uri:core.uri(chapter)},options:{tabSize:2,insertSpaces:true}}),[]);
  console.log('PASS tex-fmt: actual formatter returns edits, preserves source file and is idempotent');
 }
 cfg['latex.autoBuild.run']='never';cfg['formatting.latex']='tex-fmt';cfg['formatting.tex-fmt.path']=path.join(root,'missing-formatter.exe');send({method:'workspace/didChangeConfiguration',params:{settings:cfg}});
 await assert.rejects(request('textDocument/formatting',{textDocument:{uri:core.uri(chapter)},options:{tabSize:2,insertSpaces:true}}),/formatting requires tex-fmt/);
 const bst=path.join(root,'plain.bst');fs.writeFileSync(bst,'FUNCTION {test} { "\\cite{" crossref * "}" * }');open(bst,'bst');await pause(50);assert(!diagnostics.has(core.key(bst)));
 // Emulate a native terminal build while auto-build is disabled.
 const beforeExternalBuilds=logs.split('Building '+main+' with').length;
 const externalLog=path.join(root,'build/main.log');fs.mkdirSync(path.dirname(externalLog),{recursive:true});
 fs.writeFileSync(externalLog,'./chapter.tex:2: External task failure.\nNo pages of output.\n');
 for(let i=0;i<30&&!((diagnostics.get(core.key(chapter))||[]).some(d=>d.message.includes('External task failure')));i++)await pause(100);
 assert((diagnostics.get(core.key(chapter))||[]).some(d=>d.message.includes('External task failure')),'External failure was not synchronized');
 fs.writeFileSync(externalLog,'Compiler starting, log is incomplete\n');await pause(1200);
 assert((diagnostics.get(core.key(chapter))||[]).some(d=>d.message.includes('External task failure')),'Incomplete log cleared diagnostics prematurely');
 fs.writeFileSync(externalLog,'Output written on build/main.xdv (1 page).\n');
 for(let i=0;i<30&&((diagnostics.get(core.key(chapter))||[]).some(d=>d.message.includes('External task failure')));i++)await pause(100);
 assert(!(diagnostics.get(core.key(chapter))||[]).some(d=>d.message.includes('External task failure')),'Successful external build did not clear diagnostics');
 if(process.env.SKIP_TEX_BUILD)assert.equal(logs.split('Building '+main+' with').length,beforeExternalBuilds,'Output changes unexpectedly triggered compilation');
 console.log('PASS external task diagnostics: new errors imported, incomplete logs ignored, successful log clears stale errors with auto-build disabled');
 console.log('PASS missing formatter reports dependency; bst excluded');
 await request('shutdown',{});send({method:'exit'});clearTimeout(timeout);
 await new Promise(resolve=>child.once('exit',resolve));fs.rmSync(root,{recursive:true,force:true});
})().catch(error=>{console.error(error.stack+'\n'+logs);clearTimeout(timeout);child.kill();process.exitCode=1;console.error('Fixture retained at '+root);});
