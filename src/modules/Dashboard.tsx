import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Factory,
  FileDown,
  Filter,
  Maximize2,
  Minimize2,
  Printer,
  TimerReset,
  Trophy,
  GripVertical,
  LayoutDashboard,
  Moon,
  PackageSearch,
  PanelTop,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShoppingCart,
  Sparkles,
  Sun,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type ThemeMode = "light" | "dark" | "black";
type DensityMode = "comfortable" | "compact";
type DateRange = "today" | "7d" | "30d" | "90d" | "year" | "all";

type WidgetId =
  | "kpis"
  | "performance"
  | "cashflow"
  | "receivables"
  | "payables"
  | "inventory"
  | "production"
  | "alerts"
  | "activity"
  | "stockMovements"
  | "topItems"
  | "slowItems"
  | "quickActions";

type WidgetSize = "small" | "medium" | "large";

interface WidgetConfig {
  id: WidgetId;
  title: string;
  visible: boolean;
  size?: WidgetSize;
}

interface DashboardStats {
  sales: number;
  purchases: number;
  receivables: number;
  payables: number;
  cashBank: number;
  inventoryValue: number;
  grossProfit: number;
  netMovement: number;
  openSalesInvoices: number;
  openPurchaseInvoices: number;
  pendingWorkOrders: number;
  zeroNegativeStock: number;
  salesCount: number;
  purchaseCount: number;
}

interface TrendPoint {
  label: string;
  sales: number;
  purchases: number;
}

interface JournalActivity {
  id: string;
  entry_no: string;
  entry_date: string;
  description: string | null;
  status: string;
}

interface MasterOption {
  id: string;
  name: string;
}

interface StockMovementActivity {
  id: string;
  type: string;
  qty: number;
  reference: string | null;
  created_at: string;
  item_id?: string | null;
  godown_id?: string | null;
}

interface ItemInsight {
  id: string;
  name: string;
  sku: string;
  qty: number;
  value: number;
}

interface DashboardPreferences {
  theme: ThemeMode;
  density: DensityMode;
  widgets: WidgetConfig[];
}

const STORAGE_KEY = "metalforge-dashboard-preferences-v2";

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "kpis", title: "Executive KPIs", visible: true, size: "large" },
  { id: "performance", title: "Performance Overview", visible: true, size: "large" },
  { id: "cashflow", title: "Cash & Working Capital", visible: true, size: "medium" },
  { id: "receivables", title: "Receivables / وصولیاں", visible: true, size: "small" },
  { id: "payables", title: "Payables / واجبات", visible: true, size: "small" },
  { id: "inventory", title: "Inventory / اسٹاک", visible: true, size: "small" },
  { id: "production", title: "Production / پیداوار", visible: true, size: "small" },
  { id: "alerts", title: "Attention Center", visible: true, size: "medium" },
  { id: "activity", title: "Recent Accounting Activity", visible: true, size: "large" },
  { id: "stockMovements", title: "Recent Stock Movements", visible: true, size: "medium" },
  { id: "topItems", title: "Top Inventory Items / اہم اسٹاک آئٹمز", visible: true, size: "medium" },
  { id: "slowItems", title: "Slow / Low Stock", visible: true, size: "medium" },
  { id: "quickActions", title: "Quick Actions / فوری کارروائیاں", visible: true, size: "medium" },
];

const EMPTY_STATS: DashboardStats = {
  sales: 0,
  purchases: 0,
  receivables: 0,
  payables: 0,
  cashBank: 0,
  inventoryValue: 0,
  grossProfit: 0,
  netMovement: 0,
  openSalesInvoices: 0,
  openPurchaseInvoices: 0,
  pendingWorkOrders: 0,
  zeroNegativeStock: 0,
  salesCount: 0,
  purchaseCount: 0,
};

const money = (value: number) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    currencyDisplay: "symbol",
    maximumFractionDigits: 0,
  })
    .format(Number.isFinite(value) ? value : 0)
    .replace("PKR", "Rs");

const number = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

const asNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function startDateForRange(range: DateRange) {
  if (range === "all") {
    return "1900-01-01";
  }

  const now = new Date();
  const start = new Date(now);

  if (range === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (range === "7d") {
    start.setDate(start.getDate() - 6);
  } else if (range === "30d") {
    start.setDate(start.getDate() - 29);
  } else if (range === "90d") {
    start.setDate(start.getDate() - 89);
  } else {
    start.setMonth(0, 1);
  }

  return start.toISOString().slice(0, 10);
}

function readPreferences(): DashboardPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {
        theme: "light",
        density: "comfortable",
        widgets: DEFAULT_WIDGETS,
      };
    }

    const parsed = JSON.parse(raw) as Partial<DashboardPreferences>;

    const storedWidgets = Array.isArray(parsed.widgets)
      ? parsed.widgets
      : DEFAULT_WIDGETS;

    const merged = DEFAULT_WIDGETS.map((defaultWidget) => {
      const stored = storedWidgets.find(
        (widget) => widget.id === defaultWidget.id
      );

      return stored
        ? { ...defaultWidget, ...stored }
        : defaultWidget;
    });

    const ordered = [
      ...storedWidgets
        .map((stored) => merged.find((item) => item.id === stored.id))
        .filter(Boolean),
      ...merged.filter(
        (item) => !storedWidgets.some((stored) => stored.id === item.id)
      ),
    ] as WidgetConfig[];

    return {
      theme:
        parsed.theme === "dark" || parsed.theme === "black"
          ? parsed.theme
          : "light",
      density: parsed.density === "compact" ? "compact" : "comfortable",
      widgets: ordered,
    };
  } catch {
    return {
      theme: "light",
      density: "comfortable",
      widgets: DEFAULT_WIDGETS,
    };
  }
}

