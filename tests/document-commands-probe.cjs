'use strict';
const assert=require('node:assert/strict'),core=require('../server/core.cjs'),parser=require('../server/document-commands.cjs');
const source=String.raw`% \NewDocumentCommand{\hidden}{m}{#1}
\NewDocumentCommand{\modern}{s O{{nested} default} >{\TrimSpaces} +m}{\section{fake}\label{fake}\NewDocumentCommand{\nested}{m}{#1}}
\RenewDocumentCommand\bare{d<> R(){recovery} t! m}{#1}
\ProvideExpandableDocumentCommand{\expandable}{m}{#1}
\DeclareDocumentCommand{\complex}{e{^_} m}{#1}
\NewDocumentEnvironment{boxed}{O{blue} +b}{\label{fake-env}}{}
\section{Real}
\label{real}
\begin{verbatim}\DeclareDocumentCommand{\literal}{m}{#1}\end{verbatim}`;
const filename='C:/fixture.tex',docs=new Map([[core.key(filename),{text:source}]]),idx=core.index([filename],docs);
assert.deepEqual([...idx.commands.keys()],['modern','bare','expandable','complex']);assert(idx.environments.has('boxed'));
assert.deepEqual([...idx.labels.keys()],['real']);assert.deepEqual(core.symbols(source).map(item=>item.name),['Real']);
for(const [name,entry] of idx.commands)assert.equal(source.slice(core.offset(source,entry.range.start),core.offset(source,entry.range.end)),name);
const modern=parser.signature('modern',idx.commands.get('modern').documentSpec);assert.equal(modern.signature,'\\modern[*][参数2]{参数3}');assert.equal(modern.snippet,'modern${1:}[${2:参数2}]{${3:参数3}}');assert(modern.details.includes('{nested} default'));
assert.equal(parser.signature('bare',idx.commands.get('bare').documentSpec).signature,'\\bare<参数1>(参数2)[!]{参数4}');
assert.equal(parser.signature('complex',idx.commands.get('complex').documentSpec),null);
for(const [text,expected] of [[String.raw`\newcommand{\same}[1]{#1}\RenewDocumentCommand{\same}{o m}{#2}`,'o m'],[String.raw`\NewDocumentCommand{\same}{o m}{#2}\renewcommand{\same}[1]{#1}`,undefined]]){
 const indexed=core.index([filename],new Map([[core.key(filename),{text}]]));assert.equal(indexed.commands.get('same').documentSpec,expected);
}
for(const spec of ['O{unclosed','d<','m z','>{broken','m '.repeat(10)])assert.equal(parser.signature('bad',spec),null);
assert.equal(parser.scan(String.raw`\\NewDocumentCommand{\escaped}{m}{#1}`).length,0);
assert.equal(parser.scan(String.raw`\NewDocumentCommand{\unfinished}{m}{`).length,0);
assert.equal(parser.scan(String.raw`\NewDocumentCommand{\csname dynamic\endcsname}{m}{#1}`).length,0);
assert.equal(parser.signature('escaped',String.raw`d\langle\rangle m`).snippet,'escaped\\\\langle${1:参数1}\\\\rangle{${2:参数2}}');
console.log('PASS modern definitions: balanced groups, exact names, nested/default/processor arguments, safe fallback, structure and label isolation');
