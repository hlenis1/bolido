import React, { useState } from 'react';
import { apiFetch, notificarPushLocal } from '../api';
import { Car, User, ShieldCheck, Upload } from 'lucide-react';

export default function AuthPage({ onLogin }) {
  const [modo, setModo] = useState('LOGIN'); // LOGIN, REG_PASAJERO, REG_CONDUCTOR
  const [form, setForm] = useState({ nombre: '', apellido: '', telefono: '', password: '', placa: '', color_vehiculo: '' });
  const [archivos, setArchivos] = useState({});
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ telefono: form.telefono, password: form.password }),
      });
      localStorage.setItem('bolido_token', data.token);
      localStorage.setItem('bolido_user', JSON.stringify(data.usuario));
      notificarPushLocal('Bienvenido a Bólido', `Hola ${data.usuario.nombre}, notificaciones activas.`);
      onLogin(data.usuario);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  const handleRegistroPasajero = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      await apiFetch('/api/auth/registro-pasajero', {
        method: 'POST',
        body: JSON.stringify({
          nombre: form.nombre,
          apellido: form.apellido,
          telefono: form.telefono,
          password: form.password,
        }),
      });
      setMensaje('¡Registro exitoso! Ahora inicia sesión.');
      setModo('LOGIN');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  const handleRegistroConductor = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      Object.entries(archivos).forEach(([k, file]) => fd.append(k, file));

      const data = await apiFetch('/api/auth/registro-conductor', {
        method: 'POST',
        body: fd,
      });
      setMensaje(data.mensaje);
      setModo('LOGIN');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  const camposFotos = [
    { key: 'foto_perfil', label: 'Foto del Conductor (Rostro claro)' },
    { key: 'foto_vehiculo_frente', label: 'Foto de Frente del Vehículo (Placa visible)' },
    { key: 'foto_cedula_frente', label: 'Cédula - Lado Frontal' },
    { key: 'foto_cedula_reverso', label: 'Cédula - Lado Reverso' },
    { key: 'foto_licencia', label: 'Licencia de Conducción' },
    { key: 'foto_tarjeta_propiedad', label: 'Tarjeta de Propiedad del Vehículo' },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/30">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-black tracking-tight text-amber-400">⚡ BÓLIDO</h1>
          <p className="text-slate-400 text-sm mt-1">Negocia tu tarifa. Muévete rápido.</p>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-6 bg-slate-950 p-1 rounded-xl">
          <button onClick={() => { setModo('LOGIN'); setError(''); }} className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 ${modo === 'LOGIN' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}>
            <ShieldCheck size={15} /> Entrar
          </button>
          <button onClick={() => { setModo('REG_PASAJERO'); setError(''); }} className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 ${modo === 'REG_PASAJERO' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}>
            <User size={15} /> Soy Pasajero
          </button>
          <button onClick={() => { setModo('REG_CONDUCTOR'); setError(''); }} className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 ${modo === 'REG_CONDUCTOR' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}>
            <Car size={15} /> Soy Conductor
          </button>
        </div>

        {error && <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500 text-red-200 text-sm">{error}</div>}
        {mensaje && <div className="mb-4 p-3 rounded-lg bg-emerald-500/20 border border-emerald-500 text-emerald-200 text-sm">{mensaje}</div>}

        {modo === 'LOGIN' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <input required placeholder="Número de teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700" />
            <input required type="password" placeholder="Contraseña" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700" />
            <button disabled={cargando} className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black transition">
              {cargando ? 'Ingresando...' : 'INICIAR SESIÓN'}
            </button>
            <p className="text-xs text-center text-slate-500 pt-2">
              Admin demo: Tel <span className="text-slate-300">3000000000</span> / Clave <span className="text-slate-300">admin123</span>
            </p>
          </form>
        )}

        {modo === 'REG_PASAJERO' && (
          <form onSubmit={handleRegistroPasajero} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="p-3 rounded-xl bg-slate-800 border border-slate-700" />
              <input required placeholder="Apellido" value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} className="p-3 rounded-xl bg-slate-800 border border-slate-700" />
            </div>
            <input required placeholder="Número de teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700" />
            <input required type="password" placeholder="Crea una contraseña" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700" />
            <button disabled={cargando} className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black">
              {cargando ? 'Registrando...' : 'CREAR CUENTA PASAJERO'}
            </button>
          </form>
        )}

        {modo === 'REG_CONDUCTOR' && (
          <form onSubmit={handleRegistroConductor} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="p-3 rounded-xl bg-slate-800 border border-slate-700" />
              <input required placeholder="Apellido" value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} className="p-3 rounded-xl bg-slate-800 border border-slate-700" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="p-3 rounded-xl bg-slate-800 border border-slate-700" />
              <input required type="password" placeholder="Contraseña" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="p-3 rounded-xl bg-slate-800 border border-slate-700" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="Placa (Ej: ABC123)" value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value })} className="p-3 rounded-xl bg-slate-800 border border-slate-700 uppercase" />
              <input required placeholder="Color del vehículo" value={form.color_vehiculo} onChange={(e) => setForm({ ...form, color_vehiculo: e.target.value })} className="p-3 rounded-xl bg-slate-800 border border-slate-700" />
            </div>

            <div className="space-y-2 pt-2">
              <p className="text-xs font-bold text-amber-400 uppercase">Documentos y Fotos Obligatorias:</p>
              {camposFotos.map((c) => (
                <label key={c.key} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 cursor-pointer hover:border-amber-500 text-xs">
                  <span className="truncate pr-2">{archivos[c.key] ? `✅ ${archivos[c.key].name}` : c.label}</span>
                  <Upload size={16} className="text-amber-400 shrink-0" />
                  <input required type="file" accept="image/*" className="hidden" onChange={(e) => setArchivos({ ...archivos, [c.key]: e.target.files[0] })} />
                </label>
              ))}
            </div>

            <button disabled={cargando} className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black">
              {cargando ? 'Subiendo documentos...' : 'ENVIAR SOLICITUD DE CONDUCTOR'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
