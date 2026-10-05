'use strict';
const fs=require('node:fs'),path=require('node:path'),core=require('./core.cjs'),tools=require('./tools.cjs');
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const string=value=>typeof value==='string'&&value.trim().length>0;
function validate(config){
 const issues=[];const add=(setting,message,hint,severity='error')=>issues.push({setting,severity,message,hint});
 function text(key,optional=false){if(config[key]===undefined&&optional)return;if(typeof config[key]!=='string'||(!optional&&key!=='latex.outDir'&&!config[key].trim()))add(key,optional||key==='latex.outDir'?'Must be a string.':'Must be a nonempty string.','Set a name or path as a JSON string.');}
 function strings(key,value=config[key]){if(!Array.isArray(value)||value.some(item=>typeof item!=='string'))add(key,'Must be an array of strings.','Use ["value", "value2"], not one command-line string.');}
 text('latex.outDir');text('latex.recipe.default');text('latex.rootFile',true);text('latex.build.fromFolder',true);text('latex.jobname',true);
 strings('latex.tools.searchPaths');text('latex.clean.command');strings('latex.clean.args');
 for(const [key,allowed] of [['formatting.latex',['none','tex-fmt','latexindent']],['latex.autoBuild.run',['never','onSave','onFileChange']],['latex.clean.method',['command']]])if(!allowed.includes(config[key]))add(key,'Unsupported value: '+JSON.stringify(config[key]),'Choose '+allowed.map(value=>JSON.stringify(value)).join(', ')+'.');
 for(const key of ['latex.build.enableMagicComments','latex.autoBuild.cleanAndRetry.enabled'])if(typeof config[key]!=='boolean')add(key,'Must be a boolean.','Use true or false without quotes.');
 if(config['latex.magic.args']!==undefined)strings('latex.magic.args');
 const known=new Set(Object.keys(core.placeholders(path.resolve('main.tex'),'build').values));
 function placeholders(key,value){if(typeof value!=='string')return;for(const match of value.matchAll(/%([A-Z_][A-Z_0-9]*)%/g))if(!known.has(match[1])&&!(key.startsWith('latex.clean.args')&&match[1]==='TEX'))add(key,'Unknown placeholder '+match[0]+'.','Use supported placeholders such as %DOC%, %DOC_EXT%, %DIR% or %OUTDIR%.');}
 if(Array.isArray(config['latex.magic.args']))config['latex.magic.args'].forEach((arg,i)=>placeholders('latex.magic.args['+i+']',arg));
 for(const key of ['latex.outDir','latex.build.fromFolder','latex.clean.command'])placeholders(key,config[key]);
 if(Array.isArray(config['latex.clean.args']))config['latex.clean.args'].forEach((value,i)=>placeholders('latex.clean.args['+i+']',value));
 function tool(value,key,named=true){
  if(!object(value)){add(key,'Tool must be an object.','Provide command, args and optionally env/cwd.');return;}
  if(named&&!string(value.name))add(key+'.name','Tool name is missing.','Give the tool a unique name used by a recipe.');
  if(!string(value.command))add(key+'.command','Executable is missing.','Set an executable name or absolute path; put arguments in args.');
  else {placeholders(key+'.command',value.command);if(/^(["']).*\1$/.test(value.command))add(key+'.command','Executable path includes surrounding quotes.','Remove the outer quotes; JSON already preserves spaces in paths.');}
  if(value.args!==undefined){strings(key+'.args',value.args);if(Array.isArray(value.args))value.args.forEach((arg,i)=>placeholders(key+'.args['+i+']',arg));}
  if(value.cwd!==undefined){if(typeof value.cwd!=='string')add(key+'.cwd','Working directory must be a nonempty string.','Use %DIR% or an existing directory path.');else placeholders(key+'.cwd',value.cwd);}
  if(value.env!==undefined){if(!object(value.env)||Object.values(value.env).some(v=>typeof v!=='string'))add(key+'.env','Environment must map variable names to strings.','Use {"PATH": "directory;${env:PATH}"} on Windows.');else for(const [name,v] of Object.entries(value.env))placeholders(key+'.env.'+name,v);}
 }
 const catalog=config['latex.tools'],recipes=config['latex.recipes'];const names=new Set(),recipeNames=new Set();
 if(!Array.isArray(catalog))add('latex.tools','Must be an array of tool objects.','Define named tools referenced by recipes.');
 else catalog.forEach((value,i)=>{tool(value,'latex.tools['+i+']');if(string(value?.name)){if(names.has(value.name))add('latex.tools['+i+'].name','Duplicate tool name: '+value.name,'Use unique names so a recipe selects one tool.');names.add(value.name);}});
 if(!Array.isArray(recipes)||!recipes.length)add('latex.recipes','At least one recipe is required.','Define [{"name":"XeLaTeX", "tools":["latexmk-xelatex"]}].');
 else recipes.forEach((recipe,i)=>{const key='latex.recipes['+i+']';if(!object(recipe)){add(key,'Recipe must be an object.','Provide a name and tools array.');return;}
  if(!string(recipe.name))add(key+'.name','Recipe name is missing.','Give the recipe a unique name.');else {if(recipeNames.has(recipe.name))add(key+'.name','Duplicate recipe name: '+recipe.name,'Use unique recipe names.');recipeNames.add(recipe.name);}
  if(!Array.isArray(recipe.tools)||!recipe.tools.length)add(key+'.tools','Recipe has no tool steps.','Add at least one named tool or inline tool object.');
  else recipe.tools.forEach((value,j)=>{if(typeof value==='string'){if(!names.has(value))add(key+'.tools['+j+']','Unknown tool: '+value,'Define this name in latex.tools or correct the reference.');}else tool(value,key+'.tools['+j+']',false);});
 });
 const preferred=config['latex.recipe.default'];if(string(preferred)&&!['first','lastUsed'].includes(preferred)&&!recipeNames.has(preferred))add('latex.recipe.default','Unknown recipe: '+preferred,'Use first, lastUsed, or an exact recipe name.');
 const formatter=config['formatting.latex'];if(['tex-fmt','latexindent'].includes(formatter)){text('formatting.'+formatter+'.path');strings('formatting.'+formatter+'.args');}
 return issues;
}
function inspect(config,root,workspace,lastRecipe){
 const issues=validate(config),rows=[],found=[];let missing=0,recipe=null;
 const add=(setting,message,hint,severity='error')=>issues.push({setting,severity,message,hint});
 function directory(setting,filename,required=true){try{if(!fs.statSync(filename).isDirectory())throw Error('not a directory');rows.push('[OK] '+setting+': '+filename);return true;}catch{add(setting,'Directory does not exist or is not a directory: '+filename,'Create this directory or correct the configured path.',required?'error':'warning');return false;}}
 if(Array.isArray(config['latex.tools.searchPaths']))for(const [i,value] of config['latex.tools.searchPaths'].entries())if(typeof value==='string')directory('latex.tools.searchPaths['+i+']',path.resolve(path.dirname(root),value),false);
 if(!issues.some(issue=>issue.severity==='error'))try{recipe=core.recipe(root,config,workspace,undefined,lastRecipe);}catch(error){add('recipe selection',error.message,'Check % !LW recipe / % !TeX program comments and latex.recipe.default.');}
 function check(label,command,required=true,env={},cwd=recipe?.cwd||path.dirname(root),base){
  try{const launch=tools.launch(command,{base:base||process.env,overrides:env,directories:config['latex.tools.searchPaths'],cwd});rows.push('[OK] '+label+': '+launch.command);found.push(path.dirname(launch.command));return launch;}
  catch(error){rows.push('['+(required?'MISSING':'OPTIONAL')+'] '+label+': '+error.message);add(label,error.message,'Install the tool or set its executable path. Keep arguments in args. Restart Zed after changing system PATH.',required?'error':'warning');if(required)missing++;}
 }
 if(recipe){
  for(const [key,value] of [['latex.outDir',recipe.output],['latex.build.fromFolder',recipe.cwd],...recipe.steps.flatMap((step,i)=>[['Recipe step '+(i+1)+' cwd',step.cwd],['Recipe step '+(i+1)+' command',step.command]])])if(typeof value==='string'&&/%[A-Z_][A-Z_0-9]*%/.test(value))add(key,'Placeholder remains unresolved: '+value,'Avoid circular placeholders in directory paths; use build or %DIR%/build.');
  directory('latex.build.fromFolder',recipe.cwd);
  // A nonexistent output directory is normal; only an existing file blocks creation.
  let ancestor=recipe.output;while(!fs.existsSync(ancestor)&&path.dirname(ancestor)!==ancestor)ancestor=path.dirname(ancestor);
  try{if(!fs.statSync(ancestor).isDirectory())add('latex.outDir','Output path is blocked by a file: '+ancestor,'Choose a directory path or rename the blocking file.');else fs.accessSync(ancestor,fs.constants.W_OK);}catch(error){add('latex.outDir','Output ancestor is inaccessible: '+ancestor,'Choose a writable output directory.');}
  for(const [i,step] of recipe.steps.entries()){
   const cwd=step.cwd||recipe.cwd;directory('Recipe step '+(i+1)+' cwd',cwd);
   const launch=check('Recipe tool '+(i+1),step.command,true,step.env,cwd);
   if(launch&&/^latexmk(?:\.exe|\.pl)?$/i.test(path.basename(step.command))){const engine=step.args.some(arg=>/^-?(?:xelatex|pdfxe)$/.test(arg))?'xelatex':step.args.some(arg=>/^-?(?:lualatex|pdflua)$/.test(arg))?'lualatex':step.args.includes('-pdf')?'pdflatex':null;if(engine)check('Engine',engine,true,{},cwd,launch.env);}
  }
  const first=recipe.steps[0],clean=config['latex.clean.command']==='latexmk'&&/^latexmk(?:\.exe|\.pl)?$/i.test(path.basename(first?.command||''))?first.command:config['latex.clean.command'];check('Cleanup',clean,false,first?.env,first?.cwd||recipe.cwd);
  const formatter=config['formatting.latex'];if(formatter!=='none')check('Formatter',config['formatting.'+formatter+'.path']);
  try{const launch=tools.launch('kpsewhich',{directories:[...config['latex.tools.searchPaths'],...found],cwd:recipe.cwd});rows.push('[OK] Package catalog: '+launch.command);}catch{rows.push('[OPTIONAL] kpsewhich unavailable; installed-package completion requires kpsewhich and a TeX filename database.');add('Package catalog','kpsewhich is unavailable.','Install a TeX distribution or add its bin directory to latex.tools.searchPaths for installed-package completion.','warning');}
 }
 if(!recipe)rows.push('[SKIPPED] Executable checks: fix the configuration or recipe selection errors first.');
 return {issues,rows,recipe,missing};
}
module.exports={validate,inspect};
