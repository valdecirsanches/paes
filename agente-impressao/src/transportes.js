import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const PS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass'];

/** Rede: envia os bytes para host:porta (JetDirect/9100). */
export function enviaRede({ host, porta }, bytes, { timeoutMs = 8000 } = {}) {
  return new Promise((ok, falha) => {
    const s = net.connect({ host, port: porta });
    const t = setTimeout(() => { s.destroy(); falha(new Error(`Sem resposta de ${host}:${porta}.`)); }, timeoutMs);
    s.on('error', (e) => { clearTimeout(t); falha(new Error(`Falha na impressora de rede ${host}:${porta}: ${e.code ?? e.message}`)); });
    s.on('connect', () => s.end(Buffer.from(bytes), () => { clearTimeout(t); ok(); }));
  });
}

// ---- Windows (PowerShell). Os parâmetros vão como argumentos, nunca concatenados no script. ----
export const PS_RAW = String.raw`param([string]$Impressora,[string]$Arquivo)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class RawPrn {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)] public class DOCINFOA { [MarshalAs(UnmanagedType.LPStr)] public string pDocName; [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPStr)] public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)] public static extern bool StartDocPrinter(IntPtr h, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true)] public static extern bool WritePrinter(IntPtr h, IntPtr b, Int32 c, out Int32 w);
  public static void Send(string printer, byte[] bytes) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("Impressora não encontrada: " + printer);
    DOCINFOA di = new DOCINFOA(); di.pDocName = "Sistema Paes"; di.pDataType = "RAW";
    try {
      if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter falhou");
      if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter falhou");
      IntPtr p = Marshal.AllocCoTaskMem(bytes.Length); Marshal.Copy(bytes, 0, p, bytes.Length);
      int w; bool ok = WritePrinter(h, p, bytes.Length, out w); Marshal.FreeCoTaskMem(p);
      EndPagePrinter(h); EndDocPrinter(h);
      if (!ok || w != bytes.Length) throw new Exception("WritePrinter falhou");
    } finally { ClosePrinter(h); }
  }
}
"@
[RawPrn]::Send($Impressora,[System.IO.File]::ReadAllBytes($Arquivo))
`;

