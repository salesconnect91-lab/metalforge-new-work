alter table public.company_settings
  add constraint company_settings_screen_language_supported
  check (
    coalesce(screen_primary_language,'en') in ('en','ur','ar')
    and (screen_secondary_language is null or screen_secondary_language in ('en','ur','ar'))
    and (screen_secondary_language is null or screen_secondary_language <> screen_primary_language)
  );

alter table public.company_settings
  add constraint company_settings_document_language_supported
  check (
    coalesce(document_primary_language,'en') in ('en','ur','ar')
    and (document_secondary_language is null or document_secondary_language in ('en','ur','ar'))
    and (document_secondary_language is null or document_secondary_language <> document_primary_language)
  );

alter table public.user_language_preferences
  add constraint user_language_preferences_supported
  check (
    coalesce(primary_language,'en') in ('en','ur','ar')
    and (secondary_language is null or secondary_language in ('en','ur','ar'))
    and (secondary_language is null or secondary_language <> primary_language)
  );
