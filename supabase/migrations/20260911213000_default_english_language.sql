alter table public.company_settings
  alter column print_language set default 'english',
  alter column screen_language_mode set default 'single',
  alter column screen_primary_language set default 'en',
  alter column screen_secondary_language drop default,
  alter column document_language_mode set default 'single',
  alter column document_primary_language set default 'en',
  alter column document_secondary_language drop default;

alter table public.user_language_preferences
  alter column screen_language_mode set default 'single',
  alter column primary_language set default 'en',
  alter column secondary_language drop default;
