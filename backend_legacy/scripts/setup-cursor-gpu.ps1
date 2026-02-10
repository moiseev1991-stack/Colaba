# Настройка дискретной видеокарты (NVIDIA GeForce 940MX) для Cursor
# Запись в HKCU — права администратора НЕ нужны.
# Запуск: powershell -ExecutionPolicy Bypass -File ".\scripts\setup-cursor-gpu.ps1"

$ErrorActionPreference = "Stop"

Write-Host "=== Cursor: принудительно NVIDIA GeForce 940MX ===" -ForegroundColor Green

$cursorDir = "$env:LOCALAPPDATA\Programs\cursor"
$cursorExe = "$cursorDir\Cursor.exe"

if (-not (Test-Path $cursorExe)) {
    Write-Host "Cursor не найден: $cursorExe" -ForegroundColor Red
    exit 1
}

# Все exe в папке Cursor (рендеринг может быть в дочерних процессах)
$exeList = @()
Get-ChildItem -Path $cursorDir -Filter "*.exe" -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $exeList += $_.FullName }
if ($exeList.Count -eq 0) { $exeList = @($cursorExe) }

Write-Host "`nEXE для профиля GPU:" -ForegroundColor Yellow
$exeList | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

# --- 1) Windows: UserGpuPreferences ---
# GpuPreference=2 = High Performance (дискретная). Пробуем с ";" — в части сборок так считывается.
$gpuVal = "GpuPreference=2"
$key = "HKCU:\Software\Microsoft\DirectX\UserGpuPreferences"
if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }

foreach ($exe in $exeList) {
    $p = (Resolve-Path $exe -ErrorAction SilentlyContinue).Path
    if ($p) {
        Set-ItemProperty -Path $key -Name $p -Value $gpuVal -Type String -Force -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $key -Name $p -Value "GpuPreference=2;" -Type String -Force -ErrorAction SilentlyContinue
    }
}
Write-Host "`n[OK] UserGpuPreferences (GpuPreference=2) для всех EXE" -ForegroundColor Green

# --- 2) NVIDIA NVTweak Applications ---
$nvBase = "HKCU:\Software\NVIDIA Corporation\Global\NVTweak\Applications"
$nvGlobal = "HKCU:\Software\NVIDIA Corporation\Global"
$nvTweak = "HKCU:\Software\NVIDIA Corporation\Global\NVTweak"

foreach ($p in @($nvGlobal, $nvTweak, $nvBase)) {
    if (-not (Test-Path $p)) { New-Item -Path $p -Force | Out-Null }
}

# Удаляем старые записи Cursor и создаём заново
Get-ChildItem $nvBase -ErrorAction SilentlyContinue | ForEach-Object {
    $exe = (Get-ItemProperty $_.PSPath -Name "Executable" -ErrorAction SilentlyContinue).Executable
    if ($exe -and ($exe -like "*ursor*" -or $exe -like "*ursor*")) { Remove-Item $_.PSPath -Force -ErrorAction SilentlyContinue }
}

foreach ($exe in $exeList) {
    $p = (Resolve-Path $exe -ErrorAction SilentlyContinue).Path
    if (-not $p) { continue }
    $guid = [guid]::NewGuid().ToString()
    $appPath = "$nvBase\$guid"
    New-Item -Path $appPath -Force | Out-Null
    Set-ItemProperty -Path $appPath -Name "Executable" -Value $p -Type String
    Set-ItemProperty -Path $appPath -Name "Profile" -Value "PreferMaximumPerformance" -Type String
    Set-ItemProperty -Path $appPath -Name "D3DOGL" -Value 1 -Type DWord
    $name = [System.IO.Path]::GetFileNameWithoutExtension($p)
    Set-ItemProperty -Path $appPath -Name "Name" -Value $name -Type String -ErrorAction SilentlyContinue
}
Write-Host "[OK] NVIDIA NVTweak Applications: PreferMaximumPerformance для всех EXE" -ForegroundColor Green

Write-Host "`n--- Готово. Перезапустите Cursor. ---" -ForegroundColor Cyan
