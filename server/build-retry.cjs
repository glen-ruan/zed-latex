'use strict';
const fs=require('node:fs');
function pdfWritable(filename){
  if(!filename||!fs.existsSync(filename))return true;
  let handle;try{handle=fs.openSync(filename,'r+');return true;}catch{return false;}finally{if(handle!==undefined)fs.closeSync(handle);}
}
async function retryStep({execute,clean,enabled=true,cancelled=()=>false,pdf,report=()=>{},writable=pdfWritable}){
  const first=await execute();
  if(first.code===0||first.signal||cancelled())return first;
  if(/xdvipdfmx/i.test(first.output+first.errors)&&!writable(pdf)){
    report('PDF 无法写入，可能仍被阅读器占用、只读或无权限：'+pdf+'。解除占用后再次通过插件编译。');return first;
  }
  if(!enabled)return first;
  report('编译失败，清理辅助文件后自动重试一次。');
  try{await clean();}catch(error){report('辅助文件清理失败：'+error.message);}
  if(cancelled())return first;
  return execute();
}
module.exports={retryStep,pdfWritable};
