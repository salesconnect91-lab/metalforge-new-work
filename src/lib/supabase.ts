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
 * Company-owned records must follow the selected company, not the currently
 * logged-in user. Older screens still contain legacy user_id filters and
 * user-based upsert conflict targets, so this compatibility layer translates
 * only those obsolete operations while database RLS continues to enforce
 * current_company_id() and permissions.
 */
const COMPANY_SCOPED_TABLES = new Set([
  "company_settings",
  "company_profile",
  "document_print_visibility",
  "tax_rates",
  "charge_rate_settings",
  "account_mappings",
]);

function companyConflictTarget(table: string, value: unknown) {
  if (!value || typeof value !== "object") return value;

  const options = { ...(value as Record<string, unknown>) };
  const onConflict = options.onConflict;

  if (table === "company_settings" || table === "company_profile") {
    if (onConflict === "user_id") options.onConflict = "company_id";
  }

  if (table === "document_print_visibility") {
    if (onConflict === "user_id,document_type") {
      options.onConflict = "company_id,document_type";
    }
  }

  if (table === "account_mappings") {
    if (onConflict === "user_id,mapping_key") {
      options.onConflict = "company_id,mapping_key";
    }
  }

  return options;
}

function wrapCompanyScopedBuilder<T extends object>(builder: T, table: string): T {
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
            ? wrapCompanyScopedBuilder(next, table)
            : next;
        };
      }

      if (property === "upsert" && typeof member === "function") {
        return (values: unknown, options?: unknown) => {
          const next = member.call(
            target,
            values,
            companyConflictTarget(table, options)
          );

          return next && typeof next === "object"
            ? wrapCompanyScopedBuilder(next, table)
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
            return wrapCompanyScopedBuilder(next, table);
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
      return COMPANY_SCOPED_TABLES.has(table)
        ? wrapCompanyScopedBuilder(builder, table)
        : builder;
    };
  },
}) as typeof rawSupabase;
