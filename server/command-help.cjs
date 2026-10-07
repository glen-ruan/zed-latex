'use strict';
const core=require('./core.cjs');
const HELP={
 DeclareSIUnit:['\\DeclareSIUnit[选项]{\\单位命令}{单位内容}','siunitx：声明自定义单位，可在 unit/qty 的单位参数中使用。'],
 DeclareMathOperator:['\\DeclareMathOperator{\\命令}{运算符文字}\n\\DeclareMathOperator*{\\命令}{运算符文字}','amsmath：声明数学运算符；星号形式支持上下限排版。'],
 NewCommandCopy:['\\NewCommandCopy{\\新命令}{\\已有命令}','复制当前命令定义；已有命令随后重定义不会改变这份复制。'],
 let:['\\let\\新命令=\\已有命令','TeX 原语：复制一个 token 当前的含义；不等同于完整复制所有 LaTeX robust 命令实现。'],

 import:['\\import{主文件相对目录}{文件名}','import：从指定目录导入文件；被导入文件的 input 和图片查找优先使用该目录。'],
 subimport:['\\subimport{当前导入目录的相对路径}{文件名}','import：在当前导入目录基础上继续导入子文件；目录和文件参数分别补全。'],
 InputIfFileExists:['\\InputIfFileExists{文件名}{存在时执行}{不存在时执行}','文件存在时读取它；插件追踪静态文件名，以索引模块中的命令定义。'],

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
 bibliographystyle:['\\bibliographystyle{样式名或路径}','传统 BibTeX：选择 .bst 参考文献样式，通常省略扩展名；路径参数可跳转到本地样式文件。'],
 PassOptionsToClass:['\\PassOptionsToClass{选项1,选项2}{文档类}','在加载文档类之前向它传递选项。'],
 addbibresource:['\\addbibresource[选项]{文件名.bib}','biblatex：添加参考文献数据库。'],
 printbibliography:['\\printbibliography[选项]','biblatex：打印参考文献列表。'],
};
function at(source,pos){const offset=core.offset(source,pos);for(const match of core.mask(source).matchAll(/\\([A-Za-z@_:]+)\*?/g))if(offset>=match.index&&offset<match.index+match[0].length)return {name:match[1],range:core.range(source,match.index,match.index+match[0].length)};return null;}
function model(name,source,entry){
 const start=core.offset(source,entry.range.start),end=core.offset(source,entry.range.end),prefix=source.slice(start,end);
 if(!/^\\(?:newcommand|renewcommand|providecommand|DeclareRobustCommand)\b/.test(prefix))return null;
 const docs=new Map([[core.key(entry.file),{text:source}]]),models=core.analyzeSource(entry.file,docs,'wrapper-definitions',require('./wrappers.cjs').definitions),model=models.find(item=>item.name===name&&item.start===start);if(!model)return null;
 return model;
}
function custom(name,source,entry){const info=model(name,source,entry);if(!info)return null;let signature='\\'+name;for(let i=0;i<info.args.length;i++)signature+=(info.args[i].optional?'[参数'+(i+1)+']':'{参数'+(i+1)+'}');return signature;}
function customSnippet(name,source,entry){const info=model(name,source,entry);if(!info)return null;const escape=value=>String(value).replace(/[\\$}]/g,'\\$&');let snippet=name;for(let i=0;i<info.args.length;i++){const arg=info.args[i],value=arg.optional&&arg.defaultValue!==undefined?arg.defaultValue:'参数'+(i+1);snippet+=(arg.optional?'[':'{')+'${'+(i+1)+':'+escape(value)+'}'+(arg.optional?']':'}');}return snippet;}
module.exports={HELP,at,custom,customSnippet};
