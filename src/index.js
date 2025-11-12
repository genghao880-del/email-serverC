// mailbrain-worker/src/index.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    // 从环境变量读取（Worker Settings -> Variables）
    const CACHE_URL = env.CACHE_BASE || "https://cache.111671.xyz";
    const CACHE_KEY = env.CACHE_KEY || "cf-mailbrain-111671";
    const now = () => new Date().toISOString();

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          "content-type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });

    if (path === "/health") {
      return json({ ok: true, ts: now(), worker: true });
    }

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    async function cacheFetch(endpoint, payload) {
      try {
        const res = await fetch(`${CACHE_URL}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cache-key": CACHE_KEY,
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) return await res.json();
      } catch (_) {}
      return null;
    }

    if (path === "/api/create-token" && method === "POST") {
      const id = crypto.randomUUID();
      const body = await request.json().catch(() => ({}));
      const max_uses = body.max_uses || 5;
      const created_by = body.created_by || "root";
      await env.DB.prepare(
        "INSERT INTO tokens (id, max_uses, used, created_by, status, created_at) VALUES (?,?,?,?,?,?)"
      )
        .bind(id, max_uses, 0, created_by, "active", now())
        .run();
      return json({ token: id, max_uses });
    }

    if (path === "/api/check_user" && method === "POST") {
      const { local_part } = await request.json().catch(() => ({}));
      if (!local_part) return json({ error: "missing local_part" }, 400);
      const email = `${local_part}@${env.DOMAIN}`;

      const cacheHit = await cacheFetch("/get", { key: email });
      if (cacheHit && cacheHit.exists) return json(cacheHit);

      const row = await env.DB.prepare(
        "SELECT id,status FROM users WHERE email=?"
      )
        .bind(email)
        .first();
      const exists = !!row;
      const status = row ? row.status : null;

      await cacheFetch("/set", { key: email, value: { exists, status }, ttl: 3600 });

      return json({ exists, status });
    }

    if (path === "/api/register" && method === "POST") {
      const ip = request.headers.get("cf-connecting-ip") || "";
      const { token, local_part, password } = await request.json().catch(() => ({}));
      if (!token || !local_part || !password)
        return json({ error: "missing fields" }, 400);

      if (!/^[a-z0-9._-]{2,32}$/.test(local_part))
        return json({ error: "invalid local_part" }, 400);

      const tokenRow = await env.DB.prepare(
        "SELECT used, max_uses, status FROM tokens WHERE id=?"
      )
        .bind(token)
        .first();
      if (!tokenRow) return json({ error: "invalid token" }, 403);
      if (tokenRow.status !== "active") return json({ error: "token disabled" }, 403);
      if (tokenRow.used >= tokenRow.max_uses) return json({ error: "token exhausted" }, 403);

      const email = `${local_part}@${env.DOMAIN}`;
      const uRow = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
      if (uRow) return json({ error: "user exists" }, 409);

      const uid = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO users (id, email, local_part, domain, token_id, status, r2_prefix, created_at) VALUES (?,?,?,?,?,?,?,?)"
      )
        .bind(uid, email, local_part, env.DOMAIN, token, "active", `${local_part}/`, now())
        .run();

      await env.DB.prepare("UPDATE tokens SET used=used+1, last_use=? WHERE id=?")
        .bind(now(), token)
        .run();

      await cacheFetch("/set", { key: email, value: { exists: true, status: "active" }, ttl: 86400 });

      return json({ ok: true, email });
    }

    return json({ error: "Not found" }, 404);
  },
};
