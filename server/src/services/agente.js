// Instalador do agente de impressão: o sistema serve o pacote (código do agente) e um .bat que instala tudo na estação.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = process.env.AGENTE_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../agente-impressao');
const INCLUIR = ['package.json', 'src/config.js', 'src/transportes.js', 'src/png.js', 'src/server.js', 'src/admin.js'];

/** { arquivos: { 'src/server.js': <base64>, ... } } — sem zip, o PowerShell recompõe os arquivos. */
export function pacote(dir = DIR) {
  const arquivos = {};
  for (const f of INCLUIR) arquivos[f] = fs.readFileSync(path.join(dir, f)).toString('base64');
  return { versao: JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version, arquivos };
}

const PS = String.raw`
$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
$site = '@@SITE@@'
$dest = 'C:\PaesAgenteImpressao'
$cfgDir = Join-Path $env:PROGRAMDATA 'PaesAgenteImpressao'
$tarefa = 'PaesAgenteImpressao'
$Host.UI.RawUI.WindowTitle = 'Agente de impressao - WinBakery'
function Linha($t, $c = 'Gray') { Write-Host $t -ForegroundColor $c }
function Banner($sub) {
  Clear-Host
  Linha ''
  Linha '  +--------------------------------------------------+' DarkYellow
  Linha '  |        WinBakery  -  Agente de impressao         |' Yellow
  Linha ('  |  ' + $sub.PadRight(48) + '|') DarkYellow
  Linha '  +--------------------------------------------------+' DarkYellow
  Linha ''
}
function Passo($n, $t) { Linha ''; Linha ("  [$n/5] $t") Cyan }
function Ok($t) { Linha ("        [ OK ] $t") Green }
function Info($t) { Linha ("        $t") DarkGray }
function AtualizaPath { $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }
function ParaAgente { Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*PaesAgenteImpressao*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force } }

try {
if ('@@MODO@@' -eq 'remover') {
  Banner 'Remover'
  Stop-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $tarefa -Confirm:$false -ErrorAction SilentlyContinue
  ParaAgente
  Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue
  Ok 'Agente removido.'
  Info ('A configuracao das impressoras foi mantida em ' + $cfgDir)
  return
}

Banner 'Instalacao'
Passo 1 'Node.js'
AtualizaPath
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
$bom = $false
if ($node) { $v = [int]((& $node -v).TrimStart('v').Split('.')[0]); $bom = $v -ge 20 }
if (-not $bom) {
  Info 'Node.js 20+ nao encontrado. Instalando (pode levar alguns minutos)...'
  $feito = $false
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    try { winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements | Out-Null; $feito = ($LASTEXITCODE -eq 0) } catch { }
  }
  if (-not $feito) {
    $base = 'https://nodejs.org/dist/latest-v22.x/'
    $lista = (Invoke-WebRequest -UseBasicParsing ($base + 'SHASUMS256.txt')).Content
    $msi = ([regex]::Match($lista, 'node-v[\d.]+-x64\.msi')).Value
    if (-not $msi) { throw 'Nao foi possivel localizar o instalador do Node.js. Instale manualmente em https://nodejs.org' }
    $tmp = Join-Path $env:TEMP $msi
    Invoke-WebRequest -UseBasicParsing ($base + $msi) -OutFile $tmp
    Start-Process msiexec.exe -ArgumentList ('/i "' + $tmp + '" /qn /norestart') -Wait
  }
  AtualizaPath
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
  if (-not (Test-Path $node)) { throw 'Node.js nao foi instalado. Instale manualmente em https://nodejs.org e execute de novo.' }
}
Ok ('Node.js ' + (& $node -v))

Passo 2 'Gravando o agente'
$pac = $PACOTE | ConvertFrom-Json
ParaAgente
Stop-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue
foreach ($p in $pac.arquivos.PSObject.Properties) {
  $alvo = Join-Path $dest ($p.Name -replace '/', '\')
  New-Item -ItemType Directory -Force (Split-Path $alvo) | Out-Null
  [IO.File]::WriteAllBytes($alvo, [Convert]::FromBase64String($p.Value))
}
Ok ('Versao ' + $pac.versao + ' em ' + $dest)

Passo 3 'Liberando este sistema'
New-Item -ItemType Directory -Force $cfgDir | Out-Null
$arqCfg = Join-Path $cfgDir 'config.json'
if (Test-Path $arqCfg) { $cfg = (Get-Content $arqCfg -Raw -Encoding UTF8).TrimStart([char]0xFEFF) | ConvertFrom-Json } else { $cfg = [pscustomobject]@{ porta = 9101; origens = @(); destinos = [pscustomobject]@{} } }
$origens = @($cfg.origens) + @($site, 'http://localhost:5072', 'http://127.0.0.1:5072') | Where-Object { $_ } | Select-Object -Unique
$cfg | Add-Member -Force NoteProperty origens $origens
if (Test-Path $arqCfg) { Copy-Item -Force $arqCfg ($arqCfg + '.bak') }
[IO.File]::WriteAllText($arqCfg, ($cfg | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding $false)) # sem BOM: o agente le JSON puro
Ok ('Origem permitida: ' + $site)
& icacls $cfgDir /grant '*S-1-5-32-545:(OI)(CI)M' /T /C /Q | Out-Null
Ok 'Pasta de configuracao liberada para os usuarios do Windows'

Passo 4 'Iniciar junto com o Windows'
Unregister-ScheduledTask -TaskName $tarefa -Confirm:$false -ErrorAction SilentlyContinue
$arg = '-NoProfile -WindowStyle Hidden -Command "& ''{0}'' ''{1}\src\server.js''"' -f $node, $dest
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg -WorkingDirectory $dest
$usr = $env:USERDOMAIN + '\' + $env:USERNAME
$gat = New-ScheduledTaskTrigger -AtLogOn -User $usr
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $tarefa -Action $acao -Trigger $gat -Settings $set -User $usr -RunLevel Limited | Out-Null
Start-ScheduledTask -TaskName $tarefa
Ok ('Tarefa "' + $tarefa + '" criada para ' + $usr)

Passo 5 'Verificando'
$resp = $null
for ($i = 0; $i -lt 10 -and -not $resp; $i++) { Start-Sleep -Seconds 1; try { $resp = Invoke-RestMethod -Uri 'http://127.0.0.1:9101/status' -Headers @{ 'X-Agente' = 'paes' } } catch { } }
if (-not $resp) { throw 'O agente nao respondeu em 127.0.0.1:9101. Veja a tarefa PaesAgenteImpressao no Agendador de Tarefas.' }
Ok ('Agente no ar (versao ' + $resp.versao + ')')
Linha ''
Linha '  Pronto! Agora cadastre as impressoras na pagina que vai abrir' Green
Linha '  (http://127.0.0.1:9101) e depois escolha o destino de cada' Green
Linha '  documento em Ferramentas > Configurar impressoras.' Green
Start-Process 'http://127.0.0.1:9101'
} catch {
  Linha ''
  Linha '  [ FALHOU ] ' Red
  Linha ('  ' + $_.Exception.Message) Red
  Linha ''
  Linha '  Anote a mensagem acima e envie ao suporte.' DarkGray
}
`;

