-- Production migration applied to harden General Cash/Bank posting.
create or replace function public.post_general_cash_bank_transaction(p_transaction_date date,p_transaction_type text,p_counter_account_id uuid,p_cash_bank_account_id uuid,p_amount numeric,p_party_name text default null,p_reference text default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare
 v_user_id uuid:=public.legacy_data_user_id(); v_company uuid:=public.current_company_id(); v_bu uuid:=public.current_business_unit_id();
 v_entry_id uuid; v_entry_no text; v_counter record; v_cash_bank record; v_debit_account_id uuid; v_credit_account_id uuid;
 v_debit_account_text text; v_credit_account_text text; v_description text; v_salary_account uuid; v_cogs_account uuid; v_ap_account uuid; v_output_vat_account uuid;
begin
 perform public.assert_module_permission('accounting','post');
 if v_user_id is null or v_company is null or v_bu is null then raise exception 'Authentication and active company/business unit are required.'; end if;
 if coalesce(p_amount,0)<=0 then raise exception 'Amount must be greater than zero.'; end if;
 if p_transaction_date is null then raise exception 'Transaction date is required.'; end if;
 if p_counter_account_id is null or p_cash_bank_account_id is null then raise exception 'Both transaction account and cash/bank account are required.'; end if;
 if p_counter_account_id=p_cash_bank_account_id then raise exception 'Transaction account and cash/bank account cannot be the same.'; end if;
 if p_transaction_type not in ('salary_payment','expense_payment','loan_received','loan_repayment','capital_received','drawings_payment','other_receipt','other_payment') then raise exception 'Invalid transaction type.'; end if;
 select id,code,name,type,detail_type,account_role,is_active,is_group,allow_manual_entries into v_counter from public.chart_of_accounts where id=p_counter_account_id and user_id=v_user_id and company_id=v_company;
 if not found then raise exception 'Transaction account not found in active company.'; end if;
 if not coalesce(v_counter.is_active,false) or coalesce(v_counter.is_group,false) or not coalesce(v_counter.allow_manual_entries,false) then raise exception 'Selected transaction account is not a valid posting account.'; end if;
 select id,code,name,type,detail_type,account_role,is_active,is_group,allow_manual_entries into v_cash_bank from public.chart_of_accounts where id=p_cash_bank_account_id and user_id=v_user_id and company_id=v_company;
 if not found then raise exception 'Cash/Bank account not found in active company.'; end if;
 if not coalesce(v_cash_bank.is_active,false) or coalesce(v_cash_bank.is_group,false) or not coalesce(v_cash_bank.allow_manual_entries,false) or v_cash_bank.type<>'asset' or coalesce(v_cash_bank.detail_type,'') not in ('Cash on Hand','Bank Account') then raise exception 'Selected payment account must be an active Cash on Hand or Bank Account.'; end if;
 select account_id into v_salary_account from public.account_mappings where user_id=v_user_id and company_id=v_company and mapping_key='salary_expense' limit 1;
 select account_id into v_cogs_account from public.account_mappings where user_id=v_user_id and company_id=v_company and mapping_key='cogs' limit 1;
 select account_id into v_ap_account from public.account_mappings where user_id=v_user_id and company_id=v_company and mapping_key='accounts_payable' limit 1;
 select account_id into v_output_vat_account from public.account_mappings where user_id=v_user_id and company_id=v_company and mapping_key='output_vat' limit 1;
 case p_transaction_type
  when 'salary_payment' then
   if v_counter.type<>'expense' or (v_salary_account is not null and v_counter.id is distinct from v_salary_account) or (v_salary_account is null and coalesce(v_counter.detail_type,'')<>'Salaries') then raise exception 'Salary Payment must use the configured Salaries & Wages expense account.'; end if;
   if nullif(btrim(coalesce(p_party_name,'')),'') is null then raise exception 'Employee is required for Salary Payment.'; end if;
   v_debit_account_id:=p_counter_account_id; v_credit_account_id:=p_cash_bank_account_id; v_description:='Salary Payment';
  when 'expense_payment' then
   if v_counter.type<>'expense' or v_counter.id is not distinct from v_cogs_account or v_counter.id is not distinct from v_salary_account or coalesce(v_counter.detail_type,'') in ('COGS','Salaries') then raise exception 'Expense Payment must use a normal operating expense account, not COGS or Salaries.'; end if;
   v_debit_account_id:=p_counter_account_id; v_credit_account_id:=p_cash_bank_account_id; v_description:='Expense Payment';
  when 'loan_received' then
   if v_counter.type<>'liability' or v_counter.id is not distinct from v_ap_account or v_counter.id is not distinct from v_output_vat_account or coalesce(v_counter.detail_type,'') in ('Accounts Payable','Output VAT') then raise exception 'Loan Received requires a dedicated loan liability account.'; end if;
   v_debit_account_id:=p_cash_bank_account_id; v_credit_account_id:=p_counter_account_id; v_description:='Loan Received';
  when 'loan_repayment' then
   if v_counter.type<>'liability' or v_counter.id is not distinct from v_ap_account or v_counter.id is not distinct from v_output_vat_account or coalesce(v_counter.detail_type,'') in ('Accounts Payable','Output VAT') then raise exception 'Loan Repayment requires a dedicated loan liability account.'; end if;
   v_debit_account_id:=p_counter_account_id; v_credit_account_id:=p_cash_bank_account_id; v_description:='Loan Repayment';
  when 'capital_received' then
   if v_counter.type<>'equity' or coalesce(v_counter.detail_type,'') in ('Retained Earnings','Owner Drawings','Drawings') then raise exception 'Capital Received requires a capital/equity contribution account.'; end if;
   v_debit_account_id:=p_cash_bank_account_id; v_credit_account_id:=p_counter_account_id; v_description:='Capital Introduced';
  when 'drawings_payment' then
   if v_counter.type<>'equity' or not (coalesce(v_counter.detail_type,'') in ('Owner Drawings','Drawings') or lower(v_counter.name) like '%drawings%') then raise exception 'Owner Drawings requires a dedicated drawings equity account.'; end if;
   v_debit_account_id:=p_counter_account_id; v_credit_account_id:=p_cash_bank_account_id; v_description:='Owner Drawings';
  when 'other_receipt' then
   if exists(select 1 from public.account_mappings am where am.user_id=v_user_id and am.company_id=v_company and am.account_id=v_counter.id and am.mapping_key in ('accounts_receivable','accounts_payable','inventory','input_vat','output_vat','cogs','cash','bank')) or coalesce(v_counter.detail_type,'') in ('Accounts Receivable','Accounts Payable','Inventory','Input VAT','Output VAT','COGS','Cash on Hand','Bank Account','Retained Earnings') then raise exception 'Other Receipt cannot bypass controlled AR/AP/Inventory/VAT/COGS/Cash/Bank accounts.'; end if;
   v_debit_account_id:=p_cash_bank_account_id; v_credit_account_id:=p_counter_account_id; v_description:='Other Receipt';
  when 'other_payment' then
   if exists(select 1 from public.account_mappings am where am.user_id=v_user_id and am.company_id=v_company and am.account_id=v_counter.id and am.mapping_key in ('accounts_receivable','accounts_payable','inventory','input_vat','output_vat','cogs','cash','bank')) or coalesce(v_counter.detail_type,'') in ('Accounts Receivable','Accounts Payable','Inventory','Input VAT','Output VAT','COGS','Cash on Hand','Bank Account','Retained Earnings') then raise exception 'Other Payment cannot bypass controlled AR/AP/Inventory/VAT/COGS/Cash/Bank accounts.'; end if;
   v_debit_account_id:=p_counter_account_id; v_credit_account_id:=p_cash_bank_account_id; v_description:='Other Payment';
 end case;
 v_debit_account_text:=case when v_debit_account_id=v_counter.id then v_counter.code||' - '||v_counter.name else v_cash_bank.code||' - '||v_cash_bank.name end;
 v_credit_account_text:=case when v_credit_account_id=v_counter.id then v_counter.code||' - '||v_counter.name else v_cash_bank.code||' - '||v_cash_bank.name end;
 v_entry_no:='GCB-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 insert into public.journal_entries(user_id,company_id,business_unit_id,entry_no,entry_date,description,status,payment_mode,party_name,trans_type,source_module,source_document_type)
 values(v_user_id,v_company,v_bu,v_entry_no,p_transaction_date,concat_ws(' - ',v_description,nullif(trim(coalesce(p_party_name,'')),''),nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),'')),'draft',case when v_cash_bank.detail_type='Bank Account' then 'Bank' else 'Cash' end,nullif(trim(coalesce(p_party_name,'')),''),'General Cash/Bank','accounting','general_cash_bank') returning id into v_entry_id;
 insert into public.journal_lines(user_id,company_id,business_unit_id,entry_id,account_id,account,debit,credit) values
 (v_user_id,v_company,v_bu,v_entry_id,v_debit_account_id,v_debit_account_text,round(p_amount,2),0),
 (v_user_id,v_company,v_bu,v_entry_id,v_credit_account_id,v_credit_account_text,0,round(p_amount,2));
 perform public.post_journal_entry(v_entry_id);
 return jsonb_build_object('success',true,'journal_entry_id',v_entry_id,'entry_no',v_entry_no,'transaction_type',p_transaction_type,'amount',round(p_amount,2));
end;
$function$;
