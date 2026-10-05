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
 const quotedBib='@book{quoted,title={A " sign {Nested}, author={Fake}},author={Real Author},year={2026}}\n@book{next,title="Next"}';
 const displayed=require('../server/hover.cjs').bibliography(quotedBib,quotedBib.indexOf('quoted'));assert.equal(displayed.fields.author,'Real Author');assert(displayed.fields.title.includes('author={Fake}'));
 const quotedFile=path.join(root,'quoted.bib');fs.writeFileSync(quotedFile,quotedBib);const quoteDefinitions=require('../server/references.cjs').occurrences([quotedFile]).filter(item=>item.declaration);assert.deepEqual(quoteDefinitions.map(item=>item.name),['quoted','next']);fs.unlinkSync(quotedFile);
 console.log('PASS core: roots, cycles, ambiguity, placeholders, recipes, indexing, structure, syntax');
}
unit();
fs.mkdirSync(path.join(root,'.vscode'),{recursive:true});fs.writeFileSync(path.join(root,'.vscode/settings.json'),JSON.stringify({'latex-workshop.latex.autoBuild.run':'onSave'}));
const cfg={'latex.autoBuild.run':'never','latex.autoBuild.interval':100,'latex.tools':[{name:'latexmk-xelatex',command:process.env.LATEXMK || 'latexmk',args:core.DEFAULTS['latex.tools'][0].args}]};
const child=spawn(process.execPath,[path.join(__dirname,'../server/server.cjs')],{env:process.env});
let buffer=Buffer.alloc(0),id=0;const pending=new Map(),diagnostics=new Map();let logs='',shownDocument=null;const progress=[];
function send(message){const body=Buffer.from(JSON.stringify({jsonrpc:'2.0',...message}));child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);child.stdin.write(body);}
function request(method,params){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});send({id:n,method,params});});}
child.stdout.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);while(true){const end=buffer.indexOf('\r\n\r\n');if(end<0)return;const size=Number(/Content-Length:\s*(\d+)/i.exec(buffer.subarray(0,end).toString())[1]);if(buffer.length<end+4+size)return;const m=JSON.parse(buffer.subarray(end+4,end+4+size));buffer=buffer.subarray(end+4+size);if(m.method==='workspace/configuration')send({id:m.id,result:m.params.items.map(item=>item.section?(cfg[item.section]??null):cfg)});else if(m.method==='window/workDoneProgress/create'||m.method==='workspace/codeLens/refresh')send({id:m.id,result:null});else if(m.method==='$/progress')progress.push(m.params);else if(m.method==='window/showDocument'){shownDocument=m.params;send({id:m.id,result:{success:true}});}else if(m.method==='textDocument/publishDiagnostics')diagnostics.set(core.key(core.file(m.params.uri)),m.params.diagnostics);else if(m.method==='window/logMessage'||m.method==='window/showMessage')logs+=m.params.message+'\n';else if(pending.has(m.id)){const item=pending.get(m.id);pending.delete(m.id);m.error?item.reject(new Error(m.error.message)):item.resolve(m.result);}}});
child.stderr.on('data',chunk=>process.stderr.write(chunk));
const timeout=setTimeout(()=>{console.error('FAIL timeout\n'+logs);child.kill();process.exitCode=1;},60000);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function open(file,languageId='latex'){send({method:'textDocument/didOpen',params:{textDocument:{uri:core.uri(file),languageId,version:1,text:fs.readFileSync(file,'utf8')}}});}
function change(file,source,version){send({method:'textDocument/didChange',params:{textDocument:{uri:core.uri(file),version},contentChanges:[{text:source}]}});}
(async()=>{
 const init=await request('initialize',{workspaceFolders:[],rootUri:core.uri(root),capabilities:{workspace:{configuration:true,codeLens:{refreshSupport:true}},window:{workDoneProgress:true,showDocument:{support:true}},textDocument:{completion:{completionItem:{snippetSupport:true}}}},initializationOptions:cfg});assert(init.capabilities.documentFormattingProvider);send({method:'initialized',params:{}});
 open(main);open(chapter);open(bib,'bibtex');await pause(50);
 send({method:'textDocument/didSave',params:{textDocument:{uri:core.uri(chapter)}}});await pause(350);assert(!logs.includes('Building '+main+' with'),'Zed never override was lost after workspace/configuration');
 console.log('PASS Zed configuration: never override survives imported onSave and configuration response');
 const base=fs.readFileSync(chapter,'utf8');const src=base+'\n\\ref{sec:}\n\\cite{sa}';change(chapter,src,2);
 const images=path.join(root,'assets');fs.mkdirSync(images);fs.writeFileSync(path.join(images,'figure.pdf'),'fixture');fs.writeFileSync(path.join(images,'notes.tex'),'source');
 fs.writeFileSync(path.join(root,'localpackage.sty'),'');
 const imageSource=base+'\n\\includegraphics{assets/fig';change(chapter,imageSource,2);
 const imageItems=await request('textDocument/completion',{textDocument:{uri:core.uri(chapter)},position:core.position(imageSource,imageSource.length)});const image=imageItems.find(item=>item.label==='assets/figure.pdf');assert(image);assert.equal(image.textEdit.newText,'assets/figure.pdf');assert.equal(imageSource.slice(core.offset(imageSource,image.textEdit.range.start),core.offset(imageSource,image.textEdit.range.end)),'assets/fig');assert(!imageItems.some(item=>item.label.endsWith('.tex')));
 const middleSource=base+'\n\\includegraphics{assets/figure.pdf}';change(chapter,middleSource,2);const middlePosition=core.position(middleSource,middleSource.indexOf('assets/figure.pdf')+'assets/fig'.length);const middle=await request('textDocument/completion',{textDocument:{uri:core.uri(chapter)},position:middlePosition});const middleItem=middle.find(item=>item.label==='assets/figure.pdf');assert.equal(middleSource.slice(core.offset(middleSource,middleItem.textEdit.range.start),core.offset(middleSource,middleItem.textEdit.range.end)),'assets/figure.pdf');
 const fileSource=base+'\n\\input{assets/notes}';change(chapter,fileSource,2);const fileDefinitions=await request('textDocument/definition',{textDocument:{uri:core.uri(chapter)},position:core.position(fileSource,fileSource.indexOf('assets/notes')+3)});assert.equal(core.file(fileDefinitions[0].uri),path.join(images,'notes.tex'));
 const packageSource=base+'\n\\usepackage{localp';change(chapter,packageSource,2);const packages=await request('textDocument/completion',{textDocument:{uri:core.uri(chapter)},position:core.position(packageSource,packageSource.length)});assert(packages.some(item=>item.label==='localpackage'));
 const commandSource=base+'\n\\fra';change(chapter,commandSource,2);const commands=await request('textDocument/completion',{textDocument:{uri:core.uri(chapter)},position:core.position(commandSource,commandSource.length)});assert(commands.some(item=>item.label==='\\frac'&&item.insertTextFormat===2));
 const sections=await request('workspace/symbol',{query:'Test'});assert(sections.some(item=>item.name==='Test'&&core.file(item.location.uri)===main));change(chapter,src,2);
 if(process.env.SKIP_TEX_BUILD!=='1'){const installedSource=base+'\n\\usepackage{fonts';change(chapter,installedSource,2);const installed=await request('textDocument/completion',{textDocument:{uri:core.uri(chapter)},position:core.position(installedSource,installedSource.length)});assert(installed.some(item=>item.label==='fontspec'),'Installed TeX package catalog missing fontspec');change(chapter,src,2);}
 const structureSource=base+'\n\\begin{figure}\\caption{Cross-file diagram}\\label{fig:cross}\\end{figure}\n\\begin{equation}x=1\\label{eq:cross}\\end{equation}';change(chapter,structureSource,3);
 const structureSymbols=await request('textDocument/documentSymbol',{textDocument:{uri:core.uri(chapter)}});const flatten=items=>items.flatMap(item=>[item,...flatten(item.children||[])]);assert(flatten(structureSymbols).some(item=>item.name==='figure: Cross-file diagram [fig:cross]'));
 const crossResults=await request('workspace/symbol',{query:'fig:cross'});const exactCross=crossResults.find(item=>item.name==='fig:cross');assert(exactCross);assert.equal(core.key(core.file(exactCross.location.uri)),core.key(chapter));assert.equal(core.offset(structureSource,exactCross.location.range.start),structureSource.indexOf('fig:cross'));
 assert((await request('workspace/symbol',{query:'Cross-file diagram'})).some(item=>item.name.startsWith('figure:')));assert((await request('workspace/symbol',{query:'eq:cross'})).some(item=>item.name==='eq:cross'));change(chapter,src,4);assert.equal((await request('workspace/symbol',{query:'fig:cross'})).length,0);
 console.log('PASS structure LSP: unsaved outlines, cross-file caption/label search and exact key locations');
 console.log('PASS editing: image/path completion edits, file definitions, local package names, command snippets and workspace sections');
 const packageMain=fs.readFileSync(main,'utf8');
 async function commandItems(prefix){const value=base+'\n\\'+prefix;change(chapter,value,2);return request('textDocument/completion',{textDocument:{uri:core.uri(chapter)},position:core.position(value,value.length)});}
 change(main,packageMain+'\n% \\usepackage{mathtools}\n\\PassOptionsToPackage{demo}{mathtools}',2);assert(!(await commandItems('dfr')).some(item=>item.label==='\\dfrac'));
 change(main,packageMain+'\n\\usepackage{mathtools}',3);const mathItems=await commandItems('dfr');const mathItem=mathItems.find(item=>item.label==='\\dfrac');assert(mathItem);assert(mathItem.insertText.includes('\$'+'{1:num}'));assert(mathItem.documentation.value.includes('宏包：amsmath'));assert(mathItem.detail.includes('dfrac'));
 const mathSource=base+'\n$\\dfrac{1}{2}$';change(chapter,mathSource,3);const mathHover=await request('textDocument/hover',{textDocument:{uri:core.uri(chapter)},position:core.position(mathSource,mathSource.indexOf('dfrac')+2)});assert.equal(mathHover.contents.value,mathItem.documentation.value);
 const envSource=base+'\n\\begin{ali';change(chapter,envSource,3);assert((await request('textDocument/completion',{textDocument:{uri:core.uri(chapter)},position:core.position(envSource,envSource.length)})).some(item=>item.label==='align'));
 const localStyle=path.join(root,'localcommands.sty');fs.writeFileSync(localStyle,'\\RequirePackage{mathtools}\n\\newcommand{\\localfrac}[1]{\\dfrac{#1}{2}}');change(main,packageMain+'\n\\usepackage{localcommands}',4);assert((await commandItems('dfr')).some(item=>item.label==='\\dfrac'));const localMacro=(await commandItems('localf')).find(item=>item.label==='\\localfrac');assert(localMacro.insertText.includes('\$'+'{1:参数1}'));assert(localMacro.documentation.value.includes('自定义命令'));
 change(main,packageMain+'\n\\usepackage{localcommands}\n\\renewcommand{\\localfrac}[2]{#1+#2}',5);const overridden=(await commandItems('localf')).find(item=>item.label==='\\localfrac');assert(overridden.insertText.includes('$'+'{2:参数2}'));
 fs.writeFileSync(path.join(root,'localclass.cls'),'\\LoadClass{article}\n\\RequirePackage{graphicx}');change(main,packageMain.replace('article','localclass'),5);const graphicsItems=await commandItems('rota');assert(graphicsItems.some(item=>item.label==='\\rotatebox'));
 const optionSource=base+'\n\\includegraphics[wi';change(chapter,optionSource,4);const options=await request('textDocument/completion',{textDocument:{uri:core.uri(chapter)},position:core.position(optionSource,optionSource.length)});assert(options.some(item=>item.textEdit.newText==='width='));
 change(main,packageMain,6);assert(!(await commandItems('dfr')).some(item=>item.label==='\\dfrac'));change(chapter,src,2);
 console.log('PASS package metadata: package-gated commands, transitive dependencies, shared hover docs, local style/class loading, argument snippets and option keys');
 const ref=await request('textDocument/completion',{textDocument:{uri:core.uri(chapter)},position:core.position(src,src.indexOf('sec:}')+4)});assert(ref.some(x=>x.label==='sec:test'));
 const cite=await request('textDocument/completion',{textDocument:{uri:core.uri(chapter)},position:core.position(src,src.lastIndexOf('sa}')+2)});assert(cite.some(x=>x.label==='sample'));
 const def=await request('textDocument/definition',{textDocument:{uri:core.uri(chapter)},position:core.position(base,base.indexOf('sec:test')+3)});assert.equal(core.key(core.file(def[0].uri)),core.key(main));
 const referenceHover=await request('textDocument/hover',{textDocument:{uri:core.uri(chapter)},position:core.position(base,base.indexOf('sec:test')+3)});assert(referenceHover.contents.value.includes('sec:test'));assert(referenceHover.contents.value.includes('\\label{sec:test}'));
 const mainBase=fs.readFileSync(main,'utf8');change(main,mainBase+'\n\\label{sample}',2);const hoverSource=base+'\n\\cite{sample}\n\\ref{sample}\n% \\cite{sample}';change(chapter,hoverSource,2);
 const citePosition=core.position(hoverSource,hoverSource.indexOf('cite{sample}')+6);const citationDefinition=await request('textDocument/definition',{textDocument:{uri:core.uri(chapter)},position:citePosition});assert.equal(core.key(core.file(citationDefinition[0].uri)),core.key(bib));assert.equal(citationDefinition[0].range.end.character-citationDefinition[0].range.start.character,'sample'.length);
 const citeCommandHover=await request('textDocument/hover',{textDocument:{uri:core.uri(chapter)},position:core.position(hoverSource,hoverSource.indexOf('cite{sample}')+1)});assert(citeCommandHover.contents.value.includes('\\cite[注释]{文献键1,文献键2}'));
 const customMain=mainBase+'\n\\newcommand{\\myhover}[2][default]{#1+#2}';change(main,customMain,3);const hoverCommandSource=base+'\n$\\frac{1}{2}$\n\\myhover{value}\n% \\frac{1}{2}';change(chapter,hoverCommandSource,3);
 const fractionHover=await request('textDocument/hover',{textDocument:{uri:core.uri(chapter)},position:core.position(hoverCommandSource,hoverCommandSource.indexOf('frac{')+1)});assert(fractionHover.contents.value.includes('\\frac{分子}{分母}'));
 const customHover=await request('textDocument/hover',{textDocument:{uri:core.uri(chapter)},position:core.position(hoverCommandSource,hoverCommandSource.indexOf('myhover{')+2)});assert(customHover.contents.value.includes('\\myhover[参数1]{参数2}'));assert(customHover.contents.value.includes('自定义命令'));
 assert.equal(await request('textDocument/hover',{textDocument:{uri:core.uri(chapter)},position:core.position(hoverCommandSource,hoverCommandSource.lastIndexOf('frac{')+1)}),null);
 change(main,mainBase+'\n\\label{sample}',4);change(chapter,hoverSource,4);
 const citationHover=await request('textDocument/hover',{textDocument:{uri:core.uri(chapter)},position:citePosition});assert(citationHover.contents.value.includes('Sample'));assert(citationHover.contents.value.includes('Test Author'));assert(citationHover.contents.value.includes('2026'));
 const sameLabel=await request('textDocument/definition',{textDocument:{uri:core.uri(chapter)},position:core.position(hoverSource,hoverSource.indexOf('ref{sample}')+5)});assert.equal(core.key(core.file(sameLabel[0].uri)),core.key(main));
 assert.equal(await request('textDocument/hover',{textDocument:{uri:core.uri(chapter)},position:core.position(hoverSource,hoverSource.lastIndexOf('cite{sample}')+6)}),null);
 change(main,mainBase,3);change(chapter,src,2);console.log('PASS hover/navigation: source context, citation metadata, precise key ranges, same-key type separation and comment exclusion');
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
 assert(progress.some(item=>item.value.kind==='begin'));assert(progress.some(item=>item.value.kind==='end'&&item.value.message.includes('Failed')));
 const failedLens=await request('textDocument/codeLens',{textDocument:{uri:core.uri(main)}});assert(failedLens.some(item=>item.command.title.includes('Failed')));assert(failedLens.some(item=>item.command.command==='latex-workshop.showLog'));
 const missingCompiler=await request('textDocument/build',{textDocument:{uri:core.uri(chapter)}});assert.equal(missingCompiler.status,2);assert.match(missingCompiler.message,/Cannot find executable/);assert(fs.readFileSync(core.file(missingCompiler.log),'utf8').includes('missing-compiler'));
 const counter=path.join(root,'build-count');cfg['latex.tools']=[{name:'latexmk-xelatex',command:process.execPath,args:['-e',"require('node:fs').appendFileSync(process.argv[1],'x');setTimeout(()=>process.stdout.write('Completed'),200)",counter]}];send({method:'workspace/didChangeConfiguration',params:{settings:cfg}});
 const duplicate=await Promise.all([request('textDocument/build',{textDocument:{uri:core.uri(main)}}),request('workspace/executeCommand',{command:'latex-workshop.build',arguments:[core.uri(chapter)]}),assert.rejects(request('textDocument/build',{textDocument:{uri:core.uri(main)},recipe:'another recipe'}),/different recipe/)]);assert(duplicate.slice(0,2).every(item=>item.status===0));assert(duplicate[0].elapsedMs>=0);assert(progress.some(item=>item.value.kind==='end'&&item.value.message.includes('Succeeded')));assert.equal(fs.readFileSync(counter,'utf8'),'x','Duplicate build commands spawned multiple compilers');assert(!(diagnostics.get(core.key(main))||[]).some(item=>item.severity===1));
 const checked=await request('workspace/executeCommand',{command:'latex-workshop.checkTools',arguments:[core.uri(chapter)]});assert.equal(checked.missing,0);assert(fs.readFileSync(core.file(checked.report),'utf8').includes(process.execPath));
 cfg['latex.tools']=[{name:'latexmk-xelatex',command:path.join(root,'missing-compiler'),args:[]}];send({method:'workspace/didChangeConfiguration',params:{settings:cfg}});const absent=await request('workspace/executeCommand',{command:'latex-workshop.checkTools',arguments:[core.uri(chapter)]});assert.equal(absent.missing,1);assert(fs.readFileSync(core.file(absent.report),'utf8').includes('[MISSING]'));
 cfg['latex.tools']=[{name:'latexmk-xelatex',command:process.execPath,args:['-e',"setTimeout(()=>{},5000)"]}];send({method:'workspace/didChangeConfiguration',params:{settings:cfg}});
 const cancelledBuild=request('textDocument/build',{textDocument:{uri:core.uri(main)}});let busy;
 for(let i=0;i<10;i++){busy=await request('textDocument/codeLens',{textDocument:{uri:core.uri(main)}});if(busy[0].command.command==='latex-workshop.kill')break;await pause(10);}assert.equal(busy[0].command.command,'latex-workshop.kill');
 let cancelToken;for(let i=0;i<10;i++){cancelToken=progress.at(-1);if(['begin','report'].includes(cancelToken?.value.kind))break;await pause(10);}assert(['begin','report'].includes(cancelToken.value.kind));send({method:'window/workDoneProgress/cancel',params:{token:cancelToken.token}});assert.equal((await cancelledBuild).status,3);
 console.log('PASS feedback/tools: progress lifecycle, busy/stop lenses, cancellation, elapsed time and missing-tool report');
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
