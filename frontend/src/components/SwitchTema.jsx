import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function SwitchTema() {
  const [oscuro, setOscuro] = useState(() => {
    const guardado = localStorage.getItem('bolido_tema');
    return guardado ? guardado === 'oscuro' : true;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (oscuro) {
      root.classList.add('tema-oscuro');
      root.classList.remove('tema-claro');
      localStorage.setItem('bolido_tema', 'oscuro');
    } else {
      root.classList.add('tema-claro');
      root.classList.remove('tema-oscuro');
      localStorage.setItem('bolido_tema', 'claro');
    }
  }, [oscuro]);

  return (
    <button
      type="button"
      onClick={() => setOscuro(!oscuro)}
      title={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-label="Cambiar tema claro u oscuro"
      className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-300 focus:outline-none ${
        oscuro
          ? 'bg-slate-800 border-slate-600'
          : 'bg-amber-200 border-amber-400'
      }`}
    >
      <span
        className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full shadow-md transition-transform duration-300 ${
          oscuro
            ? 'translate-x-1 bg-slate-950 text-amber-400'
            : 'translate-x-7 bg-white text-amber-500'
        }`}
      >
        {oscuro ? <Moon size={12} /> : <Sun size={12} />}
      </span>
    </button>
  );
}
