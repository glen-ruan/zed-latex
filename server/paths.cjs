'use strict';
const fs=require('node:fs'),path=require('node:path');
const IMPORTS=new Set(['import','subimport','inputfrom','subinputfrom','includefrom','subincludefrom']);
const COMMANDS=new Set(['input','include','subfile','InputIfFileExists','includegraphics','bibliography','bibliographystyle','addbibresource','usepackage','RequirePackage','documentclass','LoadClass',...IMPORTS]);
function group(text,start,open='{',close='}'){
 while(/\s/.test(text[start]||'')&&start<text.length)start++;if(text[start]!==open)return null;let depth=1,braces=0;
 for(let i=start+1;i<text.length;i++){if(text[i]==='\\'){i++;continue;}if(open==='['){if(text[i]==='{')braces++;else if(text[i]==='}')braces--;if(braces)continue;}if(text[i]===open)depth++;else if(text[i]===close&&!--depth)return {start:start+1,end:i,next:i+1,value:text.slice(start+1,i)};}return null;
}
function literal(value){return value.trim().replace(/^"(.*)"$/,'$1');}
function staticPath(value){return !/[\\#$%{}]/.test(value);}
function references(source){
 const core=require('./core.cjs'),clean=core.mask(source),result=[],tokens=/\\([A-Za-z]+)\*?/g;let match;
 while((match=tokens.exec(clean))){
  let preceding=0;for(let i=match.index-1;i>=0&&clean[i]==='\\';i--)preceding++;if(preceding%2)continue;
  const modern=require('./document-commands.cjs').definition(clean,match.index);if(modern){tokens.lastIndex=modern.end;continue;}
  const command=match[1].replace(/^(RequirePackage|LoadClass)WithOptions$/,'$1');if(!COMMANDS.has(command)&&command!=='graphicspath')continue;
  let cursor=tokens.lastIndex,option;while((option=group(clean,cursor,'[',']')))cursor=option.next;
  const first=group(clean,cursor);if(!first)continue;const second=IMPORTS.has(command)?group(clean,first.next):null;if(IMPORTS.has(command)&&!second)continue;
  result.push({command,start:match.index,directory:second?first:null,argument:second||first});tokens.lastIndex=(second||first).next;
 }return result;
}
function extensions(command){return command==='includegraphics'?['','.pdf','.png','.jpg','.jpeg','.eps','.bmp']:command==='bibliographystyle'?['','.bst']:command==='usepackage'||command==='RequirePackage'?['','.sty']:command==='documentclass'||command==='LoadClass'?['','.cls']:/bibliography|addbibresource/.test(command)?['','.bib','.bibtex','.biblatex']:['','.tex','.latex'];}
function unique(items){const core=require('./core.cjs');return [...new Map(items.map(item=>[core.key(item),item])).values()];}
function bases(active,root,command,state={},directory){
 const main=path.dirname(root);
 if(IMPORTS.has(command))return staticPath(literal(directory||''))?[path.resolve(command.startsWith('sub')?(state.importDir||main):main,literal(directory||''))]:[];
 return unique([state.importDir,main,...(command==='includegraphics'?state.graphics||[]:[]),path.dirname(active)].filter(Boolean));
}
function candidates(name,command,search,docs){
 const core=require('./core.cjs');name=literal(name);if(!name||!staticPath(name))return [];
 // Each context has a documented search order: return its first matching directory/extension.
 for(const base of search)for(const extension of extensions(command)){const target=path.resolve(base,name+extension);try{if(docs?.has(core.key(target))||fs.statSync(target).isFile())return [target];}catch{}}
 return [];
}
function graphics(value,root){const found=[];let cursor=0,item;while((item=group(value,cursor))){const name=literal(item.value);if(staticPath(name))found.push(path.resolve(path.dirname(root),name));cursor=item.next;}return unique(found);}
function graph(root,docs){
 const core=require('./core.cjs'),files=new Set(),contexts=new Map(),seen=new Set();
 function visit(filename,state,depth){
  if(depth>25||seen.size>=5000)return;const id=JSON.stringify([core.key(filename),state.importDir,(state.graphics||[]).map(core.key)]);if(seen.has(id))return;seen.add(id);
  let source;try{source=core.read(filename,docs);}catch{return;}files.add(core.key(filename));
  const timeline=[{start:0,...state}],list=contexts.get(core.key(filename))||[];list.push(timeline);contexts.set(core.key(filename),list);
  let current={...state};
  for(const ref of references(source)){
   if(ref.command==='graphicspath'){current={...current,graphics:graphics(ref.argument.value,root)};timeline.push({start:ref.argument.next,...current});continue;}
   if(ref.command==='includegraphics'||ref.command==='bibliographystyle')continue;
   const search=bases(filename,root,ref.command,current,ref.directory?.value),names=/^(bibliography|usepackage|RequirePackage)$/.test(ref.command)?ref.argument.value.split(','):[ref.argument.value];
   for(const name of names)for(const target of candidates(name,ref.command,search,docs)){
    const imported=IMPORTS.has(ref.command);visit(target,imported?{...current,importDir:search[0]}:current,depth+1);
   }
  }
 }
 visit(root,{graphics:[]},0);return {files,contexts};
}
function states(active,root,docs,offset=Infinity){
 const timelines=graph(root,docs).contexts.get(require('./core.cjs').key(active));
 return timelines?.length?timelines.map(items=>items.findLast(item=>item.start<=offset)||items[0]):[{graphics:[]}];
}
function searchBases(active,root,command,docs,offset,directory){return unique(states(active,root,docs,offset).flatMap(state=>bases(active,root,command,state,directory)));}
function resolve(active,root,command,name,docs,offset,directory){return unique(states(active,root,docs,offset).flatMap(state=>candidates(name,command,bases(active,root,command,state,directory),docs)));}
module.exports={IMPORTS,COMMANDS,group,references,extensions,graph,searchBases,resolve};
