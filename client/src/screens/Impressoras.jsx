import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { DOCS, AGENTE, destinosAgente, gravarMapa, lerMapa, statusAgente, testarDestino } from '../lib/impressora.js';
import { mensagem } from '../components/toast.jsx';
import EditorEtiqueta from '../components/EditorEtiqueta.jsx';
import { temAjuste } from '../lib/ajustes.js';

const PASSOS = [
  ['Baixe o instalador', 'Clique no botão abaixo e abra o arquivo baixado. Aceite o aviso de administrador do Windows.'],
  ['Aguarde a instalação', 'Ele instala o Node.js (se faltar), o agente, a inicialização automática e libera este sistema.'],
  ['Cadastre as impressoras', 'Na página que abrir, informe cada impressora (Windows, IP ou serial) e use Teste.'],
  ['Escolha o destino', 'Volte em Ferramentas › Configurar impressoras e associe cada documento a uma impressora.'],
];

/** Passo a passo + download do instalador (.bat) que instala Node.js, o agente e a inicialização automática. */
export function CaixaInstalar() {
  return (
    <section className="imp-card imp-inst">
      <header><span className="imp-ico" aria-hidden="true">⬇️</span><div><h3>Instalar o agente neste computador</h3><p>Windows 10/11 · precisa de internet e permissão de administrador</p></div></header>
      <ol className="imp-passos">
        {PASSOS.map(([t, d], i) => <li key={t}><span className="imp-n">{i + 1}</span><div><b>{t}</b><span>{d}</span></div></li>)}
      </ol>
      <div className="imp-acoes">
        <a className="imp-btn principal" href="/api/agente/instalador.bat" download>⬇ Baixar instalador</a>
        <a className="imp-btn" href="/api/agente/remover.bat" download>Remover agente</a>
      </div>
      <p className="imp-nota">Rodar o instalador de novo atualiza o agente e mantém as impressoras já cadastradas.</p>
    </section>
  );
}


/** Endereço (IP:porta) e token do agente que o SERVIDOR usa (acesso pelo Linux). Gravado no servidor, vale para todas as estações. */
function PonteServidor({ onMudou }) {
  const [cfg, setCfg] = useState(null);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [res, setRes] = useState(null); // { ok, m }
  useEffect(() => { api.get('/impressao/config').then((c) => { setCfg(c); setUrl(c.url ?? ''); }).catch((e) => setRes({ ok: false, m: e.message })); }, []);
  const salvar = async (e) => {
    e?.preventDefault(); setRes(null);
    if (!url.trim()) { setRes({ ok: false, m: 'Informe o IP:porta do agente (ex.: 192.168.15.10:9101).' }); return; }
    if (!cfg?.tem_token && !token.trim()) { setRes({ ok: false, m: 'Falta o token: na página do agente (127.0.0.1:9101 no Windows) marque “Permitir…”, clique em “Salvar acesso pela rede” e copie o token gerado.' }); return; }
    setOcupado('s');
    try {
      const c = await api.put('/impressao/config', { url, token });
      setCfg(c); setUrl(c.url ?? ''); setToken('');
      try { const st = await api.get('/impressao/status'); setRes({ ok: true, m: `✔ Salvo e conectado ao agente (v${st.versao}, ${st.destinos} impressora(s)).` }); onMudou?.(); }
      catch (er) { setRes({ ok: false, m: `Salvo, mas sem conexão com o agente: ${er.message}` }); }
    } catch (er) { setRes({ ok: false, m: `NÃO SALVO: ${er.message}` }); } finally { setOcupado(''); }
  };
  return (
    <section className="imp-card">
      <header><span className="imp-ico" aria-hidden="true">🌐</span><div><h3>Servidor → agente (acesso pelo Linux)</h3>
        <p>Quando o sistema roda no Linux e a impressora está no Windows: informe o IP do Windows e o token mostrado na página do agente (“Acesso pela rede”). Vale para todos os computadores.</p></div>
        {cfg && <span className={`imp-selo ${cfg.url && cfg.tem_token ? 'ok' : 'off'}`}><i />{cfg.url && cfg.tem_token ? 'Configurado' : 'Não configurado'}</span>}</header>
      <form className="imp-ponte" onSubmit={salvar}>
        <label>IP:porta do agente<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="192.168.15.10:9101" autoComplete="off" /></label>
        <label>Token<input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={cfg?.tem_token ? '(gravado — deixe em branco para manter)' : 'cole o token do agente'} autoComplete="new-password" /></label>
        <button type="submit" className="imp-btn principal" disabled={!!ocupado}>{ocupado ? 'Salvando…' : '💾 Salvar e testar'}</button>
      </form>
      {cfg?.origem === 'env' && <p className="imp-nota">Valores atuais vindos do <code>server/.env</code> (AGENTE_URL/AGENTE_TOKEN). Ao salvar aqui, passam a valer estes.</p>}
      {/:9100\/?$/.test(url.trim()) && <p className="imp-nota er">A porta do agente é 9101 (9100 é a porta de impressoras de rede).</p>}
      {res && <p className={`imp-nota ${res.ok ? 'ok' : 'er'}`} role="status">{res.m}</p>}
    </section>
  );
}

