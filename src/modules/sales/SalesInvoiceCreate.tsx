import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Customer, Item } from "@/types";
import { ErrorBanner, formatCurrency, Modal } from "@/components/ui";
import { QRCodeCanvas } from "qrcode.react";
import {
  ArrowLeft,
  Eye,
  FileCheck2,
  Plus,
  Printer,
  ReceiptText,
  Save,
  Trash2,
} from "lucide-react";

interface HawalaOption {
  id: string;
  invoice_no: string;
  invoice_date: string;
  reference_name: string | null;
  reference_no: string | null;
  total: number | string;
  linked_sales_order_id: string | null;
}

interface InvoiceRow {
  item_id: string;
  qty: string;
  rate: string;
  tax_percent: string;
  godown_id: string;
}

interface AccountItem {
  id: string;
  name: string;
  code?: string;
  type?: string;
  account_role?: string | null;
  detail_type?: string | null;
  is_group?: boolean;
  allow_manual_entries?: boolean;
  is_active?: boolean;
}

interface Godown {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}


interface LineDataRecord {
  item_id: string;
  qty: number | string;
  unit_price: number | string;
  tax_percent?: number | string;
  godown_id?: string | null;
}

interface ChargeAccRecord {
  charge_key: string;
  account_id?: string | null;
  cost_account_id?: string | null;
  amount?: number | string | null;
  tax_percent?: number | string | null;
  quantity?: number | string | null;
  rate?: number | string | null;
}

interface ChargeMaster {
  id: string;
  charge_key: string;
  charge_name: string;
  charge_type: string;
  revenue_account_id: string | null;
  cost_account_id: string | null;
  tax_applicable: boolean;
  service_party_required: boolean;
  is_active: boolean;
}

interface CustomerFinancialSnapshot {
  previousBalance: number;
  invoiceOutstanding: number;
  totalCustomerOutstanding: number;
  lastPaymentDate: string | null;
  lastPaymentAmount: number;
  lastPaymentMethod: string | null;
  lastPaymentAccount: string | null;
  todayReceived: number;
}

