import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Toast, copiaTexto } from '../components/toast.jsx';

const dh = (v) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
/** Resume o navegador/sistema a partir do user-agent. */
const resumoUA = (ua = '') => {
  const so = /Windows NT 10/.test(ua) ? 'Windows 10/11' : /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [nav, so].filter(Boolean).join(' · ') || ua.slice(0, 40);
};

/** Dispositivos autorizados (só administrador): libera, bloqueia, nomeia e exclui os navegadores que acessam o sistema. */
export default function Dispositivos({ onFechar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState(null);
  const [filtro, setFiltro] = useState('todos');
  const carrega = useCallback(() => api.get('/dispositivos').then((d) => { setDados(d); setErro(''); }).catch((e) => setErro(e.message)), []);
  useEffect(() => { carrega(); const t = setInterval(carrega, 15000); return () => clearInterval(t); }, [carrega]);
  const salva = async (it, campos) => { try { await api.put(`/dispositivos/${it.id}`, campos); setDados((d) => ({ ...d, itens: d.itens.map((x) => (x.id === it.id ? { ...x, ...campos } : x)) })); } catch (e) { setAviso({ tipo: 'erro', m: e.message }); } };
  const exclui = async (it) => { if (!window.confirm(`Excluir o dispositivo ${it.codigo}${it.descricao ? ` (${it.descricao})` : ''}? Se ele acessar de novo, volta como pendente.`)) return; try { await api.del(`/dispositivos/${it.id}`); carrega(); } catch (e) { setAviso({ tipo: 'erro', m: e.message }); } };
  // Dispositivo cujo número mudou (cookie apagado): passa a liberação do número antigo para o novo.
  const assume = async (novo, origemId) => {
    const o = dados.itens.find((x) => String(x.id) === String(origemId)); if (!o) return;
    if (!window.confirm(`O número ${novo.codigo} passa a ter a liberação de ${o.descricao || o.codigo} (${o.codigo}), e o número antigo é excluído. Confirmar?`)) return;
    try { await api.post(`/dispositivos/${novo.id}/assume`, { origem: o.id }); carrega(); } catch (e) { setAviso({ tipo: 'erro', m: e.message }); }
  };
  const provavel = (i) => (dados?.itens ?? []).find((x) => x.ativo && x.id !== i.id && x.ultimo_ip && x.ultimo_ip === i.ultimo_ip && x.navegador === i.navegador);
  const itens = (dados?.itens ?? []).filter((i) => (filtro === 'todos' ? true : filtro === 'pendentes' ? !i.ativo : i.ativo));
  const habilitados = (dados?.itens ?? []).filter((i) => i.ativo).length;
  return (
    <section className="dspa">
      <Toast aviso={aviso} />
      <header className="dspa-topo">
        <h2>🖥 Dispositivos autorizados</h2>
        <div className="dspa-filtro" role="tablist">
          {[['todos', 'Todos'], ['pendentes', 'Pendentes'], ['habilitados', 'Habilitados']].map(([k, r]) => <button key={k} role="tab" aria-selected={filtro === k} className={filtro === k ? 'on' : ''} onClick={() => setFiltro(k)}>{r}</button>)}
        </div>
        <span className="dspa-esp" />
        <button type="button" className="bt" onClick={carrega}>⟳ Atualizar</button>
        <button type="button" className="bt" onClick={onFechar}>Fechar</button>
      </header>
      <p className="dspa-info">
        {habilitados === 0
          ? <b>O controle está DESLIGADO: nenhum dispositivo habilitado, então todos entram. Habilite os dispositivos desejados — o controle liga assim que o primeiro for habilitado e os demais passam a ser barrados.</b>
          : <>Controle LIGADO: só os {habilitados} dispositivo(s) habilitado(s) acessam. Quem não está na lista vê o código na tela e aparece aqui como pendente.</>}
        {' '}Cada navegador tem seu código (se o usuário limpar os cookies, o código muda e precisa de nova liberação).
      </p>
      {erro && <p className="dspa-erro" role="alert">{erro}</p>}
      <div className="dspa-grade rolagem"><table className="grade">
        <thead><tr><th>Habilitado</th><th>Acessa</th><th>Código</th><th>Descrição (quem / onde)</th><th>Último usuário</th><th>Último acesso</th><th>IP</th><th>Navegador</th><th /></tr></thead>
        <tbody>
          {itens.map((i) => (
            <tr key={i.id} className={i.ativo ? '' : 'dspa-pend'}>
              <td className="c"><input type="checkbox" checked={i.ativo} onChange={(e) => salva(i, { ativo: e.target.checked })} aria-label={`Habilitar ${i.codigo}`} /></td>
              <td className="dspa-areas">
                {[['faturamento', 'Faturamento'], ['fabrica', 'Fábrica']].map(([a, r]) => (
                  <label key={a} title={a === 'fabrica' ? 'Sem login (usuário fabrica), só telas da fábrica' : 'Sistema completo, com login'}><input type="checkbox" checked={i.areas.includes(a)}
                    onChange={(e) => { const n = e.target.checked ? [...new Set([...i.areas, a])] : i.areas.filter((x) => x !== a); if (n.length) salva(i, { areas: n }); }} />{r}</label>))}
              </td>
              <td><code>{i.codigo}</code>{i.codigo === dados.meu && <small className="dspa-eu"> este aqui</small>}</td>
              <td><input className="dspa-desc" defaultValue={i.descricao} maxLength={80} placeholder="ex.: Faturamento — Ingrid" onBlur={(e) => { if (e.target.value.trim() !== i.descricao) salva(i, { descricao: e.target.value }); }} /></td>
              <td>{i.ultimo_usuario || '—'}</td><td>{dh(i.ultimo_acesso)}</td><td>{i.ultimo_ip || '—'}</td><td title={i.navegador}>{resumoUA(i.navegador)}</td>
              <td className="dspa-ac">
                {!i.ativo && (
                  <select className="dspa-assume" value="" title="Este computador mudou de número? Escolha o número antigo para passar a liberação para este" onChange={(e) => assume(i, e.target.value)}>
                    <option value="">{provavel(i) ? `↪ Era ${provavel(i).descricao || provavel(i).codigo}? (mesmo IP e navegador)` : '↪ Assumir lugar de…'}</option>
                    {dados.itens.filter((x) => x.id !== i.id).map((x) => <option key={x.id} value={x.id}>{x.descricao || '(sem descrição)'} — {x.codigo}{x.ativo ? '' : ' (pendente)'}</option>)}
                  </select>)}
                <button type="button" title="Copiar código" onClick={() => copiaTexto(i.codigo)}>📋</button><button type="button" className="lx" title="Excluir" onClick={() => exclui(i)}>🗑</button></td>
            </tr>))}
          {dados && !itens.length && <tr className="semlinha"><td colSpan={9} className="vazio">&lt;Nenhum dispositivo nesta visão&gt;</td></tr>}
        </tbody>
      </table></div>
    </section>
  );
}