export const PS_PNG = String.raw`param([string]$Impressora,[string]$Pasta,[double]$LarguraMm,[double]$AlturaMm,[int]$Copias=1)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
# Um trabalho só, uma página (= uma etiqueta) por PNG da pasta, em ordem: a Brother QL corta a cada página e não repete a margem de início de trabalho.
$imgs=@(Get-ChildItem -LiteralPath $Pasta -Filter *.png | Sort-Object Name | ForEach-Object { [System.Drawing.Image]::FromFile($_.FullName) })
try {
  $pd=New-Object System.Drawing.Printing.PrintDocument
  $pd.PrinterSettings.PrinterName=$Impressora
  if(-not $pd.PrinterSettings.IsValid){ throw "Impressora não encontrada: $Impressora" }
  $pd.PrinterSettings.Copies=[int16]$Copias
  $w=[int][math]::Round($LarguraMm/25.4*100); $h=[int][math]::Round($AlturaMm/25.4*100)
  # prefere um papel que o driver já tenha com este tamanho (ex.: "62mm x 45mm" da Brother); senão cria um personalizado
  $papel=$null
  foreach($p in $pd.PrinterSettings.PaperSizes){ if([math]::Abs($p.Width-$w) -le 3 -and [math]::Abs($p.Height-$h) -le 3){ $papel=$p; break } }
  # rolo contínuo (Brother QL): o driver tem um papel só pela largura (ex.: "62mm"); usa-o com o comprimento da etiqueta.
  # Sem isso o Windows cai no papel padrão do driver (29mm x 90mm) e a impressora acusa "o rolo não corresponde ao selecionado".
  if(-not $papel){
    $lw=[int][math]::Round($LarguraMm)
    foreach($p in $pd.PrinterSettings.PaperSizes){
      if([math]::Abs($p.Width-$w) -le 4 -and ($p.PaperName -match ('(?i)^\s*'+$lw+'\s*mm\s*$') -or $p.PaperName -match '(?i)continu|cont[ií]nu|endless')){
        $papel=New-Object System.Drawing.Printing.PaperSize($p.PaperName,$p.Width,$h); $papel.RawKind=$p.RawKind; break
      }
    }
  }
  if(-not $papel){ $papel=New-Object System.Drawing.Printing.PaperSize('Etiqueta',$w,$h) }
  $pd.DefaultPageSettings.PaperSize=$papel
  $pd.DefaultPageSettings.Margins=New-Object System.Drawing.Printing.Margins(0,0,0,0)
  $pd.OriginAtMargins=$false
  $script:i=0
  $pd.add_PrintPage({ param($s,$e) $e.Graphics.PageUnit=[System.Drawing.GraphicsUnit]::Display; $e.Graphics.InterpolationMode='HighQualityBicubic'; $e.Graphics.DrawImage($imgs[$script:i],0,0,$w,$h); $script:i++; $e.HasMorePages=($script:i -lt $imgs.Count) })
  # remove da fila trabalhos NOSSOS que ficaram travados antes (ex.: rolo diferente do papel) para não bloquear esta impressão
  $pref='PaesEtiqueta-'
  try { Get-PrintJob -PrinterName $Impressora -ErrorAction Stop | Where-Object { $_.DocumentName -like ($pref+'*') -and [string]$_.JobStatus -match 'Error|Offline|Paper|UserIntervention|Blocked' } | Remove-PrintJob -ErrorAction SilentlyContinue } catch {}
  $nome=$pref+[guid]::NewGuid().ToString('N').Substring(0,8)
  $pd.DocumentName=$nome
  $pd.Print()
  # acompanha o trabalho na fila: se a impressora o recusar (rolo diferente do configurado, sem papel, tampa aberta...) ou não concluir, remove-o e avisa em vez de deixar travado em silêncio
  $limite=(Get-Date).AddSeconds(15+4*$imgs.Count); $falha=$null; $achou=$false
  Start-Sleep -Milliseconds 700
  while((Get-Date) -lt $limite){
    $j=$null; try { $j=@(Get-PrintJob -PrinterName $Impressora -ErrorAction Stop | Where-Object { $_.DocumentName -eq $nome }) } catch { break } # sem o módulo de impressão: não dá para acompanhar
    if($j.Count -eq 0){ break }
    $achou=$true; $st=[string]$j[0].JobStatus
    if($st -match 'Error|Offline|Paper|UserIntervention|Blocked'){ $falha=$st; break }
    Start-Sleep -Milliseconds 600
  }
  if($achou -and -not $falha -and (Get-Date) -ge $limite){ $falha='não concluiu no tempo esperado' }
  if($falha){
    try { Get-PrintJob -PrinterName $Impressora -ErrorAction Stop | Where-Object { $_.DocumentName -eq $nome } | Remove-PrintJob -ErrorAction SilentlyContinue } catch {}
    $ps=''; try { $ps=[string](Get-Printer -Name $Impressora -ErrorAction Stop).PrinterStatus } catch {}
    throw ("A impressora não aceitou a etiqueta ("+$falha+$(if($ps){'; situação: '+$ps})+"). Confira se o rolo carregado é o mesmo configurado (ex.: 62 mm contínuo), se há etiquetas e se a tampa está fechada. O trabalho foi removido da fila.")
  }
} finally { foreach($im in $imgs){ $im.Dispose() } }
`;

export const PS_SERIAL = String.raw`param([string]$Porta,[int]$Baud,[string]$Arquivo)
$ErrorActionPreference='Stop'
$b=[System.IO.File]::ReadAllBytes($Arquivo)
$p=New-Object System.IO.Ports.SerialPort $Porta,$Baud,'None',8,'One'
$p.WriteTimeout=8000
$p.Open(); try { $p.Write($b,0,$b.Length) } finally { $p.Close() }
`;

