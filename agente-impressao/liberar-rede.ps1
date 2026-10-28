# Libera o agente para receber impressão do servidor do sistema (ex.: servidor Linux) pela rede local.
# Execute como Administrador, no Windows onde estão as impressoras. Gera um token, ajusta o config.json,
# abre a porta no firewall (só para a rede local) e reinicia o agente. No fim mostra as linhas para o server/.env.
$ErrorActionPreference = 'Stop'
$pasta = Join-Path ($env:PROGRAMDATA) 'PaesAgenteImpressao'
$arq = Join-Path $pasta 'config.json'
New-Item -ItemType Directory -Force $pasta | Out-Null
$cfg = if (Test-Path $arq) { (Get-Content $arq -Raw -Encoding UTF8).TrimStart([char]0xFEFF) | ConvertFrom-Json } else { [pscustomobject]@{ porta = 9101; origens = @(); destinos = [pscustomobject]@{} } }
$porta = if ($cfg.porta) { [int]$cfg.porta } else { 9101 }
if (-not $cfg.token -or $cfg.token.Length -lt 16) {
  $bytes = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token = [Convert]::ToBase64String($bytes).Replace('+','a').Replace('/','b').Replace('=','')
  $cfg | Add-Member -Force -NotePropertyName token -NotePropertyValue $token
}
$cfg | Add-Member -Force -NotePropertyName escuta -NotePropertyValue '0.0.0.0'
if (Test-Path $arq) { Copy-Item -Force $arq ($arq + '.bak') }
[IO.File]::WriteAllText($arq, ($cfg | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding $false))
Remove-NetFirewallRule -DisplayName 'Paes Agente de Impressao' -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName 'Paes Agente de Impressao' -Direction Inbound -Protocol TCP -LocalPort $porta -Action Allow -RemoteAddress LocalSubnet -Profile Any | Out-Null
Stop-ScheduledTask -TaskName 'PaesAgenteImpressao' -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName 'PaesAgenteImpressao'
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '169.*' -and $_.IPAddress -ne '127.0.0.1' } | Select-Object -First 1).IPAddress
Write-Host "`nPronto. Coloque no server/.env do servidor e reinicie a API:`n" -ForegroundColor Green
Write-Host "AGENTE_URL=http://${ip}:$porta"
Write-Host "AGENTE_TOKEN=$($cfg.token)"
