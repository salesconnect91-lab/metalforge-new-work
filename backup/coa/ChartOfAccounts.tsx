<<<<<<< HEAD
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  activateAccount,
  deactivateAccount,
  deleteAccount,
  listAccounts,
  saveAccount,
  ACCOUNT_DETAIL_TYPES,
  ACCOUNT_STATEMENTS,
  ACCOUNT_TYPE_LABELS,
} from "@/lib/accountService";

import { ChartOfAccount } from "@/types";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense";

type AccountRow = ChartOfAccount & {
  parent_id?: string | null;
  is_group?: boolean;
  allow_manual_entries?: boolean;
  is_active?: boolean;
  detail_type?: string | null;
  parent_head?: string | null;
  account_role?: string | null;
  is_system_account?: boolean;
};

type AccountForm = {
  id?: string;
  code: string;
  name: string;
  type: AccountType;
  parent_id: string | null;
  is_group: boolean;
  allow_manual_entries: boolean;
  is_active: boolean;
  detail_type: string;
  account_role: string;
  parent_head: string;
};

type DetailOption = {
  value: string;
  label: string;
  role: string;
};

/* -------------------------------------------------------------------------- */
/* Account types                                                               */
/* -------------------------------------------------------------------------- */

const ACCOUNT_TYPES: Array<{
  value: AccountType;
  label: string;
  statement: string;
}> = [
  {
    value: "asset",
    label: "Asset",
    statement: "Balance Sheet",
  },
  {
    value: "liability",
    label: "Liability",
    statement: "Balance Sheet",
  },
  {
    value: "equity",
    label: "Equity",
    statement: "Balance Sheet",
  },
  {
    value: "revenue",
    label: "Income",
    statement: "Profit & Loss",
  },
  {
    value: "expense",
    label: "Expense",
    statement: "Profit & Loss",
  },
];

/* -------------------------------------------------------------------------- */
/* Automatic root code ranges                                                  */
/* -------------------------------------------------------------------------- */

const ROOT_CODE_BASE: Record<AccountType, number> = {
  asset: 1000,
  liability: 2000,
  equity: 3000,
  revenue: 4000,
  expense: 5000,
};

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const TYPE_STYLES: Record<
  AccountType,
  {
    badge: string;
    dot: string;
  }
> = {
  asset: {
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },

  liability: {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },

  equity: {
    badge: "bg-purple-50 text-purple-700 border-purple-200",
    dot: "bg-purple-500",
  },

  revenue: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },

  expense: {
    badge: "bg-rose-50 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
  },
};

/* -------------------------------------------------------------------------- */
/* Empty form                                                                 */
/* -------------------------------------------------------------------------- */

