'use strict';
// Conservative static wrappers: no TeX execution or dynamic expansion.
const {group}=require('./paths.cjs');
function definitions(source){
 const text=require('./core.cjs').mask(source),found=[],tokens=/\\([A-Za-z@_:]+)\*?/g;let match;
 while((match=tokens.exec(text))){
  let preceding=0;for(let i=match.index-1;i>=0&&text[i]==='\\';i--)preceding++;if(preceding%2)continue;
  const modern=require('./document-commands.cjs').definition(text,match.index);
  if(modern){tokens.lastIndex=modern.end;continue;}
  const type=match[1],finish=require('./declarations.cjs').legacyEnd(text,type,tokens.lastIndex);
  if(!finish)continue;
  if(/^(newcommand|renewcommand|providecommand|DeclareRobustCommand)$/.test(type)){
   let cursor=tokens.lastIndex,name,arg=group(text,cursor);
   if(arg){name=arg.value.trim().replace(/^\\/,'');cursor=arg.next;}else{const token=/^\s*\\([A-Za-z@_:]+)/.exec(text.slice(cursor));if(token){name=token[1];cursor+=token[0].length;}}
   const count=group(text,cursor,'[',']');if(count)cursor=count.next;
   const optional=group(text,cursor,'[',']');if(optional)cursor=optional.next;
   const body=group(text,cursor),arity=count?Number(count.value):0;
   if(name&&/^[A-Za-z@_:]+$/.test(name)&&body&&Number.isInteger(arity)&&arity>=0&&arity<=9){
    const files=[],theorems=[];
    for(const ref of body.value.matchAll(/\\(CatchFile(?:Edef|Def)|input|include|InputIfFileExists)\b/g)){
     let at=ref.index+ref[0].length;
     if(ref[1].startsWith('CatchFile')){const target=group(body.value,at);if(target)at=target.next;else{const token=/^\s*\\[A-Za-z@_:]+/.exec(body.value.slice(at));if(!token)continue;at+=token[0].length;}}
     const file=group(body.value,at),param=file&&/^#([1-9])$/.exec(file.value.trim());
     if(param&&Number(param[1])<=arity)files.push({parameter:Number(param[1]),command:ref[1].startsWith('CatchFile')?'CatchFileDef':ref[1]});
    }
    for(const ref of body.value.matchAll(/\\newtheorem\*?\s*/g)){
     const env=group(body.value,ref.index+ref[0].length);if(!env)continue;
     const shared=group(body.value,env.next,'[',']'),heading=group(body.value,shared?.next||env.next);
     const param=/^#([1-9])$/.exec(env.value.trim());if(param&&heading&&Number(param[1])<=arity)theorems.push({parameter:Number(param[1]),heading:heading.value});
    }
    found.push({name,start:match.index,end:finish,arity,optional:optional?.value,files,theorems});
   }
  }
  tokens.lastIndex=finish;
 }
 return found;
}
function models(files,docs){const result=new Map(),core=require('./core.cjs');for(const file of files){try{for(const item of definitions(core.read(file,docs)))result.set(item.name,item);}catch{}}return result;}
function calls(source,registry,partial=false){
 const core=require('./core.cjs'),text=core.mask(source),tokens=/\\([A-Za-z@_:]+)\*?/g,result=[];let match;
 while((match=tokens.exec(text))){
  let preceding=0;for(let i=match.index-1;i>=0&&text[i]==='\\';i--)preceding++;if(preceding%2)continue;
  const modern=require('./document-commands.cjs').definition(text,match.index),legacy=require('./declarations.cjs').legacyEnd(text,match[1],tokens.lastIndex);
  if(modern||legacy){tokens.lastIndex=modern?.end||legacy;continue;}
  const model=registry.get(match[1]);if(!model||(!model.files.length&&!model.theorems.length))continue;
  let cursor=tokens.lastIndex,argumentsList=[],valid=true;
  for(let n=1;n<=model.arity;n++){
   const optional=n===1&&model.optional!==undefined;
   const arg=group(text,cursor,optional?'[':'{',optional?']':'}');
   if(arg){argumentsList.push(arg);cursor=arg.next;continue;}
   if(optional){argumentsList.push({value:model.optional});continue;}
   const opening=/^\s*\{/.exec(text.slice(cursor));
   if(partial&&opening){const start=cursor+opening[0].length;const raw=text.slice(start);if(!/[{}]/.test(raw)){argumentsList.push({start,end:text.length,next:text.length,value:raw,partial:true});cursor=text.length;break;}}
   valid=false;break;
  }
  if(valid)result.push({name:model.name,start:match.index,end:cursor,model,args:argumentsList});
  if(valid)tokens.lastIndex=cursor;
 }
 return result;
}
function references(source,registry){return calls(source,registry).flatMap(call=>call.model.files.flatMap(file=>{const argument=call.args[file.parameter-1];return argument?.start===undefined?[]:[{command:file.command,start:call.start,argument}];}));}
function context(source,pos,registry){const core=require('./core.cjs'),end=core.offset(source,pos);for(const call of calls(source.slice(0,end),registry,true))for(const file of call.model.files){const arg=call.args[file.parameter-1];if(arg?.partial){const prefix=arg.value.trimStart(),suffix=/^[^{}\r\n]*/.exec(source.slice(end))[0].trimEnd();return {command:file.command,prefix,start:end-prefix.length,end:end+suffix.length};}}return null;}
function environments(source,registry){const result=[];for(const call of calls(source,registry))for(const env of call.model.theorems){const arg=call.args[env.parameter-1];if(arg?.start===undefined||!/^[\w@:*.-]+$/.test(arg.value.trim()))continue;const name=arg.value.trim();result.push({name,start:arg.start+arg.value.indexOf(name),end:arg.start+arg.value.indexOf(name)+name.length,wrapper:call.name,heading:env.heading.replace(/#([1-9])/g,(_,n)=>call.args[Number(n)-1]?.value||'')});}return result;}
module.exports={definitions,models,calls,references,context,environments};
