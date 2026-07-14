// deno-lint-ignore-file
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: who } = await userClient.auth.getUser();
    if (!who.user) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", who.user.id);
    const callerRoles = (roles || []).map((r: any) => r.role);
    const callerIsAdmin = callerRoles.includes("admin");
    const canManage = callerIsAdmin || callerRoles.includes("rh");
    if (!canManage) return json({ error: "Apenas administradores/RH" }, 403);

    const { user_id, new_email } = await req.json();
    const email = String(new_email || "").trim().toLowerCase();
    if (!user_id || !email || !email.includes("@")) {
      return json({ error: "Dados inválidos (e-mail obrigatório)" }, 400);
    }
    if (!callerIsAdmin) {
      const { data: targetRoles } = await admin
        .from("user_roles").select("role").eq("user_id", user_id);
      if ((targetRoles || []).some((r: any) => r.role === "admin")) {
        return json({ error: "RH não pode alterar e-mail de contas de administrador" }, 403);
      }
    }

    // Atualiza o e-mail no auth (já confirmado, sem exigir confirmação por link)
    const { error: updErr } = await admin.auth.admin.updateUserById(user_id, {
      email,
      email_confirm: true,
    });
    if (updErr) throw updErr;

    // Sincroniza no profile
    const { error: profErr } = await admin.from("profiles").update({ email }).eq("id", user_id);
    if (profErr) throw profErr;

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }
});
