'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const core=require('./core.cjs');
const recovery=require('./build-retry.cjs');
const report=require('./build-report.cjs');
const tools=require('./tools.cjs');
const references=require('./references.cjs');
const logSync=new (require('./log-sync.cjs').LogSync)();
const diagnosticFiles=new Map();
const docs=new Map(), jobs=new Map(), buildDiagnostics=new Map(), timers=new Map(), lastRecipes=new Map();
const buildLogs=new Map();
let folders=[], config=core.settings(), input=Buffer.alloc(0), requestId=0, shutdown=false;
const pending=new Map(), observed=new Map();
const COMMANDS=['documentclass','usepackage','input','include','begin','end','section','subsection','subsubsection','chapter','part','paragraph','label','ref','eqref','pageref','autoref','cref','cite','citep','citet','textcite','parencite','bibliography','bibliographystyle','addbibresource','printbibliography','caption','includegraphics','centering','item','textbf','textit','emph','footnote','newcommand','renewcommand','newenvironment','frac','sqrt','sum','prod','int','alpha','beta','gamma','delta','epsilon','theta','lambda','mu','pi','sigma','phi','omega','left','right','mathrm','mathbf','mathbb','operatorname','ExplSyntaxOn','ExplSyntaxOff'];
const ENVS=['document','figure','table','itemize','enumerate','description','equation','equation*','align','align*','gather','gather*','matrix','pmatrix','bmatrix','tabular','center','quote','verbatim'];
function send(message){const body=Buffer.from(JSON.stringify({jsonrpc:'2.0',...message}));process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);process.stdout.write(body);}
function notify(method,params){send({method,params});}
function show(message,type=1){notify('window/showMessage',{type,message});}
function request(method,params){return new Promise((resolve,reject)=>{const id=++requestId;pending.set(id,{resolve,reject});send({id,method,params});});}
function document(url){return docs.get(core.key(core.file(url)));}
function text(url){return document(url)?.text || core.read(core.file(url),docs);}
function projectSettings(){
  let supplied={};
  // Import only Workshop keys; ignore all other VS Code configuration.
  for(const folder of folders){try{
    const raw=fs.readFileSync(path.join(folder,'.vscode/settings.json'),'utf8');
    const data=JSON.parse(raw.replace(/^\s*\/\/.*$/gm,'').replace(/,\s*([}\]])/g,'$1'));
    for(const [key,value] of Object.entries(data))if(key.startsWith('latex-workshop.'))supplied[key]=value;
  }catch{}}
  return supplied;
}
function globalConfig(){return config;}
function configure(raw){config=core.settings({...projectSettings(),...(raw['latex-workshop'] || raw)});refresh();}
function resolveRoot(active){return core.rootFile(active,folders,docs,config['latex.rootFile']);}
function projectIndex(active){let files;try{files=[...core.dependencies(resolveRoot(active),docs)];}catch{files=folders.flatMap(folder=>core.scan(folder));}return core.index(files,docs);}
function publish(filename){
  const url=core.uri(filename);const doc=docs.get(core.key(filename));if(!doc)return;
  const diagnostics=[...core.syntaxDiagnostics(doc.text,filename),...(buildDiagnostics.get(core.key(filename))||[])];
  notify('textDocument/publishDiagnostics',{uri:doc.uri,version:doc.version,diagnostics});
}
function refresh(){for(const [filename] of docs)publish(filename);}
function run(command,args,options={}){
  return new Promise((resolve,reject)=>{
    const launch=tools.launch(command,{overrides:options.env,directories:(options.config||config)['latex.tools.searchPaths'],cwd:options.cwd});
    const child=spawn(launch.command,args,{cwd:options.cwd,env:launch.env,windowsHide:true});
    options.started?.(child);let output='',errors='',transcript='';
    child.stdout.on('data',chunk=>{output+=chunk;transcript+=chunk;options.capture?.(chunk.toString());if(options.log)notify('window/logMessage',{type:4,message:chunk.toString()});});
    child.stderr.on('data',chunk=>{errors+=chunk;transcript+=chunk;options.capture?.(chunk.toString());if(options.log)notify('window/logMessage',{type:4,message:chunk.toString()});});
    child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal,output,errors,transcript}));
    if(options.input!==undefined)child.stdin.end(options.input);else child.stdin.end();
  });
}
function updateBuildDiagnostics(root,log){
  const rootKey=core.key(root),parsed=core.logDiagnostics(log,root);
  const previous=diagnosticFiles.get(rootKey)||new Set();
  for(const filename of core.dependencies(root,docs))previous.add(core.key(filename));
  for(const filename of previous)buildDiagnostics.delete(filename);
  const next=new Set();for(const [url,diagnostics] of parsed){const filename=core.key(core.file(url));buildDiagnostics.set(filename,diagnostics);next.add(filename);}
  diagnosticFiles.set(rootKey,next);refresh();
}
async function cleanFiles(root,job,step={}){
  const config=job.config||globalConfig();
  if(config['latex.clean.method']!=='command')throw Error('Only latex.clean.method=command is currently supported');
  const placeholders=core.placeholders(root,config['latex.outDir'],folders.find(folder=>root.startsWith(folder)),config['latex.jobname']);
  let command=config['latex.clean.command'];
  if(command==='latexmk'&&/^latexmk(?:\.exe|\.pl)?$/i.test(path.basename(step.command||'')))command=step.command;
  const args=config['latex.clean.args'].map(arg=>placeholders.expand(String(arg).replace(/%TEX%/g,root)));
  const result=await run(command,args,{cwd:path.dirname(root),env:step.env,config,log:true,capture:chunk=>job.log?.push(chunk),started:child=>job.process=child});
  if(result.code!==0)throw Error('Cleanup command failed: '+command+' (exit '+result.code+')');
  return result;
}
async function cleanProject(active){
  const root=resolveRoot(active),rootKey=core.key(root);
  if(jobs.has(rootKey))throw Error('Wait for the current build before cleaning the project');
  const job={process:null,cancelled:false,config,log:[],kind:'clean'};
  const recipe=core.recipe(root,config,folders.find(folder=>root.startsWith(folder)),undefined,lastRecipes.get(rootKey));
  job.promise=(async()=>{
    await cleanFiles(root,job,recipe.steps[0]);
    if(!job.cancelled)updateBuildDiagnostics(root,'');
    return {status:job.cancelled?3:0};
  })().finally(()=>jobs.delete(rootKey));
  jobs.set(rootKey,job);return job.promise;
}
async function build(active,recipeName){
  const config=globalConfig();
  if(!core.SOURCE.test(active))throw new Error('This language is not a LaTeX build target');
  const root=resolveRoot(active),rootKey=core.key(root);
  if(jobs.has(rootKey)){const running=jobs.get(rootKey);if(running.kind!=='build')throw Error('Wait for project cleanup before building');if(recipeName&&recipeName!==running.recipe)throw Error('Wait for the current recipe before starting a different recipe');return running.promise;}
  clearTimeout(timers.get(rootKey));timers.delete(rootKey);
  for(const filename of core.dependencies(root,docs)){const doc=docs.get(core.key(filename));if(doc&&doc.text.replace(/\r\n/g,'\n')!==doc.savedText.replace(/\r\n/g,'\n')&&doc.text.replace(/\r\n/g,'\n')!==fs.readFileSync(filename,'utf8').replace(/\r\n/g,'\n'))throw Error('Save changes before building: '+filename);}
  const recipe=core.recipe(root,config,folders.find(folder=>root.startsWith(folder)),recipeName,lastRecipes.get(rootKey));
  fs.mkdirSync(recipe.output,{recursive:true});
  const job={process:null,cancelled:false,config,log:[],kind:'build',recipe:recipe.name};
  job.promise=(async()=>{
    let status=0,combined='',failure='';
    const logPath=report.logfile(root,recipe.output);buildLogs.set(rootKey,logPath);job.log.push(new Date().toISOString(),`Building ${root} with ${recipe.name}`);
    notify('window/logMessage',{type:3,message:`Building ${root} with ${recipe.name}`});
    for(const step of recipe.steps){
      if(job.cancelled){status=3;break;}
      job.log.push('Command: '+step.command+' '+JSON.stringify(step.args),'Working directory: '+(step.cwd||recipe.cwd));
      let result;try{
        result=await recovery.retryStep({
          execute:()=>run(step.command,step.args,{cwd:step.cwd||recipe.cwd,env:step.env,config,log:true,capture:chunk=>job.log.push(chunk),started:child=>job.process=child}),
          clean:()=>cleanFiles(root,job,step),enabled:config['latex.autoBuild.cleanAndRetry.enabled']===true,
          pdf:path.join(recipe.output,(config['latex.jobname']||path.basename(root,path.extname(root)))+'.pdf'),
          cancelled:()=>job.cancelled,report:message=>{job.log.push(message);show(message,2);}
        });
      }
      catch(error){failure=`Cannot run ${step.command}: ${error.message}`;job.log.push(failure);status=2;break;}
      combined+=result.transcript||result.output+result.errors;
      if(job.cancelled){status=3;break;}
      if(result.code!==0){failure=report.reason(result.transcript||result.output+result.errors,result.code);status=1;break;}
    }
    // The final log excludes temporary first-pass reference warnings.
    const stem=config['latex.jobname'] || path.basename(root,path.extname(root));
    let log;try{if(status===2 || status===3)throw new Error('Build did not produce a log');log=fs.readFileSync(path.join(recipe.output,stem+'.log'),'utf8');}catch{log=combined;}
    updateBuildDiagnostics(root,log);lastRecipes.set(rootKey,recipe.name);
    if(failure){const values=buildDiagnostics.get(rootKey)||[];if(!values.some(item=>item.severity===1)){values.push({source:'latex-workshop',message:failure,severity:1,range:{start:{line:0,character:0},end:{line:0,character:1}}});buildDiagnostics.set(rootKey,values);const files=diagnosticFiles.get(rootKey)||new Set();files.add(rootKey);diagnosticFiles.set(rootKey,files);refresh();}}
    job.log.push('Build finished with status '+status,failure);
    try{report.save(logPath,job.log);}catch(error){show('Cannot save build log: '+error.message,2);}
    if(status!==0 && status!==3)show('LaTeX build failed ('+recipe.name+'): '+failure+'\nBuild log: '+logPath);
    return {status,root:core.uri(root),recipe:recipe.name,log:core.uri(logPath),...(failure?{message:failure}:{})};
  })().finally(()=>jobs.delete(rootKey));
  jobs.set(rootKey,job);return job.promise;
}
function terminate(job){
  job.cancelled=true;
  const child=job.process;if(!child || child.exitCode!==null || child.signalCode!==null)return;
  if(process.platform==='win32')spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',()=>child.kill());
  else child.kill();
}
function schedule(active){
  let root;try{root=resolveRoot(active);}catch{return;}
  const rootKey=core.key(root);clearTimeout(timers.get(rootKey));
  timers.set(rootKey,setTimeout(async()=>{
    timers.delete(rootKey);
    if(jobs.has(rootKey)){await jobs.get(rootKey).promise;schedule(active);return;}
    try{await build(active);}catch(error){show(error.message);}
  },Math.max(100,Number(config['latex.autoBuild.interval'])||1000)));
}
function completions(url,pos){
  const source=text(url),end=core.offset(source,pos),before=core.mask(source.slice(0,end)),filename=core.file(url),idx=projectIndex(filename);
  const match=/\\([A-Za-z]+)\*?(?:\[[^\]]*\])*\{([^{}]*)$/.exec(before);
  if(match){
    const command=match[1],prefix=match[2].split(',').at(-1).trim();let entries=[];
    if(/^(?:[a-zA-Z]*cite[a-zA-Z]*|nocite)$/.test(command))entries=[...idx.citations].map(([label,data])=>({label,kind:18,detail:data.detail}));
    else if(/^(?:ref|eqref|pageref|autoref|cref|Cref|vref)$/.test(command))entries=[...idx.labels].map(([label])=>({label,kind:18}));
    else if(command==='begin'||command==='end')entries=[...new Set([...ENVS,...idx.environments.keys()])].map(label=>({label,kind:13}));
    else if(/^(?:input|include|subfile|includegraphics)$/.test(command))entries=idx.files.filter(file=>file!==filename).map(file=>({label:path.relative(path.dirname(filename),file).replace(/\\/g,'/').replace(/\.tex$/i,''),kind:17}));
    return entries.filter(item=>item.label.toLowerCase().startsWith(prefix.toLowerCase())).map(item=>({...item,insertText:item.label}));
  }
  const prefix=/\\([A-Za-z@_:]*)$/.exec(before)?.[1];if(prefix===undefined)return [];
  return [...new Set([...COMMANDS,...idx.commands.keys()])].filter(name=>name.toLowerCase().startsWith(prefix.toLowerCase())).map(name=>({label:'\\'+name,kind:3,insertText:name}));
}
function symbolAt(url,pos){
  const source=text(url),end=core.offset(source,pos),before=source.slice(0,end),after=source.slice(end);
  const left=/[^{}\s,\\]*$/.exec(before)[0],right=/^[^{}\s,\\]*/.exec(after)[0];
  return left+right;
}
function definition(url,pos){const idx=projectIndex(core.file(url)),name=symbolAt(url,pos);const entry=idx.labels.get(name)||idx.citations.get(name)||idx.commands.get(name)||idx.environments.get(name);return entry?[{uri:core.uri(entry.file),range:entry.range}]:[];}
function bibFormat(source,spaces){
  // Preserve comments, braced/quoted values and string expressions verbatim.
  let result='',cursor=0;
  const pattern=/@([A-Za-z]+)\s*\{/g;let match;
  while((match=pattern.exec(source))){
    result+=source.slice(cursor,match.index);let depth=1,quote=false,end=pattern.lastIndex;
    for(;end<source.length && depth;end++){const ch=source[end];if(ch==='\\'){end++;continue;}if(ch==='"' && depth===1)quote=!quote;if(!quote){if(ch==='{')depth++;if(ch==='}')depth--;}}
    if(depth)return source;
    const body=source.slice(pattern.lastIndex,end-1),parts=[];let start=0,level=0,inQuote=false;
    for(let i=0;i<body.length;i++){const ch=body[i];if(ch==='\\'){i++;continue;}if(ch==='"' && level===0)inQuote=!inQuote;if(!inQuote){if(ch==='{')level++;if(ch==='}')level--;if(ch===','&&level===0){parts.push(body.slice(start,i).trim());start=i+1;}}}
    parts.push(body.slice(start).trim());
    if(/^(comment|preamble|string)$/i.test(match[1]) || parts.some(part=>/^%/.test(part)))result+=source.slice(match.index,end);
    else result+='@'+match[1]+'{'+parts.shift()+',\n'+parts.filter(Boolean).map(part=>spaces+part.replace(/^([^=]+?)\s*=\s*/,(_,key)=>key.trim()+' = ')+',').join('\n')+'\n}';
    cursor=end;pattern.lastIndex=end;
  }
  return result+source.slice(cursor);
}
async function format(url,options){
  const filename=core.file(url),source=text(url),indent=options.insertSpaces?' '.repeat(options.tabSize):'\t';let formatted;
  if(/\.(bib|bibtex|biblatex)$/i.test(filename))formatted=bibFormat(source,indent);
  else{
    const formatter=config['formatting.latex'];if(formatter==='none')return [];
    const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'zed-latex-format-'));
    const temporaryFile=path.join(temporary,'input.tex');fs.writeFileSync(temporaryFile,source);
    try{
      const args=formatter==='tex-fmt'?[...(config['formatting.tex-fmt.args'] || ['--nowrap']),'--stdin']:(config['formatting.latexindent.args'] || []).map(arg=>String(arg).replace(/%TMPFILE%/g,temporaryFile).replace(/%DIR%/g,temporary).replace(/%INDENT%/g,indent));
      const command=config[`formatting.${formatter}.path`] || formatter;
      const result=await run(command,args,{cwd:path.dirname(filename),input:formatter==='tex-fmt'?source:undefined});
      if(result.code!==0)throw new Error(result.errors || 'Formatter exited with code '+result.code);
      formatted=result.output;
    }catch(error){throw new Error(`LaTeX formatting requires ${formatter} on PATH (or formatting.${formatter}.path): ${error.message}`);}
    finally{fs.rmSync(temporary,{recursive:true,force:true});}
  }
  return formatted===source?[]:[{range:core.range(source,0,source.length),newText:formatted}];
}
function actions(url){
  const filename=core.file(url);if(!core.TEX.test(filename))return [];
  const result=[{title:'Build LaTeX project',kind:'source',command:{title:'Build LaTeX project',command:'latex-workshop.build',arguments:[url]}}];
  result.push({title:'Clean LaTeX project',kind:'source',command:{title:'Clean LaTeX project',command:'latex-workshop.clean',arguments:[url]}});
  result.push({title:'Show LaTeX build log',kind:'source',command:{title:'Show LaTeX build log',command:'latex-workshop.showLog',arguments:[url]}});
  for(const recipe of config['latex.recipes'])result.push({title:'Build with recipe: '+recipe.name,kind:'source',command:{title:recipe.name,command:'latex-workshop.recipes',arguments:[url,recipe.name]}});
  if(jobs.size)result.push({title:'Terminate LaTeX compilation',kind:'source',command:{title:'Terminate compilation',command:'latex-workshop.kill'}});
  return result;
}
function lenses(url){
  if(!core.TEX.test(core.file(url)))return [];
  const source=text(url),match=/\\documentclass\b/.exec(core.mask(source));
  const position=core.position(source,match?.index||0),range={start:position,end:position};
  return [{range,command:{title:'Build LaTeX project',command:'latex-workshop.build',arguments:[url]}},{range,command:{title:'Clean LaTeX project',command:'latex-workshop.clean',arguments:[url]}}];
}
async function openBuildLog(active){
  const root=resolveRoot(active),rootKey=core.key(root);
  const filename=buildLogs.get(rootKey)||report.logfile(root,core.placeholders(root,config['latex.outDir'],folders[0]).output);
  if(!fs.existsSync(filename))throw Error('No saved build log. Build the project first.');
  const result=await request('window/showDocument',{uri:core.uri(filename),external:false,takeFocus:true});
  if(!result?.success)throw Error('The editor could not open the build log: '+filename);
  return result;
}
async function handle(method,params){
  if(method==='initialize'){
    folders=core.workspaceRoots(params);
    configure(params.initializationOptions || {});
    return {capabilities:{textDocumentSync:{openClose:true,change:1,save:{includeText:true}},completionProvider:{triggerCharacters:['\\','{',',']},definitionProvider:true,referencesProvider:true,renameProvider:{prepareProvider:true},hoverProvider:true,documentSymbolProvider:true,documentFormattingProvider:true,codeActionProvider:true,codeLensProvider:{resolveProvider:false},executeCommandProvider:{commands:['latex-workshop.build','latex-workshop.recipes','latex-workshop.clean','latex-workshop.kill','latex-workshop.showLog']},workspace:{workspaceFolders:{supported:true,changeNotifications:true}}},serverInfo:{name:'LaTeX Workshop for Zed',version:'0.4.6'}};
  }
  if(method==='initialized'){
    // Zed supplies workspace configuration after initialization; request it too.
    request('workspace/configuration',{items:[{}]}).then(items=>{if(items?.[0]!=null)configure(items[0]);}).catch(()=>{});return;
  }
  if(method==='shutdown'){shutdown=true;for(const timer of timers.values())clearTimeout(timer);for(const job of jobs.values()){terminate(job);}return null;}
  if(method==='exit'){process.exit(shutdown?0:1);}
  if(method==='workspace/didChangeConfiguration'){configure(params.settings || {});return;}
  if(method==='workspace/didChangeWorkspaceFolders'){folders=folders.filter(folder=>!params.event.removed.some(item=>core.key(core.file(item.uri))===core.key(folder)));folders.push(...params.event.added.map(item=>core.file(item.uri)));return;}
  if(method==='textDocument/didOpen'){
    const item=params.textDocument,filename=core.file(item.uri);if(!core.SOURCE.test(filename))return;
    item.savedText=fs.existsSync(filename)?fs.readFileSync(filename,'utf8'):'';docs.set(core.key(filename),item);publish(filename);return;
  }
  if(method==='textDocument/didChange'){
    const doc=document(params.textDocument.uri);if(!doc)return;doc.text=params.contentChanges.at(-1).text;doc.version=params.textDocument.version;publish(core.file(doc.uri));return;
  }
  if(method==='textDocument/didSave'){
    const filename=core.file(params.textDocument.uri),doc=document(params.textDocument.uri);if(params.text!==undefined && doc)doc.text=params.text;if(doc)doc.savedText=doc.text;
    const mode=config['latex.autoBuild.run'];
    if(mode==='onFileChange' || (mode==='onSave' && /\.(tex|latex|bib)$/i.test(filename)))schedule(filename);return;
  }
  if(method==='textDocument/didClose'){docs.delete(core.key(core.file(params.textDocument.uri)));return;}
  if(method==='workspace/didChangeWatchedFiles'){
    for(const change of params.changes){const filename=core.file(change.uri);if(core.SOURCE.test(filename)){refresh();if(config['latex.autoBuild.run']==='onFileChange')schedule(filename);}}return;
  }
  if(method==='textDocument/completion')return completions(params.textDocument.uri,params.position);
  if(method==='textDocument/definition')return definition(params.textDocument.uri,params.position);
  if(['textDocument/references','textDocument/prepareRename','textDocument/rename'].includes(method)){
    const file=core.file(params.textDocument.uri),files=[...core.dependencies(resolveRoot(file),docs)],items=references.occurrences(files,docs),target=references.at(items,file,params.position);
    if(!target)return method==='textDocument/references'?[]:null;
    if(method==='textDocument/prepareRename')return {range:target.range,placeholder:target.name};
    if(method==='textDocument/rename')return references.rename(items,target,params.newName);
    return items.filter(item=>item.kind===target.kind&&item.name===target.name&&(params.context?.includeDeclaration||!item.declaration)).map(item=>({uri:core.uri(item.file),range:item.range}));
  }
  if(method==='textDocument/hover'){

    const entry=definition(params.textDocument.uri,params.position)[0];return entry?{contents:{kind:'plaintext',value:symbolAt(params.textDocument.uri,params.position)+' — '+core.file(entry.uri)}}:null;
  }
  if(method==='textDocument/documentSymbol')return core.symbols(text(params.textDocument.uri));
  if(method==='textDocument/formatting')return format(params.textDocument.uri,params.options);
  if(method==='textDocument/codeLens')return lenses(params.textDocument.uri);
  if(method==='textDocument/codeAction')return actions(params.textDocument.uri);
  if(method==='textDocument/build')return build(core.file(params.textDocument.uri),params.recipe);
  if(method==='workspace/executeCommand'){
    if(params.command==='latex-workshop.build'||params.command==='latex-workshop.recipes')return build(core.file(params.arguments[0]),params.arguments[1]);
    if(params.command==='latex-workshop.showLog')return openBuildLog(core.file(params.arguments[0]));
    if(params.command==='latex-workshop.clean')return cleanProject(core.file(params.arguments[0]));
    if(params.command==='latex-workshop.kill'){for(const job of jobs.values()){terminate(job);}return null;}
  }
  if(method==='$/cancelRequest'||method==='$/setTrace')return;
  const error=new Error('Method not found: '+method);error.code=-32601;throw error;
}
process.stdin.on('data',chunk=>{
  input=Buffer.concat([input,chunk]);
  while(true){
    const end=input.indexOf('\r\n\r\n');if(end<0)return;
    const header=/Content-Length:\s*(\d+)/i.exec(input.subarray(0,end).toString());if(!header){process.exitCode=1;return;}
    const size=Number(header[1]);if(input.length<end+4+size)return;
    let message;try{message=JSON.parse(input.subarray(end+4,end+4+size));}catch{send({id:null,error:{code:-32700,message:'Invalid JSON'}});}
    input=input.subarray(end+4+size);if(!message)continue;
    if(message.method){Promise.resolve().then(()=>handle(message.method,message.params || {})).then(result=>{if(message.id!==undefined)send({id:message.id,result:result ?? null});}).catch(error=>{if(message.id!==undefined)send({id:message.id,error:{code:error.code || -32603,message:error.message}});else show(error.message);});}
    else if(pending.has(message.id)){const item=pending.get(message.id);pending.delete(message.id);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);}
  }
});
process.stdin.on('end',()=>{for(const timer of timers.values())clearTimeout(timer);for(const job of jobs.values())terminate(job);process.exit();});
// Poll only known source dependencies; generated outputs never trigger rebuild loops.
setInterval(()=>{
  if(shutdown)return;
  const roots=new Set();for(const filename of docs.keys()){try{roots.add(resolveRoot(filename));}catch{}}
  for(const root of roots){
    if(!jobs.has(core.key(root))){try{
      const output=core.placeholders(root,config['latex.outDir'],folders.find(folder=>root.startsWith(folder)),config['latex.jobname']).output;
      const stem=config['latex.jobname']||path.basename(root,path.extname(root));
      const log=logSync.read(path.join(output,stem+'.log'));if(log!==null)updateBuildDiagnostics(root,log);
    }catch(error){notify('window/logMessage',{type:2,message:'Cannot refresh external build diagnostics: '+error.message});}}
    if(config['latex.autoBuild.run']!=='onFileChange')continue;
    for(const filename of core.dependencies(root,docs)){
    let timestamp;try{timestamp=fs.statSync(filename).mtimeMs;}catch{continue;}
    if(observed.has(filename) && observed.get(filename)!==timestamp)schedule(filename);
    observed.set(filename,timestamp);
    }
  }
},500).unref();
