const { test, expect } = require("@playwright/test");
async function ready(page, allowEdit = true) {
 await page.goto("/");
 await page.evaluate(allowEdit => {window.events=[];luckysheet.create({container:"luckysheet",safeStrMode:true,allowEdit,lang:"zh",data:[{index:"runs",name:"车次表",status:1,order:0,row:100,column:30,config:{},celldata:[]}],hook:{sheetDataChanged:e=>events.push(e)}});},allowEdit);
 await expect(page.locator(".luckysheet-loading-mask")).toBeHidden();
}
test("稀疏差异整批提交、撤销和过期版本拒绝",async({page})=>{
 await ready(page);
 const result=await page.evaluate(async()=>{
  const revision=luckysheet.getWorkbookInfo().sheets[0].revision;
  const ok=await luckysheet.setCellChanges([{row:2,column:1,value:"001"},{row:9,column:8,value:"900719925474099312345"}],{sheetIndex:"runs",revision});
  const after=[luckysheet.getCellValue(2,1),luckysheet.getCellValue(9,8)];
  const stale=await luckysheet.setCellChanges([{row:2,column:1,value:"覆盖"}],{revision});
  luckysheet.undo(); return {ok,after,stale,undone:[luckysheet.getCellValue(2,1),luckysheet.getCellValue(9,8)]};
 });
 expect(result).toEqual({ok:true,after:["001","900719925474099312345"],stale:false,undone:[null,null]});
});
test("结构通知携带边界、操作身份并跟随撤销重做",async({page})=>{
 await ready(page);
 const result=await page.evaluate(()=>{luckysheet.insertRowBottom(4,{number:2});luckysheet.undo();luckysheet.redo();return events.filter(e=>e.structureChanges).map(e=>e.structureChanges[0]);});
 expect(result.map(e=>[e.axis,e.kind,e.index,e.count,e.phase])).toEqual([["row","insert",5,2,"apply"],["row","delete",5,2,"undo"],["row","insert",5,2,"redo"]]);
 expect(new Set(result.map(e=>e.id)).size).toBe(1);
});
test("只读结构操作和取消写入均无提交",async({page})=>{
 await ready(page,false);
 const result=await page.evaluate(async()=>{luckysheet.insertRow(3,{number:2});luckysheet.deleteColumn(1,2);const canceled=new AbortController();canceled.abort();const written=await luckysheet.setCellChanges([{row:1,column:1,value:"x"}],{signal:canceled.signal});const s=luckysheet.getWorkbookInfo().sheets[0];return {written,rows:s.rowCount,columns:s.columnCount,events:events.length};});
 expect(result).toEqual({written:false,rows:100,columns:30,events:0});
});
test("包含隐藏行的范围读取保留真实坐标",async({page})=>{
 await ready(page);
 const result=await page.evaluate(()=>{luckysheet.setRangeValue([["a"],["b"],["c"]],{range:{row:[2,4],column:[1,1]}});luckysheet.hideRow(3,3);return [false,true].map(includeHidden=>luckysheet.getRangeValue({range:{row:[2,4],column:[1,1]},includeHidden}).map(row=>row[0].v));});
 expect(result).toEqual([["a","c"],["a","b","c"]]);
});