const emptyForm: AccountForm = {
  code: "",
  name: "",
  type: "asset",
  parent_id: null,
  is_group: false,
  allow_manual_entries: true,
  is_active: true,
  detail_type: "",
  account_role: "general",
  parent_head: "",
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getChildren(
  accounts: AccountRow[],
  parentId: string | null
): AccountRow[] {
  return accounts
    .filter(
      (account) =>
        (account.parent_id ?? null) === parentId
    )
    .sort((a, b) =>
      a.code.localeCompare(b.code, undefined, {
        numeric: true,
      })
    );
}

function hasChildren(
  accounts: AccountRow[],
  accountId: string
): boolean {
  return accounts.some(
    (account) =>
      account.parent_id === accountId
  );
}

/**
 * Generate the next code automatically.
 *
 * Root:
 * Asset      -> 1000, 1001, 1002...
 * Liability  -> 2000, 2001, 2002...
 * Equity     -> 3000...
 * Income     -> 4000...
 * Expense    -> 5000...
 *
 * Child:
 * 1000 -> 1001, 1002...
 * 1100 -> 1101, 1102...
 *
 * The actual hierarchy remains controlled by parent_id.
 */
function generateAccountCode(
  accounts: AccountRow[],
  type: AccountType,
  parentId: string | null
): string {
  const siblings = accounts.filter(
    (account) =>
      account.type === type &&
      (account.parent_id ?? null) === parentId
  );

  if (!parentId) {
    const base = ROOT_CODE_BASE[type];

    const used = siblings
      .map((account) =>
        Number.parseInt(account.code, 10)
      )
      .filter((value) => Number.isFinite(value));

    let next = base;

    while (used.includes(next)) {
      next += 1;
    }

    return String(next);
  }

  const parent = accounts.find(
    (account) => account.id === parentId
  );

  if (!parent) {
    return generateAccountCode(
      accounts,
      type,
      null
    );
  }

  const parentCode =
    Number.parseInt(parent.code, 10);

  if (!Number.isFinite(parentCode)) {
    return "";
  }

  /**
   * Try a child code by incrementing from the parent.
   * Example:
   *
   * Parent 1000
   * Children 1001, 1002...
   */
  let next = parentCode + 1;

  const used = siblings
    .map((account) =>
      Number.parseInt(account.code, 10)
    )
    .filter((value) => Number.isFinite(value));

  while (used.includes(next)) {
    next += 1;
  }

  return String(next);
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<
    AccountRow[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");

  const [typeFilter, setTypeFilter] =
    useState<"all" | AccountType>("all");

  const [statusFilter, setStatusFilter] =
    useState<"all" | "active" | "inactive">(
      "active"
    );

  const [expanded, setExpanded] =
    useState<Set<string>>(new Set());

  const [showModal, setShowModal] =
    useState(false);

  const [editingAccount, setEditingAccount] =
    useState<AccountRow | null>(null);

  const [form, setForm] =
    useState<AccountForm>(emptyForm);
=======
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AccountType,
  AccountMapping,
  ChartOfAccount,
} from "@/types";

import {
  DEFAULT_MAPPINGS,
  activateAccount,
  deactivateAccount,
  deleteAccount,
  ensureDefaultChartOfAccounts,
  listAccounts,
  listMappings,
  saveAccount,
  setMapping,
} from "@/lib/accountService";

import {
  PageHeader,
  Modal,
  ErrorBanner,
  ConfirmModal,
} from "@/components/ui";


const TYPE_META: Record<
  AccountType,
  {
    label: string;
    prefix: string;
    color: string;
  }
> = {
  asset: {
    label: "Asset",
    prefix: "1",
    color: "bg-emerald-100 text-emerald-800",
  },

  liability: {
    label: "Liability",
    prefix: "2",
    color: "bg-rose-100 text-rose-800",
  },

  equity: {
    label: "Equity",
    prefix: "3",
    color: "bg-slate-100 text-slate-800",
  },

  revenue: {
    label: "Revenue",
    prefix: "4",
    color: "bg-blue-100 text-blue-800",
  },

  expense: {
    label: "Expense",
    prefix: "5",
    color: "bg-amber-100 text-amber-800",
  },
};


const emptyForm = {
  code: "",
  name: "",
  type: "expense" as AccountType,

  parent_id: null as string | null,

  is_group: false,

  allow_manual_entries: true,

  is_active: true,

  detail_type: "",

  parent_head: "",

  account_role: "general",

  description: "",
};


/**
 * Generate next code.
 *
 * Example:
 *
 * 1120 Banks
 * 1121 Rajhi Bank
 * 1122 HBL Bank
 * 1123 Meezan Bank
 */
function nextChildCode(
  accounts: ChartOfAccount[],
  parent: ChartOfAccount
) {
  const parentCode = Number(parent.code);

  const children = accounts
    .filter((a) => a.parent_id === parent.id)
    .map((a) => Number(a.code))
    .filter(Number.isFinite);

  if (!children.length) {
    return String(parentCode + 1).padStart(4, "0");
  }

  return String(Math.max(...children) + 1).padStart(4, "0");
}


/**
 * Generate next root code.
 */
function nextRootCode(
  accounts: ChartOfAccount[],
  type: AccountType
) {
  const prefix = TYPE_META[type].prefix;

  const used = accounts
    .filter(
      (a) =>
        a.type === type &&
        a.code.startsWith(prefix)
    )
    .map((a) => Number(a.code))
    .filter(Number.isFinite);

  const max = used.length
    ? Math.max(...used)
    : Number(`${prefix}000`);

  return String(max + 1).padStart(4, "0");
}


export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);

  const [mappings, setMappings] =
    useState<AccountMapping[]>([]);

  const [loading, setLoading] =
    useState(true);
>>>>>>> 802f955ede1551985947b9a2621bfc851a03363b

  const [error, setError] =
    useState<string | null>(null);

<<<<<<< HEAD
  const [success, setSuccess] =
    useState<string | null>(null);

  /* ------------------------------------------------------------------------ */
  /* Load                                                                     */
  /* ------------------------------------------------------------------------ */

  async function loadAccounts() {
    try {
      setLoading(true);
      setError(null);

      const data = await listAccounts();

      const rows = (data ?? []) as AccountRow[];

      setAccounts(rows);

      const rootGroups = rows
        .filter(
          (account) =>
            !account.parent_id &&
            account.is_group
        )
        .map((account) => account.id);

      setExpanded(new Set(rootGroups));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load Chart of Accounts."
=======
  const [modalOpen, setModalOpen] =
    useState(false);

  const [editing, setEditing] =
    useState<ChartOfAccount | null>(null);

  const [deleteId, setDeleteId] =
    useState<string | null>(null);

  const [filter, setFilter] =
    useState<"all" | AccountType>("all");

  const [search, setSearch] =
    useState("");

  const [form, setForm] =
    useState(emptyForm);


  /**
   * Load COA + mappings.
   */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await ensureDefaultChartOfAccounts();

      const [accountsData, mappingsData] =
        await Promise.all([
          listAccounts(),
          listMappings(),
        ]);

      setAccounts(accountsData);
      setMappings(mappingsData);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : String(e)
>>>>>>> 802f955ede1551985947b9a2621bfc851a03363b
      );
    } finally {
      setLoading(false);
    }
<<<<<<< HEAD
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Detail types                                                             */
  /* ------------------------------------------------------------------------ */

  const detailTypes = useMemo(() => {
    return (
      ACCOUNT_DETAIL_TYPES[
        form.type
      ] as readonly DetailOption[]
    ) ?? [];
  }, [form.type]);

  const selectedDetail = useMemo(() => {
    return detailTypes.find(
      (item) =>
        item.value === form.detail_type
    );
  }, [detailTypes, form.detail_type]);

  /* ------------------------------------------------------------------------ */
  /* Automatically generated code                                             */
  /* ------------------------------------------------------------------------ */

  const generatedCode = useMemo(() => {
    if (editingAccount) {
      return form.code;
    }

    return generateAccountCode(
      accounts,
      form.type,
      form.parent_id
    );
  }, [
    accounts,
    form.type,
    form.parent_id,
    editingAccount,
    form.code,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Filter                                                                   */
  /* ------------------------------------------------------------------------ */

  const filteredAccounts = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

    return accounts.filter((account) => {
      const matchesSearch =
        !query ||
        account.code
          .toLowerCase()
          .includes(query) ||
        account.name
          .toLowerCase()
          .includes(query);

      const matchesType =
        typeFilter === "all" ||
        account.type === typeFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active"
          ? account.is_active !== false
          : account.is_active === false);

      return (
        matchesSearch &&
        matchesType &&
        matchesStatus
      );
    });
  }, [
    accounts,
    search,
    typeFilter,
    statusFilter,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Visible accounts                                                         */
  /* ------------------------------------------------------------------------ */

  const visibleIds = useMemo(() => {
    const result = new Set<string>();

    function walk(parentId: string | null) {
      const children = getChildren(
        filteredAccounts,
        parentId
      );

      for (const child of children) {
        result.add(child.id);

        if (
          child.is_group &&
          expanded.has(child.id)
        ) {
          walk(child.id);
        }
      }
    }

    walk(null);

    return result;
  }, [filteredAccounts, expanded]);

  const visibleAccounts = useMemo(
    () =>
      filteredAccounts.filter((account) =>
        visibleIds.has(account.id)
      ),
    [filteredAccounts, visibleIds]
  );

  const rootAccounts = useMemo(
    () =>
      getChildren(
        filteredAccounts,
        null
      ),
    [filteredAccounts]
  );

  /* ------------------------------------------------------------------------ */
  /* Parent accounts                                                          */
  /* ------------------------------------------------------------------------ */

  const groupAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.is_group &&
          account.is_active !== false
=======
  }, []);


  useEffect(() => {
    void load();
  }, [load]);


  /**
   * Group accounts.
   */
  const groups = useMemo(
    () =>
      accounts.filter(
        (a) =>
          a.is_group &&
          a.is_active
>>>>>>> 802f955ede1551985947b9a2621bfc851a03363b
      ),
    [accounts]
  );

