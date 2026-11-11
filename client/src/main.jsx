import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import NovaVersao from './components/NovaVersao.jsx';
import './styles.css';
import { aplicarTema } from './lib/tema.js';
import { instalaSetasGrade } from './lib/setasGrade.js';

document.title = 'AppBakery';
aplicarTema(); // cores salvas em Ferramentas › Aparência
instalaSetasGrade(); // ↑ ↓ passeiam pelos registros de qualquer grade

// Preview sem banco: `VITE_MOCK=1 npm run build` simula a API em memória.
const iniciar = () => createRoot(document.getElementById('root')).render(<><App /><NovaVersao /></>);
if (import.meta.env.VITE_MOCK) import('./mock.js').then((m) => { m.instalarMock(); iniciar(); });
else iniciar();
