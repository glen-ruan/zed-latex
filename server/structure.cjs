'use strict';
// Static source structure; never execute TeX or assign rendered counters.
const LEVELS=['part','chapter','section','subsection','subsubsection','paragraph','subparagraph'];
const FLOATS=new Set(['figure','table','subfigure','subtable']);
const MATH=new Set(['equation','align','alignat','flalign','gather','multline','eqnarray','displaymath','subequations']);
function group(text,start,open='{',close='}') {
  while(/\s/.test(text[start]||'')&&start<text.length)start++;
  if(text[start]!==open)return null;
  let depth=1,braces=0;
  for(let i=start+1;i<text.length;i++){
    if(text[i]==='\\'){i++;continue;}
    if(open==='['){if(text[i]==='{')braces++;else if(text[i]==='}')braces--;if(braces)continue;}
    if(text[i]===open)depth++;
    else if(text[i]===close&&--depth===0)return {start:start+1,end:i,next:i+1,value:text.slice(start+1,i)};
  }
  return null;
}
function display(value){return value.replace(/\s+/g,' ').trim();}
function symbols(source,api){
  const clean=api.mask(source),nodes=[],sections=[],envs=[];
  function add(name,kind,start,end,selection,detail){
    const item={name,kind,detail,start,end,selection,children:[]};nodes.push(item);return item;
  }
  const tokens=/\\([A-Za-z@]+)\*?/g;let match;
  while((match=tokens.exec(clean))){
    // A command escaped by an odd run of preceding backslashes is literal.
    let preceding=0;for(let i=match.index-1;i>=0&&clean[i]==='\\';i--)preceding++;
    if(preceding%2)continue;
    const command=match[1],level=LEVELS.indexOf(command);let cursor=tokens.lastIndex;
    if(level>=0||command==='caption'){
      const optional=group(clean,cursor,'[',']');if(optional)cursor=optional.next;
      const title=group(clean,cursor);if(!title)continue;tokens.lastIndex=title.next;
      const shown=optional||title,selection={start:shown.start,end:shown.end};
      if(level>=0){
        const open=envs.findIndex(item=>item.node);if(open>=0)for(const item of envs.splice(open))if(item.node){item.node.end=match.index;item.node.closed=true;}
        const item=add(display(shown.value)||command,2,match.index,source.length,selection,command);item.level=level;sections.push(item);}
      else {const owner=[...envs].reverse().find(item=>FLOATS.has(item.base));if(owner?.node&&!owner.node.caption){owner.node.caption=display(shown.value);owner.node.name=owner.name+': '+(owner.node.caption||owner.name);owner.node.selection=selection;}}
    }else if(command==='begin'||command==='end'){
      const arg=group(clean,cursor);if(!arg)continue;tokens.lastIndex=arg.next;
      const name=arg.value.trim(),base=name.replace(/\*$/,'');
      if(command==='begin'){
        const useful=FLOATS.has(base)||MATH.has(base);
        const node=useful?add(name,FLOATS.has(base)?19:10,match.index,source.length,{start:arg.start,end:arg.end},FLOATS.has(base)?'float':'math'):null;
        envs.push({name,base,node});
      }else {
        const found=envs.findLastIndex(item=>item.name===name);if(found<0)continue;
        // Recover incomplete nested environments without swallowing the rest of the document.
        for(const item of envs.splice(found))if(item.node){item.node.end=arg.next;item.node.closed=true;}
      }
    }else if(command==='label'){
      const arg=group(clean,cursor);if(!arg)continue;tokens.lastIndex=arg.next;
      const name=arg.value.trim();if(!name||/[{}\\#]/.test(name))continue;
      const leading=arg.value.indexOf(name),selection={start:arg.start+leading,end:arg.start+leading+name.length};
      add(name,13,match.index,arg.next,selection,'label');
      const owner=[...envs].reverse().find(item=>item.node);
      if(owner?.node){owner.node.labels??=[];owner.node.labels.push(name);}
    }else if(/^[egx]?def$/.test(command)){
      const bodyStart=clean.indexOf('{',cursor);const body=bodyStart<0?null:group(clean,bodyStart);if(body)tokens.lastIndex=body.next;
    }else if(/^(newcommand|renewcommand|providecommand|DeclareRobustCommand|newenvironment|renewenvironment)$/.test(command)){
      // Macro bodies describe definitions, not document structure.
      let arg=group(clean,cursor);if(arg)cursor=arg.next;
      else {const macro=/^\s*\\[A-Za-z@]+/.exec(clean.slice(cursor));if(macro)cursor+=macro[0].length;}
      for(let i=0;i<2;i++){arg=group(clean,cursor,'[',']');if(arg)cursor=arg.next;}
      arg=group(clean,cursor);if(arg)cursor=arg.next;
      if(command.endsWith('environment')){arg=group(clean,cursor);if(arg)cursor=arg.next;}
      tokens.lastIndex=cursor;
    }
  }
  const sectionStack=[];
  for(const section of sections){
    while(sectionStack.length&&sectionStack.at(-1).level>=section.level)sectionStack.pop().end=section.start;
    sectionStack.push(section);
  }
  for(const node of nodes){
    if(node.labels?.length)node.name+=' ['+node.labels.join(', ')+']';
    if(!node.closed&&node.end===source.length&&node.detail!=='label'&&node.level===undefined){const next=sections.find(section=>section.start>node.start);if(next)node.end=next.start;}
  }
  nodes.sort((a,b)=>a.start-b.start||b.end-a.end);
  const roots=[],stack=[];
  for(const node of nodes){
    while(stack.length&&(stack.at(-1).end<=node.start||stack.at(-1).end<node.end))stack.pop();
    (stack.at(-1)?.children||roots).push(node);stack.push(node);
  }
  function convert(node){return {name:node.name,kind:node.kind,detail:node.detail,range:api.range(source,node.start,node.end),selectionRange:api.range(source,node.selection.start,node.selection.end),children:node.children.map(convert)};}
  return roots.map(convert);
}
module.exports={symbols};
