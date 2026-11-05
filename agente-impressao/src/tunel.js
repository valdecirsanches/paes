// Conexão do agente COM o sistema (túnel reverso): o agente chama o sistema, pega um pedido por vez (status, destinos,
// imprimir, testar), executa no próprio 127.0.0.1 e devolve o resultado. Só o agente abre conexão: funciona com o sistema
// em qualquer rede, atrás de NAT, sem porta liberada nem IP fixo. Endereço e token vêm do config.json (o instalador grava).
const ROTAS = new Set(['GET /status', 'GET /destinos', 'POST /imprimir', 'POST /testar']);
const ESPERA_MS = 40_000; // o sistema segura o pedido por ~25 s; folga para a rede

/** Estado visível na página do agente. */
export const estadoTunel = { ligado: false, conectado: false, ultimoErro: '', desde: 0 };

export function iniciaTunel({ cfg, fetchImpl = fetch, esperaErroMs = 4000, aoCorrigirUrl } = {}) {
  let parar = false; let ciclo = 0;
  const base = () => String(cfg.sistema_url ?? '').trim().replace(/\/+$/, '');
  const auth = () => ({ Authorization: `Bearer ${String(cfg.sistema_token ?? '').trim()}` });
  const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));

  /** Executa o pedido no próprio agente (127.0.0.1) e devolve { status, corpo }. */
  async function executa(job) {
    const chave = `${job.metodo} ${job.caminho}`;
    if (!ROTAS.has(chave)) return { status: 403, corpo: { message: 'Rota não liberada.' } };
    const r = await fetchImpl(`http://127.0.0.1:${cfg.porta}${job.caminho}`, {
      method: job.metodo, headers: { 'X-Agente': 'paes', ...(job.metodo === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      body: job.metodo === 'POST' ? JSON.stringify(job.corpo ?? {}) : undefined, signal: AbortSignal.timeout(120_000),
    });
    return { status: r.status, corpo: await r.json().catch(() => ({})) };
  }

  async function volta() {
    const meu = ciclo;
    estadoTunel.ligado = true;
    while (!parar && meu === ciclo) {
      if (!base() || !cfg.sistema_token) { estadoTunel.conectado = false; estadoTunel.ultimoErro = 'Informe o endereço do sistema e o token.'; await dorme(3000); continue; }
      try {
        const r = await fetchImpl(`${base()}/api/agente-tunel/proximo?versao=${encodeURIComponent(cfg.versao ?? '')}`, { headers: auth(), signal: AbortSignal.timeout(ESPERA_MS) });
        if (r.status === 401) throw new Error('O sistema recusou o token. Copie o token atual em Ferramentas › Configurar impressoras.');
        if (r.status >= 400) throw new Error(`O sistema respondeu ${r.status}.`);
        estadoTunel.conectado = true; estadoTunel.ultimoErro = ''; estadoTunel.desde ||= Date.now();
        if (r.status === 204) continue;
        const job = await r.json();
        let resp;
        try { resp = await executa(job); } catch (e) { resp = { status: 500, corpo: { message: e.message || 'Erro ao executar no agente.' } }; }
        await fetchImpl(`${base()}/api/agente-tunel/resposta`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: job.id, ...resp }), signal: AbortSignal.timeout(15_000) }).catch(() => {});
      } catch (e) {
        // endereço gravado com https, mas o sistema só fala http (ex.: servidor de desenvolvimento): corrige sozinho e tenta de novo
        if (e.cause?.code === 'ERR_SSL_WRONG_VERSION_NUMBER' && /^https:/i.test(cfg.sistema_url ?? '')) { cfg.sistema_url = cfg.sistema_url.replace(/^https:/i, 'http:'); try { aoCorrigirUrl?.(cfg.sistema_url); } catch { /* segue */ } estadoTunel.ultimoErro = 'Endereço corrigido para http.'; continue; }
        estadoTunel.conectado = false; estadoTunel.desde = 0;
        estadoTunel.ultimoErro = e.name === 'TimeoutError' ? 'O sistema não respondeu.' : (e.cause?.code ? `Sem conexão com o sistema (${e.cause.code}).` : e.message);
        await dorme(esperaErroMs);
      }
    }
  }
  volta();
  return { reinicia() { ciclo += 1; estadoTunel.conectado = false; estadoTunel.desde = 0; volta(); }, para() { parar = true; } };
}
