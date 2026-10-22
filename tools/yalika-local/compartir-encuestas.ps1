# Abre una direccion publica temporal (Cloudflare) para abrir las encuestas desde el celular.
# Solo expone la web local de Yalika (puerto 3001) mientras esta ventana siga abierta.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$exe = Join-Path $root 'tools\cloudflared\cloudflared.exe'
$webPort = 3001

if (-not (Test-Path $exe)) {
    Write-Host "ERROR: no encuentro cloudflared en $exe" -ForegroundColor Red
    exit 1
}

$tcp = New-Object System.Net.Sockets.TcpClient
try {
    $tcp.Connect('localhost', $webPort)
    $tcp.Close()
} catch {
    Write-Host "ERROR: Yalika no esta abierta en http://localhost:$webPort" -ForegroundColor Red
    Write-Host "Abre primero INICIAR_YALIKA.cmd y vuelve a ejecutar este archivo." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Preparando la direccion publica temporal..." -ForegroundColor Cyan
Write-Host "AVISO: mientras esta ventana siga abierta, tu Yalika local se puede abrir desde internet." -ForegroundColor Yellow
Write-Host "Cierra la ventana cuando termines de compartir." -ForegroundColor Yellow
Write-Host ""

$script:found = $false
& $exe tunnel --no-autoupdate --url "http://localhost:$webPort" 2>&1 | ForEach-Object {
    $line = "$_"
    if (-not $script:found -and $line -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
        $script:found = $true
        $address = $Matches[0]
        try { Set-Clipboard -Value $address } catch { }
        Write-Host "=============================================================" -ForegroundColor Green
        Write-Host " DIRECCION PUBLICA LISTA (ya quedo copiada):" -ForegroundColor Green
        Write-Host " $address" -ForegroundColor White
        Write-Host ""
        Write-Host " En Yalika > Encuestas > Compartir, pegala en 'Usar direccion'." -ForegroundColor Green
        Write-Host "=============================================================" -ForegroundColor Green
    }
}
