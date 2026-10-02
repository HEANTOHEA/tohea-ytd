# deploy-vps.ps1 — Deploy YouTube Music Downloader to a remote Linux VPS
param (
    [Parameter(Mandatory=$true, HelpMessage="Remote VPS IP address or hostname")]
    [string]$HostIP,

    [Parameter(Mandatory=$false)]
    [string]$User = "root",

    [Parameter(Mandatory=$false)]
    [string]$KeyPath = "",

    [Parameter(Mandatory=$false)]
    [int]$Port = 22,

    [Parameter(Mandatory=$false)]
    [string]$RemoteDir = "/opt/yt-music-downloader"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Deploying to VPS ($User@$HostIP) ===" -ForegroundColor Cyan

# Prepare SSH options
$sshArgs = @("-p", $Port, "-o", "StrictHostKeyChecking=accept-new")
$scpArgs = @("-P", $Port, "-o", "StrictHostKeyChecking=accept-new")

if ($KeyPath -and (Test-Path $KeyPath)) {
    $sshArgs += @("-i", $KeyPath)
    $scpArgs += @("-i", $KeyPath)
}

# 1. Create remote target directory
Write-Host "Creating remote directory $RemoteDir..." -ForegroundColor Yellow
& ssh @sshArgs "$User@$HostIP" "sudo mkdir -p $RemoteDir && sudo chown -R $User $RemoteDir"

# 2. Package and upload files
Write-Host "Archiving project files..." -ForegroundColor Yellow
$archiveName = "deploy_payload.tar.gz"
$excludeList = @("node_modules", ".git", ".agents", "deploy_payload.tar.gz", "downloads")

# Use tar (available on modern Windows)
& tar --exclude='node_modules' --exclude='.git' --exclude='.agents' --exclude='downloads' -czf $archiveName *

Write-Host "Uploading project files to $HostIP..." -ForegroundColor Yellow
& scp @scpArgs $archiveName "$User@$HostIP:$RemoteDir/$archiveName"
Remove-Item -Force $archiveName

# 3. Unpack and run setup on VPS
Write-Host "Running remote setup on $HostIP..." -ForegroundColor Yellow
$remoteCommands = @"
cd $RemoteDir
tar -xzf $archiveName
rm -f $archiveName
chmod +x setup-vps.sh
./setup-vps.sh
"@

& ssh @sshArgs -t "$User@$HostIP" $remoteCommands

Write-Host ""
Write-Host "=== Deployment Completed! ===" -ForegroundColor Green
Write-Host "Open in your browser: http://${HostIP}:3000" -ForegroundColor Cyan
