'use strict';
const fs=require('node:fs'),path=require('node:path');
function environment(base,overrides={},directories=[],platform=process.platform){
  const env={...base};
  if(platform!=='win32')return {...env,...overrides,PATH:[...directories,overrides.PATH ?? base.PATH ?? ''].filter(Boolean).join(path.delimiter)};
  let inherited='',supplied;
  for(const key of Object.keys(env))if(key.toLowerCase()==='path'){inherited=env[key];delete env[key];}
  for(const [key,value] of Object.entries(overrides))if(key.toLowerCase()==='path')supplied=value;else env[key]=value;
  env.PATH=[...directories,supplied ?? inherited].filter(Boolean).join(';');return env;
}
function launch(command,{base=process.env,overrides={},directories=[],cwd=process.cwd()}={}){
  if(typeof command!=='string'||!command.trim())throw Error('Tool command must be a nonempty executable name or path');
  if(!Array.isArray(directories)||directories.some(value=>typeof value!=='string'))throw Error('latex.tools.searchPaths must be an array of directory paths');
  const env=environment(base,overrides,directories);
  const explicit=path.isAbsolute(command)||/[\\/]/.test(command);
  const candidates=explicit?[path.resolve(cwd,command)]:(env.PATH||'').split(path.delimiter).filter(Boolean).map(dir=>path.resolve(cwd,dir,command));
  const extensions=process.platform==='win32'&&!path.extname(command)?['','.exe','.com']:[''];
  for(const candidate of candidates)for(const extension of extensions){
    const executable=candidate+extension;
    try{if(!fs.statSync(executable).isFile())continue;fs.accessSync(executable,process.platform==='win32'?fs.constants.F_OK:fs.constants.X_OK);}catch{continue;}
    return {command:executable,env:environment(env,{},[path.dirname(executable)])};
  }
  throw Error(`Cannot find executable "${command}". Install the tool, add its directory to latex.tools.searchPaths or PATH, or configure its absolute executable path. Restart Zed after changing the system PATH.`);
}
module.exports={environment,launch};
