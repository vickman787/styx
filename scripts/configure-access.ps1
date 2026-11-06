param(
    [string]$Username,
    [string]$Workspace = 'acme-local'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
$securePassword = $null
$confirmation = $null
$priorSetupPassword = [Environment]::GetEnvironmentVariable('STYX_SETUP_PASSWORD', 'Process')
try {
    if (-not $Username) { $Username = Read-Host 'Choose your STYX login username' }
    if ($Username -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,39}$') { throw 'Use a username of 3-40 letters, numbers, dots, underscores or hyphens.' }
    if ($Workspace -notmatch '^[a-z0-9][a-z0-9_-]{2,63}$') { throw 'Invalid workspace ID.' }
    $securePassword = Read-Host 'Choose a unique passphrase (15-128 characters; input hidden)' -AsSecureString
    $confirmation = Read-Host 'Repeat that passphrase (input hidden)' -AsSecureString
    $passwordText = [System.Net.NetworkCredential]::new('', $securePassword).Password
    $confirmationText = [System.Net.NetworkCredential]::new('', $confirmation).Password
    if ($passwordText.Length -lt 15 -or $passwordText.Length -gt 128 -or [Text.Encoding]::UTF8.GetByteCount($passwordText) -gt 512) { throw 'Use a passphrase of 15-128 characters.' }
    if ($passwordText -cne $confirmationText) { throw 'Passphrases differ. No account was created.' }
    $backupPath = 'data/backups/access-before-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8) + '.sqlite'
    & node --import tsx scripts/database.ts backup $backupPath
    if ($LASTEXITCODE -ne 0) { throw 'Backup failed. No access change attempted.' }
    $env:STYX_SETUP_PASSWORD = $passwordText
    & node --import tsx scripts/access.ts create-user --username $Username --workspace $Workspace --role owner
    if ($LASTEXITCODE -ne 0) { throw 'Account setup failed. Existing accounts were not overwritten.' }
    Write-Host 'Owner login created. The current local server is unchanged; the login is ready for the VPS database transfer.'
    Write-Host 'Keep the passphrase in your password manager. Do not send it in chat.'
} finally {
    [Environment]::SetEnvironmentVariable('STYX_SETUP_PASSWORD', $priorSetupPassword, 'Process')
    $passwordText = $null
    $confirmationText = $null
    if ($securePassword) { $securePassword.Dispose() }
    if ($confirmation) { $confirmation.Dispose() }
    Pop-Location
}
