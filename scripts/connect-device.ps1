# ==============================================================
# connect-device.ps1 - Conecta o dispositivo ADB automaticamente
# Prioridade: USB (cabo) > Wi-Fi (fallback)
# Uso: npm run android:connect
# ==============================================================

$WIFI_DEVICE_IP = "192.168.3.35"
$WIFI_PORT = 5555
$REVERSE_PORTS = @(8081, 8000)

Write-Host "[ADB] Verificando conexao..." -ForegroundColor Cyan

# Limpa sessoes antigas
adb disconnect 2>$null | Out-Null

# 1. Verifica se ha dispositivo USB conectado
$devices = adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "device$" }
$usbDevice = $devices | Where-Object { $_ -notmatch "emulator" -and $_ -notmatch "^\d+\.\d+" }

if ($usbDevice) {
    $deviceId = ($usbDevice -split "`t")[0]
    Write-Host "[OK] USB conectado: $deviceId" -ForegroundColor Green
    $method = "USB"
}
else {
    # 2. Sem USB - tenta Wi-Fi
    Write-Host "[..] Sem USB. Conectando via Wi-Fi ($WIFI_DEVICE_IP)..." -ForegroundColor Yellow
    $result = adb connect "$WIFI_DEVICE_IP`:$WIFI_PORT" 2>$null

    if ($result -match "connected") {
        $deviceId = "$WIFI_DEVICE_IP`:$WIFI_PORT"
        Write-Host "[OK] Wi-Fi conectado: $deviceId" -ForegroundColor Green
        $method = "Wi-Fi"
    }
    else {
        Write-Host "[ERRO] Falha ao conectar via Wi-Fi ($WIFI_DEVICE_IP)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Para configurar o Wi-Fi ADB:" -ForegroundColor Cyan
        Write-Host "  1. Conecte o cabo USB uma vez"
        Write-Host "  2. Execute: adb tcpip $WIFI_PORT"
        Write-Host "  3. Desconecte o cabo"
        Write-Host "  4. Execute este script novamente"
        exit 1
    }
}

# 3. Configura os reverses (Metro + API)
Write-Host "[..] Configurando portas reversas..." -ForegroundColor Cyan
foreach ($port in $REVERSE_PORTS) {
    $r = adb reverse "tcp:$port" "tcp:$port" 2>$null
    if ($r) {
        Write-Host "  [OK] Porta $port mapeada" -ForegroundColor Green
    }
    else {
        Write-Host "  [!!] Porta $port falhou" -ForegroundColor Yellow
    }
}

# 4. Mostra o dispositivo ativo
Write-Host ""
Write-Host "Dispositivo ativo ($method):" -ForegroundColor Cyan
$finalDevices = adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "device$" }
foreach ($d in $finalDevices) {
    $id = ($d -split "`t")[0]
    if ($id -match "emulator") { $type = "Emulador" }
    elseif ($id -match "^\d+\.\d+") { $type = "Wi-Fi" }
    else { $type = "USB" }
    Write-Host "  $id ($type)" -ForegroundColor White
}

Write-Host ""
Write-Host "Pronto! Para lancar o app:" -ForegroundColor Green
Write-Host "  adb shell monkey -p com.giovannevq.unifacensclient -c android.intent.category.LAUNCHER 1"
