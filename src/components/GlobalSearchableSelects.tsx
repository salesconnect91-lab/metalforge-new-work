import { useEffect } from "react";

const ESC=(v:string)=>v.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]||c));

function enhance(select:HTMLSelectElement){
 if(select.dataset.naviloSearchable==="true"||select.multiple||select.size>1||select.type!=="select-one")return;
 if(select.closest(".navilo-search-select"))return;
 const options=Array.from(select.options);
 if(options.length<2)return;
 select.dataset.naviloSearchable="true";
 select.classList.add("navilo-search-source");
 const box=document.createElement("div");box.className="navilo-search-select";
 const input=document.createElement("input");input.type="text";input.className="navilo-search-input";input.autocomplete="off";input.setAttribute("role","combobox");input.setAttribute("aria-expanded","false");input.placeholder=(options.find(o=>!o.value)?.textContent||select.getAttribute("aria-label")||"Search & select...").trim();
 const menu=document.createElement("div");menu.className="navilo-search-menu";menu.hidden=true;
 select.insertAdjacentElement("beforebegin",box);box.append(input,menu);
 const selectedText=()=>select.selectedOptions[0]?.textContent?.trim()||"";
 const sync=()=>{if(document.activeElement!==input)input.value=selectedText()};
 const render=()=>{const q=input.value.trim().toLowerCase();const current=select.value;const opts=Array.from(select.options).filter(o=>{const t=(o.textContent||"").toLowerCase();return !q||t.includes(q)}).slice(0,200);menu.innerHTML=opts.map(o=>`<button type="button" class="navilo-search-option${o.value===current?" is-selected":""}" data-value="${ESC(o.value)}"><span>${ESC((o.textContent||"").trim())}</span></button>`).join("")||'<div class="navilo-search-empty">No matching option</div>';menu.querySelectorAll<HTMLButtonElement>("button").forEach(btn=>btn.addEventListener("mousedown",e=>{e.preventDefault();select.value=btn.dataset.value||"";select.dispatchEvent(new Event("change",{bubbles:true}));input.value=selectedText();menu.hidden=true;input.setAttribute("aria-expanded","false")}))};
 const open=()=>{render();menu.hidden=false;input.setAttribute("aria-expanded","true")};
 input.addEventListener("focus",()=>{sync();input.select();open()});input.addEventListener("click",open);input.addEventListener("input",open);input.addEventListener("keydown",e=>{if(e.key==="Escape"){menu.hidden=true;input.setAttribute("aria-expanded","false");input.value=selectedText();input.blur()}if(e.key==="Enter"){const first=menu.querySelector<HTMLButtonElement>("button");if(first){e.preventDefault();first.dispatchEvent(new MouseEvent("mousedown",{bubbles:true}))}}});
 select.addEventListener("change",sync);
 const mo=new MutationObserver(()=>{sync();if(!menu.hidden)render()});mo.observe(select,{childList:true,subtree:true,attributes:true});
 document.addEventListener("mousedown",e=>{if(!box.contains(e.target as Node)){menu.hidden=true;input.setAttribute("aria-expanded","false");sync()}});
 sync();
}

function process(root:ParentNode){const selects=root instanceof HTMLSelectElement?[root]:Array.from(root.querySelectorAll("select"));selects.forEach(enhance)}

const STYLE=`
.navilo-search-source{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;overflow:hidden!important}
.navilo-search-select{position:relative;min-width:0;width:100%}
.navilo-search-input{width:100%;height:30px;min-height:30px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;padding:0 28px 0 9px;font-size:11.5px;line-height:1.2;color:#0f172a;outline:none}
.navilo-search-input:focus{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.10)}
.navilo-search-select:after{content:'⌄';position:absolute;right:9px;top:5px;color:#64748b;font-size:14px;pointer-events:none}
.navilo-search-menu{position:absolute;z-index:9999;left:0;right:0;top:calc(100% + 4px);max-height:260px;overflow:auto;border:1px solid #cbd5e1;border-radius:8px;background:#fff;padding:4px;box-shadow:0 12px 30px rgba(15,23,42,.16)}
.navilo-search-option{display:flex;width:100%;align-items:center;border:0;border-radius:6px;background:#fff;padding:7px 8px;text-align:left;font-size:11.5px;color:#0f172a;cursor:pointer}
.navilo-search-option:hover,.navilo-search-option.is-selected{background:#eff6ff;color:#1d4ed8}
.navilo-search-empty{padding:10px;text-align:center;font-size:11px;color:#64748b}
`;

export default function GlobalSearchableSelects(){useEffect(()=>{const style=document.createElement("style");style.id="navilo-searchable-selects";style.textContent=STYLE;document.head.appendChild(style);process(document.body);let queued=false;const observer=new MutationObserver(m=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;m.forEach(x=>x.addedNodes.forEach(n=>{if(n instanceof Element)process(n);else if(n.parentElement)process(n.parentElement)}))})});observer.observe(document.body,{childList:true,subtree:true});return()=>{observer.disconnect();style.remove()}},[]);return null}
