部署步骤：
1. 登录 Cloudflare 控制台 → Workers & Pages → 创建 Worker。
2. 上传本 zip 包（mailbrain-worker.zip）。
3. 部署后进入 D1 控制台 → 创建数据库 MAILDB → 导入 schema.sql。
4. 在 R2 控制台创建存储桶 mail-r2-bucket。
5. 在 Worker 设置：
   环境变量：
     DOMAIN=111671.xyz
   绑定：
     D1 数据库: MAILDB
     R2 存储桶: mail-r2-bucket
6. 部署运行后访问：
   https://<你的worker子域>.workers.dev/health
   应返回 {"ok":true,"ts":"..."}