/** Ferramentas > Configurar impressoras: liga cada tipo de documento a um destino do agente (por estação). */
export default function Impressoras() {
  const [agente, setAgente] = useState(null); // null = verificando · false = fora do ar · objeto = ok
  const [destinos, setDestinos] = useState([]);
  const [mapa, setMapa] = useState(lerMapa());
  const [ocupado, setOcupado] = useState('');
  const [editor, setEditor] = useState(null);
  const fechaEditor = useCallback(() => { setEditor(null); setMapa(lerMapa()); }, []);

  const verificar = useCallback(async () => {
    setAgente(null); window.dispatchEvent(new Event('impressoras-alteradas'));
    try { const s = await statusAgente(); setAgente(s); setDestinos(await destinosAgente()); } catch { setAgente(false); setDestinos([]); }
  }, []);
  useEffect(() => { verificar(); }, [verificar]);

  const muda = (tipo, campo, valor) => {
    const n = { ...mapa, [tipo]: { ...mapa[tipo], [campo]: valor } };
    if (!n[tipo].destino) delete n[tipo];
    setMapa(n); gravarMapa(n); window.dispatchEvent(new Event('impressoras-alteradas'));
  };
  const testar = async (tipo, nome) => {
    setOcupado(tipo);
    try { await testarDestino(nome); mensagem('ok', `Teste enviado para "${nome}".`); } catch (e) { mensagem('erro', e.message); } finally { setOcupado(''); }
  };

  const estado = agente === null ? ['verif', 'Verificando…'] : agente ? ['ok', 'Agente conectado'] : ['off', 'Agente não encontrado'];
  return (
    <div className="imp-tela">
      <section className="imp-card">
        <header>
          <span className="imp-ico" aria-hidden="true">🖨️</span>
          <div><h3>{agente?.via === 'servidor' ? 'Agente de impressão (via servidor)' : 'Agente de impressão desta estação'}</h3>
            <p>{agente ? `Versão ${agente.versao} · ${agente.plataforma} · ${agente.destinos} impressora(s) cadastrada(s)${agente.via === 'servidor' ? ' · acessado pelo servidor, não por este computador' : ''}` : agente === false ? `Nada respondendo em ${AGENTE} nem pela ponte do servidor (veja “Servidor → agente” abaixo). Enquanto isso tudo imprime pelo navegador.` : 'Procurando o agente…'}</p></div>
          <span className={`imp-selo ${estado[0]}`}><i />{estado[1]}</span>
        </header>
        <div className="imp-acoes">
          <button type="button" className="imp-btn" onClick={verificar}>↻ Verificar novamente</button>
          {agente && agente.via !== 'servidor' && <a className="imp-btn" href={AGENTE} target="_blank" rel="noreferrer">⚙ Cadastrar / editar impressoras</a>}
        </div>
      </section>

      <PonteServidor onMudou={verificar} />

      {agente === false && <CaixaInstalar />}

      <section className="imp-card">
        <header><span className="imp-ico" aria-hidden="true">📄</span><div><h3>Onde imprimir cada documento</h3><p>Vale só para este computador</p></div></header>
        <div className="imp-lista">
          {Object.entries(DOCS).map(([tipo, d]) => {
            const c = mapa[tipo] ?? {};
            const dest = destinos.find((x) => x.nome === c.destino);
            return (
              <div className="imp-linha" key={tipo}>
                <div className="imp-doc"><b>{d.rotulo}</b><small>{d.etiqueta ? `Etiqueta ${d.mm[0]} × ${d.mm[1]} mm` : d.pagina ? 'Página A4 (impressora do Windows, imagem pelo driver)' : 'Cupom de texto'}</small></div>
                <select value={c.destino ?? ''} disabled={agente === false && !c.destino} onChange={(e) => muda(tipo, 'destino', e.target.value)} aria-label={`Destino de ${d.rotulo}`}>
                  <option value="">Navegador (diálogo de impressão)</option>
                  {destinos.map((x) => <option key={x.nome} value={x.nome}>{x.nome} — {x.linguagem}</option>)}
                  {c.destino && !dest && <option value={c.destino}>{c.destino} (não encontrado)</option>}
                </select>
                <label className="imp-cop">Cópias<input type="number" min="1" max="99" value={c.copias ?? 1} disabled={!c.destino} onChange={(e) => muda(tipo, 'copias', Math.max(1, Math.min(99, Number(e.target.value) || 1)))} /></label>
                {d.etiqueta && <label className="imp-cop" title="Altura da página = passo entre etiquetas. Se cada etiqueta sair mais abaixo que a anterior, diminua; se sair cortada/apertada, aumente.">Altura mm<input type="number" min="20" max="100" step="0.5" placeholder={String(d.mm[1])} value={c.altura ?? ''} disabled={!c.destino} onChange={(e) => muda(tipo, 'altura', e.target.value === '' ? undefined : Number(e.target.value))} /></label>}
                {d.etiqueta && <button type="button" className="imp-btn ajuste" onClick={() => setEditor(tipo)} title="Ajustar posições, fontes e altura em milímetros">📐 Editor{temAjuste(tipo) ? ' ●' : ''}</button>}
                <button type="button" className="imp-btn" disabled={!c.destino || !!ocupado} onClick={() => testar(tipo, c.destino)}>{ocupado === tipo ? 'Enviando…' : 'Teste'}</button>
              </div>
            );
          })}
        </div>
        <p className="imp-nota">Se o agente estiver fora do ar, a impressão cai automaticamente no navegador.</p>
      </section>
      {editor && <EditorEtiqueta tipo={editor} onFechar={fechaEditor} />}
    </div>
  );
}
