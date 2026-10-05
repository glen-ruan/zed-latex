'use strict';
const fs=require('node:fs'),path=require('node:path');
function key(file){const full=path.resolve(file);return process.platform==='win32'?full.toLowerCase():full;}
class SourceCache {
 constructor({maxFiles=256,maxBytes=32*1024*1024,maxProjects=16}={}){this.files=new Map();this.projects=new Map();this.maxFiles=maxFiles;this.maxBytes=maxBytes;this.maxProjects=maxProjects;this.bytes=0;this.serial=0;}
 entry(file,docs){
  const filename=key(file),doc=docs?.get(filename);let stamp=null,text;
  if(doc)text=doc.text;else {const stat=fs.statSync(file,{bigint:true});stamp=[stat.mtimeNs,stat.ctimeNs,stat.size,stat.ino].join(':');}
  let entry=this.files.get(filename);
  if(!doc&&entry?.stamp===stamp){this.files.delete(filename);this.files.set(filename,entry);return entry;}
  if(!doc)text=fs.readFileSync(file,'utf8');
  if(!entry||entry.text!==text){if(entry)this.bytes-=entry.bytes;entry={text,stamp,revision:++this.serial,analyses:new Map(),bytes:Buffer.byteLength(text,'utf8')};this.bytes+=entry.bytes;}
  else entry.stamp=stamp;
  this.files.delete(filename);this.files.set(filename,entry);
  while(this.files.size>this.maxFiles||this.bytes>this.maxBytes){const first=this.files.keys().next().value,removed=this.files.get(first);this.files.delete(first);this.bytes-=removed.bytes;}
  return entry;
 }
 analyze(file,docs,tag,parse){const entry=this.entry(file,docs);if(!entry.analyses.has(tag))entry.analyses.set(tag,parse(entry.text));return entry.analyses.get(tag);}
 project(files,docs,tag,build){
  const stamp=JSON.stringify(files.map(file=>{try{return [key(file),this.entry(file,docs).revision];}catch{return [key(file),null];}}));
  const old=this.projects.get(tag);if(old?.stamp===stamp){this.projects.delete(tag);this.projects.set(tag,old);return old.value;}
  const value=build();this.projects.delete(tag);this.projects.set(tag,{stamp,value});while(this.projects.size>this.maxProjects)this.projects.delete(this.projects.keys().next().value);return value;
 }
 clear(){this.files.clear();this.projects.clear();this.bytes=0;}
}
module.exports={SourceCache};
