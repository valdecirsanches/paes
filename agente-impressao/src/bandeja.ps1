# Agente de impressão na bandeja do Windows (ao lado do relógio): sem janela preta.
# Sobe o agente (node) escondido, vigia e religa se cair. Clique duplo = abrir o painel; clique direito = menu.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$mutex = New-Object Threading.Mutex($false, 'Local\PaesAgenteBandeja')
if (-not $mutex.WaitOne(0)) { exit }   # já existe uma bandeja nesta sessão

$dest = Split-Path -Parent $PSScriptRoot          # C:\PaesAgenteImpressao
$cfgDir = Join-Path $env:PROGRAMDATA 'PaesAgenteImpressao'
$porta = 9101
try { $c = (Get-Content (Join-Path $cfgDir 'config.json') -Raw -Encoding UTF8).TrimStart([char]0xFEFF) | ConvertFrom-Json; if ($c.porta) { $porta = [int]$c.porta } } catch { }
$painel = "http://127.0.0.1:$porta"
$arqLog = Join-Path $cfgDir 'agente.log'

function AchaNode {
  $n = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $n) { foreach ($p in 'C:\Program Files\nodejs\node.exe', 'C:\Program Files (x86)\nodejs\node.exe') { if (Test-Path $p) { return $p } } }
  return $n
}
function Ouvindo {
  try {
    $t = New-Object Net.Sockets.TcpClient
    $r = $t.BeginConnect('127.0.0.1', $porta, $null, $null)
    $ok = $r.AsyncWaitHandle.WaitOne(700)
    if ($ok) { $t.EndConnect($r) }
    $t.Close(); return $ok
  } catch { return $false }
}
function Inicia {
  $node = AchaNode
  if (-not $node) { return $false }
  Start-Process -FilePath $node -ArgumentList ('"{0}\src\server.js"' -f $dest) -WorkingDirectory $dest -WindowStyle Hidden
  return $true
}
function Para {
  try {
    Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
      $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
      if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $p.Id -Force }
    }
  } catch { }
}

# ícone desenhado na hora (impressora + bolinha de estado): verde = ativo, amarelo = iniciando, vermelho = parado
function NovoIcone($cor) {
  $bmp = New-Object Drawing.Bitmap 32, 32
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.FillRectangle((New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(70, 70, 80))), 4, 12, 24, 11)   # corpo
  $g.FillRectangle([Drawing.Brushes]::White, 9, 4, 14, 10)                                                       # papel de cima
  $g.FillRectangle([Drawing.Brushes]::White, 9, 19, 14, 9)                                                       # papel de baixo
  $g.DrawRectangle([Drawing.Pens]::DimGray, 9, 19, 14, 9)
  $g.FillEllipse((New-Object Drawing.SolidBrush $cor), 18, 14, 8, 8)                                             # estado
  $g.Dispose()
  $ic = [Drawing.Icon]::FromHandle($bmp.GetHicon())
  return $ic
}
$icVerde = NovoIcone ([Drawing.Color]::LimeGreen)
$icAmarelo = NovoIcone ([Drawing.Color]::Gold)
$icVermelho = NovoIcone ([Drawing.Color]::Red)

$ni = New-Object Windows.Forms.NotifyIcon
$ni.Icon = $icAmarelo
$ni.Text = 'Agente de impressão — iniciando'
$ni.Visible = $true

$menu = New-Object Windows.Forms.ContextMenuStrip
$itAbrir = $menu.Items.Add('Abrir painel (impressoras)')
$itLog = $menu.Items.Add('Ver registro (agente.log)')
$itReinicia = $menu.Items.Add('Reiniciar agente')
$null = $menu.Items.Add('-')
$itSair = $menu.Items.Add('Sair (parar o agente)')
$ni.ContextMenuStrip = $menu

$estado = @{ falhas = 0; ultimo = '' }
function Mostra($txt, $icone) {
  if ($estado.ultimo -ne $txt) { $ni.Text = $txt; $ni.Icon = $icone; $estado.ultimo = $txt }
}
$itAbrir.add_Click({ Start-Process $painel })
$ni.add_DoubleClick({ Start-Process $painel })
$itLog.add_Click({ if (Test-Path $arqLog) { Start-Process notepad.exe -ArgumentList ('"{0}"' -f $arqLog) } else { $ni.ShowBalloonTip(3000, 'Agente de impressão', 'Ainda não há registro.', 'Info') } })
$itReinicia.add_Click({ Mostra 'Agente de impressão — reiniciando' $icAmarelo; Para; Start-Sleep -Seconds 1; $null = Inicia; $estado.falhas = 0 })
$itSair.add_Click({ $timer.Stop(); Para; $ni.Visible = $false; $ni.Dispose(); [Windows.Forms.Application]::Exit() })

$timer = New-Object Windows.Forms.Timer
$timer.Interval = 5000
$timer.add_Tick({
  try {
    if (Ouvindo) { $estado.falhas = 0; Mostra 'Agente de impressão — ativo' $icVerde }
    else {
      $estado.falhas++
      if ($estado.falhas -ge 2) {   # espera ~10 s: o agente se reabre sozinho no "Reiniciar" do sistema
        if (Inicia) { Mostra 'Agente de impressão — iniciando' $icAmarelo } else { Mostra 'Agente parado — Node.js não encontrado' $icVermelho }
        $estado.falhas = 0
      } else { Mostra 'Agente de impressão — iniciando' $icAmarelo }
    }
  } catch { Mostra 'Agente de impressão — erro na bandeja' $icVermelho }
})
$timer.Start()
if (-not (Ouvindo)) { $null = Inicia }
$ni.ShowBalloonTip(3000, 'Agente de impressão', 'Rodando aqui na bandeja, ao lado do relógio.', 'Info')
[Windows.Forms.Application]::Run()
