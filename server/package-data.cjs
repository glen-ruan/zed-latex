'use strict';
const fs=require('node:fs'),path=require('node:path'),core=require('./core.cjs');
const data=require('./data/workshop-packages.json');
function cleanSnippet(value){return String(value||'').replace(/\$\{(\d+):([^}]*)\}/g,(_,n,text)=>'${'+n+':'+text.split('%')[0]+'}');}
function plain(value){return cleanSnippet(value).replace(/\$\{\d+:([^}]*)\}/g,'$1').replace(/\$\{\d+\|([^}]*)\|\}/g,(_,values)=>values.split(',')[0]).replace(/\$\d+/g,'');}
function context(files,folders,docs){
 const local=new Map();for(const folder of folders)for(const filename of core.scan(folder))if(/\.(sty|cls)$/i.test(filename))local.set(path.basename(filename),filename);
 const queue=[...files],seen=new Set(),selected=new Map(),passed=new Map(),localFiles=[];
 function add(name,options=''){name=name.trim();if(!name||/[\\#$]/.test(name))return;let entry=selected.get(name);if(!entry){entry=new Set();selected.set(name,entry);}for(const option of options.split(',').map(value=>value.trim()).filter(Boolean))entry.add(option);const filename=local.get(name+'.sty');if(filename)queue.push(filename);}
 for(let cursor=0;cursor<queue.length;cursor++){
  const filename=queue[cursor];if(seen.has(core.key(filename)))continue;seen.add(core.key(filename));let source;try{source=core.mask(core.read(filename,docs));}catch{continue;}if(/\.(sty|cls)$/i.test(filename))localFiles.push(filename);
  for(const match of source.matchAll(/\\(?:usepackage|RequirePackage)(?:WithOptions)?\s*(?:\[([^\]]*)\])?\s*\{([^{}]+)\}/g))for(const name of match[2].split(','))add(name,match[1]);
  for(const match of source.matchAll(/\\PassOptionsToPackage\s*\{([^{}]*)\}\s*\{([^{}]+)\}/g))for(const name of match[2].split(',')){const options=passed.get(name.trim())||new Set();for(const option of match[1].split(','))options.add(option.trim());passed.set(name.trim(),options);}
  for(const match of source.matchAll(/\\(?:documentclass|LoadClass)(?:WithOptions)?\s*(?:\[[^\]]*\])?\s*\{([^{}]+)\}/g)){const target=local.get(match[1].trim()+'.cls');if(target)queue.push(target);}
 }
 for(const [name,options] of passed)if(selected.has(name))for(const option of options)selected.get(name).add(option);
 const pending=[...selected.keys()];for(let cursor=0;cursor<pending.length;cursor++){const name=pending[cursor],record=data.packages[name];if(!record)continue;for(const dep of record.deps||[]){if(!dep.name)continue;if(dep.if&&!(typeof dep.if==='string'&&[...(selected.get(name)||[])].some(option=>option.replace(/\s*=\s*/g,'=')===dep.if.replace(/\s*=\s*/g,'='))))continue;if(dep.options?.length&&!dep.options.every(option=>selected.get(name)?.has(option)))continue;if(!selected.has(dep.name)){selected.set(dep.name,new Set());pending.push(dep.name);}}}
 const commands=new Map(),environments=new Map(),keys=new Map();
 for(const name of selected.keys()){
  const record=data.packages[name];if(!record)continue;
  for(const macro of record.macros||[]){if(macro.unusual||!/^\w[\w@:*]*$/.test(macro.name))continue;const snippet=cleanSnippet(macro.arg?.snippet||macro.name),signature='\\'+plain(snippet);let entry=commands.get(macro.name);if(!entry){entry={name:macro.name,package:name,snippet,signature,variants:[],description:typeof macro.doc==='string'?macro.doc:typeof macro.detail==='string'?macro.detail:''};commands.set(macro.name,entry);}if(!entry.variants.includes(signature))entry.variants.push(signature);if(macro.arg?.snippet&&(!entry.hasArgs||(macro.arg.format||'').includes('[')===false&&entry.optional)){entry.snippet=snippet;entry.signature=signature;entry.hasArgs=true;entry.optional=(macro.arg.format||'').includes('[');}}
  for(const env of record.envs||[])if(env.name)environments.set(env.name,{name:env.name,package:name});
  for(const [command,values] of Object.entries(record.keys||{}))if(Array.isArray(values))for(const alias of command.split(',').map(value=>value.replace(/#c$/,'').trim()))keys.set(alias,[...new Set([...(keys.get(alias)||[]),...values.filter(value=>typeof value==='string')])]);
 }
 return {packages:selected,packageCommands:commands,packageEnvironments:environments,packageKeys:keys,localFiles};
}
const REQUIRED={eqref:'amsmath',autoref:'hyperref',cref:'cleveref',Cref:'cleveref',citep:'natbib',citet:'natbib',textcite:'biblatex',parencite:'biblatex',addbibresource:'biblatex',printbibliography:'biblatex',includegraphics:'graphicx',operatorname:'amsopn',mathbb:'amsfonts'};
const REQUIRED_ENVS={align:'amsmath','align*':'amsmath',gather:'amsmath','gather*':'amsmath','equation*':'amsmath',matrix:'amsmath',pmatrix:'amsmath',bmatrix:'amsmath'};
function optionValues(values,prefix){
 const equal=prefix.indexOf('=');if(equal<0)return null;
 const key=prefix.slice(0,equal).trim(),valuePrefix=prefix.slice(equal+1).trimStart();const choices=new Set();
 for(const value of values){if(value.slice(0,value.indexOf('=')).trim()!==key)continue;const choice=/\$\{\d+\|([^{}]*)\|\}/.exec(value.slice(value.indexOf('=')+1));if(choice)for(const option of choice[1].split(','))if(option&&!/\$|[{}]/.test(option))choices.add(option);}
 return {key,prefix:valuePrefix,values:[...choices].filter(value=>value.toLowerCase().startsWith(valuePrefix.toLowerCase()))};
}
module.exports={context,plain,cleanSnippet,optionValues,REQUIRED,REQUIRED_ENVS};