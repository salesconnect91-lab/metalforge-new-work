alter table public.consolidated_sales_invoices alter column invoice_type set default 'Sale Invoice';

update public.consolidated_sales_invoices
   set invoice_type = 'Sale Invoice'
 where invoice_type = 'Cash Bill'
   and status = 'draft';
