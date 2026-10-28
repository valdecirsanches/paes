# Instala o agente de impressão nesta estação: copia para C:\PaesAgenteImpressao e inicia junto com o Windows.
# Requer Node.js 18+ instalado (https://nodejs.org). Execute como Administrador (botão direito > Executar com PowerShell).
$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Host 'Node.js nao encontrado. Instale em https://nodejs.org e execute de novo.' -ForegroundColor Red; exit 1 }
$dest = 'C:\PaesAgenteImpressao'
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item -Recurse -Force (Join-Path $PSScriptRoot 'src') $dest
Copy-Item -Force (Join-Path $PSScriptRoot 'package.json') $dest
$nome = 'PaesAgenteImpressao'
Unregister-ScheduledTask -TaskName $nome -Confirm:$false -ErrorAction SilentlyContinue
$acao = New-ScheduledTaskAction -Execute $node -Argument "`"$dest\src\server.js`"" -WorkingDirectory $dest
$gatilho = New-ScheduledTaskTrigger -AtLogOn
$cfg = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $cfg -RunLevel Limited | Out-Null
Start-ScheduledTask -TaskName $nome
Write-Host "Agente instalado e iniciado. Abra http://127.0.0.1:9101 para cadastrar as impressoras." -ForegroundColor Green
Write-Host "Se o sistema web nao estiver em localhost:5072, adicione o endereco dele em 'Origens permitidas'."
