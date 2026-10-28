import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

export { Confirma } from './toast.jsx';

/** cxDBNavigator: primeiro, anterior, próximo, último, incluir, excluir, editar, gravar, cancelar, atualizar. */
export function Navegador({ ed, onEditar, desabilitado, compacto }) {
  const b = (tit, simb, fn, off, cls = '') => <button type="button" className={cls} title={tit} aria-label={tit} disabled={desabilitado || off} onClick={fn}>{simb}{cls && !compacto ? <span> {tit}</span> : null}</button>;
  const n = ed.lista.length;
  const sujo = ed.sujo;
  return (
    <div className={`cad-nav${compacto ? " cad-nav-c" : ""}`}>
      {b('Primeiro', '⏮', () => ed.ir(0), ed.idx <= 0)}{b('Anterior', '◀', () => ed.ir(ed.idx - 1), ed.idx <= 0)}
      {b('Próximo', '▶', () => ed.ir(ed.idx + 1), ed.idx < 0 || ed.idx >= n - 1)}{b('Último', '⏭', () => ed.ir(n - 1), ed.idx < 0 || ed.idx >= n - 1)}
      {b('Incluir', '＋', ed.incluir, ed.novo)}{b('Excluir', '－', ed.excluir, !ed.atual || ed.novo)}
      {b('Editar', '✎', onEditar, !ed.atual && !ed.novo)}{b('Gravar', '✔', ed.gravar, !sujo, 'gr')}
      {b('Cancelar', '✖', ed.cancelar, !sujo, 'cc')}{b('Atualizar', '⟳', ed.recarregar, sujo)}
    </div>
  );
}

/** Campo posicionado como no DFM: (x, y) é a posição do EDIT; o rótulo fica 17px acima. */
export function Cx({ x, y, w, rotulo, children, className = '' }) {
  return (
    <div className={`cad-cx ${className}`} style={{ left: x, top: y - 17, width: w }}>
      <span>{rotulo}</span>
      <div>{children}</div>
    </div>
  );
}
export const Pos = ({ x, y, w, h, children, className = '' }) => <div className={`cad-pos ${className}`} style={{ left: x, top: y, width: w, height: h }}>{children}</div>;

/**
 * Estado de edição de um cadastro (equivale ao dataset do Delphi): registro em foco, rascunho, incluir/gravar/cancelar/excluir.
 * `caminho` = rota base (ex.: '/cadastros/clientes'); `padrao` = valores iniciais ao incluir; `texto` = descrição para a confirmação de exclusão.
 */
export function useEdicao({ lista, foco, setFoco, caminho, recarregar, aviso, confirmar, padrao = () => ({}), texto = (r) => `registro ${r.id}`, posGravar }) {
  const [draft, setDraft] = useState({});
  const [novo, setNovo] = useState(false);
  const atual = lista.find((r) => r.id === foco) ?? null;
  // a pesquisa pode esconder o registro em foco: vai para o primeiro que sobrou
  useEffect(() => { if (!novo && Object.keys(draft).length === 0 && lista.length && !lista.some((r) => r.id === foco)) setFoco(lista[0].id); }, [lista]); // eslint-disable-line react-hooks/exhaustive-deps
  const idx = lista.findIndex((r) => r.id === foco);
  const sujo = novo || Object.keys(draft).length > 0;
  const v = (k) => (k in draft ? draft[k] : novo ? '' : atual?.[k] ?? '');
  const set = useCallback((k, valor) => setDraft((d) => ({ ...d, [k]: valor })), []);
  const bloqueado = () => { aviso('erro', 'Grave (✔) ou cancele (✖) as alterações antes de continuar.'); };

  const ir = (i) => {
    if (sujo) { bloqueado(); return; }
    const r = lista[Math.max(0, Math.min(lista.length - 1, i))];
    if (r) setFoco(r.id);
  };
  const selecionar = (id) => { if (sujo && id !== foco) { bloqueado(); return false; } setFoco(id); return true; };
  const incluir = () => { if (sujo) { bloqueado(); return; } setNovo(true); setDraft(padrao()); };
  const cancelar = () => { setNovo(false); setDraft({}); };
  const gravar = async () => {
    try {
      let r;
      if (novo) r = await api.post(caminho, draft);
      else r = await api.put(`${caminho}/${foco}`, draft);
      const id = r?.id ?? foco;
      setNovo(false); setDraft({});
      await recarregar(id);
      aviso('ok', 'Registro gravado.');
      posGravar?.(r);
    } catch (e) { aviso('erro', e.message); }
  };
  const excluir = () => confirmar({
    texto: `Excluir ${texto(atual)}?`,
    sim: async () => { try { await api.del(`${caminho}/${foco}`); await recarregar(); aviso('ok', 'Registro excluído.'); } catch (e) { aviso('erro', e.message); } },
  });
  return { lista, atual, idx, sujo, novo, v, set, ir, selecionar, incluir, cancelar, gravar, excluir, recarregar: () => { if (sujo) { bloqueado(); return Promise.resolve(); } return recarregar(); }, setDraft };
}

