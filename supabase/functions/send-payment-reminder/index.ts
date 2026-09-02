import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: { "content-type": "application/json" } });
    const { recipient, subject, message } = await req.json();
    if (!recipient || !subject || !message) return new Response(JSON.stringify({ error: "recipient, subject and message are required" }), { status: 400, headers: { "content-type": "application/json" } });
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM_EMAIL");
    if (!apiKey || !from) return new Response(JSON.stringify({ error: "Email provider is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL." }), { status: 503, headers: { "content-type": "application/json" } });
    const html = `<div style="font-family:Arial,sans-serif;line-height:1.6"><p>${String(message).replace(/\n/g,"<br/>")}</p><hr/><p style="color:#64748b;font-size:12px">MetalForge OS — Automated payment reminder / خودکار ادائیگی یاد دہانی</p></div>`;
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [recipient], subject, html }) });
    const data = await response.json();
    if (!response.ok) return new Response(JSON.stringify({ error: data?.message || "Email provider rejected the message" }), { status: 502, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ success: true, id: data?.id || null }), { headers: { "content-type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
