# Build this checkout's Windows editor download and run the first-run check, stopping at the first failure.
# Run inside the VM:  powershell -NoProfile -ExecutionPolicy Bypass -File C:\dev\dreamcut\.agents\skills\windows-compatibility\scripts\build-and-verify.ps1
# Output goes to C:\dev\build.log; the summary lines print here.
$ErrorActionPreference = "Stop"
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
Set-Location C:\dev\dreamcut
Remove-Item C:\dev\build.log -ErrorAction SilentlyContinue
Get-ChildItem $env:TEMP -Directory -Filter "dreamcut-first-run-*" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
$steps = @(
  @("pnpm", "install", "--frozen-lockfile"),
  @("pnpm", "editor:build"),
  @("node", "desktop/package.mjs", "--service-only"),
  @("node", "packaging/build-web-runtime.mjs"),
  @("node", "packaging/pack-launcher.mjs"),
  @("node", "packaging/verify-web-runtime.mjs")
)
foreach ($step in $steps) {
  $started = Get-Date
  Write-Output "=== $($step -join ' ')"
  $ErrorActionPreference = "Continue"
  $rest = $step[1..($step.Length - 1)]
  & $step[0] @rest *>> C:\dev\build.log
  $code = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
  Write-Output "exit=$code minutes=$([math]::Round(((Get-Date) - $started).TotalMinutes, 1))"
  if ($code -ne 0) { Write-Output "--- last lines of C:\dev\build.log"; Get-Content C:\dev\build.log -Tail 40; exit $code }
}
Select-String -Path C:\dev\build.log -Pattern "^(PASS|FAIL) |checks passed" | ForEach-Object { $_.Line }
