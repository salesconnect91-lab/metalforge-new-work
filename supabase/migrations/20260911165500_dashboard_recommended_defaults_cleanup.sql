update public.dashboard_widget_preferences
set hidden_widgets = array['financial_position','quick_links']::text[], updated_at = now()
where coalesce(cardinality(hidden_widgets),0)=0;

drop function if exists public.get_dashboard_summary();
drop table if exists public.dashboard_preferences;
