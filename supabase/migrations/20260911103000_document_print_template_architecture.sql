alter table public.document_print_visibility
  add column if not exists template_key text not null default 'standard';

alter table public.document_print_visibility
  add column if not exists show_qr_code boolean not null default true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'document_print_visibility_template_key_check'
      and conrelid = 'public.document_print_visibility'::regclass
  ) then
    alter table public.document_print_visibility
      add constraint document_print_visibility_template_key_check
      check (template_key in ('standard','compact','executive','letterhead'));
  end if;
end $$;

comment on column public.document_print_visibility.template_key is
  'Selectable visual print template; business data and posting logic are unaffected.';

comment on column public.document_print_visibility.show_qr_code is
  'Controls QR visibility for document templates that support QR output.';
