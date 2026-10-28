import { useEffect, useState } from 'react';
import { iso } from '../lib/rules.js';

const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const ini = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - ini) / 86400000 + 1) / 7);
};

/** Calendário mensal com número da semana, como o TcxDateNavigator da tela antiga. */
export default function Calendario({ data, onChange }) {
  const [ano, mes] = data.split('-').map(Number);
  const [vis, setVis] = useState({ ano, mes });
  useEffect(() => setVis({ ano, mes }), [ano, mes]);

  const primeiro = new Date(vis.ano, vis.mes - 1, 1);
  const inicio = new Date(vis.ano, vis.mes - 1, 1 - primeiro.getDay());
  const semanas = Array.from({ length: 6 }, (_, s) => Array.from({ length: 7 }, (_, d) => {
    const dia = new Date(inicio); dia.setDate(inicio.getDate() + s * 7 + d); return dia;
  }));
  const mover = (n) => setVis((v) => { const d = new Date(v.ano, v.mes - 1 + n, 1); return { ano: d.getFullYear(), mes: d.getMonth() + 1 }; });
  const titulo = primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const hojeIso = iso(new Date());

  return (
    <div className="cal">
      <div className="cal-topo">
        <button type="button" onClick={() => mover(-1)} aria-label="Mês anterior">◀</button>
        <strong>{titulo}</strong>
        <button type="button" onClick={() => mover(1)} aria-label="Próximo mês">▶</button>
      </div>
      <table>
        <thead><tr><th />{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((l, i) => <th key={i}>{l}</th>)}</tr></thead>
        <tbody>
          {semanas.map((sem) => (
            <tr key={iso(sem[0])}>
              <td className="sem">{isoWeek(sem[3])}</td>
              {sem.map((d) => {
                const v = iso(d);
                const cls = [d.getMonth() + 1 !== vis.mes ? 'fora' : '', v === data ? 'sel' : '', v === hojeIso ? 'hoje' : ''].join(' ');
                return <td key={v}><button type="button" className={cls} onClick={() => onChange(v)}>{d.getDate()}</button></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
