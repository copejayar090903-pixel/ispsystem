# setup-autostart.ps1
# Run this ONCE as Administrator to register the ISP system as Windows startup tasks.
# After running, the worker + web server will start automatically at system boot.
#
# Usage (run in PowerShell as Admin):
#   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
#   .\setup-autostart.ps1

$WorkerTaskName = "ISP-System-Worker"
$WebTaskName    = "ISP-System-Web"
$ProjectDir     = "d:\isp-system"
$NodeExe        = (Get-Command node -ErrorAction SilentlyContinue).Source
$NpxExe         = (Get-Command npx  -ErrorAction SilentlyContinue).Source

if (-not $NodeExe) {
    Write-Error "Node.js not found in PATH. Please install Node.js first."
    exit 1
}

Write-Host "Node.js found at: $NodeExe"
Write-Host "Setting up Windows Task Scheduler tasks..."

# ─── Remove old tasks if they exist ──────────────────────────────────────────
foreach ($name in @($WorkerTaskName, $WebTaskName)) {
    if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $name -Confirm:$false
        Write-Host "Removed existing task: $name"
    }
}

# ─── ISP Worker Task ─────────────────────────────────────────────────────────
# Runs tsx src/worker/start.ts at startup, hidden, as current user
$workerAction  = New-ScheduledTaskAction `
    -Execute    $NpxExe `
    -Argument   "tsx src/worker/start.ts" `
    -WorkingDirectory $ProjectDir

$trigger   = New-ScheduledTaskTrigger -AtStartup
$settings  = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 10 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName   $WorkerTaskName `
    -Action     $workerAction `
    -Trigger    $trigger `
    -Settings   $settings `
    -Description "ISP Billing System - MikroTik background sync worker. Checks overdue customers and disconnects them every 5 minutes." `
    -Force `
    | Out-Null

Write-Host "[OK] Registered task: $WorkerTaskName"

# ─── ISP Web Task ─────────────────────────────────────────────────────────────
$webAction = New-ScheduledTaskAction `
    -Execute    $NpxExe `
    -Argument   "next start" `
    -WorkingDirectory $ProjectDir

Register-ScheduledTask `
    -TaskName   $WebTaskName `
    -Action     $webAction `
    -Trigger    $trigger `
    -Settings   $settings `
    -Description "ISP Billing System - Next.js web application server." `
    -Force `
    | Out-Null

Write-Host "[OK] Registered task: $WebTaskName"

# ─── Start tasks now without waiting for reboot ──────────────────────────────
Write-Host ""
Write-Host "Starting tasks now..."
Start-ScheduledTask -TaskName $WorkerTaskName
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName $WebTaskName

Write-Host ""
Write-Host "==========================================================="
Write-Host " SUCCESS! Both services are now running and will auto-start"
Write-Host " on every system reboot."
Write-Host ""
Write-Host " Tasks registered:"
Write-Host "   - $WorkerTaskName  (sync worker, every 5 min)"
Write-Host "   - $WebTaskName     (web server on port 3000)"
Write-Host ""
Write-Host " To check status:   Get-ScheduledTask | Where Name -like 'ISP*'"
Write-Host " To stop a task:    Stop-ScheduledTask -TaskName '$WorkerTaskName'"
Write-Host " To remove tasks:   Unregister-ScheduledTask -TaskName '$WorkerTaskName' -Confirm:`$false"
Write-Host "==========================================================="
