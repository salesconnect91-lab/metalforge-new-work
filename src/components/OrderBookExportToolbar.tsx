import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { triggerPrint } from "@/lib/exportUtils";

function csvCell(value:string){return `"${value.replace(/"/g,'""')}"`}
function downloadBlob(blob:Blob,name:string){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},0)}
function tableData(table:HTMLTableElement){const headers=[...table.tHead?.rows?.[0]?.cells||[]].map(c=>(c.textContent||"").replace(/\s+/g," ").trim());const rows=[...table.tBodies[0]?.rows||[]].map(r=>[...r.cells].map(c=>(c.textContent||"").replace(/\s+/g," ").trim()));return {headers,rows}}

export default function OrderBookExportToolbar({ tableId, fileBase }: { tableId:string; fileBase:string }){
 const getTable=()=>document.getElementById(tableId) as HTMLTableElement|null;
 const csv=()=>{const table=getTable();if(!table)return;const {headers,rows}=tableData(table);downloadBlob(new Blob([[headers,...rows].map(r=>r.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}),`${fileBase}.csv`)};
 const excel=async()=>{const table=getTable();if(!table)return;const {headers,rows}=tableData(table);const XLSX=await import("xlsx");const ws=XLSX.utils.aoa_to_sheet([headers,...rows]);ws["!autofilter"]={ref:XLSX.utils.encode_range({r:0,c:0},{r:Math.max(rows.length,1),c:Math.max(headers.length-1,0)})};const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Order Book");XLSX.writeFile(wb,`${fileBase}.xlsx`)};
 return <div className="flex flex-wrap items-center gap-1.5 print:hidden"><button type="button" className="btn" onClick={()=>triggerPrint("#order-book-report")} title="Print or Save as PDF"><Printer size={14}/> Print / PDF</button><button type="button" className="btn" onClick={()=>void excel()}><FileSpreadsheet size={14}/> Excel</button><button type="button" className="btn" onClick={csv}><Download size={14}/> CSV</button></div>;
}
