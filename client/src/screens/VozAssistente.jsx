import { useEffect, useRef, useState } from 'react';
import { api, audioApi } from '../api.js';

const TEXTO_PADRAO = 'Olá! Eu sou o assistente do sistema. Posso explicar como usar cada tela.';

/** Ferramentas › Voz do assistente (só o administrador): escolhe a voz da ElevenLabs que narra a ajuda, ajusta e ouve antes de salvar. */
export default function VozAssistente() {
  const [cfg, setCfg] = useState(null);
  const [vozes, setVozes] = useState([]);
  const [busca, setBusca] = useState('');
  const [texto, setTexto] = useState(TEXTO_PADRAO);
  const [msg, setMsg] = useState(null); // { tipo: 'ok'|'erro', m }
  const [ocupado, setOcupado] = useState('');
  const [mudou, setMudou] = useState(false);
  const audio = useRef(null);

  useEffect(() => {
    api.get('/ajuda/voz/config').then(setCfg).catch((e) => setMsg({ tipo: 'erro', m: e.message }));
    api.get('/ajuda/voz/vozes').then(setVozes).catch((e) => setMsg({ tipo: 'erro', m: `Lista de vozes: ${e.message}` }));
    return () => { try { audio.current?.pause(); } catch { /* sem áudio */ } };
  }, []);

  const muda = (parcial) => { setCfg((c) => ({ ...c, ...parcial })); setMudou(true); setMsg(null); };
  const filtradas = vozes.filter((v) => `${v.nome} ${v.idioma} ${v.sotaque} ${v.genero} ${v.descricao}`.toLowerCase().includes(busca.toLowerCase()));
  const corpo = () => ({ voiceId: cfg.voiceId, voiceNome: cfg.voiceNome, modelo: cfg.modelo, estabilidade: cfg.estabilidade, similaridade: cfg.similaridade, velocidade: cfg.velocidade });

  const testar = async () => {
    if (!cfg?.voiceId) { setMsg({ tipo: 'erro', m: 'Escolha uma voz na lista.' }); return; }
    setOcupado('teste'); setMsg(null);
    try {
      const url = await audioApi('/ajuda/voz/teste', { ...corpo(), texto });
      try { audio.current?.pause(); } catch { /* sem áudio */ }
      audio.current = new Audio(url); await audio.current.play();
    } catch (e) { setMsg({ tipo: 'erro', m: e.message }); }
    setOcupado('');
  };
  const salvar = async () => {
    if (!cfg?.voiceId) { setMsg({ tipo: 'erro', m: 'Escolha uma voz na lista.' }); return; }
    setOcupado('salvar');
    try { const n = await api.put('/ajuda/voz/config', corpo()); setCfg((c) => ({ ...c, ...n, padraoEnv: false })); setMudou(false); setMsg({ tipo: 'ok', m: 'Voz salva. Vale para todos os usuários na próxima narração.' }); }
    catch (e) { setMsg({ tipo: 'erro', m: e.message }); }
    setOcupado('');
  };

  if (!cfg) return <section className="va"><h2>🔊 Voz do assistente</h2>{msg ? <p className="va-erro">{msg.m}</p> : <p>Carregando…</p>}</section>;
  const Barra = ({ rot, k, min, max, passo }) => ( // chamado como função (não <Barra/>) para o slider não ser recriado a cada mudança
    <label className="va-bar">{rot}: <b>{Number(cfg[k]).toFixed(2)}</b>
      <input type="range" min={min} max={max} step={passo} value={cfg[k]} onChange={(e) => muda({ [k]: Number(e.target.value) })} />
    </label>
  );
  return (
    <section className="va">
      <header><h2>🔊 Voz do assistente</h2><small>Escolha a voz que narra a ajuda (F1 / ?) para todos os usuários. Ouça antes de salvar.</small></header>
      {!cfg.chaveConfigurada && <p className="va-erro">A chave da ElevenLabs não está configurada no servidor (ELEVENLABS_API_KEY no server/.env).</p>}
      {cfg.padraoEnv && <p className="va-aviso">Voz atual vem do .env do servidor. Ao salvar aqui, esta escolha passa a valer.</p>}
      <div className="va-cols">
        <fieldset>
          <legend>Voz</legend>
          <input className="va-busca" placeholder="Pesquisar por nome, idioma, sotaque…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="va-lista" role="listbox" aria-label="Vozes">
            {filtradas.map((v) => (
              <button key={v.id} type="button" role="option" aria-selected={cfg.voiceId === v.id} className={`va-v${cfg.voiceId === v.id ? ' on' : ''}`} onClick={() => muda({ voiceId: v.id, voiceNome: v.nome })}>
                <b>{v.nome}</b> <small>{[v.idioma, v.sotaque, v.genero, v.categoria].filter(Boolean).join(' · ')}</small>
                {v.descricao && <em>{v.descricao}</em>}
              </button>
            ))}
            {!filtradas.length && <p className="va-aviso">{vozes.length ? 'Nenhuma voz encontrada.' : 'Sem vozes carregadas.'}</p>}
          </div>
          <label className="va-id">ID da voz (se a sua não aparecer na lista): <input value={cfg.voiceId ?? ''} onChange={(e) => muda({ voiceId: e.target.value, voiceNome: '' })} /></label>
        </fieldset>
        <fieldset>
          <legend>Ajustes</legend>
          <p>Voz escolhida: <b>{cfg.voiceNome || cfg.voiceId || '—'}</b></p>
          <label>Modelo: <select value={cfg.modelo} onChange={(e) => muda({ modelo: e.target.value })}>{cfg.modelos.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          {Barra({ rot: "Estabilidade", k: "estabilidade", min: 0, max: 1, passo: 0.05 })}
          {Barra({ rot: "Semelhança", k: "similaridade", min: 0, max: 1, passo: 0.05 })}
          {Barra({ rot: "Velocidade", k: "velocidade", min: 0.7, max: 1.2, passo: 0.05 })}
          <label>Texto de teste:<textarea rows={3} value={texto} maxLength={300} onChange={(e) => setTexto(e.target.value)} /></label>
          <div className="va-bt">
            <button type="button" className="bt" onClick={testar} disabled={!!ocupado || !cfg.voiceId}>{ocupado === 'teste' ? 'Gerando…' : '🔊 Testar voz'}</button>
            <button type="button" className="bt prim" onClick={salvar} disabled={!!ocupado || !mudou}>💾 Salvar</button>
          </div>
        </fieldset>
      </div>
      {msg && <p className={msg.tipo === 'ok' ? 'va-ok' : 'va-erro'} role="status">{msg.m}</p>}
    </section>
  );
}
