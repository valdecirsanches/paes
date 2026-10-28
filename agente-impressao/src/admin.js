import { ipsDaMaquina } from './config.js';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Página de administração do agente (aberta em http://127.0.0.1:PORTA nesta máquina). */
export function paginaAdmin(cfg, arquivo, IPS = ipsDaMaquina()) {
  const linhas = Object.entries(cfg.destinos).map(([n, d]) => `<tr><td>${esc(n)}</td><td>${esc(d.tipo)}</td><td>${esc(d.impressora ?? (d.host ? `${d.host}:${d.porta}` : `${d.com} ${d.baud}`))}</td><td>${esc(d.linguagem)}</td><td>${esc(d.dpi ?? '')}</td><td>${esc(d.largura_mm ?? '')}×${esc(d.altura_mm ?? '')}</td>
    <td><button data-testar="${esc(n)}">Testar</button> <button data-edit="${esc(n)}">Editar</button> <button data-del="${esc(n)}">Excluir</button></td></tr>`).join('')
    + Object.entries(cfg.invalidos ?? {}).map(([n, v]) => `<tr class="inv"><td>${esc(n)}</td><td colspan="5">⚠ Destino inválido, guardado sem uso: ${esc(v.motivo)}</td><td><button data-edit="${esc(n)}">Corrigir</button> <button data-del="${esc(n)}">Excluir</button></td></tr>`).join('');
  const dados = JSON.stringify({ ...Object.fromEntries(Object.entries(cfg.invalidos ?? {}).map(([n, v]) => [n, v.bruto])), ...cfg.destinos }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Agente de impressão</title>
<style>body{font:14px Segoe UI,Arial;margin:24px;max-width:980px;color:#12385f}h1{font-size:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #b6d3ef;padding:6px 8px;text-align:left}
th{background:#e3eef9}fieldset{border:1px solid #b6d3ef;margin:16px 0;padding:12px}label{display:inline-block;margin:4px 12px 4px 0}input,select{padding:4px}button{padding:5px 12px;cursor:pointer}#msg,#msg2{margin:10px 0;font-weight:600}#msg2{padding:6px 0}.inv td{background:#fff3d6}.ok{color:#176b36}.er{color:#a3150b}small{color:#557}</style>
<h1>Agente de impressão — destinos desta estação</h1>
<p><small>Arquivo: ${esc(arquivo)} · Porta ${cfg.porta}. Só quem usa este computador altera esta página.</small></p><div id="msg"></div>
<table><thead><tr><th>Nome</th><th>Tipo</th><th>Impressora / endereço</th><th>Linguagem</th><th>DPI</th><th>Etiqueta (mm)</th><th></th></tr></thead><tbody>${linhas || '<tr><td colspan="7">Nenhum destino cadastrado.</td></tr>'}</tbody></table>
<fieldset><legend id="leg">Novo destino</legend>
<label>Modelo pronto <select id="modelo"><option value="">(manual)</option><option value="ql">Brother QL-800 / QL-8xx (62 mm, driver do Windows)</option></select></label><br>
<label>Nome <input id="nome" placeholder="Etiqueta expedição" maxlength="60"></label>
<label>Tipo <select id="tipo"><option value="windows">Impressora do Windows</option><option value="rede">Rede (IP:9100)</option><option value="serial">Porta serial (COM)</option></select></label>
<label>Linguagem <select id="linguagem"><option value="imagem-driver">Imagem pelo driver do Windows</option><option value="escpos">ESC/POS (cupom)</option><option value="zpl">ZPL (Zebra)</option><option value="tspl">TSPL (TSC/Elgin/Gprinter)</option></select></label><br>
<label id="l-imp">Impressora <select id="impressora"></select></label>
<label id="l-host">IP/host <input id="host" placeholder="192.168.15.50"></label><label id="l-porta">Porta <input id="porta" value="9100" size="5"></label>
<label id="l-com">COM <input id="com" placeholder="COM3" size="6"></label><label id="l-baud">Baud <input id="baud" value="9600" size="6"></label><br>
<label>DPI <input id="dpi" value="203" size="4"></label><label>Largura (mm) <input id="largura" value="62" size="4"></label><label>Altura (mm) <input id="altura" value="45" size="4"></label><label><input type="checkbox" id="cortar"> Cortar após imprimir (ESC/POS)</label><label><input type="checkbox" id="invertido" checked> TSPL: inverter bits (se a etiqueta sair em negativo, desmarque)</label><br>
<button id="salvar">Salvar destino</button> <button id="cancela-edicao" hidden>Cancelar edição</button><div id="msg2" role="status"></div></fieldset>
<fieldset><legend>Acesso pela rede — servidor do sistema em outro computador (ex.: Linux)</legend>
<label><input type="checkbox" id="rede-on" ${cfg.escuta === '0.0.0.0' ? 'checked' : ''}> Permitir que o servidor do sistema imprima por este agente</label><br>
<label>IP desta máquina <input id="rede-ip" size="34" readonly value="${esc(IPS.map((i) => `${i}:${cfg.porta}`).join('  ·  ') || '(não detectado)')}"></label><br>
<label>Token <input id="rede-token" size="40" value="${esc(cfg.token)}" placeholder="(será gerado ao salvar)"></label> <button id="rede-gerar" type="button">Gerar novo</button> <button id="rede-copia" type="button">Copiar IP e token</button><br>
<button id="rede-salvar" type="button">Salvar acesso pela rede</button><div id="rede-msg" role="status"></div>
<label>Firewall (Prompt de Comando como Administrador) <input id="rede-fw" size="100" readonly value="netsh advfirewall firewall add rule name=&quot;Paes Agente de Impressao&quot; dir=in action=allow protocol=TCP localport=${cfg.porta} remoteip=localsubnet"></label> <button id="rede-fw-copia" type="button">Copiar comando</button><br>
<small>No sistema web: Ferramentas › Configurar impressoras › “Servidor → agente”, informe o IP:porta e o token acima. Se o servidor não conseguir conectar, rode <b>liberar-rede.ps1</b> como Administrador (abre a porta ${cfg.porta} no firewall da rede local).</small></fieldset>
<fieldset><legend>Endereços do sistema web autorizados a imprimir aqui</legend><input id="origens" size="80" value="${esc(cfg.origens.join(', '))}"> <button id="salvar-origens">Salvar</button><br><small>Ex.: https://paes.seudominio.com.br, http://localhost:5072</small></fieldset>
<script>
const DESTINOS=${dados};let edicao=false;
const $=(i)=>document.getElementById(i);const msg=(t,ok)=>{for(const i of ['msg','msg2']){$(i).textContent=t;$(i).className=ok?'ok':'er'}if(!ok)$('msg2').scrollIntoView({block:'center',behavior:'smooth'})};
const api=async(m,u,b)=>{const f=()=>fetch(u,{method:m,headers:{'content-type':'application/json'},body:b?JSON.stringify(b):undefined});let r;try{r=await f()}catch(e){await new Promise(z=>setTimeout(z,2500));try{r=await f()}catch(e2){throw new Error('O agente não respondeu (pode estar reiniciando ou parado). Aguarde alguns segundos e atualize a página (F5); se persistir, reinicie a tarefa "Paes Agente de Impressao" no Agendador de Tarefas.')}}const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||'Erro');return j};
fetch('/api/impressoras').then(r=>r.json()).then(l=>{$('impressora').innerHTML=l.map(p=>'<option>'+p.nome.replace(/[<&]/g,'')+'</option>').join('')||'<option value="">(nenhuma encontrada — digite no campo abaixo)</option>'});
const mostra=()=>{/* todos os campos de conexão ficam visíveis e são gravados, qualquer que seja o tipo */};$('tipo').onchange=mostra;mostra();
$('modelo').onchange=()=>{if($('modelo').value==='ql'){$('tipo').value='windows';mostra();$('linguagem').value='imagem-driver';$('dpi').value=300;$('largura').value=62;$('altura').value=45;$('cortar').checked=false;const o=[...$('impressora').options].find(x=>/QL-?8/i.test(x.text));if(o)$('impressora').value=o.value;if(!$('nome').value)$('nome').value='Etiqueta adesiva'}};
$('salvar').onclick=async()=>{const bt=$('salvar');bt.disabled=true;try{await api('POST','/api/destinos',{edicao,nome:$('nome').value,tipo:$('tipo').value,linguagem:$('linguagem').value,impressora:$('impressora').value,host:$('host').value,porta:$('porta').value,com:$('com').value,baud:$('baud').value,dpi:$('dpi').value,largura_mm:$('largura').value,altura_mm:$('altura').value,cortar:$('cortar').checked,invertido:$('invertido').checked});msg('✔ Salvo.',true);setTimeout(()=>location.reload(),700)}catch(e){msg('NÃO SALVO: '+e.message,false);bt.disabled=false}};
const rmsg=(t,ok)=>{$('rede-msg').textContent=t;$('rede-msg').className=ok?'ok':'er'};
$('rede-gerar').onclick=()=>{const b=new Uint8Array(24);crypto.getRandomValues(b);$('rede-token').value=btoa(String.fromCharCode(...b)).replace(/[+/=]/g,c=>({'+':'a','/':'b','=':''}[c]))};
$('rede-copia').onclick=()=>{const t=$('rede-ip').value.split(' ')[0]+'\\n'+$('rede-token').value;navigator.clipboard?.writeText(t).then(()=>rmsg('Copiado: IP:porta e token.',true)).catch(()=>rmsg('Não consegui copiar; selecione e copie manualmente.',false))};
$('rede-fw-copia').onclick=()=>{$('rede-fw').select();navigator.clipboard?.writeText($('rede-fw').value).then(()=>rmsg('Comando copiado: cole no Prompt de Comando (Administrador).',true)).catch(()=>document.execCommand('copy'))};
$('rede-salvar').onclick=async()=>{try{const j=await api('POST','/api/rede',{permitir:$('rede-on').checked,token:$('rede-token').value});$('rede-token').value=j.token;rmsg(j.escuta==='0.0.0.0'?'✔ Salvo e ativo. Use '+(j.ips[0]||'o IP desta máquina')+':'+j.porta+' e o token acima no sistema.':'✔ Salvo: acesso pela rede desligado (só este computador).',true)}catch(e){rmsg('NÃO SALVO: '+e.message,false)}};
$('salvar-origens').onclick=async()=>{try{await api('POST','/api/origens',{origens:$('origens').value.split(',').map(s=>s.trim()).filter(Boolean)});msg('Origens salvas.',true)}catch(e){msg(e.message,false)}};
document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(confirm('Excluir o destino '+b.dataset.del+'?')){await api('DELETE','/api/destinos/'+encodeURIComponent(b.dataset.del));location.reload()}});
const campo=(i,v)=>{if($(i)&&v!==undefined&&v!==null)$(i).value=v};
document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const n=b.dataset.edit,d=DESTINOS[n]||{};edicao=true;$('leg').textContent='Editando: '+n;$('nome').value=n;$('nome').readOnly=true;
 campo('tipo',d.tipo||'windows');mostra();campo('linguagem',d.linguagem||'imagem-driver');campo('host',d.host);campo('porta',d.porta||9100);campo('com',d.com);campo('baud',d.baud||9600);
 campo('dpi',d.dpi||203);campo('largura',d.largura_mm||62);campo('altura',d.altura_mm||45);$('cortar').checked=!!d.cortar;$('invertido').checked=d.invertido!==false;
 if(d.impressora){const o=[...$('impressora').options].find(x=>x.value===d.impressora||x.text===d.impressora);if(o)$('impressora').value=o.value;else{const x=document.createElement('option');x.textContent=d.impressora;$('impressora').appendChild(x);$('impressora').value=d.impressora}}
 $('cancela-edicao').hidden=false;$('salvar').textContent='Salvar alterações';scrollTo(0,document.body.scrollHeight)});
$('cancela-edicao').onclick=()=>location.reload();
document.querySelectorAll('[data-testar]').forEach(b=>b.onclick=async()=>{try{await api('POST','/api/testar',{destino:b.dataset.testar});msg('Teste enviado.',true)}catch(e){msg(e.message,false)}});
</script></html>`;
}
