import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { ChartOfAccount, AccountType } from "@/types";
import { PageHeader, Modal, ErrorBanner, ConfirmModal } from "@/components/ui";

export default function ChartOfAccounts() {
  const [rows, setRows] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ChartOfAccount | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // This screen is the master source for all account-based dropdowns.
  // Any account inserted here is immediately available to invoice account selectors.
  const [form, setForm] = useState({ 
    code: "", 
    name: "", 
    type: "expense" as AccountType, 
    detail_type: "Freight & Delivery Charges",
    parent_head: "Selling & Distribution Expenses",
    account_role: "general"
  });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("chart_of_accounts").select("*").order("code");
    if (error) setError(error.message);
    else setRows(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const hierarchyMap: Record<AccountType, { detailTypes: string[]; parentHeads: string[] }> = {
    asset: {
      detailTypes: [
        "Cash on Hand", "Checking / Current Bank Account", "Savings Bank Account", 
        "Accounts Receivable (Debtors)", "Inventory / Stock-in-Trade", "Prepaid Expenses", 
        "Other Current Assets", "Machinery & Equipment", "Furniture & Fixtures"
      ],
      parentHeads: ["Current Assets", "Bank & Cash Accounts", "Accounts Receivable", "Inventories", "Fixed / Non-Current Assets"]
    },
    liability: {
      detailTypes: [
        "Accounts Payable (Creditors)", "Sales Tax Payable", "Income Tax Payable", 
        "Wages & Salaries Payable", "Other Current Liabilities", "Long-term Bank Loans"
      ],
      parentHeads: ["Current Liabilities", "Accounts Payable", "Tax & Duties Payable", "Long-Term Liabilities"]
    },
    equity: {
      detailTypes: [
        "Owner's Capital / Share Capital", "Retained Earnings", "Owner's Drawings", "General Reserves"
      ],
      parentHeads: ["Capital & Reserves", "Retained Earnings & Profits"]
    },
    revenue: {
      detailTypes: [
        "Sales of Product Income", "Service & Labor Income", "Wholesale / B2B Revenue", 
        "Retail / POS Revenue", "Discount Given (Contra-Revenue)", "Commission Earned", "Other Operating Income"
      ],
      parentHeads: ["Operating Revenue", "Direct Income", "Indirect / Other Income"]
    },
    expense: {
      detailTypes: [
        "Loading & Unloading Charges", "Freight & Delivery Charges", "Packaging & Handling Charges", 
        "Labor & Worker Wages", "Cost of Goods Sold (COGS)", "Salaries & Employee Wages", 
        "Rent or Lease Expense", "Utilities (Electricity, Gas, Water)", "Miscellaneous Expenses"
      ],
      parentHeads: ["Cost of Goods Sold (COGS)", "Administrative Expenses", "Selling & Distribution Expenses", "Financial Charges"]
    }
  };

  const handleTypeChange = (newType: AccountType) => {
    let prefix = "1";
    if (newType === "liability") prefix = "2";
    else if (newType === "equity") prefix = "3";
    else if (newType === "revenue") prefix = "4";
    else if (newType === "expense") prefix = "5";

    const existing = rows.map((r) => r.code).filter((c) => c && c.startsWith(prefix)).sort();
    let nextNum = 1;
    if (existing.length > 0) {
      const lastCode = existing[existing.length - 1];
      const numPart = parseInt(lastCode.replace(/\D/g, ""), 10);
      if (!isNaN(numPart)) nextNum = (numPart % 1000) + 1;
    }

    const generatedCode = `${prefix}${String(nextNum).padStart(3, "0")}`;
    const currentConfig = hierarchyMap[newType];
    
    setForm({ 
      ...form, 
      type: newType, 
      code: generatedCode, 
      detail_type: currentConfig.detailTypes[0],
      parent_head: currentConfig.parentHeads[0],
      account_role: "general"
    });
  };

  const openCreate = () => {
    setEditing(null);
    const defaultType: AccountType = "expense";
    let prefix = "5";
    const existing = rows.map((r) => r.code).filter((c) => c && c.startsWith(prefix)).sort();
    let nextNum = existing.length > 0 ? (parseInt(existing[existing.length - 1].replace(/\D/g, ""), 10) % 1000) + 1 : 1;
    const generatedCode = `${prefix}${String(nextNum).padStart(3, "0")}`;

    setForm({ 
      code: generatedCode, 
      name: "", 
      type: defaultType, 
      detail_type: hierarchyMap.expense.detailTypes[0],
      parent_head: hierarchyMap.expense.parentHeads[0],
      account_role: "general"
    });
    setModalOpen(true);
  };

  const openEdit = (row: ChartOfAccount) => {
    setEditing(row);
    setForm({ 
      code: row.code, 
      name: row.name, 
      type: row.type, 
      detail_type: (row as any).detail_type || hierarchyMap[row.type].detailTypes[0],
      parent_head: (row as any).parent_head || hierarchyMap[row.type].parentHeads[0],
      account_role: (row as any).account_role || "general"
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { 
      code: form.code, 
      name: form.name, 
      type: form.type,
      detail_type: form.detail_type,
      parent_head: form.parent_head,
      account_role: form.account_role
    };

    if (editing) {
      const { error } = await supabase.from("chart_of_accounts").update(payload).eq("id", editing.id);
      if (error) { setError(error.message); return; }
    } else {
      const { error } = await supabase.from("chart_of_accounts").insert(payload);
      if (error) { setError(error.message); return; }
    }
    setModalOpen(false);
    setError(null);
    fetchRows();
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    // Accounts are master records referenced by invoices/journal entries.
    // Check common accounting references before allowing deletion.
    const [
      customerLink,
      salesLink,
      chargeLink,
      journalLink,
    ] = await Promise.all([
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("account_id", deleteId),
      supabase.from("sales_orders").select("id", { count: "exact", head: true }).eq("sales_person_account_id", deleteId),
      supabase.from("sales_order_charges").select("id", { count: "exact", head: true }).eq("account_id", deleteId),
      supabase.from("journal_entries").select("id", { count: "exact", head: true }).eq("account_id", deleteId),
    ]);

    const linked =
      (customerLink.count ?? 0) +
      (salesLink.count ?? 0) +
      (chargeLink.count ?? 0) +
      (journalLink.count ?? 0);

    if (linked > 0) {
      setError("This Chart of Accounts account is already linked to accounting records and cannot be deleted. Rename or deactivate it instead.");
      setDeleteId(null);
      return;
    }

    const { error } = await supabase.from("chart_of_accounts").delete().eq("id", deleteId);
    if (error) setError(error.message);
    setDeleteId(null);
    fetchRows();
  };

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchesType = selectedTypeFilter === "all" || r.type === selectedTypeFilter;
      const matchesSearch = searchQuery === "" || 
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        r.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ((r as any).detail_type && (r as any).detail_type.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesType && matchesSearch;
    });
  }, [rows, selectedTypeFilter, searchQuery]);

  const typeColors: Record<AccountType, string> = {
    asset: "bg-emerald-100 text-emerald-800",
    liability: "bg-rose-100 text-rose-800",
    equity: "bg-slate-100 text-slate-800",
    revenue: "bg-blue-100 text-blue-800",
    expense: "bg-amber-100 text-amber-800",
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Chart of Accounts" 
        subtitle="Master Chart of Accounts — all invoice account dropdowns use these accounts" 
        action={
          <div className="flex items-center gap-3 print:hidden">
            <button onClick={openCreate} className="btn-primary">+ New Account</button>
          </div>
        } 
      />

      {error && <ErrorBanner message={error} />}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-2">Filter:</span>
          <button onClick={() => setSelectedTypeFilter("all")} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${selectedTypeFilter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            All ({rows.length})
          </button>
          <button onClick={() => setSelectedTypeFilter("expense")} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${selectedTypeFilter === "expense" ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100"}`}>
            Expenses
          </button>
          <button onClick={() => setSelectedTypeFilter("revenue")} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${selectedTypeFilter === "revenue" ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700 hover:bg-blue-100"}`}>
            Revenues
          </button>
          <button onClick={() => setSelectedTypeFilter("asset")} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${selectedTypeFilter === "asset" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
            Assets
          </button>
          <button onClick={() => setSelectedTypeFilter("liability")} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${selectedTypeFilter === "liability" ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-700 hover:bg-rose-100"}`}>
            Liabilities
          </button>
        </div>

        <div>
          <input 
            type="text" 
            placeholder="Search code, name..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input text-xs py-1.5 px-3 w-full md:w-64"
          />
        </div>
      </div>

      <div className="card p-6 bg-white shadow-sm border border-slate-200 rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-3 px-4 font-semibold">Code</th>
                <th className="py-3 px-4 font-semibold">Account Name</th>
                <th className="py-3 px-4 font-semibold">Account Type</th>
                <th className="py-3 px-4 font-semibold">Detail Type</th>
                <th className="py-3 px-4 font-semibold">Parent Head (Sub-Group)</th>
                <th className="py-3 px-4 font-semibold">Role</th>
                <th className="py-3 px-4 font-semibold text-right print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">Loading accounts...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">No accounts found matching your query.</td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-900">{r.code}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800">{r.name}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full uppercase tracking-wider ${typeColors[r.type] || "bg-slate-100 text-slate-800"}`}>
                        {r.type}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 text-xs font-medium">{(r as any).detail_type || "—"}</td>
                    <td className="py-3.5 px-4 text-indigo-700 text-xs font-semibold">{(r as any).parent_head || "—"}</td>
                    <td className="py-3.5 px-4 text-slate-600 text-xs font-semibold">{(r as any).account_role || "General"}</td>
                    <td className="py-3.5 px-4 text-right print:hidden">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => openEdit(r)} className="px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors">Edit</button>
                        <button onClick={() => setDeleteId(r.id)} className="px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <Modal open={modalOpen} title={editing ? "Edit Account Head" : "New Account Head"} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label font-medium text-slate-700">Account Type</label>
              <select className="input" value={form.type} onChange={(e) => handleTypeChange(e.target.value as AccountType)}>
                <option value="asset">Asset</option>
                <option value="liability">Liability</option>
                <option value="equity">Equity</option>
                <option value="revenue">Revenue</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div>
              <label className="label font-medium text-slate-700">Account Code (Auto)</label>
              <input className="input font-mono bg-slate-50" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label font-medium text-slate-700">Detail Type</label>
              <select className="input" value={form.detail_type} onChange={(e) => setForm({ ...form, detail_type: e.target.value })}>
                {hierarchyMap[form.type]?.detailTypes.map((dt) => (
                  <option key={dt} value={dt}>{dt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label font-medium text-slate-700">Parent Head / Sub-Group</label>
              <select className="input" value={form.parent_head} onChange={(e) => setForm({ ...form, parent_head: e.target.value })}>
                {hierarchyMap[form.type]?.parentHeads.map((ph) => (
                  <option key={ph} value={ph}>{ph}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label font-medium text-slate-700">Account Role</label>
            <select className="input" value={(form as any).account_role} onChange={(e) => setForm({ ...form, account_role: e.target.value })}>
              <option value="general">General</option>
              <option value="party">Party / Customer</option>
              <option value="sales_person">Sales Person</option>
              <option value="charge">Invoice Charge</option>
            </select>
          </div>

          <div>
            <label className="label font-medium text-slate-700">Account Name</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Loading Charges, Transport Freight" />
          </div>

          <div className="flex gap-3 justify-end pt-3 border-t">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editing ? "Save Changes" : "Save Account"}</button>
          </div>
        </form>
      </Modal>

      <ConfirmModal open={!!deleteId} title="Delete Account" message="Are you sure you want to delete this account?" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}