'use strict';
const core=require('./core.cjs');
// One snapshot per build root; publication is a union, never a file-wide overwrite.
class BuildDiagnostics {
 constructor(){this.roots=new Map();}
 replace(root,files){const snapshot=new Map();for(const [file,items] of files)if(items.length)snapshot.set(core.key(file),items.slice());if(snapshot.size)this.roots.set(core.key(root),snapshot);else this.roots.delete(core.key(root));}
 add(root,file,item){const key=core.key(root),snapshot=this.roots.get(key)||new Map(),filename=core.key(file);snapshot.set(filename,[...(snapshot.get(filename)||[]),item]);this.roots.set(key,snapshot);}
 hasErrors(root){return [...(this.roots.get(core.key(root))?.values()||[])].some(items=>items.some(item=>item.severity===1));}
 merged(){
  const grouped=new Map();
  for(const [root,files] of this.roots)for(const [file,items] of files){
   const entries=grouped.get(file)||new Map();grouped.set(file,entries);
   for(const item of items){const identity=JSON.stringify([item.range,item.severity,item.message,item.source,item.code,item.tags]);let entry=entries.get(identity);if(!entry){entry={item,owners:new Set()};entries.set(identity,entry);}entry.owners.add(root);}
  }
  return new Map([...grouped].map(([file,entries])=>[file,[...entries.values()].map(({item,owners})=>({...item,relatedInformation:[...(item.relatedInformation||[]),...[...owners].sort().map(root=>({location:{uri:core.uri(root),range:{start:{line:0,character:0},end:{line:0,character:0}}},message:'构建主文件：'+root}))]}))]));
 }
}
module.exports={BuildDiagnostics};
