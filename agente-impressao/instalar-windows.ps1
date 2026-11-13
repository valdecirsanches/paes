# Instala o agente de impressão nesta estação: copia para C:\PaesAgenteImpressao e inicia junto com o Windows.
# Requer Node.js 18+ instalado (https://nodejs.org). Execute como Administrador (botão direito > Executar com PowerShell).
param([switch]$ComoUsuarioAtual) # use se as impressoras estiverem instaladas so para o seu usuario (a conta SYSTEM nao as enxerga)
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
# Inicia com o Windows (mesmo sem ninguem logar), ao entrar um usuario e a cada 5 min (vigia: se o agente caiu, sobe de novo; se ja esta rodando, ignora)
$gatilhos = @(
  (New-ScheduledTaskTrigger -AtStartup),
  (New-ScheduledTaskTrigger -AtLogOn),
  (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650))
)
$cfg = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
if ($ComoUsuarioAtual) { $gatilhos = @($gatilhos[1], $gatilhos[2]); $conta = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited }
else { $conta = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest }
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilhos -Settings $cfg -Principal $conta | Out-Null
Start-ScheduledTask -TaskName $nome
Write-Host "Agente instalado e iniciado. Abra http://127.0.0.1:9101 para cadastrar as impressoras." -ForegroundColor Green
Write-Host "Se o sistema web nao estiver em localhost:5072, adicione o endereco dele em 'Origens permitidas'."
