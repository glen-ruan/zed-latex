'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL, fileURLToPath} = require('node:url');
const TEX = /\.(tex|latex|cls|sty|def|dtx|ins)$/i;
const SOURCE = /\.(tex|latex|cls|sty|def|dtx|ins|bib|bibtex|biblatex)$/i;
const sourceCache=new (require('./source-cache.cjs').SourceCache)();
const IGNORE = new Set(['.git','.dev','node_modules','build','target','.zed']);
const DEFAULTS = {
  'latex.outDir': 'build',
  'latex.tools.searchPaths': [],
  'latex.autoBuild.run': 'onFileChange',
  'latex.autoBuild.interval': 1000,
  'latex.autoBuild.cleanAndRetry.enabled': true,
  'latex.clean.method': 'command',
  'latex.clean.command': 'latexmk',
  'latex.clean.args': ['-outdir=%OUTDIR%','-auxdir=%AUXDIR%','-c','%TEX%'],
  'latex.recipe.default': 'first',
  'latex.build.enableMagicComments': true,
  'latex.recipes': [{name:'XeLaTeX (latexmk)',tools:['latexmk-xelatex']}],
  'latex.tools': [{name:'latexmk-xelatex',command:'latexmk',args:['-xelatex','-cd','-synctex=1','-interaction=nonstopmode','-file-line-error','-halt-on-error','-recorder','-outdir=%OUTDIR%','%DOC%']}],
  'formatting.latex': 'none',
  'formatting.latexindent.path': 'latexindent',
  'formatting.latexindent.args': ['-c','%DIR%/','%TMPFILE%'],
  'formatting.tex-fmt.path': 'tex-fmt',
  'formatting.tex-fmt.args': ['--nowrap'],
};
function workspaceRoots(params,cwd=process.cwd()) {
  const supplied=params.workspaceFolders?.map(item=>file(item.uri))||[];
  return supplied.length?supplied:[params.rootUri?file(params.rootUri):path.resolve(params.rootPath||cwd)];
}
function uri(file) { return pathToFileURL(path.resolve(file)).href; }
function file(url) { return fileURLToPath(url); }
function key(file) { const result=path.resolve(file);return process.platform==='win32'?result.toLowerCase():result; }
function read(file, docs) { return docs?.get(key(file))?.text ?? fs.readFileSync(file,'utf8'); }
function settings(raw={}) {
  const inner=raw['latex-workshop'] || raw;
  const result={...DEFAULTS};
  for(const [k,v] of Object.entries(inner)) result[k.replace(/^latex-workshop\./,'')]=v;
  return result;
}
function mask(source) {
  // Keep offsets intact while excluding comments and verbatim contents.
  return source.replace(/\\begin\{(verbatim\*?|lstlisting|minted|comment)\}[\s\S]*?\\end\{\1\}|\\verb\*?([^\w\s])[\s\S]*?\2|(?<!\\)(?:\\\\)*%[^\r\n]*/g, text=>text.replace(/[^\r\n]/g,' '));
}
function scan(folder, result=[], depth=0) {
  if(depth>25 || result.length>5000) return result;
  let entries;try{entries=fs.readdirSync(folder,{withFileTypes:true});}catch{return result;}
  for(const entry of entries){
    if(entry.isSymbolicLink())continue;
    const full=path.join(folder,entry.name);
    if(entry.isDirectory() && !IGNORE.has(entry.name))scan(full,result,depth+1);
    else if(entry.isFile() && SOURCE.test(full) && fs.statSync(full).size<4*1024*1024)result.push(full);
  }
  return result;
}
function included(file, docs) { return [...require('./paths.cjs').graph(file,docs).files].filter(target=>key(target)!==key(file)); }
function dependencies(root,docs,result=new Set()) {
  for(const target of require('./paths.cjs').graph(root,docs).files)result.add(target);
  return result;
}
function rootFile(active,folders,docs,explicit) {
  if(explicit)return path.resolve(folders[0] || path.dirname(active),explicit);
  let current=path.resolve(active);const visited=new Set();
  while(TEX.test(current)){
    if(visited.has(key(current)))throw new Error('Cycle in % !TeX root comments');
    visited.add(key(current));
    const source=read(current,docs);
    const magic=/^\s*%\s*!\s*tex\s+root\s*=\s*(.+?)\s*$/im.exec(source);
    if(!magic)break;
    current=path.resolve(path.dirname(current),magic[1].replace(/^(["'])(.*)\1$/,'$2'));
    if(!fs.existsSync(current) && !docs?.has(key(current)))throw new Error('Magic root does not exist: '+current);
  }
  if(/\\documentclass\b/.test(mask(read(current,docs))))return current;
  const candidates=[];
  for(const folder of folders)for(const candidate of scan(folder)){
    if(!/\.(tex|latex)$/i.test(candidate))continue;
    if(/\\documentclass\b/.test(mask(read(candidate,docs))) && dependencies(candidate,docs).has(key(current)))candidates.push(candidate);
  }
  if(candidates.length===1)return candidates[0];
  if(candidates.length>1)throw new Error('Multiple main files include this file; add % !TeX root = ...');
  throw new Error('Main file not found; add % !TeX root = ... or open the project folder');
}
function position(source,offset) { const before=source.slice(0,offset).split('\n');return {line:before.length-1,character:before.at(-1).length}; }
function offset(source,pos) { const lines=source.split('\n');return lines.slice(0,pos.line).reduce((n,line)=>n+line.length+1,0)+pos.character; }
function range(source,start,end=start+1) { return {start:position(source,start),end:position(source,end)}; }
function uncachedIndex(files,docs) {
  const result={labels:new Map(),citations:new Map(),commands:new Map(),environments:new Map(),files:[]};
  for(const filename of files){
    let source;try{source=read(filename,docs);}catch{continue;}
    result.files.push(filename);
    if(/\.(bib|bibtex|biblatex)$/i.test(filename)){
      for(const match of source.matchAll(/@(?!(?:comment|string|preamble)\b)([a-z]+)\s*[{(]\s*([^,\s{}()]+)\s*,/ig))result.citations.set(match[2],{file:filename,range:range(source,match.index,match.index+match[0].length),detail:source.slice(match.index,match.index+400)});
      continue;
    }
    let clean=mask(source);
    const modern=require('./document-commands.cjs').scan(clean);
    const definitions=modern.map(item=>({name:item.name,environment:item.environment,start:item.start,entry:{file:filename,range:range(source,item.nameStart,item.nameEnd),documentSpec:item.spec}}));
    // Definitions can contain example labels and nested definitions; they are not document instances.
    for(const item of modern.slice().reverse())clean=clean.slice(0,item.start)+clean.slice(item.start,item.end).replace(/[^\r\n]/g,' ')+clean.slice(item.end);
    for(const match of clean.matchAll(/\\label\s*\{([^{}\\#]+)\}/g))result.labels.set(match[1],{file:filename,range:range(source,match.index,match.index+match[0].length)});
    for(const match of clean.matchAll(/\\(?:newcommand|renewcommand|providecommand|DeclareRobustCommand)\*?\s*\{?\\([A-Za-z@]+)\}?|\\(?:[egx]?def)\s*\\([A-Za-z@]+)/g))definitions.push({name:match[1]||match[2],start:match.index,entry:{file:filename,range:range(source,match.index,match.index+match[0].length)}});
    for(const match of clean.matchAll(/\\(?:newenvironment|renewenvironment)\*?\s*\{([^{}]+)\}/g))definitions.push({name:match[1],environment:true,start:match.index,entry:{file:filename,range:range(source,match.index,match.index+match[0].length)}});
    for(const item of definitions.sort((a,b)=>a.start-b.start))(item.environment?result.environments:result.commands).set(item.name,item.entry);
  }
  return result;
}
function index(files,docs) {
  const result={labels:new Map(),citations:new Map(),commands:new Map(),environments:new Map(),files:[]};
  for(const filename of files){let fragment;try{fragment=sourceCache.analyze(filename,docs,'index',text=>uncachedIndex([filename],new Map([[key(filename),{text}]])));}catch{continue;}
    result.files.push(...fragment.files);for(const name of ['labels','citations','commands','environments'])for(const [label,entry] of fragment[name])result[name].set(label,entry);
  }return result;
}
function cachedProject(files,docs,tag,build){return sourceCache.project(files,docs,tag,build);}
function symbols(source) { return require('./structure.cjs').symbols(source,{mask,range}); }
function diagnostic(message,source,start,severity=1) { return {source:'latex-workshop',message,severity,range:range(source,start,Math.min(start+1,source.length))}; }
function syntaxDiagnostics(source,filename) {
  if(!/\.(tex|latex)$/i.test(filename))return [];
  const clean=mask(source),stack=[],envs=[],result=[];
  for(let i=0;i<clean.length;i++){
    if(clean[i]==='\\'){i++;continue;}
    if(clean[i]==='{')stack.push(i);
    else if(clean[i]==='}') { if(stack.length)stack.pop();else result.push(diagnostic('Unexpected closing brace',source,i)); }
  }
  for(const start of stack)result.push(diagnostic('Unclosed brace',source,start));
  for(const match of clean.matchAll(/\\(begin|end)\s*\{([^{}]+)\}/g)){
    if(match[1]==='begin')envs.push({name:match[2],start:match.index});
    else if(envs.at(-1)?.name===match[2])envs.pop();
    else result.push(diagnostic('Unmatched \\end{'+match[2]+'}',source,match.index));
  }
  for(const env of envs)result.push(diagnostic('Unclosed environment '+env.name,source,env.start));
  return result;
}
function placeholders(root,outDir,workspace,jobname) {
  const dir=path.dirname(root),stem=path.basename(root,path.extname(root)),doc=path.join(dir,stem);
  const first={DOC:doc,DOC_EXT:root,DOCFILE:stem,DOCFILE_EXT:path.basename(root),DIR:dir,WORKSPACE_FOLDER:workspace || dir,TMPDIR:require('node:os').tmpdir(),RELATIVE_DIR:path.relative(workspace || dir,dir),RELATIVE_DOC:path.relative(workspace || dir,doc)};
  const firstWindows=Object.fromEntries(Object.entries(first).map(([name,value])=>[name+'_W32',value.replace(/\\/g,'/').replace(/\//g,'\\')]));
  const replaceFirst=s=>String(s).replace(/%([A-Z_][A-Z_0-9]*)%/g,(all,name)=>first[name] ?? firstWindows[name] ?? all);
  const output=path.resolve(dir,replaceFirst(outDir));
  const values={...first,OUTDIR:output,AUXDIR:output,TMPFILE:'',JOBNAME:jobname || stem};
  for(const [name,value] of Object.entries({...values}))values[name+'_W32']=value.replace(/\\/g,'/').replace(/\//g,'\\');
  return {output,expand:s=>String(s).replace(/%([A-Z_][A-Z_0-9]*)%/g,(all,name)=>values[name] ?? all),values};
}
function recipe(root,config,workspace,name,lastRecipe) {
  const source=read(root),values=placeholders(root,config['latex.outDir'],workspace,config['latex.jobname']);
  const magic=config['latex.build.enableMagicComments'];
  const preferred=name || (magic && /^\s*%\s*!\s*LW\s+recipe\s*=\s*(.+?)\s*$/im.exec(source)?.[1]) || config['latex.recipe.default'];
  const recipes=config['latex.recipes'];
  let chosen=preferred==='lastUsed'?recipes.find(r=>r.name===lastRecipe):recipes.find(r=>r.name===preferred);
  if(!chosen && (preferred==='first'||preferred==='lastUsed'))chosen=recipes[0];
  if(!chosen)throw new Error('Unknown recipe: '+preferred);
  const program=magic && !name && /^\s*%\s*!\s*tex\s+program\s*=\s*(\S+)\s*$/im.exec(source)?.[1];
  let tools;
  if(program){
    const args=config['latex.magic.args'] || (program==='latexmk'?['-xelatex','-outdir=%OUTDIR%','%DOC%']:['-synctex=1','-interaction=nonstopmode','-file-line-error','-halt-on-error','-output-directory=%OUTDIR%','%DOC%']);
    tools=[{name:program,command:program,args}];
  }else tools=chosen.tools.map(name=>{
    if(typeof name==='object')return name;
    const tool=config['latex.tools'].find(tool=>tool.name===name);if(!tool)throw new Error('Unknown recipe tool: '+name);return tool;
  });
  return {name:program || chosen.name,output:values.output,cwd:config['latex.build.fromFolder']?path.resolve(path.dirname(root),values.expand(config['latex.build.fromFolder'])):path.dirname(root),steps:tools.map(tool=>({cwd:tool.cwd?path.resolve(path.dirname(root),values.expand(tool.cwd)):undefined,command:values.expand(tool.command),args:(tool.args||[]).map(values.expand),env:Object.fromEntries(Object.entries(tool.env||{}).map(([k,v])=>[k,values.expand(v)]))}))};
}
function logDiagnostics(output,root,options) { return require('./tex-log.cjs').parse(output,root,options); }
module.exports={cachedProject,workspaceRoots,TEX,SOURCE,DEFAULTS,uri,file,key,read,settings,mask,scan,included,dependencies,rootFile,position,offset,range,index,symbols,syntaxDiagnostics,placeholders,recipe,logDiagnostics};
