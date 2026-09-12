revoke all on function public.recalculate_invoice_status_after_return_note() from public,anon,authenticated;
revoke all on function public.recalculate_purchase_order_payment_status() from public,anon,authenticated;
revoke all on function public.validate_purchase_payment_allocation() from public,anon,authenticated;
revoke all on function public.record_loan_party_transaction(uuid,uuid,date,text,numeric,text,text) from public,anon,authenticated;
