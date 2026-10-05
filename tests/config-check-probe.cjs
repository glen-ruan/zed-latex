'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),core=require('../server/core.cjs'),check=require('../server/config-check.cjs');
assert.deepEqual(check.validate(core.settings()),[]);
assert.deepEqual(check.validate(core.settings({'latex.build.fromFolder':'','latex.jobname':'','latex.rootFile':'','latex.outDir':''})),[]);
function issues(raw){return check.validate(core.settings(raw));}
assert(issues({'latex.recipes':[]}).some(item=>item.setting==='latex.recipes'));
assert(issues({'latex.tools':null,'latex.recipes':[null,{}, {name:'test',tools:['missing']}] }).length>=4);
assert(issues({'latex.recipe.default':'unknown'}).some(item=>item.setting==='latex.recipe.default'));
assert(issues({'latex.recipes':[{name:'r',tools:['missing']},{name:'r',tools:[]}]}).some(item=>item.message.includes('Duplicate recipe')));
assert(issues({'latex.tools':[{name:'t',command:'a'},{name:'t',command:'b'}]}).some(item=>item.message.includes('Duplicate tool')));
assert(issues({'latex.tools':[{name:'latexmk-xelatex',command:'"tool path.exe"',args:'-xelatex',env:{PATH:3},cwd:4}]}).some(item=>item.message.includes('quotes')));
assert(issues({'latex.outDir':'%TYPO%'}).some(item=>item.message.includes('%TYPO%')));
assert.equal(issues({'latex.clean.args':['%TEX%']}).length,0);
assert(issues({'latex.outDir':'%TYPO32%'}).some(item=>item.message.includes('%TYPO32%')));
if(process.platform==='win32')assert.equal(core.placeholders(path.resolve('main.tex'),'%DIR_W32%/build').output,path.resolve('build'));
const values=core.placeholders(path.resolve('main.tex'),'build');assert.equal(values.expand('%DOC_W32%'),values.values.DOC_W32);assert(!values.expand('%OUTDIR_W32%').includes('%'));
assert(issues({'formatting.latex':'tex-fmt','formatting.tex-fmt.args':'--nowrap'}).some(item=>item.setting.endsWith('.args')));
assert(issues({'latex.outDir':null,'latex.tools.searchPaths':'directory','latex.build.enableMagicComments':'true'}).length>=3);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'zed-config-check-'));
try{
 const main=path.join(root,'main.tex');fs.writeFileSync(main,'\\documentclass{article}\n\\begin{document}OK\\end{document}');
 const raw={'latex.tools':[{name:'latexmk-xelatex',command:process.execPath,args:[]}], 'latex.clean.command':process.execPath};
 let result=check.inspect(core.settings(raw),main,root);assert.equal(result.missing,0);assert.equal(result.issues.filter(item=>item.severity==='error').length,0);assert(!fs.existsSync(path.join(root,'build')),'Inspection wrote output directory');
 result=check.inspect(core.settings({...raw,'latex.tools.searchPaths':[path.join(root,'nonexistent')]}),main,root);assert(result.issues.some(item=>item.severity==='warning'&&item.setting.startsWith('latex.tools.searchPaths')));
 result=check.inspect(core.settings({...raw,'latex.build.fromFolder':'absent'}),main,root);assert(result.issues.some(item=>item.setting==='latex.build.fromFolder'));
 fs.writeFileSync(path.join(root,'blocked'),'keep');result=check.inspect(core.settings({...raw,'latex.outDir':'blocked/output'}),main,root);assert(result.issues.some(item=>item.setting==='latex.outDir'));assert.equal(fs.readFileSync(path.join(root,'blocked'),'utf8'),'keep');
 result=check.inspect(core.settings({...raw,'latex.tools':[{name:'latexmk-xelatex',command:path.join(root,'missing-executable')}]}),main,root);assert.equal(result.missing,1);assert(result.issues.some(item=>item.hint.includes('executable path')));
 fs.writeFileSync(main,'% !LW recipe = nonexistent\n\\documentclass{article}');result=check.inspect(core.settings(raw),main,root);assert(result.issues.some(item=>item.setting==='recipe selection'));assert.equal(result.recipe,null);
 fs.writeFileSync(main,'\\documentclass{article}');result=check.inspect(core.settings({...raw,'latex.outDir':'%OUTDIR%'}),main,root);assert(result.issues.some(item=>item.setting==='latex.outDir'));
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log('PASS config check: aggregated schema issues, duplicate/unknown recipes, placeholders, paths, tool discovery and no inspection writes');
