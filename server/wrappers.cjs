'use strict';
// Conservative static wrappers: no TeX execution or dynamic expansion.
const {group}=require('./paths.cjs');
function specification(spec){
 const args=[];let cursor=0;
 while(cursor<spec.length){if(/\s/.test(spec[cursor])){cursor++;continue;}const type=spec[cursor++];if(type==='m')args.push({});else if(type==='o')args.push({optional:true,defaultValue:'-NoValue-'});else if(type==='O'){const value=group(spec,cursor);if(!value)return null;cursor=value.next;args.push({optional:true,defaultValue:value.value});}else if(type==='s')args.push({star:true});else return null;if(args.length>9)return null;}
 return args;
}
function effects(model){
 const body=model.body,files=[],theorems=[];
 // Nested declarations are definitions, not executed wrapper effects.
 let text=body;const tokens=/\\([A-Za-z@_:]+)\*?/g;let token;
 while((token=tokens.exec(text))){const modern=require('./document-commands.cjs').definition(text,token.index),legacy=require('./declarations.cjs').legacyEnd(text,token[1],tokens.lastIndex),end=modern?.end||legacy;if(end){text=text.slice(0,token.index)+text.slice(token.index,end).replace(/[^\r\n]/g,' ')+text.slice(end);tokens.lastIndex=end;}}
 for(const ref of text.matchAll(/\\(CatchFile(?:Edef|Def)|input|include|InputIfFileExists)\b/g)){
  let preceding=0;for(let i=ref.index-1;i>=0&&text[i]==='\\';i--)preceding++;if(preceding%2)continue;
  let at=ref.index+ref[0].length;
  if(ref[1].startsWith('CatchFile')){const target=group(text,at);if(target)at=target.next;else{const token=/^\s*\\[A-Za-z@_:]+/.exec(text.slice(at));if(!token)continue;at+=token[0].length;}}
  const file=group(text,at),param=file&&/^#([1-9])$/.exec(file.value.trim());
  if(param&&Number(param[1])<=model.arity)files.push({parameter:Number(param[1]),command:ref[1].startsWith('CatchFile')?'CatchFileDef':ref[1]});
 }
 for(const ref of text.matchAll(/\\newtheorem\*?\s*/g)){
  let preceding=0;for(let i=ref.index-1;i>=0&&text[i]==='\\';i--)preceding++;if(preceding%2)continue;
  const env=group(text,ref.index+ref[0].length);if(!env)continue;
  const shared=group(text,env.next,'[',']'),heading=group(text,shared?.next||env.next),param=/^#([1-9])$/.exec(env.value.trim());
  if(param&&heading&&Number(param[1])<=model.arity)theorems.push({parameter:Number(param[1]),heading:heading.value,unnumbered:/^\\newtheorem\*/.test(ref[0]),sharedCounter:shared?.value,counterWithin:group(text,heading.next,'[',']')?.value});
 }
 return {...model,files,theorems};
}
function definitions(source){
 const text=require('./core.cjs').mask(source),found=[],tokens=/\\([A-Za-z@_:]+)\*?/g;let match;
 while((match=tokens.exec(text))){
  let preceding=0;for(let i=match.index-1;i>=0&&text[i]==='\\';i--)preceding++;if(preceding%2)continue;
  const modern=require('./document-commands.cjs').definition(text,match.index);
  if(modern){const args=specification(modern.spec);if(!modern.environment)found.push(effects({name:modern.name,start:modern.start,end:modern.end,arity:args?.length||0,args:args||[],body:args?modern.body.value:''}));tokens.lastIndex=modern.end;continue;}
  const type=match[1],finish=require('./declarations.cjs').legacyEnd(text,type,tokens.lastIndex);
  if(!finish)continue;
  if(/^(newcommand|renewcommand|providecommand|DeclareRobustCommand)$/.test(type)){
   let cursor=tokens.lastIndex,name,arg=group(text,cursor);
   if(arg){name=arg.value.trim().replace(/^\\/,'');cursor=arg.next;}else{const token=/^\s*\\([A-Za-z@_:]+)/.exec(text.slice(cursor));if(token){name=token[1];cursor+=token[0].length;}}
   const count=group(text,cursor,'[',']');if(count)cursor=count.next;
   const optional=group(text,cursor,'[',']');if(optional)cursor=optional.next;
   const body=group(text,cursor),arity=count?Number(count.value):0;
   if(name&&/^[A-Za-z@_:]+$/.test(name)&&body&&Number.isInteger(arity)&&arity>=0&&arity<=9){
    const args=Array.from({length:arity},(_,i)=>i===0&&optional?{optional:true,defaultValue:optional.value}:{});
    found.push(effects({name,start:match.index,end:finish,arity,args,body:body.value}));
   }
  }
  tokens.lastIndex=finish;
 }
 return found;
}
function models(files,docs){const result=new Map(),core=require('./core.cjs');for(const file of files){try{for(const item of definitions(core.read(file,docs)))result.set(item.name,item);}catch{}}return result;}
function calls(source,registry,partial=false,all=false){
 const core=require('./core.cjs'),text=core.mask(source),tokens=/\\([A-Za-z@_:]+)/g,result=[];let match;
 while((match=tokens.exec(text))){
  let preceding=0;for(let i=match.index-1;i>=0&&text[i]==='\\';i--)preceding++;if(preceding%2)continue;
  const modern=require('./document-commands.cjs').definition(text,match.index),legacy=require('./declarations.cjs').legacyEnd(text,match[1],tokens.lastIndex);
  if(modern||legacy){tokens.lastIndex=modern?.end||legacy;continue;}
  const model=registry.get(match[1]);if(!model||(!all&&!model.files.length&&!model.theorems.length))continue;
  let cursor=tokens.lastIndex,argumentsList=[],valid=true;
  for(let n=1;n<=model.arity;n++){
   const spec=model.args[n-1],optional=spec.optional;
   if(spec.star){const star=/^\s*\*/.exec(text.slice(cursor));argumentsList.push({value:star?'\\BooleanTrue':'\\BooleanFalse'});if(star)cursor+=star[0].length;continue;}
   const arg=group(text,cursor,optional?'[':'{',optional?']':'}');
   if(arg){argumentsList.push(arg);cursor=arg.next;continue;}
   const opening=(optional?/^\s*\[/:/^\s*\{/).exec(text.slice(cursor));
   if(partial&&opening){const start=cursor+opening[0].length;const raw=text.slice(start);if(!/[{}]/.test(raw)){argumentsList.push({start,end:text.length,next:text.length,value:raw,partial:true,close:optional?']':'}'});cursor=text.length;break;}}
   if(optional){argumentsList.push({value:spec.defaultValue});continue;}
   valid=false;break;
  }
  if(valid)result.push({name:model.name,start:match.index,end:cursor,model,args:argumentsList});
  if(valid)tokens.lastIndex=cursor;
 }
 return result;
}
function references(source,registry){return calls(source,expand(registry)).flatMap(call=>call.model.files.flatMap(file=>{const argument=call.args[file.parameter-1];return argument?.start===undefined?[]:[{command:file.command,start:call.start,argument}];}));}
function context(source,pos,registry){const core=require('./core.cjs'),end=core.offset(source,pos);for(const call of calls(source.slice(0,end),expand(registry),true))for(const file of call.model.files){const arg=call.args[file.parameter-1];if(arg?.partial){const prefix=arg.value.trimStart(),suffix=source.slice(end).split(arg.close)[0].split(/[{}\r\n]/)[0].trimEnd();return {command:file.command,prefix,start:end-prefix.length,end:end+suffix.length};}}return null;}
function environments(source,registry){const result=[];for(const call of calls(source,expand(registry)))for(const env of call.model.theorems){const arg=call.args[env.parameter-1];if(arg?.start===undefined||!/^[\w@:*.-]+$/.test(arg.value.trim()))continue;const name=arg.value.trim();result.push({name,start:arg.start+arg.value.indexOf(name),end:arg.start+arg.value.indexOf(name)+name.length,wrapper:call.name,unnumbered:env.unnumbered,sharedCounter:env.sharedCounter?.replace(/#([1-9])/g,(_,n)=>call.args[Number(n)-1]?.value||''),counterWithin:env.counterWithin?.replace(/#([1-9])/g,(_,n)=>call.args[Number(n)-1]?.value||''),heading:env.heading.replace(/#([1-9])/g,(_,n)=>call.args[Number(n)-1]?.value||'')});}return result;}
function expand(registry){
 if(![...registry.values()].some(model=>model.files.length||model.theorems.length))return registry;
 const result=new Map([...registry].map(([name,model])=>[name,{...model,files:[...model.files],theorems:[...model.theorems]}]));
 const add=(items,item)=>{if((item.heading?.length||0)>4096||items.length>=128||items.some(old=>JSON.stringify(old)===JSON.stringify(item)))return false;items.push(item);return true;};
 // Bounded fixed point handles forward declarations and cycles without recursion.
 for(let pass=0;pass<32;pass++){let changed=false;
  for(const model of result.values())for(const call of calls(model.body,result,false,true)){
   const parameter=n=>{const match=/^#([1-9])$/.exec(call.args[n-1]?.value?.trim()||'');return match&&Number(match[1])<=model.arity?Number(match[1]):null;};
   for(const file of [...call.model.files]){const mapped=parameter(file.parameter);if(mapped)changed=add(model.files,{...file,parameter:mapped})||changed;}
   for(const env of [...call.model.theorems]){const mapped=parameter(env.parameter);if(!mapped)continue;const heading=env.heading.replace(/#([1-9])/g,(_,n)=>call.args[Number(n)-1]?.value||'');if(/##/.test(heading))continue;changed=add(model.theorems,{...env,parameter:mapped,heading,sharedCounter:env.sharedCounter?.replace(/#([1-9])/g,(_,n)=>call.args[Number(n)-1]?.value||''),counterWithin:env.counterWithin?.replace(/#([1-9])/g,(_,n)=>call.args[Number(n)-1]?.value||'')})||changed;}
  }
  if(!changed)break;
 }
 return result;
}
module.exports={specification,expand,definitions,models,calls,references,context,environments};
