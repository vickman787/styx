$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$target = Join-Path $projectRoot 'data/near-ai.env'
$modelId = Read-Host 'NEAR AI model ID (example: deepseek/deepseek-v3.2)'
if ($modelId -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$') { throw 'Enter a valid model ID from your NEAR AI account.' }
$secureKey = Read-Host 'Paste your NEAR AI API key (input is hidden)' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    if ($plainKey.Length -lt 8 -or $plainKey.Length -gt 4096 -or $plainKey -match '[\s"''#\x00-\x1f]') { throw 'Invalid key format. Nothing was saved.' }
    $null = New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force
    $configuration = "NEAR_AI_ENABLED=true`nNEAR_AI_MODEL=$modelId`nNEAR_AI_API_KEY=$plainKey`n"
    [IO.File]::WriteAllText($target, $configuration, (New-Object Text.UTF8Encoding($false)))
    Write-Host 'AI configuration saved in the ignored local data directory. Key not displayed. Restart npm run dev to load it.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    $plainKey = $null
    $configuration = $null
    $secureKey.Dispose()
}
