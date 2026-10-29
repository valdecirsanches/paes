// Número do dispositivo: cópia no armazenamento do site; vai em todo pedido (x-dispositivo) para o servidor restaurar o cookie se ele for apagado.
const CHAVE_DISP = 'paes_dispositivo';
export const guardaDispositivo = (c) => { try { if (c) localStorage.setItem(CHAVE_DISP, c); } catch { /* sem armazenamento */ } };
const lerDispositivo = () => { try { return localStorage.getItem(CHAVE_DISP) || ''; } catch { return ''; } };
try { navigator.storage?.persist?.(); } catch { /* opcional: pede ao navegador para não apagar os dados do site */ }
async function req(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(lerDispositivo() ? { 'x-dispositivo': lerDispositivo() } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw Object.assign(new Error('Sem comunicação com o servidor (a API pode estar reiniciando). Tente de novo em instantes.'), { status: 0, rede: true }); }
  const data = await res.json().catch(() => ({}));
  api.ultimoTiming = res.headers.get('server-timing') || '';
  if (path === '/dispositivo' && data.codigo) guardaDispositivo(data.codigo); // guarda a cópia do número
  if (res.status === 401 && data.login) window.dispatchEvent(new Event('sessao-expirada'));
  if (res.status === 403 && data.code === 'DISPOSITIVO_NAO_HABILITADO') window.dispatchEvent(new CustomEvent('dispositivo-bloqueado', { detail: data }));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Erro inesperado.'), { status: res.status, data });
  // faturar/gerar/emitir/cancelar mexem nas notas: avisa as outras telas abertas (ex.: Nota Fiscal Eletrônica) para recarregarem
  if (method !== 'GET' && /^\/(faturamento|nfe|comandas)/.test(path)) window.dispatchEvent(new CustomEvent('nfe-alterada', { detail: { path } }));
  return data;
}
/** Envia um arquivo como corpo binário (ex.: foto do funcionário). */
async function upload(path, file) {
  const res = await fetch(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...(lerDispositivo() ? { 'x-dispositivo': lerDispositivo() } : {}) }, body: file });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.login) window.dispatchEvent(new Event('sessao-expirada'));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Erro inesperado.'), { status: res.status, data });
  return data;
}
export const api = {
  upload,
  get: (p) => req('GET', p),
  post: (p, b = {}) => req('POST', p, b),
  put: (p, b) => req('PUT', p, b),
  patch: (p, b) => req('PATCH', p, b),
  del: (p) => req('DELETE', p),
};
