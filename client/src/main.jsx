import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Preview sem banco: `VITE_MOCK=1 npm run build` simula a API em memória.
const iniciar = () => createRoot(document.getElementById('root')).render(<App />);
if (import.meta.env.VITE_MOCK) import('./mock.js').then((m) => { m.instalarMock(); iniciar(); });
else iniciar();
