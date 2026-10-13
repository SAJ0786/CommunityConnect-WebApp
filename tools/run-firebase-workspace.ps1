param([switch]$Preview, [switch]$Full, [switch]$CandidateRules)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectDirectory
$emulatorProcess = $null
$previousEmulatorHost = $env:FIRESTORE_EMULATOR_HOST
$previousRuleVariant = $env:DIRECTORY_RULE_VARIANT
try {
  $firebaseConfig = 'tests/firebase-integration/firebase.json'
  $env:DIRECTORY_RULE_VARIANT = 'reference'
  if ($CandidateRules) {
    & node tools/prepare-rule-candidate.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the separate emulator rule candidate.' }
    $firebaseConfig = 'tests/firebase-integration/firebase.candidate.json'
    $env:DIRECTORY_RULE_VARIANT = 'candidate'
    Write-Host 'Using the EMULATOR-ONLY candidate. Production and reference rules are unchanged.'
  }
  if ($Full) {
    & node tools/prepare-local-backend.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Could not prepare isolated backend dependencies. See the error above.' }
    $testCommand = 'node tools/check-local-backend.mjs'
    if ($Preview) { $testCommand += ' --preview' }
    & firebase.cmd emulators:exec --only auth,firestore,storage,functions --project demo-community-connect-web --config $firebaseConfig $testCommand
    if ($LASTEXITCODE -ne 0) { throw 'Isolated backend acceptance did not pass. Review emulator output and .qa-firebase-evidence.' }
    return
  }
  $javaCommand = (Get-Command java -ErrorAction Stop).Source
  $emulatorJar = Join-Path $env:USERPROFILE '.cache\firebase\emulators\cloud-firestore-emulator-v1.22.0.jar'
  if (!(Test-Path -LiteralPath $emulatorJar)) { throw 'The cached Firestore emulator is missing. Install the official Firebase emulator before continuing.' }
  $rulesFile = Join-Path $projectDirectory 'tests\firebase-integration\firestore.rules'
  if ($CandidateRules) { $rulesFile = Join-Path $projectDirectory 'tests\firebase-integration\firestore.candidate.rules' }
  $evidenceDirectory = Join-Path $projectDirectory '.qa-firebase-evidence'
  New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
  $arguments = @('-jar', ('"' + $emulatorJar + '"'), '--host', '127.0.0.1', '--port', '8089', '--project_id', 'demo-community-connect-web',
    '--single_project_mode', 'true', '--single_project_mode_error', 'true', '--rules', ('"' + $rulesFile + '"'))
  $emulatorProcess = Start-Process -FilePath $javaCommand -ArgumentList $arguments -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $evidenceDirectory 'emulator-output.log') -RedirectStandardError (Join-Path $evidenceDirectory 'emulator-error.log')
  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    if ($emulatorProcess.HasExited) { throw 'The isolated emulator exited. See .qa-firebase-evidence/emulator-error.log.' }
    try {
      $null = Invoke-WebRequest -Uri 'http://127.0.0.1:8089/v1/projects/demo-community-connect-web/databases/(default)/documents/publicBusinesses' -TimeoutSec 2 -UseBasicParsing
      $ready = $true
      break
    } catch {}
  }
  if (!$ready) { throw 'Could not reach the local emulator. Check .qa-firebase-evidence/emulator-error.log.' }
  $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8089'
  & node --test tests/firebase-integration/rules.test.mjs 2>&1 | Tee-Object -FilePath (Join-Path $evidenceDirectory 'rules-results.txt')
  $rulesExitCode = $LASTEXITCODE
  if ($rulesExitCode -ne 0) {
    Write-Warning 'Firebase permission checks failed. This is not a release-ready result. Review .qa-firebase-evidence/rules-results.txt.'
    if (!$Preview) { throw 'Permission checks failed; production remains on hold.' }
  }
  if ($Preview) {
    & node tests/firebase-integration/seed.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic data could not be restored for preview.' }
    Write-Host 'Opening isolated workflow preview on http://127.0.0.1:5187/. Press Ctrl+C to stop.'
    & node tools/check-firebase-workspace.mjs
    if ($LASTEXITCODE -ne 0) { throw 'The local workspace preview could not start.' }
  } else { Write-Host 'All Firebase permission checks passed. No production changes were made.' }
} finally {
  if ($emulatorProcess -and !$emulatorProcess.HasExited) { Stop-Process -Id $emulatorProcess.Id }
  if ($null -eq $previousEmulatorHost) { Remove-Item Env:FIRESTORE_EMULATOR_HOST -ErrorAction SilentlyContinue }
  else { $env:FIRESTORE_EMULATOR_HOST = $previousEmulatorHost }
  if ($null -eq $previousRuleVariant) { Remove-Item Env:DIRECTORY_RULE_VARIANT -ErrorAction SilentlyContinue }
  else { $env:DIRECTORY_RULE_VARIANT = $previousRuleVariant }
  Pop-Location
}