<<<<<<< HEAD
  const availableParents = useMemo(
    () =>
      groupAccounts
        .filter((account) => {
          if (
            editingAccount?.id ===
            account.id
          ) {
            return false;
          }

          return account.type === form.type;
        })
        .sort((a, b) =>
          a.code.localeCompare(
            b.code,
            undefined,
            { numeric: true }
          )
        ),
    [
      groupAccounts,
      form.type,
      editingAccount,
    ]
  );

  /* ------------------------------------------------------------------------ */
  /* Summary                                                                  */
  /* ------------------------------------------------------------------------ */

  const totalAccounts =
    accounts.length;

  const activeAccounts =
    accounts.filter(
      (account) =>
        account.is_active !== false
    ).length;

  const groupCount =
    accounts.filter(
      (account) =>
        account.is_group
    ).length;

  const postingCount =
    accounts.filter(
      (account) =>
        !account.is_group
    ).length;

  /* ------------------------------------------------------------------------ */
  /* Tree controls                                                            */
  /* ------------------------------------------------------------------------ */

  function toggleExpanded(id: string) {
    setExpanded((previous) => {
      const next = new Set(previous);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function expandAll() {
    setExpanded(
      new Set(
        accounts
          .filter(
            (account) =>
              account.is_group
          )
          .map(
            (account) => account.id
          )
      )
    );
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  /* ------------------------------------------------------------------------ */
  /* New account                                                              */
  /* ------------------------------------------------------------------------ */

  function openNewAccount(
    parent?: AccountRow
  ) {
    setEditingAccount(null);

    const type =
      parent?.type ?? "asset";

    const parentId =
      parent?.id ?? null;

    const autoCode =
      generateAccountCode(
        accounts,
        type,
        parentId
      );
=======

  /**
   * Search/filter.
   *
   * Parents remain visible when searching a child.
   */
  const visible = useMemo(() => {
    const q = search
      .trim()
      .toLowerCase();

    if (!q && filter === "all") {
      return accounts;
    }

    const matchingIds = new Set<string>();

    for (const account of accounts) {
      const matchesSearch =
        !q ||
        account.code
          .toLowerCase()
          .includes(q) ||
        account.name
          .toLowerCase()
          .includes(q) ||
        (account.detail_type ?? "")
          .toLowerCase()
          .includes(q);

      const matchesType =
        filter === "all" ||
        account.type === filter;

      if (matchesSearch && matchesType) {
        matchingIds.add(account.id);

        let parentId =
          account.parent_id;

        while (parentId) {
          matchingIds.add(parentId);

          const parent =
            accounts.find(
              (a) =>
                a.id === parentId
            );

          parentId =
            parent?.parent_id ?? null;
        }
      }
    }

    return accounts.filter(
      (a) =>
        matchingIds.has(a.id)
    );
  }, [accounts, filter, search]);


  /**
   * Parent lookup.
   */
  const childrenByParent =
    useMemo(() => {
      const map = new Map<
        string | null,
        ChartOfAccount[]
      >();

      for (const account of visible) {
        const key =
          account.parent_id ?? null;

        const existing =
          map.get(key) ?? [];

        existing.push(account);

        map.set(key, existing);
      }

      for (const list of map.values()) {
        list.sort(
          (a, b) =>
            Number(a.code) -
            Number(b.code)
        );
      }

      return map;
    }, [visible]);


  /**
   * Full account path.
   */
  const accountPath = useCallback(
    (account: ChartOfAccount) => {
      const parts: string[] = [];

      let current:
        | ChartOfAccount
        | undefined = account;

      const guard =
        new Set<string>();

      while (
        current &&
        !guard.has(current.id)
      ) {
        guard.add(current.id);

        parts.unshift(
          `${current.code} ${current.name}`
        );

        current = current.parent_id
          ? accounts.find(
              (a) =>
                a.id ===
                current!.parent_id
            )
          : undefined;
      }

      return parts.join(" / ");
    },
    [accounts]
  );


  /**
   * Open new account form.
   */
  const openCreate = () => {
    setEditing(null);

    const type: AccountType =
      "expense";
>>>>>>> 802f955ede1551985947b9a2621bfc851a03363b

    setForm({
      ...emptyForm,

      type,

<<<<<<< HEAD
      parent_id:
        parentId,
=======
      code: nextRootCode(
        accounts,
        type
      ),
    });

    setModalOpen(true);
  };


  /**
   * Create a child account directly
   * under a selected group.
   */
  const openCreateChild = (
    parent: ChartOfAccount
  ) => {
    setEditing(null);

    setForm({
      ...emptyForm,

      type: parent.type,

      parent_id: parent.id,

      code: nextChildCode(
        accounts,
        parent
      ),
>>>>>>> 802f955ede1551985947b9a2621bfc851a03363b

      is_group: false,

      allow_manual_entries: true,

<<<<<<< HEAD
      detail_type: "",

      code: autoCode,
    });

    setError(null);
    setSuccess(null);
    setShowModal(true);
  }

  /* ------------------------------------------------------------------------ */
  /* Edit account                                                             */
  /* ------------------------------------------------------------------------ */

  function openEdit(
    account: AccountRow
  ) {
    setEditingAccount(account);

    setForm({
      id: account.id,

=======
      account_role: "general",
    });

    setModalOpen(true);
  };


  /**
   * Edit account.
   */
  const openEdit = (
    account: ChartOfAccount
  ) => {
    setEditing(account);

    setForm({
>>>>>>> 802f955ede1551985947b9a2621bfc851a03363b
      code: account.code,

      name: account.name,

      type: account.type,

      parent_id:
<<<<<<< HEAD
        account.parent_id ??
        null,

      is_group:
        account.is_group ??
        false,

      allow_manual_entries:
        account.allow_manual_entries ??
        true,

      is_active:
        account.is_active !== false,

      detail_type:
        account.detail_type ??
        "",
=======
        account.parent_id,

      is_group:
        account.is_group,

      allow_manual_entries:
        account.allow_manual_entries,

      is_active:
        account.is_active,

      detail_type:
        account.detail_type ?? "",

      parent_head:
        account.parent_head ?? "",
>>>>>>> 802f955ede1551985947b9a2621bfc851a03363b

      account_role:
        account.account_role ??
        "general",

<<<<<<< HEAD
      parent_head:
        account.parent_head ??
        "",
    });

    setError(null);
    setSuccess(null);
    setShowModal(true);
  }

  /* ------------------------------------------------------------------------ */
  /* Close modal                                                              */
  /* ------------------------------------------------------------------------ */

  function closeModal() {
    if (saving) return;

    setShowModal(false);
    setEditingAccount(null);
    setForm(emptyForm);
    setError(null);
  }

  /* ------------------------------------------------------------------------ */
  /* Form update                                                              */
  /* ------------------------------------------------------------------------ */

  function updateForm<
    K extends keyof AccountForm
  >(
    key: K,
    value: AccountForm[K]
  ) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  /* ------------------------------------------------------------------------ */
  /* Account type change                                                      */
  /* ------------------------------------------------------------------------ */

  function handleTypeChange(
    type: AccountType
  ) {
    const newCode =
      editingAccount
        ? editingAccount.code
        : generateAccountCode(
            accounts,
            type,
            null
          );

    setForm((previous) => ({
      ...previous,

      type,

      parent_id: null,

      detail_type: "",

      account_role: "general",

      parent_head: "",

      code: newCode,
    }));
  }

  /* ------------------------------------------------------------------------ */
  /* Parent change                                                            */
  /* ------------------------------------------------------------------------ */

  function handleParentChange(
    parentId: string | null
  ) {
    const newCode =
      editingAccount
        ? form.code
        : generateAccountCode(
            accounts,
            form.type,
            parentId
          );

    setForm((previous) => ({
      ...previous,

      parent_id: parentId,

      code: newCode,
    }));
  }

  /* ------------------------------------------------------------------------ */
  /* Detail type change                                                       */
  /* ------------------------------------------------------------------------ */

  function handleDetailTypeChange(
    value: string
  ) {
    const selected =
      detailTypes.find(
        (item) =>
          item.value === value
      );

    setForm((previous) => ({
      ...previous,

      detail_type: value,

      account_role:
        selected?.role ??
        previous.account_role ??
        "general",
    }));
  }

  /* ------------------------------------------------------------------------ */
  /* Save                                                                     */
  /* ------------------------------------------------------------------------ */

  async function handleSave() {
=======
      description:
        account.description ?? "",
    });

    setModalOpen(true);
  };


  /**
   * Change type.
   */
  const changeType = (
    type: AccountType
  ) => {
    setForm((f) => ({
      ...f,

      type,

      code: editing
        ? f.code
        : nextRootCode(
            accounts,
            type
          ),

      parent_id: null,
    }));
  };


  /**
   * Save account.
   */
  const submit = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

>>>>>>> 802f955ede1551985947b9a2621bfc851a03363b
    setError(null);

    if (!form.name.trim()) {
      setError(
        "Account name is required."
      );
      return;
    }

<<<<<<< HEAD
    const finalCode =
      editingAccount
        ? form.code.trim()
        : generatedCode.trim();

    if (!finalCode) {
      setError(
        "Unable to generate account code."
=======
    if (!form.code.trim()) {
      setError(
        "Account code is required."
>>>>>>> 802f955ede1551985947b9a2621bfc851a03363b
      );
      return;
    }

    if (
<<<<<<< HEAD
      form.is_group &&
      form.allow_manual_entries
    ) {
      setError(
        "Group accounts cannot allow manual journal entries."
=======
      form.parent_id ===
      editing?.id
    ) {
      setError(
        "An account cannot be its own parent."
>>>>>>> 802f955ede1551985947b9a2621bfc851a03363b
      );
      return;
    }

<<<<<<< HEAD
    try {
      setSaving(true);

      await saveAccount({
        id: editingAccount?.id,

        code: finalCode,

        name: form.name.trim(),

        type: form.type,

        parent_id:
          form.parent_id,

        is_group:
          form.is_group,

        allow_manual_entries:
          form.is_group
            ? false
            : form.allow_manual_entries,

        is_active:
          form.is_active,

        detail_type:
          form.detail_type.trim() ||
          null,

        parent_head:
          form.parent_head.trim() ||
          null,

        account_role:
          form.account_role.trim() ||
          "general",
      });

      setSuccess(
        editingAccount
          ? "Account updated successfully."
          : "Account created successfully."
      );

      setShowModal(false);
      setEditingAccount(null);
      setForm(emptyForm);

      await loadAccounts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save account."
      );
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Toggle active                                                            */
  /* ------------------------------------------------------------------------ */

  async function handleToggleActive(
    account: AccountRow
  ) {
    try {
      setError(null);

      if (
        account.is_active === false
      ) {
        await activateAccount(
          account.id
        );
      } else {
        await deactivateAccount(
          account.id
        );
      }

      await loadAccounts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to change account status."
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Delete                                                                   */
  /* ------------------------------------------------------------------------ */

  async function handleDelete(
    account: AccountRow
  ) {
    const confirmed =
      window.confirm(
        `Delete "${account.name}"?\n\nThis action cannot be undone.`
      );

    if (!confirmed) {
      return;
    }

    try {
      setError(null);

      await deleteAccount(
        account.id
      );

      setSuccess(
        "Account deleted successfully."
      );

      await loadAccounts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to delete account."
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Indent                                                                   */
  /* ------------------------------------------------------------------------ */

  function getIndent(
    account: AccountRow
  ) {
    let depth = 0;

    let parentId =
      account.parent_id ??
      null;

    const visited =
      new Set<string>();

    while (parentId) {
      if (
        visited.has(parentId)
      ) {
        break;
      }

      visited.add(parentId);

      depth += 1;

      const parent =
        accounts.find(
          (item) =>
            item.id ===
            parentId
        );

      parentId =
        parent?.parent_id ??
        null;

      if (depth > 20) {
        break;
      }
    }

    return depth;
  }

  /* ------------------------------------------------------------------------ */
  /* Parent name                                                              */
  /* ------------------------------------------------------------------------ */

  function getParentName(
    account: AccountRow
  ) {
    if (!account.parent_id) {
      return "Root account";
    }

    return (
      accounts.find(
        (item) =>
          item.id ===
          account.parent_id
      )?.name ??
      "Unknown parent"
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}

      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1500px] px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
                Accounting
              </div>

              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Chart of Accounts
              </h1>

              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Build a structured accounting hierarchy with automatic account numbering.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                openNewAccount()
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <span className="text-lg leading-none">
                +
              </span>

              New account
            </button>
          </div>
        </div>
      </div>

      {/* Main */}

      <main className="mx-auto max-w-[1500px] px-6 py-5">
        {error && (
          <div className="mb-4 flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>

            <button
              type="button"
              onClick={() =>
                setError(null)
              }
              className="font-semibold"
            >
              ×
            </button>
          </div>
        )}

        {success && (
          <div className="mb-4 flex items-start justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <span>{success}</span>

            <button
              type="button"
              onClick={() =>
                setSuccess(null)
              }
              className="font-semibold"
            >
              ×
            </button>
          </div>
        )}

        {/* Summary */}

        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Total accounts"
            value={totalAccounts}
            description="All accounts"
          />

          <SummaryCard
            label="Active accounts"
            value={activeAccounts}
            description="Available for use"
          />

          <SummaryCard
            label="Group accounts"
            value={groupCount}
            description="Parent / category accounts"
          />

          <SummaryCard
            label="Posting accounts"
            value={postingCount}
            description="Used in journal entries"
          />
        </div>

        {/* Main table */}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-1 flex-col gap-3 md:flex-row">
                <div className="relative min-w-0 flex-1 md:max-w-md">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    ⌕
                  </span>

                  <input
                    value={search}
                    onChange={(event) =>
                      setSearch(
                        event.target.value
                      )
                    }
                    placeholder="Search account name or code"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <select
                  value={typeFilter}
                  onChange={(event) =>
                    setTypeFilter(
                      event.target
                        .value as
                        | "all"
                        | AccountType
                    )
                  }
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="all">
                    All account types
                  </option>

                  {ACCOUNT_TYPES.map(
                    (type) => (
                      <option
                        key={
                          type.value
                        }
                        value={
                          type.value
                        }
                      >
                        {type.label}
                      </option>
                    )
                  )}
                </select>

                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target
                        .value as
                        | "all"
                        | "active"
                        | "inactive"
                    )
                  }
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="active">
                    Active only
                  </option>

                  <option value="inactive">
                    Inactive only
                  </option>

                  <option value="all">
                    All statuses
                  </option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={expandAll}
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Expand all
                </button>

                <button
                  type="button"
                  onClick={
                    collapseAll
                  }
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Collapse all
                </button>

                <button
                  type="button"
                  onClick={
                    loadAccounts
                  }
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="w-[39%] px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Account
                  </th>

                  <th className="w-[10%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Code
                  </th>

                  <th className="w-[12%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Type
                  </th>

                  <th className="w-[15%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Detail type
                  </th>

                  <th className="w-[12%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Statement
                  </th>

                  <th className="w-[8%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>

                  <th className="w-[6%] px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-16 text-center text-sm text-slate-500"
                    >
                      Loading Chart of Accounts...
                    </td>
                  </tr>
                ) : visibleAccounts.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-16 text-center"
                    >
                      <div className="text-sm font-medium text-slate-700">
                        No accounts found
                      </div>

                      <div className="mt-1 text-sm text-slate-400">
                        Create your first account to get started.
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          openNewAccount()
                        }
                        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        New account
                      </button>
                    </td>
                  </tr>
                ) : (
                  rootAccounts.map(
                    (account) => (
                      <AccountTreeRows
                        key={account.id}
                        account={account}
                        accounts={
                          filteredAccounts
                        }
                        allAccounts={
                          accounts
                        }
                        expanded={
                          expanded
                        }
                        onToggle={
                          toggleExpanded
                        }
                        onEdit={
                          openEdit
                        }
                        onAddChild={
                          openNewAccount
                        }
                        onDelete={
                          handleDelete
                        }
                        onToggleActive={
                          handleToggleActive
                        }
                        getParentName={
                          getParentName
                        }
                        getIndent={
                          getIndent
                        }
                      />
                    )
                  )
                )}
              </tbody>
            </table>
          </div>

          {!loading && (
            <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing{" "}
                {
                  visibleAccounts.length
                }{" "}
                of{" "}
                {
                  filteredAccounts.length
                }{" "}
                accounts
              </span>

              <span>
                Group accounts are categories and cannot receive direct journal entries.
              </span>
            </div>
          )}
        </div>
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* Compact Add/Edit Modal                                             */}
      {/* ------------------------------------------------------------------ */}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            {/* Header */}

            <div className="shrink-0 border-b border-slate-200 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
                    Accounting setup
                  </div>

                  <h2 className="mt-0.5 text-lg font-semibold text-slate-900">
                    {editingAccount
                      ? "Edit account"
                      : "Create account"}
                  </h2>

                  <p className="mt-0.5 text-xs text-slate-500">
                    Configure the account and hierarchy.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    closeModal
                  }
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Body */}

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                {/* Basic information */}

                <section>
                  <SectionTitle
                    title="Basic information"
                    description="Choose the main accounting classification."
                  />

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <FormField
                      label="Account type"
                      required
                    >
                      <select
                        value={
                          form.type
                        }
                        onChange={(
                          event
                        ) =>
                          handleTypeChange(
                            event
                              .target
                              .value as AccountType
                          )
                        }
                        className="form-input"
                      >
                        {ACCOUNT_TYPES.map(
                          (type) => (
                            <option
                              key={
                                type.value
                              }
                              value={
                                type.value
                              }
                            >
                              {
                                type.label
                              }
                            </option>
                          )
                        )}
                      </select>
                    </FormField>

                    <FormField label="Financial statement">
                      <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700">
                        {
                          ACCOUNT_STATEMENTS[
                            form.type
                          ]
                        }
                      </div>
                    </FormField>
                  </div>
                </section>

                {/* Account details */}

                <section>
                  <SectionTitle
                    title="Account details"
                    description="Account name and automatic account number."
                  />

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <FormField
                      label="Account name"
                      required
                    >
                      <input
                        value={
                          form.name
                        }
                        onChange={(
                          event
                        ) =>
                          updateForm(
                            "name",
                            event
                              .target
                              .value
                          )
                        }
                        placeholder="Enter account name"
                        className="form-input"
                        autoFocus
                      />
                    </FormField>

                    <FormField
                      label="Account code"
                      hint="Automatically generated by the system."
                    >
                      <div className="flex h-10 items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-3">
                        <span className="font-mono text-sm font-semibold text-blue-700">
                          {generatedCode ||
                            "Auto"}
                        </span>

                        <span className="text-[11px] font-medium text-blue-500">
                          AUTO
                        </span>
                      </div>
                    </FormField>
                  </div>

                  <div className="mt-3">
                    <FormField
                      label="Detail type"
                      hint="This classification determines how the account is presented in reporting."
                    >
                      <select
                        value={
                          form.detail_type
                        }
                        onChange={(
                          event
                        ) =>
                          handleDetailTypeChange(
                            event
                              .target
                              .value
                          )
                        }
                        className="form-input"
                      >
                        <option value="">
                          Select detail type
                        </option>

                        {detailTypes.map(
                          (
                            detail
                          ) => (
                            <option
                              key={
                                detail.value
                              }
                              value={
                                detail.value
                              }
                            >
                              {
                                detail.label
                              }
                            </option>
                          )
                        )}
                      </select>
                    </FormField>
                  </div>
                </section>

                {/* Information */}

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <InfoBox
                      label="Account type"
                      value={
                        ACCOUNT_TYPE_LABELS[
                          form.type
                        ]
                      }
                    />

                    <InfoBox
                      label="Statement"
                      value={
                        ACCOUNT_STATEMENTS[
                          form.type
                        ]
                      }
                    />

                    <InfoBox
                      label="Detail classification"
                      value={
                        selectedDetail?.label ??
                        "Not selected"
                      }
                    />
                  </div>
                </div>

                {/* Hierarchy */}

                <section>
                  <SectionTitle
                    title="Account hierarchy"
                    description="Select a group account if this should be a subaccount."
                  />

                  <div className="mt-3">
                    <FormField
                      label="Parent account"
                      hint="Root account means this account has no parent."
                    >
                      <select
                        value={
                          form.parent_id ??
                          ""
                        }
                        onChange={(
                          event
                        ) =>
                          handleParentChange(
                            event
                              .target
                              .value ||
                              null
                          )
                        }
                        className="form-input"
                      >
                        <option value="">
                          Root account
                        </option>

                        {availableParents.map(
                          (
                            parent
                          ) => (
                            <option
                              key={
                                parent.id
                              }
                              value={
                                parent.id
                              }
                            >
                              {
                                parent.code
                              }{" "}
                              —{" "}
                              {
                                parent.name
                              }
                            </option>
                          )
                        )}
                      </select>
                    </FormField>
                  </div>

                  {form.parent_id && (
                    <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
                      <span className="font-semibold">
                        Subaccount:
                      </span>{" "}
                      this account will be placed under the selected parent and its code will be generated automatically.
                    </div>
                  )}

                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={
                          form.is_group
                        }
                        onChange={(
                          event
                        ) => {
                          const checked =
                            event
                              .target
                              .checked;

                          updateForm(
                            "is_group",
                            checked
                          );

                          if (
                            checked
                          ) {
                            updateForm(
                              "allow_manual_entries",
                              false
                            );
                          }
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />

                      <span>
                        <span className="block text-sm font-semibold text-slate-800">
                          Group account
                        </span>

                        <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                          Use this account as a parent/category. Group accounts cannot receive direct journal entries.
                        </span>
                      </span>
                    </label>
                  </div>
                </section>

                {/* Posting settings */}

                <section>
                  <SectionTitle
                    title="Posting settings"
                    description="Control direct journal posting."
                  />

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                      <input
                        type="checkbox"
                        checked={
                          form.allow_manual_entries
                        }
                        disabled={
                          form.is_group
                        }
                        onChange={(
                          event
                        ) =>
                          updateForm(
                            "allow_manual_entries",
                            event
                              .target
                              .checked
                          )
                        }
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />

                      <span>
                        <span className="block text-sm font-semibold text-slate-800">
                          Allow manual entries
                        </span>

                        <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                          Available for journal entries.
                        </span>
                      </span>
                    </label>

                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                      <input
                        type="checkbox"
                        checked={
                          form.is_active
                        }
                        onChange={(
                          event
                        ) =>
                          updateForm(
                            "is_active",
                            event
                              .target
                              .checked
                          )
                        }
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />

                      <span>
                        <span className="block text-sm font-semibold text-slate-800">
                          Active account
                        </span>

                        <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                          Available for accounting transactions.
                        </span>
                      </span>
                    </label>
                  </div>
                </section>

                {/* Metadata */}

                <section>
                  <SectionTitle
                    title="Accounting metadata"
                    description="Optional metadata for accounting modules."
                  />

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <FormField
                      label="Account role"
                    >
                      <select
                        value={
                          form.account_role
                        }
                        onChange={(
                          event
                        ) =>
                          updateForm(
                            "account_role",
                            event
                              .target
                              .value
                          )
                        }
                        className="form-input"
                      >
                        <option value="general">
                          General
                        </option>

                        <option value="cash">
                          Cash
                        </option>

                        <option value="bank">
                          Bank
                        </option>

                        <option value="receivable">
                          Receivable
                        </option>

                        <option value="payable">
                          Payable
                        </option>

                        <option value="inventory">
                          Inventory
                        </option>

                        <option value="sales">
                          Sales
                        </option>

                        <option value="expense">
                          Expense
                        </option>

                        <option value="tax">
                          Tax
                        </option>
                      </select>
                    </FormField>

                    <FormField
                      label="Parent head"
                      hint="Optional reporting label."
                    >
                      <input
                        value={
                          form.parent_head
                        }
                        onChange={(
                          event
                        ) =>
                          updateForm(
                            "parent_head",
                            event
                              .target
                              .value
                          )
                        }
                        placeholder="Optional"
                        className="form-input"
                      />
                    </FormField>
                  </div>
                </section>
              </div>
            </div>

            {/* Footer - ALWAYS VISIBLE */}

            <div className="shrink-0 flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={
                  closeModal
                }
                disabled={saving}
                className="h-9 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={
                  handleSave
                }
                disabled={
                  saving ||
                  !form.name.trim()
                }
                className="h-9 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? "Saving..."
                  : editingAccount
                    ? "Save changes"
                    : "Create account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Summary Card                                                               */
/* -------------------------------------------------------------------------- */

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-slate-500">
        {label}
      </div>

      <div className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">
        {value}
      </div>

      <div className="mt-0.5 text-xs text-slate-400">
        {description}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Section title                                                              */
/* -------------------------------------------------------------------------- */

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">
        {title}
      </h3>

      <p className="mt-0.5 text-xs leading-5 text-slate-500">
        {description}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form field                                                                 */
/* -------------------------------------------------------------------------- */

function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}

        {required && (
          <span className="ml-1 text-red-500">
            *
          </span>
        )}
      </label>

      {children}

      {hint && (
        <p className="mt-1 text-[11px] leading-4 text-slate-400">
          {hint}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Info box                                                                   */
/* -------------------------------------------------------------------------- */

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-0.5 truncate text-sm font-medium text-slate-700">
        {value}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tree rows                                                                  */
/* -------------------------------------------------------------------------- */

function AccountTreeRows({
  account,
  accounts,
  allAccounts,
  expanded,
  onToggle,
  onEdit,
  onAddChild,
  onDelete,
  onToggleActive,
  getParentName,
  getIndent,
}: {
  account: AccountRow;
  accounts: AccountRow[];
  allAccounts: AccountRow[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (
    account: AccountRow
  ) => void;
  onAddChild: (
    account: AccountRow
  ) => void;
  onDelete: (
    account: AccountRow
  ) => void;
  onToggleActive: (
    account: AccountRow
  ) => void;
  getParentName: (
    account: AccountRow
  ) => string;
  getIndent: (
    account: AccountRow
  ) => number;
}) {
  const children =
    getChildren(
      accounts,
      account.id
    );

  const childExists =
    hasChildren(
      allAccounts,
      account.id
    );

  const isExpanded =
    expanded.has(account.id);

  const depth =
    getIndent(account);

  const style =
    TYPE_STYLES[
      account.type
    ];

  const detailLabel =
    account.detail_type
      ? findDetailLabel(
          account.type,
          account.detail_type
        )
      : "—";

  const statement =
    ACCOUNT_STATEMENTS[
      account.type
    ];

  return (
    <>
      <tr
        className={`group transition hover:bg-slate-50 ${
          account.is_active === false
            ? "opacity-55"
            : ""
        }`}
      >
        <td className="px-5 py-3.5">
          <div
            className="flex min-w-0 items-center"
            style={{
              paddingLeft:
                `${depth * 28}px`,
            }}
          >
            <button
              type="button"
              onClick={() =>
                childExists &&
                onToggle(
                  account.id
                )
              }
              className={`mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 ${
                childExists
                  ? "hover:bg-slate-100 hover:text-slate-700"
                  : "cursor-default"
              }`}
            >
              {childExists ? (
                <span
                  className={`text-xs transition-transform ${
                    isExpanded
                      ? "rotate-90"
                      : ""
                  }`}
                >
                  ▶
                </span>
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              )}
            </button>

            <div
              className={`mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                account.is_group
                  ? "bg-slate-100"
                  : "bg-white"
              }`}
            >
              {account.is_group ? (
                <span className="text-xs font-bold text-slate-600">
                  ▣
                </span>
              ) : (
                <span
                  className={`h-2.5 w-2.5 rounded-full ${style.dot}`}
                />
              )}
            </div>

            <div className="min-w-0">
              <div
                className={`truncate text-sm ${
                  account.is_group
                    ? "font-semibold text-slate-900"
                    : "font-medium text-slate-800"
                }`}
              >
                {account.name}
              </div>

              <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                {account.is_group && (
                  <span>
                    Group account
                  </span>
                )}

                {!account.is_group &&
                  account.allow_manual_entries !==
                    false && (
                    <span>
                      Posting account
                    </span>
                  )}
              </div>
            </div>
          </div>
        </td>

        <td className="px-4 py-3.5">
          <span className="font-mono text-sm text-slate-600">
            {account.code}
          </span>
        </td>

        <td className="px-4 py-3.5">
          <span
            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium ${style.badge}`}
          >
            {
              ACCOUNT_TYPE_LABELS[
                account.type
              ]
            }
          </span>
        </td>

        <td className="px-4 py-3.5">
          <span className="block max-w-[190px] truncate text-sm text-slate-600">
            {detailLabel}
          </span>
        </td>

        <td className="px-4 py-3.5">
          <span className="text-xs font-medium text-slate-600">
            {statement}
          </span>
        </td>

        <td className="px-4 py-3.5">
          <button
            type="button"
            onClick={() =>
              onToggleActive(
                account
              )
            }
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              account.is_active ===
              false
                ? "text-slate-400"
                : "text-emerald-600"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                account.is_active ===
                false
                  ? "bg-slate-400"
                  : "bg-emerald-500"
              }`}
            />

            {account.is_active ===
            false
              ? "Inactive"
              : "Active"}
          </button>
        </td>

        <td className="px-4 py-3.5 text-right">
          <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
            {account.is_group && (
              <button
                type="button"
                onClick={() =>
                  onAddChild(
                    account
                  )
                }
                title="Add subaccount"
                className="flex h-8 w-8 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50"
              >
                +
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                onEdit(
                  account
                )
              }
              title="Edit account"
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              ✎
            </button>

            <button
              type="button"
              onClick={() =>
                onDelete(
                  account
                )
              }
              title="Delete account"
              className="flex h-8 w-8 items-center justify-center rounded-md text-red-500 hover:bg-red-50"
            >
              ×
            </button>
          </div>
        </td>
      </tr>

      {isExpanded &&
        children.map(
          (child) => (
            <AccountTreeRows
              key={child.id}
              account={child}
              accounts={accounts}
              allAccounts={
                allAccounts
              }
              expanded={expanded}
              onToggle={
                onToggle
              }
              onEdit={onEdit}
              onAddChild={
                onAddChild
              }
              onDelete={
                onDelete
              }
              onToggleActive={
                onToggleActive
              }
              getParentName={
                getParentName
              }
              getIndent={
                getIndent
              }
            />
          )
        )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Find detail label                                                          */
/* -------------------------------------------------------------------------- */

function findDetailLabel(
  type: AccountType,
  value: string
): string {
  const details =
    ACCOUNT_DETAIL_TYPES[
      type
    ] as readonly DetailOption[];

  return (
    details.find(
      (item) =>
        item.value === value
    )?.label ?? value
=======

    /**
     * Group accounts cannot be
     * manually posted to.
     */
    const finalForm = {
      ...form,

      allow_manual_entries:
        form.is_group
          ? false
          : form.allow_manual_entries,
    };


    try {
      await saveAccount({
        ...finalForm,
        id: editing?.id,
      });

      setModalOpen(false);

      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : String(e)
      );
    }
  };


  /**
   * Activate/deactivate.
   */
  const toggleActive = async (
    account: ChartOfAccount
  ) => {
    try {
      if (account.is_active) {
        await deactivateAccount(
          account.id
        );
      } else {
        await activateAccount(
          account.id
        );
      }

      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : String(e)
      );
    }
  };


  /**
   * Delete.
   */
  const remove = async () => {
    if (!deleteId) return;

    try {
      await deleteAccount(
        deleteId
      );

      setDeleteId(null);

      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : String(e)
      );

      setDeleteId(null);
    }
  };


  /**
   * Mapping lookup.
   */
  const mappingByKey =
    new Map(
      mappings.map((m) => [
        m.mapping_key,
        m.account_id,
      ])
    );


  /**
   * Update mapping.
   */
  const updateMapping = async (
    key: string,
    accountId: string
  ) => {
    if (!accountId) return;

    try {
      await setMapping(
        key,
        accountId
      );

      setMappings(
        await listMappings()
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : String(e)
      );
    }
  };


  /**
   * Recursive account rows.
   */
  const renderTree = (
    parentId: string | null = null,
    level = 0
  ): React.ReactNode => {
    const children =
      childrenByParent.get(
        parentId
      ) ?? [];

    return children.map(
      (account) => {
        const hasChildren =
          (
            childrenByParent.get(
              account.id
            ) ?? []
          ).length > 0;

        return (
          <tbody key={account.id}>
            <tr className="border-b hover:bg-slate-50">
              <td className="px-4 py-3">
                <div
                  className="font-mono font-semibold"
                  style={{
                    paddingLeft:
                      `${level * 28}px`,
                  }}
                >
                  {account.code}
                </div>
              </td>

              <td className="px-4 py-3">
                <div
                  className={
                    account.is_group
                      ? "font-bold"
                      : "font-medium"
                  }
                  style={{
                    paddingLeft:
                      `${level * 28}px`,
                  }}
                >
                  {hasChildren
                    ? "▾ "
                    : level > 0
                      ? "└ "
                      : ""}
                  {account.name}
                </div>

                <div
                  className="text-[11px] text-slate-400"
                  style={{
                    paddingLeft:
                      `${level * 28}px`,
                  }}
                >
                  {accountPath(
                    account
                  )}
                </div>
              </td>

              <td className="px-4 py-3">
                <span
                  className={`px-2 py-1 rounded-full text-[11px] font-semibold uppercase ${
                    TYPE_META[
                      account.type
                    ].color
                  }`}
                >
                  {
                    TYPE_META[
                      account.type
                    ].label
                  }
                </span>
              </td>

              <td className="px-4 py-3 text-xs text-slate-500">
                {account.parent_id
                  ? accounts.find(
                      (p) =>
                        p.id ===
                        account.parent_id
                    )?.name ??
                    "—"
                  : "Root"}
              </td>

              <td className="px-4 py-3 text-xs">
                {account.is_group
                  ? "Group"
                  : "Posting"}
              </td>

              <td className="px-4 py-3">
                <span
                  className={`px-2 py-1 rounded-full text-[11px] ${
                    account.is_active
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {account.is_active
                    ? "Active"
                    : "Inactive"}
                </span>
              </td>

              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-3 items-center">
                  {account.is_group && (
                    <button
                      onClick={() =>
                        openCreateChild(
                          account
                        )
                      }
                      className="text-emerald-600 text-xs font-semibold"
                    >
                      + Child
                    </button>
                  )}

                  <button
                    onClick={() =>
                      openEdit(account)
                    }
                    className="text-indigo-600 text-xs font-semibold"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() =>
                      void toggleActive(
                        account
                      )
                    }
                    className="text-slate-600 text-xs font-semibold"
                  >
                    {account.is_active
                      ? "Deactivate"
                      : "Activate"}
                  </button>

                  {!account.is_system_account && (
                    <button
                      onClick={() =>
                        setDeleteId(
                          account.id
                        )
                      }
                      className="text-red-600 text-xs font-semibold"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>

            {hasChildren &&
              renderTree(
                account.id,
                level + 1
              )}
          </tbody>
        );
      }
    );
  };


  return (
    <div className="space-y-6">

      <PageHeader
        title="Chart of Accounts"
        subtitle="Hierarchical accounting structure with unlimited child accounts"
        action={
          <button
            onClick={openCreate}
            className="btn-primary"
          >
            + New Account
          </button>
        }
      />

      {error && (
        <ErrorBanner
          message={error}
        />
      )}


      {/* COA TABLE */}

      <div className="card bg-white p-4 border border-slate-200 rounded-xl space-y-4">

        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">

          <div className="flex flex-wrap gap-2">

            {(
              [
                "all",
                "asset",
                "liability",
                "equity",
                "revenue",
                "expense",
              ] as const
            ).map((t) => (
              <button
                key={t}
                onClick={() =>
                  setFilter(t)
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  filter === t
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {t === "all"
                  ? "All"
                  : TYPE_META[t].label}
              </button>
            ))}

          </div>


          <input
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            className="input w-full md:w-72"
            placeholder="Search code or account name..."
          />

        </div>


        <div className="overflow-x-auto">

          <table className="w-full text-sm">

            <thead>
              <tr className="border-b bg-slate-50 text-left">

                <th className="px-4 py-3">
                  Code
                </th>

                <th className="px-4 py-3">
                  Account
                </th>

                <th className="px-4 py-3">
                  Type
                </th>

                <th className="px-4 py-3">
                  Parent
                </th>

                <th className="px-4 py-3">
                  Posting
                </th>

                <th className="px-4 py-3">
                  Status
                </th>

                <th className="px-4 py-3 text-right">
                  Actions
                </th>

              </tr>
            </thead>


            {loading ? (
              <tbody>
                <tr>
                  <td
                    colSpan={7}
                    className="p-8 text-center text-slate-400"
                  >
                    Loading...
                  </td>
                </tr>
              </tbody>
            ) : (
              renderTree()
            )}

          </table>

        </div>

      </div>


      {/* AUTOMATIC MAPPINGS */}

      <div className="card bg-white p-4 border border-slate-200 rounded-xl">

        <h3 className="font-semibold text-slate-900">
          Automatic Account Mappings
        </h3>

        <p className="text-xs text-slate-500 mt-1 mb-4">
          Modules use these stable mappings.
          Only posting accounts are available here.
        </p>


        <div className="grid md:grid-cols-2 gap-3">

          {DEFAULT_MAPPINGS.map(
            ([key, label]) => (
              <label
                key={key}
                className="block"
              >

                <span className="text-xs font-semibold text-slate-600">
                  {label}

                  <span className="text-slate-400">
                    {" "}
                    ({key})
                  </span>
                </span>


                <select
                  className="input mt-1"
                  value={
                    mappingByKey.get(
                      key
                    ) ?? ""
                  }
                  onChange={(e) =>
                    void updateMapping(
                      key,
                      e.target.value
                    )
                  }
                >

                  <option value="">
                    Select account...
                  </option>

                  {accounts
                    .filter(
                      (a) =>
                        !a.is_group &&
                        a.is_active &&
                        a.allow_manual_entries
                    )
                    .map(
                      (a) => (
                        <option
                          key={a.id}
                          value={a.id}
                        >
                          {a.code} —{" "}
                          {a.name}
                        </option>
                      )
                    )}

                </select>

              </label>
            )
          )}

        </div>

      </div>


      {/* ACCOUNT MODAL */}

      <Modal
        open={modalOpen}
        title={
          editing
            ? "Edit Account"
            : "New Account"
        }
        onClose={() =>
          setModalOpen(false)
        }
      >

        <form
          onSubmit={submit}
          className="space-y-4"
        >

          <div className="grid md:grid-cols-2 gap-4">

            <label>
              <span className="label">
                Account Type
              </span>

              <select
                className="input"
                value={form.type}
                onChange={(e) =>
                  changeType(
                    e.target
                      .value as AccountType
                  )
                }
              >

                {Object.entries(
                  TYPE_META
                ).map(
                  ([v, m]) => (
                    <option
                      key={v}
                      value={v}
                    >
                      {m.label}
                    </option>
                  )
                )}

              </select>
            </label>


            <label>
              <span className="label">
                Account Code
              </span>

              <input
                className="input font-mono"
                value={form.code}
                onChange={(e) =>
                  setForm({
                    ...form,
                    code: e.target.value,
                  })
                }
                required
              />
            </label>

          </div>


          <label>
            <span className="label">
              Account Name
            </span>

            <input
              className="input"
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                })
              }
              placeholder="e.g. Rajhi Bank"
              required
            />
          </label>


          {/* PARENT */}

          <div className="grid md:grid-cols-2 gap-4">

            <label>
              <span className="label">
                Parent Account
              </span>

              <select
                className="input"
                value={
                  form.parent_id ?? ""
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    parent_id:
                      e.target.value ||
                      null,
                  })
                }
              >

                <option value="">
                  Root account
                </option>

                {groups
                  .filter(
                    (g) =>
                      g.id !==
                        editing?.id &&
                      g.type ===
                        form.type
                  )
                  .sort(
                    (a, b) =>
                      Number(a.code) -
                      Number(b.code)
                  )
                  .map(
                    (g) => (
                      <option
                        key={g.id}
                        value={g.id}
                      >
                        {g.code} —{" "}
                        {g.name}
                      </option>
                    )
                  )}

              </select>

            </label>


            <label>
              <span className="label">
                Account Role
              </span>

              <select
                className="input"
                value={
                  form.account_role
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    account_role:
                      e.target.value,
                  })
                }
              >

                <option value="general">
                  General
                </option>

                <option value="party">
                  Party
                </option>

                <option value="sales_person">
                  Sales Person
                </option>

                <option value="charge">
                  Charge
                </option>

                <option value="system">
                  System
                </option>

              </select>

            </label>

          </div>


          {/* GROUP */}

          <div className="grid md:grid-cols-2 gap-4">

            <label className="flex items-center gap-2">

              <input
                type="checkbox"
                checked={
                  form.is_group
                }
                onChange={(e) =>
                  setForm({
                    ...form,

                    is_group:
                      e.target.checked,

                    allow_manual_entries:
                      !e.target.checked,
                  })
                }
              />

              <span className="text-sm">
                Group account
              </span>

            </label>


            <label className="flex items-center gap-2">

              <input
                type="checkbox"
                checked={
                  form.allow_manual_entries
                }
                disabled={
                  form.is_group
                }
                onChange={(e) =>
                  setForm({
                    ...form,

                    allow_manual_entries:
                      e.target.checked,
                  })
                }
              />

              <span className="text-sm">
                Allow manual journal entries
              </span>

            </label>

          </div>


          <label>
            <span className="label">
              Description
            </span>

            <textarea
              className="input min-h-20"
              value={
                form.description
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  description:
                    e.target.value,
                })
              }
            />

          </label>


          <div className="flex justify-end gap-3 pt-3 border-t">

            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                setModalOpen(false)
              }
            >
              Cancel
            </button>

            <button
              className="btn-primary"
            >
              {editing
                ? "Save Changes"
                : "Create Account"}
            </button>

          </div>

        </form>

      </Modal>


      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Account"
        message="Accounts used by journals, mappings, or child accounts cannot be deleted. Deactivate them instead. Continue?"
        onConfirm={() =>
          void remove()
        }
        onCancel={() =>
          setDeleteId(null)
        }
      />

    </div>
>>>>>>> 802f955ede1551985947b9a2621bfc851a03363b
  );
}