/** Campo de texto ligado ao rascunho. */
export const Txt = forwardRef(function Txt({ ed, k, desabilitado, ...p }, ref) {
  return <input ref={ref} value={ed.v(k)} disabled={desabilitado ?? (!ed.atual && !ed.novo)} onChange={(e) => ed.set(k, e.target.value)} {...p} />;
});
export const Marca = ({ ed, k, rotulo, sim = 'True', nao = 'False' }) => (
  <label className="cad-chk"><input type="checkbox" disabled={!ed.atual && !ed.novo} checked={String(ed.v(k)) === sim} onChange={(e) => ed.set(k, e.target.checked ? sim : nao)} />{rotulo}</label>
);

const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Filtro local: todas as palavras digitadas precisam aparecer (sem acento/maiúscula) em algum dos campos. */
export function useBusca(lista, campos) {
  const [termo, setTermo] = useState('');
  const visiveis = useMemo(() => {
    const ws = semAcento(termo).split(/\s+/).filter(Boolean);
    if (!ws.length) return lista;
    return lista.filter((r) => { const t = campos.map((c) => semAcento(r[c])).join(' '); return ws.every((w) => t.includes(w)); });
  }, [lista, termo, campos]); // eslint-disable-line react-hooks/exhaustive-deps
  return { termo, setTermo, visiveis };
}
export function Busca({ busca, placeholder = 'Pesquisar…', total, className = '' }) {
  return (
    <span className={`cad-busca-cx ${className}`}>
      <input type="search" value={busca.termo} placeholder={placeholder} onChange={(e) => busca.setTermo(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && busca.termo) { e.preventDefault(); e.stopPropagation(); busca.setTermo(''); } }} aria-label={placeholder} />
      {busca.termo && <small title="Itens que combinam com a pesquisa">{busca.visiveis.length}{total !== undefined ? ` de ${total}` : ''}</small>}
    </span>
  );
}

/* ---------- Visual novo dos cadastros (fluxo em grade, sem posições absolutas) ---------- */
/** Campo com rótulo; `span` = colunas (de 12) que ocupa. */
export const Campo = ({ rotulo, span = 4, children, className = '' }) => (
  <label className={`cd-campo ${className}`} style={{ gridColumn: `span ${span}` }}><span>{rotulo}</span>{children}</label>
);
/** Cartão de seção com título e grade de 12 colunas. */
export const Secao = ({ titulo, icone, children, className = '' }) => (
  <section className={`cd-secao ${className}`}>
    <h4>{icone && <i aria-hidden="true">{icone}</i>}{titulo}</h4>
    <div className="cd-grid">{children}</div>
  </section>
);
/** Interruptor (checkbox estilizado) ligado ao rascunho. */
export const Chave = ({ ed, k, rotulo, sim = 'True', nao = 'False', span = 4 }) => (
  <label className="cd-chave" style={{ gridColumn: `span ${span}` }}>
    <input type="checkbox" disabled={!ed.atual && !ed.novo} checked={String(ed.v(k)) === sim} onChange={(e) => ed.set(k, e.target.checked ? sim : nao)} /><i aria-hidden="true" />{rotulo}
  </label>
);
