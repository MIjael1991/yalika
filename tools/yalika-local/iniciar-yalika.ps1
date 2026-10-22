$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$Api = Join-Path $Root "apps\api"
$Web = Join-Path $Root "apps\web"
$Sidebar = Join-Path $Web "src\components\yalika-sidebar.tsx"
$SaludPage = Join-Path $Web "src\app\salud\page.tsx"
$ClinicalModule = Join-Path $Api "src\clinical\clinical.module.ts"
$ClinicalStorage = Join-Path $env:LOCALAPPDATA "Yalika\clinical-dev"

function Info([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Ok([string]$Message) { Write-Host "OK:  $Message" -ForegroundColor Green }
function Warn([string]$Message) { Write-Host "AVISO: $Message" -ForegroundColor Yellow }

function Invoke-CapturedCommand([string]$CommandLine) {
    $Lines = @(& cmd.exe /d /s /c "$CommandLine 2>&1")
    return [pscustomobject]@{
        Text = ($Lines -join [Environment]::NewLine)
        ExitCode = $LASTEXITCODE
    }
}

function Test-Port([int]$Port) {
    try {
        return $null -ne (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop)
    }
    catch { return $false }
}

function Test-Url([string]$Url) {
    try {
        $Response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        return ($Response.StatusCode -ge 200 -and $Response.StatusCode -lt 400)
    }
    catch { return $false }
}

function Wait-Url([string]$Url, [int]$Seconds) {
    for ($i = 0; $i -lt $Seconds; $i++) {
        if (Test-Url $Url) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Test-DockerDaemon {
    $Result = Invoke-CapturedCommand 'docker.exe info --format "{{.ServerVersion}}"'
    return ($Result.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($Result.Text))
}

function Start-DockerDesktopIfNeeded {
    if (Test-DockerDaemon) { return $true }

    $Candidates = @(
        (Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Docker\Docker\Docker Desktop.exe")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }

    if (@($Candidates).Count -eq 0) { return $false }

    Info "Docker Desktop está cerrado; intentando iniciarlo"
    try {
        Start-Process -FilePath $Candidates[0] | Out-Null
    }
    catch {
        Warn "No pude abrir Docker Desktop automáticamente: $($_.Exception.Message)"
        return $false
    }

    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 1
        if (Test-DockerDaemon) {
            Ok "Docker Desktop quedó listo."
            return $true
        }
    }

    return $false
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " YALIKA - INICIO LOCAL UNICO" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Una Web + una API + una PostgreSQL yalika."
Write-Host ""

foreach ($Required in @($Api, $Web, $Sidebar, $SaludPage, $ClinicalModule)) {
    if (-not (Test-Path -LiteralPath $Required)) {
        Write-Host "ERROR: falta $Required" -ForegroundColor Red
        exit 10
    }
}

$SidebarText = Get-Content -LiteralPath $Sidebar -Raw
if ($SidebarText -match '\bhref\s*[:=]\s*[''"]/salud[''"]') {
    Ok "Salud está integrado en el menú fuente."
}
else {
    Write-Host "ERROR: /salud existe, pero no está en el menú fuente." -ForegroundColor Red
    exit 11
}

Info "Comprobando PostgreSQL local"
if ($null -eq (Get-Command docker.exe -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Docker CLI no está disponible." -ForegroundColor Red
    exit 12
}

if (-not (Start-DockerDesktopIfNeeded)) {
    Warn "Docker Desktop todavía no está disponible."
    Warn "Ábrelo manualmente y vuelve a ejecutar INICIAR_YALIKA.cmd."
    exit 13
}

$NamesResult = Invoke-CapturedCommand 'docker.exe ps -a --format "{{.Names}}"'
if ($NamesResult.ExitCode -ne 0) {
    Write-Host $NamesResult.Text -ForegroundColor Red
    Write-Host "ERROR: Docker respondió, pero no pude consultar los contenedores." -ForegroundColor Red
    exit 14
}
$Names = @($NamesResult.Text -split "`r?`n" | Where-Object { $_ })

$RunningResult = Invoke-CapturedCommand 'docker.exe ps --format "{{.Names}}"'
$RunningNames = @($RunningResult.Text -split "`r?`n" | Where-Object { $_ })

$ContainerExists = $Names -contains "orion-postgres"
$ContainerRunning = $RunningNames -contains "orion-postgres"

if ($ContainerExists -and -not $ContainerRunning) {
    Info "Encendiendo contenedor PostgreSQL existente orion-postgres"
    $StartResult = Invoke-CapturedCommand "docker.exe start orion-postgres"
    if ($StartResult.ExitCode -ne 0) {
        Write-Host $StartResult.Text -ForegroundColor Red
        exit 15
    }
    Start-Sleep -Seconds 2
    Ok "PostgreSQL local iniciado."
}
elseif ($ContainerRunning) {
    Ok "PostgreSQL local ya estaba encendido."
}
else {
    Write-Host "ERROR: no encontré el contenedor orion-postgres." -ForegroundColor Red
    Write-Host "No crearé otra base automáticamente." -ForegroundColor Yellow
    exit 16
}

New-Item -ItemType Directory -Path $ClinicalStorage -Force | Out-Null

# ¿Cambió el esquema desde la última vez que se preparó el cliente de la base de datos?
$SchemaTime = (Get-ChildItem -LiteralPath (Join-Path $Api "prisma\schema") -Filter *.prisma |
    Measure-Object -Property LastWriteTime -Maximum).Maximum
$ClientFile = Join-Path $Api "src\generated\prisma\client.ts"
$ClientOutdated = -not (Test-Path -LiteralPath $ClientFile) -or
    ((Get-Item -LiteralPath $ClientFile).LastWriteTime -lt $SchemaTime)

if ($ClientOutdated -and (Test-Url "http://localhost:3000/health")) {
    Write-Host "AVISO: la API está prendida con una versión vieja de la base de datos." -ForegroundColor Yellow
    Write-Host "Cierra la ventana de la API (la de npm.cmd run start:dev) y vuelve a abrir INICIAR_YALIKA.cmd." -ForegroundColor Yellow
    exit 19
}

# Base de datos: aplica las migraciones nuevas (antes de prender la API).
Info "Actualizando la base de datos"
$MigrateResult = Invoke-CapturedCommand "cd /d `"$Api`" && npx.cmd prisma migrate deploy"
if ($MigrateResult.ExitCode -ne 0) {
    Write-Host $MigrateResult.Text -ForegroundColor Red
    Write-Host "ERROR: no se pudieron aplicar las migraciones de la base de datos." -ForegroundColor Red
    exit 17
}
Ok "Base de datos al día."

Info "Comprobando API en puerto 3000"
if (-not (Test-Url "http://localhost:3000/health")) {
    if ($ClientOutdated) {
        Info "Preparando el cliente de la base de datos"
        $GenerateResult = Invoke-CapturedCommand "cd /d `"$Api`" && npx.cmd prisma generate"
        if ($GenerateResult.ExitCode -ne 0) {
            Write-Host $GenerateResult.Text -ForegroundColor Red
            Write-Host "ERROR: no se pudo preparar el cliente de la base de datos." -ForegroundColor Red
            exit 18
        }
        Ok "Cliente de la base de datos listo."
    }

    if (Test-Port 3000) {
        Write-Host "ERROR: el puerto 3000 está ocupado, pero /health no responde como Yalika." -ForegroundColor Red
        exit 20
    }

    $ApiCommand = "Set-Location -LiteralPath '$Api'; " +
        "`$env:PORT='3000'; " +
        "`$env:CLINICAL_MODULE_ENABLED='true'; " +
        "`$env:CLINICAL_STORAGE_DIR='$ClinicalStorage'; " +
        "npm.cmd run start:dev"

    Start-Process powershell.exe -ArgumentList @(
        "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass",
        "-Command", $ApiCommand
    )

    Info "API lanzada; comprobando /health"
    if (-not (Wait-Url "http://localhost:3000/health" 60)) {
        Write-Host "ERROR: la API no respondió en http://localhost:3000/health" -ForegroundColor Red
        exit 21
    }
}

Ok "API Yalika: http://localhost:3000/health"

Info "Comprobando Web en puerto 3001"
if (-not (Test-Url "http://localhost:3001")) {
    if (Test-Port 3001) {
        Write-Host "ERROR: el puerto 3001 está ocupado, pero no responde la Web Yalika." -ForegroundColor Red
        exit 30
    }

    $WebCommand = "Set-Location -LiteralPath '$Web'; npm.cmd run dev -- -p 3001"

    Start-Process powershell.exe -ArgumentList @(
        "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass",
        "-Command", $WebCommand
    )

    Info "Web lanzada; comprobando inicio"
    if (-not (Wait-Url "http://localhost:3001" 60)) {
        Write-Host "ERROR: la Web no respondió en http://localhost:3001" -ForegroundColor Red
        exit 31
    }
}

Ok "Web Yalika: http://localhost:3001"

Info "Comprobando Salud"
if (-not (Wait-Url "http://localhost:3001/salud" 20)) {
    Write-Host "ERROR: la Web funciona, pero /salud no respondió." -ForegroundColor Red
    exit 40
}
Ok "Salud Yalika: http://localhost:3001/salud"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " YALIKA LOCAL COMPLETA: ACTIVA" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "Inicio:  http://localhost:3001"
Write-Host "Salud:   http://localhost:3001/salud"
Write-Host "API:     http://localhost:3000/health"
Write-Host ""
Write-Host "La próxima vez usa sólo: INICIAR_YALIKA.cmd"
Write-Host ""

Start-Process "http://localhost:3001"
exit 0
