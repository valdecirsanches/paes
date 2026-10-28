import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { bool } from '../lib/rules.js';

/** Aba "Configurações": cadastro resumido da unidade do movimento selecionado (tbcli). */
export default function ConfigTab({ status, onChanged, notify }) {
  const [u, setU] = useState(null);
  const [sujo, setSujo] = useState(false);
  useEffect(() => {
    setSujo(false);
    if (!status) { setU(null); return; }
    api.get(`/status/${status.id}/unidade`).then(setU).catch((e) => notify.erro(e.message));
  }, [status?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!status) return <p className="vazio">Selecione uma empresa na lista.</p>;
  if (!u) return <p className="vazio">…</p>;

  const set = (k) => (e) => { setSujo(true); setU({ ...u, [k]: e.target.value }); };
  const marca = (k) => (e) => { setSujo(true); setU({ ...u, [k]: e.target.checked ? 'True' : 'False' }); };
  const gravar = async () => {
    try {
      const { id, nome, ...campos } = u; // eslint-disable-line no-unused-vars
      await api.put(`/status/${status.id}/unidade`, campos);
      setSujo(false); await onChanged(); notify.ok('Configurações gravadas.');
    } catch (e) { notify.erro(e.message); }
  };
  const T = ({ k, rot, cls }) => <label className={`cfg-c ${cls}`}><span>{rot}</span><input className="in" value={u[k] ?? ''} onChange={set(k)} /></label>;

  return (
    <section className="cfg">
      <div className="cfg-topo">
        <button type="button" className="bt larga" onClick={gravar} disabled={!sujo}>✔&nbsp;<u>G</u>ravar</button>
        <button type="button" className="bt larga" disabled={!sujo} onClick={() => api.get(`/status/${status.id}/unidade`).then((x) => { setU(x); setSujo(false); })}>✘&nbsp;Desfazer</button>
        <label className="chk"><input type="checkbox" checked={bool(u.verificar_pasta)} onChange={marca('verificar_pasta')} />Imprimir informação de pasta alterada</label>
        <label className="chk"><input type="checkbox" checked={bool(u.imprimir_toda_programacao)} onChange={marca('imprimir_toda_programacao')} />Imprimir toda programação.</label>
      </div>
      <T k="endereco" rot="Endereço" cls="w654" />
      <div className="cfg-lin"><T k="bairro" rot="Bairro" cls="w318" /><T k="cidade" rot="Cidade" cls="w330" /></div>
      <div className="cfg-lin"><T k="cep" rot="CEP" cls="w158" /><T k="uf" rot="UF" cls="w58" /></div>
      <div className="cfg-lin"><T k="telefone" rot="Telefone" cls="w318" /><T k="contato" rot="Contato" cls="w318" /></div>
    </section>
  );
}
