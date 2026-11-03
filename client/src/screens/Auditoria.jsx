import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const hoje = () => new Date().toISOString().slice(0, 10);
const dh = (v) => (v ? String(v).replace('T', ' ').slice(0, 19) : '');
const LIM = 200;

/** Auditoria (só administrador): tudo o que foi feito no app — quem, quando, de onde, o quê e o resultado. */
export default function Auditoria() {
  const [f, setF] = useState({ de: hoje(), ate: hoje(), usuario: '', entidade: '', metodo: '', idRegistro: '', q: '', erros: false });
  const [dados, setDados] = useState(null);
  const [pag, setPag] = useState(0);
  const [erro, setErro] = useState('');
  const [det, setDet] = useState(null);
  const qs = (extra = {}) => new URLSearchParams(Object.entries({ ...f, erros: f.erros ? '1' : '', ...extra }).filter(([, v]) => v !== '' && v != null)).toString();
  const busca = useCallback(async (p = 0) => {
    setErro(''); setPag(p);
    try { setDados(await api.get(`/auditoria?${qs({ limite: LIM, desloc: p * LIM })}`)); } catch (e) { setErro(e.message); }
  }, [f]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { busca(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const abre = async (id) => { try { const r = await api.get(`/auditoria/${id}`); let d = r.detalhes; try { d = JSON.stringify(JSON.parse(d), null, 2); } catch { /* texto cortado */ } setDet({ ...r, detalhes: d }); } catch (e) { setErro(e.message); } };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const total = dados?.total ?? 0;
  return (
    <section className="aud">
      <header><h2>🕵️ Auditoria</h2><small>Tudo o que é feito no app fica gravado (usuário, dispositivo, IP, rota, dados enviados sem senhas, resultado). Só o administrador vê.</small></header>
      <form className="aud-filtros" onSubmit={(e) => { e.preventDefault(); busca(0); }}>
        <label>De<input type="date" value={f.de} onChange={set('de')} /></label>
        <label>Até<input type="date" value={f.ate} onChange={set('ate')} /></label>
        <label>Usuário<select value={f.usuario} onChange={set('usuario')}><option value="">Todos</option>{(dados?.usuarios ?? []).map((u) => <option key={u}>{u}</option>)}</select></label>
        <label>Tela/entidade<select value={f.entidade} onChange={set('entidade')}><option value="">Todas</option>{(dados?.entidades ?? []).map((u) => <option key={u}>{u}</option>)}</select></label>
        <label>Método<select value={f.metodo} onChange={set('metodo')}><option value="">Todos</option>{['POST', 'PUT', 'PATCH', 'DELETE', 'GET', 'APP'].map((m) => <option key={m}>{m}</option>)}</select></label>
        <label>Nº do registro<input value={f.idRegistro} onChange={set('idRegistro')} size="8" placeholder="id" /></label>
        <label>Buscar texto<input value={f.q} onChange={set('q')} size="18" placeholder="rota, dados, erro" /></label>
        <label className="aud-chk"><input type="checkbox" checked={f.erros} onChange={set('erros')} />só erros/negações</label>
        <button type="submit" className="bt">Buscar</button>
        <a className="bt" href={`/api/auditoria/export.csv?${qs()}`}>⬇ Exportar CSV</a>
      </form>
      {erro && <p className="aud-erro">{erro}</p>}
      <div className="aud-tab">
        <table>
          <thead><tr><th>Data/hora</th><th>Usuário</th><th>Dispositivo</th><th>IP</th><th>Ação</th><th>Reg.</th><th>Status</th><th>Erro</th></tr></thead>
          <tbody>
            {(dados?.linhas ?? []).map((r) => (
              <tr key={r.id} className={`clicavel${r.status >= 400 ? ' aud-ruim' : ''}`} onClick={() => abre(r.id)} title="Ver detalhes">
                <td>{dh(r.data_hora)}</td><td>{r.usuario}</td><td>{r.dispositivo}</td><td>{r.ip}</td><td>{r.acao}</td><td>{r.id_registro}</td><td>{r.status}</td><td>{r.erro}</td>
              </tr>
            ))}
            {dados && !dados.linhas.length && <tr><td colSpan={8} className="vazio">Nada registrado para este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      <footer className="aud-pag">
        <span>{total} registro(s)</span>
        <button type="button" className="bt" disabled={pag === 0} onClick={() => busca(pag - 1)}>◀</button>
        <span>página {pag + 1} de {Math.max(1, Math.ceil(total / LIM))}</span>
        <button type="button" className="bt" disabled={(pag + 1) * LIM >= total} onClick={() => busca(pag + 1)}>▶</button>
      </footer>
      {det && (
        <div className="aud-det" role="dialog" aria-label="Detalhes do registro">
          <div>
            <header><b>Registro {det.id}</b> · {dh(det.data_hora)} · {det.usuario} · {det.ip} <button type="button" className="bt" onClick={() => setDet(null)}>Fechar</button></header>
            <p><b>{det.metodo} {det.rota}</b> → {det.status} ({det.duracao_ms} ms){det.erro ? ` · ${det.erro}` : ''}</p>
            <pre>{det.detalhes || '(sem dados)'}</pre>
          </div>
        </div>
      )}
    </section>
  );
}
