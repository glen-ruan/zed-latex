'use strict';
const {group}=require('./paths.cjs');
function command(text,start,allowWrapped=true){
 const wrapped=group(text,start);if(wrapped){if(!allowWrapped)return null;const raw=wrapped.value.trim();if(!/^\\[A-Za-z@_:]+$/.test(raw))return null;const name=raw.slice(1),from=wrapped.start+wrapped.value.indexOf(raw)+1;return {name,start:from,end:from+name.length,next:wrapped.next};}
 const match=/^\s*\\([A-Za-z@_:]+)/.exec(text.slice(start));if(!match)return null;const end=start+match[0].length;return {name:match[1],start:end-match[1].length,end,next:end};
}
function legacyEnd(text,type,cursor){
 if(/^[egx]?def$/.test(type)){const start=text.indexOf('{',cursor),body=start<0?null:group(text,start);return body?.next;}
 if(type==='newtheoremstyle'){for(let i=0;i<9;i++){const arg=group(text,cursor);if(!arg)return;cursor=arg.next;}return cursor;}
 if(!/^(newcommand|renewcommand|providecommand|DeclareRobustCommand|newenvironment|renewenvironment|newcolumntype)$/.test(type))return;
 let arg=group(text,cursor);if(arg)cursor=arg.next;else {arg=command(text,cursor);if(!arg)return;cursor=arg.next;}
 for(let i=0;i<2;i++){arg=group(text,cursor,'[',']');if(arg)cursor=arg.next;}
 arg=group(text,cursor);if(!arg)return;cursor=arg.next;
 if(type.endsWith('environment')){arg=group(text,cursor);if(!arg)return;cursor=arg.next;}
 return cursor;
}
function scan(text){
 const found=[],tokens=/\\([A-Za-z@_:]+)\*?/g;let match;
 while((match=tokens.exec(text))){
  let preceding=0;for(let i=match.index-1;i>=0&&text[i]==='\\';i--)preceding++;if(preceding%2)continue;
  const modern=require('./document-commands.cjs').definition(text,match.index);if(modern){tokens.lastIndex=modern.end;continue;}
  const type=match[1],end=legacyEnd(text,type,tokens.lastIndex);if(end){tokens.lastIndex=end;continue;}
  let cursor=tokens.lastIndex,option=null;
  if(type==='DeclareSIUnit'){option=group(text,cursor,'[',']');if(option)cursor=option.next;}
  if(!/^(let|(?:New|Renew|Declare)CommandCopy|DeclareSIUnit|DeclareMathOperator)$/.test(type))continue;
  const name=command(text,cursor,type!=='let');if(!name)continue;cursor=name.next;
  const entry={name:name.name,start:match.index,nameStart:name.start,nameEnd:name.end,declarationKind:type};
  if(type==='let'){const equal=/^\s*=\s*/.exec(text.slice(cursor));if(equal)cursor+=equal[0].length;const target=command(text,cursor,false);if(!target)continue;entry.aliasTarget=target.name;entry.end=target.next;}
  else if(type.endsWith('CommandCopy')){const target=command(text,cursor);if(!target)continue;entry.aliasTarget=target.name;entry.end=target.next;}
  else {const value=group(text,cursor);if(!value)continue;entry.declarationValue=value.value;entry.declarationOptions=option?.value;entry.end=value.next;}
  found.push(entry);tokens.lastIndex=entry.end;
 }
 return found;
}
function alias(name,commands){
 const seen=new Set(),chain=[];let target=name;
 for(let depth=0;depth<32;depth++){if(seen.has(target))return {chain,cycle:true};seen.add(target);const entry=commands.get(target);if(!entry?.aliasTarget)return {chain,target,entry};chain.push(entry.aliasTarget);target=entry.aliasTarget;}
 return {chain,limited:true};
}
module.exports={scan,alias,legacyEnd};
