import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Modal, PageHeader } from "@/components/ui";
import SearchableSelect from "@/components/SearchableSelect";

type Status = "issued" | "loading" | "weighed" | "finalized" | "cancelled";
type GP = {
  id: string;
  pass_no: string;
  customer_id: string | null;
  customer_name: string | null;
  vehicle_no: string | null;
  driver_name: string | null;
  token_notes: string | null;
  loaded_by_loader_id: string | null;
  loaded_by_name: string | null;
  tare_weight: number;
  gross_weight: number;
  net_weight: number;
  status: Status;
  pass_date: string;
  created_at: string;
};
type Line = {
  id?: string;
  gate_pass_id?: string;
  item_id: string | null;
  item_description: string;
  requested_qty: number;
  actual_qty: number;
  uom: string;
  warehouse_id: string | null;
  godown_id: string | null;
  remarks: string | null;
  warehouse?: { name: string } | null;
  godown?: { name: string } | null;
};
type Customer = { id: string; name: string; name_urdu: string | null; phone: string | null };
type Item = { id: string; sku: string; name: string; name_urdu: string | null; grade: string | null; size: string | null; unit: string | null; warehouse_id: string | null };
type Uom = { id: string; name: string; symbol: string };
type Warehouse = { id: string; name: string; name_urdu: string | null };
type Godown = { id: string; name: string; location: string | null; warehouse_id: string | null };
type Instruction = { id: string; name_en: string; name_ur: string | null; is_active: boolean };
type Loader = { id: string; name_en: string; name_ur: string | null; phone: string | null; is_active: boolean };

const emptyLine = (): Line => ({ item_id: null, item_description: "", requested_qty: 0, actual_qty: 0, uom: "kg", warehouse_id: null, godown_id: null, remarks: null });
const emptyToken = () => ({ customer_id: "", customer_name: "", vehicle_no: "", driver_name: "", token_notes: "", pass_date: new Date().toISOString().slice(0, 10) });
const statusLabel: Record<Status, string> = { issued: "Token Issued", loading: "Loading", weighed: "Kanta Complete", finalized: "Final Gate Pass", cancelled: "Cancelled" };

