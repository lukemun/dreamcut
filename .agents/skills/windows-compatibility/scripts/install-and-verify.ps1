# Install this checkout from source as the README tells a Windows user, then check that an agent can connect,
# stopping at the first failure.
# Run inside the VM:  powershell -NoProfile -ExecutionPolicy Bypass -File C:\dev\dreamcut\.agents\skills\windows-compatibility\scripts\install-and-verify.ps1
# Output goes to C:\dev\install.log; the summary lines print here.
$ErrorActionPreference = "Stop"
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
Set-Location C:\dev\dreamcut
Remove-Item C:\dev\install.log -ErrorAction SilentlyContinue
$steps = @(
  @("pnpm", "install", "--frozen-lockfile"),
  @("pnpm", "bootstrap"),
  @("node", "$PSScriptRoot\vm\mcp-check.mjs")
)
foreach ($step in $steps) {
  $started = Get-Date
  Write-Output "=== $($step -join ' ')"
  $ErrorActionPreference = "Continue"
  $rest = $step[1..($step.Length - 1)]
  & $step[0] @rest *>> C:\dev\install.log
  $code = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
  Write-Output "exit=$code minutes=$([math]::Round(((Get-Date) - $started).TotalMinutes, 1))"
  if ($code -ne 0) { Write-Output "--- last lines of C:\dev\install.log"; Get-Content C:\dev\install.log -Tail 40; exit $code }
}
Select-String -Path C:\dev\install.log -Pattern "^(PASS|FAIL) |checks passed|Setup complete" | ForEach-Object { $_.Line }