export default function Dashboard() {
  const navigate = useNavigate();

  const initialPrefs = useMemo(() => readPreferences(), []);

  const [
          theme,
          setTheme] = useState<ThemeMode>(initialPrefs.theme);
  const [density,
          setDensity] =
    useState<DensityMode>(initialPrefs.density);
  const [widgets,
          setWidgets] =
    useState<WidgetConfig[]>(initialPrefs.widgets);

  const [dateRange,
          setDateRange] = useState<DateRange>("30d");
  const [customizeOpen,
          setCustomizeOpen] = useState(false);
  const [rangeOpen,
          setRangeOpen] = useState(false);
  const [filtersOpen,
          setFiltersOpen] = useState(false);
  const [draggedId,
          setDraggedId] = useState<WidgetId | null>(null);

  const [autoRefresh,
          setAutoRefresh] = useState(false);
  const [isFullscreen,
          setIsFullscreen] = useState(false);

  const [warehouseFilter,
          setWarehouseFilter] = useState("all");
  const [godownFilter,
          setGodownFilter] = useState("all");
  const [salespersonFilter,
          setSalespersonFilter] = useState("all");
  const [customerFilter,
          setCustomerFilter] = useState("all");
  const [supplierFilter,
          setSupplierFilter] = useState("all");

  const [warehouses,
          setWarehouses] = useState<MasterOption[]>([]);
  const [godowns,
          setGodowns] = useState<MasterOption[]>([]);
  const [customers,
          setCustomers] = useState<MasterOption[]>([]);
  const [suppliers,
          setSuppliers] = useState<MasterOption[]>([]);
  const [salespeople,
          setSalespeople] = useState<string[]>([]);

  const [stockActivities,
          setStockActivities] =
    useState<StockMovementActivity[]>([]);
  const [topItems,
          setTopItems] = useState<ItemInsight[]>([]);
  const [slowItems,
          setSlowItems] = useState<ItemInsight[]>([]);

  const [stats,
          setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [trend,
          setTrend] = useState<TrendPoint[]>([]);
  const [activities,
          setActivities] = useState<JournalActivity[]>([]);
  const [loading,
          setLoading] = useState(true);
  const [refreshing,
          setRefreshing] = useState(false);
  const [lastUpdated,
          setLastUpdated] = useState<Date | null>(null);
  const [dataWarning,
          setDataWarning] = useState<string | null>(null);

  const savePreferences = useCallback(
    (
      nextTheme: ThemeMode = theme,
          nextDensity: DensityMode = density,
          nextWidgets: WidgetConfig[] = widgets
    ) => {
      localStorage.setItem(
        STORAGE_KEY,
          JSON.stringify({
          theme: nextTheme,
          density: nextDensity,
          widgets: nextWidgets,
          })
      );
    },
          [theme,
          density,
          widgets]
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-mf-theme",
          theme);
    document.documentElement.setAttribute("data-mf-density",
          density);
    savePreferences(theme,
          density,
          widgets);
  },
          [theme,
          density,
          widgets,
          savePreferences]);

  const safeRows = useCallback(async (table: string) => {
    try {
      const { data,
          error } = await supabase.from(table).select("*");
      if (error) {
        console.warn(`Dashboard source ${table}:`,
          error.message);
        return [];
      }
      return data ?? [];
    } catch (error) {
      console.warn(`Dashboard source ${table}:`,
          error);
      return [];
    }
  },
          []);

  const loadDashboard = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);

      setDataWarning(null);

      const fromDate = startDateForRange(dateRange);

      try {
        const [
          salesRowsRaw,
          purchaseRowsRaw,
          stockRowsRaw,
          workOrdersRaw,
          journalRowsRaw,
          mappingsRaw,
          accountsRaw,
          itemsRaw,
          inventoryCostsRaw,
          warehouseRowsRaw,
          godownRowsRaw,
          customerRowsRaw,
          supplierRowsRaw,
          stockMovementRowsRaw,
        
        ] = await Promise.all([
          safeRows("sales_orders"),
          safeRows("purchase_orders"),
          safeRows("warehouse_stock"),
          safeRows("work_orders"),
          safeRows("journal_entries"),
          safeRows("account_mappings"),
          safeRows("chart_of_accounts"),
          safeRows("items"),
          safeRows("inventory_costs"),
          safeRows("warehouses"),
          safeRows("godowns"),
          safeRows("customers"),
          safeRows("suppliers"),
          safeRows("stock_movements"),
        ]);

        setDataWarning(null);

        const salesRows = salesRowsRaw as any[];
        const purchaseRows = purchaseRowsRaw as any[];
        const inventoryCostRows = (inventoryCostsRaw ?? []) as any[];
        const stockRows = stockRowsRaw as any[];
        const workOrders = workOrdersRaw as any[];
        const journalRows = journalRowsRaw as any[];
        const mappings = mappingsRaw as any[];
        const accounts = accountsRaw as any[];
        const itemRows = itemsRaw as any[];

        const inRange = (value: unknown) => {
          const date = String(value || "").slice(0, 10);
          return !date || date >= fromDate;
        };

        const filteredSales = salesRows.filter((row) => {
          if (!inRange(row.order_date ?? row.created_at)) return false;
          if (
            salespersonFilter !== "all" &&
            String(row.sales_person ?? "") !== salespersonFilter
          ) return false;
          if (
            customerFilter !== "all" &&
            String(row.customer_id ?? "") !== customerFilter
          ) return false;
          return true;
        });

        const filteredPurchases = purchaseRows.filter((row) => {
          if (!inRange(row.order_date ?? row.created_at)) return false;
          if (
            supplierFilter !== "all" &&
            String(row.supplier_id ?? "") !== supplierFilter
          ) return false;
          return true;
        });

        const postedSales = filteredSales.filter((row) =>
          ["posted", "closed"].includes(String(row.status || "").toLowerCase())
        );

        const postedPurchases = filteredPurchases.filter((row) =>
          ["posted", "closed"].includes(String(row.status || "").toLowerCase())
        );

        const sales = postedSales.reduce(
          (sum, row) => sum + asNumber(row.total),
          0
        );

        const purchases = postedPurchases.reduce(
          (sum, row) => sum + asNumber(row.total),
          0
        );

        let receivables = postedSales.reduce(
          (sum, row) => sum + asNumber(row.outstanding_amount),
          0
        );

        let payables = postedPurchases.reduce(
          (sum, row) => sum + asNumber(row.outstanding_amount),
          0
        );

        // Inventory valuation:
        // weighted average cost from inventory_costs first,
        // item master cost only as a safe fallback.
        const masterCostMap = new Map(
          itemRows.map((item: any) => [
            String(item.id),
            asNumber(item.cost),
          ])
        );

        const itemCostMap = new Map<string, number>();

        inventoryCostRows.forEach((row: any) => {
          const itemId = String(row.item_id ?? "");
          if (!itemId) return;

          const weightedCost = asNumber(
            row.average_cost ??
              row.avg_cost ??
              row.unit_cost ??
              row.cost
          );

          if (weightedCost > 0) {
            itemCostMap.set(itemId, weightedCost);
          }
        });

        itemRows.forEach((item: any) => {
          const itemId = String(item.id);

          if (!itemCostMap.has(itemId)) {
            itemCostMap.set(
              itemId,
              masterCostMap.get(itemId) ?? 0
            );
          }
        });

        const filteredStock = stockRows.filter((row) => {
          if (
            warehouseFilter !== "all" &&
            String(row.warehouse_id ?? "") !== warehouseFilter
          ) return false;

          if (
            godownFilter !== "all" &&
            String(row.godown_id ?? "") !== godownFilter
          ) return false;

          return true;
        });

        const inventoryValue = filteredStock.reduce(
          (sum, row) =>
            sum +
            asNumber(row.quantity) *
              asNumber(itemCostMap.get(String(row.item_id))),
          0
        );

        const zeroNegativeStock = filteredStock.filter(
          (row) => asNumber(row.quantity) <= 0
        ).length;

        const pendingWorkOrders = workOrders.filter(
          (row) =>
            !["completed", "closed"].includes(
              String(row.status || "").toLowerCase()
            )
        ).length;

        // Accounting dashboard AR/AP:
        // prefer point-in-time ledger balances over document outstanding totals.
        const receivableIds = accounts
          .filter((account: any) => {
            const code = String(account.code || "").trim();
            const name = String(account.name || "").toLowerCase();
            return (
              String(account.type || "").toLowerCase() === "asset" &&
              (code === "1130" || name.includes("accounts receivable"))
            );
          })
          .map((account: any) => String(account.id))
          .filter(Boolean);

        const payableIds = accounts
          .filter((account: any) => {
            const code = String(account.code || "").trim();
            const name = String(account.name || "").toLowerCase();
            return (
              String(account.type || "").toLowerCase() === "liability" &&
              (code === "2110" || name.includes("accounts payable"))
            );
          })
          .map((account: any) => String(account.id))
          .filter(Boolean);

        const arApIds = [...new Set([...receivableIds, ...payableIds])];

        if (arApIds.length > 0) {
          const { data: arApLedgers } = await supabase
            .from("ledgers")
            .select("account_id,debit,credit,entry_date")
            .in("account_id", arApIds)
            .lte("entry_date", new Date().toISOString().slice(0, 10));

          if (receivableIds.length > 0) {
            const receivableSet = new Set(receivableIds);

            receivables = (arApLedgers ?? [])
              .filter((row: any) =>
                receivableSet.has(String(row.account_id))
              )
              .reduce(
                (sum: number, row: any) =>
                  sum +
                  asNumber(row.debit) -
                  asNumber(row.credit),
                0
              );
          }

          if (payableIds.length > 0) {
            const payableSet = new Set(payableIds);

            payables = (arApLedgers ?? [])
              .filter((row: any) =>
                payableSet.has(String(row.account_id))
              )
              .reduce(
                (sum: number, row: any) =>
                  sum +
                  asNumber(row.credit) -
                  asNumber(row.debit),
                0
              );
          }
        }

        const cashBankIds = new Set<string>(
          mappings
            .filter((row: any) =>
              ["cash", "bank"].includes(
                String(row.mapping_key || "").toLowerCase()
              )
            )
            .map((row: any) => String(row.account_id))
            .filter(Boolean)
        );

        // Include active cash/bank asset posting accounts even when
        // account_mappings is incomplete.
        accounts.forEach((account: any) => {
          const type = String(account.type || "").toLowerCase();
          const code = String(account.code || "").trim();
          const name = String(account.name || "").toLowerCase();

          const isCashBank =
            type === "asset" &&
            (
              code === "1110" ||
              code === "1120" ||
              name.includes("cash") ||
              name.includes("bank")
            );

          if (isCashBank && account.id) {
            cashBankIds.add(String(account.id));
          }
        });

        let cashBank = 0;
        let accountingRevenue = sales;
        let grossProfit = 0;
        let netMovement = 0;

        if (cashBankIds.size > 0) {
          const { data: ledgerRows } = await supabase
            .from("ledgers")
            .select("account_id,debit,credit,entry_date")
            .in("account_id", Array.from(cashBankIds))
            .lte("entry_date", new Date().toISOString().slice(0, 10));

          cashBank = (ledgerRows ?? []).reduce(
            (sum: number, row: any) =>
              sum +
              asNumber(row.debit) -
              asNumber(row.credit),
            0
          );
        }

        const accountType = new Map(
          accounts.map((account) => [account.id, account.type])
        );

        const accountCode = new Map(
          accounts.map((account: any) => [
            account.id,
            String(account.code || "")
          ])
        );

        if (accounts.length > 0) {
          const { data: periodLedgers } = await supabase
            .from("ledgers")
            .select("account_id,debit,credit,entry_date")
            .gte("entry_date", fromDate)
            .lte("entry_date", new Date().toISOString().slice(0, 10));

          let revenue = 0;
          let expense = 0;
          let cogs = 0;

          (periodLedgers ?? []).forEach((row: any) => {
            const type = accountType.get(row.account_id);
            const code = accountCode.get(row.account_id);
            const debit = asNumber(row.debit);
            const credit = asNumber(row.credit);

            if (type === "revenue") {
              revenue += credit - debit;
            }

            if (type === "expense") {
              const expenseAmount = debit - credit;
              expense += expenseAmount;

              if (code === "5100") {
                cogs += expenseAmount;
              }
            }
          });

          accountingRevenue = revenue;
          grossProfit = revenue - cogs;
          netMovement = revenue - expense;
        }

        // 6-month trend should remain a true rolling trend.
        // Respect business filters, but do not restrict it to the
        // dashboard's selected date window.
        const trendSales = salesRows.filter((row) => {
          const status = String(row.status || "").toLowerCase();

          if (!["posted", "closed"].includes(status)) return false;

          if (
            salespersonFilter !== "all" &&
            String(row.sales_person ?? "") !== salespersonFilter
          ) return false;

          if (
            customerFilter !== "all" &&
            String(row.customer_id ?? "") !== customerFilter
          ) return false;

          return true;
        });

        const trendPurchases = purchaseRows.filter((row) => {
          const status = String(row.status || "").toLowerCase();

          if (!["posted", "closed"].includes(status)) return false;

          if (
            supplierFilter !== "all" &&
            String(row.supplier_id ?? "") !== supplierFilter
          ) return false;

          return true;
        });

        const monthMap = new Map<
          string,
          { sales: number; purchases: number }
        >();

        for (let i = 5; i >= 0; i -= 1) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);

          const key = `${d.getFullYear()}-${String(
            d.getMonth() + 1
          ).padStart(2, "0")}`;

          monthMap.set(key, {
            sales: 0,
            purchases: 0,
          });
        }

        trendSales.forEach((row) => {
          const key = String(
            row.order_date ?? row.created_at ?? ""
          ).slice(0, 7);

          if (monthMap.has(key)) {
            const current = monthMap.get(key)!;
            current.sales += asNumber(row.total);
          }
        });

        trendPurchases.forEach((row) => {
          const key = String(
            row.order_date ?? row.created_at ?? ""
          ).slice(0, 7);

          if (monthMap.has(key)) {
            const current = monthMap.get(key)!;
            current.purchases += asNumber(row.total);
          }
        });

        const trendRows = Array.from(monthMap.entries()).map(
          ([key, value]) => {
            const [year, month] = key.split("-").map(Number);

            return {
              label: new Date(year, month - 1, 1).toLocaleDateString(
                "en-US",
                { month: "short" }
              ),
              ...value,
            };
          }
        );

        setTrend(trendRows);

        setStats({
          sales: accountingRevenue,
          purchases,
          receivables,
          payables,
          cashBank,
          inventoryValue,
          grossProfit,
          netMovement,
          openSalesInvoices: postedSales.filter(
            (row) => asNumber(row.outstanding_amount) > 0
          ).length,
          openPurchaseInvoices: postedPurchases.filter(
            (row) => asNumber(row.outstanding_amount) > 0
          ).length,
          pendingWorkOrders,
          zeroNegativeStock,
          salesCount: postedSales.length,
          purchaseCount: postedPurchases.length,
        });

        setActivities(
          journalRows
            .filter(
              (row: any) =>
                String(row.status || "").toLowerCase() === "posted"
            )
            .sort((a: any, b: any) =>
              String(b.entry_date || "").localeCompare(
                String(a.entry_date || "")
              )
            )
            .slice(0, 7) as JournalActivity[]
        );

        const itemNameMap = new Map(
          itemRows.map((item: any) => [
            item.id,
            {
              name: String(item.name || "Item"),
              sku: String(item.sku || ""),
            },
          ])
        );

        const itemTotals = new Map<
          string,
          { qty: number; value: number }
        >();

        filteredStock.forEach((row: any) => {
          const itemId = String(row.item_id || "");
          if (!itemId) return;

          const current = itemTotals.get(itemId) || {
            qty: 0,
            value: 0,
          };

          const qty = asNumber(row.quantity);
          current.qty += qty;
          current.value += qty * asNumber(itemCostMap.get(itemId));

          itemTotals.set(itemId, current);
        });

        const inventoryInsights: ItemInsight[] = Array.from(
          itemTotals.entries()
        ).map(([id, values]) => ({
          id,
          name: itemNameMap.get(id)?.name || "Unknown Item",
          sku: itemNameMap.get(id)?.sku || "",
          qty: values.qty,
          value: values.value,
        }));

        setTopItems(
          [...inventoryInsights]
            .sort((a, b) => b.value - a.value)
            .slice(0, 6)
        );

        setSlowItems(
          [...inventoryInsights]
            .sort((a, b) => a.qty - b.qty)
            .slice(0, 6)
        );

        setStockActivities(
          stockMovementRowsRaw
            .filter((row: any) => {
              if (
                warehouseFilter !== "all" &&
                String(row.warehouse_id ?? "") !== warehouseFilter
              ) return false;

              if (
                godownFilter !== "all" &&
                String(row.godown_id ?? "") !== godownFilter
              ) return false;

              return true;
            })
            .sort((a: any, b: any) =>
              String(b.created_at || "").localeCompare(
                String(a.created_at || "")
              )
            )
            .slice(0, 7)
            .map((row: any) => ({
              id: String(row.id),
              type: String(row.type || "movement"),
              qty: asNumber(row.qty ?? row.quantity),
              reference: row.reference ?? null,
              created_at: String(row.created_at || ""),
              item_id: row.item_id ?? null,
              godown_id: row.godown_id ?? null,
            }))
        );

        setWarehouses(
          warehouseRowsRaw.map((row: any) => ({
            id: String(row.id),
            name: String(row.name || "Warehouse / ویئرہاؤس"),
          }))
        );

        setGodowns(
          godownRowsRaw
            .filter(
              (row: any) =>
                warehouseFilter === "all" ||
                String(row.warehouse_id || "") === warehouseFilter
            )
            .map((row: any) => ({
              id: String(row.id),
              name: String(row.name || "Godown / گودام"),
            }))
        );

        setCustomers(
          customerRowsRaw.map((row: any) => ({
            id: String(row.id),
            name: String(row.name || "Customer / گاہک"),
          }))
        );

        setSuppliers(
          supplierRowsRaw.map((row: any) => ({
            id: String(row.id),
            name: String(row.name || "Supplier / سپلائر"),
          }))
        );

        setSalespeople(
          Array.from(
            new Set(
              salesRows
                .map((row: any) =>
                  String(row.sales_person || "").trim()
                )
                .filter(Boolean)
            )
          ).sort()
        );

        setLastUpdated(new Date());
      } catch (error) {
        console.error("Dashboard load failed:", error);
        setDataWarning(
          "Dashboard could not load all management data."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      dateRange,
      warehouseFilter,
      godownFilter,
      salespersonFilter,
      customerFilter,
      supplierFilter,
      safeRows,
    ]
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!autoRefresh) return;

    const timer = window.setInterval(() => {
      void loadDashboard(true);
    }, 60000);

    return () => window.clearInterval(timer);
  }, [autoRefresh, loadDashboard]);

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const changeTheme = (next: ThemeMode) => {
    setTheme(next);
  };

  const toggleWidget = (id: WidgetId) => {
    setWidgets((current) =>
      current.map((widget) =>
        widget.id === id
          ? { ...widget, visible: !widget.visible }
          : widget
      )
    );
  };

  const resetDashboard = () => {
    setWidgets(DEFAULT_WIDGETS);
    setDensity("comfortable");
    setTheme("light");
  };

  const cycleWidgetSize = (id: WidgetId) => {
    setWidgets((current) =>
      current.map((widget) => {
        if (widget.id !== id) return widget;

        const currentSize = widget.size || "medium";
        const nextSize: WidgetSize =
          currentSize === "small"
            ? "medium"
            : currentSize === "medium"
            ? "large"
            : "small";

        return { ...widget, size: nextSize };
      })
    );
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.warn("Fullscreen unavailable:", error);
    }
  };

  const exportDashboard = () => {
    const rows = [
      ["Metric", "Value"],
      ["Sales Revenue / فروخت", stats.sales],
      ["Purchases / خریداری", stats.purchases],
      ["Receivables / وصولیاں", stats.receivables],
      ["Payables / واجبات", stats.payables],
      ["Cash & Bank / نقد و بینک", stats.cashBank],
      ["Inventory Value / اسٹاک ویلیو", stats.inventoryValue],
      ["Working Capital", workingCapital],
      ["Active Work Orders", stats.pendingWorkOrders],
      ["Open Sales Invoices", stats.openSalesInvoices],
      ["Open Supplier Dues", stats.openPurchaseInvoices],
      ["Stock Exceptions", stats.zeroNegativeStock],
    ];

    const csv = rows
      .map((row) =>
        row
          .map((cell) =>
            `"${String(cell).replace(/"/g, '""')}"`
          )
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `MetalForge_Dashboard_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDragStart = (
    event: DragEvent<HTMLDivElement>,
    id: WidgetId
  ) => {
    setDraggedId(id);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (
    event: DragEvent<HTMLDivElement>,
    targetId: WidgetId
  ) => {
    event.preventDefault();

    if (!draggedId || draggedId === targetId) return;

    setWidgets((current) => {
      const next = [...current];
      const from = next.findIndex((item) => item.id === draggedId);
      const to = next.findIndex((item) => item.id === targetId);

      if (from < 0 || to < 0) return current;

      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);

      return next;
    });

    setDraggedId(null);
  };

  const visibleWidgets = widgets.filter((widget) => widget.visible);

  const maxTrendValue = Math.max(
    1,
    ...trend.flatMap((row) => [row.sales, row.purchases])
  );

  const workingCapital =
    stats.cashBank + stats.receivables - stats.payables;

  const rangeLabels: Record<DateRange, string> = {
    today: "Today",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
    year: "This year",
    all: "All Time",
  };

  const renderWidget = (widget: WidgetConfig) => {
    switch (widget.id) {
      case "kpis":
        return (
          <section className="mf-kpi-grid">
            <KpiCard
              title="Sales Revenue / فروخت"
              value={money(stats.sales)}
              hint={`Ledger revenue · ${number(stats.salesCount)} posted invoices`}
              icon={<TrendingUp />}
              accent="emerald"
              onClick={() => navigate("/sales")}
            />

            <KpiCard
              title="Receivables / وصولیاں"
              value={money(stats.receivables)}
              hint={`${number(stats.openSalesInvoices)} open invoices`}
              icon={<WalletCards />}
              accent="blue"
              onClick={() => navigate("/accounting/cash-counter")}
            />

            <KpiCard
              title="Purchases / خریداری"
              value={money(stats.purchases)}
              hint={`${number(stats.purchaseCount)} posted invoices`}
              icon={<ShoppingCart />}
              accent="violet"
              onClick={() => navigate("/purchase")}
            />

            <KpiCard
              title="Payables / واجبات"
              value={money(stats.payables)}
              hint={`${number(stats.openPurchaseInvoices)} supplier dues`}
              icon={<CreditCard />}
              accent="amber"
              onClick={() => navigate("/purchase")}
            />

            <KpiCard
              title="Cash & Bank / نقد و بینک"
              value={money(stats.cashBank)}
              hint="Current ledger position / موجودہ لیجر پوزیشن"
              icon={<Banknote />}
              accent="cyan"
              onClick={() => navigate("/accounting/ledgers")}
            />

            <KpiCard
              title="Inventory Value / اسٹاک ویلیو"
              value={money(stats.inventoryValue)}
              hint="Current stock × item cost / موجودہ اسٹاک × لاگت"
              icon={<Boxes />}
              accent="rose"
              onClick={() => navigate("/godown")}
            />
          </section>
        );

      case "performance":
        return (
          <section className="mf-panel mf-panel-wide">
            <PanelHeader
              icon={<Activity />}
              title="Business Performance / کاروباری کارکردگی"
              subtitle="Sales vs purchases · 6 month trend / فروخت بمقابلہ خریداری"
            />

            <div className="mf-performance-layout">
              <div className="mf-chart-wrap">
                <div className="mf-chart-legend">
                  <span>
                    <i className="mf-dot mf-dot-sales" />Sales / فروخت</span>
                  <span>
                    <i className="mf-dot mf-dot-purchase" />
                    Purchases
                  </span>
                </div>

                <div className="mf-bars">
                  {trend.map((row) => (
                    <div className="mf-bar-group" key={row.label}>
                      <div className="mf-bar-track">
                        <div
                          className="mf-bar mf-bar-sales"
                          style={{
                            height: `${
                              (row.sales / maxTrendValue) * 100
                            }%`,
                          }}
                          title={`${row.label} Sales: ${money(
                            row.sales
                          )}`}
                        />
                        <div
                          className="mf-bar mf-bar-purchase"
                          style={{
                            height: `${
                              (row.purchases / maxTrendValue) * 100
                            }%`,
                          }}
                          title={`${row.label} Purchases: ${money(
                            row.purchases
                          )}`}
                        />
                      </div>
                      <span>{row.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mf-performance-summary">
                <MetricLine
                  label="Sales / فروخت"
                  value={money(stats.sales)}
                  icon={<ArrowUpRight />}
                  positive
                />
                <MetricLine
                  label="Purchases / خریداری"
                  value={money(stats.purchases)}
                  icon={<ArrowDownRight />}
                />
                <MetricLine
                  label="Operating movement / آپریٹنگ نتیجہ"
                  value={money(stats.netMovement)}
                  icon={
                    stats.netMovement >= 0 ? (
                      <TrendingUp />
                    ) : (
                      <TrendingDown />
                    )
                  }
                  positive={stats.netMovement >= 0}
                />

                <div className="mf-profit-box">
                  <span>Performance balance / کارکردگی بیلنس</span>
                  <strong>{money(stats.grossProfit)}</strong>
                  <small>
                    Based on available posted financial activity
                  </small>
                </div>
              </div>
            </div>
          </section>
        );

      case "cashflow":
        return (
          <section className="mf-panel">
            <PanelHeader
              icon={<CircleDollarSign />}
              title="Working Capital / ورکنگ کیپیٹل"
              subtitle="Liquidity snapshot / نقدی کی صورتحال"
            />

            <div className="mf-big-number">
              {money(workingCapital)}
            </div>

            <div className="mf-finance-stack">
              <FinanceRow
                label="Cash & Bank / نقد و بینک"
                value={stats.cashBank}
                total={
                  Math.abs(stats.cashBank) +
                  stats.receivables +
                  stats.payables
                }
                type="cash"
              />
              <FinanceRow
                label="Receivables / وصولیاں"
                value={stats.receivables}
                total={
                  Math.abs(stats.cashBank) +
                  stats.receivables +
                  stats.payables
                }
                type="receivable"
              />
              <FinanceRow
                label="Payables / واجبات"
                value={stats.payables}
                total={
                  Math.abs(stats.cashBank) +
                  stats.receivables +
                  stats.payables
                }
                type="payable"
              />
            </div>
          </section>
        );

      case "receivables":
        return (
          <CompactInsightCard
            icon={<WalletCards />}
            eyebrow="Customers / گاہک"
            title="Accounts Receivable / وصولیاں"
            value={money(stats.receivables)}
            message={`${number(
              stats.openSalesInvoices
            )} posted invoices still have an outstanding balance.`}
            action="Open receivables / وصولیاں کھولیں"
            onClick={() => navigate("/accounting/cash-counter")}
            tone="blue"
          />
        );

      case "payables":
        return (
          <CompactInsightCard
            icon={<CreditCard />}
            eyebrow="Suppliers / سپلائرز"
            title="Accounts Payable / واجبات"
            value={money(stats.payables)}
            message={`${number(
              stats.openPurchaseInvoices
            )} posted purchase invoices are awaiting settlement.`}
            action="Open purchases / خریداری کھولیں"
            onClick={() => navigate("/purchase")}
            tone="amber"
          />
        );

      case "inventory":
        return (
          <CompactInsightCard
            icon={<Boxes />}
            eyebrow="Inventory / اسٹاک"
            title="Stock Valuation / اسٹاک مالیت"
            value={money(stats.inventoryValue)}
            message={
              stats.zeroNegativeStock > 0
                ? `${stats.zeroNegativeStock} stock positions need attention.`
                : "No zero or negative stock positions detected."
            }
            action="Open inventory / اسٹاک کھولیں"
            onClick={() => navigate("/godown")}
            tone="violet"
          />
        );

      case "production":
        return (
          <CompactInsightCard
            icon={<Factory />}
            eyebrow="Production / پیداوار"
            title="Work Orders / ورک آرڈرز"
            value={number(stats.pendingWorkOrders)}
            suffix=" active"
            message="Planned and in-progress production requiring completion. / زیرِ تکمیل پیداواری کام"
            action="Open production / پیداوار کھولیں"
            onClick={() => navigate("/production")}
            tone="emerald"
          />
        );

      case "alerts": {
        const alerts = [
          {
            label: "Customer collections",
            value: stats.openSalesInvoices,
            text: "open invoices",
            critical: stats.openSalesInvoices > 0,
            route: "/accounting/cash-counter",
          },
          {
            label: "Supplier payments",
            value: stats.openPurchaseInvoices,
            text: "supplier dues",
            critical: stats.openPurchaseInvoices > 0,
            route: "/purchase",
          },
          {
            label: "Production queue",
            value: stats.pendingWorkOrders,
            text: "active work orders",
            critical: stats.pendingWorkOrders > 0,
            route: "/production",
          },
          {
            label: "Stock exceptions",
            value: stats.zeroNegativeStock,
            text: "zero / negative positions",
            critical: stats.zeroNegativeStock > 0,
            route: "/godown",
          },
        ];

        return (
          <section className="mf-panel">
            <PanelHeader
              icon={<Zap />}
              title="Attention Center / توجہ مرکز"
              subtitle="Items requiring action / ضروری کارروائیاں"
            />

            <div className="mf-alert-list">
              {alerts.map((alert) => (
                <button
                  key={alert.label}
                  className="mf-alert-row"
                  onClick={() => navigate(alert.route)}
                >
                  <span
                    className={
                      alert.critical
                        ? "mf-alert-icon mf-alert-icon-warning"
                        : "mf-alert-icon mf-alert-icon-ok"
                    }
                  >
                    {alert.critical ? <Zap /> : <Check />}
                  </span>

                  <span className="mf-alert-copy">
                    <strong>{alert.label}</strong>
                    <small>
                      {alert.value} {alert.text}
                    </small>
                  </span>

                  <ArrowRight />
                </button>
              ))}
            </div>
          </section>
        );
      }

      case "activity":
        return (
          <section className="mf-panel mf-panel-wide">
            <PanelHeader
              icon={<PanelTop />}
              title="Recent Accounting Activity / حالیہ اکاؤنٹنگ"
              subtitle="Latest posted journals / تازہ پوسٹ شدہ جرنلز"
              action={
                <button
                  className="mf-link-button"
                  onClick={() => navigate("/accounting")}
                >
                  View journal
                  <ArrowRight />
                </button>
              }
            />

            <div className="mf-activity-list">
              {activities.length === 0 ? (
                <div className="mf-empty">
                  No recent posted journal activity.
                </div>
              ) : (
                activities.map((activity) => (
                  <button
                    key={activity.id}
                    className="mf-activity-row"
                    onClick={() =>
                      navigate(`/accounting/${activity.id}`)
                    }
                  >
                    <span className="mf-activity-badge">
                      <Activity />
                    </span>

                    <span className="mf-activity-main">
                      <strong>{activity.entry_no}</strong>
                      <small>
                        {activity.description || "Journal Entry"}
                      </small>
                    </span>

                    <span className="mf-activity-date">
                      {new Date(
                        `${activity.entry_date}T00:00:00`
                      ).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
        );

      case "stockMovements":
        return (
          <section className="mf-panel">
            <PanelHeader
              icon={<Boxes />}
              title="Recent Stock Movements / حالیہ اسٹاک موومنٹس"
              subtitle="Latest inventory activity / تازہ اسٹاک سرگرمی"
            />

            <div className="mf-activity-list">
              {stockActivities.length === 0 ? (
                <div className="mf-empty">
                  No recent stock movement.
                </div>
              ) : (
                stockActivities.map((movement) => (
                  <button
                    key={movement.id}
                    className="mf-activity-row"
                    onClick={() => navigate("/godown")}
                  >
                    <span className="mf-activity-badge">
                      <Boxes />
                    </span>

                    <span className="mf-activity-main">
                      <strong>
                        {movement.type.toUpperCase()} ·{" "}
                        {number(movement.qty)}
                      </strong>
                      <small>
                        {movement.reference || "Stock movement"}
                      </small>
                    </span>

                    <span className="mf-activity-date">
                      {movement.created_at
                        ? new Date(
                            movement.created_at
                          ).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                          })
                        : "—"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
        );

      case "topItems":
        return (
          <section className="mf-panel">
            <PanelHeader
              icon={<Trophy />}
              title="Top Inventory Items / اہم اسٹاک آئٹمز"
              subtitle="Highest inventory value / زیادہ مالیت والا اسٹاک"
            />

            <div className="mf-ranking-list">
              {topItems.length === 0 ? (
                <div className="mf-empty">
                  No inventory data.
                </div>
              ) : (
                topItems.map((item, index) => (
                  <button
                    key={item.id}
                    className="mf-ranking-row"
                    onClick={() => navigate("/godown")}
                  >
                    <span className="mf-rank-no">
                      {index + 1}
                    </span>

                    <span className="mf-ranking-copy">
                      <strong>{item.name}</strong>
                      <small>
                        {item.sku || "No SKU"} · Qty{" "}
                        {number(item.qty)}
                      </small>
                    </span>

                    <strong className="mf-ranking-value">
                      {money(item.value)}
                    </strong>
                  </button>
                ))
              )}
            </div>
          </section>
        );

      case "slowItems":
        return (
          <section className="mf-panel">
            <PanelHeader
              icon={<TrendingDown />}
              title="Slow / Low Stock / کم اسٹاک"
              subtitle="Lowest quantity positions / کم مقدار والا اسٹاک"
            />

            <div className="mf-ranking-list">
              {slowItems.length === 0 ? (
                <div className="mf-empty">
                  No inventory data.
                </div>
              ) : (
                slowItems.map((item) => (
                  <button
                    key={item.id}
                    className="mf-ranking-row"
                    onClick={() => navigate("/godown")}
                  >
                    <span
                      className={`mf-stock-health ${
                        item.qty <= 0 ? "critical" : ""
                      }`}
                    />

                    <span className="mf-ranking-copy">
                      <strong>{item.name}</strong>
                      <small>{item.sku || "No SKU"}</small>
                    </span>

                    <strong className="mf-ranking-value">
                      {number(item.qty)}
                    </strong>
                  </button>
                ))
              )}
            </div>
          </section>
        );

      case "quickActions":
        return (
          <section className="mf-panel">
            <PanelHeader
              icon={<Sparkles />}
              title="Quick Actions / فوری کارروائیاں"
              subtitle="Start common workflows / عام کام شروع کریں"
            />

            <div className="mf-actions-grid">
              <QuickAction
                icon={<ShoppingCart />}
                label="New Sale / نئی فروخت"
                onClick={() => navigate("/sales/new")}
              />
              <QuickAction
                icon={<PackageSearch />}
                label="Purchase / خریداری"
                onClick={() => navigate("/purchase")}
              />
              <QuickAction
                icon={<Banknote />}
                label="Receipt / رسید"
                onClick={() => navigate("/accounting/cash-counter")}
              />
              <QuickAction
                icon={<Factory />}
                label="Work Order / ورک آرڈر"
                onClick={() => navigate("/production")}
              />
              <QuickAction
                icon={<Boxes />}
                label="Stock / اسٹاک"
                onClick={() => navigate("/godown")}
              />
              <QuickAction
                icon={<Plus />}
                label="Journal / جرنل"
                onClick={() => navigate("/accounting")}
              />
            </div>
          </section>
        );

      default:
        return null;
    }
  };

  return (
    <div className="mf-dashboard-shell">
      <div className="mf-dashboard-ambient mf-dashboard-ambient-one" />
      <div className="mf-dashboard-ambient mf-dashboard-ambient-two" />

      <header className="mf-dashboard-header">
        <div className="mf-dashboard-heading">
          <div className="mf-heading-kicker">
            <LayoutDashboard />
            Executive Command Center
          </div>

          <h1>Business Overview / کاروباری جائزہ</h1>

          <p>
            Live financial, inventory and operational intelligence in
            one place.
          </p>
        </div>

        <div className="mf-dashboard-toolbar">
          <div className="mf-range-wrap">
            <button
              className="mf-toolbar-button"
              onClick={() => setRangeOpen((current) => !current)}
            >
              <CalendarDays />
              {rangeLabels[dateRange]}
              <ChevronDown />
            </button>

            {rangeOpen && (
              <div className="mf-range-menu">
                {(
                  [
                    "today",
                    "7d",
                    "30d",
                    "90d",
                    "year",
                    "all",
                  ] as DateRange[]
                ).map((range) => (
                  <button
                    key={range}
                    onClick={() => {
                      setDateRange(range);
                      setRangeOpen(false);
                    }}
                    className={
                      dateRange === range ? "active" : ""
                    }
                  >
                    {rangeLabels[range]}
                    {dateRange === range && <Check />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="mf-toolbar-button mf-icon-button"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            title="Refresh dashboard / ڈیش بورڈ تازہ کریں"
          >
            <RefreshCw
              className={refreshing ? "mf-spin" : ""}
            />
          </button>


          <button
            className={`mf-toolbar-button ${
              autoRefresh ? "mf-toolbar-active" : ""
            }`}
            onClick={() => setAutoRefresh((current) => !current)}
            title="Auto refresh every 60 seconds / ہر 60 سیکنڈ بعد تازہ کریں"
          >
            <TimerReset />
            Auto
          </button>

          <button
            className="mf-toolbar-button mf-icon-button"
            onClick={exportDashboard}
            title="Export dashboard CSV / CSV ایکسپورٹ کریں"
          >
            <FileDown />
          </button>

          <button
            className="mf-toolbar-button mf-icon-button"
            onClick={() => window.print()}
            title="Print executive summary / خلاصہ پرنٹ کریں"
          >
            <Printer />
          </button>

          <button
            className="mf-toolbar-button mf-icon-button"
            onClick={toggleFullscreen}
            title="Fullscreen dashboard / مکمل اسکرین"
          >
            {isFullscreen ? <Minimize2 /> : <Maximize2 />}
          </button>

          <button
            className="mf-toolbar-button"
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <Filter />
            Filters
          </button>

          <button
            className="mf-toolbar-button mf-customize-button"
            onClick={() => setCustomizeOpen(true)}
          >
            <Settings2 />
            Customize
          </button>
        </div>
      </header>

      <div className="mf-dashboard-status">
        <span className="mf-live-pill">
          <i />
          Live ERP data
        </span>

        <span>
          {lastUpdated
            ? `Updated ${lastUpdated.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : "Loading latest data"}
        </span>

        <span className="mf-status-separator">•</span>

        <span>
          Drag widgets to rearrange your workspace
        </span>
      </div>

      {filtersOpen && (
        <section className="mf-filter-panel">
          <div className="mf-filter-heading">
            <span>
              <Filter />
              Management Filters
            </span>

            <button
              onClick={() => {
                setWarehouseFilter("all");
                setGodownFilter("all");
                setSalespersonFilter("all");
                setCustomerFilter("all");
                setSupplierFilter("all");
              }}
            >
              <RotateCcw />
              Clear
            </button>
          </div>

          <div className="mf-filter-grid">
            <label>
              <span>Warehouse / ویئرہاؤس</span>
              <select
                value={warehouseFilter}
                onChange={(event) => {
                  setWarehouseFilter(event.target.value);
                  setGodownFilter("all");
                }}
              >
                <option value="all">All Warehouses / تمام ویئرہاؤسز</option>
                {warehouses.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Godown / گودام</span>
              <select
                value={godownFilter}
                onChange={(event) =>
                  setGodownFilter(event.target.value)
                }
              >
                <option value="all">All Godowns / تمام گودام</option>
                {godowns.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Salesperson / سیلز پرسن</span>
              <select
                value={salespersonFilter}
                onChange={(event) =>
                  setSalespersonFilter(event.target.value)
                }
              >
                <option value="all">All Salespeople / تمام سیلز پرسن</option>
                {salespeople.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Customer / گاہک</span>
              <select
                value={customerFilter}
                onChange={(event) =>
                  setCustomerFilter(event.target.value)
                }
              >
                <option value="all">All Customers / تمام گاہک</option>
                {customers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Supplier / سپلائر</span>
              <select
                value={supplierFilter}
                onChange={(event) =>
                  setSupplierFilter(event.target.value)
                }
              >
                <option value="all">All Suppliers / تمام سپلائرز</option>
                {suppliers.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      )}

      {dataWarning && (
        <div className="mf-data-warning">
          <Zap />
          {dataWarning}
        </div>
      )}

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <main className="mf-dashboard-grid">
          {visibleWidgets.map((widget) => (
            <div
              key={widget.id}
              draggable
              onDragStart={(event) =>
                handleDragStart(event, widget.id)
              }
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, widget.id)}
              className={`mf-widget mf-widget-${widget.id} mf-widget-size-${
                widget.size || "medium"
              } ${
                draggedId === widget.id ? "mf-dragging" : ""
              }`}
            >
              <div className="mf-widget-controls">
                <button
                  type="button"
                  title={`Size: ${widget.size || "medium"}`}
                  onClick={() => cycleWidgetSize(widget.id)}
                >
                  <PanelTop />
                </button>

                <span
                  className="mf-widget-drag-handle"
                  title="Drag to reorder / ترتیب بدلنے کیلئے کھینچیں"
                >
                  <GripVertical />
                </span>
              </div>

              {renderWidget(widget)}
            </div>
          ))}
        </main>
      )}

      {customizeOpen && (
        <>
          <button
            className="mf-customize-backdrop"
            aria-label="Close customization / کسٹمائزیشن بند کریں"
            onClick={() => setCustomizeOpen(false)}
          />

          <aside className="mf-customize-drawer">
            <div className="mf-drawer-header">
              <div>
                <span className="mf-drawer-kicker">
                  Workspace settings
                </span>
                <h2>Customize Dashboard / ڈیش بورڈ حسبِ ضرورت</h2>
                <p>
                  Choose widgets, appearance and information density.
                </p>
              </div>

              <button
                className="mf-drawer-close"
                onClick={() => setCustomizeOpen(false)}
              >
                <X />
              </button>
            </div>

            <div className="mf-drawer-section">
              <label>Appearance / ظاہری شکل</label>

              <div className="mf-theme-cards">
                <ThemeCard
                  label="Light / روشن"
                  active={theme === "light"}
                  icon={<Sun />}
                  onClick={() => changeTheme("light")}
                  mode="light"
                />
                <ThemeCard
                  label="Dark / ڈارک"
                  active={theme === "dark"}
                  icon={<Moon />}
                  onClick={() => changeTheme("dark")}
                  mode="dark"
                />
                <ThemeCard
                  label="Black / بلیک"
                  active={theme === "black"}
                  icon={<span className="mf-black-dot" />}
                  onClick={() => changeTheme("black")}
                  mode="black"
                />
              </div>
            </div>

            <div className="mf-drawer-section">
              <label>Density / کثافت</label>

              <div className="mf-segmented">
                <button
                  className={
                    density === "comfortable" ? "active" : ""
                  }
                  onClick={() => setDensity("comfortable")}
                >
                  Comfortable
                </button>
                <button
                  className={
                    density === "compact" ? "active" : ""
                  }
                  onClick={() => setDensity("compact")}
                >
                  Compact
                </button>
              </div>
            </div>

            <div className="mf-drawer-section">
              <div className="mf-drawer-section-title">
                <label>Dashboard widgets / ڈیش بورڈ ویجٹس</label>
                <small>Drag on dashboard to reorder / ترتیب بدلنے کیلئے ڈریگ کریں</small>
              </div>

              <div className="mf-widget-toggle-list">
                {widgets.map((widget) => (
                  <div
                    key={widget.id}
                    className="mf-widget-toggle-row"
                  >
                    <button
                      className="mf-widget-toggle-copy"
                      onClick={() => cycleWidgetSize(widget.id)}
                      title="Change widget size / ویجٹ کا سائز بدلیں"
                    >
                      <GripVertical />
                      <span>
                        {widget.title}
                        <small>
                          {widget.size || "medium"}
                        </small>
                      </span>
                    </button>

                    <button
                      onClick={() => toggleWidget(widget.id)}
                      className={`mf-toggle ${
                        widget.visible ? "active" : ""
                      }`}
                      title={
                        widget.visible
                          ? "Hide widget"
                          : "Show widget"
                      }
                    >
                      <i />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mf-drawer-footer">
              <button
                className="mf-reset-button"
                onClick={resetDashboard}
              >
                <RotateCcw />
                Reset defaults
              </button>

              <button
                className="mf-done-button"
                onClick={() => setCustomizeOpen(false)}
              >
                <Check />
                Done
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  hint,
  icon,
  accent,
  onClick,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  accent:
    | "emerald"
    | "blue"
    | "violet"
    | "amber"
    | "cyan"
    | "rose";
  onClick: () => void;
}) {
  return (
    <button
      className={`mf-kpi-card mf-accent-${accent}`}
      onClick={onClick}
    >
      <span className="mf-kpi-icon">{icon}</span>

      <span className="mf-kpi-title">{title}</span>

      <strong>{value}</strong>

      <span className="mf-kpi-footer">
        {hint}
        <ArrowUpRight />
      </span>
    </button>
  );
}

function PanelHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mf-panel-header">
      <div className="mf-panel-heading">
        <span className="mf-panel-icon">{icon}</span>
        <span>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
      </div>

      {action}
    </div>
  );
}

function MetricLine({
  label,
  value,
  icon,
  positive = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  positive?: boolean;
}) {
  return (
    <div className="mf-metric-line">
      <span
        className={
          positive
            ? "mf-metric-icon positive"
            : "mf-metric-icon"
        }
      >
        {icon}
      </span>

      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  );
}

function FinanceRow({
  label,
  value,
  total,
  type,
}: {
  label: string;
  value: number;
  total: number;
  type: "cash" | "receivable" | "payable";
}) {
  const width =
    total > 0
      ? Math.max(6, (Math.abs(value) / total) * 100)
      : 6;

  return (
    <div className="mf-finance-row">
      <div>
        <span>{label}</span>
        <strong>{money(value)}</strong>
      </div>

      <div className="mf-finance-track">
        <i
          className={`mf-finance-fill ${type}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function CompactInsightCard({
  icon,
  eyebrow,
  title,
  value,
  suffix,
  message,
  action,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  value: string;
  suffix?: string;
  message: string;
  action: string;
  onClick: () => void;
  tone: "blue" | "amber" | "violet" | "emerald";
}) {
  return (
    <section className={`mf-panel mf-insight mf-insight-${tone}`}>
      <div className="mf-insight-top">
        <span className="mf-insight-icon">{icon}</span>

        <span className="mf-insight-copy">
          <small>{eyebrow}</small>
          <strong>{title}</strong>
        </span>
      </div>

      <div className="mf-insight-value">
        {value}
        {suffix && <small>{suffix}</small>}
      </div>

      <p>{message}</p>

      <button onClick={onClick}>
        {action}
        <ArrowRight />
      </button>
    </section>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="mf-quick-action" onClick={onClick}>
      <span>{icon}</span>
      {label}
    </button>
  );
}

function ThemeCard({
  label,
  active,
  icon,
  onClick,
  mode,
}: {
  label: string;
  active: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  mode: ThemeMode;
}) {
  return (
    <button
      className={`mf-theme-card mf-theme-preview-${mode} ${
        active ? "active" : ""
      }`}
      onClick={onClick}
    >
      <span className="mf-theme-preview">
        <i />
        <b />
        <em />
      </span>

      <span className="mf-theme-card-footer">
        {icon}
        {label}
        {active && <Check />}
      </span>
    </button>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mf-dashboard-skeleton">
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={index} className="mf-skeleton-card">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