export default function LoadingUnloading() {
  const [rows, setRows] = useState<GP[]>([]);
  const [lines, setLines] = useState<Record<string, Line[]>>({});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [loaders, setLoaders] = useState<Loader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const [kantaOpen, setKantaOpen] = useState(false);
  const [addInstructionOpen, setAddInstructionOpen] = useState(false);
  const [addLoaderOpen, setAddLoaderOpen] = useState(false);
  const [selected, setSelected] = useState<GP | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [token, setToken] = useState(emptyToken());
  const [tokenLines, setTokenLines] = useState<Line[]>([emptyLine()]);
  const [workLines, setWorkLines] = useState<Line[]>([]);
  const [loaderId, setLoaderId] = useState("");
  const [tare, setTare] = useState("");
  const [gross, setGross] = useState("");
  const [weighRef, setWeighRef] = useState("");
  const [instructionId, setInstructionId] = useState("");
  const [newInstruction, setNewInstruction] = useState({ en: "", ur: "" });
  const [newLoader, setNewLoader] = useState({ en: "", ur: "", phone: "" });
  const net = Math.max((Number(gross) || 0) - (Number(tare) || 0), 0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [g, l, c, i, u, w, d, ins, ld] = await Promise.all([
      supabase.from("gate_passes").select("id,pass_no,customer_id,customer_name,vehicle_no,driver_name,token_notes,loaded_by_loader_id,loaded_by_name,tare_weight,gross_weight,net_weight,status,pass_date,created_at").order("created_at", { ascending: false }),
      supabase.from("gate_pass_lines").select("id,gate_pass_id,item_id,item_description,requested_qty,actual_qty,uom,warehouse_id,godown_id,remarks,warehouse:warehouses(name),godown:godowns(name)"),
      supabase.from("customers").select("id,name,name_urdu,phone").order("name"),
      supabase.from("items").select("id,sku,name,name_urdu,grade,size,unit,warehouse_id").order("name"),
      supabase.from("uom").select("id,name,symbol").order("name"),
      supabase.from("warehouses").select("id,name,name_urdu").order("name"),
      supabase.from("godowns").select("id,name,location,warehouse_id").order("name"),
      supabase.from("gate_pass_loading_instructions").select("id,name_en,name_ur,is_active").eq("is_active", true).order("name_en"),
      supabase.from("gate_pass_loaders").select("id,name_en,name_ur,phone,is_active").eq("is_active", true).order("name_en"),
    ]);
    const e = g.error || l.error || c.error || i.error || u.error || w.error || d.error || ins.error || ld.error;
    if (e) setError(e.message);
    else {
      setRows((g.data || []) as GP[]);
      const map: Record<string, Line[]> = {};
      for (const x of (l.data || []) as any[]) (map[x.gate_pass_id] ??= []).push(x);
      setLines(map);
      setCustomers((c.data || []) as Customer[]);
      setItems((i.data || []) as Item[]);
      setUoms((u.data || []) as Uom[]);
      setWarehouses((w.data || []) as Warehouse[]);
      setGodowns((d.data || []) as Godown[]);
      setInstructions((ins.data || []) as Instruction[]);
      setLoaders((ld.data || []) as Loader[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const nextNo = useMemo(() => {
    let n = 0;
    for (const r of rows) {
      const m = r.pass_no?.match(/(\d+)$/);
      if (m) n = Math.max(n, Number(m[1]));
    }
    return `GP-${String(n + 1).padStart(4, "0")}`;
  }, [rows]);

  const customerDisplay = (gp: GP) => {
    const c = customers.find(x => x.id === gp.customer_id);
    return [gp.customer_name || c?.name, c?.name_urdu].filter(Boolean).join(" / ") || "—";
  };
  const lineDisplay = (x: Line) => {
    const item = items.find(i => i.id === x.item_id);
    return [x.item_description, item?.name_urdu].filter(Boolean).join(" / ") || "—";
  };
  const itemLabel = (x: Item) => [x.sku, x.name, x.name_urdu, x.size, x.grade].filter(Boolean).join(" · ");
  const loaderLabel = (x: Loader) => [x.name_en, x.name_ur].filter(Boolean).join(" / ");

  const chooseCustomer = (id: string) => {
    const c = customers.find(x => x.id === id);
    setToken(t => ({ ...t, customer_id: id, customer_name: c?.name || "" }));
  };
  const chooseItem = (rowIndex: number, id: string) => {
    const item = items.find(x => x.id === id);
    setTokenLines(v => v.map((x, i) => i === rowIndex ? {
      ...x,
      item_id: id || null,
      item_description: item ? [item.name, item.size, item.grade].filter(Boolean).join(" / ") : "",
      uom: item?.unit || uoms[0]?.symbol || "kg",
      warehouse_id: item?.warehouse_id || null,
      godown_id: null,
    } : x));
  };
  const chooseWorkItem = (rowIndex: number, id: string) => {
    const item = items.find(x => x.id === id);
    setWorkLines(v => v.map((x, i) => i === rowIndex ? {
      ...x,
      item_id: id || null,
      item_description: item ? [item.name, item.size, item.grade].filter(Boolean).join(" / ") : "",
      uom: item?.unit || uoms[0]?.symbol || "kg",
      warehouse_id: item?.warehouse_id || null,
      godown_id: null,
    } : x));
  };
  const chooseInstruction = (id: string) => {
    setInstructionId(id);
    const x = instructions.find(a => a.id === id);
    if (x) setToken(t => ({ ...t, token_notes: [x.name_en, x.name_ur].filter(Boolean).join(" / ") }));
  };

  const openNewToken = () => {
    setEditingId(null);
    setSelected(null);
    setInstructionId("");
    setToken(emptyToken());
    setTokenLines([emptyLine()]);
    setError(null);
    setCreateOpen(true);
  };

  const openEditToken = (gp: GP) => {
    if (gp.status !== "issued") {
      setError("Loading start hone ke baad original Token edit nahi ho sakta.");
      return;
    }
    setEditingId(gp.id);
    setSelected(gp);
    setToken({ customer_id: gp.customer_id || "", customer_name: gp.customer_name || "", vehicle_no: gp.vehicle_no || "", driver_name: gp.driver_name || "", token_notes: gp.token_notes || "", pass_date: gp.pass_date });
    setTokenLines((lines[gp.id] || []).map(x => ({ ...x })));
    const ins = instructions.find(x => [x.name_en, x.name_ur].filter(Boolean).join(" / ") === (gp.token_notes || ""));
    setInstructionId(ins?.id || "");
    setError(null);
    setCreateOpen(true);
  };

  const closeTokenModal = () => {
    setCreateOpen(false);
    setEditingId(null);
    setSelected(null);
    setInstructionId("");
    setToken(emptyToken());
    setTokenLines([emptyLine()]);
  };

  const saveNewInstruction = async () => {
    if (!newInstruction.en.trim()) { setError("English instruction required hai."); return; }
    const { data, error } = await supabase.from("gate_pass_loading_instructions").insert({ instruction: newInstruction.en.trim(), name_en: newInstruction.en.trim(), name_ur: newInstruction.ur.trim() || null }).select("id,name_en,name_ur,is_active").single();
    if (error) { setError(error.message); return; }
    const x = data as Instruction;
    setInstructions(v => [...v, x].sort((a, b) => a.name_en.localeCompare(b.name_en)));
    setInstructionId(x.id);
    setToken(t => ({ ...t, token_notes: [x.name_en, x.name_ur].filter(Boolean).join(" / ") }));
    setNewInstruction({ en: "", ur: "" });
    setAddInstructionOpen(false);
  };

  const saveNewLoader = async () => {
    if (!newLoader.en.trim()) { setError("Loader ka English name required hai."); return; }
    const { data, error } = await supabase.from("gate_pass_loaders").insert({ name_en: newLoader.en.trim(), name_ur: newLoader.ur.trim() || null, phone: newLoader.phone.trim() || null }).select("id,name_en,name_ur,phone,is_active").single();
    if (error) { setError(error.message); return; }
    const x = data as Loader;
    setLoaders(v => [...v, x].sort((a, b) => a.name_en.localeCompare(b.name_en)));
    setLoaderId(x.id);
    setNewLoader({ en: "", ur: "", phone: "" });
    setAddLoaderOpen(false);
  };

  const saveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const valid = tokenLines.filter(x => x.item_id && x.item_description.trim() && x.requested_qty > 0);
    if (!token.customer_id) { setError("Customer master se customer select karein."); return; }
    if (!valid.length) { setError("Kam az kam aik material aur quantity required hai."); return; }

    if (!editingId) {
      const { data, error } = await supabase.from("gate_passes").insert({ pass_no: "AUTO", type: "loading", customer_id: token.customer_id, customer_name: token.customer_name, vehicle_no: token.vehicle_no.trim() || null, driver_name: token.driver_name.trim() || null, token_notes: token.token_notes.trim() || null, status: "issued", pass_date: token.pass_date, tare_weight: 0, gross_weight: 0, net_weight: 0, order_book_header_id: null, sales_order_id: null }).select("id").single();
      if (error) { setError(error.message); return; }
      const { error: lineError } = await supabase.from("gate_pass_lines").insert(valid.map(x => ({ gate_pass_id: data.id, item_id: x.item_id, item_description: x.item_description, requested_qty: x.requested_qty, actual_qty: 0, uom: x.uom, remarks: x.remarks || null })));
      if (lineError) { setError(lineError.message); return; }
    } else {
      const gp = rows.find(r => r.id === editingId);
      if (!gp || gp.status !== "issued") { setError("Token ab edit nahi ho sakta kyun ke loading start ho chuki hai."); return; }
      const { data: updated, error: headerError } = await supabase.from("gate_passes").update({ customer_id: token.customer_id, customer_name: token.customer_name, vehicle_no: token.vehicle_no.trim() || null, driver_name: token.driver_name.trim() || null, token_notes: token.token_notes.trim() || null, pass_date: token.pass_date }).eq("id", editingId).eq("status", "issued").select("id").maybeSingle();
      if (headerError) { setError(headerError.message); return; }
      if (!updated) { setError("Token edit lock ho chuka hai kyun ke loading start ho gayi."); return; }
      const existing = lines[editingId] || [];
      const keptIds = new Set(valid.map(x => x.id).filter(Boolean) as string[]);
      const deleteIds = existing.filter(x => x.id && !keptIds.has(x.id)).map(x => x.id as string);
      if (deleteIds.length) {
        const { error: deleteError } = await supabase.from("gate_pass_lines").delete().in("id", deleteIds);
        if (deleteError) { setError(deleteError.message); return; }
      }
      for (const x of valid) {
        if (x.id) {
          const { error: updateError } = await supabase.from("gate_pass_lines").update({ item_id: x.item_id, item_description: x.item_description, requested_qty: x.requested_qty, uom: x.uom, remarks: x.remarks || null }).eq("id", x.id);
          if (updateError) { setError(updateError.message); return; }
        } else {
          const { error: insertError } = await supabase.from("gate_pass_lines").insert({ gate_pass_id: editingId, item_id: x.item_id, item_description: x.item_description, requested_qty: x.requested_qty, actual_qty: 0, uom: x.uom, remarks: x.remarks || null });
          if (insertError) { setError(insertError.message); return; }
        }
      }
    }
    closeTokenModal();
    await load();
  };

  const openLoading = (gp: GP) => {
    setSelected(gp);
    setLoaderId(gp.loaded_by_loader_id || loaders.find(x => x.name_en === gp.loaded_by_name)?.id || "");
    setWorkLines((lines[gp.id] || []).map(x => ({ ...x })));
    setWorkOpen(true);
  };

  const saveLoading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    const loader = loaders.find(x => x.id === loaderId);
    if (!loader) { setError("Loader master se loader select karein."); return; }
    for (const x of workLines) {
      if (!x.item_id || !x.item_description.trim() || x.actual_qty <= 0 || !x.warehouse_id || !x.godown_id) {
        setError("Har loaded line par Material, Actual Qty, Warehouse aur Godown required hain.");
        return;
      }
      if (x.id) {
        const { error } = await supabase.from("gate_pass_lines").update({ actual_qty: x.actual_qty, warehouse_id: x.warehouse_id, godown_id: x.godown_id, remarks: x.remarks }).eq("id", x.id);
        if (error) { setError(error.message); return; }
      } else {
        const { error } = await supabase.from("gate_pass_lines").insert({ gate_pass_id: selected.id, item_id: x.item_id, item_description: x.item_description, requested_qty: 0, actual_qty: x.actual_qty, uom: x.uom || "kg", warehouse_id: x.warehouse_id, godown_id: x.godown_id, remarks: x.remarks || "Added during loading" });
        if (error) { setError(error.message); return; }
      }
    }
    const { error } = await supabase.from("gate_passes").update({ status: "loading", loaded_by_loader_id: loader.id, loaded_by_name: loaderLabel(loader), loading_completed_at: new Date().toISOString() }).eq("id", selected.id).eq("status", "issued");
    if (error) setError(error.message);
    else { setWorkOpen(false); await load(); }
  };

  const saveKanta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (Number(tare) <= 0 || Number(gross) <= Number(tare)) { setError("Valid Tare aur Gross required hai."); return; }
    const { error } = await supabase.from("gate_passes").update({ tare_weight: Number(tare), gross_weight: Number(gross), status: "weighed", weighed_at: new Date().toISOString(), weighbridge_reference: weighRef.trim() || null }).eq("id", selected.id);
    if (error) setError(error.message); else { setKantaOpen(false); await load(); }
  };

  const finalize = async (gp: GP) => {
    if (!confirm(`${gp.pass_no} ko Final Gate Pass banana hai?`)) return;
    const { error } = await supabase.from("gate_passes").update({ status: "finalized" }).eq("id", gp.id);
    if (error) setError(error.message); else await load();
  };

  const printGP = (gp: GP, final = false) => {
    const ls = lines[gp.id] || [];
    const w = window.open("", "_blank");
    if (!w) return;
    const manualRows = ls.map((x, i) => `<tr><td>${i + 1}</td><td dir="auto"><b>${lineDisplay(x)}</b><br><span class="muted">Requested / مطلوبہ: ${x.requested_qty} ${x.uom}</span></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join("");
    const extraRows = Array.from({ length: 4 }, (_, i) => `<tr><td>${ls.length + i + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join("");
    const finalRows = ls.map((x, i) => `<tr><td>${i + 1}</td><td dir="auto">${lineDisplay(x)}</td><td>${x.requested_qty} ${x.uom}</td><td>${x.actual_qty} ${x.uom}</td><td>${x.warehouse?.name || "—"}</td><td>${x.godown?.name || "—"}</td><td>${x.remarks || "—"}</td></tr>`).join("");
    const pageSize = final ? "A4 portrait" : "A4 landscape";
    const body = final
      ? `<div class="sheet"><h1>FINAL GATE PASS / حتمی گیٹ پاس</h1><div><b>${gp.pass_no}</b> · ${gp.pass_date}</div><p><b>Customer / کسٹمر:</b> ${customerDisplay(gp)} &nbsp; <b>Vehicle / گاڑی:</b> ${gp.vehicle_no || "—"} &nbsp; <b>Driver / ڈرائیور:</b> ${gp.driver_name || "—"}</p><p><b>Loaded By / لوڈر:</b> ${gp.loaded_by_name || "—"}</p><table><thead><tr><th>#</th><th>Material / مال</th><th>Requested</th><th>Actual Loaded</th><th>Warehouse</th><th>Godown</th><th>Remarks</th></tr></thead><tbody>${finalRows}</tbody></table><div class="weights"><div>Tare / خالی وزن<br><b>${gp.tare_weight} kg</b></div><div>Gross / بھرا وزن<br><b>${gp.gross_weight} kg</b></div><div>Net / خالص وزن<br><b>${gp.net_weight} kg</b></div></div></div>`
      : `<div class="sheet"><h1>LOADING TOKEN / لوڈنگ ٹوکن</h1><div><b>${gp.pass_no}</b> · ${gp.pass_date}</div><p><b>Customer / کسٹمر:</b> ${customerDisplay(gp)} &nbsp; <b>Vehicle / گاڑی:</b> ${gp.vehicle_no || "—"} &nbsp; <b>Driver / ڈرائیور:</b> ${gp.driver_name || "—"}</p>${gp.token_notes ? `<p><b>Loading Instructions / لوڈنگ ہدایات:</b> ${gp.token_notes}</p>` : ""}<h3>A. MATERIAL LOADING RECORD / مال لوڈنگ ریکارڈ</h3><table><thead><tr><th>#</th><th>Requested Material / مطلوبہ مال</th><th>Actual Material / Grade / Size</th><th>Actual Qty / Weight</th><th>Warehouse</th><th>Godown / Location</th><th>Bundles / Pieces</th><th>Loading Remarks / Method</th></tr></thead><tbody>${manualRows}${extraRows}</tbody></table><h3>B. VEHICLE & WEIGHBRIDGE RECORD / گاڑی اور کانٹا ریکارڈ</h3><div class="weights four"><div>Empty / Tare<br>____________ kg</div><div>Loaded / Gross<br>____________ kg</div><div>Net Material<br>____________ kg</div><div>Kanta Slip / Ref<br>____________</div></div><h3>C. LOADING STAFF DETAILS / لوڈنگ عملہ تفصیل</h3><div class="staff">Loader Name / لوڈر نام: ____________________ &nbsp;&nbsp; Loader Signature / دستخط: ____________________<br><br>Loading Start / آغاز: __________ &nbsp;&nbsp; Loading Finish / اختتام: __________<br><br>Weighbridge Operator / کانٹا آپریٹر: ____________________ &nbsp;&nbsp; Signature / دستخط: ____________________</div></div>`;
    w.document.write(`<html><head><meta charset="UTF-8"><title>${gp.pass_no}</title><style>@page{size:${pageSize};margin:8mm}body{font-family:Arial,"Noto Nastaliq Urdu","Noto Sans Arabic",sans-serif;font-size:11px;color:#111827}.sheet{border:1.5px solid #111827;padding:12px}h1{text-align:center;margin:0 0 10px}h3{background:#e2e8f0;border:1px solid #64748b;padding:5px;margin:10px 0 0}table{width:100%;border-collapse:collapse}th,td{border:1px solid #64748b;padding:5px;vertical-align:top}th{background:#f8fafc}.muted{color:#64748b;font-size:9px}.weights{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.weights.four{grid-template-columns:repeat(4,1fr)}.weights>div,.staff{border:1px solid #64748b;padding:10px;min-height:55px}.manual td{height:40px}</style></head><body>${body}<script>window.onload=()=>setTimeout(()=>window.print(),150)</script></body></html>`);
    w.document.close();
  };

  return <div className="space-y-4">
    <PageHeader title="Gate Pass / Loading / Kanta" subtitle="Manual Token → Loading → Weighbridge → Final Gate Pass" action={<button className="btn btn-primary" onClick={openNewToken}>+ New Loading Token</button>} />
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{(["issued", "loading", "weighed", "finalized"] as Status[]).map(s => <div key={s} className="rounded-xl border bg-white p-3"><div className="text-xs text-slate-500">{statusLabel[s]}</div><div className="text-2xl font-bold">{rows.filter(r => r.status === s).length}</div></div>)}</div>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-3">Token / GP</th><th>Customer / کسٹمر</th><th>Vehicle / گاڑی</th><th>Material / مال</th><th>Status</th><th>Action</th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="p-5">Loading…</td></tr> : rows.map(gp => <tr key={gp.id} className="border-t"><td className="p-3 font-semibold">{gp.pass_no}</td><td dir="auto">{customerDisplay(gp)}</td><td>{gp.vehicle_no || "—"}</td><td>{(lines[gp.id] || []).map(x => <div key={x.id || x.item_description} dir="auto">{lineDisplay(x)}</div>)}</td><td>{statusLabel[gp.status]}</td><td><div className="flex flex-wrap gap-1"><button className="btn btn-secondary" onClick={() => printGP(gp, gp.status === "finalized")}>{gp.status === "finalized" ? "Print Final GP" : "Print Loading Worksheet"}</button>{gp.status === "issued" && <><button className="btn btn-secondary" onClick={() => openEditToken(gp)}>Edit Token</button><button className="btn btn-primary" onClick={() => openLoading(gp)}>Loading</button></>}{gp.status === "loading" && <button className="btn btn-primary" onClick={() => { setSelected(gp); setTare(String(gp.tare_weight || "")); setGross(String(gp.gross_weight || "")); setKantaOpen(true); }}>Kanta</button>}{gp.status === "weighed" && <button className="btn btn-primary" onClick={() => finalize(gp)}>Generate Final GP</button>}</div></td></tr>)}</tbody></table></div>

    <Modal open={createOpen} onClose={closeTokenModal} title={editingId ? `Edit Loading Token — ${selected?.pass_no || ""}` : "New Loading Token"} panelClassName="!max-w-6xl !w-[96vw]"><form onSubmit={saveToken} className="space-y-4"><div className="grid gap-3 md:grid-cols-4"><div><label className="label">Token / GP No.</label><input className="input bg-slate-100" value={editingId ? (selected?.pass_no || "") : `${nextNo} (Auto)`} readOnly /></div><div><label className="label">Customer / Party</label><SearchableSelect className="input" value={token.customer_id} onChange={e => chooseCustomer(e.target.value)} searchPlaceholder="Search customer..."><option value="">Select Customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.name_urdu ? ` / ${c.name_urdu}` : ""}</option>)}</SearchableSelect></div><div><label className="label">Vehicle No.</label><input className="input" value={token.vehicle_no} onChange={e => setToken({ ...token, vehicle_no: e.target.value })} /></div><div><label className="label">Date</label><input type="date" className="input" value={token.pass_date} onChange={e => setToken({ ...token, pass_date: e.target.value })} /></div><div><label className="label">Driver</label><input className="input" value={token.driver_name} onChange={e => setToken({ ...token, driver_name: e.target.value })} /></div><div className="md:col-span-3"><div className="mb-1 flex items-center justify-between"><label className="label">Token Instructions / Notes — English / اردو</label><button type="button" className="text-xs font-semibold text-blue-600" onClick={() => setAddInstructionOpen(true)}>+ Add New</button></div><SearchableSelect className="input" value={instructionId} onChange={e => chooseInstruction(e.target.value)} searchPlaceholder="Search English or Urdu instruction..."><option value="">Search / Select Instruction</option>{instructions.map(x => <option key={x.id} value={x.id}>{x.name_en}{x.name_ur ? ` / ${x.name_ur}` : ""}</option>)}</SearchableSelect><textarea className="input mt-2 min-h-20" dir="auto" value={token.token_notes} onChange={e => setToken({ ...token, token_notes: e.target.value })} /></div></div><div className="space-y-2">{tokenLines.map((x, i) => <div key={x.id || `new-${i}`} className="grid grid-cols-12 gap-2"><div className="col-span-5"><SearchableSelect className="input" value={x.item_id || ""} onChange={e => chooseItem(i, e.target.value)} searchPlaceholder="Search item..."><option value="">Select Item</option>{items.map(it => <option key={it.id} value={it.id}>{itemLabel(it)}</option>)}</SearchableSelect></div><input className="input col-span-2" type="number" step="any" placeholder="Qty" value={x.requested_qty || ""} onChange={e => setTokenLines(v => v.map((a, j) => j === i ? { ...a, requested_qty: Number(e.target.value) } : a))} /><div className="col-span-2"><SearchableSelect className="input" value={x.uom} onChange={e => setTokenLines(v => v.map((a, j) => j === i ? { ...a, uom: e.target.value } : a))}>{uoms.map(u => <option key={u.id} value={u.symbol}>{u.symbol} · {u.name}</option>)}</SearchableSelect></div><input className="input col-span-3" placeholder="Remarks" value={x.remarks || ""} onChange={e => setTokenLines(v => v.map((a, j) => j === i ? { ...a, remarks: e.target.value } : a))} /></div>)}</div><div className="flex justify-between"><button type="button" className="btn btn-secondary" onClick={() => setTokenLines(v => [...v, emptyLine()])}>+ Add Material</button><button className="btn btn-primary">{editingId ? "Save Token Changes" : "Issue & Save Token"}</button></div></form></Modal>

    <Modal open={addInstructionOpen} onClose={() => setAddInstructionOpen(false)} title="Add Loading Instruction / لوڈنگ ہدایت"><div className="space-y-3"><input className="input" placeholder="English" value={newInstruction.en} onChange={e => setNewInstruction({ ...newInstruction, en: e.target.value })} /><input className="input text-right" dir="rtl" placeholder="اردو" value={newInstruction.ur} onChange={e => setNewInstruction({ ...newInstruction, ur: e.target.value })} /><div className="flex justify-end"><button type="button" className="btn btn-primary" onClick={() => void saveNewInstruction()}>Save & Use / محفوظ کریں</button></div></div></Modal>

    <Modal open={workOpen} onClose={() => setWorkOpen(false)} title={`Loading — ${selected?.pass_no || ""}`} panelClassName="!max-w-7xl !w-[97vw]"><form onSubmit={saveLoading} className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div className="min-w-[360px]"><div className="mb-1 flex items-center justify-between"><label className="label">Loaded By / Loader Name / لوڈر</label><button type="button" className="text-xs font-semibold text-blue-600" onClick={() => setAddLoaderOpen(true)}>+ Add New Loader</button></div><SearchableSelect className="input" value={loaderId} onChange={e => setLoaderId(e.target.value)} searchPlaceholder="Search loader English or Urdu..."><option value="">Select Loader / لوڈر منتخب کریں</option>{loaders.map(x => <option key={x.id} value={x.id}>{loaderLabel(x)}{x.phone ? ` · ${x.phone}` : ""}</option>)}</SearchableSelect></div><button type="button" className="btn btn-secondary" onClick={() => setWorkLines(v => [...v, emptyLine()])}>+ Add Loaded Material</button></div>{workLines.map((x, i) => <div key={x.id || `new-${i}`} className="grid grid-cols-12 gap-2">{x.id ? <div className="col-span-3 p-2" dir="auto">{lineDisplay(x)}<div className="text-xs text-slate-400">Requested: {x.requested_qty} {x.uom}</div></div> : <div className="col-span-3"><SearchableSelect className="input" value={x.item_id || ""} onChange={e => chooseWorkItem(i, e.target.value)} searchPlaceholder="Search additional material..."><option value="">Select Material</option>{items.map(it => <option key={it.id} value={it.id}>{itemLabel(it)}</option>)}</SearchableSelect></div>}<input className="input col-span-2" type="number" step="any" placeholder="Actual Qty" value={x.actual_qty || ""} onChange={e => setWorkLines(v => v.map((a, j) => j === i ? { ...a, actual_qty: Number(e.target.value) } : a))} /><div className="col-span-2"><SearchableSelect className="input" value={x.warehouse_id || ""} onChange={e => setWorkLines(v => v.map((a, j) => j === i ? { ...a, warehouse_id: e.target.value || null, godown_id: null } : a))}><option value="">Warehouse</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}{w.name_urdu ? ` / ${w.name_urdu}` : ""}</option>)}</SearchableSelect></div><div className="col-span-2"><SearchableSelect className="input" value={x.godown_id || ""} onChange={e => setWorkLines(v => v.map((a, j) => j === i ? { ...a, godown_id: e.target.value || null } : a))}><option value="">Godown</option>{godowns.filter(g => g.warehouse_id === x.warehouse_id).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</SearchableSelect></div><input className="input col-span-3" placeholder="Remarks" value={x.remarks || ""} onChange={e => setWorkLines(v => v.map((a, j) => j === i ? { ...a, remarks: e.target.value } : a))} /></div>)}<div className="flex justify-end"><button className="btn btn-primary">Save Loading & Send to Kanta</button></div></form></Modal>

    <Modal open={addLoaderOpen} onClose={() => setAddLoaderOpen(false)} title="Add Loader / نیا لوڈر"><div className="space-y-3"><div><label className="label">English Name</label><input className="input" value={newLoader.en} onChange={e => setNewLoader({ ...newLoader, en: e.target.value })} /></div><div><label className="label">Urdu Name / اردو</label><input className="input text-right" dir="rtl" value={newLoader.ur} onChange={e => setNewLoader({ ...newLoader, ur: e.target.value })} /></div><div><label className="label">Phone</label><input className="input" value={newLoader.phone} onChange={e => setNewLoader({ ...newLoader, phone: e.target.value })} /></div><div className="flex justify-end"><button type="button" className="btn btn-primary" onClick={() => void saveNewLoader()}>Save & Select Loader / محفوظ کریں</button></div></div></Modal>

    <Modal open={kantaOpen} onClose={() => setKantaOpen(false)} title={`Kanta / Weighbridge — ${selected?.pass_no || ""}`}><form onSubmit={saveKanta} className="space-y-3"><div className="grid grid-cols-3 gap-3"><input className="input" type="number" placeholder="Tare kg" value={tare} onChange={e => setTare(e.target.value)} /><input className="input" type="number" placeholder="Gross kg" value={gross} onChange={e => setGross(e.target.value)} /><input className="input bg-slate-100" value={`${net} kg Net`} readOnly /></div><input className="input" placeholder="Kanta Slip / Reference" value={weighRef} onChange={e => setWeighRef(e.target.value)} /><div className="flex justify-end"><button className="btn btn-primary">Save Kanta</button></div></form></Modal>
  </div>;
}
