// PM2 Ecosystem Configuration for ISP Billing System
// Run: pm2 start ecosystem.config.js
// Auto-start on boot: pm2 startup  (then run the command it prints)
// Save process list: pm2 save

module.exports = {
  apps: [
    // ─── Next.js Web App ─────────────────────────────────────────────────────
    {
      name: "isp-web",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "d:/isp-system",
      interpreter: "none",
      env_file: "d:/isp-system/.env",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "logs/web-error.log",
      out_file: "logs/web-out.log",
    },

    // ─── Background Sync Worker (MikroTik ↔ Supabase every 5 min) ──────────
    // This runs 24/7 and does NOT require the website to be open.
    // It automatically: syncs customer status, expires overdue accounts,
    // disconnects PPPoE sessions, and updates Supabase — all via BullMQ + Redis.
    {
      name: "isp-worker",
      script: "node_modules/.bin/tsx",
      args: "src/worker/start.ts",
      cwd: "d:/isp-system",
      interpreter: "none",
      env_file: "d:/isp-system/.env",
      watch: false,
      autorestart: true,
      max_restarts: 20,
      min_uptime: "5s",
      restart_delay: 5000,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "logs/worker-error.log",
      out_file: "logs/worker-out.log",
    },
  ],
};
