# POST a sample early knockout submission to the Power Automate webhook and check OneDrive.
param(
  [string]$PlayerName = 'Webhook Test',
  [string]$Email = 'test@imw.ca'
)

$ErrorActionPreference = 'Stop'
$configPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'src\data\config.js'
$configText = Get-Content -Raw -Path $configPath
if ($configText -notmatch "webhookUrl:\s*'([^']+)'") {
  throw 'Could not read webhookUrl from src/data/config.js'
}
$url = $Matches[1]
$submittedAt = (Get-Date).ToUniversalTime().ToString('o')
$entryJson = (@{
  name = $PlayerName
  email = $Email
  knockout = @{ 'r32-1' = 'CAN'; 'r32-2' = 'GER'; 'r32-3' = 'NED' }
  submitPhase = 'early'
  phase = 'knockout'
} | ConvertTo-Json -Compress)

$payload = @'
{
  "action": "submitKnockout",
  "phase": "knockout",
  "submitPhase": "early",
  "playerName": "Webhook Test",
  "playerEmail": "test@imw.ca",
  "submittedAt": "2026-06-25T12:00:00.000Z",
  "PlayerName": "Webhook Test",
  "Email": "test@imw.ca",
  "SubmittedAt": "2026-06-25T12:00:00.000Z",
  "SubmitPhase": "early",
  "EntryJson": "{\"knockout\":{\"r32-1\":\"CAN\",\"r32-2\":\"GER\",\"r32-3\":\"NED\"}}",
  "entryJson": "{\"knockout\":{\"r32-1\":\"CAN\",\"r32-2\":\"GER\",\"r32-3\":\"NED\"}}",
  "Knockout_r32_1": "CAN",
  "Knockout_r32_2": "GER",
  "Knockout_r32_3": "NED"
}
'@

Write-Host "POST $url"
$resp = Invoke-WebRequest -Uri $url -Method POST -Body $payload -ContentType 'application/json' -UseBasicParsing
Write-Host "HTTP $($resp.StatusCode)"

Start-Sleep -Seconds 12
Import-Module ImportExcel -ErrorAction Stop
$excelPath = "$env:OneDriveCommercial\World Cup 2026 Pool\Group Stage Entries.xlsx"
if (-not (Test-Path $excelPath)) {
  $excelPath = "$env:OneDrive\World Cup 2026 Pool\Group Stage Entries.xlsx"
}
Import-Excel -Path $excelPath -WorksheetName 'Knockout' |
  Where-Object { $_.PlayerName -eq $PlayerName } |
  Format-Table PlayerName, Email, SubmitPhase, SubmittedAt -AutoSize
