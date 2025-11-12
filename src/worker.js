export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const now = () => new Date().toISOString();

    // Health check
    if (path === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: now() }), {
        headers: { "content-type": "application/json" },
      });
    }

    // Create token (demo, no auth)
    if (path === "/api/create-token" && request.method === "POST") {
      const id = crypto.randomUUID();
      const body = await request.json().catch(() => ({}));
      const max_uses = body.max_uses || 5;
      await env.DB.prepare(
        "INSERT INTO tokens (id, max_uses, used, created_by, active, created_at) VALUES (?,?,?,?,?,?)"
      )
        .bind(id, max_uses, 0, "root", 1, now())
        .run();
      return new Response(JSON.stringify({ token: id, max_uses }), {
        headers: { "content-type": "application/json" },
      });
    }

    // Check user
    if (path === "/api/check_user" && request.method === "POST") {
      const { local_part } = await request.json().catch(() => ({}));
      if (!local_part)
        return new Response("missing", { status: 400 });
      const email = `${local_part}@${env.DOMAIN}`;
      const row = await env.DB.prepare(
        "SELECT id,status FROM users WHERE email=?"
      )
        .bind(email)
        .first();
      return new Response(
        JSON.stringify({ exists: !!row, status: row?.status || null }),
        { headers: { "content-type": "application/json" } }
      );
    }

    // Default
    return new Response("Not found", { status: 404 });
  },
};
