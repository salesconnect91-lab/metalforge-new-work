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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const [kantaOpen, setKantaOpen] = useState(false);
  const [addInstructionOpen, setAddInstructionOpen] = useState(false);
  const [selected, setSelected] = useState<GP | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [token, setToken] = useState(emptyToken());
  const [tokenLines, setTokenLines] = useState<Line[]>([emptyLine()]);
  const [workLines, setWorkLines] = useState<Line[]>([]);
  const [loadedBy, setLoadedBy] = useState("");
  const [tare, setTare] = useState("");
  const [gross, setGross] = useState("");
  const [weighRef, setWeighRef] = useState("");
  const [instructionId, setInstructionId] = useState("");
  const [newInstruction, setNewInstruction] = useState({ en: "", ur: "" });
  const net = Math.max((Number(gross) || 0) - (Number(tare) || 0), 0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [g, l, c, i, u, w, d, ins] = await Promise.all([
      supabase.from("gate_passes").select("id,pass_no,customer_id,customer_name,vehicle_no,driver_name,token_notes,loaded_by_name,tare_weight,gross_weight,net_weight,status,pass_date,created_at").order("created_at", { ascending: false }),
      supabase.from("gate_pass_lines").select("id,gate_pass_id,item_id,item_description,requested_qty,actual_qty,uom,warehouse_id,godown_id,remarks,warehouse:warehouses(name),godown:godowns(name)"),
      supabase.from("customers").select("id,name,name_urdu,phone").order("name"),
      supabase.from("items").select("id,sku,name,name_urdu,grade,size,unit,warehouse_id").order("name"),
      supabase.from("uom").select("id,name,symbol").order("name"),
      supabase.from("warehouses").select("id,name,name_urdu").order("name"),
      supabase.from("godowns").select("id,name,location,warehouse_id").order("name"),
      supabase.from("gate_pass_loading_instructions").select("id,name_en,name_ur,is_active").eq("is_active", true).order("name_en"),
    ]);
    const e = g.error || l.error || c.error || i.error || u.error || w.error || d.error || ins.error;
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
    setToken({
      customer_id: gp.customer_id || "",
      customer_name: gp.customer_name || "",
      vehicle_no: gp.vehicle_no || "",
      driver_name: gp.driver_name || "",
      token_notes: gp.token_notes || "",
      pass_date: gp.pass_date,
    });
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
    const { data, error } = await supabase.from("gate_pass_loading_instructions").insert({
      instruction: newInstruction.en.trim(),
      name_en: newInstruction.en.trim(),
      name_ur: newInstruction.ur.trim() || null,
    }).select("id,name_en,name_ur,is_active").single();
    if (error) { setError(error.message); return; }
    const x = data as Instruction;
    setInstructions(v => [...v, x].sort((a, b) => a.name_en.localeCompare(b.name_en)));
    setInstructionId(x.id);
    setToken(t => ({ ...t, token_notes: [x.name_en, x.name_ur].filter(Boolean).join(" / ") }));
    setNewInstruction({ en: "", ur: "" });
    setAddInstructionOpen(false);
  };

  const saveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const valid = tokenLines.filter(x => x.item_id && x.item_description.trim() && x.requested_qty > 0);
    if (!token.customer_id) { setError("Customer master se customer select karein."); return; }
    if (!valid.length) { setError("Kam az kam aik material aur quantity required hai."); return; }

    if (!editingId) {
      const { data, error } = await supabase.from("gate_passes").insert({
        pass_no: "AUTO",
        type: "loading",
        customer_id: token.customer_id,
        customer_name: token.customer_name,
        vehicle_no: token.vehicle_no.trim() || null,
        driver_name: token.driver_name.trim() || null,
        token_notes: token.token_notes.trim() || null,
        status: "issued",
        pass_date: token.pass_date,
        tare_weight: 0,
        gross_weight: 0,
        net_weight: 0,
        order_book_header_id: null,
        sales_order_id: null,
      }).select("id").single();
      if (error) { setError(error.message); return; }
      const { error: lineError } = await supabase.from("gate_pass_lines").insert(valid.map(x => ({
        gate_pass_id: data.id,
        item_id: x.item_id,
        item_description: x.item_description,
        requested_qty: x.requested_qty,
        actual_qty: 0,
        uom: x.uom,
        remarks: x.remarks || null,
      })));
      if (lineError) { setError(lineError.message); return; }
    } else {
      const gp = rows.find(r => r.id === editingId);
      if (!gp || gp.status !== "issued") { setError("Token ab edit nahi ho sakta kyun ke loading start ho chuki hai."); return; }

      const { data: updated, error: headerError } = await supabase.from("gate_passes").update({
        customer_id: token.customer_id,
        customer_name: token.customer_name,
        vehicle_no: token.vehicle_no.trim() || null,
        driver_name: token.driver_name.trim() || null,
        token_notes: token.token_notes.trim() || null,
        pass_date: token.pass_date,
      }).eq("id", editingId).eq("status", "issued").select("id").maybeSingle();
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
          const { error: updateError } = await supabase.from("gate_pass_lines").update({
            item_id: x.item_id,
            item_description: x.item_description,
            requested_qty: x.requested_qty,
            uom: x.uom,
            remarks: x.remarks || null,
          }).eq("id", x.id);
          if (updateError) { setError(updateError.message); return; }
        } else {
          const { error: insertError } = await supabase.from("gate_pass_lines").insert({
            gate_pass_id: editingId,
            item_id: x.item_id,
            item_description: x.item_description,
            requested_qty: x.requested_qty,
            actual_qty: 0,
            uom: x.uom,
            remarks: x.remarks || null,
          });
          if (insertError) { setError(insertError.message); return; }
        }
      }
    }

    closeTokenModal();
    await load();
  };

  const openLoading = (gp: GP) => {
    setSelected(gp);
    setLoadedBy(gp.loaded_by_name || "");
    setWorkLines((lines[gp.id] || []).map(x => ({ ...x })));
    setWorkOpen(true);
  };

  const saveLoading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setError(null);
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
    const { error } = await supabase.from("gate_passes").update({ status: "loading", loaded_by_name: loadedBy.trim() || null, loading_completed_at: new Date().toISOString() }).eq("id", selected.id).eq("status", "issued");
    if (error) setError(error.message);
    else { setWorkOpen(false); await load(); }
  };

  const saveKanta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (Number(tare) <= 0 || Number(gross) <= Number(tare)) { setError("Valid Tare aur Gross required hai."); return; }
    const { error } = await supabase.from("gate_passes").update({ tare_weight: Number(tare), gross_weight: Number(gross), status: "weighed", weighed_at: new Date().toISOString(), weighbridge_reference: weighRef.trim() || null }).eq("id", selected.id);
    if (error) setError(error.message);
    else { setKantaOpen(false); await load(); }
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
      ? `<div class="sheet"><div class="head"><div><div class="brand">NAVILO</div><div class="muted">AMK Steels Private Limited</div></div><div class="center"><h1>FINAL GATE PASS / حتمی گیٹ پاس</h1><div class="muted">Verified Loading & Weighbridge Record / تصدیق شدہ لوڈنگ و کانٹا ریکارڈ</div></div><div class="docno"><b>${gp.pass_no}</b><br>${gp.pass_date}</div></div><div class="meta"><div><b>Customer / کسٹمر:</b> ${customerDisplay(gp)}</div><div><b>Vehicle / گاڑی:</b> ${gp.vehicle_no || "—"}</div><div><b>Driver / ڈرائیور:</b> ${gp.driver_name || "—"}</div><div><b>Loaded By / لوڈر:</b> ${gp.loaded_by_name || "—"}</div></div>${gp.token_notes ? `<div class="box"><b>Instructions / ہدایات:</b> <span dir="auto">${gp.token_notes}</span></div>` : ""}<table><thead><tr><th>#</th><th>Material / مال</th><th>Requested<br>مطلوبہ</th><th>Actual Loaded<br>اصل لوڈ</th><th>Warehouse<br>ویئرہاؤس</th><th>Godown<br>گودام</th><th>Remarks<br>ریمارکس</th></tr></thead><tbody>${finalRows}</tbody></table><div class="weights"><div><span>Tare / خالی گاڑی</span><b>${gp.tare_weight} kg</b></div><div><span>Gross / بھری گاڑی</span><b>${gp.gross_weight} kg</b></div><div><span>Net Material / خالص مال</span><b>${gp.net_weight} kg</b></div></div><div class="signs"><div>Prepared By / تیار کنندہ</div><div>Checked By / چیک کیا</div><div>Authorized By / منظور کنندہ</div></div></div>`
      : `<div class="sheet"><div class="head"><div><div class="brand">NAVILO</div><div class="muted">AMK Steels Private Limited</div></div><div class="center"><h1>LOADING TOKEN / لوڈنگ ٹوکن</h1><div class="warning">MANUAL LOADING & WEIGHBRIDGE WORKSHEET / دستی لوڈنگ اور کانٹا ورک شیٹ</div></div><div class="docno"><b>${gp.pass_no}</b><br>${gp.pass_date}</div></div><div class="purpose">یہ ٹوکن لوڈر/کانٹا عملہ کو دیا جائے۔ لوڈنگ کے دوران تمام اصل تفصیل ہاتھ سے مکمل کریں اور ٹوکن دفتر واپس کریں۔<br><b>Loader / weighbridge staff must fill actual material, source location and vehicle weights by hand and return this token to office.</b></div><div class="meta"><div><b>Customer / کسٹمر:</b> ${customerDisplay(gp)}</div><div><b>Vehicle / گاڑی:</b> ${gp.vehicle_no || "—"}</div><div><b>Driver / ڈرائیور:</b> ${gp.driver_name || "—"}</div><div><b>Token Date / تاریخ:</b> ${gp.pass_date}</div></div>${gp.token_notes ? `<div class="box"><b>Loading Instructions / لوڈنگ ہدایات:</b> <span dir="auto">${gp.token_notes}</span></div>` : ""}<div class="section-title">A. MATERIAL LOADING RECORD / مال لوڈنگ ریکارڈ</div><table class="manual"><thead><tr><th>#</th><th>Requested Material / مطلوبہ مال</th><th>Actual Material / Grade / Size<br>اصل مال / گریڈ / سائز</th><th>Actual Qty / Weight<br>اصل مقدار / وزن</th><th>Warehouse<br>ویئرہاؤس</th><th>Godown / Location<br>گودام / جگہ</th><th>Bundles / Pieces<br>بنڈل / پیس</th><th>Loading Remarks / Method<br>لوڈنگ طریقہ / ریمارکس</th></tr></thead><tbody>${manualRows}${extraRows}</tbody></table><div class="section-title">B. VEHICLE & WEIGHBRIDGE RECORD / گاڑی اور کانٹا ریکارڈ</div><div class="weights manualweights"><div><span>Empty Vehicle / Tare Weight<br>خالی گاڑی وزن</span><b>________________ kg</b></div><div><span>Loaded Vehicle / Gross Weight<br>لوڈ گاڑی کل وزن</span><b>________________ kg</b></div><div><span>Net Material Weight<br>مال کا خالص وزن</span><b>________________ kg</b></div><div><span>Kanta Slip / Ref No.<br>کانٹا سلپ نمبر</span><b>________________</b></div></div><div class="section-title">C. LOADING STAFF DETAILS / لوڈنگ عملہ تفصیل</div><div class="staff"><div><b>Loading Start / آغاز:</b> __________</div><div><b>Loading Finish / اختتام:</b> __________</div><div><b>Loader Name / لوڈر نام:</b> ____________________</div><div><b>Loader Signature / دستخط:</b> ____________________</div><div><b>Weighbridge Operator / کانٹا آپریٹر:</b> ____________________</div><div><b>Signature / دستخط:</b> ____________________</div><div class="wide"><b>Special handling / stacking / shortage / excess / damage remarks<br>خصوصی لوڈنگ / ترتیب / کمی / زیادتی / نقصان:</b><div class="writearea"></div></div></div><div class="section-title">D. OFFICE RECEIVING / دفتر وصولی</div><div class="staff"><div><b>Returned to Office At / دفتر واپسی وقت:</b> __________</div><div><b>Received By / وصول کنندہ:</b> ____________________</div><div><b>Signature / دستخط:</b> ____________________</div><div><b>Final GP No. / حتمی گیٹ پاس نمبر:</b> ____________________</div></div><div class="note"><b>Process:</b> Office Token → Loader fills actual loading + source → Kanta fills tare/gross/net → Token returned to office → Office enters same actual data in NAVILO → Final Gate Pass generated.</div></div>`;
    w.document.write(`<html><head><meta charset="UTF-8"><title>${gp.pass_no} - ${final ? "Final Gate Pass" : "Loading Token"}</title><style>@page{size:${pageSize};margin:8mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,"Noto Nastaliq Urdu","Noto Sans Arabic",sans-serif;color:#111827;font-size:11px}.sheet{border:1.5px solid #111827;padding:10px;min-height:190mm}.head{display:grid;grid-template-columns:1fr 2fr 1fr;align-items:center;border-bottom:2px solid #1e3a8a;padding-bottom:8px}.brand{font-size:20px;font-weight:800;color:#1e40af}.center{text-align:center}.center h1{margin:0;font-size:21px}.docno{text-align:right;font-size:12px}.muted{color:#64748b;font-size:10px}.warning{font-weight:700;margin-top:4px}.purpose{margin-top:8px;border:1px solid #94a3b8;background:#f8fafc;padding:7px;text-align:center;line-height:1.55}.meta{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:5px 10px;border:1px solid #94a3b8;padding:7px;margin-top:8px}.box{border:1px solid #94a3b8;padding:7px;margin-top:7px;min-height:34px}.section-title{font-weight:800;background:#e2e8f0;border:1px solid #64748b;padding:5px 7px;margin-top:8px}table{width:100%;border-collapse:collapse;margin-top:0}th,td{border:1px solid #64748b;padding:4px;vertical-align:top}th{background:#f8fafc;text-align:center;font-size:9.5px}.manual td{height:40px}.manual th:nth-child(1){width:3%}.manual th:nth-child(2){width:18%}.manual th:nth-child(3){width:17%}.manual th:nth-child(4){width:11%}.manual th:nth-child(5){width:12%}.manual th:nth-child(6){width:12%}.manual th:nth-child(7){width:10%}.manual th:nth-child(8){width:17%}.weights{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}.weights>div{border:1px solid #64748b;padding:8px;text-align:center;min-height:52px}.weights span{display:block;font-size:10px;color:#475569;margin-bottom:6px}.manualweights{grid-template-columns:repeat(4,1fr)}.staff{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;border:1px solid #64748b;padding:8px}.staff>div{min-height:28px}.staff .wide{grid-column:1/-1}.writearea{border-bottom:1px solid #64748b;height:30px;margin-top:5px}.signs{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:24px}.signs div{border-top:1px solid #64748b;padding-top:5px;text-align:center}.note{margin-top:7px;border:1px solid #94a3b8;padding:6px;font-size:9px;line-height:1.5}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${body}<script>window.onload=()=>setTimeout(()=>window.print(),150)</script></body></html>`);
    w.document.close();
  };

  return <div className="space-y-4">
    <PageHeader title="Gate Pass / Loading / Kanta" subtitle="Manual Token → Loading → Weighbridge → Final Gate Pass" action={<button className="btn btn-primary" onClick={openNewToken}>+ New Loading Token</button>} />
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {(["issued", "loading", "weighed", "finalized"] as Status[]).map(s => <div key={s} className="rounded-xl border bg-white p-3"><div className="text-xs text-slate-500">{statusLabel[s]}</div><div className="text-2xl font-bold">{rows.filter(r => r.status === s).length}</div></div>)}
    </div>

    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-3">Token / GP</th><th>Customer / کسٹمر</th><th>Vehicle / گاڑی</th><th>Material / مال</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={6} className="p-5">Loading…</td></tr> : rows.map(gp => <tr key={gp.id} className="border-t"><td className="p-3 font-semibold">{gp.pass_no}</td><td dir="auto">{customerDisplay(gp)}</td><td>{gp.vehicle_no || "—"}</td><td>{(lines[gp.id] || []).map(x => <div key={x.id || x.item_description} dir="auto">{lineDisplay(x)}</div>)}</td><td>{statusLabel[gp.status]}</td><td><div className="flex flex-wrap gap-1"><button className="btn btn-secondary" onClick={() => printGP(gp, gp.status === "finalized")}>{gp.status === "finalized" ? "Print Final GP" : "Print Loading Worksheet"}</button>{gp.status === "issued" && <><button className="btn btn-secondary" onClick={() => openEditToken(gp)}>Edit Token</button><button className="btn btn-primary" onClick={() => openLoading(gp)}>Loading</button></>}{gp.status === "loading" && <button className="btn btn-primary" onClick={() => { setSelected(gp); setTare(String(gp.tare_weight || "")); setGross(String(gp.gross_weight || "")); setKantaOpen(true); }}>Kanta</button>}{gp.status === "weighed" && <button className="btn btn-primary" onClick={() => finalize(gp)}>Generate Final GP</button>}</div></td></tr>)}
    </tbody></table></div>

    <Modal open={createOpen} onClose={closeTokenModal} title={editingId ? `Edit Loading Token — ${selected?.pass_no || ""}` : "New Loading Token"} panelClassName="!max-w-6xl !w-[96vw]">
      <form onSubmit={saveToken} className="space-y-4">
        {editingId && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Token Issued stage mein edit allowed hai. Loading start hote hi original token lock ho jayega.</div>}
        <div className="grid gap-3 md:grid-cols-4">
          <div><label className="label">Token / GP No.</label><input className="input bg-slate-100" value={editingId ? (selected?.pass_no || "") : `${nextNo} (Auto)`} readOnly /></div>
          <div><label className="label">Customer / Party</label><SearchableSelect className="input" value={token.customer_id} onChange={e => chooseCustomer(e.target.value)} searchPlaceholder="Search customer..."><option value="">Select Customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.name_urdu ? ` / ${c.name_urdu}` : ""}</option>)}</SearchableSelect></div>
          <div><label className="label">Vehicle No.</label><input className="input" value={token.vehicle_no} onChange={e => setToken({ ...token, vehicle_no: e.target.value })} /></div>
          <div><label className="label">Date</label><input type="date" className="input" value={token.pass_date} onChange={e => setToken({ ...token, pass_date: e.target.value })} /></div>
          <div><label className="label">Driver</label><input className="input" value={token.driver_name} onChange={e => setToken({ ...token, driver_name: e.target.value })} /></div>
          <div className="md:col-span-3"><div className="mb-1 flex items-center justify-between"><label className="label">Token Instructions / Notes — English / اردو</label><button type="button" className="text-xs font-semibold text-blue-600" onClick={() => setAddInstructionOpen(true)}>+ Add New</button></div><SearchableSelect className="input" value={instructionId} onChange={e => chooseInstruction(e.target.value)} searchPlaceholder="Search English or Urdu instruction..."><option value="">Search / Select Instruction</option>{instructions.map(x => <option key={x.id} value={x.id}>{x.name_en}{x.name_ur ? ` / ${x.name_ur}` : ""}</option>)}</SearchableSelect><textarea className="input mt-2 min-h-20" dir="auto" placeholder="Selected instruction appears here; extra note bhi likh sakte hain..." value={token.token_notes} onChange={e => setToken({ ...token, token_notes: e.target.value })} /></div>
        </div>

        <div className="space-y-2">
          {tokenLines.map((x, i) => <div key={x.id || `new-${i}`} className="grid grid-cols-12 gap-2"><div className="col-span-5"><SearchableSelect className="input" value={x.item_id || ""} onChange={e => chooseItem(i, e.target.value)} searchPlaceholder="Search item..."><option value="">Select Item</option>{items.map(it => <option key={it.id} value={it.id}>{itemLabel(it)}</option>)}</SearchableSelect></div><input className="input col-span-2" type="number" step="any" placeholder="Qty" value={x.requested_qty || ""} onChange={e => setTokenLines(v => v.map((a, j) => j === i ? { ...a, requested_qty: Number(e.target.value) } : a))} /><div className="col-span-2"><SearchableSelect className="input" value={x.uom} onChange={e => setTokenLines(v => v.map((a, j) => j === i ? { ...a, uom: e.target.value } : a))}>{uoms.map(u => <option key={u.id} value={u.symbol}>{u.symbol} · {u.name}</option>)}</SearchableSelect></div><div className="col-span-3 flex gap-2"><input className="input" placeholder="Remarks" value={x.remarks || ""} onChange={e => setTokenLines(v => v.map((a, j) => j === i ? { ...a, remarks: e.target.value } : a))} />{tokenLines.length > 1 && <button type="button" className="btn btn-secondary px-3" onClick={() => setTokenLines(v => v.filter((_, j) => j !== i))}>×</button>}</div></div>)}
        </div>
        <div className="flex justify-between"><button type="button" className="btn btn-secondary" onClick={() => setTokenLines(v => [...v, emptyLine()])}>+ Add Material</button><button className="btn btn-primary">{editingId ? "Save Token Changes" : "Issue & Save Token"}</button></div>
      </form>
    </Modal>

    <Modal open={addInstructionOpen} onClose={() => setAddInstructionOpen(false)} title="Add Loading Instruction / لوڈنگ ہدایت"><div className="space-y-3"><div><label className="label">English</label><input className="input" value={newInstruction.en} onChange={e => setNewInstruction({ ...newInstruction, en: e.target.value })} /></div><div><label className="label">Urdu / اردو</label><input className="input text-right" dir="rtl" value={newInstruction.ur} onChange={e => setNewInstruction({ ...newInstruction, ur: e.target.value })} /></div><div className="flex justify-end"><button type="button" className="btn btn-primary" onClick={() => void saveNewInstruction()}>Save & Use / محفوظ کریں</button></div></div></Modal>

    <Modal open={workOpen} onClose={() => setWorkOpen(false)} title={`Loading — ${selected?.pass_no || ""}`} panelClassName="!max-w-7xl !w-[97vw]"><form onSubmit={saveLoading} className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><label className="label">Loaded By / Loader Name</label><input className="input max-w-md" placeholder="Loader Name" value={loadedBy} onChange={e => setLoadedBy(e.target.value)} required /></div><button type="button" className="btn btn-secondary" onClick={() => setWorkLines(v => [...v, emptyLine()])}>+ Add Loaded Material</button></div>{workLines.map((x, i) => <div key={x.id || `new-${i}`} className="grid grid-cols-12 gap-2">{x.id ? <div className="col-span-3 p-2" dir="auto">{lineDisplay(x)}<div className="text-xs text-slate-400">Requested: {x.requested_qty} {x.uom}</div></div> : <div className="col-span-3"><SearchableSelect className="input" value={x.item_id || ""} onChange={e => chooseWorkItem(i, e.target.value)} searchPlaceholder="Search additional material..."><option value="">Select Material</option>{items.map(it => <option key={it.id} value={it.id}>{itemLabel(it)}</option>)}</SearchableSelect></div>}<input className="input col-span-2" type="number" step="any" placeholder="Actual Qty" value={x.actual_qty || ""} onChange={e => setWorkLines(v => v.map((a, j) => j === i ? { ...a, actual_qty: Number(e.target.value) } : a))} /><div className="col-span-2"><SearchableSelect className="input" value={x.warehouse_id || ""} onChange={e => setWorkLines(v => v.map((a, j) => j === i ? { ...a, warehouse_id: e.target.value || null, godown_id: null } : a))}><option value="">Warehouse</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}{w.name_urdu ? ` / ${w.name_urdu}` : ""}</option>)}</SearchableSelect></div><div className="col-span-2"><SearchableSelect className="input" value={x.godown_id || ""} onChange={e => setWorkLines(v => v.map((a, j) => j === i ? { ...a, godown_id: e.target.value || null } : a))}><option value="">Godown</option>{godowns.filter(g => g.warehouse_id === x.warehouse_id).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</SearchableSelect></div><div className="col-span-3 flex gap-2"><input className="input" placeholder="Remarks" value={x.remarks || ""} onChange={e => setWorkLines(v => v.map((a, j) => j === i ? { ...a, remarks: e.target.value } : a))} />{!x.id && <button type="button" className="btn btn-secondary px-3" onClick={() => setWorkLines(v => v.filter((_, j) => j !== i))}>×</button>}</div></div>)}<div className="flex justify-end"><button className="btn btn-primary">Save Loading & Send to Kanta</button></div></form></Modal>

    <Modal open={kantaOpen} onClose={() => setKantaOpen(false)} title={`Kanta / Weighbridge — ${selected?.pass_no || ""}`}><form onSubmit={saveKanta} className="space-y-3"><div className="grid grid-cols-3 gap-3"><input className="input" type="number" placeholder="Tare kg" value={tare} onChange={e => setTare(e.target.value)} /><input className="input" type="number" placeholder="Gross kg" value={gross} onChange={e => setGross(e.target.value)} /><input className="input bg-slate-100" value={`${net} kg Net`} readOnly /></div><input className="input" placeholder="Kanta Slip / Reference" value={weighRef} onChange={e => setWeighRef(e.target.value)} /><div className="flex justify-end"><button className="btn btn-primary">Save Kanta</button></div></form></Modal>
  </div>;
}
