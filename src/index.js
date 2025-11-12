// mailbrain-worker/src/index.js

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const now = () => new Date().toISOString();

    // ---------- 1️⃣ 健康检查 ----------
    if (path === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: now() }), {
        headers: { "content-type": "application/json" },
      });
    }

    // ---------- 2️⃣ 创建 Token ----------
    if (path === "/api/create-token" && method === "POST") {
      // 此接口仅管理员能用，可结合 Cloudflare Access 限制访问
      const id = crypto.randomUUID();
      const body = await request.json().catch(() => ({}));
      const max_uses = body.max_uses || 5;
      const created_by = body.created_by || "root";
      await env.DB.prepare(
        "INSERT INTO tokens (id, max_uses, used, created_by, active, created_at) VALUES (?,?,?,?,?,?)"
      )
        .bind(id, max_uses, 0, created_by, 1, now())
        .run();
      return new Response(JSON.stringify({ token: id, max_uses }), {
        headers: { "content-type": "application/json" },
      });
    }

    // ---------- 3️⃣ 检查邮箱 ----------
    if (path === "/api/check_user" && method === "POST") {
      const { local_part } = await request.json().catch(() => ({}));
      if (!local_part)
        return new Response("missing local_part", { status: 400 });
      const email = `${local_part}@${env.DOMAIN}`;
      const row = await env.DB.prepare(
        "SELECT id,status FROM users WHERE email=?"
      )
        .bind(email)
        .first();
      return new Response(
        JSON.stringify({ exists: !!row, status: row ? row.status : null }),
        { headers: { "content-type": "application/json" } }
      );
    }

    // ---------- 4️⃣ 注册邮箱 ----------
    if (path === "/api/register" && method === "POST") {
      const ip = request.headers.get("cf-connecting-ip") || "";
      const { token, local_part, password } = await request.json().catch(() => ({}));
      if (!token || !local_part || !password)
        return new Response("missing fields", { status: 400 });

      if (!/^[a-z0-9._-]{2,32}$/.test(local_part))
        return new Response("invalid local_part", { status: 400 });

      const tokenRow = await env.DB.prepare(
        "SELECT used, max_uses, active FROM tokens WHERE id=?"
      )
        .bind(token)
        .first();
      if (!tokenRow)
        return new Response("invalid token", { status: 403 });
      if (tokenRow.active !== 1)
        return new Response("token disabled", { status: 403 });
      if (tokenRow.used >= tokenRow.max_uses)
        return new Response("token exhausted", { status: 403 });

      const email = `${local_part}@${env.DOMAIN}`;
      const uRow = await env.DB.prepare("SELECT id FROM users WHERE email=?")
        .bind(email)
        .first();
      if (uRow)
        return new Response("user exists", { status: 409 });

      // 写入用户
      const uid = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO users (id, email, local_part, domain, token_id, status, r2_prefix, created_at) VALUES (?,?,?,?,?,?,?,?)"
      )
        .bind(uid, email, local_part, env.DOMAIN, token, "active", `${local_part}/`, now())
        .run();

      // 更新 token 使用次数
      await env.DB.prepare("UPDATE tokens SET used=used+1, last_use=? WHERE id=?")
        .bind(now(), token)
        .run();

      // 写日志
      await env.DB.prepare(
        "INSERT INTO audit (id, actor, action, target, result, ip, ts) VALUES (?,?,?,?,?,?,?)"
      )
        .bind(crypto.randomUUID(), email, "register", uid, "ok", ip, now())
        .run();

      return new Response(JSON.stringify({ ok: true, email }), {
        headers: { "content-type": "application/json" },
      });
    }

    // ---------- 默认 ----------
    return new Response("Not found", { status: 404 });
  },
};
