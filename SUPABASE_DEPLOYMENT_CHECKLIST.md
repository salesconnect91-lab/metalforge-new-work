# MetalForge OS — Supabase Deployment Checklist

Run these migrations in this exact order after taking a database backup:

1. `20260902123000_live_schema_compatibility.sql`
2. `20260902124021_standardize_account_mapping_keys.sql`
3. `20260902124757_harden_default_coa_initializer.sql`
4. `20260902125249_enforce_account_mapping_integrity.sql`
5. `20260902130136_protect_mapped_account_lifecycle.sql`
6. `20260902133200_atomic_bulk_journal_import.sql`
7. `20260902134400_allow_system_audit_rows.sql`
8. `20260902134500_protect_customer_supplier_history.sql`
9. `20260902140336_accounting_period_closing.sql`
10. `20260902141139_manual_journal_reversal.sql`
11. `20260902143500_credit_debit_notes.sql`
12. `20260902145500_bank_reconciliation.sql`
13. `20260902152000_fiscal_year_closing.sql`
14. `20260902160000_complete_accounting_controls.sql`
15. `20260902170000_postdeployment_advisor_cleanup.sql`

## Post-deployment verification

```sql
select version, name
from supabase_migrations.schema_migrations
where version >= '20260902124021'
order by version;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'return_notes', 'return_note_lines',
    'bank_reconciliations', 'bank_reconciliation_items',
    'fiscal_year_closures', 'fiscal_year_opening_balances',
    'account_budgets', 'fixed_assets', 'fixed_asset_depreciation',
    'opening_balance_batches'
  )
order by tablename;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'create_and_post_return_note',
    'create_bank_reconciliation',
    'set_bank_transaction_cleared',
    'close_bank_reconciliation',
    'close_fiscal_year',
    'post_fixed_asset_depreciation',
    'post_opening_balances',
    'current_erp_role',
    'set_role_permission'
  )
order by routine_name;
```

Expected: 15 migration rows, every listed table has `rowsecurity = true`, and every listed RPC is present.

Finally reload PostgREST schema or wait for the migration `NOTIFY pgrst, 'reload schema'` calls to take effect, then sign out/in and perform UAT with a test company before entering live transactions.
