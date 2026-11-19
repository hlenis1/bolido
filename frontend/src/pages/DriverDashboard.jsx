import React, { useEffect, useState, useRef } from 'react';
import MapaWaze3D from '../components/MapaWaze3D';
import SwitchTema from '../components/SwitchTema';
import { apiFetch, socket, notificarPushLocal } from '../api';
import { Wallet, Radio, Send, BellRing, CheckCircle2, XOctagon, Navigation, Play, Banknote, Smartphone, TrendingUp, ExternalLink, LocateFixed } from 'lucide-react';



export default function DriverDashboard({ user, onLogout }) {
  const [perfil, setPerfil] = useState(null);
  const [config, setConfig] = useState({ nequi_numero: '', llave_bre_b: '', instrucciones_pago: '', medios_pago_activos: [] });
  const [tab, setTab] = useState('RADAR');
  const [historialData, setHistorialData] = useState({
    resumen: { total_viajes: 0, total_bruto: 0, total_comisiones: 0, ganancia_neta_total: 0, ganancia_neta_hoy: 0 },
    viajes: [],
  });
  const [enLinea, setEnLinea] = useState(() => localStorage.getItem('bolido_conductor_en_linea') !== 'false');
  const enLineaRef = useRef(enLinea);
  enLineaRef.current = enLinea;
  const [solicitudes, setSolicitudes] = useState([]);
  const [contraofertas, setContraofertas] = useState({});

  const [miUbicacion, setMiUbicacion] = useState({ lat: 3.255, lng: -76.540 });
  const miUbicacionRef = useRef(miUbicacion);
  miUbicacionRef.current = miUbicacion;
  const radioMaximoKmRef = useRef(15);
  radioMaximoKmRef.current = Number(config?.radio_busqueda_km) || 15;

  const calcularDistanciaKm = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
    const dLng = ((Number(lng2) - Number(lng1)) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((Number(lat1) * Math.PI) / 180) *
        Math.cos((Number(lat2) * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  const estaDentroDelRadio = (viaje) => {
    if (!viaje?.origen_lat || !viaje?.origen_lng) return true;
    const u = miUbicacionRef.current;
    if (!u?.lat || !u?.lng) return true;
    const dist = calcularDistanciaKm(u.lat, u.lng, viaje.origen_lat, viaje.origen_lng);
    return dist <= radioMaximoKmRef.current;
  };

  const [rutaActiva, setRutaActiva] = useState([]);
  const [rutaAB, setRutaAB] = useState([]);
  const [etaObjetivo, setEtaObjetivo] = useState(null);
  const [distObjetivo, setDistObjetivo] = useState(null);

  const [viajeCurso, setViajeCurso] = useState(null);
  const [viajeRecuperable, setViajeRecuperable] = useState(null);
  const [centrarMapaTrigger, setCentrarMapaTrigger] = useState(0);
  const [mensajes, setMensajes] = useState([]);
  const [textoChat, setTextoChat] = useState('');
  const [modalCancelar, setModalCancelar] = useState(false);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');

  const [recargaForm, setRecargaForm] = useState({ monto: '', metodo_pago: 'NEQUI', numero_referencia: '' });
  const [comprobanteFile, setComprobanteFile] = useState(null);

  const cargarDatos = async () => {
    const [p, c, hist, activoRes] = await Promise.all([
      apiFetch('/api/viajes/mi-perfil-conductor'),
      apiFetch('/api/viajes/config-publica'),
      apiFetch('/api/viajes/historial'),
      apiFetch('/api/viajes/activo').catch(() => ({ viaje: null })),
    ]);
    setPerfil(p);
    setConfig(c);
    const mediosRec = (c.medios_pago_activos || []).filter((m) => m.para_recarga);
    if (mediosRec.length > 0) {
      setRecargaForm((prev) => ({ ...prev, metodo_pago: mediosRec[0].nombre }));
    }
    if (hist) setHistorialData(hist);
    if (activoRes?.viaje) {
      setViajeRecuperable(activoRes.viaje);
      setViajeCurso((prev) => prev || activoRes.viaje);
    } else {
      setViajeRecuperable(null);
    }
  };

  const cargarSolicitudesActivas = async () => {
    if (!enLineaRef.current) {
      setSolicitudes([]);
      return;
    }
    const res = await apiFetch('/api/viajes/radar-activos').catch(() => ({ solicitudes: [] }));
    if (enLineaRef.current && Array.isArray(res?.solicitudes)) {
      setSolicitudes(res.solicitudes.filter(estaDentroDelRadio));
    }
  };

  const cambiarEstadoOperativo = async (nuevoEstado) => {
    const activo = nuevoEstado === 'EN_LINEA';
    setEnLinea(activo);
    enLineaRef.current = activo;
    localStorage.setItem('bolido_conductor_en_linea', String(activo));
    if (!activo) {
      setSolicitudes([]);
    } else {
      activarGpsReal();
      await cargarSolicitudesActivas();
    }
  };

  const activarGpsReal = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setMiUbicacion({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => alert('Activa los permisos de ubicación GPS en tu navegador o celular.'),
        { enableHighAccuracy: true }
      );
    }
  };

  useEffect(() => {
    cargarDatos();
    if (enLineaRef.current) {
      activarGpsReal();
      cargarSolicitudesActivas();
    }

    socket.on('nueva_solicitud_viaje', (viaje) => {
      if (!enLineaRef.current || !estaDentroDelRadio(viaje)) return;
      setSolicitudes((prev) => [viaje, ...prev.filter((v) => v.id !== viaje.id)]);
      notificarPushLocal('⚡ Nueva carrera en Bólido', `${viaje.origen_texto} -> ${viaje.destino_texto}`);
    });

    socket.on('viaje_cerrado_radar', ({ viaje_id }) => {
      setSolicitudes((prev) => prev.filter((v) => v.id !== viaje_id));
    });

    return () => {
      socket.off('nueva_solicitud_viaje');
      socket.off('viaje_cerrado_radar');
    };
  }, []);

  useEffect(() => {
    solicitudes.forEach((sol) => {
      socket.off(`viaje_confirmado_${sol.id}`);
      socket.on(`viaje_confirmado_${sol.id}`, ({ viaje, conductor }) => {
        if (conductor.id === user.id) {
          if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
              (pos) => setMiUbicacion({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              () => setMiUbicacion({ lat: Number(viaje.origen_lat) - 0.006, lng: Number(viaje.origen_lng) - 0.006 })
            );
          }
          setViajeCurso(viaje);
          setSolicitudes([]);
          cargarDatos();
          notificarPushLocal('🎉 ¡Oferta aceptada!', 'Dirígete al punto A a recoger al pasajero.');
        }
      });
    });
  }, [solicitudes, user.id]);

  useEffect(() => {
    if (!viajeCurso) return;
    // Respaldo ruta directa A-B mientras responde OSRM
    if (viajeCurso.origen_lat && viajeCurso.destino_lat) {
      setRutaActiva((prev) =>
        prev.length > 2
          ? prev
          : [
              [Number(viajeCurso.origen_lat), Number(viajeCurso.origen_lng)],
              [Number(viajeCurso.destino_lat), Number(viajeCurso.destino_lng)],
            ]
      );
    }
    const posInicio = miUbicacion || { lat: Number(viajeCurso.origen_lat), lng: Number(viajeCurso.origen_lng) };

    const esEnCurso = viajeCurso.estado === 'EN_CURSO';
    const targetLat = esEnCurso ? Number(viajeCurso.destino_lat) : Number(viajeCurso.origen_lat);
    const targetLng = esEnCurso ? Number(viajeCurso.destino_lng) : Number(viajeCurso.origen_lng);

    const actualizarRutaYEnviar = async () => {
      let eta = 3;
      try {
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${posInicio.lng},${posInicio.lat};${targetLng},${targetLat}?overview=full&geometries=geojson`);
        const data = await res.json();
        if (data.routes?.[0]) {
          const r = data.routes[0];
          eta = Math.max(1, Math.round(r.duration / 60));
          setRutaActiva(r.geometry.coordinates.map(([lng, lat]) => [lat, lng]));
          setEtaObjetivo(eta);
          setDistObjetivo((r.distance / 1000).toFixed(1));
        }
      } catch {}

      socket.emit('actualizar_ubicacion_conductor', {
        viaje_id: viajeCurso.id,
        lat: miUbicacion.lat,
        lng: miUbicacion.lng,
        origen_lat: esEnCurso ? null : Number(viajeCurso.origen_lat),
        origen_lng: esEnCurso ? null : Number(viajeCurso.origen_lng),
        eta_minutos: eta,
      });
    };

    actualizarRutaYEnviar();
  }, [viajeCurso, miUbicacion]);

  useEffect(() => {
    if (!viajeCurso) return;
    socket.on(`recorrido_iniciado_${viajeCurso.id}`, ({ viaje }) => {
      setViajeCurso(viaje);
      notificarPushLocal('🚀 Recorrido iniciado', 'Dirígete al punto B (destino final).');
    });
    socket.on(`chat_viaje_${viajeCurso.id}`, (msg) => setMensajes((prev) => [...prev, msg]));
    socket.on(`viaje_cancelado_${viajeCurso.id}`, (data) => {
      const infoSaldo = data.reembolsado
        ? '\n✅ El pasajero solo canceló por cambio de planes: tu comisión fue reembolsada a tu saldo.'
        : '\n⚠️ Se mantiene el descuento de la comisión por motivo de cancelación.';
      alert(`Carrera cancelada por ${data.cancelado_por}.\nMotivo: ${data.motivo}${infoSaldo}`);
      setViajeCurso(null);
    setViajeRecuperable(null);
      setMensajes([]);
      cargarDatos();
    });

    const gpsInterval = setInterval(() => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition((pos) => {
          setMiUbicacion({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        });
      }
    }, 5000);

    return () => {
      clearInterval(gpsInterval);
      socket.off(`recorrido_iniciado_${viajeCurso.id}`);
      socket.off(`chat_viaje_${viajeCurso.id}`);
      socket.off(`viaje_cancelado_${viajeCurso.id}`);
    };
  }, [viajeCurso]);

  // Abrir navegación externa en Google Maps hacia Punto A (recogida) o Punto B (destino)
  const abrirEnGoogleMaps = (latDestino, lngDestino) => {
    const origenParam = miUbicacion ? `&origin=${miUbicacion.lat},${miUbicacion.lng}` : '';
    const url = `https://www.google.com/maps/dir/?api=1${origenParam}&destination=${latDestino},${lngDestino}&travelmode=driving`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const simularAvanceCarro = () => {
    if (!viajeCurso) return;
    const esEnCurso = viajeCurso.estado === 'EN_CURSO';
    const destLat = esEnCurso ? Number(viajeCurso.destino_lat) : Number(viajeCurso.origen_lat);
    const destLng = esEnCurso ? Number(viajeCurso.destino_lng) : Number(viajeCurso.origen_lng);
    setMiUbicacion((prev) => ({
      lat: prev.lat + (destLat - prev.lat) * 0.45,
      lng: prev.lng + (destLng - prev.lng) * 0.45,
    }));
  };

  const enviarOferta = async (viaje, montoPersonalizado) => {
    try {
      const monto = montoPersonalizado || contraofertas[viaje.id] || viaje.tarifa_ofertada_pasajero;
      await apiFetch(`/api/viajes/${viaje.id}/ofertar`, {
        method: 'POST',
        body: JSON.stringify({ monto_contraoferta: Number(monto), tiempo_estimado_min: 4 }),
      });
      alert(`Oferta de $${Number(monto).toLocaleString()} enviada al pasajero.`);
    } catch (err) {
      alert(err.message);
    }
  };

  const avisarEstoyCerca = () => {
    setMiUbicacion({ lat: Number(viajeCurso.origen_lat), lng: Number(viajeCurso.origen_lng) });
    socket.emit('enviar_mensaje_chat', {
      viaje_id: viajeCurso.id,
      remitente_id: user.id,
      remitente_nombre: user.nombre,
      mensaje: '🚗 ¡Ya llegué / Estoy en el punto de recogida [A]!',
    });
  };

  const iniciarRecorrido = async () => {
    const updated = await apiFetch(`/api/viajes/${viajeCurso.id}/iniciar-recorrido`, { method: 'POST' });
    setViajeCurso(updated);
  };

  const finalizarCarrera = async () => {
    await apiFetch(`/api/viajes/${viajeCurso.id}/finalizar`, { method: 'POST' });
    alert(`¡Carrera finalizada! Recuerda cobrar $${Number(viajeCurso.tarifa_final_acordada).toLocaleString()} COP por ${viajeCurso.metodo_pago_viaje}.`);
    setViajeCurso(null);
    setViajeRecuperable(null);
    setRutaActiva([]);
    setMensajes([]);
    cargarDatos();
  };

  const enviarRecarga = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('monto', recargaForm.monto);
    fd.append('metodo_pago', recargaForm.metodo_pago);
    fd.append('numero_referencia', recargaForm.numero_referencia);
    if (comprobanteFile) fd.append('comprobante', comprobanteFile);

    await apiFetch('/api/viajes/recargas', { method: 'POST', body: fd });
    alert('✅ Comprobante enviado. El administrador validará la referencia y cargará tu saldo.');
    setRecargaForm({ monto: '', metodo_pago: 'NEQUI', numero_referencia: '' });
    setTab('RADAR');
  };

  const confirmarCancelacion = async () => {
    if (!motivoCancelacion.trim()) return alert('Escribe un motivo');
    await apiFetch(`/api/viajes/${viajeCurso.id}/cancelar`, {
      method: 'POST',
      body: JSON.stringify({ motivo: motivoCancelacion }),
    });
    setModalCancelar(false);
    setViajeCurso(null);
    setViajeRecuperable(null);
    setMensajes([]);
    cargarDatos();
  };

  
  useEffect(() => {
    if (!viajeCurso || viajeCurso.origen_lat == null || viajeCurso.destino_lat == null) {
      setRutaAB([]);
      return;
    }
    const oLat = Number(viajeCurso.origen_lat), oLng = Number(viajeCurso.origen_lng);
    const dLat = Number(viajeCurso.destino_lat), dLng = Number(viajeCurso.destino_lng);
    fetch(`https://router.project-osrm.org/route/v1/driving/${oLng},${oLat};${dLng},${dLat}?overview=full&geometries=geojson`)
      .then((r) => r.json())
      .then((d) => {
        if (d.routes?.[0]) {
          setRutaAB(d.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]));
        } else {
          setRutaAB([[oLat, oLng], [dLat, dLng]]);
        }
      })
      .catch(() => setRutaAB([[oLat, oLng], [dLat, dLng]]));
  }, [viajeCurso?.id]);

  const ubicacionCarritoEfectiva = miUbicacion || (viajeCurso && viajeCurso.origen_lat != null
    ? { lat: Number(viajeCurso.origen_lat) + 0.0012, lng: Number(viajeCurso.origen_lng) + 0.0012 }
    : null);
  const puntoA = viajeCurso && viajeCurso.origen_lat != null
    ? { lat: Number(viajeCurso.origen_lat), lng: Number(viajeCurso.origen_lng), texto: viajeCurso.origen_texto }
    : null;
  const puntoB = viajeCurso && viajeCurso.destino_lat != null
    ? { lat: Number(viajeCurso.destino_lat), lng: Number(viajeCurso.destino_lng), texto: viajeCurso.destino_texto }
    : null;
  const { resumen, viajes: historialViajes } = historialData;

  return (
    <div className="min-h-screen bg-slate-950 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <header className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex flex-wrap justify-between items-center gap-3">
          <div>
            <h1 className="font-black text-amber-400 text-xl">⚡ BÓLIDO CONDUCTOR</h1>
            <p className="text-xs text-slate-400">{user.nombre} {user.apellido} • Placa: <strong className="text-white">{perfil?.placa}</strong></p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={enLinea ? 'EN_LINEA' : 'DESCANSO'}
              onChange={(e) => cambiarEstadoOperativo(e.target.value)}
              className={`px-3 py-2 rounded-xl text-xs font-black border cursor-pointer outline-none transition ${
                enLinea
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                  : 'bg-red-500/20 border-red-500 text-red-400'
              }`}
            >
              <option value="EN_LINEA" className="bg-slate-900 text-emerald-400">🟢 En línea</option>
              <option value="DESCANSO" className="bg-slate-900 text-red-400">🔴 En descanso</option>
            </select>
            <button onClick={activarGpsReal} title="Actualizar mi GPS" className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs flex items-center gap-1">
              <LocateFixed size={14} /> GPS
            </button>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 uppercase">Saldo Disponible</p>
              <p className="font-black text-emerald-400">${Number(perfil?.saldo_disponible || 0).toLocaleString()} COP</p>
            </div>
            <SwitchTema />
            <button onClick={onLogout} className="px-3 py-2 rounded-xl bg-slate-800 text-xs">Salir</button>
          </div>
        </header>

        {!viajeCurso && viajeRecuperable && (
          <div className="p-4 rounded-2xl bg-amber-500/20 border-2 border-amber-500 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div>
              <p className="font-black text-amber-400 text-sm">⚡ Tienes un recorrido activo sin finalizar</p>
              <p className="text-xs text-slate-300">
                [A] {viajeRecuperable.origen_texto} → [B] {viajeRecuperable.destino_texto}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setViajeCurso(viajeRecuperable)}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow"
            >
              Continuar donde estabas
            </button>
          </div>
        )}

        {!viajeCurso && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setTab('RADAR')} className={`py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 ${tab === 'RADAR' ? 'bg-amber-500 text-slate-950' : 'bg-slate-900'}`}>
                <Radio size={16} /> Radar ({solicitudes.length})
              </button>
              <button onClick={() => { setTab('HISTORIAL'); cargarDatos(); }} className={`py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 ${tab === 'HISTORIAL' ? 'bg-amber-500 text-slate-950' : 'bg-slate-900'}`}>
                <TrendingUp size={16} /> Viajes y Ganancias
              </button>
              <button onClick={() => setTab('RECARGAR')} className={`py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 ${tab === 'RECARGAR' ? 'bg-amber-500 text-slate-950' : 'bg-slate-900'}`}>
                <Wallet size={16} /> Recargar Saldo
              </button>
            </div>

            {tab === 'RADAR' && (
              <div className="space-y-3">
                {Number(perfil?.saldo_disponible || 0) <= 0 && (
                  <div className="p-4 rounded-2xl bg-red-500/20 border border-red-500 text-red-200 text-sm">
                    ⚠️ Tu saldo es $0. Recarga mediante Nequi o Llave Bre-B para poder aceptar carreras.
                  </div>
                )}

                {solicitudes.map((sol) => (
                  <div key={sol.id} className="bg-slate-900 p-5 rounded-2xl border border-amber-500/40 space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-bold">Pasajero: {sol.pasajero_nombre}</span>
                          <span className={`text-xs px-2.5 py-0.5 rounded font-black flex items-center gap-1 ${sol.metodo_pago_viaje === 'NEQUI' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'}`}>
                            {sol.metodo_pago_viaje === 'NEQUI' ? <Smartphone size={12} /> : <Banknote size={12} />}
                            Paga en {sol.metodo_pago_viaje || 'EFECTIVO'}
                          </span>
                        </div>
                        <p className="text-sm mt-2"><strong className="text-emerald-400">[A] Recoger:</strong> {sol.origen_texto}</p>
                        <p className="text-sm"><strong className="text-red-400">[B] Destino:</strong> {sol.destino_texto} ({sol.distancia_km} km)</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-400">Oferta Pasajero</p>
                        <p className="text-2xl font-black text-emerald-400">${Number(sol.tarifa_ofertada_pasajero).toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
                      <button onClick={() => enviarOferta(sol, sol.tarifa_ofertada_pasajero)} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs">
                        ACEPTAR ${Number(sol.tarifa_ofertada_pasajero).toLocaleString()}
                      </button>
                      <div className="flex items-center gap-1.5 flex-1 min-w-[230px]">
                        <button
                          type="button"
                          onClick={() => {
                            const base = Number(contraofertas[sol.id] || sol.tarifa_ofertada_pasajero || 0);
                            setContraofertas({ ...contraofertas, [sol.id]: Math.max(2000, base - 500) });
                          }}
                          className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-red-500/20 border border-slate-700 text-red-400 font-black text-base flex items-center justify-center shrink-0 active:scale-95 transition"
                          title="Bajar contraoferta $500"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          step="500"
                          placeholder={String(Number(sol.tarifa_ofertada_pasajero))}
                          value={contraofertas[sol.id] ?? ''}
                          onChange={(e) => setContraofertas({ ...contraofertas, [sol.id]: e.target.value })}
                          className="w-full min-w-[75px] px-2 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-center text-amber-400 outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const base = Number(contraofertas[sol.id] || sol.tarifa_ofertada_pasajero || 0);
                            setContraofertas({ ...contraofertas, [sol.id]: base + 500 });
                          }}
                          className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-emerald-500/20 border border-slate-700 text-emerald-400 font-black text-base flex items-center justify-center shrink-0 active:scale-95 transition"
                          title="Subir contraoferta $500"
                        >
                          +
                        </button>
                        <button onClick={() => enviarOferta(sol)} className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shrink-0">
                          Ofertar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {solicitudes.length === 0 && (
                  <div className="bg-slate-900 p-10 rounded-2xl border border-slate-800 text-center text-slate-400 text-sm">
                    {enLinea ? 'Esperando solicitudes de pasajeros en tiempo real...' : '🔴 Estás en descanso. Cambia el estado superior a "En línea" para recibir solicitudes.'}
                  </div>
                )}
              </div>
            )}

            {tab === 'HISTORIAL' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-900 p-4 rounded-2xl border border-emerald-500/40">
                    <p className="text-[11px] text-slate-400 uppercase font-bold">Ganancia Neta Hoy</p>
                    <p className="text-2xl font-black text-emerald-400 mt-1">
                      ${Number(resumen.ganancia_neta_hoy).toLocaleString()} <span className="text-xs">COP</span>
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">Libre de comisión</p>
                  </div>

                  <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                    <p className="text-[11px] text-slate-400 uppercase font-bold">Ganancia Neta Total</p>
                    <p className="text-2xl font-black text-amber-400 mt-1">
                      ${Number(resumen.ganancia_neta_total).toLocaleString()} <span className="text-xs">COP</span>
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">En {resumen.total_viajes} carreras finalizadas</p>
                  </div>

                  <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                    <p className="text-[11px] text-slate-400 uppercase font-bold">Total Cobrado / Comisiones</p>
                    <p className="text-lg font-black text-white mt-1">
                      ${Number(resumen.total_bruto).toLocaleString()} <span className="text-xs">COP</span>
                    </p>
                    <p className="text-[11px] text-red-400 mt-1">
                      Comisiones descontadas: -${Number(resumen.total_comisiones).toLocaleString()} COP
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <h3 className="text-sm font-bold text-amber-400">Historial de Carreras Realizadas</h3>
                  {historialViajes.length === 0 ? (
                    <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 text-center text-slate-400 text-xs">
                      Aún no tienes viajes registrados en tu historial.
                    </div>
                  ) : (
                    historialViajes.map((v) => {
                      const neto = Number(v.tarifa_final_acordada || 0) - Number(v.comision_cobrada || 0);
                      return (
                        <div key={v.id} className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex flex-wrap justify-between items-center gap-3 text-xs">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded font-black text-[10px] ${
                                v.estado === 'FINALIZADA' ? 'bg-emerald-500/20 text-emerald-400' :
                                v.estado === 'CANCELADA' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                              }`}>
                                {v.estado}
                              </span>
                              <span className="text-slate-400">{new Date(v.creado_en).toLocaleString()}</span>
                              <span className="text-slate-300">• Pasajero: <strong>{v.pasajero_nombre}</strong></span>
                            </div>
                            <p className="text-slate-200"><strong className="text-emerald-400">[A]:</strong> {v.origen_texto}</p>
                            <p className="text-slate-200"><strong className="text-red-400">[B]:</strong> {v.destino_texto} ({v.distancia_km} km)</p>
                          </div>

                          <div className="text-right">
                            <p className="text-slate-400">Cobrado ({v.metodo_pago_viaje}): <strong className="text-white">${Number(v.tarifa_final_acordada || 0).toLocaleString()}</strong></p>
                            <p className="text-red-400 text-[11px]">Comisión app: -${Number(v.comision_cobrada || 0).toLocaleString()}</p>
                            <p className="font-black text-emerald-400 text-base mt-0.5">
                              Ganancia neta: +${neto.toLocaleString()} COP
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {tab === 'RECARGAR' && (() => {
              const mediosRecarga = (config.medios_pago_activos || []).filter((m) => m.para_recarga);
              return (
                <form onSubmit={enviarRecarga} className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4">
                  <h2 className="font-bold text-lg text-amber-400">Recargar Saldo para Conducir</h2>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-sm space-y-2">
                    <p className="text-slate-400 text-xs">{config.instrucciones_pago}</p>
                    {mediosRecarga.length > 0 ? (
                      mediosRecarga.map((m) => (
                        <p key={m.id}>
                          💳 <strong>{m.nombre}:</strong> <span className="text-amber-400 font-mono">{m.dato}</span>
                        </p>
                      ))
                    ) : (
                      <>
                        <p>📱 <strong>Nequi:</strong> <span className="text-amber-400 font-mono">{config.nequi_numero}</span></p>
                        <p>🔑 <strong>Llave Bre-B:</strong> <span className="text-amber-400 font-mono">{config.llave_bre_b}</span></p>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400">Medio de pago usado</label>
                      <select
                        value={recargaForm.metodo_pago}
                        onChange={(e) => setRecargaForm({ ...recargaForm, metodo_pago: e.target.value })}
                        className="w-full mt-1 p-3 rounded-xl bg-slate-800 border border-slate-700"
                      >
                        {mediosRecarga.length > 0 ? (
                          mediosRecarga.map((m) => (
                            <option key={m.id} value={m.nombre}>{m.nombre}</option>
                          ))
                        ) : (
                          <>
                            <option value="NEQUI">Nequi</option>
                            <option value="LLAVE BRE-B">Llave Bre-B</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Valor transferido (COP)</label>
                      <input required type="number" placeholder="Ej: 20000" value={recargaForm.monto} onChange={(e) => setRecargaForm({ ...recargaForm, monto: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-slate-800 border border-slate-700" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Número de Referencia / Comprobante</label>
                    <input required placeholder="Ej: M12345678" value={recargaForm.numero_referencia} onChange={(e) => setRecargaForm({ ...recargaForm, numero_referencia: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-slate-800 border border-slate-700" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Foto del comprobante (opcional)</label>
                    <input type="file" accept="image/*" onChange={(e) => setComprobanteFile(e.target.files[0])} className="w-full mt-1 text-xs text-slate-400" />
                  </div>
                  <button className="w-full py-3 rounded-xl bg-amber-500 text-slate-950 font-black">ENVIAR COMPROBANTE DE RECARGA</button>
                </form>
              );
            })()}
          </>
        )}

        {/* VIAJE EN CURSO CONDUCTOR */}
        {viajeCurso && (
          <div className="bg-slate-900 p-5 rounded-2xl border border-emerald-500/40 space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full font-black text-xs ${viajeCurso.estado === 'EN_CURSO' ? 'bg-emerald-500 text-slate-950' : 'bg-amber-500 text-slate-950'}`}>
                  {viajeCurso.estado === 'EN_CURSO' ? 'EN RUTA AL DESTINO [B]' : 'IR A RECOGER AL PUNTO [A]'}
                </span>
                {etaObjetivo && (
                  <span className="text-xs font-bold text-amber-400">
                    A {etaObjetivo} min ({distObjetivo} km)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2.5 py-1 rounded-lg font-black ${viajeCurso.metodo_pago_viaje === 'NEQUI' ? 'bg-purple-500/20 text-purple-300 border border-purple-500' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500'}`}>
                  Cobrar por {viajeCurso.metodo_pago_viaje || 'EFECTIVO'}
                </span>
                <span className="font-black text-emerald-400 text-lg">${Number(viajeCurso.tarifa_final_acordada).toLocaleString()}</span>
              </div>
            </div>

            {/* BOTÓN DE AYUDA GPS EXTERNA EN GOOGLE MAPS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => abrirEnGoogleMaps(viajeCurso.origen_lat, viajeCurso.origen_lng)}
                className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow"
              >
                <ExternalLink size={15} /> Navegar en Google Maps al Punto [A]
              </button>
              <button
                type="button"
                onClick={() => abrirEnGoogleMaps(viajeCurso.destino_lat, viajeCurso.destino_lng)}
                className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow"
              >
                <ExternalLink size={15} /> Navegar en Google Maps al Destino [B]
              </button>
            </div>

            {/* MAPA CON PUNTEROS A, B Y CARRO */}
            <div className="h-[52vh] min-h-[380px] rounded-2xl overflow-hidden border border-slate-700 relative z-0 shadow-xl">
              <div className="absolute bottom-3 left-3 z-[1000] bg-slate-950/90 border border-slate-700 px-3 py-1.5 rounded-xl flex items-center gap-3 text-xs shadow-lg">
                <span className="text-emerald-400 font-bold">[A] Recogida</span>
                <span className="text-red-400 font-bold">[B] Llegada</span>
              </div>
              <button
                type="button"
                onClick={() => setCentrarMapaTrigger((c) => c + 1)}
                className="absolute top-3 right-3 z-[1000] bg-slate-950/90 hover:bg-amber-500 hover:text-slate-950 border border-slate-700 text-amber-400 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg transition"
              >
                <LocateFixed size={14} /> Centrar ruta
              </button>

              <MapaWaze3D
                origen={puntoA}
                destino={puntoB}
                ubicacionCarro={ubicacionCarritoEfectiva}
                rutaPrincipal={rutaAB}
                rutaSecundaria={viajeCurso.estado === 'ACEPTADA' ? rutaActiva : []}
                colorRuta="#f59e0b"
                etapaViaje={viajeCurso.estado}
                triggerCentrar={centrarMapaTrigger}
              />
            </div>

            <div className="text-xs space-y-1 bg-slate-950 p-3 rounded-xl">
              <p><strong className="text-emerald-400">[A] Recoger en:</strong> {viajeCurso.origen_texto}</p>
              <p><strong className="text-red-400">[B] Llevar a:</strong> {viajeCurso.destino_texto}</p>
            </div>

            {viajeCurso.estado === 'ACEPTADA' && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button onClick={simularAvanceCarro} className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-amber-300 font-bold text-xs flex items-center justify-center gap-2">
                    <Navigation size={15} /> Simular avance en mapa
                  </button>
                  <button onClick={avisarEstoyCerca} className="py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center gap-2">
                    <BellRing size={15} /> Ya llegué al punto [A]
                  </button>
                </div>
                <button onClick={iniciarRecorrido} className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg">
                  <Play size={18} /> PASAJERO A BORDO — INICIAR RECORRIDO A [B]
                </button>
              </div>
            )}

            {viajeCurso.estado === 'EN_CURSO' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button onClick={simularAvanceCarro} className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-amber-300 font-bold text-xs flex items-center justify-center gap-2">
                  <Navigation size={15} /> Simular trayecto al destino
                </button>
                <button onClick={finalizarCarrera} className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg">
                  <CheckCircle2 size={18} /> FINALIZAR CARRERA EN [B]
                </button>
              </div>
            )}

            <div className="bg-slate-950 rounded-xl p-3 h-40 flex flex-col">
              <div className="flex-1 overflow-y-auto space-y-1.5 text-xs">
                {mensajes.map((m, i) => (
                  <div key={i} className={`p-2 rounded-lg max-w-[80%] ${m.remitente_id === user.id ? 'bg-amber-500 text-slate-950 ml-auto' : 'bg-slate-800'}`}>
                    <strong>{m.remitente_nombre}:</strong> {m.mensaje}
                  </div>
                ))}
              </div>
              <form onSubmit={(e) => {
                e.preventDefault();
                if (!textoChat.trim()) return;
                socket.emit('enviar_mensaje_chat', { viaje_id: viajeCurso.id, remitente_id: user.id, remitente_nombre: user.nombre, mensaje: textoChat });
                setTextoChat('');
              }} className="flex gap-2 pt-2">
                <input value={textoChat} onChange={(e) => setTextoChat(e.target.value)} placeholder="Mensaje al pasajero..." className="flex-1 px-3 py-2 rounded-lg bg-slate-800 text-xs" />
                <button className="p-2 rounded-lg bg-amber-500 text-slate-950"><Send size={14} /></button>
              </form>
            </div>

            {viajeCurso.estado === 'ACEPTADA' && (
              <button onClick={() => setModalCancelar(true)} className="w-full py-2.5 rounded-xl bg-red-600/20 border border-red-500 text-red-300 font-bold text-xs flex items-center justify-center gap-1">
                <XOctagon size={15} /> Cancelar Carrera
              </button>
            )}
          </div>
        )}
      </div>

      {modalCancelar && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-md w-full space-y-4">
            <h3 className="font-bold text-lg text-red-400">Cancelar Carrera</h3>
            <textarea rows="3" value={motivoCancelacion} onChange={(e) => setMotivoCancelacion(e.target.value)} placeholder="Indica el motivo de la cancelación..." className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 text-sm" />
            <div className="flex gap-2">
              <button onClick={() => setModalCancelar(false)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-xs font-bold">Volver</button>
              <button onClick={confirmarCancelacion} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