export const PS_PAPEIS = String.raw`param([string]$Impressora)
Add-Type -AssemblyName System.Drawing
$pd=New-Object System.Drawing.Printing.PrintDocument; $pd.PrinterSettings.PrinterName=$Impressora
$pd.PrinterSettings.PaperSizes | ForEach-Object { [pscustomobject]@{nome=$_.PaperName;larguraMm=[math]::Round($_.Width*25.4/100,1);alturaMm=[math]::Round($_.Height*25.4/100,1);tipo=$_.RawKind} } | ConvertTo-Json -Compress
`;

export const PS_LISTA = `Get-CimInstance Win32_Printer | Select-Object Name,DriverName,PortName,Default | ConvertTo-Json -Compress`;

async function comTemporarios(arquivos, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paes-ag-'));
  try { return await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
async function rodaPs(dir, nomeScript, conteudo, args) {
  const script = path.join(dir, nomeScript);
  fs.writeFileSync(script, `\ufeff${conteudo}`, 'utf8'); // BOM: o PowerShell 5 lê UTF-8 com acentos
  try { return await exec('powershell.exe', [...PS, '-File', script, ...args], { timeout: 90000, windowsHide: true }); } catch (e) {
    throw new Error(String(e.stderr || e.message).split('\n').find((l) => l.trim()) ?? 'Falha ao imprimir pelo Windows.');
  }
}
const soWindows = () => { if (process.platform !== 'win32') throw new Error('Este tipo de destino só funciona no Windows.'); };

export async function enviaWindowsRaw({ impressora }, bytes) {
  soWindows();
  return comTemporarios(null, async (dir) => { const f = path.join(dir, 'dados.bin'); fs.writeFileSync(f, Buffer.from(bytes)); await rodaPs(dir, 'raw.ps1', PS_RAW, ['-Impressora', impressora, '-Arquivo', f]); });
}
export async function enviaWindowsPng({ impressora }, png, { larguraMm, alturaMm, copias = 1 }) {
  soWindows();
  const lista = Array.isArray(png) ? png : [png];
  return comTemporarios(null, async (dir) => {
    const pasta = path.join(dir, 'paginas'); fs.mkdirSync(pasta);
    lista.forEach((b, i) => fs.writeFileSync(path.join(pasta, `${String(i + 1).padStart(4, '0')}.png`), Buffer.from(b)));
    await rodaPs(dir, 'png.ps1', PS_PNG, ['-Impressora', impressora, '-Pasta', pasta, '-LarguraMm', String(larguraMm), '-AlturaMm', String(alturaMm), '-Copias', String(copias)]);
  });
}
export async function enviaSerial({ com, baud }, bytes) {
  soWindows();
  return comTemporarios(null, async (dir) => { const f = path.join(dir, 'dados.bin'); fs.writeFileSync(f, Buffer.from(bytes)); await rodaPs(dir, 'serial.ps1', PS_SERIAL, ['-Porta', com, '-Baud', String(baud), '-Arquivo', f]); });
}
export async function papeisWindows(impressora) {
  soWindows();
  return comTemporarios(null, async (dir) => {
    const { stdout } = await rodaPs(dir, 'papeis.ps1', PS_PAPEIS, ['-Impressora', impressora]);
    const j = JSON.parse(stdout || '[]'); return Array.isArray(j) ? j : [j];
  });
}
export async function listaWindows() {
  if (process.platform !== 'win32') return [];
  try {
    const { stdout } = await exec('powershell.exe', [...PS, '-Command', PS_LISTA], { timeout: 20000, windowsHide: true });
    const j = JSON.parse(stdout || '[]');
    return (Array.isArray(j) ? j : [j]).map((p) => ({ nome: p.Name, driver: p.DriverName, porta: p.PortName, padrao: !!p.Default }));
  } catch { return []; }
}
