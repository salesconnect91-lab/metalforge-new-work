revoke all on function public.create_customer_with_ar(text,text,text,text) from public;
revoke all on function public.create_customer_with_ar(text,text,text,text) from anon;
grant execute on function public.create_customer_with_ar(text,text,text,text) to authenticated;
