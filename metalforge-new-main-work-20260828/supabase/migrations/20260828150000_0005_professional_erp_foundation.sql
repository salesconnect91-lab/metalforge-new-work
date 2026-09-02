/*
  MetalForge OS — Professional ERP Foundation
  Additive migration for bilingual documents, tax/charge configuration,
  invoice finance history, service-party ledgers, stock source allocation,
  reminders, roles/permissions and complete audit history.
*/

-- ============================================================
-- SALES / PURCHASE DOCUMENT CONTROL
-- ============================================================

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'Sale Invoice',
  ADD COLUMN IF NOT EXISTS tax_percent numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS payment_terms_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outstanding_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'PKR';

ALTER TABLE public.sales_order_lines
  ADD COLUMN IF NOT EXISTS tax_percent numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS godown_id uuid,
  ADD COLUMN IF NOT EXISTS cost_price numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS tax_percent numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS payment_terms_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outstanding_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'PKR';

-- ============================================================
-- TAX CONFIGURATION
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  rate numeric(8,2) NOT NULL DEFAULT 0,
  applies_to text NOT NULL DEFAULT 'both' CHECK (applies_to IN ('sales','purchase','both')),
  is_fixed boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tax_rates_user ON public.tax_rates(user_id, is_active);

DROP POLICY IF EXISTS "select_own_tax_rates" ON public.tax_rates;
CREATE POLICY "select_own_tax_rates" ON public.tax_rates FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_tax_rates" ON public.tax_rates;
CREATE POLICY "insert_own_tax_rates" ON public.tax_rates FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_tax_rates" ON public.tax_rates;
CREATE POLICY "update_own_tax_rates" ON public.tax_rates FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_tax_rates" ON public.tax_rates;
CREATE POLICY "delete_own_tax_rates" ON public.tax_rates FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- CHARGE RATE MASTER
-- ============================================================

CREATE TABLE IF NOT EXISTS public.charge_rate_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  charge_key text NOT NULL,
  charge_label text NOT NULL,
  rate numeric(14,2) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'fixed',
  applies_to text NOT NULL DEFAULT 'both' CHECK (applies_to IN ('sales','purchase','both')),
  is_fixed boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, charge_key)
);
ALTER TABLE public.charge_rate_settings ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_charge_rate_user ON public.charge_rate_settings(user_id, is_active);

DROP POLICY IF EXISTS "select_own_charge_rates" ON public.charge_rate_settings;
CREATE POLICY "select_own_charge_rates" ON public.charge_rate_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_charge_rates" ON public.charge_rate_settings;
CREATE POLICY "insert_own_charge_rates" ON public.charge_rate_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_charge_rates" ON public.charge_rate_settings;
CREATE POLICY "update_own_charge_rates" ON public.charge_rate_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_charge_rates" ON public.charge_rate_settings;
CREATE POLICY "delete_own_charge_rates" ON public.charge_rate_settings FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- SERVICE / CONTRACTOR PARTIES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  party_type text NOT NULL CHECK (party_type IN ('loading','cutting','transport','labour','handling','other')),
  phone text,
  email text,
  address text,
  account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.service_parties ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_service_parties_user ON public.service_parties(user_id, party_type);

