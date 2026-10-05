'use strict';
const assert=require('node:assert/strict'),core=require('../server/core.cjs'),decl=require('../server/declarations.cjs');
const source=String.raw`% \let\comment\real
\newcommand{\real}[2]{#1#2}
\let\alias = \real
\NewCommandCopy{\copied}{\alias}
\RenewCommandCopy\renewed\copied
\DeclareCommandCopy{\declared}\real
\DeclareSIUnit[quantity-product={\cdot}]{\rpm}{r{p}m}
\DeclareMathOperator*{\argmax}{arg\,max}
\newcommand{\wrapper}{\let\hidden\real\DeclareSIUnit{\nested}{x}}
\def\primitive#1{\let\internal\real}
\newcolumntype{L}[1]{\let\newline\real}
\NewDocumentCommand{\modern}{m}{\let\modernhidden\real}
\let{\invalid}\real
\let\character=x
\let\cycleA\cycleB
\let\cycleB\cycleA
\begin{verbatim}\let\literal\real\end{verbatim}
\DeclareMathOperator{\fakebody}{\section{definition text}}
\section{Document}
`;
const file='fixture/decl.tex',docs=new Map([[core.key(file),{text:source}]]),idx=core.index([file],docs);
for(const name of ['alias','copied','renewed','declared','rpm','argmax']){const entry=idx.commands.get(name);assert(entry,name);assert.equal(source.slice(core.offset(source,entry.range.start),core.offset(source,entry.range.end)),name);}
for(const name of ['comment','hidden','internal','modernhidden','newline','literal','nested','invalid','character'])assert(!idx.commands.has(name),name+' leaked from hidden/invalid declaration');
assert.equal(idx.commands.get('rpm').declarationValue,'r{p}m');assert.equal(idx.commands.get('rpm').declarationOptions,String.raw`quantity-product={\cdot}`);assert.equal(idx.commands.get('argmax').declarationValue,String.raw`arg\,max`);
const alias=decl.alias('renewed',idx.commands);assert.deepEqual(alias.chain,['copied','alias','real']);assert.equal(alias.target,'real');assert(alias.entry);assert(decl.alias('cycleA',idx.commands).cycle);assert.equal(decl.alias('unknown',idx.commands).entry,undefined);
assert.deepEqual(core.symbols(source).map(item=>item.name),['Document']);
console.log('PASS declarations: SI units/operators, exact ranges, command copies, alias chains/cycles, definition-body exclusion and safe unsupported forms');
