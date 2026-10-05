'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const core=require('./core.cjs');
const recovery=require('./build-retry.cjs');
const report=require('./build-report.cjs');
const tools=require('./tools.cjs');
const configCheck=require('./config-check.cjs');
const references=require('./references.cjs');
const completion=require('./completion.cjs');
const preview=require('./hover.cjs');
const commandHelp=require('./command-help.cjs');
const packageData=require('./package-data.cjs');
const texCatalog=new Map();
const logSync=new (require('./log-sync.cjs').LogSync)();
const diagnosticFiles=new Map(),publishedDiagnostics=new Set();
const docs=new Map(), jobs=new Map(), buildDiagnostics=new Map(), timers=new Map(), lastRecipes=new Map();
const buildLogs=new Map(), buildStates=new Map();
let clientCapabilities={}, progressSerial=0;
let folders=[], config=core.settings(), input=Buffer.alloc(0), requestId=0, shutdown=false;
const pending=new Map(), observed=new Map();
const COMMANDS=['documentclass','usepackage','input','include','begin','end','section','subsection','subsubsection','chapter','part','paragraph','label','ref','eqref','pageref','autoref','cref','cite','citep','citet','textcite','parencite','bibliography','bibliographystyle','addbibresource','printbibliography','caption','includegraphics','centering','item','textbf','textit','emph','footnote','newcommand','renewcommand','newenvironment','frac','sqrt','sum','prod','int','alpha','beta','gamma','delta','epsilon','theta','lambda','mu','pi','sigma','phi','omega','left','right','mathrm','mathbf','mathbb','operatorname','ExplSyntaxOn','ExplSyntaxOff'];
const ENVS=['document','figure','table','itemize','enumerate','description','equation','equation*','align','align*','gather','gather*','matrix','pmatrix','bmatrix','tabular','center','quote','verbatim'];
function send(message){const body=Buffer.from(JSON.stringify({jsonrpc:'2.0',...message}));process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);process.stdout.write(body);}
function notify(method,params){send({method,params});}
function show(message,type=1){notify('window/showMessage',{type,message});}
function request(method,params,timeoutMs=0){return new Promise((resolve,reject)=>{const id=++requestId;const timer=timeoutMs?setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},timeoutMs).unref():null;pending.set(id,{resolve,reject,timer});send({id,method,params});});}
function refreshLenses(){if(clientCapabilities.workspace?.codeLens?.refreshSupport)request('workspace/codeLens/refresh',{},1500).catch(()=>{});}
async function beginProgress(job,root,recipe){
  if(!clientCapabilities.window?.workDoneProgress)return;
  const token='latex-build-'+(++progressSerial);job.progress=token;
  try{await request('window/workDoneProgress/create',{token},1500);job.progressStarted=true;notify('$/progress',{token,value:{kind:'begin',title:'LaTeX: '+path.basename(root),message:recipe,cancellable:true}});}catch{job.progress=null;}
}
function stepProgress(job,message){if(job.progressStarted)notify('$/progress',{token:job.progress,value:{kind:'report',message,cancellable:true}});}
function endProgress(job,message){if(job.progressStarted){notify('$/progress',{token:job.progress,value:{kind:'end',message}});job.progressStarted=false;}}
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
function projectIndex(active){let files;try{files=[...core.dependencies(resolveRoot(active),docs)];}catch{files=folders.flatMap(folder=>core.scan(folder));}const context=packageData.context(files,folders,docs);return {...core.index([...new Set([...[...context.localFiles].reverse(),...files])],docs),...context};}
function publish(filename){
  const filenameKey=core.key(filename),url=core.uri(filename),doc=docs.get(filenameKey);
  if(!doc&&!buildDiagnostics.has(filenameKey)&&!publishedDiagnostics.has(filenameKey))return;
  const diagnostics=[...(doc?core.syntaxDiagnostics(doc.text,filename):[]),...(buildDiagnostics.get(filenameKey)||[])];
  notify('textDocument/publishDiagnostics',{uri:doc?.uri||url,...(doc?{version:doc.version}:{}),diagnostics});
  if(diagnostics.length)publishedDiagnostics.add(filenameKey);else publishedDiagnostics.delete(filenameKey);
}
function refresh(){for(const filename of new Set([...docs.keys(),...buildDiagnostics.keys(),...publishedDiagnostics]))publish(filename);}
function run(command,args,options={}){
  return new Promise((resolve,reject)=>{
    const launch=tools.launch(command,{overrides:options.env,directories:(options.config||config)['latex.tools.searchPaths'],cwd:options.cwd});
    const child=spawn(launch.command,args,{cwd:options.cwd,env:launch.env,windowsHide:true});
    options.started?.(child);let output='',errors='',transcript='';
    const timeout=options.timeoutMs?setTimeout(()=>child.kill(),options.timeoutMs).unref():null;
    child.stdout.on('data',chunk=>{output+=chunk;transcript+=chunk;options.capture?.(chunk.toString());if(options.log)notify('window/logMessage',{type:4,message:chunk.toString()});});
    child.stderr.on('data',chunk=>{errors+=chunk;transcript+=chunk;options.capture?.(chunk.toString());if(options.log)notify('window/logMessage',{type:4,message:chunk.toString()});});
    child.on('error',error=>{clearTimeout(timeout);reject(error);});child.on('close',(code,signal)=>{clearTimeout(timeout);resolve({code,signal,output,errors,transcript});});
    if(options.input!==undefined)child.stdin.end(options.input);else child.stdin.end();
  });
}
function updateBuildDiagnostics(root,log,cwd){
  const rootKey=core.key(root),parsed=core.logDiagnostics(log,root,{cwd,files:[...core.dependencies(root,docs)],docs});
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
async function build(active,recipeName,manual=true){
  const config=globalConfig();
  if(!core.SOURCE.test(active))throw new Error('This language is not a LaTeX build target');
  const root=resolveRoot(active),rootKey=core.key(root);
  if(jobs.has(rootKey)){const running=jobs.get(rootKey);if(running.kind!=='build')throw Error('Wait for project cleanup before building');if(recipeName&&recipeName!==running.recipe)throw Error('Wait for the current recipe before starting a different recipe');return running.promise;}
  clearTimeout(timers.get(rootKey));timers.delete(rootKey);
  for(const filename of core.dependencies(root,docs)){const doc=docs.get(core.key(filename));if(doc&&doc.text.replace(/\r\n/g,'\n')!==doc.savedText.replace(/\r\n/g,'\n')&&doc.text.replace(/\r\n/g,'\n')!==fs.readFileSync(filename,'utf8').replace(/\r\n/g,'\n'))throw Error('Save changes before building: '+filename);}
  const recipe=core.recipe(root,config,folders.find(folder=>root.startsWith(folder)),recipeName,lastRecipes.get(rootKey));
  fs.mkdirSync(recipe.output,{recursive:true});
  const job={process:null,cancelled:false,config,log:[],kind:'build',recipe:recipe.name,startedAt:Date.now()};
  buildStates.set(rootKey,{running:true,recipe:recipe.name});refreshLenses();
  job.promise=(async()=>{
    let status=0,combined='',failure='';
    await beginProgress(job,root,recipe.name);if(manual)show('Compiling '+path.basename(root)+' — '+recipe.name,3);
    const logPath=report.logfile(root,recipe.output);buildLogs.set(rootKey,logPath);job.log.push(new Date().toISOString(),`Building ${root} with ${recipe.name}`);
    notify('window/logMessage',{type:3,message:`Building ${root} with ${recipe.name}`});
    for(const step of recipe.steps){
      if(job.cancelled){status=3;break;}
      job.log.push('Command: '+step.command+' '+JSON.stringify(step.args),'Working directory: '+(step.cwd||recipe.cwd));
      stepProgress(job,step.command);
      let result;try{
        result=await recovery.retryStep({
          execute:()=>run(step.command,step.args,{cwd:step.cwd||recipe.cwd,env:step.env,config,log:true,capture:chunk=>job.log.push(chunk),started:child=>job.process=child}),
          clean:()=>cleanFiles(root,job,step),enabled:config['latex.autoBuild.cleanAndRetry.enabled']===true,
          pdf:path.join(recipe.output,(config['latex.jobname']||path.basename(root,path.extname(root)))+'.pdf'),
          cancelled:()=>job.cancelled,report:message=>{job.log.push(message);stepProgress(job,message);show(message,2);}
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
    updateBuildDiagnostics(root,log,recipe.cwd);lastRecipes.set(rootKey,recipe.name);
    if(failure){const values=buildDiagnostics.get(rootKey)||[];if(![...(diagnosticFiles.get(rootKey)||[])].some(filename=>(buildDiagnostics.get(filename)||[]).some(item=>item.severity===1))){values.push({source:'latex-workshop',message:failure,severity:1,range:{start:{line:0,character:0},end:{line:0,character:1}}});buildDiagnostics.set(rootKey,values);const files=diagnosticFiles.get(rootKey)||new Set();files.add(rootKey);diagnosticFiles.set(rootKey,files);refresh();}}
    const elapsedMs=Date.now()-job.startedAt,elapsed=(elapsedMs/1000).toFixed(1)+'s';
    const outcome=status===0?'Succeeded':status===3?'Cancelled':'Failed';
    const summary=outcome+' — '+recipe.name+' — '+elapsed;
    buildStates.set(rootKey,{running:false,recipe:recipe.name,summary,status,elapsedMs});endProgress(job,summary);refreshLenses();
    job.log.push('Build finished with status '+status,summary,failure);
    if(manual&&(status===0||status===3))show('LaTeX '+summary+'\nBuild log: '+logPath,3);
    try{report.save(logPath,job.log);}catch(error){show('Cannot save build log: '+error.message,2);}
    if(status!==0 && status!==3)show('LaTeX build failed ('+recipe.name+'): '+failure+'\nBuild log: '+logPath);
    return {status,elapsedMs,root:core.uri(root),recipe:recipe.name,log:core.uri(logPath),...(failure?{message:failure}:{})};
  })().catch(error=>{buildStates.set(rootKey,{running:false,recipe:recipe.name,summary:'Failed — '+error.message,status:2});throw error;}).finally(()=>{endProgress(job,'Compilation ended');jobs.delete(rootKey);refreshLenses();});
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
    try{await build(active,undefined,false);}catch(error){show(error.message);}
  },Math.max(100,Number(config['latex.autoBuild.interval'])||1000)));
}
async function installedTexNames(){
  const directories=[...config['latex.tools.searchPaths'],...config['latex.tools'].filter(tool=>path.isAbsolute(tool.command)).map(tool=>path.dirname(tool.command))];
  const key=JSON.stringify(directories),catalogConfig={...config,'latex.tools.searchPaths':directories};if(texCatalog.has(key))return texCatalog.get(key);
  const result=(async()=>{try{const processResult=await run('kpsewhich',['--var-value=TEXMFDIST'],{cwd:folders[0],config:catalogConfig,timeoutMs:3000});if(processResult.code!==0)return {packages:[],classes:[]};const directory=processResult.output.trim();if(!directory)return {packages:[],classes:[]};return completion.parseDatabase(await fs.promises.readFile(path.join(directory,'ls-R'),'utf8'));}catch{return {packages:[],classes:[]};}})();texCatalog.set(key,result);return result;
}
function commandInfo(name,idx){
  const entry=idx.commands.get(name);
  if(entry){const source=core.read(entry.file,docs),signature=commandHelp.custom(name,source,entry)||'\\'+name;const snippet=signature.slice(1).replace(/参数(\d)/g,(_,n)=>String.fromCharCode(36)+'{'+n+':参数'+n+'}');return {signature,snippet,documentation:signature+'\n自定义命令\n\n'+preview.context(source,entry.range.start.line)+'\n\n定义：'+entry.file+':'+(entry.range.start.line+1)};}
  const record=idx.packageCommands.get(name),help=commandHelp.HELP[name];
  if(record)return {signature:record.signature,snippet:record.snippet,documentation:[...record.variants.slice(0,4),'宏包：'+record.package,help?.[1]||record.description].filter(Boolean).join('\n\n')};
  if(help)return {signature:help[0],snippet:completion.snippets(name)?.[0]||name,documentation:help[0]+'\n\n'+help[1]};
  return null;
}
async function completions(url,pos){
  const source=text(url),end=core.offset(source,pos),before=core.mask(source.slice(0,end)),filename=core.file(url),idx=projectIndex(filename);
  const options=/\\([A-Za-z]+)\*?\s*\[([^\]]*)$/.exec(before);
  if(options&&!/[\\{}]/.test(options[2].split(',').at(-1))){const prefix=options[2].split(',').at(-1).trimStart(),editRange=core.range(source,end-prefix.length,end),snippets=clientCapabilities.textDocument?.completion?.completionItem?.snippetSupport;return (idx.packageKeys.get('\\'+options[1])||[]).filter(value=>packageData.plain(value).toLowerCase().startsWith(prefix.toLowerCase())).map(value=>({label:packageData.plain(value),kind:10,detail:options[1]+' option',textEdit:{range:editRange,newText:snippets?packageData.cleanSnippet(value):value.split('=')[0]+(value.includes('=')?'=':'')},...(snippets?{insertTextFormat:2}:{})}));}
  const match=/\\([A-Za-z]+)\*?(?:\[[^\]]*\])*\s*\{([^{}]*)$/.exec(before);
  if(match){
    const command=match[1],prefix=match[2].split(',').at(-1).trimStart();let entries=[];
    if(completion.FILE_COMMANDS.has(command)){let root;try{root=resolveRoot(filename);}catch{root=filename;}entries=completion.paths(filename,root,command,prefix);}
    else if(command==='usepackage'||command==='RequirePackage'||command==='documentclass'){const names=await installedTexNames();const extension=command==='documentclass'?'.cls':'.sty';const local=folders.flatMap(folder=>core.scan(folder)).filter(file=>file.endsWith(extension)).map(file=>path.basename(file,extension));entries=[...new Set([...(command==='documentclass'?names.classes:names.packages),...local])].map(label=>({label,kind:9,detail:extension.slice(1)+' available locally'}));}
    else if(/^(?:[a-zA-Z]*cite[a-zA-Z]*|nocite)$/.test(command))entries=[...idx.citations].map(([label,data])=>({label,kind:18,detail:data.detail}));
    else if(/^(?:ref|eqref|pageref|autoref|cref|Cref|vref)$/.test(command))entries=[...idx.labels].map(([label])=>({label,kind:18}));
    else if(command==='begin'||command==='end')entries=[...new Set([...ENVS.filter(name=>!packageData.REQUIRED_ENVS[name]||idx.packages.has(packageData.REQUIRED_ENVS[name])),...idx.packageEnvironments.keys(),...idx.environments.keys()])].map(label=>({label,kind:13,detail:idx.packageEnvironments.has(label)?'宏包：'+idx.packageEnvironments.get(label).package:undefined}));
    const context=completion.context(source,pos),editRange=core.range(source,context.start,context.end);
    return entries.filter(item=>item.label.toLowerCase().startsWith(prefix.toLowerCase())).map(({target,...item})=>({...item,textEdit:{range:editRange,newText:item.label}}));
  }
  const prefix=/\\([A-Za-z@_:]*\*?)$/.exec(before)?.[1];if(prefix===undefined)return [];
  const names=[...new Set([...COMMANDS,...Object.keys(commandHelp.HELP)].filter(name=>!packageData.REQUIRED[name]||idx.packages.has(packageData.REQUIRED[name])).concat([...idx.packageCommands.keys(),...idx.commands.keys()]))];
  return names.filter(name=>name.toLowerCase().startsWith(prefix.toLowerCase())).map(name=>{const info=commandInfo(name,idx),snippet=clientCapabilities.textDocument?.completion?.completionItem?.snippetSupport&&info?.snippet;return {label:'\\'+name,kind:3,insertText:snippet||name,...(info?{detail:info.signature,documentation:{kind:'plaintext',value:info.documentation}}:{}),...(snippet?{insertTextFormat:2}:{})};});
}
function symbolAt(url,pos){
  const source=text(url),end=core.offset(source,pos),before=source.slice(0,end),after=source.slice(end);
  const left=/[^{}\s,\\]*$/.exec(before)[0],right=/^[^{}\s,\\]*/.exec(after)[0];
  return left+right;
}
function referenceTarget(url,pos){
  const filename=core.file(url);let files;try{files=[...core.dependencies(resolveRoot(filename),docs)];}catch{return null;}
  const items=references.occurrences(files,docs),target=references.at(items,filename,pos);if(!target)return null;
  return {target,definitions:items.filter(item=>item.declaration&&item.name===target.name&&item.kind===target.kind)};
}
function definition(url,pos){
  const source=text(url),at=core.offset(source,pos),span=source.slice(Math.max(0,at-1),at+1);if(core.mask(source).slice(Math.max(0,at-1),at+1)!==span)return [];
  let root;try{root=resolveRoot(core.file(url));}catch{root=core.file(url);}const files=completion.pathDefinition(text(url),pos,core.file(url),root);if(files.length)return files;
  const reference=referenceTarget(url,pos);if(reference)return reference.definitions.map(item=>({uri:core.uri(item.file),range:item.range}));
  const idx=projectIndex(core.file(url)),name=symbolAt(url,pos),entry=idx.commands.get(name)||idx.environments.get(name);return entry?[{uri:core.uri(entry.file),range:entry.range}]:[];
}
function hover(url,pos){
  const command=commandHelp.at(text(url),pos);
  if(command){const idx=projectIndex(core.file(url)),raw=command.name+(text(url).slice(core.offset(text(url),command.range.start),core.offset(text(url),command.range.end)).endsWith('*')?'*':''),info=commandInfo(raw,idx)||commandInfo(command.name,idx);if(info)return {range:command.range,contents:{kind:'plaintext',value:info.documentation}};}
  const reference=referenceTarget(url,pos);
  if(reference){const {target,definitions}=reference;if(!definitions.length)return null;if(definitions.length>1)return {range:target.range,contents:{kind:'plaintext',value:target.name+' — multiple definitions\n'+definitions.map(item=>item.file+':'+(item.range.start.line+1)).join('\n')}};
    const entry=definitions[0],source=core.read(entry.file,docs),where=entry.file+':'+(entry.range.start.line+1);let value;
    if(target.kind==='citation'){const bib=preview.bibliography(source,core.offset(source,entry.range.start));const fields=bib?.fields||{};value=[target.name+(bib?' ('+bib.type+')':''),fields.title,fields.author||fields.editor,fields.year||fields.date,fields.journal||fields.booktitle||fields.publisher,fields.doi?'DOI: '+fields.doi:undefined,where].filter(Boolean).join('\n');}
    else value=target.name+'\n'+where+'\n\n'+preview.context(source,entry.range.start.line);
    return {range:target.range,contents:{kind:'plaintext',value}};
  }
  const entry=definition(url,pos)[0];if(!entry)return null;const file=core.file(entry.uri);return {contents:{kind:'plaintext',value:symbolAt(url,pos)+' — '+file+':'+(entry.range.start.line+1)+'\n\n'+preview.context(core.read(file,docs),entry.range.start.line)}};
}

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
  result.push({title:'Check LaTeX configuration and tools',kind:'source',command:{title:'Check LaTeX configuration and tools',command:'latex-workshop.checkTools',arguments:[url]}});
  result.push({title:'Show LaTeX build log',kind:'source',command:{title:'Show LaTeX build log',command:'latex-workshop.showLog',arguments:[url]}});
  for(const recipe of (Array.isArray(config['latex.recipes'])?config['latex.recipes']:[]).filter(item=>item&&typeof item.name==='string'))result.push({title:'Build with recipe: '+recipe.name,kind:'source',command:{title:recipe.name,command:'latex-workshop.recipes',arguments:[url,recipe.name]}});
  if(jobs.size)result.push({title:'Terminate LaTeX compilation',kind:'source',command:{title:'Terminate compilation',command:'latex-workshop.kill',arguments:[url]}});
  return result;
}
function lenses(url){
  if(!core.TEX.test(core.file(url)))return [];
  const source=text(url),match=/\\documentclass\b/.exec(core.mask(source));
  const position=core.position(source,match?.index||0),range={start:position,end:position};
  let state;try{state=buildStates.get(core.key(resolveRoot(core.file(url))));}catch{}
  const result=[{range,command:{title:state?.running?'[ ■ 停止 ] 正在编译 '+state.recipe:state?.summary?'[ ▶ 编译 ] '+state.summary:'[ ▶ 编译 ]',command:state?.running?'latex-workshop.kill':'latex-workshop.build',arguments:[url]}},{range,command:{title:'[ 清理 ]',command:'latex-workshop.clean',arguments:[url]}}];
  if(!state?.running&&state?.summary)result.push({range,command:{title:'[ 日志 ]',command:'latex-workshop.showLog',arguments:[url]}});
  return result;
}
function workspaceSymbols(query){
  const result=[],needle=(query||'').toLowerCase();
  for(const folder of folders)for(const filename of core.scan(folder)){
    if(!core.TEX.test(filename))continue;let source;try{source=core.read(filename,docs);}catch{continue;}
    function visit(items){for(const item of items){if(item.name.toLowerCase().includes(needle))result.push({name:item.name,kind:item.kind,location:{uri:core.uri(filename),range:item.selectionRange},containerName:path.relative(folder,filename)});visit(item.children||[]);}}
    visit(core.symbols(source));if(result.length>=200)return result.slice(0,200);
  }return result;
}
async function checkTools(active){
  let root,rootIssue;try{root=resolveRoot(active);if(!fs.statSync(root).isFile())throw Error('Main file is not a file: '+root);}catch(error){root=active;rootIssue={setting:'latex.rootFile',severity:'error',message:error.message,hint:'Open the project folder and set % !TeX root = relative/path.tex, or configure latex.rootFile with an existing main file.'};}
  const checked=rootIssue?{issues:configCheck.validate(config),rows:['[SKIPPED] Executable checks: main file could not be resolved.'],recipe:null,missing:0}:configCheck.inspect(config,root,folders.find(folder=>root.startsWith(folder)),lastRecipes.get(core.key(root)));
  if(rootIssue)checked.issues.unshift(rootIssue);
  const rows=['LaTeX configuration and tool check',new Date().toISOString(),'Project: '+root,'Recipe: '+(checked.recipe?.name||'(unavailable)'),'Output: '+(checked.recipe?.output||'(unavailable)'),'Node: '+process.version+' — '+process.execPath,'',...checked.rows];
  let filename=null;
  try{const output=checked.issues.some(issue=>issue.severity==='error'&&issue.setting==='latex.outDir'&&/placeholder/i.test(issue.message))?path.join(path.dirname(root),'build'):(checked.recipe?.output||path.join(path.dirname(root),'build'));filename=path.join(output,path.basename(root,path.extname(root))+'.latex-workshop-tools.log');}catch{}
  function detail(){return [...rows,'',...checked.issues.flatMap(issue=>['['+issue.severity.toUpperCase()+'] '+issue.setting+': '+issue.message,'  Fix: '+issue.hint]),'','No settings or environment variables were modified.'];}
  if(filename)try{report.save(filename,detail());}catch(error){checked.issues.push({setting:'report path',severity:'warning',message:'Cannot save report: '+error.message,hint:'Choose a writable latex.outDir. The full report is available in the language-server log.'});filename=null;}
  const errors=checked.issues.filter(issue=>issue.severity==='error').length,warnings=checked.issues.filter(issue=>issue.severity==='warning').length;
  const summary='LaTeX configuration: '+errors+' errors, '+warnings+' warnings, '+checked.missing+' required tools missing.'+(!checked.recipe?' Executable checks were skipped.':'');
  notify('window/logMessage',{type:errors?1:3,message:detail().join('\n')});
  show(summary+'\n'+checked.issues.slice(0,3).map(issue=>issue.setting+': '+issue.message+' Fix: '+issue.hint).join('\n')+(filename?'\nReport: '+filename:''),errors?1:warnings?2:3);
  if(filename&&clientCapabilities.window?.showDocument?.support)await request('window/showDocument',{uri:core.uri(filename),external:false,takeFocus:true},3000).catch(()=>{});
  return {missing:checked.missing,errors,warnings,issues:checked.issues,report:filename?core.uri(filename):null,toolChecksSkipped:!checked.recipe};
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
    clientCapabilities=params.capabilities||{};folders=core.workspaceRoots(params);
    configure(params.initializationOptions || {});
    return {capabilities:{textDocumentSync:{openClose:true,change:1,save:{includeText:true}},completionProvider:{triggerCharacters:['\\','{',',']},definitionProvider:true,referencesProvider:true,renameProvider:{prepareProvider:true},hoverProvider:true,workspaceSymbolProvider:true,documentSymbolProvider:true,documentFormattingProvider:true,codeActionProvider:true,codeLensProvider:{resolveProvider:false},executeCommandProvider:{commands:['latex-workshop.build','latex-workshop.recipes','latex-workshop.clean','latex-workshop.kill','latex-workshop.showLog','latex-workshop.checkTools']},workspace:{workspaceFolders:{supported:true,changeNotifications:true}}},serverInfo:{name:'LaTeX Workshop for Zed',version:'0.4.14'}};
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
  if(method==='textDocument/didClose'){const filename=core.file(params.textDocument.uri);docs.delete(core.key(filename));publish(filename);return;}
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

    return hover(params.textDocument.uri,params.position);
  }
  if(method==='workspace/symbol')return workspaceSymbols(params.query);
  if(method==='textDocument/documentSymbol')return core.symbols(text(params.textDocument.uri));
  if(method==='textDocument/formatting')return format(params.textDocument.uri,params.options);
  if(method==='textDocument/codeLens')return lenses(params.textDocument.uri);
  if(method==='textDocument/codeAction')return actions(params.textDocument.uri);
  if(method==='textDocument/build')return build(core.file(params.textDocument.uri),params.recipe);
  if(method==='workspace/executeCommand'){
    if(params.command==='latex-workshop.build'||params.command==='latex-workshop.recipes')return build(core.file(params.arguments[0]),params.arguments[1]);
    if(params.command==='latex-workshop.checkTools')return checkTools(core.file(params.arguments[0]));
    if(params.command==='latex-workshop.showLog')return openBuildLog(core.file(params.arguments[0]));
    if(params.command==='latex-workshop.clean')return cleanProject(core.file(params.arguments[0]));
    if(params.command==='latex-workshop.kill'){if(params.arguments?.[0]){const job=jobs.get(core.key(resolveRoot(core.file(params.arguments[0]))));if(job)terminate(job);}else for(const job of jobs.values())terminate(job);return null;}
  }
  if(method==='window/workDoneProgress/cancel'){for(const job of jobs.values())if(job.progress===params.token)terminate(job);return;}
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
    else if(pending.has(message.id)){const item=pending.get(message.id);clearTimeout(item.timer);pending.delete(message.id);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);}
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
