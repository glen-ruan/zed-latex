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
module.exports={bibliography,context};