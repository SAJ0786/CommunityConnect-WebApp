param(
  [string]$EvidenceDirectory = (Join-Path $PSScriptRoot '../.qa-readiness-evidence'),
  [switch]$OperationsOnly
)
$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
$previewProcess = $null
$report = [ordered]@{ startedAt = [DateTimeOffset]::UtcNow.ToString('o'); scope = $(if ($OperationsOnly) { 'operations-only' } else { 'full' }); status = 'running'; completed = @(); error = $null }
Push-Location $repository
try {
  $EvidenceDirectory = [System.IO.Path]::GetFullPath($EvidenceDirectory)
  $null = New-Item -ItemType Directory -Path $EvidenceDirectory -Force
  # Synthetic fixtures block remote browser page requests.
  if (-not $OperationsOnly) {
    & node --test tests/*.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Unit checks failed.' }
    $report.completed += 'unit checks'
  }
  & node tools/check-workspace-preview.mjs --build-only
  if ($LASTEXITCODE -ne 0) { throw 'Offline preview build failed.' }
  $report.completed += 'offline preview build'
  $response = $null
  try { $response = Invoke-WebRequest 'http://127.0.0.1:5184/' -TimeoutSec 2 -UseBasicParsing } catch {}
  if (-not $response) {
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $previewProcess = Start-Process -FilePath $nodePath -ArgumentList @('tools/check-workspace-preview.mjs','--serve-only') -WorkingDirectory $repository -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $EvidenceDirectory 'preview-stdout.log') -RedirectStandardError (Join-Path $EvidenceDirectory 'preview-stderr.log')
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
      if ($previewProcess.HasExited) { throw 'Preview could not start. See preview-stderr.log; port 5184 may be occupied.' }
      try { $response = Invoke-WebRequest 'http://127.0.0.1:5184/' -TimeoutSec 1 -UseBasicParsing; break } catch { Start-Sleep -Milliseconds 250 }
    }
  }
  if (-not $response -or $response.Content -notmatch '<title>Directory workspace review</title>') { throw 'Port 5184 is not serving the expected offline fixture. No browser tests were run against it.' }
  if (-not $OperationsOnly) {
    & node tests/check-workspace-browser.cjs (Join-Path $EvidenceDirectory 'workspace')
    if ($LASTEXITCODE -ne 0) { throw 'Workspace browser checks failed. Review the saved evidence.' }
    $report.completed += 'workspace browser checks'
  }
  & node tests/check-operations-browser.cjs (Join-Path $EvidenceDirectory 'operations')
  if ($LASTEXITCODE -ne 0) { throw 'Operations browser checks failed. Review the saved evidence.' }
  $report.completed += 'operations browser checks'
  $report.status = 'passed'
  Write-Output ('Offline checks passed (' + $report.scope + '). Evidence: ' + $EvidenceDirectory)
  Write-Output 'Installed-PWA upgrade, real devices and live-service acceptance remain separate checks.'
} catch {
  $report.status = 'failed'
  $report.error = $_.Exception.Message
  throw
} finally {
  # Leave an existing user server alone; stop only this run's child.
  if ($previewProcess -and -not $previewProcess.HasExited) { Stop-Process -InputObject $previewProcess -ErrorAction SilentlyContinue }
  $report.finishedAt = [DateTimeOffset]::UtcNow.ToString('o')
  if (Test-Path -LiteralPath $EvidenceDirectory) { $report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'run-status.json') -Encoding UTF8 }
  Pop-Location
}
