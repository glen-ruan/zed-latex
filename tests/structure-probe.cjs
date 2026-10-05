'use strict';
const assert=require('node:assert/strict'),core=require('../server/core.cjs');
const source=String.raw`% \section{hidden}
\newcommand{\example}{\section{definition}\label{not-document}}
\def\another#1{\section{def-hidden}}
\chapter{Chapter}
\section[Short {nested}]{Long {formatted {title}}}
\label{sec:start}
\begin{figure}
\caption[Diagram]{A long {diagram}}
\label{fig:diagram}
\begin{subfigure}{.4\textwidth}\caption{Child}\label{fig:child}\end{subfigure}
\end{figure}
\begin{align*}
a&=b\label{eq:first}\\
c&=d\label{eq:second}
\end{align*}
\subsection{子节😀}
\begin{table*}\caption{Results}\label{tab:results}\end{table*}
\begin{verbatim}
\section{verbatim-hidden}\label{verbatim-key}
\end{verbatim}
\section{Next}
\label{standalone}
`;
function flat(items){return items.flatMap(item=>[item,...flat(item.children||[])]);}
const roots=core.symbols(source),items=flat(roots);
assert.equal(roots.length,1);assert.equal(roots[0].name,'Chapter');
assert.deepEqual(roots[0].children.filter(item=>item.detail==='section').map(item=>item.name),['Short {nested}','Next']);
assert(!items.some(item=>/hidden|not-document|definition|verbatim-key/.test(item.name)));
const figure=items.find(item=>item.detail==='float'&&item.name.startsWith('figure:'));
assert.equal(figure.name,'figure: Diagram [fig:diagram]');assert(figure.children.some(item=>item.name==='fig:diagram'));
assert(figure.children.some(item=>item.name==='subfigure: Child [fig:child]'));
assert(items.some(item=>item.name==='align* [eq:first, eq:second]'));
assert(items.some(item=>item.name==='table*: Results [tab:results]'));
function selected(item){return source.slice(core.offset(source,item.selectionRange.start),core.offset(source,item.selectionRange.end));}
assert.equal(selected(items.find(item=>item.name==='fig:diagram')),'fig:diagram');
assert.equal(selected(figure),'Diagram');assert.equal(selected(items.find(item=>item.name==='子节😀')),'子节😀');
function validate(tree){for(const item of tree){const a=core.offset(source,item.range.start),b=core.offset(source,item.range.end),c=core.offset(source,item.selectionRange.start),d=core.offset(source,item.selectionRange.end);assert(a<=c&&c<=d&&d<=b);for(const child of item.children)assert(core.offset(source,child.range.end)<=b);validate(item.children);}}
validate(roots);
const incomplete=core.symbols('\\section{One}\n\\begin{equation} x=1\n\\section{Two}\n\\label{second}');assert.equal(incomplete.length,2);assert.equal(incomplete[1].name,'Two');assert.equal(incomplete[1].children[0].name,'second');
const afterBroken=core.symbols('\\section{A}\\begin{figure}\\section{B}\\caption{orphan}\\label{key}');assert.equal(afterBroken[0].children[0].name,'figure');assert(afterBroken[1].children.some(item=>item.name==='key'));
assert.equal(core.symbols('\\section{Missing')[0],undefined);
assert.equal(core.symbols('\\\\section{literal}').length,0);
const crlf=core.symbols('\\section{A}\r\n\\label{key}\r\n');assert.equal(crlf[0].children[0].selectionRange.start.line,1);assert.equal(crlf[0].children[0].selectionRange.start.character,7);
console.log('PASS structure: hierarchy, nested titles, floats/captions, equation labels, exact UTF-16 ranges, masked examples, incomplete-source recovery');
if(process.env.CHECK_OUTLINE_GRAMMAR==='1'){
 (async()=>{
  const fs=require('node:fs'),path=require('node:path');const {Parser,Language,Query}=require(require.resolve('web-tree-sitter',{paths:[path.resolve('.dev')]}));
  await Parser.init();const language=await Language.load('parser/latex/latex.wasm'),parser=new Parser();parser.setLanguage(language);
  const tree=parser.parse(source),query=new Query(language,fs.readFileSync('languages/latex/outline.scm','utf8'));
  const captures=query.captures(tree.rootNode).filter(item=>item.name==='name').map(item=>item.node.text);
  for(const text of ['{figure}','{align*}','{table*}','[Diagram]','{fig:diagram}','{eq:first}','{tab:results}'])assert(captures.includes(text),'Missing outline '+text);
  assert(!captures.includes('{verbatim-key}'));
  query.delete();tree.delete();parser.delete();console.log('PASS Zed outline query: real grammar captures figures, captions, equations and labels');
 })().catch(error=>{console.error(error);process.exitCode=1;});
}
