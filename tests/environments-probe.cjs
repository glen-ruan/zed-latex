'use strict';
const assert=require('node:assert/strict'),core=require('../server/core.cjs'),env=require('../server/environments.cjs'),wrappers=require('../server/wrappers.cjs');
const source='\\newenvironment{boxed}[2][default]{\\textbf{#1}#2}{done}\\NewDocumentEnvironment{modern}{O{value} m}{#1#2}{}\\newtheorem{claim}{Claim}[chapter]\\newtheorem{shared}[claim]{Shared}\\newtheorem*{remark}{Remark}\\newcommand\\example{\\newtheorem{hidden}{Hidden}}';
const file='fixture/environment.tex',docs=new Map([[core.key(file),{text:source}]]),idx=core.index([file],docs);
for(const name of ['boxed','modern','claim','shared','remark'])assert(idx.environments.has(name),name);
assert(!idx.environments.has('hidden'));
for(const [name,expected] of [['boxed',['[参数1]{参数2}','默认值 default']],['modern',['[参数1]{参数2}','默认值 value']],['claim',['显示标题：Claim','随计数器重置：chapter']],['shared',['共享计数器：claim']],['remark',['编号：不编号']]]){
 const entry=idx.environments.get(name),info=env.info(name,entry);for(const text of expected)assert(info.documentation.includes(text),name+' '+text);assert(info.signature.includes('\\end{'+name+'}'));assert.equal(source.slice(core.offset(source,entry.range.start),core.offset(source,entry.range.end)),name);
}
const usage='\\begin{boxed}x\\end{boxed}';for(const at of [usage.indexOf('boxed')+1,usage.lastIndexOf('boxed')+1]){const target=env.at(usage,core.position(usage,at));assert.equal(target.name,'boxed');assert.equal(usage.slice(core.offset(usage,target.range.start),core.offset(usage,target.range.end)),'boxed');}
for(const text of ['% \\begin{boxed}','\\verb|\\begin{boxed}|','\\\\begin{boxed}'])assert.equal(env.at(text,core.position(text,text.indexOf('boxed')+1)),null);
const models=new Map(wrappers.definitions('\\newcommand\\outer[2]{\\inner{#2}{#1}}\\newcommand\\inner[2]{\\newtheorem{#2}[#1]{Title}}').map(item=>[item.name,item]));
const generated=wrappers.environments('\\outer{claim}{shared}',models)[0];assert.equal(generated.name,'claim');assert.equal(generated.sharedCounter,'shared');assert.equal(generated.unnumbered,false);
const starred=new Map(wrappers.definitions('\\NewDocumentCommand\\starred{m}{\\newtheorem*{#1}{Remark}}').map(item=>[item.name,item]));assert.equal(wrappers.environments('\\starred{note}',starred)[0].unnumbered,true);
const changed=core.index([file],new Map([[core.key(file),{text:'\\newenvironment{boxed}[1]{#1}{}'}]]));assert(!env.info('boxed',changed.environments.get('boxed')).documentation.includes('default'));assert(!changed.environments.has('claim'));
assert.equal(env.argumentsSnippet(idx.environments.get('boxed')),'[${1:default}]{${2:参数2}}');assert.equal(env.argumentsSnippet(idx.environments.get('modern')),'[${1:value}]{${2:参数2}}');assert.equal(env.argumentsSnippet(idx.environments.get('claim')),'');assert.equal(env.argumentsSnippet({documentSpec:'o s m'}),'{${1:参数3}}');assert.equal(env.argumentsSnippet({documentSpec:'O{-NoValue-} m'}),'[${1:-NoValue-}]{${2:参数2}}');assert.equal(env.argumentsSnippet({documentSpec:'u{;}' }),'');assert.equal(env.argumentsSnippet({arity:1,defaultArg:'a$}\\b'}),'[${1:a\\$\\}\\\\b}]');
console.log('PASS environments: legacy/modern signatures, defaults, direct/generated theorem titles/counters, exact names, begin/end selection, masked examples and unsaved invalidation');
