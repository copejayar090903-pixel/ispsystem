@echo off
:: ISP System - Start background worker
:: This starts the MikroTik sync worker that automatically disconnects
:: overdue customers every 5 minutes without needing the website open.

cd /d "d:\isp-system"
echo [%date% %time%] Starting ISP background worker...
npx tsx src/worker/start.ts
