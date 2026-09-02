-- MetalForge OS
-- Sync live journal posting engine into version-controlled migrations.
-- Includes safety fixes for negative debit/credit values and bulk result metadata.

ALTER TABLE public.ledgers
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid
    REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS journal_line_id uuid
    REFERENCES public.journal_lines(id) ON DELETE SET NULL;

ALTER TABLE public.party_ledgers
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid
    REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS journal_line_id uuid
    REFERENCES public.journal_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ledgers_journal_entry
  ON public.ledgers(journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_ledgers_journal_line
  ON public.ledgers(journal_line_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_party_ledgers_journal_line
  ON public.party_ledgers(journal_line_id)
  WHERE journal_line_id IS NOT NULL;


CREATE OR REPLACE FUNCTION public.post_party_ledger_for_journal(
  p_journal_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT je.user_id
    INTO v_user_id
  FROM public.journal_entries je
  WHERE je.id = p_journal_entry_id
    AND je.user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry not found.';
  END IF;

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
    journal_entry_id,
    journal_line_id
  )
  SELECT
    jl.user_id,
    jl.party_type,
    jl.party_id,
    je.entry_date,
    COALESCE(NULLIF(jl.account, ''), je.description),
    je.entry_no,
    ROUND(COALESCE(jl.debit, 0), 2),
    ROUND(COALESCE(jl.credit, 0), 2),
    0,
    je.id,
    jl.id
  FROM public.journal_lines jl
  JOIN public.journal_entries je
    ON je.id = jl.entry_id
  WHERE jl.entry_id = p_journal_entry_id
    AND jl.user_id = v_user_id
    AND je.user_id = v_user_id
    AND jl.party_type IS NOT NULL
    AND jl.party_id IS NOT NULL
    AND je.status = 'posted'
  ON CONFLICT (journal_line_id)
  WHERE journal_line_id IS NOT NULL
  DO NOTHING;
END;
$function$;


CREATE OR REPLACE FUNCTION public.post_journal_entry(
  p_entry_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_user_id uuid;
  v_status text;

  v_total_debit numeric := 0;
  v_total_credit numeric := 0;

  v_line_count integer := 0;
  v_invalid_count integer := 0;
  v_ledger_rows integer := 0;

  v_ar_account_id uuid;
  v_ap_account_id uuid;
BEGIN
  SELECT
    je.user_id,
    je.status
  INTO
    v_user_id,
    v_status
  FROM public.journal_entries je
  WHERE je.id = p_entry_id
    AND je.user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry not found.';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION
      'Only draft journal entries can be posted. Current status: %',
      v_status;
  END IF;

  SELECT am.account_id
  INTO v_ar_account_id
  FROM public.account_mappings am
  WHERE am.user_id = v_user_id
    AND am.mapping_key = 'accounts_receivable'
  LIMIT 1;

  SELECT am.account_id
  INTO v_ap_account_id
  FROM public.account_mappings am
  WHERE am.user_id = v_user_id
    AND am.mapping_key = 'accounts_payable'
  LIMIT 1;

  IF v_ar_account_id IS NULL THEN
    RAISE EXCEPTION 'Accounts Receivable mapping is missing.';
  END IF;

  IF v_ap_account_id IS NULL THEN
    RAISE EXCEPTION 'Accounts Payable mapping is missing.';
  END IF;

  SELECT
    COUNT(*),
    ROUND(COALESCE(SUM(jl.debit), 0), 2),
    ROUND(COALESCE(SUM(jl.credit), 0), 2)
  INTO
    v_line_count,
    v_total_debit,
    v_total_credit
  FROM public.journal_lines jl
  WHERE jl.entry_id = p_entry_id
    AND jl.user_id = v_user_id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Cannot post an empty journal entry.';
  END IF;

  IF ABS(v_total_debit - v_total_credit) >= 0.01 THEN
    RAISE EXCEPTION
      'Journal is not balanced. Debit: %, Credit: %.',
      v_total_debit,
      v_total_credit;
  END IF;

  SELECT COUNT(*)
  INTO v_invalid_count
  FROM public.journal_lines jl
  LEFT JOIN public.chart_of_accounts coa
    ON coa.id = jl.account_id
   AND coa.user_id = v_user_id
  WHERE jl.entry_id = p_entry_id
    AND jl.user_id = v_user_id
    AND (
      jl.account_id IS NULL
      OR coa.id IS NULL
      OR coa.is_active = false
      OR coa.is_group = true
      OR coa.allow_manual_entries = false

      OR COALESCE(jl.debit, 0) < 0
      OR COALESCE(jl.credit, 0) < 0

      OR (
        COALESCE(jl.debit, 0) > 0
        AND COALESCE(jl.credit, 0) > 0
      )

      OR (
        COALESCE(jl.debit, 0) <= 0
        AND COALESCE(jl.credit, 0) <= 0
      )

      OR (
        jl.party_type IS NULL
        AND jl.party_id IS NOT NULL
      )

      OR (
        jl.party_type IS NOT NULL
        AND jl.party_id IS NULL
      )
    );

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'One or more journal lines are invalid.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.journal_lines jl
    WHERE jl.entry_id = p_entry_id
      AND jl.user_id = v_user_id
      AND jl.account_id = v_ar_account_id
      AND (
        jl.party_type IS DISTINCT FROM 'customer'
        OR jl.party_id IS NULL
      )
  ) THEN
    RAISE EXCEPTION
      'Accounts Receivable lines require a Customer.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.journal_lines jl
    WHERE jl.entry_id = p_entry_id
      AND jl.user_id = v_user_id
      AND jl.account_id = v_ap_account_id
      AND (
        jl.party_type IS DISTINCT FROM 'supplier'
        OR jl.party_id IS NULL
      )
  ) THEN
    RAISE EXCEPTION
      'Accounts Payable lines require a Supplier.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.journal_lines jl
    WHERE jl.entry_id = p_entry_id
      AND jl.user_id = v_user_id
      AND jl.party_type = 'customer'
      AND (
        jl.account_id <> v_ar_account_id
        OR NOT EXISTS (
          SELECT 1
          FROM public.customers c
          WHERE c.id = jl.party_id
            AND c.user_id = v_user_id
            AND c.account_id = v_ar_account_id
        )
      )
  ) THEN
    RAISE EXCEPTION
      'One or more customer journal lines have an invalid Customer or Accounts Receivable account.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.journal_lines jl
    WHERE jl.entry_id = p_entry_id
      AND jl.user_id = v_user_id
      AND jl.party_type = 'supplier'
      AND (
        jl.account_id <> v_ap_account_id
        OR NOT EXISTS (
          SELECT 1
          FROM public.suppliers s
          WHERE s.id = jl.party_id
            AND s.user_id = v_user_id
            AND s.account_id = v_ap_account_id
        )
      )
  ) THEN
    RAISE EXCEPTION
      'One or more supplier journal lines have an invalid Supplier or Accounts Payable account.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ledgers l
    WHERE l.journal_entry_id = p_entry_id
      AND l.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION
      'Ledger entries already exist for this journal entry.';
  END IF;

  INSERT INTO public.ledgers (
    user_id,
    journal_entry_id,
    journal_line_id,
    account_id,
    entry_date,
    description,
    debit,
    credit
  )
  SELECT
    v_user_id,
    p_entry_id,
    jl.id,
    jl.account_id,
    je.entry_date,
    CONCAT(
      je.entry_no,
      ' - ',
      COALESCE(NULLIF(je.description, ''), 'Journal Entry')
    ),
    ROUND(COALESCE(jl.debit, 0), 2),
    ROUND(COALESCE(jl.credit, 0), 2)
  FROM public.journal_lines jl
  JOIN public.journal_entries je
    ON je.id = jl.entry_id
  WHERE jl.entry_id = p_entry_id
    AND jl.user_id = v_user_id;

  GET DIAGNOSTICS v_ledger_rows = ROW_COUNT;

  IF v_ledger_rows <> v_line_count THEN
    RAISE EXCEPTION
      'Ledger row count does not match journal line count.';
  END IF;

  UPDATE public.journal_entries
  SET status = 'posted'
  WHERE id = p_entry_id
    AND user_id = v_user_id
    AND status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry could not be posted.';
  END IF;

  PERFORM public.post_party_ledger_for_journal(p_entry_id);

  RETURN jsonb_build_object(
    'success', true,
    'entry_id', p_entry_id,
    'total_debit', v_total_debit,
    'total_credit', v_total_credit,
    'ledger_rows_created', v_ledger_rows,
    'status', 'posted'
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.bulk_post_journal_entries(
  p_entry_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_entry_id uuid;
  v_result jsonb;
  v_entries_posted integer := 0;
  v_ledger_rows_created integer := 0;
BEGIN
  IF p_entry_ids IS NULL
     OR cardinality(p_entry_ids) = 0 THEN
    RAISE EXCEPTION
      'No journal entries were supplied for posting.';
  END IF;

  FOREACH v_entry_id IN ARRAY p_entry_ids
  LOOP
    v_result := public.post_journal_entry(v_entry_id);

    IF COALESCE((v_result ->> 'success')::boolean, false) THEN
      v_entries_posted := v_entries_posted + 1;
      v_ledger_rows_created :=
        v_ledger_rows_created
        + COALESCE((v_result ->> 'ledger_rows_created')::integer, 0);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'entries_posted', v_entries_posted,
    'ledger_rows_created', v_ledger_rows_created
  );
END;
$function$;


REVOKE ALL ON FUNCTION public.post_party_ledger_for_journal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_journal_entry(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_post_journal_entries(uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.post_party_ledger_for_journal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_post_journal_entries(uuid[]) TO authenticated;
