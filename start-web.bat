@echo off
:: ISP System - Start Next.js web app (production)
:: Requires: npm run build to be done first

cd /d "d:\isp-system"
echo [%date% %time%] Starting ISP web server...
npx next start
