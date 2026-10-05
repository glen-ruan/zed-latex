'use strict';
// Read static document definitions; do not expand TeX or execute processors.
const FAMILY=/^(?:New|Renew|Provide|Declare)(?:Expandable)?Document(?:Command|Environment)$/;
function group(text,start){
 while(/\s/.test(text[start]||'')&&start<text.length)start++;
 if(text[start]!=='{')return null;
 let depth=1;
 for(let i=start+1;i<text.length;i++){
  if(text[i]==='\\'){i++;continue;}
  if(text[i]==='{')depth++;else if(text[i]==='}'&&!--depth)return {start:start+1,end:i,next:i+1,value:text.slice(start+1,i)};
 }
 return null;
}
function definition(text,start){
 const head=/^\\([A-Za-z]+)\b/.exec(text.slice(start));if(!head||!FAMILY.test(head[1]))return null;
 let cursor=start+head[0].length;const environment=head[1].endsWith('Environment');
 const nameGroup=group(text,cursor);let name,nameStart,nameEnd;
 if(nameGroup){
  const raw=nameGroup.value.trim();if(environment?!/^[\w@:*.-]+$/.test(raw):!/^\\[A-Za-z@_:]+$/.test(raw))return null;
  name=environment?raw:raw.slice(1);nameStart=nameGroup.start+nameGroup.value.indexOf(raw)+(environment?0:1);nameEnd=nameStart+name.length;cursor=nameGroup.next;
 }else{
  if(environment)return null;const token=/^\s*\\([A-Za-z@_:]+)/.exec(text.slice(cursor));if(!token)return null;
  name=token[1];nameEnd=cursor+token[0].length;nameStart=nameEnd-name.length;cursor=nameEnd;
 }
 const spec=group(text,cursor);if(!spec)return null;
 const body=group(text,spec.next);if(!body)return null;
 const ending=environment?group(text,body.next):null;if(environment&&!ending)return null;
 return {name,environment,start,nameStart,nameEnd,end:ending?.next||body.next,spec:spec.value,body};
}
function scan(text){
 const found=[],tokens=/\\[A-Za-z]+/g;let match;
 while((match=tokens.exec(text))){
  let preceding=0;for(let i=match.index-1;i>=0&&text[i]==='\\';i--)preceding++;if(preceding%2)continue;
  const item=definition(text,match.index);if(item){found.push(item);tokens.lastIndex=item.end;}
 }
 return found;
}
function signature(name,spec){
 let cursor=0,count=0,shown='\\'+name,snippet=name;const details=[];
 const skip=()=>{while(/\s/.test(spec[cursor]||'')&&cursor<spec.length)cursor++;};
 const token=()=>{skip();const item=/^\\(?:[A-Za-z@_:]+|.)|^[^\s{}]/.exec(spec.slice(cursor));if(!item)return null;cursor+=item[0].length;return item[0];};
 const argument=()=>{const item=group(spec,cursor);if(!item)return null;cursor=item.next;return item.value;};
 const escape=value=>value.replace(/[\\$]/g,'\\$&');
 while(cursor<spec.length){
  skip();if(cursor===spec.length)break;const type=spec[cursor++];
  if('+!='.includes(type))continue;
  if(type==='>'){if(argument()===null)return null;continue;}
  let open,close,defaultValue=null,test=null;
  if(type==='m'||type==='v'){open='{';close='}';}
  else if(type==='o'||type==='O'){open='[';close=']';if(type==='O'){defaultValue=argument();if(defaultValue===null)return null;}}
  else if('dDrR'.includes(type)){open=token();close=token();if(open===null||close===null)return null;if(type==='D'||type==='R'){defaultValue=argument();if(defaultValue===null)return null;}}
  else if(type==='s')test='*';else if(type==='t'){test=token();if(test===null)return null;}
  else return null; // Preserve raw spec rather than fabricate a partial signature.
  if(++count>9)return null;
  if(test!==null){shown+='['+test+']';snippet+='${'+count+':}';details.push('参数'+count+'：可选标记 '+test);}
  else {shown+=open+'参数'+count+close;snippet+=escape(open)+'${'+count+':参数'+count+'}'+escape(close);details.push('参数'+count+'：'+('oOdD'.includes(type)?'可选':'必选')+(defaultValue!==null?'，默认值 '+defaultValue:''));}
 }
 return {signature:shown,snippet,details:details.join('\n')};
}
module.exports={FAMILY,definition,scan,signature};
