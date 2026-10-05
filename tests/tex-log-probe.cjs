'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),core=require('../server/core.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'zed-tex-log space '));
try{
 const main=path.join(root,'main.tex'),child=path.join(root,'chapter (part).tex'),nested=path.join(root,'nested.tex');
 fs.writeFileSync(main,'\\documentclass{article}\n\\begin{document}\nMain\n\\end{document}');fs.writeFileSync(child,'Title\n  \\BadCommand\nTail');fs.writeFileSync(nested,'Nested\nSecond\n \\OtherBad');
 function get(log,options){return core.logDiagnostics(log,main,options);}
 let result=get('('+main+'\n("'+child+'"\n! Undefined control sequence.\nl.2   \\BadCommand\n)\nLaTeX Warning: Root warning on input line 3.\n)');
 assert(!result.get(core.uri(main)).some(item=>item.severity===1));let issue=result.get(core.uri(child))[0];assert.equal(issue.range.start.line,1);assert.equal(issue.range.start.character,2);assert.equal(issue.range.end.character,13);assert(issue.message.includes('Undefined control sequence'));
 assert.equal(result.get(core.uri(main))[0].range.start.line,2);
 result=get('('+main+'\n("'+child+'"\n('+nested+'\n! Undefined control sequence.\nl.3 \\OtherBad\n)\nPackage demo Warning: A long message\n(demo)                continues here\n(demo)                on input line 2.\n\n)\n)');
 assert.equal(result.get(core.uri(nested))[0].range.start.line,2);issue=result.get(core.uri(child))[0];assert.equal(issue.severity,2);assert.equal(issue.range.start.line,1);assert(issue.message.includes('continues here'));assert(!issue.message.includes('(demo)'));
 result=get(child+':2: Undefined control sequence.\nl.2 \\BadCommand\n'+child+':2: Undefined control sequence.\nl.2 \\BadCommand');assert.equal(result.get(core.uri(child)).length,1);
 result=get('! Missing $ inserted.\nl.3 Main');assert.equal(result.get(core.uri(main))[0].range.start.line,2);
 result=get('! Emergency stop.');assert(result.get(core.uri(main))[0].message.includes('No source line supplied'));
 result=get('('+main+'\n('+nested+'\n)\nLaTeX Warning: Root warning on input line 3.\n)');assert(!result.has(core.uri(nested)));assert.equal(result.get(core.uri(main))[0].range.start.line,2);
 const subdir=path.join(root,'sub');fs.mkdirSync(subdir);fs.writeFileSync(path.join(subdir,'same.tex'),'one\n\\CwdError');fs.writeFileSync(path.join(root,'same.tex'),'root');
 result=get('same.tex:2: Error from build cwd.',{cwd:subdir});assert(result.has(core.uri(path.join(subdir,'same.tex'))));
 const docs=new Map([[core.key(child),{text:'Title\n     \\BadCommand'}]]);result=get(child+':2: Undefined control sequence.\nl.2 \\BadCommand',{docs});assert.equal(result.get(core.uri(child))[0].range.start.character,5);
 result=get('LaTeX Warning: Text only.');assert.equal(result.get(core.uri(main))[0].severity,2);
 assert.equal(get('Output written on main.pdf (1 page).').size,0);
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log('PASS TeX log: file stack, quoted paths, nested contexts, l.N locations, wrapped package warnings, deduplication, cwd and UTF-16 source ranges');
