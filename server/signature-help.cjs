'use strict';
const core=require('./core.cjs'),{group}=require('./paths.cjs'),specification=require('./wrappers.cjs').specification;
function fromLabel(label){
 const head=/^\\([A-Za-z@_:]+)\*?/.exec(label);if(!head)return null;
 const args=[];let cursor=head[0].length;
 while(cursor<label.length){while(/\s/.test(label[cursor]||'')&&cursor<label.length)cursor++;if(cursor===label.length)break;const open=label[cursor];if(open!=='{'&&open!=='[')return null;const arg=group(label,cursor,open,open==='{'?'}':']');if(!arg||!arg.value.trim())return null;args.push({optional:open==='[',name:arg.value});cursor=arg.next;if(args.length>9)return null;}
 return args.length?{args,constantStar:head[0].endsWith('*')}:null;
}
function describe(idx,docs,commandInfo){
 const memo=new Map(),files=new Map();
 return (name,environment=false)=>{
  const key=(environment?'env:':'cmd:')+name;if(memo.has(key))return memo.get(key);
  const entry=(environment?idx.environments:idx.commands).get(name);let args,documentation,constantStar=false;
  if(entry){
   if(entry.documentSpec!==undefined)args=specification(entry.documentSpec);
   else if(environment&&entry.arity!==undefined)args=Array.from({length:entry.arity},(_,i)=>i===0&&entry.defaultArg!==undefined?{optional:true,defaultValue:entry.defaultArg}:{});
   else if(environment&&(entry.environmentKind==='newtheorem'||entry.wrapper))args=[{optional:true,name:'补充标题'}];
   else if(!entry.declarationKind){
    let models=files.get(entry.file);if(!models){models=core.analyzeSource(entry.file,docs,'wrapper-definitions',require('./wrappers.cjs').definitions);files.set(entry.file,models);}
    const model=models.find(item=>item.name===name&&item.start===core.offset(core.read(entry.file,docs),entry.range.start));args=model?.args;
   }
   documentation=environment?require('./environments.cjs').info(name,entry).documentation+require('./definition-candidates.cjs').notice(idx.environmentDefinitions,name,entry):commandInfo(name,idx)?.documentation;
  }else if(!environment){
   const info=commandInfo(name,idx),parsed=info&&fromLabel(info.signature);args=parsed?.args;constantStar=parsed?.constantStar;documentation=info?.documentation;
  }
  const result=args?.length?{args,documentation,head:environment?'\\begin{'+name+'}':'\\'+name,constantStar}:null;memo.set(key,result);return result;
 };
}
function active(text,cursor,args,offset,constantStar){
 if(constantStar){if(text[cursor]!=='*')return null;cursor++;}
 for(let n=0;n<args.length;n++){
  const arg=args[n];while(/\s/.test(text[cursor]||'')&&cursor<text.length)cursor++;
  if(arg.star){if(text[cursor]==='*'){if(offset===cursor)return n;cursor++;}continue;}
  const open=arg.optional?'[':'{',close=arg.optional?']':'}';
  if(text[cursor]!==open){if(arg.optional)continue;return cursor>=offset?n:null;}
  const value=group(text,cursor,open,close);
  if(offset>cursor&&(!value||offset<=value.end))return n;
  if(offset<=cursor)return n;
  if(!value)return null;cursor=value.next;
 }
 return null;
}
function build(model,parameter,offsetLabels){
 let label=model.head;const parameters=[];
 for(let n=0;n<model.args.length;n++){
  const arg=model.args[n],open=arg.star?'[':arg.optional?'[':'{',close=arg.star||arg.optional?']':'}',value=arg.name||(arg.star?'*':'参数'+(n+1));
  label+=open;const start=label.length;label+=value;const end=label.length;label+=close;
  parameters.push({label:offsetLabels?[start,end]:value,documentation:'参数'+(n+1)+(arg.star?'：可选星号':arg.optional?'：可选':'：必选')+(arg.defaultValue!==undefined&&!arg.noDefault?'，默认值 '+arg.defaultValue:'')});
 }
 return {signatures:[{label,documentation:{kind:'plaintext',value:model.documentation||label},parameters,activeParameter:parameter}],activeSignature:0,activeParameter:parameter};
}
function help(source,pos,lookup,offsetLabels=false){
 const text=core.mask(source),offset=core.offset(source,pos);
 const previous=source.slice(0,offset).trimEnd().length-1;if(previous>=0&&text[previous]!==source[previous])return null;
 const tokens=/\\([A-Za-z@_:]+)/g;let match,chosen=null;
 while((match=tokens.exec(text))&&match.index<offset){
  let preceding=0;for(let i=match.index-1;i>=0&&text[i]==='\\';i--)preceding++;if(preceding%2)continue;
  const modern=require('./document-commands.cjs').definition(text,match.index),legacy=require('./declarations.cjs').legacyEnd(text,match[1],tokens.lastIndex);
  if(modern||legacy){const end=modern?.end||legacy;if(offset<end)return null;tokens.lastIndex=end;continue;}
  let name=match[1],environment=false,cursor=tokens.lastIndex;
  if(name==='begin'){const env=group(text,cursor);if(!env||offset<env.next)continue;name=env.value.trim();environment=true;cursor=env.next;}
  else if(name==='end')continue;
  const model=lookup(name,environment);if(!model)continue;
  const parameter=active(text,cursor,model.args,offset,model.constantStar);if(parameter!==null)chosen={model,parameter};
 }
 return chosen?build(chosen.model,chosen.parameter,offsetLabels):null;
}
module.exports={fromLabel,describe,active,build,help};
