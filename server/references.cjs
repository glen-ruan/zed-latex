'use strict';
const core=require('./core.cjs');
function occurrences(files,docs){
  const result=[];
  function add(file,source,name,start,kind,declaration=false){result.push({file,name,kind,declaration,range:core.range(source,start,start+name.length)});}
  for(const file of files){
    const source=core.read(file,docs);
    if(/\.(bib|bibtex|biblatex)$/i.test(file)){
      // Scan whole entries so @entry-looking text inside a field or @comment is ignored.
      const header=/@([a-z]+)\s*([{(])/ig;let match;
      while((match=header.exec(source))){
        if(source.slice(source.lastIndexOf('\n',match.index)+1,match.index).trimStart().startsWith('%'))continue;
        const open=match[2],close=open==='{'?'}':')';let depth=1,braces=0,quoted=false,end=header.lastIndex;
        for(;end<source.length;end++){const c=source[end];if(c==='\\'){end++;continue;}if(c==='"'&&(open==='{'?depth===1:braces===0))quoted=!quoted;if(!quoted){if(open==='('){if(c==='{')braces++;if(c==='}')braces--;if(braces)continue;}if(c===open)depth++;if(c===close&&!--depth)break;}}
        const body=source.slice(header.lastIndex,end);const entryStart=header.lastIndex;header.lastIndex=end+1;
        if(/^(comment|string|preamble)$/i.test(match[1]))continue;
        const key=/^\s*([^,\s{}()]+)\s*,/.exec(body);if(!key)continue;
        add(file,source,key[1],entryStart+key[0].indexOf(key[1]),'citation',true);
        // BibTeX crossref is a single key; arbitrary field contents are not references.
        const cross=/\bcrossref\s*=\s*(?:\{([^{}]+)\}|"([^"\r\n]+)")/ig;
        let fieldDepth=0,fieldQuoted=false;
        for(let i=key[0].length;i<body.length;i++){
          const c=body[i];if(c==='\\'){i++;continue;}
          if(!fieldDepth&&!fieldQuoted){cross.lastIndex=i;const field=cross.exec(body);if(field&&field.index===i&&(i===0||/[,\s]/.test(body[i-1]))){const name=field[1]||field[2];add(file,source,name,entryStart+i+field[0].lastIndexOf(name),'citation');i+=field[0].length-1;continue;}}
          if(c==='"'&&!fieldDepth)fieldQuoted=!fieldQuoted;
          if(!fieldQuoted){if(c==='{')fieldDepth++;if(c==='}')fieldDepth--;}
        }
      }
      continue;
    }
    if(!core.TEX.test(file))continue;
    const clean=core.mask(source);
    const pattern=/\\(label|ref|eqref|pageref|autoref|cref|Cref|vref|Vref|nameref|nocite|cite|citep|citet|citealp|citealt|citeauthor|citeyear|citeyearpar|Citep|Citet|parencite|Parencite|textcite|Textcite|autocite|Autocite|footcite|footcitetext|smartcite|supercite|fullcite|footfullcite)\*?(?:\s*\[[^\]]*\])*\s*\{([^{}]*)\}/g;
    for(const match of clean.matchAll(pattern)){
      const declaration=match[1]==='label';const kind=/cite/i.test(match[1])?'citation':'label';const start=match.index+match[0].lastIndexOf('{')+1;
      for(const key of match[2].matchAll(/[^,\s]+/g)){if(key[0]==='*'||/[\\#{}]/.test(key[0]))continue;add(file,source,key[0],start+key.index,kind,declaration);}
    }
  }
  return result;
}
function at(items,file,pos){return items.find(item=>core.key(item.file)===core.key(file)&&item.range.start.line===pos.line&&item.range.start.character<=pos.character&&item.range.end.character>=pos.character);}
function rename(items,target,newName){
  if(typeof newName!=='string'||!newName||/[\s,{}\\#%"]/.test(newName))throw Error('The new reference key contains invalid characters');
  const declarations=items.filter(item=>item.kind===target.kind&&item.name===target.name&&item.declaration);
  if(declarations.length!==1)throw Error('Rename requires exactly one definition in the project');
  if(newName!==target.name&&items.some(item=>item.kind===target.kind&&item.name===newName))throw Error('The new key is already used in the project');
  const changes={};for(const item of items)if(item.kind===target.kind&&item.name===target.name)(changes[core.uri(item.file)]??=[]).push({range:item.range,newText:newName});
  return {changes};
}
module.exports={occurrences,at,rename};
