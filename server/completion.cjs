'use strict';
const fs=require('node:fs'),path=require('node:path');
const core=require('./core.cjs'),resolver=require('./paths.cjs');
const FILE_COMMANDS=new Set(['input','include','subfile','InputIfFileExists','includegraphics','bibliography','bibliographystyle','addbibresource','CatchFileDef',...resolver.IMPORTS]);
function context(source,pos,registry=new Map()){
 const wrapped=require('./wrappers.cjs').context(source,pos,registry);if(wrapped)return wrapped;
 const end=core.offset(source,pos),before=core.mask(source).slice(0,end);
 const imported=/\\(import|subimport|inputfrom|subinputfrom|includefrom|subincludefrom)\*?\s*\{([^{}]*)\}\s*\{([^{}]*)$/.exec(before);
 const match=imported?[imported[0],imported[1],imported[3]]:/\\([A-Za-z]+)\*?(?:\[[^\]]*\])*\s*\{([^{}]*)$/.exec(before);if(!match)return null;
 const raw=match[2],part=raw.slice(raw.lastIndexOf(',')+1),prefix=part.trimStart();
 const suffix=/^[^{}%,\r\n]*/.exec(source.slice(end))[0].trimEnd();
 return {command:match[1],prefix,start:end-prefix.length,end:end+suffix.length,directory:imported?.[2],directoryOnly:resolver.IMPORTS.has(match[1])&&!imported};
}
function paths(active,root,command,prefix,docs,context={}){
 const result=new Map(),normalized=prefix.replace(/\\/g,'/');
 const slash=normalized.lastIndexOf('/'),subdir=slash<0?'':normalized.slice(0,slash+1),leaf=normalized.slice(slash+1);
 const allowed=command==='includegraphics'?/\.(pdf|png|jpe?g|eps|bmp)$/i:command==='bibliographystyle'?/\.bst$/i:/^(?:bibliography|addbibresource)$/.test(command)?/\.(bib|bibtex|biblatex)$/i:/\.(tex|latex|def|cfg)$/i;
 for(const base of resolver.searchBases(active,root,command,docs,context.start,context.directory)){
  let entries;try{entries=fs.readdirSync(path.resolve(base,subdir),{withFileTypes:true});}catch{continue;}
  for(const entry of entries.slice(0,2000)){
   if(entry.isSymbolicLink()||entry.name.startsWith('.')||['build','target','node_modules'].includes(entry.name))continue;
   if(!entry.isDirectory()&&(context.directoryOnly||!entry.isFile()||!allowed.test(entry.name)))continue;
   let name=entry.name;if(!entry.isDirectory()&&/^(input|include|subfile|bibliography|bibliographystyle|import|subimport|inputfrom|subinputfrom|includefrom|subincludefrom)$/.test(command))name=name.replace(/\.(tex|latex|bib|bst)$/i,'');
   if(!name.toLowerCase().startsWith(leaf.toLowerCase()))continue;
   const label=subdir+name+(entry.isDirectory()?'/':''),target=path.resolve(base,subdir,entry.name);
   if(!result.has(label))result.set(label,{label,kind:entry.isDirectory()?19:17,detail:target,target});
  }
 }
 return [...result.values()].sort((a,b)=>a.label.localeCompare(b.label));
}
function pathDefinition(source,pos,active,root,docs){
 const end=core.offset(source,pos);
 for(const ref of resolver.references(source,resolver.graph(root,docs).wrappers)){
  if(end<ref.argument.start||end>ref.argument.end)continue;
  let cursor=ref.argument.start;const parts=/^(bibliography|usepackage|RequirePackage)$/.test(ref.command)?ref.argument.value.split(','):[ref.argument.value];
  for(const part of parts){const name=part.trim(),offset=cursor+part.indexOf(name);cursor+=part.length+1;if(end<offset||end>offset+name.length)continue;
   return resolver.resolve(active,root,ref.command,name,docs,ref.start,ref.directory?.value).map(filename=>({uri:core.uri(filename),range:{start:{line:0,character:0},end:{line:0,character:0}}}));
  }
 }return [];
}
function parseDatabase(data){const packages=new Set(),classes=new Set();for(const line of data.split(/\r?\n/)){if(/^[^/\\]+\.sty$/.test(line))packages.add(line.slice(0,-4));else if(/^[^/\\]+\.cls$/.test(line))classes.add(line.slice(0,-4));}return {packages:[...packages],classes:[...classes]};}
function snippets(name){const values={frac:['frac{${1:numerator}}{${2:denominator}}','Fraction'],sqrt:['sqrt{${1:expression}}','Square root'],textbf:['textbf{${1:text}}','Bold text'],textit:['textit{${1:text}}','Italic text'],emph:['emph{${1:text}}','Emphasis'],includegraphics:['includegraphics[width=${1:\\linewidth}]{${2:file}}','Image'],section:['section{${1:title}}','Section'],subsection:['subsection{${1:title}}','Subsection'],begin:['begin{${1:environment}}\n\t$0\n\\end{$1}','Paired environment']};return values[name];}
module.exports={FILE_COMMANDS,context,paths,pathDefinition,parseDatabase,snippets};
