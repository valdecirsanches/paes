import 'dotenv/config';
import mysql from 'mysql2/promise';

// dateStrings: DATE -> 'YYYY-MM-DD', TIME -> 'HH:MM:SS' (sem surpresas de fuso horário)
// decimalNumbers: DECIMAL volta como number (quantidades e preços)
export const dbConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: process.env.DB_CHARSET || 'utf8mb4',
  connectTimeout: 8000,
};

export const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true, // mantém as conexões vivas: sem reconectar ao banco depois de ociosidade
  keepAliveInitialDelay: 10000,
  dateStrings: true,
  decimalNumbers: true,
});

/** Executa fn dentro de uma transação. Qualquer erro faz rollback de tudo. */
export async function tx(fn) {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const result = await fn(c);
    await c.commit();
    return result;
  } catch (err) {
    await c.rollback();
    throw err;
  } finally {
    c.release();
  }
}

/** Traduz os erros mais comuns de conexão/consulta para uma frase que diz o que fazer. */
export function explicaErroDb(err) {
  const msg = err?.message || String(err);
  switch (err?.code) {
    case 'ECONNREFUSED': return `O servidor MySQL em ${dbConfig.host}:${dbConfig.port} recusou a conexão (serviço parado ou porta errada).`;
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH': return `Não foi possível alcançar ${dbConfig.host}:${dbConfig.port}. Este computador está na mesma rede (192.168.15.x)? Firewall liberando a porta 3306?`;
    case 'ENOTFOUND': return `Host "${dbConfig.host}" não encontrado.`;
    case 'ER_ACCESS_DENIED_ERROR': return `Usuário/senha recusados para "${dbConfig.user}". Se a senha estiver certa, o MySQL pode não permitir esse usuário a partir deste computador (GRANT para '${dbConfig.user}'@'IP-desta-máquina').`;
    case 'ER_DBACCESS_DENIED_ERROR': return `O usuário "${dbConfig.user}" não tem permissão no banco "${dbConfig.database}".`;
    case 'ER_BAD_DB_ERROR': return `O banco "${dbConfig.database}" não existe nesse servidor.`;
    case 'ER_NO_SUCH_TABLE': return `Tabela não encontrada: ${msg}`;
    case 'ER_BAD_FIELD_ERROR': return `Coluna não encontrada (o esquema difere do que a API espera): ${msg}`;
    case 'ER_NOT_SUPPORTED_AUTH_MODE':
    case 'ER_AUTH_PLUGIN_ERR': return `Método de autenticação do MySQL não suportado: ${msg}`;
    default: return msg;
  }
}
