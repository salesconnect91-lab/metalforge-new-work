create or replace view public.employee_salary_ledger
with (security_invoker = true) as
select p.company_id,p.business_unit_id,p.employee_id,e.employee_code,e.name as employee_name,e.designation,e.department,p.salary_month,p.payment_date as entry_date,p.voucher_no as document_no,'Payment'::text as entry_type,0::numeric as debit,p.amount as credit,p.journal_entry_id
from public.employee_salary_payments p
join public.employees e on e.id=p.employee_id
where p.company_id=public.current_company_id() and p.business_unit_id=public.current_business_unit_id()
union all
select a.company_id,a.business_unit_id,a.employee_id,e.employee_code,e.name as employee_name,e.designation,e.department,a.salary_month,(a.salary_month+interval '1 month - 1 day')::date as entry_date,a.voucher_no as document_no,'Accrual'::text as entry_type,a.monthly_salary as debit,0::numeric as credit,a.journal_entry_id
from public.employee_salary_accruals a
join public.employees e on e.id=a.employee_id
where a.company_id=public.current_company_id() and a.business_unit_id=public.current_business_unit_id();
grant select on public.employee_salary_ledger to authenticated;
