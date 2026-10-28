import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Toast, confirmar } from '../components/toast.jsx';
import { itinerarioImpressao, imprimirHtml } from '../lib/print.js';

const VAZIO = { id: null, horario: '', descricao: '', id_funcionario: '' };

const LinhaEmpresa = memo(function LinhaEmpresa({ e, marc, onClick }) {
  return (
    <tr className={marc ? 'marc' : ''} onClick={() => onClick(e.id)}>
      <td className="trb2-ck"><input type="checkbox" checked={marc} onChange={() => {}} aria-label={`Marcar ${e.nome_exibe}`} /></td>
      <td className="n">{e.roteiro_ordem}</td><td title={e.nome_exibe}>{e.nome_exibe}</td><td>{e.telefone}</td><td>{e.contato}</td>
    </tr>
  );
});

/** Controle do etinerário (u_etinerario): horários de roteiros por motorista e as empresas atendidas em cada um. */
export default function Itinerario({ onFechar }) {
  const [roteiros, setRoteiros] = useState([]);
  const [motoristas, setMotoristas] = useState([]);
  const [sel, setSel] = useState(null); // id do roteiro
  const [form, setForm] = useState(null); // null = só leitura; objeto = editando/novo
  const [dentro, setDentro] = useState([]);
  const [fora, setFora] = useState([]);
  const [todas, setTodas] = useState(false);
  const [qFora, setQFora] = useState('');
  const [mDentro, setMDentro] = useState(() => new Set());
  const [mFora, setMFora] = useState(() => new Set());
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const notificar = useCallback((tipo, m) => setAviso({ tipo, m }), []);
  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(null), 8000); return () => clearTimeout(t); }, [aviso]);

  const carregaRoteiros = useCallback(async (manter) => {
    const rows = await api.get('/itinerario/roteiros');
    setRoteiros(rows);
    setSel((s) => (manter && rows.some((r) => r.id === s) ? s : rows[0]?.id ?? null));
  }, []);
  useEffect(() => {
    carregaRoteiros(false).catch((e) => notificar('erro', e.message));
    api.get('/itinerario/motoristas').then(setMotoristas).catch((e) => notificar('erro', e.message));
  }, [carregaRoteiros, notificar]);

  const carregaEmpresas = useCallback(async () => {
    if (!sel) { setDentro([]); setFora([]); return; }
    try {
      const [d, f] = await Promise.all([api.get(`/itinerario/roteiros/${sel}/empresas`), api.get(`/itinerario/roteiros/${sel}/fora${todas ? '?todas=1' : ''}`)]);
      setDentro(d); setFora(f); setMDentro(new Set()); setMFora(new Set());
    } catch (e) { notificar('erro', e.message); }
  }, [sel, todas, notificar]);
  useEffect(() => { carregaEmpresas(); }, [carregaEmpresas]);

  const rot = roteiros.find((r) => r.id === sel) ?? null;
  const foraVis = useMemo(() => { const ws = qFora.toUpperCase().split(/\s+/).filter(Boolean); return fora.filter((x) => ws.every((w) => String(x.chave).toUpperCase().includes(w))); }, [fora, qFora]);

  const executa = async (fn, ok) => {
    setOcupado(true);
    try { const r = await fn(); if (ok) notificar('ok', typeof ok === 'function' ? ok(r) : ok); } catch (e) { notificar('erro', e.message); } finally { setOcupado(false); }
  };
  const alterna = (set, setSet) => (id) => setSet((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clicaDentro = useCallback(alterna(mDentro, setMDentro), []); // eslint-disable-line react-hooks/exhaustive-deps
  const clicaFora = useCallback(alterna(mFora, setMFora), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- horários de roteiros (navegador: inserir/editar/excluir/gravar/cancelar)
  const novo = () => setForm({ ...VAZIO, id_funcionario: rot?.id_funcionario ?? '' });
  const editar = () => rot && setForm({ id: rot.id, horario: rot.horario, descricao: rot.descricao ?? '', id_funcionario: rot.id_funcionario ?? '' });
  const gravar = () => executa(async () => {
    const corpo = { horario: form.horario, descricao: form.descricao, id_funcionario: Number(form.id_funcionario) };
    if (!corpo.id_funcionario) throw new Error('Escolha o motorista.');
    if (form.id) { await api.put(`/itinerario/roteiros/${form.id}`, corpo); await carregaRoteiros(true); } else {
      const r = await api.post('/itinerario/roteiros', corpo); await carregaRoteiros(true); setSel(r.id);
    }
    setForm(null);
  }, 'Horário gravado.');
  const excluir = async () => {
    if (!rot || !(await confirmar(`Excluir o horário ${rot.horario} (${rot.apelido || rot.nome || 'sem motorista'})?`))) return;
    executa(async () => { await api.del(`/itinerario/roteiros/${rot.id}`); await carregaRoteiros(false); }, 'Horário excluído.');
  };

  // ----- empresas
  const colocar = () => {
    if (!sel || mFora.size === 0) { notificar('erro', 'Marque as empresas "fora do roteiro" que entram neste roteiro.'); return; }
    executa(async () => { const r = await api.post(`/itinerario/roteiros/${sel}/empresas`, { unidades: [...mFora] }); await carregaEmpresas(); await carregaRoteiros(true); return r; },
      (r) => `${r.inseridas} empresa(s) colocada(s) no roteiro.`);
  };
  const tirar = async () => {
    if (!sel || mDentro.size === 0) { notificar('erro', 'Marque as empresas que saem do roteiro.'); return; }
    if (!(await confirmar(`Tirar ${mDentro.size} empresa(s) deste roteiro?`))) return;
    executa(async () => { const r = await api.post(`/itinerario/roteiros/${sel}/empresas/remover`, { ids: [...mDentro] }); await carregaEmpresas(); await carregaRoteiros(true); return r; },
      (r) => `${r.removidas} empresa(s) removida(s).`);
  };
  const mover = (delta) => {
    const alvo = [...mDentro]; if (alvo.length !== 1) { notificar('erro', 'Marque uma única empresa para mudar a ordem.'); return; }
    const i = dentro.findIndex((e) => e.id === alvo[0]); const j = i + delta;
    if (j < 0 || j >= dentro.length) return;
    const nova = dentro.map((e) => e.id); [nova[i], nova[j]] = [nova[j], nova[i]];
    executa(async () => { await api.put(`/itinerario/roteiros/${sel}/ordem`, { ids: nova }); await carregaEmpresas(); setMDentro(new Set(alvo)); });
  };
  const imprimir = () => executa(async () => {
    const rows = await api.get('/itinerario/impressao');
    if (!rows.length) throw new Error('Não há roteiros para imprimir.');
    const { corpo, css } = itinerarioImpressao(rows); imprimirHtml(corpo, css);
  });

  const porMotorista = useMemo(() => {
    const g = [];
    roteiros.forEach((r) => { const nome = r.apelido || r.nome || '(sem motorista)'; const x = g[g.length - 1]; if (x && x.nome === nome) x.itens.push(r); else g.push({ nome, itens: [r] }); });
    return g;
  }, [roteiros]);

  return (
    <div className="cg it">
      <Toast aviso={aviso} />
      <header className="cg-topo">
        <div className="cg-tit"><b>🧭 Controle do etinerário</b><small>Horários dos roteiros e as empresas de cada um</small></div>
        <span className="cg-esp" />
        <button type="button" className="trb2-btn" onClick={imprimir} disabled={ocupado}>🖨 Imprimir etinerário</button>
        <button type="button" className="trb2-btn" onClick={() => { carregaRoteiros(true); carregaEmpresas(); }}>⟳ Atualizar</button>
        <button type="button" className="trb2-btn" onClick={onFechar}>Fechar</button>
      </header>

      <div className="it-corpo">
        <section className="trb2-card it-rot">
          <header><div><h3>Horários de roteiros</h3><p>Escolha um horário para ver suas empresas</p></div></header>
          <div className="cg-barra">
            <button type="button" className="trb2-btn principal" onClick={novo} disabled={Boolean(form)}>＋ Novo</button>
            <button type="button" className="trb2-btn" onClick={editar} disabled={!rot || Boolean(form)}>✎ Alterar</button>
            <button type="button" className="trb2-btn perigo" onClick={excluir} disabled={!rot || Boolean(form) || ocupado}>Excluir</button>
          </div>
          {form && (
            <div className="it-form">
              <label><span>Horário</span><input type="time" value={form.horario.slice(0, 5)} onChange={(e) => setForm({ ...form, horario: e.target.value })} autoFocus /></label>
              <label><span>Descrição</span><input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></label>
              <label className="larga"><span>Motorista</span>
                <select value={form.id_funcionario} onChange={(e) => setForm({ ...form, id_funcionario: e.target.value })}><option value="">Escolha…</option>{motoristas.map((m) => <option key={m.id} value={m.id}>{m.apelido || m.nome}</option>)}</select></label>
              <div className="it-form-bt"><button type="button" className="trb2-btn" onClick={() => setForm(null)}>Cancelar</button><button type="button" className="trb2-btn principal" disabled={ocupado} onClick={gravar}>✔ Gravar</button></div>
            </div>
          )}
          <div className="trb2-tab">
            <table>
              <thead><tr><th>Saída</th><th>Descrição</th><th className="n">Empresas</th></tr></thead>
              <tbody>
                {porMotorista.map((g) => (
                  <FragmentoMotorista key={g.nome} g={g} sel={sel} onSel={(id) => { if (!form) setSel(id); }} />
                ))}
                {roteiros.length === 0 && <tr><td colSpan={3} className="trb2-vazio">Nenhum horário cadastrado</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="trb2-card it-dentro">
          <header><div><h3>Empresas dentro do roteiro</h3><p>{rot ? `${rot.horario} · ${rot.apelido || rot.nome || ''}` : 'Escolha um horário'}</p></div><span className={`trb2-chip${mDentro.size ? ' on' : ''}`}>{mDentro.size} marcada(s)</span></header>
          <div className="cg-barra">
            <button type="button" className="trb2-btn" onClick={() => mover(-1)} disabled={ocupado} title="Sobe a empresa marcada na ordem de entrega">▲ Subir</button>
            <button type="button" className="trb2-btn" onClick={() => mover(1)} disabled={ocupado} title="Desce a empresa marcada na ordem de entrega">▼ Descer</button>
            <span className="cg-esp" />
            <button type="button" className="trb2-btn perigo" onClick={tirar} disabled={ocupado || !mDentro.size}>Tirar do roteiro ➜</button>
          </div>
          <div className="trb2-tab">
            <table>
              <thead><tr><th className="trb2-ck" /><th className="n">Ord.</th><th>Empresa</th><th>Telefone</th><th>Contato</th></tr></thead>
              <tbody>
                {dentro.map((e) => <LinhaEmpresa key={e.id} e={e} marc={mDentro.has(e.id)} onClick={clicaDentro} />)}
                {dentro.length === 0 && <tr><td colSpan={5} className="trb2-vazio">Nenhuma empresa neste roteiro</td></tr>}
              </tbody>
            </table>
          </div>
          <footer>{dentro.length} empresa(s)</footer>
        </section>

        <section className="trb2-card it-fora">
          <header><div><h3>Empresas fora do roteiro</h3><p>Clientes com programação ativa</p></div><span className={`trb2-chip${mFora.size ? ' on' : ''}`}>{mFora.size} marcada(s)</span></header>
          <div className="trb2-filtro">
            <input type="search" value={qFora} onChange={(e) => setQFora(e.target.value)} placeholder="Buscar empresa…" aria-label="Buscar empresa fora do roteiro" />
            <label className="trb2-chk"><input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Incluir as de outros roteiros</label>
          </div>
          <div className="cg-barra"><button type="button" className="trb2-btn principal" onClick={colocar} disabled={ocupado || !sel || !mFora.size}>⬅ Colocar no roteiro</button></div>
          <div className="trb2-tab">
            <table>
              <thead><tr><th className="trb2-ck"><input type="checkbox" checked={foraVis.length > 0 && foraVis.every((x) => mFora.has(x.id_unidade))} onChange={() => setMFora((s) => (foraVis.every((x) => s.has(x.id_unidade)) ? new Set() : new Set(foraVis.map((x) => x.id_unidade))))} aria-label="Marcar todas as listadas" /></th><th>Empresa</th></tr></thead>
              <tbody>
                {foraVis.map((x) => (
                  <tr key={x.id_unidade} className={mFora.has(x.id_unidade) ? 'marc' : ''} onClick={() => clicaFora(x.id_unidade)}>
                    <td className="trb2-ck"><input type="checkbox" checked={mFora.has(x.id_unidade)} onChange={() => {}} aria-label={`Marcar ${x.chave}`} /></td><td title={x.chave}>{x.chave}</td>
                  </tr>
                ))}
                {foraVis.length === 0 && <tr><td colSpan={2} className="trb2-vazio">Nenhuma empresa fora do roteiro</td></tr>}
              </tbody>
            </table>
          </div>
          <footer>{foraVis.length} empresa(s)</footer>
        </section>
      </div>
    </div>
  );
}

function FragmentoMotorista({ g, sel, onSel }) {
  return (
    <>
      <tr className="it-mot"><td colSpan={3}>🚚 {g.nome}</td></tr>
      {g.itens.map((r) => (
        <tr key={r.id} className={r.id === sel ? 'marc' : ''} onClick={() => onSel(r.id)}>
          <td><b>{r.horario}</b></td><td>{r.descricao}</td><td className="n">{r.empresas}</td>
        </tr>
      ))}
    </>
  );
}