export default function SalesInvoiceCreate() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEditing = Boolean(id);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [salesPersons, setSalesPersons] = useState<AccountItem[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [salesCharges, setSalesCharges] = useState<ChargeMaster[]>([]);
  const [chargeQuantities, setChargeQuantities] = useState<Record<string, string>>({});
  const [chargeRates, setChargeRates] = useState<Record<string, string>>({});
  
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const [invoiceNo, setInvoiceNo] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [hawalaOptions, setHawalaOptions] = useState<HawalaOption[]>([]);
  const [selectedHawalaIds, setSelectedHawalaIds] = useState<string[]>([]);
  const [hawalaSearch, setHawalaSearch] = useState("");
  const [hawalaLoading, setHawalaLoading] = useState(false);

  const [salesPersonId, setSalesPersonId] = useState("");
  const [salesPerson, setSalesPerson] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [referenceName, setReferenceName] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [referenceNotes, setReferenceNotes] = useState("");
  
  const [invoiceType, setInvoiceType] = useState<"Sale Invoice" | "Cash Bill" | "Tax Invoice">("Tax Invoice"); 
  const [globalTaxPercent, setGlobalTaxPercent] = useState<string>("18");

  const [rows, setRows] = useState<InvoiceRow[]>([
    { item_id: "", qty: "0", rate: "0", tax_percent: "18", godown_id: "" },
  ]);

  const [charges, setCharges] = useState<Record<string, string>>({});
  const [chargeTaxes, setChargeTaxes] = useState<Record<string, string>>({}); // Added for charge tax %
  const [chargeAccounts, setChargeAccounts] = useState<Record<string, string>>({}); 
  const [selectedChargeKeys, setSelectedChargeKeys] = useState<string[]>([]);
  const [chargeToAdd, setChargeToAdd] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [customerSnapshot, setCustomerSnapshot] =
    useState<CustomerFinancialSnapshot | null>(null);
  const [customerSnapshotLoading, setCustomerSnapshotLoading] = useState(false);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    name: "",
    category_id: "",
    godown_id: "",
    unit: "",
    price: "0",
    cost: "0"
  });

  const generateInvoiceNo = useCallback(async (type: string) => {
    try {
      const { count } = await supabase
        .from("sales_orders")
        .select("*", { count: "exact", head: true });
      
      const nextNum = ((count ?? 0) + 1).toString().padStart(4, "0");
      const prefix = type === "Cash Bill" ? "CSH" : type === "Tax Invoice" ? "TAX" : "INV";
      setInvoiceNo(`${prefix}-${nextNum}`);
    } catch (err) {
      setInvoiceNo(`INV-${Math.floor(1000 + Math.random() * 9000)}`);
    }
  }, []);

  const fetchCustomerSnapshot = useCallback(
    async (nextCustomerId: string, asOfDate: string) => {
      if (!nextCustomerId) {
        setCustomerSnapshot(null);
        return;
      }

      setCustomerSnapshotLoading(true);
      try {
        const [agingRes, allocationRes] = await Promise.all([
          supabase
            .from("customer_invoice_aging")
            .select("*")
            .eq("customer_id", nextCustomerId),
          supabase
            .from("invoice_payment_allocations")
            .select(
              "id,sales_order_id,journal_entry_id,customer_id,allocation_date,amount,reference,notes,created_at"
            )
            .eq("customer_id", nextCustomerId)
            .order("allocation_date", { ascending: false })
            .order("created_at", { ascending: false }),
        ]);

        if (agingRes.error) throw agingRes.error;
        if (allocationRes.error) throw allocationRes.error;

        const invoices = (agingRes.data ?? []) as any[];
        const allocations = (allocationRes.data ?? []) as any[];

        const previousBalance = invoices.reduce((sum, invoice) => {
          const d = String(invoice.invoice_date || "");
          if (d && d >= asOfDate) return sum;
          return sum + Math.max(0, Number(invoice.outstanding_amount) || 0);
        }, 0);

        const totalCustomerOutstanding = invoices.reduce(
          (sum, invoice) => sum + Math.max(0, Number(invoice.outstanding_amount) || 0),
          0
        );

        let lastPaymentMethod: string | null = null;
        let lastPaymentAccount: string | null = null;
        const lastAllocation = allocations[0];

        if (lastAllocation?.journal_entry_id) {
          const [journalRes, lineRes] = await Promise.all([
            supabase
              .from("journal_entries")
              .select("id,entry_date,payment_mode")
              .eq("id", lastAllocation.journal_entry_id)
              .maybeSingle(),
            supabase
              .from("journal_lines")
              .select("entry_id,debit,credit,coa:chart_of_accounts(code,name)")
              .eq("entry_id", lastAllocation.journal_entry_id),
          ]);

          lastPaymentMethod = journalRes.data?.payment_mode || null;
          const debitLine = (lineRes.data ?? []).find(
            (line: any) => Number(line.debit) > 0 && line.coa
          );
          const coa = Array.isArray(debitLine?.coa) ? debitLine.coa[0] : debitLine?.coa;
          lastPaymentAccount = coa ? `${coa.code} — ${coa.name}` : null;
        }

        const todayKey = new Date().toISOString().slice(0, 10);
        const todayReceived = allocations.reduce((sum, allocation) =>
          String(allocation.allocation_date).slice(0, 10) === todayKey
            ? sum + (Number(allocation.amount) || 0)
            : sum, 0);

        const currentInvoice = invoices.find((invoice) => invoice.sales_order_id === id);

        setCustomerSnapshot({
          previousBalance,
          invoiceOutstanding: Math.max(0, Number(currentInvoice?.outstanding_amount) || 0),
          totalCustomerOutstanding,
          lastPaymentDate: lastAllocation ? String(lastAllocation.allocation_date) : null,
          lastPaymentAmount: lastAllocation ? Number(lastAllocation.amount) || 0 : 0,
          lastPaymentMethod,
          lastPaymentAccount,
          todayReceived,
        });
      } catch (snapshotError) {
        console.error("Customer financial snapshot error:", snapshotError);
        setCustomerSnapshot(null);
      } finally {
        setCustomerSnapshotLoading(false);
      }
    },
    [id]
  );

  const fetchData = useCallback(async () => {
    try {
      const sessionRes = await supabase.auth.getSession();
      const userId = sessionRes.data.session?.user?.id ?? "";

      const [custRes, itemRes, accRes, salesPersonRes, godownRes, catRes, chargeMasterRes] =
        await Promise.all([
          supabase.from("customers").select("*").eq("is_active", true).order("name"),
          supabase.from("items").select("*").order("name"),
          supabase
            .from("chart_of_accounts")
            .select(
              "id, name, code, type, account_role, detail_type, is_group, allow_manual_entries, is_active"
            )
            .order("code"),
          supabase
            .from("chart_of_accounts")
            .select(
              "id, name, code, type, account_role, detail_type, is_group, allow_manual_entries, is_active"
            )
            .eq("account_role", "sales_person")
            .eq("is_active", true)
            .eq("is_group", false)
            .order("name"),
          supabase.from("godowns").select("id, name").order("name"),
          supabase.from("categories").select("id, name").order("name"),
          supabase
            .from("charge_master")
            .select(
              "id, charge_key, charge_name, charge_type, revenue_account_id, cost_account_id, tax_applicable, service_party_required, is_active"
            )
            .eq("user_id", userId)
            .eq("is_active", true)
            .order("charge_name"),
        ]);

      
      if (custRes.error) throw custRes.error;
      if (itemRes.error) throw itemRes.error;
      if (accRes.error) throw accRes.error;
      if (salesPersonRes.error) throw salesPersonRes.error;
      if (godownRes.error) {
        throw new Error(
          `Godown load failed: ${godownRes.error.message}. ` +
          `Please check the godowns table/RLS policy.`
        );
      }
      if (catRes.error) throw catRes.error;
      if (chargeMasterRes.error) throw chargeMasterRes.error;

      const loadedGodowns = (godownRes.data ?? []) as Godown[];

      setCustomers(custRes.data ?? []);
      setItems(itemRes.data ?? []);
      setAccounts((accRes.data ?? []) as AccountItem[]);

      // Sales Person master is the COA with account_role = sales_person.
      // It is intentionally separate from Service Charges.
      setSalesPersons((salesPersonRes.data ?? []) as AccountItem[]);
      setGodowns(loadedGodowns);
      setCategories(catRes.data ?? []);
      setSalesCharges((chargeMasterRes.data ?? []) as ChargeMaster[]);

      // If a godown exists, automatically use the first one for new invoice rows.
      // Existing/editing rows are never overwritten.
      if (!isEditing && loadedGodowns.length > 0) {
        setRows((currentRows) =>
          currentRows.map((row) => ({
            ...row,
            godown_id: row.godown_id || loadedGodowns[0].id,
          }))
        );
        setNewItemForm((current) => ({
          ...current,
          godown_id: current.godown_id || loadedGodowns[0].id,
        }));
      }

      if (loadedGodowns.length === 0) {
        setError(
          "No godown found. Please create a godown in Godown Master first, " +
          "or check the RLS policy on the godowns table."
        );
      }

      if (isEditing && id) {
        const { data: orderData, error: orderErr } = await supabase
          .from("sales_orders")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (orderErr) throw orderErr;
        if (orderData) {
          if (orderData.status === "posted" || orderData.status === "closed") {
            setIsLocked(true);
          }
          setInvoiceNo(orderData.order_no || "");
          setCustomerId(orderData.customer_id || "");
          setSalesPersonId(orderData.sales_person_account_id || "");
          setSalesPerson(orderData.sales_person || "");
          setInvoiceDate(orderData.order_date || new Date().toISOString().slice(0, 10));
          setReferenceName(orderData.reference_name || "");
          setReferenceNo(orderData.reference_no || "");
          setReferenceNotes(orderData.reference_notes || "");
          if (orderData.invoice_type) {
            setInvoiceType(orderData.invoice_type);
          }
          if (orderData.tax_percent !== undefined) {
            setGlobalTaxPercent(String(orderData.tax_percent));
          }

          const loadedCharges: Record<string, string> = {};
          const activeKeys: string[] = [];

          // Map UI charge keys to the real sales_orders database columns.
          const legacyChargeMap: Record<string, string> = {
            loading: "loading_charge",
            cutting: "cutting_charge",
            transport: "transport_charge",
            unloading: "unloading_charge",
            labour: "labour_charge",
            handling: "handling_charge",
            other: "other_charge",
          };

          Object.entries(legacyChargeMap).forEach(([chargeKey, dbColumn]) => {
            const value = orderData[dbColumn];

            if (
              value !== undefined &&
              value !== null &&
              Number(value) !== 0
            ) {
              loadedCharges[chargeKey] = String(value);
              activeKeys.push(chargeKey);
            }
          });

          setCharges(loadedCharges);
          setSelectedChargeKeys(activeKeys);
        }

        const { data: lineData } = await supabase
          .from("sales_order_lines")
          .select("*")
          .eq("order_id", id);

        if (lineData && lineData.length > 0) {
          setRows(
            lineData.map((l: LineDataRecord) => ({
              item_id: l.item_id,
              qty: String(l.qty),
              rate: String(l.unit_price),
              tax_percent: l.tax_percent !== undefined ? String(l.tax_percent) : "18",
              godown_id: l.godown_id ? String(l.godown_id) : "",
            }))
          );
        }

        const { data: chargeAccData } = await supabase
          .from("sales_order_charges")
          .select("*")
          .eq("order_id", id);

        if (chargeAccData) {
          const accMap: Record<string, string> = {};
          const taxMap: Record<string, string> = {};
          const qtyMap: Record<string, string> = {};
          const rateMap: Record<string, string> = {};
          const loadedChargeKeys: string[] = [];
          const loadedAmounts: Record<string, string> = {};

          (chargeAccData as ChargeAccRecord[]).forEach((wc) => {
            const charge = salesCharges.find((item) => item.charge_key === wc.charge_key);
            const accId = wc.account_id || charge?.revenue_account_id || null;

            if (accId) accMap[wc.charge_key] = accId;
            loadedChargeKeys.push(wc.charge_key);

            if (wc.tax_percent !== undefined && wc.tax_percent !== null) {
              const tax = Number(wc.tax_percent) || 0;
              taxMap[wc.charge_key] = String(tax);

              // Older records store charge amount including tax.
              if (wc.amount !== undefined && wc.amount !== null) {
                const gross = Number(wc.amount) || 0;
                const base = tax > 0 ? gross / (1 + tax / 100) : gross;
                loadedAmounts[wc.charge_key] = String(base);
              }
            } else if (wc.amount !== undefined && wc.amount !== null) {
              loadedAmounts[wc.charge_key] = String(Number(wc.amount) || 0);
            }

            if (wc.quantity !== undefined && wc.quantity !== null) {
              qtyMap[wc.charge_key] = String(wc.quantity);
            }
            if (wc.rate !== undefined && wc.rate !== null) {
              rateMap[wc.charge_key] = String(wc.rate);
            }
          });

          setSelectedChargeKeys((prev) => [
            ...new Set([...prev, ...loadedChargeKeys]),
          ]);
          setCharges((prev) => ({ ...prev, ...loadedAmounts }));
          setChargeAccounts(accMap);
          setChargeTaxes(taxMap);
          setChargeQuantities(qtyMap);
          setChargeRates(rateMap);
        }

      } else if (!isEditing && !invoiceNo) {
        await generateInvoiceNo(invoiceType);
      }
    } catch (err: any) {
      setError("Failed to load form data: " + err.message);
    }
  }, [id, isEditing, salesCharges, invoiceNo, invoiceType, generateInvoiceNo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!customerId) {
      setCustomerSnapshot(null);
      return;
    }
    void fetchCustomerSnapshot(customerId, invoiceDate);
  }, [customerId, invoiceDate, fetchCustomerSnapshot]);

  const handleTypeChange = (newType: "Sale Invoice" | "Cash Bill" | "Tax Invoice") => {
    setInvoiceType(newType);
    if (!isEditing) {
      generateInvoiceNo(newType);
    }
  };

  const addRow = () => {
    if (isLocked) return;
    setRows([
      ...rows,
      {
        item_id: "",
        qty: "0",
        rate: "0",
        tax_percent: globalTaxPercent,
        godown_id: godowns[0]?.id ?? "",
      },
    ]);
  };

  const removeRow = (index: number) => {
    if (isLocked) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof InvoiceRow, value: string) => {
    if (isLocked) return;
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "item_id") {
      const item = items.find((i) => i.id === value);
      if (item) {
        updated[index].rate = String(item.price || 0);
      }
    }
    setRows(updated);
  };

  const handleAddChargeRow = () => {
    if (!chargeToAdd || selectedChargeKeys.includes(chargeToAdd)) return;
    setSelectedChargeKeys([...selectedChargeKeys, chargeToAdd]);
    setChargeTaxes((prev) => ({ ...prev, [chargeToAdd]: globalTaxPercent }));
    setChargeQuantities((prev) => ({ ...prev, [chargeToAdd]: prev[chargeToAdd] ?? "1" }));
    setChargeRates((prev) => ({ ...prev, [chargeToAdd]: prev[chargeToAdd] ?? "0" }));
    setChargeToAdd("");
  };

  const handleRemoveChargeRow = (key: string) => {
    if (isLocked) return;
    setSelectedChargeKeys(selectedChargeKeys.filter((k) => k !== key));
    setCharges({ ...charges, [key]: "0" });
    const updatedAccs = { ...chargeAccounts };
    delete updatedAccs[key];
    setChargeAccounts(updatedAccs);
    const updatedTaxes = { ...chargeTaxes };
    delete updatedTaxes[key];
    setChargeTaxes(updatedTaxes);
    const updatedQty = { ...chargeQuantities };
    delete updatedQty[key];
    setChargeQuantities(updatedQty);
    const updatedRates = { ...chargeRates };
    delete updatedRates[key];
    setChargeRates(updatedRates);
  };

  // LOAD HAWALA OPTIONS
  useEffect(() => {
    const loadHawalaOptions = async () => {
      if (!customerId) {
        setHawalaOptions([]);
        setSelectedHawalaIds([]);
        return;
      }

      setHawalaLoading(true);

      const { data, error: hawalaError } = await supabase.rpc(
        "get_available_hawala_invoices",
        {
          p_customer_id: customerId,
          p_order_id: id || null,
        }
      );

      if (hawalaError) {
        console.error("Hawala load error:", hawalaError);
        setHawalaOptions([]);
      } else {
        const list = (data ?? []) as HawalaOption[];
        setHawalaOptions(list);

        if (id) {
          setSelectedHawalaIds(
            list
              .filter((row) => row.linked_sales_order_id === id)
              .map((row) => row.id)
          );
        }
      }

      setHawalaLoading(false);
    };

    void loadHawalaOptions();
  }, [customerId, id]);

  const handleSaveQuickItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newItemForm.name.trim();
    if (!name) return;

    const payload = {
      name,
      category_id: newItemForm.category_id || null,
      godown_id: newItemForm.godown_id || null,
      unit: newItemForm.unit || null,
      price: parseFloat(newItemForm.price) || 0,
      cost: parseFloat(newItemForm.cost) || 0,
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
    };

    const { data, error: insErr } = await supabase
      .from("items")
      .insert(payload)
      .select()
      .single();

    if (insErr) {
      setError(insErr.message);
      return;
    }

    if (data) {
      setItems((prev) => [...prev, data]);
      const emptyIdx = rows.findIndex((r) => !r.item_id);
      const targetIdx = emptyIdx !== -1 ? emptyIdx : rows.length - 1;
      updateRow(targetIdx, "item_id", data.id);
    }

    setNewItemForm({ name: "", category_id: "", godown_id: "", unit: "", price: "0", cost: "0" });
    setItemModalOpen(false);
  };

  const rowsSubtotal = rows.reduce((sum, r) => {
    return sum + (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0);
  }, 0);

  const totalItemTaxAmount = rows.reduce((sum, r) => {
    if (invoiceType !== "Tax Invoice") return 0;
    const lineAmt = (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0);
    const taxP = parseFloat(r.tax_percent) || 0;
    return sum + (lineAmt * taxP) / 100;
  }, 0);

  const chargesSubtotal = salesCharges
    .filter((ct) => selectedChargeKeys.includes(ct.charge_key))
    .reduce((sum, ct) => sum + (parseFloat(charges[ct.charge_key]) || 0), 0);

  const totalChargeTaxAmount = salesCharges
    .filter((ct) => selectedChargeKeys.includes(ct.charge_key))
    .reduce((sum, ct) => {
      if (invoiceType !== "Tax Invoice") return 0;
      const chargeAmt = parseFloat(charges[ct.charge_key]) || 0;
      const taxP = parseFloat(chargeTaxes[ct.charge_key]) || 0;
      return sum + (chargeAmt * taxP) / 100;
    }, 0);

  const selectedHawalaInvoices = hawalaOptions.filter((hawala) =>
    selectedHawalaIds.includes(hawala.id)
  );

  const selectedHawalaTotal = selectedHawalaInvoices.reduce(
    (sum, hawala) => sum + Number(hawala.total || 0),
    0
  );

  const normalInvoiceTotal =
    rowsSubtotal +
    totalItemTaxAmount +
    chargesSubtotal +
    totalChargeTaxAmount;

  const grandTotal =
    normalInvoiceTotal + selectedHawalaTotal;
  const selectedCustomerObj = customers.find((c) => c.id === customerId);
  const selectedSalesPersonObj = salesPersons.find((p) => p.id === salesPersonId);

  const currentInvoiceBalance = isEditing
    ? (customerSnapshot?.invoiceOutstanding ?? grandTotal)
    : grandTotal;
  const projectedCustomerBalance = isEditing
    ? (customerSnapshot?.totalCustomerOutstanding ?? grandTotal)
    : Math.max(0, (customerSnapshot?.previousBalance ?? 0) + grandTotal - (customerSnapshot?.todayReceived ?? 0));
  const afterLatestPaymentBalance = isEditing
    ? (customerSnapshot?.totalCustomerOutstanding ?? projectedCustomerBalance)
    : Math.max(0, (customerSnapshot?.previousBalance ?? 0) - (customerSnapshot?.todayReceived ?? 0));

  const invoiceQrPayload = JSON.stringify({
    invoice_no: invoiceNo,
    invoice_type: invoiceType,
    invoice_date: invoiceDate,
    customer: selectedCustomerObj?.name || "",
    salesperson: selectedSalesPersonObj?.name || "",
    subtotal: Number(rowsSubtotal.toFixed(2)),
    item_tax: Number(totalItemTaxAmount.toFixed(2)),
    charges: Number(chargesSubtotal.toFixed(2)),
    charge_tax: Number(totalChargeTaxAmount.toFixed(2)),
    net_total: Number(grandTotal.toFixed(2)),
    previous_balance: Number((customerSnapshot?.previousBalance ?? 0).toFixed(2)),
    last_payment: Number((customerSnapshot?.lastPaymentAmount ?? 0).toFixed(2)),
    last_payment_date: customerSnapshot?.lastPaymentDate || null,
    received_today: Number((customerSnapshot?.todayReceived ?? 0).toFixed(2)),
    current_invoice_balance: Number(currentInvoiceBalance.toFixed(2)),
    projected_balance: Number(projectedCustomerBalance.toFixed(2)),
  });

  const handleSaveInvoice = async () => {
    if (isLocked) {
      setError("Posted or closed invoices are locked and cannot be modified.");
      return;
    }

    setSaving(true);
    setError(null);

    if (!customerId) {
      setError("Please select a customer.");
      setSaving(false);
      return;
    }

    const validRows = rows.filter((r) => r.item_id && parseFloat(r.qty) > 0);
    if (validRows.length === 0 && selectedHawalaIds.length === 0) {
      setError(
        "Add at least one item OR select a Hawala invoice. / کم از کم ایک آئٹم یا حوالہ انوائس منتخب کریں۔"
      );
      setSaving(false);
      return;
    }

    const missingGodown = validRows.find((r) => !r.godown_id);
    if (missingGodown) {
      setError("Select a godown for every invoice item. / ہر آئٹم کے لیے گودام منتخب کریں۔");
      setSaving(false);
      return;
    }

    // Map UI charge keys to the real sales_orders database columns.
    const chargeColumnMap: Record<string, string> = {
      loading: "loading_charge",
      cutting: "cutting_charge",
      transport: "transport_charge",
      unloading: "unloading_charge",
      labour: "labour_charge",
      handling: "handling_charge",
      other: "other_charge",
    };

    const chargePayload: Record<string, number> = {};

    Object.entries(chargeColumnMap).forEach(([chargeKey, dbColumn]) => {
      const val = Number(charges[chargeKey]) || 0;

      chargePayload[dbColumn] =
        selectedChargeKeys.includes(chargeKey) && val > 0
          ? val
          : 0;
    });

    try {
      let orderId = id;

      const orderDataPayload = {
        customer_id: customerId,
        sales_person: salesPerson || null,
        sales_person_account_id: salesPersonId || null,
        order_date: invoiceDate,
        status: "draft",
        total: grandTotal,
        reference_name: referenceName.trim() || null,
        reference_no: referenceNo.trim() || null,
        reference_notes: referenceNotes.trim() || null,
        invoice_type: invoiceType,
        tax_percent: invoiceType === "Tax Invoice" ? parseFloat(globalTaxPercent) || 0 : 0,
        ...chargePayload,
      };

      if (isEditing && id) {
        const { error: updateErr } = await supabase
          .from("sales_orders")
          .update(orderDataPayload)
          .eq("id", id);

        if (updateErr) throw updateErr;

        await supabase.from("sales_order_lines").delete().eq("order_id", id);
        await supabase.from("sales_order_charges").delete().eq("order_id", id);
      } else {
        const { data: order, error: orderError } = await supabase
          .from("sales_orders")
          .insert({
            order_no: invoiceNo,
            ...orderDataPayload,
          })
          .select()
          .single();

        if (orderError) throw orderError;
        orderId = order.id;
      }

      const linePayloads = validRows.map((r) => ({
        order_id: orderId,
        item_id: r.item_id,
        qty: parseFloat(r.qty) || 0,
        unit_price: parseFloat(r.rate) || 0,
        tax_percent: invoiceType === "Tax Invoice" ? parseFloat(r.tax_percent) || 0 : 0,
        godown_id: r.godown_id || null,
        line_total: (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0),
      }));

      if (linePayloads.length > 0) {
        const { error: linesError } = await supabase
          .from("sales_order_lines")
          .insert(linePayloads);

        if (linesError) throw linesError;
      }

      const chargeAccountPayloads = salesCharges
        .filter((ct) => selectedChargeKeys.includes(ct.charge_key) && (Number(charges[ct.charge_key]) || 0) > 0)
        .map((ct) => {
          const enteredAmount = Number(charges[ct.charge_key]) || 0;
          const cTaxP = invoiceType === "Tax Invoice" && ct.tax_applicable
            ? Number(chargeTaxes[ct.charge_key] ?? globalTaxPercent) || 0
            : 0;
          return {
            order_id: orderId,
            charge_key: ct.charge_key,
            charge_label: ct.charge_name,
            // Store the charge EXCLUDING VAT.
            // tax_percent is stored separately so the posting engine
            // recognizes Output VAT exactly once.
            amount: enteredAmount,
            tax_percent: cTaxP,
            account_id: ct.revenue_account_id,
            cost_account_id: ct.cost_account_id,
            cost_amount: 0,
          };
        });

      if (chargeAccountPayloads.length > 0) {
        const { error: chargeInsertError } = await supabase
          .from("sales_order_charges")
          .insert(chargeAccountPayloads);

        if (chargeInsertError) throw chargeInsertError;
      }

      if (!orderId) {
        throw new Error("Sales Invoice ID was not created.");
      }

      const { error: hawalaLinkError } = await supabase.rpc(
        "replace_sales_order_hawala_invoices",
        {
          p_order_id: orderId,
          p_hawala_invoice_ids: selectedHawalaIds,
        }
      );

      if (hawalaLinkError) throw hawalaLinkError;

      setSaving(false);
      navigate(`/sales/${orderId}`);
    } catch (err: any) {
      setError(err.message || "Failed to save invoice.");
      setSaving(false);
    }
  };

  const handleDeleteInvoice = async () => {
    if (isLocked) {
      setError("Posted or closed invoices cannot be deleted for audit compliance.");
      return;
    }
    if (!id) return;
    if (!confirm("Are you sure you want to delete this draft invoice?")) return;

    try {
      setSaving(true);
      await supabase.from("sales_order_lines").delete().eq("order_id", id);
      await supabase.from("sales_order_charges").delete().eq("order_id", id);
      const { error: delErr } = await supabase.from("sales_orders").delete().eq("id", id);
      if (delErr) throw delErr;
      navigate("/sales");
    } catch (err: any) {
      setError("Failed to delete: " + err.message);
      setSaving(false);
    }
  };

  const handlePrint = () => {
    const printContent = document.getElementById("printable-invoice-area");
    if (!printContent) return;

    const WinPrint = window.open("", "", "width=1000,height=800");
    if (!WinPrint) return;

    WinPrint.document.write(`
      <html>
        <head>
          <title>${invoiceType} - ${invoiceNo}</title>
          <meta charset="UTF-8" />
          <style>
            @page { size: A4; margin: 12mm; }
            * { box-sizing: border-box; }
            body { margin: 0; background: #fff; color: #1f2937; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
            #printable-invoice-area { width: 100%; max-width: 100%; margin: 0 auto; padding: 4px; }
            .flex { display: flex; }
            .items-start { align-items: flex-start; }
            .justify-between { justify-content: space-between; }
            .gap-5 { gap: 20px; }
            .gap-4 { gap: 16px; }
            .gap-3 { gap: 12px; }
            .grid { display: grid; }
            .grid-cols-2 { grid-template-columns: 1fr 1fr; }
            .mt-6 { margin-top: 24px; }
            .mt-5 { margin-top: 20px; }
            .mt-4 { margin-top: 16px; }
            .mt-3 { margin-top: 12px; }
            .mt-2 { margin-top: 8px; }
            .mt-1 { margin-top: 4px; }
            .mb-2 { margin-bottom: 8px; }
            .p-3 { padding: 12px; }
            .p-5 { padding: 20px; }
            .px-2 { padding-left: 8px; padding-right: 8px; }
            .py-2 { padding-top: 8px; padding-bottom: 8px; }
            .pt-2 { padding-top: 8px; }
            .pt-3 { padding-top: 12px; }
            .pb-1 { padding-bottom: 4px; }
            .pb-2 { padding-bottom: 8px; }
            .border { border: 1px solid #cbd5e1; }
            .border-b { border-bottom: 1px solid #cbd5e1; }
            .border-t { border-top: 1px solid #cbd5e1; }
            .border-2 { border-width: 2px; }
            .rounded { border-radius: 4px; }
            .font-bold { font-weight: 700; }
            .font-semibold { font-weight: 600; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .text-xl { font-size: 20px; }
            .text-lg { font-size: 16px; }
            .text-sm { font-size: 12px; }
            .text-xs { font-size: 12px; }
            .text-\[10px\] { font-size: 12px; }
            .text-\[9px\] { font-size: 12px; }
            .text-\[8px\] { font-size: 12px; }
            .text-slate-400 { color: #94a3b8; }
            .text-slate-500 { color: #64748b; }
            .text-slate-700 { color: #334155; }
            .text-rose-700 { color: #be123c; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #cbd5e1; padding: 7px 8px; vertical-align: middle; }
            th { background: #f1f5f9; font-weight: 700; }
            .qr-box canvas { display: block; }
            #printable-invoice-area > .border-b-2 { border-bottom: 2px solid #0f172a; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          ${printContent.outerHTML}
        </body>
      </html>
    `);
    WinPrint.document.close();
    WinPrint.focus();
    setTimeout(() => {
      WinPrint.print();
      WinPrint.close();
    }, 500);
  };

  return (
    <div className="space-y-3">
      <section className="flex flex-col gap-3 border-b border-slate-200 pb-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate("/sales")}
            className="mb-1 inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-blue-700"
          >
            <ArrowLeft className="h-3 w-3" />
            Sales Invoices
          </button>

          <div className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-blue-600" />
            <h1 className="text-lg font-semibold text-slate-900">
              {isEditing
                ? `${invoiceType} · ${invoiceNo}`
                : `New ${invoiceType}`}
            </h1>
          </div>

          <p className="mt-0.5 text-[12px] text-slate-500">
            {isLocked
              ? "Posted or closed invoice is locked to preserve accounting and stock integrity."
              : "Prepare invoice lines, taxes and charges. Posting is completed from the invoice detail screen."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {isEditing && !isLocked && (
            <button
              type="button"
              onClick={handleDeleteInvoice}
              className="btn-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Draft
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            className="btn-secondary"
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </button>

          {!isLocked && (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveInvoice()}
                className="btn-secondary"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save Draft"}
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveInvoice()}
                className="btn-primary"
              >
                <FileCheck2 className="h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save & Continue"}
              </button>
            </>
          )}
        </div>
      </section>

      {error && <ErrorBanner message={error} />}

      {isLocked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          This invoice is posted/closed and locked. Editing is disabled for audit compliance.
        </div>
      )}

      <form
        onSubmit={(event) => event.preventDefault()}
        className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]"
      >
        <div className="space-y-3">
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3 py-2.5">
              <div className="text-[12px] font-semibold text-slate-800">
                Invoice Information
              </div>
              <div className="mt-0.5 text-[12px] text-slate-400">
                Customer, invoice type, tax and salesperson details
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className="label">Invoice Type / انوائس قسم</label>
                <select
                  className="input"
                  disabled={isLocked}
                  value={invoiceType}
                  onChange={(event) =>
                    handleTypeChange(event.target.value as any)
                  }
                >
                  <option value="Sale Invoice">Sale Invoice (Credit) / ادھار فروخت انوائس</option>
                  <option value="Cash Bill">Cash Bill (Cash) / نقد بل</option>
                  <option value="Tax Invoice">Tax Invoice (GST/VAT) / ٹیکس انوائس</option>
                </select>
              </div>

              <div>
                <label className="label">Invoice No. / انوائس نمبر</label>
                <input
                  className="input bg-slate-50 font-semibold"
                  disabled
                  value={invoiceNo}
                />
              </div>

              <div>
                <label className="label">Invoice Date / انوائس تاریخ</label>
                <input
                  className="input"
                  type="date"
                  disabled={isLocked}
                  required
                  value={invoiceDate}
                  onChange={(event) => setInvoiceDate(event.target.value)}
                />
              </div>

              <div>
                <label className="label">Customer / گاہک</label>
                <select
                  className="input"
                  disabled={isLocked}
                  required
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                >
                  <option value="">— Select Customer / گاہک منتخب کریں —</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>

