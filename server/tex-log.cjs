'use strict';
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const EXT='(?:tex|latex|cls|sty|def|bib|bbl|aux|toc|out|cfg|ltx|fd|dtx)';
function parse(output,root,{cwd=path.dirname(root),files=[],docs}={}){
 const result=new Map(),frames=[],seen=new Set();const normalize=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
 const known=new Set([root,...files].map(normalize));let pending=null;
 const direct=new RegExp('^(.+?\\.'+EXT+'):(\\d+):\\s*(.*)$','i');
 function current(){return [...frames].reverse().find(Boolean)||root;}
 function resolve(name){
  name=name.trim().replace(/^"|"$/g,'');if(!name)return null;
  const candidates=path.isAbsolute(name)?[name]:[path.resolve(cwd,name),path.resolve(path.dirname(root),name),path.resolve(path.dirname(current()),name)];
  for(const candidate of candidates){try{if(known.has(normalize(candidate))||fs.statSync(candidate).isFile())return path.resolve(candidate);}catch{}}
  return path.resolve(cwd,name);
 }
 function source(filename){try{return docs?.get(normalize(filename))?.text??fs.readFileSync(filename,'utf8');}catch{return null;}}
 function publish(){
  if(!pending)return;const item=pending;pending=null;
  const text=source(item.file),lines=text?.split(/\r?\n/);let line=Math.max(0,(item.line||1)-1),start=0,end=1;
  if(lines){line=Math.min(line,lines.length-1);const value=lines[line];start=Math.max(0,value.search(/\S/));end=Math.max(start+1,value.length);
   const tokens=item.snippet?.match(/\\[A-Za-z@:_]+/g)||[];if(tokens.length===1){const index=value.indexOf(tokens[0]);if(index>=0&&value.indexOf(tokens[0],index+tokens[0].length)<0){start=index;end=index+tokens[0].length;}}
   if(!value.length)end=0;
  }
  let message=item.parts.join('\n').trim().slice(0,2000);if(!item.line)message+='\n(No source line supplied by TeX; see the build log.)';
  const key=normalize(item.file)+'|'+line+'|'+item.severity+'|'+message;if(seen.has(key))return;seen.add(key);
  const uri=pathToFileURL(path.resolve(item.file)).href;if(!result.has(uri))result.set(uri,[]);
  result.get(uri).push({source:'latex-workshop',message,severity:item.severity,range:{start:{line,character:start},end:{line,character:end}}});
 }
 function context(line){
  for(let i=0;i<line.length;i++){
   if(line[i]==='('){
    const tail=line.slice(i+1),quoted=/^"([^"]+)"/.exec(tail),plain=new RegExp('^([^\r\n]*?\\.'+EXT+')(?=[\\s)]|$)','i').exec(tail);
    const name=quoted?.[1]||plain?.[1];let filename=name?resolve(name):null;
    // Only plausible source filenames create a file frame; other parentheses are balanced contexts.
    if(filename){try{if(!known.has(normalize(filename))&&!fs.statSync(filename).isFile())filename=null;}catch{filename=null;}}
    frames.push(filename);if(filename)i+=(quoted?.[0]||plain?.[0]).length;
   }else if(line[i]===')')frames.pop();
  }
 }
 const lines=String(output).split(/\r?\n/);
 for(const line of lines){
  const explicit=direct.exec(line),error=/^!\s+(.+)$/.exec(line),warning=/^(?:LaTeX|Package\s+\S+|Class\s+\S+) Warning:\s*(.*)$/.exec(line);
  if(explicit||error||warning){publish();
   const message=explicit?.[3]||error?.[1]||warning?.[1]||'';
   pending={file:explicit?resolve(explicit[1]):current(),line:explicit?Number(explicit[2]):null,severity:warning||/\bWarning:/.test(message)?2:1,parts:[message],snippet:null};
   const number=/on input line\s+(\d+)\.?/.exec(message);if(number)pending.line=Number(number[1]);
   continue;
  }
  if(pending){
   const location=/^l\.(\d+)\s?(.*)$/.exec(line);if(location){pending.line=Number(location[1]);pending.snippet=location[2];publish();continue;}
   // Package warning continuations have (package) prefixes; do not treat these as source stack changes.
   const continuation=/^\([\w .-]+\)\s+(.*)$/.exec(line);
   if(continuation||/^\s+\S/.test(line)){
    const value=(continuation?.[1]||line.trim());if(!/^(?:Here is how much|<\*>|Type\s|Enter\s)/.test(value)&&pending.parts.length<12){pending.parts.push(value);const number=/on input line\s+(\d+)\.?/.exec(value);if(number)pending.line=Number(number[1]);}continue;
   }
   if(pending.severity===2&&(!line.trim()||line.startsWith('(')||line.startsWith(')')))publish();
  }
  context(line);
 }
 publish();return result;
}
module.exports={parse};
