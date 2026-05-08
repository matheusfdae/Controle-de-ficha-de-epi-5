import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data, error } = await admin.auth.admin.updateUserById(
    "f59741b1-49b9-4d7d-9377-dfc27bac95e5",
    { password: "Sugado75" }
  );
  return new Response(JSON.stringify({ ok: !error, error: error?.message, id: data?.user?.id }), {
    headers: { "content-type": "application/json" },
  });
});
