import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { EXTRAS, bool } from '../lib/rules.js';

export function Modal({ titulo, onFechar, children, largo }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); onFechar(); } };
    el.addEventListener('keydown', esc);
    return () => el.removeEventListener('keydown', esc);
  }, [onFechar]);
  return (
    <dialog ref={ref} className={`modal${largo ? ' largo' : ''}`} onCancel={(e) => e.preventDefault()}>
      <header className="modal-topo">
        <h2>{titulo}</h2>
        <button type="button" className="icone" onClick={onFechar} aria-label="Fechar">×</button>
      </header>
      {children}
    </dialog>
  );
}

export const Campo = ({ rotulo, children, className = '' }) => (
  <label className={`campo ${className}`}><span>{rotulo}</span>{children}</label>
);

export function Extras({ valores, onChange }) {
  return (
    <fieldset className="extras">
      <legend>Opções de produção</legend>
      {EXTRAS.map(([k, rotulo]) => (
        <label key={k} className="check">
          <input type="checkbox" checked={bool(valores[`extra_${k}`])}
            onChange={(e) => onChange(`extra_${k}`, e.target.checked ? 'True' : 'False')} />
          {rotulo}
        </label>
      ))}
    </fieldset>
  );
}

const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Destaca no texto as palavras digitadas (sem diferenciar maiúsculas). */
export function Marca({ texto, termo }) {
  const ws = String(termo ?? '').trim().split(/\s+/).filter((w) => w.length > 0).map(reEsc);
  if (!ws.length) return <>{texto}</>;
  return <>{String(texto ?? '').split(new RegExp(`(${ws.join('|')})`, 'ig')).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

/** Janela "Localizar produto": pesquisa ao digitar, setas navegam, Enter escolhe, Esc fecha. */
export function BuscaProduto({ onEscolher, onFechar }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [estado, setEstado] = useState('ocioso'); // ocioso | buscando | ok | erro
  const [sel, setSel] = useState(0);
  const lista = useRef(null);
  const campo = useRef(null);
  const seq = useRef(0);
  // o <dialog> devolve o foco ao botão de fechar ao abrir: leva de volta ao campo de pesquisa
  useEffect(() => { const t = setTimeout(() => campo.current?.focus(), 40); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) { setRows([]); setEstado('ocioso'); return undefined; }
    setEstado('buscando');
    const n = ++seq.current;
    const t = setTimeout(() => {
      api.get(`/produtos?q=${encodeURIComponent(termo)}`)
        .then((r) => { if (n === seq.current) { setRows(r); setSel(0); setEstado('ok'); } })
        .catch(() => { if (n === seq.current) { setRows([]); setEstado('erro'); } });
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { lista.current?.querySelector('li.on')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const tecla = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(rows.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && rows[sel]) { e.preventDefault(); onEscolher(rows[sel].codigo); }
  };
  return (
    <Modal titulo="Localizar produto" onFechar={onFechar}>
      <div className="pq" onKeyDown={tecla}>
        <div className="pq-caixa">
          <span aria-hidden="true">🔍</span>
          <input ref={campo} type="search" placeholder="Digite parte do código ou da descrição…" aria-label="Pesquisar produto" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button type="button" className="pq-limpa" aria-label="Limpar pesquisa" onClick={() => setQ('')}>×</button>}
        </div>
        <div className="pq-estado" aria-live="polite">
          {estado === 'ocioso' && 'Digite ao menos 2 letras para pesquisar.'}
          {estado === 'buscando' && 'Pesquisando…'}
          {estado === 'erro' && 'Não foi possível pesquisar agora. Tente de novo.'}
          {estado === 'ok' && (rows.length ? `${rows.length} produto${rows.length > 1 ? 's' : ''} encontrado${rows.length > 1 ? 's' : ''}` : 'Nenhum produto encontrado.')}
        </div>
        <ul className="pq-lista" role="listbox" ref={lista}>
          {rows.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''} onMouseMove={() => i !== sel && setSel(i)} onClick={() => onEscolher(p.codigo)}>
              <b className="pq-cod"><Marca texto={p.codigo} termo={q} /></b><span className="pq-desc"><Marca texto={p.descricao} termo={q} /></span>
            </li>
          ))}
        </ul>
        <p className="pq-dica"><kbd>↑</kbd> <kbd>↓</kbd> navega · <kbd>Enter</kbd> escolhe · <kbd>Esc</kbd> fecha</p>
      </div>
    </Modal>
  );
}

/** Campo de código do produto: busca ao sair do campo; vazio ou "0" abre a janela de pesquisa. */
export function CampoProduto({ valor, onCodigo, onErro }) {
  const [texto, setTexto] = useState(valor ?? '');
  const [busca, setBusca] = useState(false);
  const ultimo = useRef(valor ?? '');

  const resolver = async (codigo) => {
    if (!codigo || codigo === '0') { setBusca(true); return; }
    if (codigo === ultimo.current) return;
    try {
      const p = await api.get(`/produtos/codigo/${encodeURIComponent(codigo)}`);
      ultimo.current = codigo;
      onCodigo(p);
    } catch {
      onErro('Produto não encontrado!!!');
    }
  };
  return (
    <>
      <input value={texto} onChange={(e) => setTexto(e.target.value)}
        onBlur={() => resolver(texto.trim())} placeholder="Código" />
      {busca && (
        <BuscaProduto onFechar={() => setBusca(false)}
          onEscolher={(codigo) => { setBusca(false); setTexto(codigo); resolver(codigo); }} />
      )}
    </>
  );
}
