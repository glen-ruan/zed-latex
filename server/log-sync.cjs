'use strict';
const fs=require('node:fs');
class LogSync {
  constructor(){this.logs=new Map();}
  read(filename){
    let stat;try{stat=fs.statSync(filename);}catch{this.logs.delete(filename);return null;}
    const signature=[stat.mtimeMs,stat.ctimeMs,stat.size].join(':');const previous=this.logs.get(filename);
    if(!previous||previous.signature!==signature){this.logs.set(filename,{signature,delivered:false});return null;}
    if(previous.delivered)return null;
    let log;try{log=fs.readFileSync(filename,'utf8');}catch{return null;}
    // Do not replace diagnostics with an empty or unfinished compiler log.
    if(!/(?:Output written on |No pages of output\.|Fatal error occurred|Emergency stop\.)/.test(log))return null;
    const current=fs.statSync(filename);if([current.mtimeMs,current.ctimeMs,current.size].join(':')!==signature)return null;
    previous.delivered=true;return log;
  }
}
module.exports={LogSync};
