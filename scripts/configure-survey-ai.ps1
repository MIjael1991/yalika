param(
  [string]$ProjectRoot = "C:\Users\Admin\Documents\Yalika"
)

$ErrorActionPreference = 'Stop'
$envPath = Join-Path $ProjectRoot 'apps\api\.env'

if (-not (Test-Path (Split-Path $envPath -Parent))) {
  throw "No se encontro la API en $ProjectRoot"
}

Write-Host ''
Write-Host 'La clave queda solamente en tu computadora y no se copia al ZIP.' -ForegroundColor Cyan
$secureKey = Read-Host 'Pega tu clave de API de OpenAI' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
  $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}

if ($apiKey.Length -lt 20) {
  throw 'La clave parece incompleta. No se realizo ningun cambio.'
}

$model = (Read-Host 'Modelo economico [gpt-5-mini]').Trim()
if (-not $model) {
  $model = 'gpt-5-mini'
}

$lines = if (Test-Path $envPath) {
  @(Get-Content -LiteralPath $envPath)
}
else {
  @()
}

function Set-EnvironmentValue {
  param(
    [string[]]$Lines,
    [string]$Name,
    [string]$Value
  )

  $replacement = "$Name=$Value"
  $found = $false
  $updated = foreach ($line in $Lines) {
    if ($line -match "^\s*$([regex]::Escape($Name))\s*=") {
      $found = $true
      $replacement
    }
    else {
      $line
    }
  }

  if (-not $found) {
    $updated += $replacement
  }

  return @($updated)
}

$lines = Set-EnvironmentValue -Lines $lines -Name 'OPENAI_API_KEY' -Value $apiKey
$lines = Set-EnvironmentValue -Lines $lines -Name 'OPENAI_SURVEY_MODEL' -Value $model
Set-Content -LiteralPath $envPath -Value $lines -Encoding UTF8

Write-Host ''
Write-Host 'IA GENERAL CONFIGURADA CORRECTAMENTE' -ForegroundColor Green
Write-Host 'Reinicia la API para activar el cambio.'

