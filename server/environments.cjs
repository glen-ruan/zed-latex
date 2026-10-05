'use strict';
const {group}=require('./paths.cjs');
function scan(source){
 const core=require('./core.cjs'),text=core.mask(source),result=[],tokens=/\\([A-Za-z@_:]+)\*?/g;let match;
 while((match=tokens.exec(text))){
  let preceding=0;for(let i=match.index-1;i>=0&&text[i]==='\\';i--)preceding++;if(preceding%2)continue;
  const modern=require('./document-commands.cjs').definition(text,match.index);if(modern){tokens.lastIndex=modern.end;continue;}
  const type=match[1],name=group(text,tokens.lastIndex),legacy=require('./declarations.cjs').legacyEnd(text,type,tokens.lastIndex);
  if(!/^(newenvironment|renewenvironment|newtheorem)$/.test(type)){if(legacy)tokens.lastIndex=legacy;continue;}
  if(!name||!/^[\w@:*.-]+$/.test(name.value.trim())){if(legacy)tokens.lastIndex=legacy;continue;}
  const label=name.value.trim(),entry={name:label,start:match.index,nameStart:name.start+name.value.indexOf(label),nameEnd:name.start+name.value.indexOf(label)+label.length,environmentKind:type};
  let cursor=name.next;
  if(type==='newtheorem'){
   const shared=group(text,cursor,'[',']');if(shared)cursor=shared.next;
   const heading=group(text,cursor);if(!heading)continue;cursor=heading.next;
   const within=group(text,cursor,'[',']');if(within)cursor=within.next;
   Object.assign(entry,{heading:heading.value,unnumbered:match[0].endsWith('*'),sharedCounter:shared?.value,counterWithin:within?.value});
  }else{
   const count=group(text,cursor,'[',']');if(count)cursor=count.next;
   const defaultArg=group(text,cursor,'[',']');if(defaultArg)cursor=defaultArg.next;
   const arity=count?Number(count.value):0;if(!Number.isInteger(arity)||arity<0||arity>9||!legacy)continue;
   Object.assign(entry,{arity,defaultArg:defaultArg?.value});cursor=legacy;
  }
  entry.end=cursor;result.push(entry);tokens.lastIndex=cursor;
 }
 return result;
}
function at(source,pos){
 const core=require('./core.cjs'),text=core.mask(source),offset=core.offset(source,pos);
 for(const match of text.matchAll(/\\(?:begin|end)\s*\{([^{}]+)\}/g)){
  let preceding=0;for(let i=match.index-1;i>=0&&text[i]==='\\';i--)preceding++;if(preceding%2)continue;
  const name=match[1].trim();if(!/^[\w@:*.-]+$/.test(name))continue;
  const start=match.index+match[0].indexOf('{')+1+match[1].indexOf(name),end=start+name.length;
  if(offset>=start&&offset<end)return {name,range:core.range(source,start,end)};
 }
 return null;
}
function info(name,entry){
 let signature='\\begin{'+name+'}',details=[];
 if(entry.documentSpec!==undefined){
  const parsed=require('./document-commands.cjs').signature('environment',entry.documentSpec);
  if(parsed){signature+=parsed.signature.slice('\\environment'.length);if(parsed.details)details.push(parsed.details);}
  else details.push('参数规格：'+entry.documentSpec+'（不推测参数签名）');
 }else if(entry.arity!==undefined){
  for(let i=1;i<=entry.arity;i++)signature+=(i===1&&entry.defaultArg!==undefined?'[参数'+i+']':'{参数'+i+'}');
  if(entry.defaultArg!==undefined)details.push('参数1：可选，默认值 '+entry.defaultArg);
 }else if(entry.environmentKind==='newtheorem'||entry.wrapper){
  signature+='[补充标题]';if(entry.heading)details.push('显示标题：'+entry.heading);
  if(entry.unnumbered!==undefined)details.push(entry.unnumbered?'编号：不编号':'编号：使用计数器');
  if(entry.sharedCounter)details.push('共享计数器：'+entry.sharedCounter);
  if(entry.counterWithin)details.push('随计数器重置：'+entry.counterWithin);
 }
 signature+='\n…\n\\end{'+name+'}';
 if(entry.wrapper)details.push('生成命令：\\'+entry.wrapper);
 const where=entry.file+':'+(entry.range.start.line+1);
 details.push((entry.wrapper?'注册：':'定义：')+where);
 return {signature,documentation:[signature,...details].join('\n')};
}

function argumentsSnippet(entry){
 let args;
 if(entry.documentSpec!==undefined)args=require('./wrappers.cjs').specification(entry.documentSpec);
 else if(entry.arity!==undefined)args=Array.from({length:entry.arity},(_,i)=>i===0&&entry.defaultArg!==undefined?{optional:true,defaultValue:entry.defaultArg}:{});
 if(!args)return '';
 const escape=value=>String(value).replace(/[\\$}]/g,'\\$&');let snippet='',stop=0;
 for(let i=0;i<args.length;i++){const arg=args[i];if(arg.star||(arg.optional&&arg.noDefault))continue;const value=arg.optional?arg.defaultValue:'参数'+(i+1);snippet+=(arg.optional?'[':'{')+'${'+(++stop)+':'+escape(value)+'}'+(arg.optional?']':'}');}
 return snippet;
}
function completion(source,context,name,entry,snippets){
 const plain={start:context.start,end:context.end,newText:name};
 if(!snippets||context.command!=='begin')return plain;
 const args=argumentsSnippet(entry);if(!args)return plain;
 const closed=source[context.end]==='}',after=require('./core.cjs').mask(source.slice(context.end+(closed?1:0)));
 // Preserve existing arguments and text instead of guessing whether to replace them.
 if(/^\s*[\[{]/.test(after))return plain;
 return {start:context.start,end:context.end+(closed?1:0),newText:name+'}'+args+'$0',insertTextFormat:2};
}
module.exports={scan,at,info,argumentsSnippet,completion};
