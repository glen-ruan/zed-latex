'use strict';
const fs=require('node:fs'),path=require('node:path');
function reason(output,code){
  const lines=String(output||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const patterns=[/xdvipdfmx:fatal:/i,/^.+\.(?:tex|cls|sty|def|bib):\d+:\s*(?!.*warning)/i,/^! /,/^I couldn.t open/i,/^I found no/i,/^Emergency stop/i,/^.*(?:ENOENT|EACCES|EPERM|permission denied|access is denied)/i];
  for(const pattern of patterns){const line=lines.find(line=>pattern.test(line));if(line)return line.slice(0,500);}
  const last=lines.filter(line=>/error|failed|fatal/i.test(line)).at(-1);
  return last?last.slice(0,500):`Tool exited with ${code ?? 'an unknown status'}.`;
}
function logfile(root,output){return path.join(output,path.basename(root,path.extname(root))+'.latex-workshop.log');}
function save(filename,lines){fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,lines.join('\n'),'utf8');}
module.exports={reason,logfile,save};