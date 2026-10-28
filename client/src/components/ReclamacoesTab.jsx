import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { brData, hhmm } from '../lib/rules.js';
import * as imp from '../lib/print.js';
import { confirmar } from './toast.jsx';

const VAZIO = { reclamante: '', telefone: '', reclamacao: '', explicacao: '' };

/** Navegador de registros (TcxDBNavigator): primeiro, anterior, próximo, último, inserir, excluir, editar, gravar, cancelar, atualizar. */
function Navegador({ pos, total, editando, onIr, onInserir, onExcluir, onEditar, onGravar, onCancelar, onAtualizar }) {
  const B = ({ t, ic, f, off, cls = '' }) => <button type="button" className={`nav-b ${cls}`} title={t} aria-label={t} disabled={off} onClick={f}>{ic}{cls ? <span> {t}</span> : null}</button>;
  return (
    <div className="navegador" role="toolbar" aria-label="Navegador de reclamações">
      <B t="Primeiro" ic="⏮" f={() => onIr(0)} off={editando || pos <= 0} />
      <B t="Anterior" ic="◀" f={() => onIr(pos - 1)} off={editando || pos <= 0} />
      <B t="Próximo" ic="▶" f={() => onIr(pos + 1)} off={editando || pos >= total - 1} />
      <B t="Último" ic="⏭" f={() => onIr(total - 1)} off={editando || pos >= total - 1} />
      <B t="Inserir" ic="✚" f={onInserir} off={editando} />
      <B t="Excluir" ic="✖" f={onExcluir} off={editando || total === 0} />
      <B t="Editar" ic="✎" f={onEditar} off={editando || total === 0} />
      <B t="Gravar" ic="✔" f={onGravar} off={!editando} cls="gr" />
      <B t="Cancelar" ic="✘" f={onCancelar} off={!editando} cls="cc" />
      <B t="Atualizar" ic="⟳" f={onAtualizar} off={editando} />
    </div>
  );
}

export default function ReclamacoesTab({ status, notify }) {
  const [linhas, setLinhas] = useState([]);
  const [pos, setPos] = useState(0);
  const [draft, setDraft] = useState(null); // {id?, ...campos}: dsedit/dsinsert
  const carregar = useCallback(async (manter) => {
    if (!status) { setLinhas([]); return; }
    const rows = await api.get(`/status/${status.id}/reclamacoes`);
    setLinhas(rows);
    setPos((p) => Math.max(0, Math.min(manter ?? p, rows.length - 1)));
  }, [status?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar(0).catch((e) => notify.erro(e.message)); }, [carregar]); // eslint-disable-line react-hooks/exhaustive-deps

  const atual = linhas[pos] ?? null;
  const v = draft ?? atual ?? VAZIO;
  const edit = (k) => (e) => setDraft((d) => ({ ...(d ?? atual ?? VAZIO), [k]: e.target.value }));
  const tenta = async (fn, ok) => { try { await fn(); if (ok) notify.ok(ok); } catch (e) { notify.erro(e.message); } };

  const inserir = async () => { // tbrcmBeforeInsert
    if (!status) { notify.erro('É necessario selecionar um cliente na lista de clientes'); return; }
    if (!(await confirmar(`Deseja abrir uma reclamação para ${status.unidade_nome}`))) return;
    setDraft({ ...VAZIO });
    setTimeout(() => document.getElementById('edt-reclamante')?.focus(), 30);
  };
  const gravar = () => tenta(async () => {
    const corpo = { reclamante: v.reclamante, telefone: v.telefone ?? '', reclamacao: v.reclamacao ?? '', explicacao: v.explicacao ?? '' };
    if (!draft) return;
    if (draft.id) await api.put(`/reclamacoes/${draft.id}`, corpo);
    else await api.post(`/status/${status.id}/reclamacoes`, corpo);
    setDraft(null);
    await carregar(0);
  }, 'Reclamação gravada.');
  const excluir = async () => atual && (await confirmar('Excluir a reclamação selecionada?'))
    && tenta(async () => { await api.del(`/reclamacoes/${atual.id}`); await carregar(pos); }, 'Reclamação excluída.');
  const editar = () => atual && setDraft({ ...atual });
  const imprimir = () => {
    if (!atual) { notify.erro('Selecione uma reclamação.'); return; }
    const { corpo, css } = imp.reclamacao({ ...atual, ...(draft ?? {}) }, status.unidade_nome);
    imp.imprimirHtml(corpo, css);
  };
  const editando = !!draft;

  return (
    <section className="rcm">
      <fieldset className="gbox rcm-opcoes">
        <legend>Opções</legend>
        <div className="rcm-barra">
          <Navegador pos={pos} total={linhas.length} editando={editando} onIr={(n) => setPos(n)} onInserir={inserir} onExcluir={excluir}
            onEditar={editar} onGravar={gravar} onCancelar={() => setDraft(null)} onAtualizar={() => tenta(() => carregar(pos))} />
          <button type="button" className="bt ico-txt" onClick={imprimir} disabled={!atual}>Imprimir reclamação</button>
        </div>
      </fieldset>
      <div className="rcm-corpo">
        <div className="rolagem rcm-grade">
          <table className="grade">
            <thead><tr><th className="ind" /><th>Data</th><th>Hora</th><th>Reclamante</th><th>Telefone</th></tr></thead>
            <tbody>
              {linhas.map((r, i) => (
                <tr key={r.id} className={`clicavel l-avulso${i === pos && !(draft && !draft.id) ? ' sel' : ''}`} onClick={() => !editando && setPos(i)}>
                  <td className="ind">{i === pos && !(draft && !draft.id) ? '▶' : ''}</td>
                  <td>{brData(r.data)}</td><td>{hhmm(r.hora)}</td><td>{r.reclamante}</td><td>{r.telefone}</td>
                </tr>
              ))}
              {linhas.length === 0 && <tr className="semlinha"><td colSpan={5} className="vazio">&lt; Sem reclamações &gt;</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="rcm-form">
          <fieldset className="gbox rcm-reclamante"><legend>Reclamante</legend>
            <input id="edt-reclamante" className="in" disabled={!editando} value={v.reclamante ?? ''} onChange={edit('reclamante')} />
          </fieldset>
          <label className="rcm-l">Reclamação</label>
          <textarea className="memo rcm-memo" disabled={!editando} value={v.reclamacao ?? ''} onChange={edit('reclamacao')} />
          <label className="rcm-l">Contestação</label>
          <textarea className="memo rcm-memo" disabled={!editando} value={v.explicacao ?? ''} onChange={edit('explicacao')} />
        </div>
      </div>
    </section>
  );
}
