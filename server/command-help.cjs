'use strict';
const core=require('./core.cjs');
const HELP={
 cite:['\\cite[注释]{文献键1,文献键2}','插入文献引用；显示样式由参考文献方案决定。'],
 citep:['\\citep[前注][后注]{文献键}','natbib：生成括号形式的引用。'],
 citet:['\\citet[前注][后注]{文献键}','natbib：生成作者作为正文一部分的引用。'],
 textcite:['\\textcite[前注][后注]{文献键}','biblatex：生成正文形式的引用。'],
 parencite:['\\parencite[前注][后注]{文献键}','biblatex：生成括号形式的引用。'],
 nocite:['\\nocite{文献键} / \\nocite{*}','把指定文献或全部文献加入参考文献列表，不在这里打印引用。'],
 label:['\\label{标签键}','定义标签，供 ref、eqref 等命令引用。通常放在章节命令或 caption 后。'],
 ref:['\\ref{标签键}','插入标签对应的编号。'],eqref:['\\eqref{标签键}','amsmath：插入带括号的公式编号。'],
 pageref:['\\pageref{标签键}','插入标签所在的页码。'],autoref:['\\autoref{标签键}','hyperref：插入含对象类型名称的引用。'],
 cref:['\\cref{标签键1,标签键2}','cleveref：根据标签类型生成引用文字。'],
 frac:['\\frac{分子}{分母}','数学模式：生成分式。'],sqrt:['\\sqrt[根指数]{表达式}','数学模式：生成平方根或指定次数的根。'],
 includegraphics:['\\includegraphics[width=宽度,height=高度,...]{图片路径}','graphicx：插入图片；width、height、scale 等为可选参数。'],
 input:['\\input{文件路径}','在当前位置读入 TeX 文件内容。'],include:['\\include{文件路径}','读入独立章节文件，前后分页；可以配合 includeonly。'],
 usepackage:['\\usepackage[选项]{包名1,包名2}','在导言区加载宏包。'],documentclass:['\\documentclass[选项]{文档类}','选择文档类，通常位于主文件导言区。'],
 section:['\\section[目录短标题]{标题}\n\\section*{标题}','创建节标题；星号形式不编号，默认不加入目录。'],
 subsection:['\\subsection[目录短标题]{标题}\n\\subsection*{标题}','创建小节标题。'],chapter:['\\chapter[目录短标题]{标题}\n\\chapter*{标题}','创建章标题，需要支持章的文档类。'],
 begin:['\\begin{环境名}','开始环境，与同名 end 配对。'],end:['\\end{环境名}','结束当前环境，与同名 begin 配对。'],
 textbf:['\\textbf{文字}','把参数中的文字设为粗体。'],textit:['\\textit{文字}','把参数中的文字设为斜体。'],emph:['\\emph{文字}','强调文字，具体字体形式由当前字体上下文决定。'],
 caption:['\\caption[目录短说明]{说明}','为浮动体添加说明并更新编号；相应 label 通常放在其后。'],
 newcommand:['\\newcommand{\\命令名}[参数个数][第一参数默认值]{定义}','定义命令；若提供默认值，第一参数成为可选参数。'],
 bibliography:['\\bibliography{数据库名1,数据库名2}','传统 BibTeX：指定 bib 数据库并插入参考文献列表。'],
 addbibresource:['\\addbibresource[选项]{文件名.bib}','biblatex：添加参考文献数据库。'],
 printbibliography:['\\printbibliography[选项]','biblatex：打印参考文献列表。'],
};
function at(source,pos){const offset=core.offset(source,pos);for(const match of core.mask(source).matchAll(/\\([A-Za-z@_:]+)\*?/g))if(offset>=match.index&&offset<match.index+match[0].length)return {name:match[1],range:core.range(source,match.index,match.index+match[0].length)};return null;}
function custom(name,source,entry){
 const start=core.offset(source,entry.range.start),end=core.offset(source,entry.range.end),prefix=source.slice(start,end);
 if(!/^\\(?:newcommand|renewcommand|providecommand|DeclareRobustCommand)\b/.test(prefix))return null;
 let remaining=source.slice(end),count=0,optional=false;const args=/^\s*\[(\d)\]/.exec(remaining);
 if(args){count=Number(args[1]);remaining=remaining.slice(args[0].length);optional=/^\s*\[/.test(remaining);}
 let signature='\\'+name;for(let i=1;i<=count;i++)signature+=(optional&&i===1?'[参数'+i+']':'{参数'+i+'}');
 return signature;
}
module.exports={HELP,at,custom};