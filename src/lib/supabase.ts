import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error("Missing Supabase environment variables.");
}

const rawSupabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * These tables are company-owned configuration, not user-owned data.
 *
 * A few older screens still contain legacy `.eq("user_id", user.id)` filters.
 * RLS already scopes these tables through current_company_id(), so keeping the
 * old user filter can incorrectly hide the selected company's shared settings
 * from another authorized user in the same company.
 *
 * This compatibility bridge ignores only that obsolete user_id filter on the
 * listed company-scoped settings tables. All other filters and all database RLS
 * policies remain active. It lets older modules behave correctly while they are
 * progressively migrated to explicit company-context queries.
 */
const COMPANY_SCOPED_SETTINGS_TABLES = new Set([
  "company_settings",
  "company_profile",
  "document_print_visibility",
  "tax_rates",
  "charge_rate_settings",
]);

function wrapCompanyScopedBuilder<T extends object>(builder: T): T {
  return new Proxy(builder, {
    get(target, property, receiver) {
      const member = Reflect.get(target, property, receiver);

      if (property === "then" && typeof member === "function") {
        return member.bind(target);
      }

      if (property === "eq" && typeof member === "function") {
        return (column: string, value: unknown) => {
          if (column === "user_id") {
            return receiver;
          }

          const next = member.call(target, column, value);
          return next && typeof next === "object"
            ? wrapCompanyScopedBuilder(next)
            : next;
        };
      }

      if (typeof member === "function") {
        return (...args: unknown[]) => {
          const next = member.apply(target, args);

          if (
            next &&
            typeof next === "object" &&
            typeof (next as { then?: unknown }).then !== "function"
          ) {
            return wrapCompanyScopedBuilder(next);
          }

          return next;
        };
      }

      return member;
    },
  });
}

export const supabase = new Proxy(rawSupabase, {
  get(target, property, receiver) {
    if (property !== "from") {
      const member = Reflect.get(target, property, receiver);
      return typeof member === "function" ? member.bind(target) : member;
    }

    return (table: string) => {
      const builder = rawSupabase.from(table);
      return COMPANY_SCOPED_SETTINGS_TABLES.has(table)
        ? wrapCompanyScopedBuilder(builder)
        : builder;
    };
  },
}) as typeof rawSupabase;
