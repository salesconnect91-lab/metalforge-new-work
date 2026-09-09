import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...HEADERS, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: HEADERS });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(token);
  if (!userData.user) return json({ error: "Invalid session" }, 401);

  const actor = userData.user;
  const { data: profile } = await admin
    .from("user_profiles")
    .select("is_active,platform_role")
    .eq("id", actor.id)
    .single();

  if (!profile?.is_active || profile.platform_role !== "super_admin") {
    return json({ error: "Super Admin access required" }, 403);
  }

  const body = await request.json();
  const action = String(body.action || "");

  try {
    if (action === "create_user") {
      const email = String(body.email || "").trim().toLowerCase();
      const companyId = String(body.company_id || "");
      const businessUnitId = body.business_unit_id ? String(body.business_unit_id) : null;
      const role = String(body.role || "viewer");
      const password = String(body.password || "");
      const fullName = String(body.full_name || "").trim();

      if (!email || !companyId) return json({ error: "Email and company are required" }, 400);
      if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

      if (businessUnitId) {
        const { data: businessUnit } = await admin
          .from("business_units")
          .select("id")
          .eq("id", businessUnitId)
          .eq("company_id", companyId)
          .eq("is_active", true)
          .maybeSingle();
        if (!businessUnit) return json({ error: "Invalid business workspace" }, 400);
      }

      const [{ data: company }, { count }] = await Promise.all([
        admin.from("companies").select("max_users").eq("id", companyId).single(),
        admin
          .from("company_memberships")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("is_active", true),
      ]);

      if (company && (count || 0) >= company.max_users) {
        return json({ error: "Company user limit reached" }, 409);
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError || !created.user) {
        return json({ error: createError?.message || "Could not create auth user" }, 400);
      }

      const userId = created.user.id;
      try {
        const profileRole = role === "company_owner"
          ? "admin"
          : role === "accounts"
          ? "accountant"
          : role === "store"
          ? "warehouse"
          : role === "production"
          ? "admin"
          : role;

        let result = await admin.from("user_profiles").upsert({
          id: userId,
          role: profileRole,
          is_active: true,
          full_name: fullName || null,
          email,
          platform_role: "user",
          last_company_id: companyId,
          last_business_unit_id: businessUnitId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
        if (result.error) throw new Error(`Profile: ${result.error.message}`);

        result = await admin.from("company_memberships").upsert({
          company_id: companyId,
          user_id: userId,
          role,
          is_active: true,
          permissions: body.permissions || {},
          invited_by: actor.id,
        }, { onConflict: "company_id,user_id" });
        if (result.error) throw new Error(`Company access: ${result.error.message}`);

        if (businessUnitId) {
          result = await admin.from("business_unit_memberships").upsert({
            company_id: companyId,
            business_unit_id: businessUnitId,
            user_id: userId,
            role,
            is_active: true,
          }, { onConflict: "business_unit_id,user_id" });
          if (result.error) throw new Error(`Business access: ${result.error.message}`);
        }

        return json({ user: { id: userId, email, company_id: companyId, business_unit_id: businessUnitId } });
      } catch (error) {
        await admin.auth.admin.deleteUser(userId);
        return json({ error: error instanceof Error ? error.message : "User setup failed" }, 500);
      }
    }

    if (action === "create_company") {
      const name = String(body.name || "").trim();
      const code = String(body.code || "").trim().toUpperCase();
      if (!name || !code) return json({ error: "Company name and code are required" }, 400);

      const { data: existing } = await admin
        .from("companies")
        .select("id,name,code")
        .eq("code", code)
        .maybeSingle();
      if (existing) return json({ error: `Company code ${code} already exists.` }, 409);

      const { data, error } = await admin.from("companies").insert({
        name,
        code,
        status: "active",
        max_users: Math.max(1, Number(body.max_users || 10)),
        contact_email: body.contact_email || null,
        contact_phone: body.contact_phone || null,
        address: body.address || null,
        notes: body.notes || null,
        subscription_expires_at: body.subscription_expires_at || null,
        created_by: actor.id,
      }).select("*").single();
      if (error) throw error;
      return json({ company: data });
    }

    if (action === "update_membership") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.role !== undefined) patch.role = String(body.role);
      if (body.is_active !== undefined) patch.is_active = !!body.is_active;
      const { data, error } = await admin
        .from("company_memberships")
        .update(patch)
        .eq("id", String(body.membership_id))
        .select("*")
        .single();
      if (error) throw error;
      return json({ membership: data });
    }

    if (action === "set_company_status") {
      const { data, error } = await admin
        .from("companies")
        .update({ status: String(body.status), updated_at: new Date().toISOString() })
        .eq("id", String(body.company_id))
        .select("*")
        .single();
      if (error) throw error;
      return json({ company: data });
    }

    if (action === "set_user_access") {
      const { error } = await admin
        .from("company_memberships")
        .update({ is_active: !!body.is_active, updated_at: new Date().toISOString() })
        .eq("company_id", String(body.company_id))
        .eq("user_id", String(body.user_id));
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "set_user_role") {
      const { error } = await admin
        .from("company_memberships")
        .update({
          role: String(body.role),
          permissions: body.permissions || {},
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", String(body.company_id))
        .eq("user_id", String(body.user_id));
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "delete_company") {
      const companyId = String(body.company_id);
      const { data: company } = await admin.from("companies").select("code").eq("id", companyId).single();
      if (!company) return json({ error: "Company not found" }, 404);
      if (String(body.confirmation) !== `DELETE ${company.code}` || body.acknowledge !== true) {
        return json({ error: `Type DELETE ${company.code} exactly and acknowledge` }, 400);
      }
      const { data, error } = await admin.rpc("platform_delete_company", {
        p_company_id: companyId,
        p_actor_id: actor.id,
      });
      if (error) throw error;
      return json(data);
    }

    if (action === "reset_company_preview") {
      const { data, error } = await admin.rpc("platform_preview_company_transaction_reset", {
        p_company_id: String(body.company_id),
      });
      if (error) throw error;
      return json(data);
    }

    if (action === "reset_company_transactions") {
      const companyId = String(body.company_id);
      const { data: company } = await admin.from("companies").select("code").eq("id", companyId).single();
      if (!company) return json({ error: "Company not found" }, 404);
      if (String(body.confirmation) !== `RESET ${company.code}` || body.acknowledge !== true) {
        return json({ error: `Type RESET ${company.code} exactly and acknowledge` }, 400);
      }
      const { data, error } = await admin.rpc("platform_reset_company_transactions", {
        p_company_id: companyId,
        p_actor_id: actor.id,
      });
      if (error) throw error;
      return json(data);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("platform-admin", action, error);
    return json({ error: error instanceof Error ? error.message : "Request failed" }, 500);
  }
});
