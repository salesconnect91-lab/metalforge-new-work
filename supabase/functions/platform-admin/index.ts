// Production platform-admin Edge Function is deployed from Supabase.
// Version 6 adds business_unit_id support to create_user so Platform Owner can create a dedicated login for one business workspace.
// The live function validates the business unit belongs to the selected company, creates company membership + business-unit membership,
// stores last_business_unit_id, and the database trigger locks normal workspace users to that business.
// Existing company lifecycle/reset/delete actions remain available in the deployed function.
// Keep this repository marker aligned with the live Supabase function when changing owner provisioning.