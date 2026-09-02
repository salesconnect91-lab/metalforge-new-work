-- Migration 0008
-- Add atomic, duplicate-safe Purchase Invoice posting.

CREATE OR REPLACE FUNCTION public.post_purchase_invoice(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_order public.purchase_orders%ROWTYPE;

  v_supplier_name text;
  v_supplier_account_id uuid;

  v_inventory_account_id uuid;
  v_ap_account_id uuid;
  v_transport_expense_account_id uuid;
  v_general_expense_account_id uuid;

  v_items_total numeric := 0;
  v_transport_charge numeric := 0;
  v_general_charges numeric := 0;
  v_grand_total numeric := 0;

  v_line_count integer := 0;
  v_journal_entry_id uuid;
  v_journal_entry_no text;
  v_result jsonb;

  r record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  /*
   * Lock the Purchase Order.
   * This serializes concurrent posting attempts for the same invoice.
   */
  SELECT po.*
  INTO v_order
  FROM public.purchase_orders po
  WHERE po.id = p_order_id
    AND po.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order not found.';
  END IF;

  IF v_order.status = 'posted' THEN
    RAISE EXCEPTION
      'Purchase invoice % is already posted.',
      v_order.order_no;
  END IF;

  /*
   * Supplier is mandatory because the balancing credit is
   * Accounts Payable and the hardened journal engine requires
   * supplier party metadata on AP lines.
   */
  IF v_order.supplier_id IS NULL THEN
    RAISE EXCEPTION 'Supplier is required before posting.';
  END IF;

  SELECT
    s.name,
    s.account_id
  INTO
    v_supplier_name,
    v_supplier_account_id
  FROM public.suppliers s
  WHERE s.id = v_order.supplier_id
    AND s.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier not found.';
  END IF;

  /*
   * Resolve accounting mappings.
   */
  SELECT am.account_id
  INTO v_inventory_account_id
  FROM public.account_mappings am
  WHERE am.user_id = v_user_id
    AND am.mapping_key = 'inventory'
  LIMIT 1;

  SELECT am.account_id
  INTO v_ap_account_id
  FROM public.account_mappings am
  WHERE am.user_id = v_user_id
    AND am.mapping_key = 'accounts_payable'
  LIMIT 1;

  SELECT am.account_id
  INTO v_transport_expense_account_id
  FROM public.account_mappings am
  WHERE am.user_id = v_user_id
    AND am.mapping_key = 'transport_expense'
  LIMIT 1;

  SELECT am.account_id
  INTO v_general_expense_account_id
  FROM public.account_mappings am
  WHERE am.user_id = v_user_id
    AND am.mapping_key = 'general_expense'
  LIMIT 1;

  IF v_inventory_account_id IS NULL THEN
    RAISE EXCEPTION 'Inventory account mapping is missing.';
  END IF;

  IF v_ap_account_id IS NULL THEN
    RAISE EXCEPTION 'Accounts Payable account mapping is missing.';
  END IF;

  IF v_transport_expense_account_id IS NULL THEN
    RAISE EXCEPTION 'Transport Expense account mapping is missing.';
  END IF;

  IF v_general_expense_account_id IS NULL THEN
    RAISE EXCEPTION 'General Expense account mapping is missing.';
  END IF;

  IF v_supplier_account_id IS NULL
     OR v_supplier_account_id <> v_ap_account_id THEN
    RAISE EXCEPTION
      'Supplier is not linked to the configured Accounts Payable account.';
  END IF;

  /*
   * Validate Purchase lines before changing stock or accounting.
   */
  SELECT
    COUNT(*),
    ROUND(
      COALESCE(
        SUM(
          ROUND(
            COALESCE(pol.qty, 0) * COALESCE(pol.unit_cost, 0),
            2
          )
        ),
        0
      ),
      2
    )
  INTO
    v_line_count,
    v_items_total
  FROM public.purchase_order_lines pol
  WHERE pol.order_id = p_order_id
    AND pol.user_id = v_user_id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Cannot post a Purchase Invoice without lines.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_order_lines pol
    WHERE pol.order_id = p_order_id
      AND pol.user_id = v_user_id
      AND (
        pol.item_id IS NULL
        OR pol.godown_id IS NULL
        OR COALESCE(pol.qty, 0) <= 0
        OR COALESCE(pol.unit_cost, 0) < 0
      )
  ) THEN
    RAISE EXCEPTION
      'One or more Purchase Invoice lines are invalid.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_order_lines pol
    LEFT JOIN public.items i
      ON i.id = pol.item_id
     AND i.user_id = v_user_id
    LEFT JOIN public.godowns g
      ON g.id = pol.godown_id
    WHERE pol.order_id = p_order_id
      AND pol.user_id = v_user_id
      AND (
        i.id IS NULL
        OR g.id IS NULL
        OR g.warehouse_id IS NULL
      )
  ) THEN
    RAISE EXCEPTION
      'One or more Purchase lines have an invalid Item or destination Godown/Warehouse.';
  END IF;

  /*
   * Calculate Purchase charges.
   *
   * Transport -> Transport & Freight expense.
   * All other current Purchase charges -> General Expenses.
   */
  v_transport_charge :=
    ROUND(COALESCE(v_order.transport_charge, 0), 2);

  v_general_charges :=
    ROUND(
      COALESCE(v_order.loading_charge, 0)
      + COALESCE(v_order.unloading_charge, 0)
      + COALESCE(v_order.cutting_charge, 0)
      + COALESCE(v_order.labour_charge, 0)
      + COALESCE(v_order.handling_charge, 0)
      + COALESCE(v_order.other_charge, 0),
      2
    );

  IF v_transport_charge < 0 OR v_general_charges < 0 THEN
    RAISE EXCEPTION 'Purchase charges cannot be negative.';
  END IF;

  v_grand_total :=
    ROUND(
      v_items_total
      + v_transport_charge
      + v_general_charges,
      2
    );

  IF v_grand_total <= 0 THEN
    RAISE EXCEPTION
      'Purchase Invoice total must be greater than zero.';
  END IF;

  /*
   * Deterministic journal number also acts as a second
   * duplicate-posting guard.
   */
  v_journal_entry_no := 'PUR-' || v_order.order_no;

  IF EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.user_id = v_user_id
      AND je.entry_no = v_journal_entry_no
  ) THEN
    RAISE EXCEPTION
      'Accounting entry already exists for Purchase Invoice %.',
      v_order.order_no;
  END IF;

  /*
   * Increase stock in each line's exact destination
   * warehouse/godown.
   *
   * apply_stock_movement() handles locking, warehouse_stock,
   * and stock_movements.
   */
  FOR r IN
    SELECT
      pol.item_id,
      pol.godown_id,
      pol.qty,
      g.warehouse_id
    FROM public.purchase_order_lines pol
    JOIN public.godowns g
      ON g.id = pol.godown_id
    WHERE pol.order_id = p_order_id
      AND pol.user_id = v_user_id
    ORDER BY pol.id
  LOOP
    PERFORM public.apply_stock_movement(
      r.item_id,
      r.warehouse_id,
      r.godown_id,
      'in',
      r.qty,
      v_order.order_no
    );
  END LOOP;

  /*
   * Create journal as DRAFT.
   * post_journal_entry() is the only code that changes it
   * to POSTED and creates general + party ledgers.
   */
  INSERT INTO public.journal_entries (
    user_id,
    entry_no,
    entry_date,
    description,
    status,
    party_name,
    trans_type
  )
  VALUES (
    v_user_id,
    v_journal_entry_no,
    v_order.order_date,
    'Purchase Invoice ' || v_order.order_no || ' — ' || v_supplier_name,
    'draft',
    v_supplier_name,
    'Purchase'
  )
  RETURNING id
  INTO v_journal_entry_id;

  /*
   * Inventory debit.
   */
  INSERT INTO public.journal_lines (
    user_id,
    entry_id,
    account,
    account_id,
    debit,
    credit
  )
  SELECT
    v_user_id,
    v_journal_entry_id,
    coa.name,
    v_inventory_account_id,
    v_items_total,
    0
  FROM public.chart_of_accounts coa
  WHERE coa.id = v_inventory_account_id
    AND coa.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory account is invalid.';
  END IF;

  /*
   * Transport expense debit.
   */
  IF v_transport_charge > 0 THEN
    INSERT INTO public.journal_lines (
      user_id,
      entry_id,
      account,
      account_id,
      debit,
      credit
    )
    SELECT
      v_user_id,
      v_journal_entry_id,
      coa.name,
      v_transport_expense_account_id,
      v_transport_charge,
      0
    FROM public.chart_of_accounts coa
    WHERE coa.id = v_transport_expense_account_id
      AND coa.user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transport Expense account is invalid.';
    END IF;
  END IF;

  /*
   * Other Purchase charges debit.
   */
  IF v_general_charges > 0 THEN
    INSERT INTO public.journal_lines (
      user_id,
      entry_id,
      account,
      account_id,
      debit,
      credit
    )
    SELECT
      v_user_id,
      v_journal_entry_id,
      coa.name,
      v_general_expense_account_id,
      v_general_charges,
      0
    FROM public.chart_of_accounts coa
    WHERE coa.id = v_general_expense_account_id
      AND coa.user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'General Expense account is invalid.';
    END IF;
  END IF;

  /*
   * Accounts Payable credit with Supplier party metadata.
   * This is required by post_journal_entry().
   */
  INSERT INTO public.journal_lines (
    user_id,
    entry_id,
    account,
    account_id,
    debit,
    credit,
    party_name,
    party_type,
    party_id
  )
  SELECT
    v_user_id,
    v_journal_entry_id,
    coa.name,
    v_ap_account_id,
    0,
    v_grand_total,
    v_supplier_name,
    'supplier',
    v_order.supplier_id
  FROM public.chart_of_accounts coa
  WHERE coa.id = v_ap_account_id
    AND coa.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accounts Payable account is invalid.';
  END IF;

  /*
   * Hardened centralized accounting engine:
   * validates journal, creates ledgers, creates supplier
   * party ledger, and locks the journal as posted.
   */
  SELECT public.post_journal_entry(v_journal_entry_id)
  INTO v_result;

  /*
   * Only after all stock + accounting work succeeds do we
   * mark the Purchase Invoice posted.
   */
  UPDATE public.purchase_orders
  SET
    status = 'posted',
    total = v_grand_total
  WHERE id = p_order_id
    AND user_id = v_user_id
    AND status <> 'posted';

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Purchase Invoice could not be marked as posted.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_no', v_order.order_no,
    'journal_entry_id', v_journal_entry_id,
    'journal_entry_no', v_journal_entry_no,
    'items_total', v_items_total,
    'transport_charge', v_transport_charge,
    'general_charges', v_general_charges,
    'grand_total', v_grand_total,
    'status', 'posted'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.post_purchase_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_purchase_invoice(uuid) TO authenticated;
