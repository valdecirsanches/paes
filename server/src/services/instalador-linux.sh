#!/usr/bin/env bash
# Instalador do agente de impressao (Ubuntu/Debian) - WinBakery
set -euo pipefail
SITE='@@SITE@@'
TOKEN='@@TOKEN@@'
MODO='@@MODO@@'
DEST=/opt/paes-agente-impressao
CFGDIR=/etc/paes-agente-impressao
UNIT=/etc/systemd/system/paes-agente-impressao.service
if [ "$(id -u)" -ne 0 ]; then exec sudo -E bash "$0" "$@"; fi
USUARIO="${SUDO_USER:-root}"
ok() { echo "        [ OK ] $1"; }
passo() { echo; echo "  [$1/5] $2"; }
if [ "$MODO" = "remover" ]; then
  systemctl disable --now paes-agente-impressao 2>/dev/null || true
  rm -f "$UNIT"; systemctl daemon-reload; rm -rf "$DEST"
  ok "Agente removido (a configuracao das impressoras foi mantida em $CFGDIR)"; exit 0
fi
echo; echo "  WinBakery - Agente de impressao (Linux)"
passo 1 "Node.js e CUPS"
export DEBIAN_FRONTEND=noninteractive
NV=0; if command -v node >/dev/null 2>&1; then NV=$(node -v | sed 's/^v//; s/\..*//'); fi
if [ "$NV" -lt 20 ]; then
  apt-get update -y >/dev/null; apt-get install -y curl ca-certificates >/dev/null
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y nodejs >/dev/null
fi
command -v lp >/dev/null 2>&1 || apt-get install -y cups cups-client >/dev/null
# impressoras compartilhadas por Windows (SMB): smbclient + backend smb do CUPS; o usuario do servico precisa do grupo lpadmin para criar filas
apt-get install -y smbclient >/dev/null 2>&1 || true
[ -e /usr/lib/cups/backend/smb ] || { command -v smbspool >/dev/null 2>&1 && ln -s "$(command -v smbspool)" /usr/lib/cups/backend/smb || true; }
[ "$USUARIO" != "root" ] && usermod -aG lpadmin "$USUARIO" 2>/dev/null || true
ok "Node.js $(node -v) e CUPS ($(lp -v 2>&1 | head -1 || true))"
passo 2 "Gravando o agente"
systemctl stop paes-agente-impressao 2>/dev/null || true
mkdir -p "$DEST"
base64 -d <<'PACOTE_FIM' | node -e '
const fs=require("fs"),path=require("path");const p=JSON.parse(fs.readFileSync(0,"utf8"));
for(const [f,b] of Object.entries(p.arquivos)){const a=path.join(process.argv[1],f);fs.mkdirSync(path.dirname(a),{recursive:true});fs.writeFileSync(a,Buffer.from(b,"base64"));}
console.log("        versao "+p.versao);' "$DEST"
@@PACOTE@@
PACOTE_FIM
ok "Agente em $DEST"
passo 3 "Conectando ao sistema"
mkdir -p "$CFGDIR"; chown -R "$USUARIO" "$CFGDIR"
node -e '
const fs=require("fs");const [arq,site,token]=process.argv.slice(1);let c={};try{c=JSON.parse(fs.readFileSync(arq,"utf8").replace(/^﻿/,""));}catch{}
c.porta=c.porta||9101;c.destinos=c.destinos||{};c.origens=[...new Set([...(c.origens||[]),site,"http://localhost:5072","http://127.0.0.1:5072"])];
if(token){c.sistema_url=site;c.sistema_token=token;}delete c.escuta;delete c.token;
fs.writeFileSync(arq,JSON.stringify(c,null,2));' "$CFGDIR/config.json" "$SITE" "$TOKEN"
chown "$USUARIO" "$CFGDIR/config.json"
ok "Origem permitida: $SITE"
[ -n "$TOKEN" ] && ok "Agente pareado com o sistema (atende todos os computadores)" || ok "Agente so para este computador"
passo 4 "Iniciar junto com o sistema operacional"
cat > "$UNIT" <<UNIDADE
[Unit]
Description=Agente de impressao WinBakery
After=network-online.target cups.service
Wants=network-online.target
[Service]
User=$USUARIO
Environment=AGENTE_CONFIG=$CFGDIR/config.json
ExecStart=$(command -v node) $DEST/src/server.js
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIDADE
systemctl daemon-reload; systemctl enable --now paes-agente-impressao >/dev/null 2>&1
ok "Servico paes-agente-impressao criado (usuario $USUARIO)"
passo 5 "Verificando"
R=""; for i in $(seq 1 10); do R=$(curl -fs -H 'X-Agente: paes' http://127.0.0.1:9101/status 2>/dev/null || true); [ -n "$R" ] && break; sleep 1; done
[ -n "$R" ] || { echo "  [ FALHOU ] o agente nao respondeu em 127.0.0.1:9101. Veja: journalctl -u paes-agente-impressao -n 30"; exit 1; }
ok "Agente no ar: $R"
echo; echo "  Pronto! Cadastre as impressoras em http://127.0.0.1:9101 (Tipo: Impressora do Linux - CUPS)"
echo "  e escolha o destino de cada documento em Ferramentas > Configurar impressoras."