<div>
                <label className="label">
                  Reference Name / حوالہ نام
                </label>
                <input
                  className="input"
                  disabled={isLocked}
                  value={referenceNo}
                  onChange={(event) => setReferenceNo(event.target.value)}
                  placeholder="e.g. Ali / احمد"
                />
              </div>

<div>
                <label className="label">
                  Sales Person / سیلز پرسن
                </label>
                <select
                  className="input"
                  disabled={isLocked}
                  value={salesPersonId}
                  onChange={(event) => {
                    const selectedId = event.target.value;
                    const person = salesPersons.find((item) => item.id === selectedId);
                    setSalesPersonId(selectedId);
                    setSalesPerson(person?.name || "");
                  }}
                >
                  <option value="">— Select Sales Person / سیلز پرسن منتخب کریں —</option>
                  {salesPersons.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>

              {invoiceType === "Tax Invoice" && (
                <div>
                  <label className="label">Default Tax Rate (%) / ڈیفالٹ ٹیکس ریٹ</label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    disabled={isLocked}
                    value={globalTaxPercent}
                    onChange={(event) => {
                      const value = event.target.value;

                      setGlobalTaxPercent(value);
                      setRows(
                        rows.map((row) => ({
                          ...row,
                          tax_percent: value,
                        }))
                      );
                      setChargeTaxes(
                        Object.keys(chargeTaxes).reduce(
                          (acc, key) => ({
                            ...acc,
                            [key]: value,
                          }),
                          {}
                        )
                      );
                    }}
                    placeholder="e.g. 18"
                  />
                </div>
              )}
            </div>
          </section>

          {/* HAWALA-INVOICE-SELECTION-BOX */}
          {customerId && (
            <section className="overflow-hidden rounded-lg border-2 border-blue-300 bg-white">
              <div className="border-b border-blue-200 bg-blue-50 px-3 py-3">
                <div className="text-[13px] font-bold text-blue-900">
                  Select Consolidated / Hawala Invoice / حوالہ انوائس منتخب کریں
                </div>
                <div className="mt-1 text-[12px] text-blue-700">
                  Select one or more posted Hawala invoices to add into this Main Sales Invoice.
                </div>
              </div>

              <div className="p-3">
                <label className="label">
                  Search Hawala Invoice / حوالہ انوائس تلاش کریں
                </label>

                <input
                  className="input mb-3"
                  value={hawalaSearch}
                  onChange={(e) => setHawalaSearch(e.target.value)}
                  placeholder="Type Hawala No. or Reference..."
                  disabled={isLocked}
                />

                {hawalaLoading ? (
                  <div className="rounded border border-slate-200 p-4 text-center text-[12px] text-slate-500">
                    Loading Hawala invoices...
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto rounded border border-slate-200">
                    {hawalaOptions
                      .filter((h) => {
                        const q = hawalaSearch.trim().toLowerCase();

                        if (!q) return true;

                        return [
                          h.invoice_no,
                          h.invoice_date,
                          h.reference_name,
                          h.reference_no,
                        ].some((v) =>
                          String(v ?? "").toLowerCase().includes(q)
                        );
                      })
                      .map((h) => {
                        const selected = selectedHawalaIds.includes(h.id);

                        return (
                          <label
                            key={h.id}
                            className={`flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-3 ${
                              selected ? "bg-blue-50" : "hover:bg-slate-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={isLocked}
                              onChange={() =>
                                setSelectedHawalaIds((current) =>
                                  current.includes(h.id)
                                    ? current.filter((x) => x !== h.id)
                                    : [...current, h.id]
                                )
                              }
                            />

                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-slate-900">
                                {h.invoice_no}
                              </div>

                              <div className="text-[12px] text-slate-500">
                                {h.reference_name || "No Reference"}
                                {h.reference_no ? ` · ${h.reference_no}` : ""}
                                {` · ${h.invoice_date}`}
                              </div>
                            </div>

                            <div className="font-bold text-blue-700">
                              {formatCurrency(Number(h.total || 0))}
                            </div>
                          </label>
                        );
                      })}

                    {hawalaOptions.length === 0 && (
                      <div className="p-5 text-center text-[12px] text-slate-400">
                        No posted unused Hawala invoices available for this customer.
                        / اس کسٹمر کے لیے کوئی دستیاب حوالہ انوائس نہیں۔
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded bg-slate-50 px-3 py-2">
                    <div className="text-[12px] uppercase tracking-wide text-slate-400">
                      Selected Invoices / منتخب انوائسز
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-800">
                      {selectedHawalaIds.length}
                    </div>
                  </div>

                  <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-right">
                    <div className="text-[12px] uppercase tracking-wide text-blue-500">
                      Selected Hawala Total / حوالہ کل
                    </div>
                    <div className="mt-1 text-base font-bold text-blue-700">
                      {formatCurrency(selectedHawalaTotal)}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {customerId && (
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="text-[12px] font-semibold text-slate-800">Customer Financial Position / کسٹمر مالی پوزیشن</div>
                <div className="mt-0.5 text-[12px] text-slate-400">Previous balance, latest payment and projected balance / سابقہ بقایا، آخری ادائیگی اور متوقع بقایا</div>
              </div>
              {customerSnapshotLoading ? (
                <div className="px-3 py-4 text-[12px] text-slate-400">Loading customer ledger position… / کسٹمر کھاتہ لوڈ ہو رہا ہے…</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-5">
                  <div className="border-b border-r border-slate-100 p-3 md:border-b-0">
                    <div className="text-[12px] uppercase tracking-wide text-slate-400">Previous Balance / سابقہ بقایا</div>
                    <div className="mt-1 text-sm font-bold text-amber-700">{formatCurrency(customerSnapshot?.previousBalance ?? 0)}</div>
                  </div>
                  <div className="border-b border-r border-slate-100 p-3 md:border-b-0">
                    <div className="text-[12px] uppercase tracking-wide text-slate-400">Last Payment / آخری ادائیگی</div>
                    <div className="mt-1 text-sm font-bold text-emerald-700">{formatCurrency(customerSnapshot?.lastPaymentAmount ?? 0)}</div>
                    <div className="mt-0.5 text-[12px] text-slate-400">{customerSnapshot?.lastPaymentDate || "No payment / کوئی ادائیگی نہیں"}</div>
                  </div>
                  <div className="border-b border-r border-slate-100 p-3 md:border-b-0">
                    <div className="text-[12px] uppercase tracking-wide text-slate-400">Received Today / آج وصولی</div>
                    <div className="mt-1 text-sm font-bold text-blue-700">{formatCurrency(customerSnapshot?.todayReceived ?? 0)}</div>
                  </div>
                  <div className="border-b border-r border-slate-100 p-3 md:border-b-0">
                    <div className="text-[12px] uppercase tracking-wide text-slate-400">Invoice Balance / موجودہ بل بقایا</div>
                    <div className="mt-1 text-sm font-bold text-slate-800">{formatCurrency(currentInvoiceBalance)}</div>
                  </div>
                  <div className="p-3">
                    <div className="text-[12px] uppercase tracking-wide text-slate-400">Projected Balance / متوقع بقایا</div>
                    <div className="mt-1 text-sm font-bold text-rose-700">{formatCurrency(projectedCustomerBalance)}</div>
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[12px] font-semibold text-slate-800">
                  Invoice Items
                </div>
                <div className="mt-0.5 text-[12px] text-slate-400">
                  Products, quantity, selling rate and tax
                </div>
              </div>

              {!isLocked && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setItemModalOpen(true)}
                    className="btn-secondary"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New Item
                  </button>

                  <button
                    type="button"
                    onClick={addRow}
                    className="btn-secondary"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Row
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[12px]">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="w-[36%] px-3 py-2 text-left">Item / آئٹم</th>
                    <th className="w-[18%] px-2 py-2 text-left">
                      Godown / گودام
                    </th>
                    <th className="w-[14%] px-2 py-2 text-right">
                      Qty
                    </th>
                    <th className="w-[15%] px-2 py-2 text-right">
                      Rate
                    </th>
                    {invoiceType === "Tax Invoice" && (
                      <th className="w-[13%] px-2 py-2 text-right">
                        Tax %
                      </th>
                    )}
                    <th className="w-[18%] px-2 py-2 text-right">Amount / رقم</th>
                    <th className="w-[4%] px-2 py-2" />
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row, index) => {
                    const lineAmount =
                      (parseFloat(row.qty) || 0) *
                      (parseFloat(row.rate) || 0);

                    const lineTax =
                      invoiceType === "Tax Invoice"
                        ? (lineAmount *
                            (parseFloat(row.tax_percent) || 0)) /
                          100
                        : 0;

                    const lineTotal = lineAmount + lineTax;

                    return (
                      <tr
                        key={index}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="px-3 py-2">
                          <select
                            className="input"
                            disabled={isLocked}
                            value={row.item_id}
                            onChange={(event) =>
                              updateRow(
                                index,
                                "item_id",
                                event.target.value
                              )
                            }
                          >
                            <option value="">— Select item —</option>
                            {items.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                                {item.sku ? ` · ${item.sku}` : ""}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="px-2 py-2">
                          <select
                            className="input"
                            disabled={isLocked}
                            value={row.godown_id}
                            onChange={(event) =>
                              updateRow(index, "godown_id", event.target.value)
                            }
                          >
                            <option value="">— Select godown —</option>
                            {godowns.map((godown) => (
                              <option key={godown.id} value={godown.id}>
                                {godown.name}
                              </option>
                            ))}
                          </select>
                          {godowns.length === 0 && (
                            <div className="mt-1 text-[12px] text-rose-600">
                              No godown loaded. Create one in Godown Master and refresh.
                            </div>
                          )}
                        </td>

                        <td className="px-2 py-2">
                          <input
                            className="input text-right"
                            disabled={isLocked}
                            type="number"
                            step="0.01"
                            value={row.qty}
                            onChange={(event) =>
                              updateRow(
                                index,
                                "qty",
                                event.target.value
                              )
                            }
                          />
                        </td>

                        <td className="px-2 py-2">
                          <input
                            className="input text-right"
                            disabled={isLocked}
                            type="number"
                            step="0.01"
                            value={row.rate}
                            onChange={(event) =>
                              updateRow(
                                index,
                                "rate",
                                event.target.value
                              )
                            }
                          />
                        </td>

                        {invoiceType === "Tax Invoice" && (
                          <td className="px-2 py-2">
                            <input
                              className="input text-right"
                              disabled={isLocked}
                              type="number"
                              step="0.01"
                              value={row.tax_percent}
                              onChange={(event) =>
                                updateRow(
                                  index,
                                  "tax_percent",
                                  event.target.value
                                )
                              }
                            />
                          </td>
                        )}

                        <td className="px-2 py-2 text-right">
                          <div className="font-semibold text-slate-800">
                            {formatCurrency(lineTotal)}
                          </div>
                          {invoiceType === "Tax Invoice" && (
                            <div className="mt-0.5 text-[12px] text-slate-400">
                              Base {formatCurrency(lineAmount)}
                            </div>
                          )}
                        </td>

                        <td className="px-2 py-2 text-center">
                          {rows.length > 1 && !isLocked && (
                            <button
                              type="button"
                              onClick={() => removeRow(index)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                              title="Remove row / قطار ہٹائیں"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-[12px] text-slate-400">
                {rows.length} line{rows.length === 1 ? "" : "s"}
              </div>
              <div className="text-right">
                <div className="text-[12px] uppercase tracking-wide text-slate-400">
                  Items Total
                </div>
                <div className="text-[13px] font-semibold text-slate-900">
                  {formatCurrency(
                    rowsSubtotal + totalItemTaxAmount
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[12px] font-semibold text-slate-800">
                  Applicable Charges / قابل اطلاق چارجز
                </div>
                <div className="mt-0.5 text-[12px] text-slate-400">
                  Charges come from Charge Master. Revenue and cost accounts are mapped automatically. / چارجز چارج ماسٹر سے آتے ہیں، ریونیو اور لاگت کے اکاؤنٹس خودکار طور پر منسلک ہوتے ہیں۔
                </div>
              </div>

              {!isLocked && (
                <div className="flex w-full items-center gap-1.5 sm:w-auto">
                  <select
                    className="input min-w-[220px]"
                    value={chargeToAdd}
                    onChange={(event) => setChargeToAdd(event.target.value)}
                  >
                    <option value="">— Select charge / چارج منتخب کریں —</option>
                    {salesCharges
                      .filter((charge) => !selectedChargeKeys.includes(charge.charge_key))
                      .map((charge) => (
                        <option key={charge.id} value={charge.charge_key}>
                          {charge.charge_name}
                        </option>
                      ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleAddChargeRow}
                    className="btn-secondary whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />Add / شامل کریں</button>
                </div>
              )}
            </div>

            {selectedChargeKeys.length === 0 ? (
              <div className="px-3 py-5 text-[12px] text-slate-400">
                No additional charges selected. / کوئی اضافی چارج منتخب نہیں کیا گیا۔
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 p-3 md:grid-cols-2">
                {selectedChargeKeys.map((key) => {
                  const chargeType = salesCharges.find((charge) => charge.charge_key === key);
                  if (!chargeType) return null;

                  const chargeAmount = Number(charges[key]) || 0;
                  const chargeTaxPercent =
                    invoiceType === "Tax Invoice" && chargeType.tax_applicable
                      ? Number(chargeTaxes[key] ?? globalTaxPercent) || 0
                      : 0;
                  const chargeTaxAmount = (chargeAmount * chargeTaxPercent) / 100;
                  const chargeTotal = chargeAmount + chargeTaxAmount;

                  const revenueAccount = accounts.find(
                    (account) => account.id === (chargeAccounts[key] || chargeType.revenue_account_id)
                  );
                  const costAccount = accounts.find(
                    (account) => account.id === chargeType.cost_account_id
                  );

                  return (
                    <div
                      key={chargeType.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[12px] font-semibold text-slate-700">
                            {chargeType.charge_name}
                          </div>
                          <div className="text-[12px] text-slate-400">
                            {chargeType.charge_key}
                          </div>
                        </div>

                        {!isLocked && (
                          <button
                            type="button"
                            onClick={() => handleRemoveChargeRow(chargeType.charge_key)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded text-rose-500 hover:bg-rose-50"
                            title="Remove charge / چارج ہٹائیں"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label">Qty / مقدار</label>
                          <input
                            className="input text-right"
                            disabled={isLocked}
                            type="number"
                            step="0.001"
                            value={chargeQuantities[key] ?? "1"}
                            onChange={(event) =>
                              setChargeQuantities({
                                ...chargeQuantities,
                                [key]: event.target.value,
                              })
                            }
                          />
                        </div>

                        <div>
                          <label className="label">Rate / ریٹ</label>
                          <input
                            className="input text-right"
                            disabled={isLocked}
                            type="number"
                            step="0.01"
                            value={chargeRates[key] ?? "0"}
                            onChange={(event) => {
                              const value = event.target.value;
                              setChargeRates({ ...chargeRates, [key]: value });
                              const qty = Number(chargeQuantities[key] ?? "1") || 1;
                              const rate = Number(value) || 0;
                              setCharges({
                                ...charges,
                                [key]: String(qty * rate),
                              });
                            }}
                          />
                        </div>

                        <div>
                          <label className="label">Amount / رقم</label>
                          <input
                            className="input text-right"
                            disabled={isLocked}
                            type="number"
                            step="0.01"
                            value={charges[key] ?? "0"}
                            onChange={(event) =>
                              setCharges({
                                ...charges,
                                [key]: event.target.value,
                              })
                            }
                          />
                        </div>

                        {invoiceType === "Tax Invoice" && chargeType.tax_applicable && (
                          <div>
                            <label className="label">Tax % / ٹیکس</label>
                            <input
                              className="input text-right"
                              disabled={isLocked}
                              type="number"
                              step="0.01"
                              value={chargeTaxes[key] ?? globalTaxPercent}
                              onChange={(event) =>
                                setChargeTaxes({
                                  ...chargeTaxes,
                                  [key]: event.target.value,
                                })
                              }
                            />
                          </div>
                        )}
                      </div>

                      <div className="mt-2 grid grid-cols-1 gap-1 border-t border-slate-200 pt-2 text-[12px]">
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-400">Recovery / Revenue Account / وصولی یا ریونیو اکاؤنٹ</span>
                          <span className="font-medium text-slate-600">
                            {revenueAccount
                              ? `${revenueAccount.code ? `${revenueAccount.code} - ` : ""}${revenueAccount.name}`
                              : "Not mapped"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-400">Cost Account / لاگت اکاؤنٹ</span>
                          <span className="font-medium text-slate-600">
                            {costAccount
                              ? `${costAccount.code ? `${costAccount.code} - ` : ""}${costAccount.name}`
                              : "Not mapped"}
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-slate-200 pt-1 text-[12px] text-slate-500">
                          <span>Total / کل</span>
                          <span className="font-semibold text-slate-700">
                            {formatCurrency(chargeTotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-[72px] xl:self-start">
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3 py-2.5">
              <div className="text-[12px] font-semibold text-slate-800">
                Invoice Summary
              </div>
            </div>

            <div className="space-y-2.5 p-3 text-[12px]">
              <div className="flex items-center justify-between text-slate-500">
                <span>Items Subtotal / آئٹمز ذیلی کل</span>
                <span className="font-medium text-slate-800">
                  {formatCurrency(rowsSubtotal)}
                </span>
              </div>

              {invoiceType === "Tax Invoice" && (
                <div className="flex items-center justify-between text-slate-500">
                  <span>Items Tax / آئٹمز ٹیکس</span>
                  <span className="font-medium text-slate-800">
                    {formatCurrency(totalItemTaxAmount)}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-slate-500">
                <span>Charges / چارجز</span>
                <span className="font-medium text-slate-800">
                  {formatCurrency(chargesSubtotal)}
                </span>
              </div>

              {invoiceType === "Tax Invoice" &&
                totalChargeTaxAmount > 0 && (
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Charges Tax / چارجز ٹیکس</span>
                    <span className="font-medium text-slate-800">
                      {formatCurrency(
                        totalChargeTaxAmount
                      )}
                    </span>
                  </div>
                )}

              <div className="border-t border-slate-200 pt-2.5">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                  Grand Total
                </div>
                <div className="mt-1 text-[20px] font-semibold tracking-tight text-slate-900">
                  {formatCurrency(grandTotal)}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Customer / گاہک</div>
            <div className="mt-1 text-[12px] font-semibold text-slate-800">
              {selectedCustomerObj?.name ||
                "No customer selected"}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
              <div>
                <div className="text-[12px] uppercase tracking-wide text-slate-400">
                  Invoice
                </div>
                <div className="mt-0.5 text-[12px] font-medium text-slate-700">
                  {invoiceNo || "Pending"}
                </div>
              </div>

              <div>
                <div className="text-[12px] uppercase tracking-wide text-slate-400">Status / حالت</div>
                <div
                  className={[
                    "mt-0.5 text-[12px] font-semibold",
                    isLocked
                      ? "text-emerald-700"
                      : "text-amber-700",
                  ].join(" ")}
                >
                  {isLocked ? "Posted / Closed" : "Draft"}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="grid gap-1.5">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(true)}
                className="btn-secondary w-full"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview Invoice
              </button>

              {!isLocked && (
                <>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      handleSaveInvoice()
                    }
                    className="btn-secondary w-full"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save Draft
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      handleSaveInvoice()
                    }
                    className="btn-primary w-full"
                  >
                    <FileCheck2 className="h-3.5 w-3.5" />
                    Post & Approve
                  </button>
                </>
              )}
            </div>
          </section>
        </aside>
      </form>

      {/* Invoice Preview Modal */}
      <Modal
        open={isPreviewOpen}
        title={`${invoiceType} Preview / ${invoiceType} پیش منظر — ${invoiceNo}`}
        onClose={() => setIsPreviewOpen(false)}
      >
        <div className="p-2">
          <div id="printable-invoice-area" className="mx-auto max-w-[820px] bg-white p-5 text-slate-800">
            <div className="flex items-start justify-between gap-5 border-b-2 border-slate-800 pb-4">
              <div>
                <div className="text-xl font-bold tracking-tight">MetalForge Steel Industries</div>
                <div className="mt-0.5 text-[12px] text-slate-500">MetalForge OS · Sales & Accounts</div>
                <div className="mt-3 text-lg font-bold">
                  {invoiceType === "Cash Bill" ? "CASH BILL / نقد بل" : invoiceType === "Tax Invoice" ? "TAX INVOICE / ٹیکس انوائس" : "SALES INVOICE / فروخت انوائس"}
                </div>
              </div>
              <div className="flex items-start gap-4 text-right text-[12px]">
                <div className="space-y-1 pt-1">
                  <div><strong>Invoice # / انوائس نمبر:</strong> {invoiceNo || "—"}</div>
                  <div><strong>Date / تاریخ:</strong> {invoiceDate}</div>
                  <div><strong>Status / حیثیت:</strong> {isLocked ? "POSTED / پوسٹڈ" : "DRAFT / مسودہ"}</div>
                </div>
                <div className="rounded border border-slate-300 p-1.5 text-center">
                  <QRCodeCanvas value={invoiceQrPayload} size={88} level="M" />
                  <div className="mt-1 text-[12px] text-slate-500">Scan to Verify / تصدیق کے لیے اسکین کریں</div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded border border-slate-200 p-3">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Bill To / بل برائے</div>
                <div className="mt-1 text-sm font-bold">{selectedCustomerObj?.name || "—"}</div>
                <div className="mt-2 text-[12px] text-slate-500">Previous Balance / سابقہ بقایا</div>
                <div className="font-bold">{formatCurrency(customerSnapshot?.previousBalance ?? 0)}</div>
              </div>
              <div className="rounded border border-slate-200 p-3">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Sales Person / سیلز پرسن</div>
                <div className="mt-1 text-sm font-bold">{selectedSalesPersonObj?.name || "—"}</div>
                <div className="mt-2 text-[12px] text-slate-500">Payment / ادائیگی</div>
                <div className="font-semibold">{invoiceType === "Cash Bill" ? "Cash / نقد" : "Credit / ادھار"}</div>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 border-b border-slate-800 pb-1 text-xs font-bold uppercase">Items / اشیاء</div>
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-2 py-2 text-left">Item Description / آئٹم کی تفصیل</th>
                    <th className="border border-slate-300 px-2 py-2 text-left">Godown / گودام</th>
                    <th className="border border-slate-300 px-2 py-2 text-right">Qty / مقدار</th>
                    <th className="border border-slate-300 px-2 py-2 text-right">Rate / ریٹ</th>
                    {invoiceType === "Tax Invoice" && <th className="border border-slate-300 px-2 py-2 text-right">Tax / ٹیکس</th>}
                    <th className="border border-slate-300 px-2 py-2 text-right">Amount / رقم</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.filter((r) => r.item_id || Number(r.qty) || Number(r.rate)).map((r, idx) => {
                    const item = items.find((i) => i.id === r.item_id);
                    const base = (Number(r.qty) || 0) * (Number(r.rate) || 0);
                    const tax = invoiceType === "Tax Invoice" ? (base * (Number(r.tax_percent) || 0)) / 100 : 0;
                    return (
                      <tr key={idx}>
                        <td className="border border-slate-300 px-2 py-2 font-semibold">{item?.name || "—"}<div className="text-[12px] font-normal text-slate-400">SKU: {item?.sku || "—"}</div></td>
                        <td className="border border-slate-300 px-2 py-2">{godowns.find((g) => g.id === r.godown_id)?.name || "—"}</td>
                        <td className="border border-slate-300 px-2 py-2 text-right">{r.qty}</td>
                        <td className="border border-slate-300 px-2 py-2 text-right">{formatCurrency(Number(r.rate) || 0)}</td>
                        {invoiceType === "Tax Invoice" && <td className="border border-slate-300 px-2 py-2 text-right">{r.tax_percent}%<div className="text-[12px] text-slate-400">{formatCurrency(tax)}</div></td>}
                        <td className="border border-slate-300 px-2 py-2 text-right font-bold">{formatCurrency(base + tax)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedChargeKeys.some((key) => Number(charges[key]) > 0) && (
              <div className="mt-5">
                <div className="mb-2 border-b border-slate-800 pb-1 text-xs font-bold uppercase">Additional Charges / اضافی چارجز</div>
                <table className="w-full border-collapse text-[12px]">
                  <tbody>
                    {selectedChargeKeys.map((key) => {
                      const charge = salesCharges.find((c) => c.charge_key === key);
                      const amount = Number(charges[key]) || 0;
                      if (amount <= 0) return null;
                      const taxRate = invoiceType === "Tax Invoice" ? Number(chargeTaxes[key]) || 0 : 0;
                      const tax = (amount * taxRate) / 100;
                      return <tr key={key}><td className="border border-slate-300 px-2 py-2">{charge?.charge_name || key}<div className="text-[12px] text-slate-400">{key}{taxRate > 0 ? ` · Tax ${taxRate}%` : ""}</div></td><td className="border border-slate-300 px-2 py-2 text-right font-bold">{formatCurrency(amount + tax)}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-4">
              <div className="rounded border border-slate-300 p-3">
                <div className="mb-2 text-xs font-bold">Customer Account / کسٹمر کھاتہ</div>
                <div className="space-y-1.5 text-[12px]">
                  <div className="flex justify-between"><span>Previous Balance / سابقہ بقایا</span><strong>{formatCurrency(customerSnapshot?.previousBalance ?? 0)}</strong></div>
                  <div className="flex justify-between"><span>Last Payment / آخری ادائیگی</span><strong>{formatCurrency(customerSnapshot?.lastPaymentAmount ?? 0)}</strong></div>
                  <div className="flex justify-between"><span>Payment Date / ادائیگی کی تاریخ</span><strong>{customerSnapshot?.lastPaymentDate || "—"}</strong></div>
                  <div className="flex justify-between"><span>Received Today / آج وصولی</span><strong>{formatCurrency(customerSnapshot?.todayReceived ?? 0)}</strong></div>
                  <div className="mt-2 border-t border-slate-200 pt-2 flex justify-between font-bold"><span>After Payment / ادائیگی کے بعد</span><strong>{formatCurrency(afterLatestPaymentBalance)}</strong></div>
                  <div className="flex justify-between font-bold text-rose-700"><span>Projected Balance / متوقع بقایا</span><strong>{formatCurrency(projectedCustomerBalance)}</strong></div>
                </div>
              </div>

              <div className="rounded border border-slate-300 p-3">
                <div className="mb-2 text-xs font-bold">Invoice Summary / بل کا خلاصہ</div>
                <div className="space-y-1.5 text-[12px]">
                  <div className="flex justify-between"><span>Items Subtotal / آئٹمز ذیلی کل</span><strong>{formatCurrency(rowsSubtotal)}</strong></div>
                  {selectedHawalaTotal > 0 && (
                    <div className="flex justify-between text-blue-700">
                      <span>Hawala / Consolidated Total / حوالہ کل</span>
                      <strong>{formatCurrency(selectedHawalaTotal)}</strong>
                    </div>
                  )}
                  <div className="flex justify-between"><span>Items Tax / آئٹمز ٹیکس</span><strong>{formatCurrency(totalItemTaxAmount)}</strong></div>
                  <div className="flex justify-between"><span>Charges / اضافی چارجز</span><strong>{formatCurrency(chargesSubtotal)}</strong></div>
                  <div className="flex justify-between"><span>Charge Tax / چارج ٹیکس</span><strong>{formatCurrency(totalChargeTaxAmount)}</strong></div>
                  <div className="mt-2 flex justify-between border-t-2 border-slate-800 pt-2 text-sm font-bold"><span>NET TOTAL / خالص کل</span><strong>{formatCurrency(grandTotal)}</strong></div>
                  <div className="flex justify-between"><span>Current Invoice Balance / موجودہ بل بقایا</span><strong>{formatCurrency(currentInvoiceBalance)}</strong></div>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-300 pt-3 text-center text-[12px] text-slate-500">This is a computer-generated official document and does not require a physical signature. / یہ کمپیوٹر سے تیار کردہ سرکاری دستاویز ہے اور دستخط ضروری نہیں۔</div>
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t pt-3">
            <button type="button" onClick={handlePrint} className="btn-secondary">
              <Printer className="h-3.5 w-3.5" />
              Print Professional Invoice / پرنٹ
            </button>
            <button type="button" onClick={() => setIsPreviewOpen(false)} className="btn-primary">Close / بند کریں</button>
          </div>
        </div>
      </Modal>

      {/* Quick Add Item Modal */}
      <Modal open={itemModalOpen} title="Quick Add Inventory Item / فوری اسٹاک آئٹم شامل کریں" onClose={() => setItemModalOpen(false)}>
        <form onSubmit={handleSaveQuickItem} className="space-y-4">
          <div>
            <label className="label">Item Name / آئٹم نام</label>
            <input className="input" required value={newItemForm.name} onChange={(e) => setNewItemForm({ ...newItemForm, name: e.target.value })} placeholder="e.g. Product Name / مثال: مصنوعات کا نام" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category / کیٹیگری</label>
              <select className="input" value={newItemForm.category_id} onChange={(e) => setNewItemForm({ ...newItemForm, category_id: e.target.value })}>
                <option value="">— Select Category —</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Godown / Warehouse / گودام یا ویئرہاؤس</label>
              <select className="input" value={newItemForm.godown_id} onChange={(e) => setNewItemForm({ ...newItemForm, godown_id: e.target.value })}>
                <option value="">— Select Godown —</option>
                {godowns.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              {godowns.length === 0 && (
                <div className="mt-1 text-[12px] text-rose-600">
                  No godown loaded. Create one in Godown Master and refresh.
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Unit / اکائی</label>
              <input className="input" value={newItemForm.unit} onChange={(e) => setNewItemForm({ ...newItemForm, unit: e.target.value })} placeholder="Unit name / اکائی نام" />
            </div>
            <div>
              <label className="label">Default Cost / ڈیفالٹ لاگت</label>
              <input className="input" type="number" step="0.01" value={newItemForm.cost} onChange={(e) => setNewItemForm({ ...newItemForm, cost: e.target.value })} />
            </div>
            <div>
              <label className="label">Sale Price / فروخت قیمت</label>
              <input className="input" type="number" step="0.01" value={newItemForm.price} onChange={(e) => setNewItemForm({ ...newItemForm, price: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setItemModalOpen(false)} className="btn-secondary">Cancel / منسوخ کریں</button>
            <button type="submit" className="btn-primary">Save & Select Item / محفوظ کریں اور آئٹم منتخب کریں</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
