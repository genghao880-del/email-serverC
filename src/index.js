// src/index_v2.js

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const now = () => new Date().toISOString();

    // 缓存调用封装
    const cache = {
      async get(key) {
        try {
          const r = await fetch(`${env.CACHE_API_URL}/get/${encodeURIComponent(key)}`, {
            headers: { "x-cache-key": env.CACHE_KEY },
          });
          const j = await r.json();
          return j.ok ? j.value : null;
        } catch {
          return null;
        }
      },
      async set(key, value, ttl = 300) {
        try {
          await fetch(`${env.CACHE_API_URL}/set`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-cache-key": env.CACHE_KEY,
            },
            body: JSON.stringify({ key, value, ttl }),
          });
        } catch (_) {}
      },
    };

    // ---------- 1️⃣ 健康检查 ----------
    if (path === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: now() }), {
        headers: { "content-type": "application/json" },
      });
    }

    // ---------- 2️⃣ 创建 Token ----------
    if (path === "/api/create-token" && method === "POST") {
      const id = crypto.randomUUID();
      const body = await request.json().catch(() => ({}));
      const max_uses = body.max_uses || 5;
      const created_by = body.created_by || "root";
      await env.DB.prepare(
        "INSERT INTO tokens (id, max_uses, used, created_by, status, created_at) VALUES (?,?,?,?,?,?)"
      ).bind(id, max_uses, 0, created_by, "active", now()).run();
      await cache.set(`token:${id}`, { used: 0, max_uses, status: "active" });
      return Response.json({ token: id, max_uses });
    }

    // ---------- 3️⃣ 检查邮箱 ----------
    if (path === "/api/check_user" && method === "POST") {
      const { local_part } = await request.json().catch(() => ({}));
      if (!local_part) return new Response("missing local_part", { status: 400 });

      const email = `${local_part}@${env.DOMAIN}`;
      let user = await cache.get(`user:${email}`);

      if (!user) {
        const row = await env.DB.prepare("SELECT id,status FROM users WHERE email=?")
          .bind(email)
          .first();
        user = row;
        if (row) await cache.set(`user:${email}`, row);
      }

      return Response.json({ exists: !!user, status: user ? user.status : null });
    }

    // ---------- 4️⃣ 注册邮箱 ----------
    if (path === "/api/register" && method === "POST") {
      const ip = request.headers.get("cf-connecting-ip") || "";
      const { token, local_part, password } = await request.json().catch(() => ({}));
      if (!token || !local_part || !password)
        return new Response("missing fields", { status: 400 });

      if (!/^[a-z0-9._-]{2,32}$/.test(local_part))
        return new Response("invalid local_part", { status: 400 });

      // 优先读缓存
      let tokenRow = await cache.get(`token:${token}`);
      if (!tokenRow) {
        tokenRow = await env.DB.prepare(
          "SELECT used, max_uses, status FROM tokens WHERE id=?"
        )
          .bind(token)
          .first();
        if (tokenRow) await cache.set(`token:${token}`, tokenRow);
      }

      if (!tokenRow) return new Response("invalid token", { status: 403 });
      if (tokenRow.status !== "active") return new Response("token disabled", { status: 403 });
      if (tokenRow.used >= tokenRow.max_uses)
        return new Response("token exhausted", { status: 403 });

      const email = `${local_part}@${env.DOMAIN}`;

      const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?")
        .bind(email)
        .first();
      if (existing) return new Response("user exists", { status: 409 });

      const uid = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO users (id, email, local_part, domain, token_id, status, r2_prefix, created_at) VALUES (?,?,?,?,?,?,?,?)"
      )
        .bind(uid, email, local_part, env.DOMAIN, token, "active", `${local_part}/`, now())
        .run();

      await env.DB.prepare("UPDATE tokens SET used=used+1, last_use=? WHERE id=?")
        .bind(now(), token)
        .run();

      await env.DB.prepare(
        "INSERT INTO audit (id, actor, action, target, result, ip, ts) VALUES (?,?,?,?,?,?,?)"
      )
        .bind(crypto.randomUUID(), email, "register", uid, "ok", ip, now())
        .run();

      // 写缓存
      await cache.set(`user:${email}`, { status: "active", id: uid });
      tokenRow.used++;
      await cache.set(`token:${token}`, tokenRow);

      return Response.json({ ok: true, email });
    }

    // ---------- 默认 ----------
    return new Response("Not found", { status: 404 });
  },
};
