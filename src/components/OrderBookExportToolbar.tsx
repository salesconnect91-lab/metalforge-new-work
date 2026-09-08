import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { useLocation } from "react-router-dom";

function getTable(){
 const slot=document.getElementById("order-book-action-slot");
 const root=slot?.parentElement?.parentElement;
 return root?.querySelector("table") as HTMLTableElement|null;
}
function visibleRows(table:HTMLTableElement){
 const headers=[...table.tHead?.rows?.[0]?.cells||[]].map(c=>(c.textContent||"").trim());
 const rows=[...table.tBodies[0]?.rows||[]].map(r=>[...r.cells].map(c=>(c.textContent||"").replace(/\s+/g," ").trim()));
 return {headers,rows};
}
function csvCell(v:string){return `"${v.replace(/"/g,'""')}"`}
function downloadBlob(blob:Blob,name:string){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},0)}

export default function OrderBookExportToolbar(){
 const {pathname}=useLocation();
 const active=pathname==="/sales/order-book"||pathname==="/purchase/order-book";
 const [slot,setSlot]=useState<HTMLElement|null>(null);
 useEffect(()=>{if(!active){setSlot(null);return}const sync=()=>setSlot(document.getElementById("order-book-action-slot"));sync();const mo=new MutationObserver(sync);mo.observe(document.body,{childList:true,subtree:true});return()=>mo.disconnect()},[active]);
 if(!active||!slot)return null;
 const base=pathname.startsWith("/sales")?"sales-order-book":"purchase-order-book";
 const print=()=>{const table=getTable();if(!table)return;const {headers,rows}=visibleRows(table);const w=window.open("","_blank","width=1400,height=900");if(!w)return alert("Print window was blocked by the browser.");const esc=(s:string)=>s.replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]!));w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${base}</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:Arial,sans-serif;font-size:9px;color:#111}h1{font-size:18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:5px;text-align:left}th{background:#eee}</style></head><body><h1>${pathname.startsWith("/sales")?"Sales":"Purchase"} Order Book</h1><div>Filtered report · ${new Date().toLocaleString()}</div><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);w.document.close()};
 const csv=()=>{const table=getTable();if(!table)return;const {headers,rows}=visibleRows(table);downloadBlob(new Blob([[headers,...rows].map(r=>r.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}),`${base}.csv`)};
 const excel=async()=>{const table=getTable();if(!table)return;const {headers,rows}=visibleRows(table);const XLSX=await import("xlsx");const ws=XLSX.utils.aoa_to_sheet([headers,...rows]);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Order Book");XLSX.writeFile(wb,`${base}.xlsx`)};
 return createPortal(<div className="flex flex-wrap items-center gap-1.5"><button type="button" className="btn" onClick={print} title="Print or Save as PDF"><Printer size={14}/> Print / PDF</button><button type="button" className="btn" onClick={()=>void excel()}><FileSpreadsheet size={14}/> Excel</button><button type="button" className="btn" onClick={csv}><Download size={14}/> CSV</button></div>,slot);
}
