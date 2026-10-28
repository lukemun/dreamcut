# Runs on the VM's desktop, started by open-editor.sh through a scheduled task (an SSH session has no
# desktop, so a browser started from it cannot render). Starts DreamCut from the source checkout the way the
# README's install leaves it, without opening a browser, and opens Chrome with remote debugging so the Mac
# can drive it. The sign-in link is written to C:\dev\winui\editor.log.
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
$repo = (Resolve-Path "$PSScriptRoot\..\..\..\..\..").Path
$work = "C:\dev\winui"
New-Item -ItemType Directory -Force $work | Out-Null
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 1
# Projects go to the checkout's projects\ folder, whatever Library an earlier run chose, so the editor check finds them.
$env:TIMELINE_PROJECTS_DIR = "$repo\projects"
Start-Process node -ArgumentList "`"$repo\bin\dreamcut.mjs`"", "--no-open" -WorkingDirectory $repo -RedirectStandardOutput "$work\editor.log" -RedirectStandardError "$work\editor.err" -WindowStyle Minimized
if (-not (Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=C:\dev\chrome-cdp", "--no-first-run", "--no-default-browser-check", "--start-maximized", "about:blank"
}
