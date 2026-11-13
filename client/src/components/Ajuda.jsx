import { useCallback, useEffect, useRef, useState } from 'react';
import { api, audioApi } from '../api.js';

/** Texto corrido da ajuda de uma tela (usado na narração). */
export const textoNarrado = (t) => (t ? `${t.titulo}. ${t.resumo} Como usar: ${t.passos.map((p, i) => `${i + 1}. ${p}`).join(' ')} ${t.dicas.length ? `Dicas: ${t.dicas.join(' ')}` : ''}` : '');

/** Ajuda da tela atual (F1 ou botão ?) com narração (ElevenLabs; sem ela, a voz do navegador) e assistente de IA (OpenAI). */
export default function Ajuda({ tela }) {
  const [aberta, setAberta] = useState(false);
  const [base, setBase] = useState(null);
  const [st, setSt] = useState({ chat: false, voz: false });
  const [msgs, setMsgs] = useState([]);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [falando, setFalando] = useState(false);
  const [erro, setErro] = useState('');
  const audio = useRef(null);
  const fim = useRef(null);

  const abre = useCallback(() => setAberta(true), []);
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'F1') { e.preventDefault(); setAberta((a) => !a); } else if (e.key === 'Escape') setAberta(false); };
    window.addEventListener('keydown', tecla);
    window.addEventListener('abrir-ajuda', abre);
    return () => { window.removeEventListener('keydown', tecla); window.removeEventListener('abrir-ajuda', abre); };
  }, [abre]);
  useEffect(() => {
    if (!aberta || base) return;
    api.get('/ajuda/telas').then(setBase).catch(() => setBase({}));
    api.get('/ajuda/status').then(setSt).catch(() => {});
  }, [aberta, base]);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [msgs, ocupado]);

  const para = useCallback(() => {
    try { audio.current?.pause(); } catch { /* sem áudio */ }
    audio.current = null; try { window.speechSynthesis?.cancel(); } catch { /* sem voz */ }
    setFalando(false);
  }, []);
  useEffect(() => { if (!aberta) para(); return para; }, [aberta, para]);

  const narra = async (t) => {
    if (falando) { para(); return; }
    if (!t) return;
    setErro(''); setFalando(true);
    try {
      if (st.voz) {
        const url = await audioApi('/ajuda/voz', { texto: t });
        const a = new Audio(url); audio.current = a; a.onended = () => setFalando(false); a.onerror = () => setFalando(false);
        await a.play(); return;
      }
      throw new Error('sem ElevenLabs');
    } catch (e) {
      if (st.voz) setErro(`Narração (ElevenLabs): ${e.message}. Usando a voz do navegador.`);
      try { // plano B: voz do navegador
        const u = new SpeechSynthesisUtterance(t); u.lang = 'pt-BR'; u.onend = () => setFalando(false); u.onerror = () => setFalando(false);
        window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
      } catch { setFalando(false); }
    }
  };

  const enviar = async (e) => {
    e?.preventDefault();
    const q = texto.trim(); if (!q || ocupado) return;
    const novas = [...msgs, { role: 'user', content: q }];
    setMsgs(novas); setTexto(''); setOcupado(true); setErro('');
    try { const r = await api.post('/ajuda/chat', { tela, mensagens: novas }); setMsgs([...novas, { role: 'assistant', content: r.resposta }]); }
    catch (er) { setErro(er.message); }
    setOcupado(false);
  };

  const t = base?.[tela] ?? base?.geral ?? null;
  return (
    <>
      <button type="button" className="aj-btn" onClick={() => setAberta((a) => !a)} title="Ajuda (F1)" aria-label="Ajuda">?</button>
      {aberta && (
        <aside className="aj-painel" role="dialog" aria-label="Ajuda">
          <header>
            <b>❓ Ajuda{t ? ` — ${t.titulo}` : ''}</b>
            <button type="button" onClick={() => narra(textoNarrado(t))} title="Ouvir a explicação desta tela">{falando ? '⏹ Parar' : '🔊 Ouvir'}</button>
            <button type="button" onClick={() => setAberta(false)} aria-label="Fechar">✕</button>
          </header>
          <div className="aj-corpo">
            {!base ? <p>Carregando…</p> : t ? (
              <>
                <p>{t.resumo}</p>
                <h4>Como usar</h4><ol>{t.passos.map((p, i) => <li key={i}>{p}</li>)}</ol>
                {t.dicas.length > 0 && (<><h4>Dicas</h4><ul>{t.dicas.map((p, i) => <li key={i}>{p}</li>)}</ul></>)}
              </>
            ) : <p>Sem ajuda cadastrada para esta tela.</p>}
            <h4>Pergunte ao assistente</h4>
            {!st.chat && <p className="aj-aviso">O assistente de IA ainda não foi ativado neste servidor (falta a chave da OpenAI). A ajuda acima continua valendo.</p>}
            <div className="aj-chat">
              {msgs.map((m, i) => (
                <div key={i} className={`aj-m ${m.role}`}>
                  <span>{m.content}</span>
                  {m.role === 'assistant' && <button type="button" onClick={() => narra(m.content)} title="Ouvir esta resposta">🔊</button>}
                </div>
              ))}
              {ocupado && <div className="aj-m assistant"><span>…</span></div>}
              <div ref={fim} />
            </div>
            {erro && <p className="aj-erro">{erro}</p>}
          </div>
          <form onSubmit={enviar} className="aj-form">
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={st.chat ? 'Ex.: como marco várias notas de uma vez?' : 'Assistente indisponível'} disabled={!st.chat || ocupado} maxLength={500} />
            <button type="submit" disabled={!st.chat || ocupado || !texto.trim()}>Enviar</button>
          </form>
          <footer>A IA só explica como usar o sistema; ela não vê seus clientes, notas nem valores. Pode errar: confira.</footer>
        </aside>
      )}
    </>
  );
}