/** .bat auto-elevável com o PowerShell embutido depois do marcador. modo: 'instalar' | 'remover'. */
export function instaladorBat(site, modo = 'instalar', pac = pacote()) {
  if (!/^https?:\/\/[A-Za-z0-9.:\-]+$/.test(site)) throw new Error('Endereço do sistema inválido.');
  // o pacote vai dentro do .bat (here-string em base64): a instalação não depende de rede até o sistema
  const pacB64 = Buffer.from(JSON.stringify(pac)).toString('base64');
  const pedacos = pacB64.match(/.{1,3000}/g).map((x) => `'${x}'`).join(',\r\n');
  const ps = `$PACOTE = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String((@(${pedacos}) -join '')))\r\n${PS.replace('@@SITE@@', site).replace('@@MODO@@', modo)}`;
  const bat = [
    '@echo off', 'chcp 65001 >nul',
    'net session >nul 2>&1 || (powershell -NoProfile -Command "Start-Process -FilePath \'%~f0\' -Verb RunAs" & exit /b)',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "$t = Get-Content -LiteralPath \'%~f0\' -Raw -Encoding UTF8; Invoke-Expression ($t.Substring($t.IndexOf(\'#PS#\' + \'BEGIN\') + 9))"',
    'echo.', 'pause', 'exit /b', `#PS#BEGIN${ps}`,
  ];
  return bat.join('\r\n').replace(/\r?\n/g, '\r\n');
}

/** Endereço público do sistema, como o navegador o vê (proxy/túnel incluídos). */
export function enderecoSite(req) {
  const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol).split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim();
  return `${proto}://${host}`;
}
