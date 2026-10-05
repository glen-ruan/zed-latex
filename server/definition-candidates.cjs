'use strict';
const coreKey=file=>require('./core.cjs').key(file),identities=new WeakMap(),memberships=new WeakMap();
function identity(entry){let id=identities.get(entry);if(id===undefined){id=JSON.stringify([coreKey(entry.file),entry.range]);identities.set(entry,id);}return id;}
function add(map,name,entry){let names=memberships.get(map);if(!names){names=new Map();memberships.set(map,names);}const items=map.get(name)||[];let ids=names.get(name);if(!ids){ids=new Set(items.map(identity));names.set(name,ids);}const id=identity(entry);if(!ids.has(id)){ids.add(id);items.push(entry);}map.set(name,items);}
function ordered(map,name,selected){const entries=map?.get(name)||[];return selected?[selected,...entries.slice().reverse().filter(entry=>identity(entry)!==identity(selected))]:entries.slice().reverse();}
function notice(map,name,selected){
 const entries=ordered(map,name,selected);if(entries.length<2)return '';
 const where=entry=>entry.file+':'+(entry.range.start.line+1)+':'+(entry.range.start.character+1);
 return '\n\n存在 '+entries.length+' 个静态定义候选\n当前索引选择：'+where(entries[0])+'\n其他候选：\n'+entries.slice(1,13).map(where).join('\n')+(entries.length>13?'\n另有 '+(entries.length-13)+' 个候选，可通过定义跳转查看。':'')+'\n选择依据：项目索引中的后者优先；不模拟 TeX 条件分支或运行时作用域。';
}
function legacy(source){
 const {group}=require('./paths.cjs'),text=require('./core.cjs').mask(source),declarations=new Map(require('./declarations.cjs').scan(text).map(item=>[item.start,item])),tokens=/\\([A-Za-z@_:]+)\*?/g,result=[];let match;
 while((match=tokens.exec(text))){
  let preceding=0;for(let i=match.index-1;i>=0&&text[i]==='\\';i--)preceding++;if(preceding%2)continue;
  const modern=require('./document-commands.cjs').definition(text,match.index),special=declarations.get(match.index),end=require('./declarations.cjs').legacyEnd(text,match[1],tokens.lastIndex);
  if(modern||special){tokens.lastIndex=modern?.end||special.end;continue;}
  if(/^(newcommand|renewcommand|providecommand|DeclareRobustCommand|[egx]?def)$/.test(match[1])&&end){
   const wrapped=group(text,tokens.lastIndex),raw=wrapped?wrapped.value.trim():null,token=wrapped?/^\\([A-Za-z@_:]+)$/.exec(raw):/^\s*\\([A-Za-z@_:]+)/.exec(text.slice(tokens.lastIndex));
   if(token)result.push({name:token[1],start:match.index,end:wrapped?.next||tokens.lastIndex+token[0].length});
  }
  if(end)tokens.lastIndex=end;
 }
 return result;
}
module.exports={add,ordered,notice,legacy};