DROP POLICY IF EXISTS "select_own_service_parties" ON public.service_parties;
CREATE POLICY "select_own_service_parties" ON public.service_parties FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_service_parties" ON public.service_parties;
CREATE POLICY "insert_own_service_parties" ON public.service_parties FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_service_parties" ON public.service_parties;
CREATE POLICY "update_own_service_parties" ON public.service_parties FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_service_parties" ON public.service_parties;
CREATE POLICY "delete_own_service_parties" ON public.service_parties FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- INVOICE CHARGES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sales_order_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  charge_key text NOT NULL,
  charge_label text NOT NULL,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'fixed',
  rate numeric(14,2) NOT NULL DEFAULT 0,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  tax_percent numeric(8,2) NOT NULL DEFAULT 0,
  account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  worker_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  service_party_id uuid REFERENCES public.service_parties(id) ON DELETE SET NULL,
  service_party_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_order_charges
  ADD COLUMN IF NOT EXISTS quantity numeric(14,3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS rate numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_percent numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_party_id uuid,
  ADD COLUMN IF NOT EXISTS service_party_name text;

ALTER TABLE public.sales_order_charges ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sales_order_charges_order ON public.sales_order_charges(order_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_charges_party ON public.sales_order_charges(service_party_id);

DROP POLICY IF EXISTS "select_own_sales_order_charges" ON public.sales_order_charges;
CREATE POLICY "select_own_sales_order_charges" ON public.sales_order_charges FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_sales_order_charges" ON public.sales_order_charges;
CREATE POLICY "insert_own_sales_order_charges" ON public.sales_order_charges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_sales_order_charges" ON public.sales_order_charges;
CREATE POLICY "update_own_sales_order_charges" ON public.sales_order_charges FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_sales_order_charges" ON public.sales_order_charges;
CREATE POLICY "delete_own_sales_order_charges" ON public.sales_order_charges FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- CUSTOMER PAYMENT ALLOCATIONS
-- Compatible with the payment flow already used by MetalForge OS.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invoice_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  order_no text,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  journal_line_id uuid REFERENCES public.journal_lines(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  allocation_date date NOT NULL DEFAULT CURRENT_DATE,
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_invoice_alloc_order ON public.invoice_payment_allocations(sales_order_id, allocation_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_alloc_customer ON public.invoice_payment_allocations(customer_id, allocation_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_alloc_journal ON public.invoice_payment_allocations(journal_entry_id);

DROP POLICY IF EXISTS "select_own_invoice_payment_allocations" ON public.invoice_payment_allocations;
CREATE POLICY "select_own_invoice_payment_allocations" ON public.invoice_payment_allocations FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_invoice_payment_allocations" ON public.invoice_payment_allocations;
CREATE POLICY "insert_own_invoice_payment_allocations" ON public.invoice_payment_allocations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_invoice_payment_allocations" ON public.invoice_payment_allocations;
CREATE POLICY "update_own_invoice_payment_allocations" ON public.invoice_payment_allocations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_invoice_payment_allocations" ON public.invoice_payment_allocations;
CREATE POLICY "delete_own_invoice_payment_allocations" ON public.invoice_payment_allocations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Recalculate invoice payment status whenever an allocation changes.
CREATE OR REPLACE FUNCTION public.recalculate_sales_order_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sales_order_id uuid;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_outstanding numeric := 0;
  v_status text := 'unpaid';
BEGIN
  v_sales_order_id := COALESCE(NEW.sales_order_id, OLD.sales_order_id);

  SELECT COALESCE(total, 0)
    INTO v_total
  FROM public.sales_orders
  WHERE id = v_sales_order_id;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
  FROM public.invoice_payment_allocations
  WHERE sales_order_id = v_sales_order_id;

  v_outstanding := GREATEST(v_total - v_paid, 0);

  IF v_paid <= 0 THEN
    v_status := 'unpaid';
  ELSIF v_paid < v_total THEN
    v_status := 'partial';
  ELSIF v_paid = v_total THEN
    v_status := 'paid';
  ELSE
    v_status := 'overpaid';
  END IF;

  UPDATE public.sales_orders
  SET paid_amount = v_paid,
      outstanding_amount = v_outstanding,
      payment_status = v_status
  WHERE id = v_sales_order_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_sales_order_payment_status ON public.invoice_payment_allocations;
CREATE TRIGGER trg_recalculate_sales_order_payment_status
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.recalculate_sales_order_payment_status();

-- ============================================================
-- STOCK SOURCE ALLOCATION
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sales_order_stock_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  sales_order_line_id uuid NOT NULL REFERENCES public.sales_order_lines(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  godown_id uuid,
  godown_name text,
  qty numeric(14,3) NOT NULL DEFAULT 0 CHECK (qty >= 0),
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_order_stock_allocations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sales_stock_alloc_order ON public.sales_order_stock_allocations(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_stock_alloc_godown ON public.sales_order_stock_allocations(godown_id, item_id);

DROP POLICY IF EXISTS "select_own_sales_stock_allocations" ON public.sales_order_stock_allocations;
CREATE POLICY "select_own_sales_stock_allocations" ON public.sales_order_stock_allocations FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_sales_stock_allocations" ON public.sales_order_stock_allocations;
CREATE POLICY "insert_own_sales_stock_allocations" ON public.sales_order_stock_allocations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_sales_stock_allocations" ON public.sales_order_stock_allocations;
CREATE POLICY "update_own_sales_stock_allocations" ON public.sales_order_stock_allocations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_sales_stock_allocations" ON public.sales_order_stock_allocations;
CREATE POLICY "delete_own_sales_stock_allocations" ON public.sales_order_stock_allocations FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- ============================================================
-- SERVICE PARTY LEDGER
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_party_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  service_party_id uuid NOT NULL REFERENCES public.service_parties(id) ON DELETE CASCADE,
  sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  reference text,
  debit numeric(14,2) NOT NULL DEFAULT 0,
  credit numeric(14,2) NOT NULL DEFAULT 0,
  balance numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.service_party_ledger ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_service_party_ledger_party ON public.service_party_ledger(service_party_id, entry_date, created_at);

DROP POLICY IF EXISTS "select_own_service_party_ledger" ON public.service_party_ledger;
CREATE POLICY "select_own_service_party_ledger" ON public.service_party_ledger FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_service_party_ledger" ON public.service_party_ledger;
CREATE POLICY "insert_own_service_party_ledger" ON public.service_party_ledger FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_service_party_ledger" ON public.service_party_ledger;
CREATE POLICY "update_own_service_party_ledger" ON public.service_party_ledger FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_service_party_ledger" ON public.service_party_ledger;
CREATE POLICY "delete_own_service_party_ledger" ON public.service_party_ledger FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.post_service_party_charge_to_ledger(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  charge_row record;
  v_balance numeric;
BEGIN
  FOR charge_row IN
    SELECT * FROM public.sales_order_charges
    WHERE order_id = p_order_id AND service_party_id IS NOT NULL AND COALESCE(amount,0) <> 0
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.service_party_ledger
      WHERE sales_order_id = charge_row.order_id
        AND service_party_id = charge_row.service_party_id
        AND reference = charge_row.id::text
    ) THEN
      SELECT COALESCE(balance,0) INTO v_balance
      FROM public.service_party_ledger
      WHERE service_party_id = charge_row.service_party_id
      ORDER BY entry_date DESC, created_at DESC
      LIMIT 1;

      v_balance := v_balance + COALESCE(charge_row.amount,0);

      INSERT INTO public.service_party_ledger(
        user_id, service_party_id, sales_order_id, entry_date, description, reference, debit, credit, balance
      ) VALUES (
        charge_row.user_id, charge_row.service_party_id, charge_row.order_id, CURRENT_DATE,
        charge_row.charge_label, charge_row.id::text, 0, COALESCE(charge_row.amount,0), v_balance
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_service_party_charges_on_invoice_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'posted' AND COALESCE(OLD.status,'') <> 'posted' THEN
    PERFORM public.post_service_party_charge_to_ledger(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_party_charge_ledger ON public.sales_order_charges;
DROP TRIGGER IF EXISTS trg_service_party_charges_on_invoice_post ON public.sales_orders;
CREATE TRIGGER trg_service_party_charges_on_invoice_post
AFTER UPDATE OF status ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.post_service_party_charges_on_invoice_post();

-- ============================================================
-- PAYMENT REMINDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms','whatsapp')),
  recipient text,
  subject text,
  message text NOT NULL,
  scheduled_for timestamptz,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sent','failed','cancelled')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_payment_reminders_user ON public.payment_reminders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_reminders_invoice ON public.payment_reminders(sales_order_id);

DROP POLICY IF EXISTS "select_own_payment_reminders" ON public.payment_reminders;
CREATE POLICY "select_own_payment_reminders" ON public.payment_reminders FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_payment_reminders" ON public.payment_reminders;
CREATE POLICY "insert_own_payment_reminders" ON public.payment_reminders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_payment_reminders" ON public.payment_reminders;
CREATE POLICY "update_own_payment_reminders" ON public.payment_reminders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_payment_reminders" ON public.payment_reminders;
CREATE POLICY "delete_own_payment_reminders" ON public.payment_reminders FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- USER PROFILES / ROLES / PERMISSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  department text,
  role text NOT NULL DEFAULT 'viewer',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role, is_active);

DROP POLICY IF EXISTS "select_own_user_profile" ON public.user_profiles;
CREATE POLICY "select_own_user_profile" ON public.user_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id OR auth.uid() = id);
DROP POLICY IF EXISTS "insert_own_user_profile" ON public.user_profiles;
CREATE POLICY "insert_own_user_profile" ON public.user_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR auth.uid() = id);
DROP POLICY IF EXISTS "update_own_user_profile" ON public.user_profiles;
CREATE POLICY "update_own_user_profile" ON public.user_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id OR auth.uid() = id) WITH CHECK (auth.uid() = user_id OR auth.uid() = id);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  module_key text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_post boolean NOT NULL DEFAULT false,
  can_print boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role, module_key)
);
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_role_permissions_user ON public.role_permissions(user_id, role);

DROP POLICY IF EXISTS "select_own_role_permissions" ON public.role_permissions;
CREATE POLICY "select_own_role_permissions" ON public.role_permissions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_role_permissions" ON public.role_permissions;
CREATE POLICY "insert_own_role_permissions" ON public.role_permissions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_role_permissions" ON public.role_permissions;
CREATE POLICY "update_own_role_permissions" ON public.role_permissions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_role_permissions" ON public.role_permissions;
CREATE POLICY "delete_own_role_permissions" ON public.role_permissions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- GENERIC AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  action text NOT NULL,
  table_name text,
  record_id uuid,
  record_name text,
  performed_by uuid,
  performed_email text,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON public.audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(performed_by, created_at DESC);

DROP POLICY IF EXISTS "select_own_audit_logs" ON public.audit_logs;
CREATE POLICY "select_own_audit_logs" ON public.audit_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.write_erp_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_email text;
  v_record_id uuid;
  v_record_name text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_user_id := COALESCE((to_jsonb(NEW)->>'user_id')::uuid, (to_jsonb(OLD)->>'user_id')::uuid, auth.uid());
  v_record_id := COALESCE((to_jsonb(NEW)->>'id')::uuid, (to_jsonb(OLD)->>'id')::uuid);
  v_old := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_record_name := COALESCE(
    to_jsonb(NEW)->>'order_no',
    to_jsonb(OLD)->>'order_no',
    to_jsonb(NEW)->>'entry_no',
    to_jsonb(OLD)->>'entry_no',
    to_jsonb(NEW)->>'pass_no',
    to_jsonb(OLD)->>'pass_no',
    to_jsonb(NEW)->>'name',
    to_jsonb(OLD)->>'name',
    v_record_id::text
  );

  SELECT email INTO v_email FROM auth.users WHERE id = COALESCE(auth.uid(), v_user_id);

  INSERT INTO public.audit_logs(
    user_id, module, action, table_name, record_id, record_name,
    performed_by, performed_email, old_data, new_data
  )
  VALUES (
    v_user_id,
    replace(TG_TABLE_NAME, '_', ' '),
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    v_record_name,
    auth.uid(),
    v_email,
    v_old,
    v_new
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Audit the business transactions; audit_logs itself is intentionally excluded.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sales_orders','sales_order_lines','sales_order_charges',
    'purchase_orders','purchase_order_lines',
    'stock_movements','sales_order_stock_allocations',
    'gate_passes','work_orders','work_order_lines','cutting_orders',
    'journal_entries','journal_lines','invoice_payment_allocations',
    'payment_reminders','service_parties','service_party_ledger','tax_rates','charge_rate_settings'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_erp_audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_erp_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.write_erp_audit_log()', t, t);
  END LOOP;
END $$;

-- ============================================================
-- FINANCIAL / REPORTING VIEWS
-- ============================================================

CREATE OR REPLACE VIEW public.sales_invoice_financials AS
SELECT
  so.id AS sales_order_id,
  so.order_no AS invoice_no,
  so.customer_id,
  c.name AS customer_name,
  so.sales_person,
  so.order_date AS invoice_date,
  so.due_date,
  so.total AS invoice_amount,
  COALESCE(so.paid_amount, 0) AS paid_amount,
  COALESCE(so.outstanding_amount, GREATEST(so.total - COALESCE(so.paid_amount,0),0)) AS outstanding_amount,
  COALESCE(so.payment_status, 'unpaid') AS payment_status,
  COALESCE((
    SELECT SUM(prior.total - COALESCE(prior.paid_amount,0))
    FROM public.sales_orders prior
    WHERE prior.customer_id = so.customer_id
      AND prior.status IN ('confirmed','shipped','posted','closed')
      AND (prior.order_date < so.order_date OR (prior.order_date = so.order_date AND prior.created_at < so.created_at))
  ), 0) AS previous_balance,
  COALESCE((
    SELECT SUM(a.amount)
    FROM public.invoice_payment_allocations a
    WHERE a.sales_order_id = so.id
      AND a.allocation_date = CURRENT_DATE
  ), 0) AS today_received,
  lp.amount AS last_payment_amount,
  lp.allocation_date AS last_payment_date,
  lp.payment_mode AS last_payment_mode,
  lp.account_code AS last_payment_account_code,
  lp.account_name AS last_payment_account_name,
  GREATEST(COALESCE(so.outstanding_amount, so.total - COALESCE(so.paid_amount,0)) + COALESCE(lp.amount,0), 0) AS balance_before_last_payment,
  CASE
    WHEN so.due_date IS NULL THEN 0
    WHEN CURRENT_DATE <= so.due_date THEN 0
    ELSE CURRENT_DATE - so.due_date
  END AS overdue_days
FROM public.sales_orders so
LEFT JOIN public.customers c ON c.id = so.customer_id
LEFT JOIN LATERAL (
  SELECT
    a.amount,
    a.allocation_date,
    je.payment_mode,
    coa.code AS account_code,
    coa.name AS account_name
  FROM public.invoice_payment_allocations a
  LEFT JOIN public.journal_entries je ON je.id = a.journal_entry_id
  LEFT JOIN public.journal_lines jl ON jl.id = a.journal_line_id
  LEFT JOIN public.chart_of_accounts coa ON coa.id = jl.account_id
  WHERE a.sales_order_id = so.id
  ORDER BY a.allocation_date DESC, a.created_at DESC
  LIMIT 1
) lp ON true;

CREATE OR REPLACE VIEW public.sales_margin_report AS
SELECT
  so.id AS sales_order_id,
  so.order_no AS invoice_no,
  so.order_date AS invoice_date,
  so.customer_id,
  c.name AS customer_name,
  so.sales_person,
  SUM(sol.qty) AS quantity,
  SUM(sol.line_total) AS sales_amount,
  SUM(sol.qty * COALESCE(NULLIF(sol.cost_price,0), i.cost, 0)) AS cost_amount,
  SUM(sol.line_total - (sol.qty * COALESCE(NULLIF(sol.cost_price,0), i.cost, 0))) AS gross_profit,
  CASE WHEN SUM(sol.line_total) = 0 THEN 0
       ELSE (SUM(sol.line_total - (sol.qty * COALESCE(NULLIF(sol.cost_price,0), i.cost, 0))) / SUM(sol.line_total)) * 100
  END AS margin_percent
FROM public.sales_orders so
JOIN public.sales_order_lines sol ON sol.order_id = so.id
LEFT JOIN public.items i ON i.id = sol.item_id
LEFT JOIN public.customers c ON c.id = so.customer_id
WHERE so.status IN ('confirmed','shipped','posted','closed')
GROUP BY so.id, so.order_no, so.order_date, so.customer_id, c.name, so.sales_person;

CREATE OR REPLACE VIEW public.stock_godown_report AS
SELECT
  ws.item_id,
  i.sku,
  i.name AS item_name,
  i.grade,
  i.size,
  ws.godown,
  ws.quantity,
  COALESCE(i.cost,0) AS unit_cost,
  ws.quantity * COALESCE(i.cost,0) AS stock_value,
  GREATEST(CURRENT_DATE - COALESCE((SELECT MAX(sm.created_at::date) FROM public.stock_movements sm WHERE sm.item_id = ws.item_id AND sm.godown = ws.godown AND sm.type = 'in'), ws.updated_at::date), 0) AS stock_age_days
FROM public.warehouse_stock ws
LEFT JOIN public.items i ON i.id = ws.item_id;

CREATE OR REPLACE VIEW public.service_party_balance_report AS
SELECT
  sp.id AS service_party_id,
  sp.name,
  sp.party_type,
  COALESCE(SUM(soc.amount),0) AS charges_total,
  COALESCE((SELECT SUM(l.credit - l.debit) FROM public.service_party_ledger l WHERE l.service_party_id = sp.id),0) AS balance_due
FROM public.service_parties sp
LEFT JOIN public.sales_order_charges soc ON soc.service_party_id = sp.id
GROUP BY sp.id, sp.name, sp.party_type;

-- ============================================================
-- DEFAULT MASTER VALUES
-- ============================================================

INSERT INTO public.charge_rate_settings(user_id, charge_key, charge_label, rate, unit, applies_to, is_fixed)
SELECT auth.uid(), v.key, v.label, 0, 'fixed', 'both', false
FROM (VALUES
  ('loading','Loading Charges'),
  ('unloading','Unloading Charges'),
  ('cutting','Cutting Charges'),
  ('transport','Transport Freight'),
  ('labour','Labour Charges'),
  ('handling','Handling Charges'),
  ('other','Other Charges')
) v(key,label)
WHERE auth.uid() IS NOT NULL
ON CONFLICT (user_id, charge_key) DO NOTHING;

INSERT INTO public.tax_rates(user_id, name, rate, applies_to, is_fixed)
SELECT auth.uid(), 'VAT / GST', 18, 'both', true
WHERE auth.uid() IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tax_rates WHERE user_id = auth.uid() AND name = 'VAT / GST'
  );

COMMENT ON TABLE public.audit_logs IS 'Complete ERP activity history with user ID/email, old/new values and document identity.';
COMMENT ON TABLE public.invoice_payment_allocations IS 'Invoice-wise customer receipt allocation history.';
COMMENT ON TABLE public.sales_order_stock_allocations IS 'Exact source godown allocation for each sales invoice line.';
COMMENT ON TABLE public.charge_rate_settings IS 'Configurable loading/cutting/transport/labour/handling charge rates.';
COMMENT ON TABLE public.tax_rates IS 'Configurable fixed or changeable sales/purchase tax rates.';
