import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Busca, Campo, Chave, Confirma, Navegador, Secao, Txt, useBusca, useEdicao } from '../components/cad.jsx';
import GradeCad from '../components/GradeCad.jsx';
import FotoCamera from '../components/FotoCamera.jsx';
import { Toast } from '../components/toast.jsx';

const CAM = '/cadastros/funcionarios';
const B_FUN = ['nome', 'apelido', 'cpf', 'rg', 'cidade', 'telefone', 'celular', 'veiculo'];
const data10 = (v) => String(v ?? '').slice(0, 10);

// Cadastro de funcionários (u_funcionarios)
export default function Funcionarios({ onFechar }) {
  const [lista, setLista] = useState([]);
  const [funcoes, setFuncoes] = useState([]);
  const [inativos, setInativos] = useState(false);
  const [foco, setFoco] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [confirma, setConfirma] = useState(null);
  const [fotoVer, setFotoVer] = useState(0);
  const [semFoto, setSemFoto] = useState(false);
  const arq = useRef(null);
  const campoNome = useRef(null);
  const notificar = useCallback((tipo, m) => setAviso({ tipo, m }), []);
  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(null), 9000); return () => clearTimeout(t); }, [aviso]);

  const recarregar = useCallback(async (idFoco) => {
    try {
      const rows = await api.get(`${CAM}?inativos=${inativos ? 1 : 0}`);
      setLista(rows);
      setFoco((f) => { const alvo = idFoco ?? f; return rows.some((r) => r.id === alvo) ? alvo : rows[0]?.id ?? null; });
    } catch (e) { notificar('erro', e.message); }
  }, [inativos, notificar]);
  useEffect(() => { recarregar(); }, [recarregar]);
  useEffect(() => { api.get(`${CAM}/funcoes`).then(setFuncoes).catch(() => {}); }, []);

  const busca = useBusca(lista, B_FUN);
  const ed = useEdicao({ lista: busca.visiveis, foco, setFoco, caminho: CAM, recarregar, aviso: notificar, confirmar: setConfirma, padrao: () => ({ ativo: 'True' }), texto: (r) => `o funcionário ${r?.nome ?? ''}` });
  useEffect(() => { setSemFoto(false); }, [foco, fotoVer]);

  const [camera, setCamera] = useState(false);
  const enviarFoto = async (e) => { await enviaArquivo(e.target.files?.[0]); e.target.value = ''; };
  const enviaArquivo = async (f) => {
    if (!f) return;
    if (!ed.atual || ed.novo) { notificar('erro', 'Grave o funcionário antes de enviar a imagem.'); return; }
    if (ed.sujo) { notificar('erro', 'Grave ou cancele as alterações antes de enviar a imagem.'); return; }
    try { await api.upload(`${CAM}/${foco}/foto?nome=${encodeURIComponent(f.name)}`, f); await recarregar(foco); setFotoVer((x) => x + 1); notificar('ok', 'Imagem enviada.'); } catch (er) { notificar('erro', er.message); }
  };
  const mostraFoto = ed.atual && !ed.novo && ed.atual.foto && !semFoto;

  const off = !ed.atual && !ed.novo;
  const COLS = [['nome', 'Funcionário'], ['apelido', 'Apelido'], ['ativo', 'Ativo', 'chk']];
  return (
    <div className="cd">
      <Toast aviso={aviso} />
      <div className="cd-barra">
        <Navegador ed={ed} onEditar={() => campoNome.current?.focus()} />
        <button type="button" className="cd-btn" onClick={() => arq.current?.click()}>🖼 Imagem</button>
        <button type="button" className="cd-btn" title="Tirar foto com a câmera" onClick={() => { if (!ed.atual || ed.novo) { notificar('erro', 'Grave o funcionário antes de tirar a foto.'); return; } if (ed.sujo) { notificar('erro', 'Grave ou cancele as alterações antes de tirar a foto.'); return; } setCamera(true); }}>📷 Tirar foto</button>
        <input ref={arq} type="file" accept="image/png,image/jpeg,image/gif,image/bmp" hidden onChange={enviarFoto} />
        <button type="button" className={`cd-btn${inativos ? ' on' : ''}`} title="Alterna entre ativos e todos" onClick={() => { if (ed.sujo) { notificar('erro', 'Grave ou cancele antes.'); return; } setInativos((x) => !x); }}>{inativos ? 'Mostrando inativos' : 'Só ativos'}</button>
        <span className="cd-esp-barra" />
        <Busca busca={busca} total={lista.length} placeholder="Pesquisar (nome, CPF, cidade…)" className="larga" />
        <button type="button" className="cd-btn" title="Fechar tela de funcionários" onClick={onFechar}>Fechar</button>
      </div>
      <div className="cd-corpo cd-fun">
        {camera && <FotoCamera onFechar={() => setCamera(false)} onFoto={(f) => { setCamera(false); enviaArquivo(f); }} />}
        <aside className="cd-lado">
          <div className="cd-foto">
            {mostraFoto ? <img alt="Foto" src={`/api${CAM}/${foco}/foto?v=${fotoVer}-${ed.atual.foto}`} onError={() => setSemFoto(true)} /> : <span aria-hidden="true">👤</span>}
          </div>
          <GradeCad cols={COLS} rows={busca.visiveis} foco={foco} onSel={ed.selecionar} vazio="Nenhum funcionário" />
        </aside>
        <main className="cd-secoes cd-rola">
          <Secao titulo="Dados pessoais" icone="🧑‍🍳">
            <Campo rotulo="ID" span={1}><input value={ed.novo ? '' : ed.atual?.id ?? ''} readOnly tabIndex={-1} /></Campo>
            <Campo rotulo="Nome do funcionário" span={6}><Txt ed={ed} k="nome" ref={campoNome} /></Campo>
            <Campo rotulo="Apelido" span={3}><Txt ed={ed} k="apelido" /></Campo>
            <Chave ed={ed} k="ativo" rotulo="Ativo" span={2} />
            <Campo rotulo="Data de nascimento" span={3}><input type="date" disabled={off} value={data10(ed.v('nascimento'))} onChange={(e) => ed.set('nascimento', e.target.value)} /></Campo>
            <Campo rotulo="Estado civil" span={3}><Txt ed={ed} k="estado_civil" /></Campo>
            <Campo rotulo="Nacionalidade" span={3}><Txt ed={ed} k="nacionalidade" /></Campo>
            <Campo rotulo="RG" span={3}><Txt ed={ed} k="rg" /></Campo>
            <Campo rotulo="CPF" span={3}><Txt ed={ed} k="cpf" /></Campo>
          </Secao>
          <Secao titulo="Endereço e contato" icone="📍">
            <Campo rotulo="Endereço" span={12}><Txt ed={ed} k="endereco" /></Campo>
            <Campo rotulo="Bairro" span={4}><Txt ed={ed} k="bairro" /></Campo>
            <Campo rotulo="Cidade" span={4}><Txt ed={ed} k="cidade" /></Campo>
            <Campo rotulo="UF" span={1}><Txt ed={ed} k="estado" maxLength={2} /></Campo>
            <Campo rotulo="CEP" span={3}><Txt ed={ed} k="cep" /></Campo>
            <Campo rotulo="Telefone" span={4}><Txt ed={ed} k="telefone" /></Campo>
            <Campo rotulo="Celular" span={4}><Txt ed={ed} k="celular" /></Campo>
          </Secao>
          <Secao titulo="Trabalho" icone="💼">
            <Campo rotulo="Data de admissão" span={4}><input type="date" disabled={off} value={data10(ed.v('admissao'))} onChange={(e) => ed.set('admissao', e.target.value)} /></Campo>
            <Campo rotulo="Função" span={4}>
              <select disabled={off} value={ed.v('id_funcao') ?? ''} onChange={(e) => ed.set('id_funcao', e.target.value === '' ? null : Number(e.target.value))}>
                <option value="" />{funcoes.map((f) => <option key={f.id} value={f.id}>{f.descricao}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Veículo" span={4}><Txt ed={ed} k="veiculo" /></Campo>
          </Secao>
        </main>
      </div>
      {confirma && <Confirma texto={confirma.texto} onSim={confirma.sim} onFechar={() => setConfirma(null)} />}
    </div>
  );
}
