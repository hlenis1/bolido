import React, { useEffect, useState } from 'react';
import { apiFetch, API_URL } from '../api';
import { Settings, Users, Wallet, UserPlus, CheckCircle, XCircle, Edit3, KeyRound, TrendingUp, DollarSign } from 'lucide-react';

export default function AdminDashboard({ user, onLogout }) {
  const [tab, setTab] = useState('GANANCIAS');
  const [config, setConfig] = useState({
    porcentaje_comision: 10, valor_por_km: 1200, radio_busqueda_km: 15, nequi_numero: '', llave_bre_b: '', instrucciones_pago: ''
  });
  const [ganancias, setGanancias] = useState({
    resumen: { total_viajes: 0, volumen_bruto: 0, ganancia_total_comisiones: 0, ganancia_hoy: 0, ganancia_mes: 0, total_recargas_aprobadas: 0 },
    porConductor: [],
    historial: [],
  });
  const [usuarios, setUsuarios] = useState([]);
  const [filtroRol, setFiltroRol] = useState('TODOS');
  const [recargas, setRecargas] = useState([]);

  const [nuevoUser, setNuevoUser] = useState({
    rol: 'PASAJERO', nombre: '', apellido: '', telefono: '', password: '',
    marca_vehiculo: '', anio_vehiculo: '', placa: '', color_vehiculo: '', saldo_inicial: 0
  });

  const [editando, setEditando] = useState(null);
  const [msg, setMsg] = useState('');

  const cargarTodo = async () => {
    try {
      const [cfg, listUsers, recs, fin] = await Promise.all([
        apiFetch('/api/admin/configuracion'),
        apiFetch('/api/admin/usuarios'),
        apiFetch('/api/admin/recargas'),
        apiFetch('/api/admin/ganancias'),
      ]);
      if (cfg) setConfig(cfg);
      setUsuarios(listUsers);
      setRecargas(recs);
      if (fin) setGanancias(fin);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { cargarTodo(); }, []);

  const mostrarAviso = (texto) => {
    setMsg(texto);
    setTimeout(() => setMsg(''), 3500);
  };

  const guardarConfig = async (e) => {
    e.preventDefault();
    await apiFetch('/api/admin/configuracion', { method: 'PUT', body: JSON.stringify(config) });
    mostrarAviso('✅ Tarifas y métodos de pago actualizados');
  };

  const cambiarEstadoConductor = async (id, estado) => {
    await apiFetch(`/api/admin/conductores/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado }) });
    mostrarAviso(`✅ Estado cambiado a ${estado}`);
    cargarTodo();
  };

  const aprobarRecarga = async (id) => {
    await apiFetch(`/api/admin/recargas/${id}/aprobar`, { method: 'POST' });
    mostrarAviso('✅ Saldo cargado al conductor');
    cargarTodo();
  };

  const crearUsuarioManual = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(nuevoUser).forEach(([k, v]) => fd.append(k, v));
    await apiFetch('/api/admin/crear-usuario', { method: 'POST', body: fd });
    mostrarAviso(`✅ ${nuevoUser.rol} creado correctamente`);
    setNuevoUser({
      rol: 'PASAJERO', nombre: '', apellido: '', telefono: '', password: '',
      marca_vehiculo: '', anio_vehiculo: '', placa: '', color_vehiculo: '', saldo_inicial: 0
    });
    cargarTodo();
  };

  const guardarEdicionUsuario = async (e) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/admin/usuarios/${editando.id}`, {
        method: 'PUT',
        body: JSON.stringify(editando),
      });
      mostrarAviso('✅ Datos y/o contraseña actualizados');
      setEditando(null);
      cargarTodo();
    } catch (err) {
      alert(err.message);
    }
  };

  const usuariosFiltrados = usuarios.filter((u) => filtroRol === 'TODOS' || u.rol === filtroRol);
  const { resumen, porConductor, historial } = ganancias;

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-wrap justify-between items-center gap-4 pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-black text-amber-400">⚡ BÓLIDO — PANEL ADMINISTRATIVO</h1>
            <p className="text-xs text-slate-400">Administrador: {user.nombre} {user.apellido}</p>
          </div>
          <button onClick={onLogout} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-red-900/40 text-sm">Cerrar Sesión</button>
        </header>

        {msg && <div className="my-4 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500 text-emerald-300 text-sm">{msg}</div>}

        <div className="flex flex-wrap gap-2 my-6">
          {[
            { id: 'GANANCIAS', label: 'Ganancias Plataforma', icon: TrendingUp },
            { id: 'CONFIG', label: 'Tarifas y Pagos (Nequi/Bre-B)', icon: Settings },
            { id: 'RECARGAS', label: `Recargas (${recargas.filter(r => r.estado === 'PENDIENTE').length})`, icon: Wallet },
            { id: 'USUARIOS', label: `Usuarios y Conductores (${usuarios.length})`, icon: Users },
            { id: 'CREAR', label: 'Registrar Usuario/Conductor', icon: UserPlus },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 ${tab === t.id ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-300'}`}>
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>

        {/* PESTAÑA: GANANCIAS DE LA PLATAFORMA */}
        {tab === 'GANANCIAS' && (
          <div className="space-y-6">
            {/* Tarjetas de Resumen */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 p-5 rounded-2xl border border-emerald-500/40">
                <p className="text-xs text-slate-400 uppercase font-bold">Ganancia Total Comisiones</p>
                <p className="text-3xl font-black text-emerald-400 mt-1">
                  ${Number(resumen.ganancia_total_comisiones).toLocaleString()} <span className="text-xs">COP</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">En {resumen.total_viajes} carreras cobradas</p>
              </div>

              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <p className="text-xs text-slate-400 uppercase font-bold">Ganancia de Hoy</p>
                <p className="text-2xl font-black text-amber-400 mt-1">
                  ${Number(resumen.ganancia_hoy).toLocaleString()} <span className="text-xs">COP</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Este mes: ${Number(resumen.ganancia_mes).toLocaleString()} COP</p>
              </div>

              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <p className="text-xs text-slate-400 uppercase font-bold">Volumen Total Carreras</p>
                <p className="text-2xl font-black text-white mt-1">
                  ${Number(resumen.volumen_bruto).toLocaleString()} <span className="text-xs">COP</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Comisión actual: {config.porcentaje_comision}%</p>
              </div>

              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <p className="text-xs text-slate-400 uppercase font-bold">Recargas Aprobadas</p>
                <p className="text-2xl font-black text-sky-400 mt-1">
                  ${Number(resumen.total_recargas_aprobadas).toLocaleString()} <span className="text-xs">COP</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Ingresado vía Nequi / Bre-B</p>
              </div>
            </div>

            {/* Desglose por Conductor */}
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-3">
              <h2 className="font-bold text-amber-400 flex items-center gap-2"><DollarSign size={18} /> Comisión Generada por Conductor</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5">Conductor</th>
                      <th className="py-2.5">Placa</th>
                      <th className="py-2.5">Viajes</th>
                      <th className="py-2.5">Total Facturado</th>
                      <th className="py-2.5 text-right">Comisión Plataforma</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {porConductor.map((c) => (
                      <tr key={c.id}>
                        <td className="py-3 font-bold">{c.nombre} {c.apellido}</td>
                        <td className="py-3 text-amber-400 font-mono">{c.placa}</td>
                        <td className="py-3">{c.viajes_realizados}</td>
                        <td className="py-3 text-slate-300">${Number(c.total_facturado).toLocaleString()} COP</td>
                        <td className="py-3 text-right font-black text-emerald-400">${Number(c.comision_generada).toLocaleString()} COP</td>
                      </tr>
                    ))}
                    {porConductor.length === 0 && (
                      <tr><td colSpan="5" className="py-4 text-center text-slate-500">Aún no hay conductores registrados.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Historial de Carreras y Comisiones */}
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-3">
              <h2 className="font-bold text-amber-400">Historial Detallado de Comisiones por Carrera</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5">Fecha</th>
                      <th className="py-2.5">Conductor (Placa)</th>
                      <th className="py-2.5">Pasajero</th>
                      <th className="py-2.5">Ruta</th>
                      <th className="py-2.5">Valor Carrera</th>
                      <th className="py-2.5 text-right">Ganancia Bólido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {historial.map((v) => (
                      <tr key={v.id}>
                        <td className="py-3 text-slate-400">{new Date(v.creado_en).toLocaleDateString()}</td>
                        <td className="py-3 font-bold">{v.conductor_nombre} <span className="text-amber-400">({v.placa})</span></td>
                        <td className="py-3">{v.pasajero_nombre}</td>
                        <td className="py-3 max-w-xs truncate text-slate-300">{v.origen_texto} → {v.destino_texto}</td>
                        <td className="py-3">${Number(v.tarifa_final_acordada).toLocaleString()}</td>
                        <td className="py-3 text-right font-black text-emerald-400">+${Number(v.comision_cobrada).toLocaleString()} COP</td>
                      </tr>
                    ))}
                    {historial.length === 0 && (
                      <tr><td colSpan="6" className="py-4 text-center text-slate-500">Aún no se han cobrado comisiones de carreras.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA: CONFIGURACIÓN */}
        {tab === 'CONFIG' && (
          <form onSubmit={guardarConfig} className="bg-slate-900 p-6 rounded-2xl border border-slate-800 max-w-2xl space-y-4">
            <h2 className="text-lg font-bold text-amber-400">Comisiones, Valor por KM y Cuentas de Recarga</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-slate-400">Comisión Plataforma (%)</label>
                <input type="number" step="0.1" value={config.porcentaje_comision} onChange={(e) => setConfig({ ...config, porcentaje_comision: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-slate-800 border border-slate-700" />
              </div>
              <div>
                <label className="text-xs text-slate-400">Valor Sugerido por KM (COP)</label>
                <input type="number" value={config.valor_por_km} onChange={(e) => setConfig({ ...config, valor_por_km: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-slate-800 border border-slate-700" />
              </div>
              <div>
                <label className="text-xs text-slate-400">Radio Solicitudes Conductor (KM)</label>
                <input type="number" min="1" max="200" step="1" value={config.radio_busqueda_km ?? 15} onChange={(e) => setConfig({ ...config, radio_busqueda_km: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-slate-800 border border-slate-700 font-bold text-amber-400" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400">Número Nequi para Recargas</label>
                <input value={config.nequi_numero || ''} onChange={(e) => setConfig({ ...config, nequi_numero: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-slate-800 border border-slate-700" />
              </div>
              <div>
                <label className="text-xs text-slate-400">Llave Bre-B para Recargas</label>
                <input value={config.llave_bre_b || ''} onChange={(e) => setConfig({ ...config, llave_bre_b: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-slate-800 border border-slate-700" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400">Instrucciones de Pago para Conductores</label>
              <textarea rows="2" value={config.instrucciones_pago || ''} onChange={(e) => setConfig({ ...config, instrucciones_pago: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-slate-800 border border-slate-700" />
            </div>
            <button className="px-6 py-3 rounded-xl bg-amber-500 text-slate-950 font-black">GUARDAR CONFIGURACIÓN</button>
          </form>
        )}

        {/* PESTAÑA: RECARGAS */}
        {tab === 'RECARGAS' && (
          <div className="space-y-3">
            {recargas.map((r) => (
              <div key={r.id} className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex flex-wrap justify-between items-center gap-4">
                <div>
                  <p className="font-bold">{r.nombre} {r.apellido} <span className="text-amber-400">({r.placa})</span></p>
                  <p className="text-sm text-slate-300">Monto: <strong className="text-emerald-400">${Number(r.monto).toLocaleString()} COP</strong> • Método: <strong>{r.metodo_pago}</strong></p>
                  <p className="text-xs text-slate-400">Ref: <span className="text-white font-mono">{r.numero_referencia}</span></p>
                  {r.comprobante_url && (
                    <a href={`${API_URL}${r.comprobante_url}`} target="_blank" rel="noreferrer" className="text-xs text-amber-400 underline mt-1 inline-block">Ver foto del comprobante</a>
                  )}
                </div>
                <div>
                  {r.estado === 'PENDIENTE' ? (
                    <button onClick={() => aprobarRecarga(r.id)} className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-sm">
                      Aprobar y Cargar Saldo
                    </button>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">{r.estado}</span>
                  )}
                </div>
              </div>
            ))}
            {recargas.length === 0 && <p className="text-slate-500">No hay solicitudes de recarga aún.</p>}
          </div>
        )}

        {/* PESTAÑA: USUARIOS Y CONDUCTORES */}
        {tab === 'USUARIOS' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {['TODOS', 'CONDUCTOR', 'PASAJERO'].map((f) => (
                <button key={f} onClick={() => setFiltroRol(f)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filtroRol === f ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-400'}`}>
                  {f === 'TODOS' ? 'Todos' : f === 'CONDUCTOR' ? 'Conductores' : 'Pasajeros'}
                </button>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {usuariosFiltrados.map((u) => (
                <div key={u.id} className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${u.rol === 'CONDUCTOR' ? 'bg-amber-500/20 text-amber-400' : 'bg-sky-500/20 text-sky-400'}`}>
                        {u.rol}
                      </span>
                      <h3 className="font-bold text-lg mt-1">{u.nombre} {u.apellido}</h3>
                      <p className="text-xs text-slate-400">Tel: <strong className="text-slate-200">{u.telefono}</strong></p>

                      {u.rol === 'CONDUCTOR' && (
                        <div className="mt-2 p-2.5 rounded-xl bg-slate-950 text-xs space-y-1">
                          <p>🚗 <strong>{u.marca_vehiculo || 'Sin marca'}</strong> ({u.anio_vehiculo || 'N/A'})</p>
                          <p>🪪 Placa: <strong className="text-amber-400">{u.placa}</strong> • Color: <strong>{u.color_vehiculo}</strong></p>
                          <p>💰 Saldo: <strong className="text-emerald-400">${Number(u.saldo_disponible || 0).toLocaleString()} COP</strong></p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${u.estado_cuenta === 'APROBADO' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {u.estado_cuenta}
                      </span>
                      <button
                        onClick={() => setEditando({ ...u, password: '' })}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-xs font-bold flex items-center gap-1 transition"
                      >
                        <Edit3 size={13} /> Editar / Clave
                      </button>
                    </div>
                  </div>

                  {u.rol === 'CONDUCTOR' && (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {[
                          { label: 'Conductor', url: u.foto_perfil_url },
                          { label: 'Carro Frente', url: u.foto_vehiculo_frente_url },
                          { label: 'Cédula Frente', url: u.foto_cedula_frente_url },
                          { label: 'Cédula Reverso', url: u.foto_cedula_reverso_url },
                          { label: 'Licencia', url: u.foto_licencia_url },
                          { label: 'Propiedad', url: u.foto_tarjeta_propiedad_url },
                        ].map((doc) => doc.url && (
                          <a key={doc.label} href={`${API_URL}${doc.url}`} target="_blank" rel="noreferrer" className="p-2 bg-slate-800 rounded-lg text-center hover:bg-slate-700 text-amber-300 truncate">
                            Ver {doc.label}
                          </a>
                        ))}
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button onClick={() => cambiarEstadoConductor(u.id, 'APROBADO')} className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold flex items-center justify-center gap-1">
                          <CheckCircle size={14} /> Aprobar
                        </button>
                        <button onClick={() => cambiarEstadoConductor(u.id, 'RECHAZADO')} className="flex-1 py-2 rounded-xl bg-red-600/80 hover:bg-red-500 text-xs font-bold flex items-center justify-center gap-1">
                          <XCircle size={14} /> Rechazar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PESTAÑA: CREAR USUARIO O CONDUCTOR */}
        {tab === 'CREAR' && (
          <form onSubmit={crearUsuarioManual} className="bg-slate-900 p-6 rounded-2xl border border-slate-800 max-w-lg space-y-3">
            <h2 className="text-lg font-bold text-amber-400">Registrar Usuario o Conductor desde Admin</h2>
            <select value={nuevoUser.rol} onChange={(e) => setNuevoUser({ ...nuevoUser, rol: e.target.value })} className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700">
              <option value="PASAJERO">Pasajero</option>
              <option value="CONDUCTOR">Conductor</option>
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="Nombre" value={nuevoUser.nombre} onChange={(e) => setNuevoUser({ ...nuevoUser, nombre: e.target.value })} className="p-3 rounded-xl bg-slate-800 border border-slate-700" />
              <input required placeholder="Apellido" value={nuevoUser.apellido} onChange={(e) => setNuevoUser({ ...nuevoUser, apellido: e.target.value })} className="p-3 rounded-xl bg-slate-800 border border-slate-700" />
            </div>
            <input required placeholder="Teléfono" value={nuevoUser.telefono} onChange={(e) => setNuevoUser({ ...nuevoUser, telefono: e.target.value })} className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700" />
            <input required type="password" placeholder="Contraseña" value={nuevoUser.password} onChange={(e) => setNuevoUser({ ...nuevoUser, password: e.target.value })} className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700" />

            {nuevoUser.rol === 'CONDUCTOR' && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <input required placeholder="Marca (Ej: Kia Picanto)" value={nuevoUser.marca_vehiculo} onChange={(e) => setNuevoUser({ ...nuevoUser, marca_vehiculo: e.target.value })} className="p-3 rounded-xl bg-slate-800 border border-slate-700" />
                  <input required type="number" placeholder="Año (Ej: 2022)" value={nuevoUser.anio_vehiculo} onChange={(e) => setNuevoUser({ ...nuevoUser, anio_vehiculo: e.target.value })} className="p-3 rounded-xl bg-slate-800 border border-slate-700" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input required placeholder="Placa" value={nuevoUser.placa} onChange={(e) => setNuevoUser({ ...nuevoUser, placa: e.target.value })} className="p-3 rounded-xl bg-slate-800 border border-slate-700 uppercase" />
                  <input required placeholder="Color" value={nuevoUser.color_vehiculo} onChange={(e) => setNuevoUser({ ...nuevoUser, color_vehiculo: e.target.value })} className="p-3 rounded-xl bg-slate-800 border border-slate-700" />
                  <input type="number" placeholder="Saldo inicial" value={nuevoUser.saldo_inicial} onChange={(e) => setNuevoUser({ ...nuevoUser, saldo_inicial: e.target.value })} className="p-3 rounded-xl bg-slate-800 border border-slate-700" />
                </div>
              </div>
            )}
            <button className="w-full py-3 rounded-xl bg-amber-500 text-slate-950 font-black">CREAR USUARIO</button>
          </form>
        )}
      </div>

      {/* MODAL DE EDICIÓN */}
      {editando && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <form onSubmit={guardarEdicionUsuario} className="bg-slate-900 border border-amber-500/40 p-6 rounded-2xl max-w-lg w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-black text-lg text-amber-400 flex items-center gap-2">
              <Edit3 size={18} /> Editar {editando.rol === 'CONDUCTOR' ? 'Conductor' : 'Pasajero'}
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Nombre</label>
                <input required value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} className="w-full mt-1 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400">Apellido</label>
                <input required value={editando.apellido} onChange={(e) => setEditando({ ...editando, apellido: e.target.value })} className="w-full mt-1 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Teléfono</label>
                <input required value={editando.telefono} onChange={(e) => setEditando({ ...editando, telefono: e.target.value })} className="w-full mt-1 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400">Estado de Cuenta</label>
                <select value={editando.estado_cuenta} onChange={(e) => setEditando({ ...editando, estado_cuenta: e.target.value })} className="w-full mt-1 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm">
                  <option value="APROBADO">APROBADO</option>
                  <option value="PENDIENTE">PENDIENTE</option>
                  <option value="RECHAZADO">RECHAZADO</option>
                  <option value="BLOQUEADO">BLOQUEADO</option>
                </select>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <label className="text-xs text-amber-400 font-bold flex items-center gap-1">
                <KeyRound size={13} /> Cambiar Contraseña (dejar vacío para no cambiar)
              </label>
              <input
                type="password"
                placeholder="Escribe nueva clave solo si deseas cambiarla..."
                value={editando.password}
                onChange={(e) => setEditando({ ...editando, password: e.target.value })}
                className="w-full mt-1.5 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm"
              />
            </div>

            {editando.rol === 'CONDUCTOR' && (
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <p className="text-xs font-bold text-slate-400 uppercase">Datos del Vehículo y Saldo</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400">Marca del Vehículo</label>
                    <input value={editando.marca_vehiculo || ''} onChange={(e) => setEditando({ ...editando, marca_vehiculo: e.target.value })} className="w-full mt-1 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Año</label>
                    <input value={editando.anio_vehiculo || ''} onChange={(e) => setEditando({ ...editando, anio_vehiculo: e.target.value })} className="w-full mt-1 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-slate-400">Placa</label>
                    <input value={editando.placa || ''} onChange={(e) => setEditando({ ...editando, placa: e.target.value })} className="w-full mt-1 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm uppercase" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Color</label>
                    <input value={editando.color_vehiculo || ''} onChange={(e) => setEditando({ ...editando, color_vehiculo: e.target.value })} className="w-full mt-1 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Saldo (COP)</label>
                    <input type="number" value={editando.saldo_disponible || 0} onChange={(e) => setEditando({ ...editando, saldo_disponible: e.target.value })} className="w-full mt-1 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm font-bold text-emerald-400" />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setEditando(null)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-xs font-bold">Cancelar</button>
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-black">GUARDAR CAMBIOS</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
