'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Parser,Language,Query}=require(require.resolve('web-tree-sitter',{paths:[path.resolve('.dev')]}));
(async()=>{
 await Parser.init();const language=await Language.load('parser/bibtex_style/bibtex_style.wasm');const parser=new Parser();parser.setLanguage(language);
 const source=String.raw`% FUNCTION {fake} should stay a comment
ENTRY {author title} {} {label}
INTEGERS {state}
FUNCTION {format.title}
{ title empty$ { "\cite{not-a-reference}" } { #-12 'state := title "t" change.case$ } if$ }
READ
ITERATE {format.title}
SORT
`;
 const tree=parser.parse(source);assert(!tree.rootNode.hasError,tree.rootNode.toString());
 const query=new Query(language,fs.readFileSync('languages/bibtex_style/highlights.scm','utf8'));const captures=query.captures(tree.rootNode);
 for(const [category,text] of [['keyword','ENTRY'],['function','format.title'],['function.builtin','empty$'],['keyword.control','if$'],['number','#-12'],['operator',':='],['string','"\\cite{not-a-reference}"']])assert(captures.some(x=>x.name===category && x.node.text===text),category+': '+text);
 assert(captures.some(x=>x.name==='comment' && x.node.text.startsWith('% FUNCTION')));
 assert(!captures.some(x=>x.name==='function' && x.node.text==='fake'));
 for(const name of ['outline','folds','indents']){const q=new Query(language,fs.readFileSync('languages/bibtex_style/'+name+'.scm','utf8'));assert(q.matches(tree.rootNode).length>0,name);q.delete();}
 assert.equal(tree.rootNode.descendantsOfType('function_definition').length,1);
 for(const name of ['plain','unsrt','alpha','abbrv']){
  const file=path.join(process.env.BST_SAMPLE_DIR || 'D:/software/texlive/2026/texmf-dist/bibtex/bst/base',name+'.bst');
  if(!fs.existsSync(file)){console.log('SKIP external sample '+name);continue;}
  const t=parser.parse(fs.readFileSync(file,'utf8'));assert(!t.rootNode.hasError,name+': '+t.rootNode.descendantsOfType('ERROR').map(x=>x.text).join('\n'));
  assert(t.rootNode.descendantsOfType('function_definition').length>30);t.delete();console.log('PASS real style '+name);
 }
 query.delete();tree.delete();parser.delete();console.log('PASS BST highlighting, string/comment isolation, function outline, folds and indentation');
})().catch(error=>{console.error(error);process.exitCode=1;});
