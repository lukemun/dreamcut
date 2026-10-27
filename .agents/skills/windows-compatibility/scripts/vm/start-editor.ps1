# Runs on the VM's desktop, started by open-editor.sh through a scheduled task (an SSH session has no
# desktop, so a browser started from it cannot render). Installs the launcher this checkout packed, serves
# the built runtime as the download site, starts DreamCut without opening a browser, and opens Chrome with
# remote debugging so the Mac can drive it. The sign-in link is written to C:\dev\winui\editor.log.
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
$repo = (Resolve-Path "$PSScriptRoot\..\..\..\..\..").Path
$work = "C:\dev\winui"
New-Item -ItemType Directory -Force $work | Out-Null
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 1
$launcher = Get-ChildItem "$repo\dist\npm\dreamcut-*.tgz" | Sort-Object LastWriteTime | Select-Object -Last 1
npm install -g $launcher.FullName *> "$work\install.log"
# Forget any runtime an earlier build installed, so the launcher downloads this one. Projects stay.
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\DreamCut\runtime", "$env:LOCALAPPDATA\DreamCut\runtimes" -ErrorAction SilentlyContinue
$env:DREAMCUT_RUNTIME_BASE_URL = "http://127.0.0.1:4555"
Start-Process node -ArgumentList "`"$PSScriptRoot\serve-runtime.mjs`"", "`"$repo\dist\web-runtime`"" -WindowStyle Hidden
Start-Sleep 2
Start-Process dreamcut.cmd -ArgumentList "--no-open" -RedirectStandardOutput "$work\editor.log" -RedirectStandardError "$work\editor.err" -WindowStyle Minimized
if (-not (Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=C:\dev\chrome-cdp", "--no-first-run", "--no-default-browser-check", "--start-maximized", "about:blank"
}
