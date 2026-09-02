-- Migration 0007
-- Capture live purchase schema fixes and harden Sales Godown stock posting.

alter table public.purchase_order_lines
add column if not exists created_at timestamptz not null default now();

alter table public.purchase_order_lines
add column if not exists godown_id uuid null;

create index if not exists idx_purchase_order_lines_godown
on public.purchase_order_lines(godown_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_order_lines_item_id_fkey'
  ) then
    alter table public.purchase_order_lines
    add constraint purchase_order_lines_item_id_fkey
    foreign key (item_id)
    references public.items(id)
    on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_order_lines_godown_id_fkey'
  ) then
    alter table public.purchase_order_lines
    add constraint purchase_order_lines_godown_id_fkey
    foreign key (godown_id)
    references public.godowns(id)
    on delete restrict;
  end if;
end $$;

-- Harden Sales posting so stock identity uses warehouse_id + godown_id,
-- while preserving the Godown name for display/reference fields.

CREATE OR REPLACE FUNCTION public.post_sales_invoice(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();

  v_order public.sales_orders%ROWTYPE;
  v_customer public.customers%ROWTYPE;

  v_ar_account uuid;
  v_cash_account uuid;
  v_bank_account uuid;
  v_sales_account uuid;
  v_cogs_account uuid;
  v_inventory_account uuid;
  v_output_vat_account uuid;

  v_debit_account uuid;

  v_journal_id uuid;
  v_journal_line_id uuid;

  v_subtotal numeric := 0;
  v_line_tax numeric := 0;
  v_charge_total numeric := 0;
  v_charge_tax numeric := 0;
  v_invoice_total numeric := 0;

  v_product_cogs numeric := 0;
  v_charge_cost numeric := 0;

  v_total_debit numeric := 0;
  v_total_credit numeric := 0;

  v_stock numeric;
  v_godown_name text;

  v_entry_no text;

  r record;
  c record;

BEGIN

  --------------------------------------------------------------------
  -- 1. SECURITY / BASIC VALIDATION
  --------------------------------------------------------------------

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User is not authenticated.';
  END IF;

  SELECT *
  INTO v_order
  FROM public.sales_orders
  WHERE id = p_order_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales invoice not found or access denied.';
  END IF;

  IF v_order.status = 'posted' THEN
    RAISE EXCEPTION 'Invoice % is already posted.', v_order.order_no;
  END IF;

  --------------------------------------------------------------------
  -- 2. CUSTOMER
  --------------------------------------------------------------------

  IF v_order.customer_id IS NOT NULL THEN

    SELECT *
    INTO v_customer
    FROM public.customers
    WHERE id = v_order.customer_id
      AND user_id = v_user_id;

  END IF;

  --------------------------------------------------------------------
  -- 3. ACCOUNT MAPPINGS
  --------------------------------------------------------------------

  SELECT account_id
  INTO v_ar_account
  FROM public.account_mappings
  WHERE mapping_key = 'accounts_receivable'
    AND account_id IS NOT NULL
  LIMIT 1;

  SELECT account_id
  INTO v_cash_account
  FROM public.account_mappings
  WHERE mapping_key = 'cash'
    AND account_id IS NOT NULL
  LIMIT 1;

  SELECT account_id
  INTO v_bank_account
  FROM public.account_mappings
  WHERE mapping_key = 'bank'
    AND account_id IS NOT NULL
  LIMIT 1;

  SELECT account_id
  INTO v_sales_account
  FROM public.account_mappings
  WHERE mapping_key = 'sales_revenue'
    AND account_id IS NOT NULL
  LIMIT 1;

  IF v_sales_account IS NULL THEN
    SELECT account_id
    INTO v_sales_account
    FROM public.account_mappings
    WHERE mapping_key = 'sales'
      AND account_id IS NOT NULL
    LIMIT 1;
  END IF;

  SELECT account_id
  INTO v_cogs_account
  FROM public.account_mappings
  WHERE mapping_key = 'cogs'
    AND account_id IS NOT NULL
  LIMIT 1;

  IF v_cogs_account IS NULL THEN
    SELECT account_id
    INTO v_cogs_account
    FROM public.account_mappings
    WHERE mapping_key = 'cost_of_goods_sold'
      AND account_id IS NOT NULL
    LIMIT 1;
  END IF;

  SELECT account_id
  INTO v_inventory_account
  FROM public.account_mappings
  WHERE mapping_key = 'inventory'
    AND account_id IS NOT NULL
  LIMIT 1;

  SELECT account_id
  INTO v_output_vat_account
  FROM public.account_mappings
  WHERE mapping_key = 'output_vat'
    AND account_id IS NOT NULL
  LIMIT 1;

  IF v_sales_account IS NULL THEN
    RAISE EXCEPTION 'Sales Revenue account is not configured in Account Mappings.';
  END IF;

  IF v_inventory_account IS NULL THEN
    RAISE EXCEPTION 'Inventory account is not configured in Account Mappings.';
  END IF;

  IF v_cogs_account IS NULL THEN
    RAISE EXCEPTION 'COGS account is not configured in Account Mappings.';
  END IF;

  --------------------------------------------------------------------
  -- 4. PAYMENT ACCOUNT
  --------------------------------------------------------------------

  IF lower(coalesce(v_order.payment_mode, 'credit')) = 'cash' THEN

    v_debit_account := coalesce(
      v_order.payment_account_id,
      v_cash_account
    );

    IF v_debit_account IS NULL THEN
      RAISE EXCEPTION 'Cash account is not configured.';
    END IF;

  ELSIF lower(coalesce(v_order.payment_mode, 'credit')) = 'bank' THEN

    v_debit_account := coalesce(
      v_order.payment_account_id,
      v_bank_account
    );

    IF v_debit_account IS NULL THEN
      RAISE EXCEPTION 'Bank account is not configured.';
    END IF;

  ELSE

    IF v_order.customer_id IS NULL THEN
      RAISE EXCEPTION 'Customer is required for a credit sale.';
    END IF;

    v_debit_account := coalesce(
      v_order.customer_account_id,
      v_customer.account_id,
      v_ar_account
    );

    IF v_debit_account IS NULL THEN
      RAISE EXCEPTION 'Customer Accounts Receivable account is not configured.';
    END IF;

  END IF;

  --------------------------------------------------------------------
  -- 5. SALES LINES
  --------------------------------------------------------------------

  FOR r IN
    SELECT
      sol.id,
      sol.item_id,
      sol.qty,
      sol.unit_price,
      sol.line_total,
      sol.tax_percent,
      sol.godown_id,
      i.name AS item_name,
      i.sku,
      coalesce(i.cost, 0) AS item_cost,
      g.name AS godown_name,
      g.warehouse_id
    FROM public.sales_order_lines sol
    LEFT JOIN public.items i
      ON i.id = sol.item_id
    LEFT JOIN public.godowns g
      ON g.id = sol.godown_id
    WHERE sol.order_id = p_order_id
    ORDER BY sol.id
  LOOP

    IF r.item_id IS NULL THEN
      RAISE EXCEPTION 'Invoice line has no item.';
    END IF;

    IF coalesce(r.qty, 0) <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for item %.', coalesce(r.item_name, r.item_id::text);
    END IF;

    IF r.godown_id IS NULL THEN
      RAISE EXCEPTION
        'Godown is required for item %.',
        coalesce(r.item_name, r.item_id::text);
    END IF;

    IF r.godown_name IS NULL THEN
      RAISE EXCEPTION
        'Selected godown does not exist for item %.',
        coalesce(r.item_name, r.item_id::text);
    END IF;

    IF r.warehouse_id IS NULL THEN
      RAISE EXCEPTION
        'Selected Godown % is not linked to a warehouse.',
        r.godown_name;
    END IF;

    v_subtotal :=
      v_subtotal
      + coalesce(r.line_total, r.qty * r.unit_price, 0);

    v_line_tax :=
      v_line_tax
      + (
          coalesce(r.line_total, r.qty * r.unit_price, 0)
          * coalesce(r.tax_percent, 0)
          / 100
        );

    v_product_cogs :=
      v_product_cogs
      + (
          coalesce(r.qty, 0)
          * coalesce(r.item_cost, 0)
        );

  END LOOP;

  --------------------------------------------------------------------
  -- 6. CHARGES
  --
  -- account_id = actual revenue/recovery COA
  -- cost_account_id = actual cost account
  --------------------------------------------------------------------

  FOR c IN
    SELECT *
    FROM public.sales_order_charges
    WHERE order_id = p_order_id
    ORDER BY id
  LOOP

    IF coalesce(c.amount, 0) > 0 THEN

      IF c.account_id IS NULL THEN
        RAISE EXCEPTION
          'Charge "%" has no COA revenue account configured.',
          c.charge_label;
      END IF;

      v_charge_total :=
        v_charge_total + coalesce(c.amount, 0);

      v_charge_tax :=
        v_charge_tax
        + (
            coalesce(c.amount, 0)
            * coalesce(c.tax_percent, 0)
            / 100
          );

    END IF;

    IF coalesce(c.cost_amount, 0) > 0 THEN

      IF c.cost_account_id IS NULL THEN
        RAISE EXCEPTION
          'Charge "%" has cost amount but no cost account configured.',
          c.charge_label;
      END IF;

      v_charge_cost :=
        v_charge_cost + coalesce(c.cost_amount, 0);

    END IF;

  END LOOP;

  --------------------------------------------------------------------
  -- 7. FINAL INVOICE TOTAL
  --------------------------------------------------------------------

  v_invoice_total :=
      v_subtotal
    + v_line_tax
    + v_charge_total
    + v_charge_tax;

  IF v_invoice_total <= 0 THEN
    RAISE EXCEPTION 'Invoice total must be greater than zero.';
  END IF;

  --------------------------------------------------------------------
  -- 8. PREVENT DOUBLE POSTING
  --------------------------------------------------------------------

  IF EXISTS (
    SELECT 1
    FROM public.journal_entries
    WHERE user_id = v_user_id
      AND entry_no = v_order.order_no
  ) THEN
    RAISE EXCEPTION
      'Journal entry already exists for invoice %.',
      v_order.order_no;
  END IF;

  --------------------------------------------------------------------
  -- 9. JOURNAL HEADER
  --------------------------------------------------------------------

  v_entry_no := v_order.order_no;

  INSERT INTO public.journal_entries (
    user_id,
    entry_no,
    entry_date,
    description,
    status,
    payment_mode,
    party_name,
    trans_type
  )
  VALUES (
    v_user_id,
    v_entry_no,
    v_order.order_date,
    'Sales Invoice ' || v_order.order_no,
    'posted',
    coalesce(v_order.payment_mode, 'Credit'),
    coalesce(v_customer.name, 'Cash/Bank Customer'),
    'Sales Invoice'
  )
  RETURNING id
  INTO v_journal_id;

  --------------------------------------------------------------------
  -- 10. DEBIT CUSTOMER / CASH / BANK
  --------------------------------------------------------------------

  INSERT INTO public.journal_lines (
    user_id,
    entry_id,
    account,
    debit,
    credit,
    account_id,
    party_name,
    party_type,
    party_id
  )
  SELECT
    v_user_id,
    v_journal_id,
    coa.code || ' - ' || coa.name,
    v_invoice_total,
    0,
    coa.id,
    CASE
      WHEN lower(coalesce(v_order.payment_mode, 'credit')) = 'credit'
        THEN v_customer.name
      ELSE 'Cash/Bank'
    END,
    CASE
      WHEN lower(coalesce(v_order.payment_mode, 'credit')) = 'credit'
        THEN 'customer'
      ELSE NULL
    END,
    CASE
      WHEN lower(coalesce(v_order.payment_mode, 'credit')) = 'credit'
        THEN v_order.customer_id
      ELSE NULL
    END
  FROM public.chart_of_accounts coa
  WHERE coa.id = v_debit_account;

  --------------------------------------------------------------------
  -- 11. CREDIT SALES REVENUE
  --------------------------------------------------------------------

  INSERT INTO public.journal_lines (
    user_id,
    entry_id,
    account,
    debit,
    credit,
    account_id,
    party_name,
    party_type,
    party_id
  )
  SELECT
    v_user_id,
    v_journal_id,
    coa.code || ' - ' || coa.name,
    0,
    v_subtotal,
    coa.id,
    v_customer.name,
    CASE WHEN v_customer.id IS NOT NULL THEN 'customer' ELSE NULL END,
    v_customer.id
  FROM public.chart_of_accounts coa
  WHERE coa.id = v_sales_account;

  --------------------------------------------------------------------
  -- 12. CREDIT CHARGE REVENUE ACCOUNTS
  --------------------------------------------------------------------

  FOR c IN
    SELECT
      soc.account_id,
      soc.charge_label,
      sum(coalesce(soc.amount, 0)) AS amount
    FROM public.sales_order_charges soc
    WHERE soc.order_id = p_order_id
      AND soc.account_id IS NOT NULL
      AND coalesce(soc.amount, 0) > 0
    GROUP BY soc.account_id, soc.charge_label
  LOOP

    INSERT INTO public.journal_lines (
      user_id,
      entry_id,
      account,
      debit,
      credit,
      account_id,
      party_name,
      party_type,
      party_id
    )
    SELECT
      v_user_id,
      v_journal_id,
      coa.code || ' - ' || coa.name,
      0,
      c.amount,
      coa.id,
      v_customer.name,
      CASE WHEN v_customer.id IS NOT NULL THEN 'customer' ELSE NULL END,
      v_customer.id
    FROM public.chart_of_accounts coa
    WHERE coa.id = c.account_id;

  END LOOP;

  --------------------------------------------------------------------
  -- 13. OUTPUT VAT
  --------------------------------------------------------------------

  IF (v_line_tax + v_charge_tax) > 0 THEN

    IF v_output_vat_account IS NULL THEN
      RAISE EXCEPTION 'Output VAT account is not configured.';
    END IF;

    INSERT INTO public.journal_lines (
      user_id,
      entry_id,
      account,
      debit,
      credit,
      account_id,
      party_name,
      party_type,
      party_id
    )
    SELECT
      v_user_id,
      v_journal_id,
      coa.code || ' - ' || coa.name,
      0,
      v_line_tax + v_charge_tax,
      coa.id,
      v_customer.name,
      CASE WHEN v_customer.id IS NOT NULL THEN 'customer' ELSE NULL END,
      v_customer.id
    FROM public.chart_of_accounts coa
    WHERE coa.id = v_output_vat_account;

  END IF;

  --------------------------------------------------------------------
  -- 14. PRODUCT COGS
  --------------------------------------------------------------------

  IF v_product_cogs > 0 THEN

    INSERT INTO public.journal_lines (
      user_id,
      entry_id,
      account,
      debit,
      credit,
      account_id,
      party_name,
      party_type,
      party_id
    )
    SELECT
      v_user_id,
      v_journal_id,
      coa.code || ' - ' || coa.name,
      v_product_cogs,
      0,
      coa.id,
      v_customer.name,
      CASE WHEN v_customer.id IS NOT NULL THEN 'customer' ELSE NULL END,
      v_customer.id
    FROM public.chart_of_accounts coa
    WHERE coa.id = v_cogs_account;

    INSERT INTO public.journal_lines (
      user_id,
      entry_id,
      account,
      debit,
      credit,
      account_id,
      party_name,
      party_type,
      party_id
    )
    SELECT
      v_user_id,
      v_journal_id,
      coa.code || ' - ' || coa.name,
      0,
      v_product_cogs,
      coa.id,
      v_customer.name,
      CASE WHEN v_customer.id IS NOT NULL THEN 'customer' ELSE NULL END,
      v_customer.id
    FROM public.chart_of_accounts coa
    WHERE coa.id = v_inventory_account;

  END IF;

  --------------------------------------------------------------------
  -- 15. CHARGE COSTS
  --------------------------------------------------------------------

  FOR c IN
    SELECT
      soc.cost_account_id,
      sum(coalesce(soc.cost_amount, 0)) AS cost_amount
    FROM public.sales_order_charges soc
    WHERE soc.order_id = p_order_id
      AND soc.cost_account_id IS NOT NULL
      AND coalesce(soc.cost_amount, 0) > 0
    GROUP BY soc.cost_account_id
  LOOP

    INSERT INTO public.journal_lines (
      user_id,
      entry_id,
      account,
      debit,
      credit,
      account_id,
      party_name,
      party_type,
      party_id
    )
    SELECT
      v_user_id,
      v_journal_id,
      coa.code || ' - ' || coa.name,
      c.cost_amount,
      0,
      coa.id,
      v_customer.name,
      CASE WHEN v_customer.id IS NOT NULL THEN 'customer' ELSE NULL END,
      v_customer.id
    FROM public.chart_of_accounts coa
    WHERE coa.id = c.cost_account_id;

  END LOOP;

  --------------------------------------------------------------------
  -- 16. STOCK OUT — ACTUAL GODOWN
  --------------------------------------------------------------------

  FOR r IN
    SELECT
      sol.item_id,
      sol.qty,
      sol.unit_price,
      sol.godown_id,
      i.name AS item_name,
      i.sku,
      coalesce(i.cost, 0) AS item_cost,
      g.name AS godown_name,
      g.warehouse_id
    FROM public.sales_order_lines sol
    JOIN public.items i
      ON i.id = sol.item_id
    JOIN public.godowns g
      ON g.id = sol.godown_id
    WHERE sol.order_id = p_order_id
  LOOP

    IF r.warehouse_id IS NULL THEN
      RAISE EXCEPTION
        'Selected Godown % is not linked to a warehouse.',
        r.godown_name;
    END IF;

    ------------------------------------------------------------------
    -- Existing warehouse stock
    ------------------------------------------------------------------

    SELECT quantity
    INTO v_stock
    FROM public.warehouse_stock
    WHERE user_id = v_user_id
      AND item_id = r.item_id
      AND warehouse_id = r.warehouse_id
      AND godown_id = r.godown_id
    FOR UPDATE;

    IF coalesce(v_stock, 0) < r.qty THEN
      RAISE EXCEPTION
        'Insufficient stock for % in Godown %. Available: %, Required: %.',
        r.item_name,
        r.godown_name,
        coalesce(v_stock, 0),
        r.qty;
    END IF;

    UPDATE public.warehouse_stock
    SET
      quantity = quantity - r.qty,
      godown = r.godown_name,
      updated_at = now()
    WHERE user_id = v_user_id
      AND item_id = r.item_id
      AND warehouse_id = r.warehouse_id
      AND godown_id = r.godown_id;

    ------------------------------------------------------------------
    -- Stock Movement
    ------------------------------------------------------------------

    INSERT INTO public.stock_movements (
      user_id,
      item_id,
      type,
      qty,
      reference,
      godown,
      warehouse_id,
      godown_id
    )
    VALUES (
      v_user_id,
      r.item_id,
      'out',
      r.qty,
      v_order.order_no,
      r.godown_name,
      r.warehouse_id,
      r.godown_id
    );

  END LOOP;

  --------------------------------------------------------------------
  -- 17. CUSTOMER LEDGER
  --------------------------------------------------------------------

  IF v_order.customer_id IS NOT NULL
     AND lower(coalesce(v_order.payment_mode, 'credit')) = 'credit'
  THEN

    INSERT INTO public.party_ledgers (
      user_id,
      party_type,
      party_id,
      entry_date,
      description,
      reference,
      debit,
      credit,
      balance,
      journal_entry_id
    )
    VALUES (
      v_user_id,
      'customer',
      v_order.customer_id,
      v_order.order_date,
      'Sales Invoice ' || v_order.order_no,
      v_order.order_no,
      v_invoice_total,
      0,
      v_invoice_total,
      v_journal_id
    );

  END IF;

  --------------------------------------------------------------------
  -- 18. LEDGER ENTRIES FROM JOURNAL
  --------------------------------------------------------------------

  FOR r IN
    SELECT
      jl.id AS journal_line_id,
      jl.account_id,
      jl.debit,
      jl.credit
    FROM public.journal_lines jl
    WHERE jl.entry_id = v_journal_id
  LOOP

    INSERT INTO public.ledgers (
      user_id,
      account_id,
      entry_date,
      description,
      debit,
      credit,
      journal_entry_id,
      journal_line_id
    )
    VALUES (
      v_user_id,
      r.account_id,
      v_order.order_date,
      'Sales Invoice ' || v_order.order_no,
      r.debit,
      r.credit,
      v_journal_id,
      r.journal_line_id
    );

  END LOOP;

  --------------------------------------------------------------------
  -- 19. VERIFY JOURNAL BALANCE
  --------------------------------------------------------------------

  SELECT
    coalesce(sum(debit), 0),
    coalesce(sum(credit), 0)
  INTO
    v_total_debit,
    v_total_credit
  FROM public.journal_lines
  WHERE entry_id = v_journal_id;

  IF round(v_total_debit, 2) <> round(v_total_credit, 2) THEN
    RAISE EXCEPTION
      'Journal is not balanced. Debit: %, Credit: %.',
      v_total_debit,
      v_total_credit;
  END IF;

  --------------------------------------------------------------------
  -- 20. UPDATE INVOICE
  --------------------------------------------------------------------

  UPDATE public.sales_orders
  SET
    status = 'posted',
    total = round(v_invoice_total, 2),
    paid_amount =
      CASE
        WHEN lower(coalesce(payment_mode, 'credit')) IN ('cash', 'bank')
          THEN round(v_invoice_total, 2)
        ELSE coalesce(paid_amount, 0)
      END,
    outstanding_amount =
      CASE
        WHEN lower(coalesce(payment_mode, 'credit')) IN ('cash', 'bank')
          THEN 0
        ELSE greatest(
          round(v_invoice_total, 2) - coalesce(paid_amount, 0),
          0
        )
      END,
    payment_status =
      CASE
        WHEN lower(coalesce(payment_mode, 'credit')) IN ('cash', 'bank')
          THEN 'paid'
        WHEN coalesce(paid_amount, 0) >= round(v_invoice_total, 2)
          THEN 'paid'
        WHEN coalesce(paid_amount, 0) > 0
          THEN 'partial'
        ELSE 'unpaid'
      END
  WHERE id = p_order_id
    AND user_id = v_user_id;

  --------------------------------------------------------------------
  -- 21. RETURN RESULT
  --------------------------------------------------------------------

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'invoice_no', v_order.order_no,
    'journal_entry_id', v_journal_id,
    'subtotal', round(v_subtotal, 2),
    'line_tax', round(v_line_tax, 2),
    'charge_total', round(v_charge_total, 2),
    'charge_tax', round(v_charge_tax, 2),
    'invoice_total', round(v_invoice_total, 2),
    'product_cogs', round(v_product_cogs, 2),
    'charge_cost', round(v_charge_cost, 2),
    'payment_mode', coalesce(v_order.payment_mode, 'Credit'),
    'status', 'posted'
  );

END;
$function$
