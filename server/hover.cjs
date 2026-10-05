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
module.exports={bibliography,context,escapeMarkdown,code,prose,declaration,card,content};
