# One-time, in an Administrator PowerShell inside the VM (after UTM's guest tools are installed, for networking):
#   powershell -ExecutionPolicy Bypass -File enable-ssh.ps1 -PublicKey "ssh-ed25519 AAAA... dreamcut-vm-build"
# Turns on Windows' OpenSSH server for key-only logins by this key, plus the developer settings DreamCut builds need.
param([Parameter(Mandatory = $true)][string]$PublicKey)
$ErrorActionPreference = "Stop"
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
Set-Service sshd -StartupType Automatic
Start-Service sshd
# Administrators' keys live here (not in the user profile) on Windows.
Set-Content -Path C:\ProgramData\ssh\administrators_authorized_keys -Value $PublicKey
icacls C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F" | Out-Null
New-NetFirewallRule -Name sshd-dreamcut -DisplayName "OpenSSH (DreamCut build)" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -ErrorAction SilentlyContinue | Out-Null
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force | Out-Null
# Developer Mode (links without elevation), long paths (deep node_modules) and local scripts (npm.ps1).
New-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock -Name AllowDevelopmentWithoutDevLicense -Value 1 -PropertyType DWORD -Force | Out-Null
New-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force | Out-Null
Set-ExecutionPolicy RemoteSigned -Scope LocalMachine -Force
ipconfig | findstr IPv4
