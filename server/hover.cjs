'use strict';
// Read one BibTeX entry for display; preserve TeX and unresolved string expressions.
function bibliography(source,keyOffset){
  const start=source.lastIndexOf('@',keyOffset);if(start<0)return null;
  const header=/^@([a-z]+)\s*([{(])/i.exec(source.slice(start));if(!header)return null;
  const close=header[2]==='{'?'}':')',bodyStart=start+header[0].length;
  let braces=0,quoted=false,end=bodyStart;
  for(;end<source.length;end++){const c=source[end];if(c==='\\'){end++;continue;}if(c==='"'&&!braces)quoted=!quoted;if(quoted)continue;if(c==='{')braces++;else if(c==='}'&&braces)braces--;else if(c===close&&!braces)break;}
  const body=source.slice(bodyStart,end),comma=body.indexOf(',');if(comma<0)return null;
  const fields={};let cursor=comma+1;
  while(cursor<body.length){
    if(/[\s,]/.test(body[cursor])){cursor++;continue;}if(body[cursor]==='%'){const newline=body.indexOf('\n',cursor);cursor=newline<0?body.length:newline+1;continue;}
    const field=/^([a-z][\w-]*)\s*=\s*/i.exec(body.slice(cursor));if(!field)break;
    cursor+=field[0].length;const from=cursor;let depth=0,inQuote=false;
    for(;cursor<body.length;cursor++){const c=body[cursor];if(c==='\\'){cursor++;continue;}if(c==='"'&&!depth)inQuote=!inQuote;if(inQuote)continue;if(c==='{')depth++;else if(c==='}')depth--;else if(c===','&&!depth)break;}
    let value=body.slice(from,cursor).trim();if((value.startsWith('{')&&value.endsWith('}'))||(value.startsWith('"')&&value.endsWith('"')))value=value.slice(1,-1);
    fields[field[1].toLowerCase()]=value.replace(/\s+/g,' ').slice(0,700);cursor++;
  }
  return {type:header[1],fields};
}
function context(source,line){const lines=source.split(/\r?\n/);return lines.slice(Math.max(0,line-2),Math.min(lines.length,line+5)).join('\n').slice(0,1000);}
function escapeMarkdown(value){return String(value).replace(/[\\\x60*_{}\[\]<>#!|$]/g,'\\$&');}
function code(value,language='latex'){
 const text=String(value),runs=[...text.matchAll(/~+/g)].map(match=>match[0].length),fence='~'.repeat(Math.max(3,...runs.map(n=>n+1)));
 return fence+language+'\n'+text+'\n'+fence;
}
function prose(value){return String(value).split(/\n{2,}/).map(part=>part.split('\n').map(escapeMarkdown).join('  \n')).join('\n\n');}
function declaration(source,entry){
 const core=require('./core.cjs'),offset=core.offset(source,entry.range.start),docs=new Map([[core.key(entry.file),{text:source}]]);
 const spans=core.analyzeSource(entry.file,docs,'hover-declarations',text=>{
  const masked=core.mask(text),items=[...require('./wrappers.cjs').definitions(text),...require('./document-commands.cjs').scan(masked),...require('./declarations.cjs').scan(masked),...require('./environments.cjs').scan(text)];
  for(const item of require('./definition-candidates.cjs').legacy(text)){const head=/^\\([A-Za-z@_:]+)\*?/.exec(masked.slice(item.start)),end=head&&require('./declarations.cjs').legacyEnd(masked,head[1],item.start+head[0].length);if(end)items.push({...item,end});}
  return items;
 });
 const span=spans.filter(item=>item.start<=offset&&offset<item.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];
 let text=span?source.slice(span.start,span.end):source.split(/\r?\n/)[entry.range.start.line]||'';
 const lines=text.split(/\r?\n/),limited=lines.slice(0,8).join('\n');text=limited.slice(0,600);
 if(lines.length>8||limited.length>600)text+='\n% …（源码预览已省略）';
 return text;
}
function card(signature,description,source,where,notice='',variants=[]){
 const parts=[code(signature)];
 if(description)parts.push(prose(description));
 for(const variant of variants.slice(1,4))if(variant!==signature)parts.push(code(variant));
 if(source)parts.push('**定义预览**\n\n'+code(source));
 if(where)parts.push('**来源**\n\n'+code(where,'text'));
 if(notice)parts.push('---\n\n'+prose(notice.trim()));
 return parts.join('\n\n');
}
function content(plain,markdown,formats){return formats?.includes('markdown')?{kind:'markdown',value:markdown}:{kind:'plaintext',value:plain};}
function fileCard(name,where,source,language='latex'){
 const parts=['**文件**\n\n'+code(name,'text'),'**位置**\n\n'+code(where,'text')];
 if(source)parts.push('**源码预览**\n\n'+code(source,language));
 return parts.join('\n\n');
}
module.exports={fileCard,bibliography,context,escapeMarkdown,code,prose,declaration,card,content};
function referenceContext(source,entry){
 const core=require('./core.cjs'),at=core.offset(source,entry.range.start),clean=core.mask(source);
 function group(start,open='{',close='}'){
  while(/\s/.test(clean[start]||'')&&start<clean.length)start++;
  if(clean[start]!==open)return null;let depth=1,braces=0;
  for(let i=start+1;i<clean.length;i++){
   if(clean[i]==='\\'){i++;continue;}
   if(open==='['){if(clean[i]==='{')braces++;else if(clean[i]==='}')braces--;if(braces)continue;}
   if(clean[i]===open)depth++;else if(clean[i]===close&&--depth===0)return {start,end:i+1};
  }return null;
 }
 const labels=[...clean.matchAll(/\\label\s*\{/g)].map(m=>{const arg=group(m.index+m[0].length-1);return arg&&{start:m.index,end:arg.end};}).filter(Boolean);
 const label=labels.find(item=>item.start<=at&&at<item.end);if(!label)return context(source,entry.range.start.line);
 const candidates=[];
 for(const match of clean.matchAll(/\\subfloat\b/g)){
  let cursor=match.index+match[0].length;
  for(let n=0;n<2;n++){const arg=group(cursor,'[',']');if(arg)cursor=arg.end;}
  const body=group(cursor);if(body&&match.index<=at&&at<body.end)candidates.push({start:match.index,end:body.end});
 }
 function structures(text){const spans=[];function visit(nodes){for(const node of nodes){if(['float','math'].includes(node.detail))spans.push({start:core.offset(text,node.range.start),end:core.offset(text,node.range.end)});visit(node.children||[]);}}visit(core.symbols(text));return spans;}
 const spans=entry.file?core.analyzeSource(entry.file,new Map([[core.key(entry.file),{text:source}]]),'reference-preview-spans',structures):structures(source);
 candidates.push(...spans.filter(item=>item.start<=at&&at<item.end));
 const span=candidates.filter(item=>labels.filter(other=>item.start<=other.start&&other.end<=item.end).length===1).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];
 let start=span?.start??Math.max(0,core.offset(source,{line:Math.max(0,entry.range.start.line-2),character:0})),end=span?.end??label.end;
 const previous=labels.filter(item=>item.end<=label.start).at(-1);if(previous)start=Math.max(start,previous.end);
 const labelLine=source.slice(start,at).split('\n').length-1,lines=source.slice(start,end).split(/\r?\n/),from=Math.max(0,labelLine-3),to=Math.min(lines.length,from+8);
 let text=lines.slice(from,to).join('\n'),clipped=from>0||to<lines.length;
 if(text.length>600){const relative=text.indexOf(source.slice(label.start,label.end));const begin=Math.max(0,relative-250);text=text.slice(begin,begin+600);clipped=true;}
 return (from>0?'% …\n':'')+text.trim()+(clipped?'\n% …（源码预览已省略）':'');
}
function referenceCard(name,where,source){
 return '**标签**\n\n'+code(name,'text')+'\n\n**定义位置**\n\n'+code(where,'text')+'\n\n**相关源码**\n\n'+code(source);
}
module.exports.referenceContext=referenceContext;
module.exports.referenceCard=referenceCard;
