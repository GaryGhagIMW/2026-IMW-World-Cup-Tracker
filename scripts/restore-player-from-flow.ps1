# Find a player's submission in Power Automate flow history and restore to Excel.
# Usage: .\scripts\restore-player-from-flow.ps1 -Search "Omid"

param(
  [Parameter(Mandatory = $true)]
  [string]$Search
)

$ErrorActionPreference = 'Stop'
$SearchLower = $Search.Trim().ToLower()

$environmentId = 'defaultce489f496a08487cbc9c7d75078824ea'
$flowId = 'b11215c7b719489eb98d80e420ecc2a9'

Import-Module ImportExcel -ErrorAction Stop
if (-not (Get-Module -ListAvailable Az.Accounts)) {
  throw 'Install Az.Accounts: Install-Module Az.Accounts -Scope CurrentUser'
}
Import-Module Az.Accounts -ErrorAction Stop
if (-not (Get-AzContext)) {
  Write-Host 'Sign in at https://login.microsoft.com/device when prompted.'
  Connect-AzAccount -UseDeviceAuthentication | Out-Null
}

$flowToken = (Get-AzAccessToken -ResourceUrl 'https://service.flow.microsoft.com/').Token
$headers = @{ Authorization = "Bearer $flowToken" }
$base = "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/$environmentId/flows/$flowId"

Write-Host "Searching flow history for '$Search'..."
$runs = @()
$uri = "$base/runs?api-version=2016-11-01"
do {
  $page = Invoke-RestMethod -Headers $headers -Uri $uri
  $runs += $page.value
  $uri = $page.nextLink
} while ($uri)

$found = @()
foreach ($run in $runs) {
  $detail = Invoke-RestMethod -Headers $headers -Uri "$base/runs/$($run.name)?api-version=2016-11-01"
  $body = $detail.properties.trigger.outputs.body
  if (-not $body -or $body.action -eq 'list') { continue }
  $name = [string]$body.playerName
  $email = [string]$body.playerEmail
  if ($name.ToLower().Contains($SearchLower) -or $email.ToLower().Contains($SearchLower)) {
    $found += $body
    Write-Host "Found: $name <$email> at $($run.properties.startTime)"
  }
}

if (-not $found.Count) {
  Write-Host "No submissions matching '$Search' in $($runs.Count) flow runs."
  exit 1
}

$latest = $found | Select-Object -Last 1
$outPath = Join-Path (Split-Path $PSScriptRoot -Parent) "recovered-$SearchLower.json"
@($latest) | ConvertTo-Json -Depth 10 | Set-Content $outPath -Encoding UTF8
Write-Host "Saved to $outPath"
Write-Host "Restoring to Excel..."
& (Join-Path $PSScriptRoot 'append-excel-entries.ps1') -InputPath $outPath
Write-Host "Done. Run .\scripts\sync-pool-from-excel.ps1 and push to update the leaderboard."
