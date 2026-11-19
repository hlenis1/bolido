import React, { useEffect, useState, useRef } from 'react';
import MapaWaze3D from '../components/MapaWaze3D';
import SwitchTema from '../components/SwitchTema';
import { apiFetch, API_URL, socket, notificarPushLocal } from '../api';
import { Navigation, Clock, MessageSquare, XOctagon, Send, MapPin, LocateFixed, Search, Car, Play, Star, Banknote, Smartphone, History, Edit3 } from 'lucide-react';



export default function PassengerDashboard({ user, onLogout }) {
  const [vista, setVista] = useState('MAPA');
  const [historialViajes, setHistorialViajes] = useState([]);
  const [config, setConfig] = useState({ valor_por_km: 1200, medios_pago_activos: [] });

  // Modo de origen: 'GPS' | 'MANUAL'
  const [modoOrigen, setModoOrigen] = useState('GPS');
  const [origen, setOrigen] = useState(null);
  const [textoOrigen, setTextoOrigen] = useState('Detectando ubicación GPS...');
  const [buscandoGps, setBuscandoGps] = useState(false);
  const [sugerenciasOrigen, setSugerenciasOrigen] = useState([]);
  const [buscandoDirOrigen, setBuscandoDirOrigen] = useState(false);
  const timeoutOrigen = useRef(null);

  // Destino
  const [destino, setDestino] = useState(null);
  const [textoDestino, setTextoDestino] = useState('');
  const [sugerenciasDestino, setSugerenciasDestino] = useState([]);
  const [buscandoDireccion, setBuscandoDireccion] = useState(false);
  const timeoutBusqueda = useRef(null);

  const [rutaCoords, setRutaCoords] = useState([]);
  const [rutaAcercamiento, setRutaAcercamiento] = useState([]);
  const [distanciaKm, setDistanciaKm] = useState(0);
  const [duracionMin, setDuracionMin] = useState(0);
  const [tarifaOfertada, setTarifaOfertada] = useState('');
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');

  const [viajeActivo, setViajeActivo] = useState(null);
  const [segundos, setSegundos] = useState(60);
  const [expirado, setExpirado] = useState(false);
  const [ofertas, setOfertas] = useState([]);
  const [conductorAsignado, setConductorAsignado] = useState(null);
  const [ubicacionCarro, setUbicacionCarro] = useState(null);
  const [etaMinutos, setEtaMinutos] = useState(null);
  const [distanciaCarroKm, setDistanciaCarroKm] = useState(null);
  const [alertaCerca, setAlertaCerca] = useState('');

  const [viajeParaCalificar, setViajeParaCalificar] = useState(null);
  const [estrellas, setEstrellas] = useState(0);
  useEffect(() => {
    if (viajeParaCalificar) setEstrellas(0);
  }, [viajeParaCalificar?.id]);
  const [comentarioCalif, setComentarioCalif] = useState('');

  const [mensajes, setMensajes] = useState([]);
  const [textoChat, setTextoChat] = useState('');
  const [modalCancelar, setModalCancelar] = useState(false);
  const [codigoMotivo, setCodigoMotivo] = useState('DEMORA');
  const [motivoCancelacion, setMotivoCancelacion] = useState('');

  
  // Trazar ruta de acercamiento (Carrito -> Punto A) cuando el viaje está ACEPTADA
  useEffect(() => {
    if (!viajeActivo || viajeActivo.estado !== 'ACEPTADA' || !ubicacionCarro || !origen) {
      if (viajeActivo?.estado === 'EN_CURSO') setRutaAcercamiento([]);
      return;
    }
    const cLat = Number(ubicacionCarro.lat);
    const cLng = Number(ubicacionCarro.lng);
    const oLat = Number(origen.lat);
    const oLng = Number(origen.lng);
    if (isNaN(cLat) || isNaN(oLat)) return;

    setRutaAcercamiento((prev) => (prev.length > 2 ? prev : [[cLat, cLng], [oLat, oLng]]));

    fetch(`https://router.project-osrm.org/route/v1/driving/${cLng},${cLat};${oLng},${oLat}?overview=full&geometries=geojson`)
      .then((r) => r.json())
      .then((d) => {
        if (d.routes?.[0]) {
          setRutaAcercamiento(d.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]));
        }
      })
      .catch(() => {});
  }, [viajeActivo, ubicacionCarro, origen]);

  // Recuperación automática del viaje activo al abrir o recargar la app
  useEffect(() => {
    let activo = true;
    apiFetch('/api/viajes/activo')
      .then((res) => {
        if (!activo || !res?.viaje) return;
        const v = res.viaje;
        setViajeActivo(v);

        const origObj = {
          lat: Number(v.origen_lat),
          lng: Number(v.origen_lng),
          texto: v.origen_texto,
          bloqueadoPorViaje: true,
        };
        const destObj = {
          lat: Number(v.destino_lat),
          lng: Number(v.destino_lng),
          texto: v.destino_texto,
        };

        setOrigen(origObj);
        setTextoOrigen(v.origen_texto || '');
        setDestino(destObj);
        setTextoDestino(v.destino_texto || '');

        if (res.conductor) {
          setConductorAsignado(res.conductor);
        } else if (v.conductor_id) {
          setConductorAsignado({
            id: v.conductor_id,
            nombre: 'Conductor',
            apellido: 'Bólido',
            placa: 'BOL-001',
            marca_vehiculo: 'Vehículo',
            color_vehiculo: 'Estándar',
            anio_vehiculo: '',
            calificacion_promedio: '5.0',
          });
        }

        if (Array.isArray(res.ofertas)) setOfertas(res.ofertas);

        if (['ACEPTADA', 'EN_CURSO'].includes(v.estado)) {
          setUbicacionCarro((prev) => prev || { lat: Number(v.origen_lat), lng: Number(v.origen_lng) });
        }

        // Calcular ruta OSRM inmediatamente entre A y B
        fetch(`https://router.project-osrm.org/route/v1/driving/${origObj.lng},${origObj.lat};${destObj.lng},${destObj.lat}?overview=full&geometries=geojson`)
          .then((r) => r.json())
          .then((d) => {
            if (d.routes?.[0]) {
              setRutaCoords(d.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]));
            } else {
              setRutaCoords([[origObj.lat, origObj.lng], [destObj.lat, destObj.lng]]);
            }
          })
          .catch(() => {
            setRutaCoords([[origObj.lat, origObj.lng], [destObj.lat, destObj.lng]]);
          });
      })
      .catch((err) => console.error('Error recuperando viaje activo:', err));
    return () => { activo = false; };
  }, []);


  const cargarHistorial = async () => {
    try {
      const data = await apiFetch('/api/viajes/historial');
      setHistorialViajes(data.viajes || []);
    } catch {}
  };

  useEffect(() => {
    apiFetch('/api/viajes/config-publica').then(setConfig).catch(() => {});
    detectarUbicacionGPS();
    cargarHistorial();
    
  }, []);

  const detectarUbicacionGPS = () => {
    setBuscandoGps(true);
    setTextoOrigen('Obteniendo ubicación GPS...');
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          let direccionLegible = `Mi ubicación (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
          try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await resp.json();
            if (data?.display_name) direccionLegible = data.display_name.split(',').slice(0, 3).join(',');
          } catch {}
          setOrigen((prev) => (prev && prev.bloqueadoPorViaje ? prev : { lat, lng, texto: direccionLegible }));
          setOrigen((prev) => { if (!prev || !prev.bloqueadoPorViaje) setTextoOrigen(direccionLegible); return prev; });
          setBuscandoGps(false);
        },
        () => {
          const fallback = { lat: 3.2608, lng: -76.535, texto: 'Jamundí, Valle del Cauca' };
          setOrigen(fallback);
          setTextoOrigen(fallback.texto);
          setBuscandoGps(false);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  };

  const cambiarModoOrigen = (nuevoModo) => {
    setModoOrigen(nuevoModo);
    setSugerenciasOrigen([]);
    if (nuevoModo === 'GPS') {
      detectarUbicacionGPS();
    } else {
      setTextoOrigen('');
      setOrigen(null);
      setRutaCoords([]);
    }
  };

  const manejarCambioOrigenManual = (valor) => {
    setTextoOrigen(valor);
    setOrigen(null);
    setRutaCoords([]);
    if (timeoutOrigen.current) clearTimeout(timeoutOrigen.current);
    if (valor.trim().length < 3) {
      setSugerenciasOrigen([]);
      return;
    }
    timeoutOrigen.current = setTimeout(async () => {
      setBuscandoDirOrigen(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(valor)}&countrycodes=co&limit=5`);
        setSugerenciasOrigen((await res.json()) || []);
      } catch {
        setSugerenciasOrigen([]);
      } finally {
        setBuscandoDirOrigen(false);
      }
    }, 400);
  };

  const seleccionarSugerenciaOrigen = (item) => {
    const nombreCorto = item.display_name.split(',').slice(0, 3).join(',');
    setOrigen({ lat: parseFloat(item.lat), lng: parseFloat(item.lon), texto: nombreCorto });
    setTextoOrigen(nombreCorto);
    setSugerenciasOrigen([]);
  };

  const manejarCambioDestino = (valor) => {
    setTextoDestino(valor);
    setDestino(null);
    setRutaCoords([]);
    if (timeoutBusqueda.current) clearTimeout(timeoutBusqueda.current);
    if (valor.trim().length < 3) {
      setSugerenciasDestino([]);
      return;
    }
    timeoutBusqueda.current = setTimeout(async () => {
      setBuscandoDireccion(true);
      try {
        const latBase = origen?.lat || 3.2608;
        const lngBase = origen?.lng || -76.535;
        const viewbox = `${lngBase - 0.3},${latBase + 0.3},${lngBase + 0.3},${latBase - 0.3}`;
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(valor)}&countrycodes=co&viewbox=${viewbox}&limit=5`);
        setSugerenciasDestino((await res.json()) || []);
      } catch {
        setSugerenciasDestino([]);
      } finally {
        setBuscandoDireccion(false);
      }
    }, 400);
  };

  const seleccionarSugerenciaDestino = (item) => {
    const nombreCorto = item.display_name.split(',').slice(0, 3).join(',');
    setDestino({ lat: parseFloat(item.lat), lng: parseFloat(item.lon), texto: nombreCorto });
    setTextoDestino(nombreCorto);
    setSugerenciasDestino([]);
  };

  useEffect(() => {
    if (!origen || !destino) return;
    fetch(`https://router.project-osrm.org/route/v1/driving/${origen.lng},${origen.lat};${destino.lng},${destino.lat}?overview=full&geometries=geojson`)
      .then((r) => r.json())
      .then((data) => {
        if (data.routes?.[0]) {
          const ruta = data.routes[0];
          const km = Math.max(1, Number((ruta.distance / 1000).toFixed(1)));
          setRutaCoords(ruta.geometry.coordinates.map(([lng, lat]) => [lat, lng]));
          setDistanciaKm(km);
          setDuracionMin(Math.max(2, Math.round(ruta.duration / 60)));
          setTarifaOfertada(Math.round((km * Number(config.valor_por_km)) / 500) * 500);
        }
      })
      .catch(() => {});
  }, [origen, destino, config]);

  useEffect(() => {
    if (!ubicacionCarro || !origen || viajeActivo?.estado === 'EN_CURSO') {
      setRutaAcercamiento([]);
      return;
    }
    fetch(`https://router.project-osrm.org/route/v1/driving/${ubicacionCarro.lng},${ubicacionCarro.lat};${origen.lng},${origen.lat}?overview=full&geometries=geojson`)
      .then((r) => r.json())
      .then((data) => {
        if (data.routes?.[0]) {
          const r = data.routes[0];
          setRutaAcercamiento(r.geometry.coordinates.map(([lng, lat]) => [lat, lng]));
          setEtaMinutos(Math.max(1, Math.round(r.duration / 60)));
          setDistanciaCarroKm((r.distance / 1000).toFixed(1));
        }
      })
      .catch(() => {});
  }, [ubicacionCarro, origen, viajeActivo?.estado]);

  useEffect(() => {
    if (!viajeActivo) return;
    const interval = setInterval(() => setSegundos((s) => (s > 0 ? s - 1 : 0)), 1000);

    socket.on(`nueva_oferta_${viajeActivo.id}`, (oferta) => {
      setOfertas((prev) => [oferta, ...prev]);
      notificarPushLocal('Nueva oferta de conductor', `${oferta.conductor_nombre} ofrece $${Number(oferta.monto_contraoferta).toLocaleString()}`);
    });
    socket.on(`viaje_expirado_${viajeActivo.id}`, () => setExpirado(true));
    socket.on(`ubicacion_viaje_${viajeActivo.id}`, (data) => {
      setUbicacionCarro({ lat: data.lat, lng: data.lng });
      if (data.eta_minutos) setEtaMinutos(data.eta_minutos);
    });
    socket.on(`conductor_cerca_${viajeActivo.id}`, (data) => {
      setAlertaCerca(data.mensaje);
      notificarPushLocal('⚡ ¡Tu Bólido está cerca!', data.mensaje);
    });
    socket.on(`recorrido_iniciado_${viajeActivo.id}`, ({ viaje }) => {
      setViajeActivo(viaje);
      setAlertaCerca('');
      notificarPushLocal('🚀 Recorrido iniciado', 'Disfruta tu viaje con Bólido.');
    });
    socket.on(`chat_viaje_${viajeActivo.id}`, (msg) => setMensajes((prev) => [...prev, msg]));
    socket.on(`viaje_cancelado_${viajeActivo.id}`, (data) => {
      alert(`Carrera cancelada por ${data.cancelado_por}. Motivo: ${data.motivo}`);
      resetearViaje();
      cargarHistorial();
    });
    socket.on(`viaje_finalizado_${viajeActivo.id}`, (viajeTerminado) => {
      setViajeParaCalificar({ viaje: viajeTerminado, conductor: conductorAsignado });
      resetearViaje();
      cargarHistorial();
    });

    return () => {
      clearInterval(interval);
      socket.off(`nueva_oferta_${viajeActivo.id}`);
      socket.off(`viaje_expirado_${viajeActivo.id}`);
      socket.off(`ubicacion_viaje_${viajeActivo.id}`);
      socket.off(`conductor_cerca_${viajeActivo.id}`);
      socket.off(`recorrido_iniciado_${viajeActivo.id}`);
      socket.off(`chat_viaje_${viajeActivo.id}`);
      socket.off(`viaje_cancelado_${viajeActivo.id}`);
      socket.off(`viaje_finalizado_${viajeActivo.id}`);
    };
  }, [viajeActivo, conductorAsignado]);

  const limpiarBusquedaDestino = () => {
    setDestino(null);
    setTextoDestino('');
    setSugerenciasDestino([]);
    setRutaCoords([]);
    setDistanciaKm(0);
    setDuracionMin(0);
    setTarifaOfertada('');
  };

  const resetearViaje = () => {
    setViajeActivo(null);
    setOrigen((prev) => (prev ? { ...prev, bloqueadoPorViaje: false } : null));
    limpiarBusquedaDestino();
    setOfertas([]);
    setConductorAsignado(null);
    setUbicacionCarro(null);
    setRutaAcercamiento([]);
    setEtaMinutos(null);
    setAlertaCerca('');
    setMensajes([]);
    setExpirado(false);
    setSegundos(60);
  };

  const solicitarCarrera = async (e) => {
    e.preventDefault();
    if (!origen) return alert('Por favor confirma tu punto de recogida (A)');
    if (!destino) return alert('Selecciona una dirección de destino (B) de la lista');
    setExpirado(false);
    setOfertas([]);
    setSegundos(60);

    const viaje = await apiFetch('/api/viajes/solicitar', {
      method: 'POST',
      body: JSON.stringify({
        origen_texto: textoOrigen,
        origen_lat: origen.lat,
        origen_lng: origen.lng,
        destino_texto: destino.texto,
        destino_lat: destino.lat,
        destino_lng: destino.lng,
        distancia_km: distanciaKm,
        tarifa_sugerida: Math.round(distanciaKm * Number(config.valor_por_km)),
        tarifa_ofertada_pasajero: Number(tarifaOfertada),
        metodo_pago_viaje: metodoPago,
      }),
    });
    setViajeActivo(viaje);
  };

  const aceptarOferta = async (ofertaId) => {
    const res = await apiFetch(`/api/viajes/${viajeActivo.id}/aceptar-oferta/${ofertaId}`, { method: 'POST' });
    setViajeActivo(res.viaje);
    setConductorAsignado(res.conductor);
  };

  const iniciarRecorrido = async () => {
    const updated = await apiFetch(`/api/viajes/${viajeActivo.id}/iniciar-recorrido`, { method: 'POST' });
    setViajeActivo(updated);
  };

  const enviarCalificacion = async (e) => {
    e.preventDefault();
    if (!estrellas || estrellas < 1) return alert('Por favor selecciona de 1 a 5 estrellas para calificar tu viaje.');
    await apiFetch(`/api/viajes/${viajeParaCalificar.viaje.id}/calificar`, {
      method: 'POST',
      body: JSON.stringify({ calificacion: estrellas, comentario: comentarioCalif }),
    });
    setViajeParaCalificar(null);
    setEstrellas(0);
    setComentarioCalif('');
    cargarHistorial();
  };

  const enviarMensaje = (e) => {
    e.preventDefault();
    if (!textoChat.trim()) return;
    socket.emit('enviar_mensaje_chat', {
      viaje_id: viajeActivo.id,
      remitente_id: user.id,
      remitente_nombre: user.nombre,
      mensaje: textoChat,
    });
    setTextoChat('');
  };

  const confirmarCancelacion = async () => {
    const etiquetasMotivo = {
      DEMORA: 'El conductor se demora mucho',
      NO_COMUNICACION: 'Sin comunicación con el conductor',
      SOLO_CANCELAR: 'Solo quería cancelar / Ya no necesito el viaje',
    };
    const textoFinal = motivoCancelacion.trim()
      ? `${etiquetasMotivo[codigoMotivo]}: ${motivoCancelacion.trim()}`
      : etiquetasMotivo[codigoMotivo];

    await apiFetch(`/api/viajes/${viajeActivo.id}/cancelar`, {
      method: 'POST',
      body: JSON.stringify({ motivo: textoFinal, codigo_motivo: codigoMotivo }),
    });
    setModalCancelar(false);
    setCodigoMotivo('DEMORA');
    setMotivoCancelacion('');
    resetearViaje();
    cargarHistorial();
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <header className="p-4 bg-slate-900 border-b border-slate-800 flex flex-wrap justify-between items-center gap-2">
        <div>
          <span className="font-black text-amber-400 text-xl">⚡ BÓLIDO</span>
          <span className="text-xs text-slate-400 ml-3">Hola, {user.nombre}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVista('MAPA')}
            className={`text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 ${vista === 'MAPA' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
          >
            <Navigation size={13} /> Pedir Viaje
          </button>
          <button
            onClick={() => { setVista('HISTORIAL'); cargarHistorial(); }}
            className={`text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 ${vista === 'HISTORIAL' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
          >
            <History size={13} /> Mis Viajes ({historialViajes.length})
          </button>
          <SwitchTema />
          <button onClick={onLogout} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-red-900/40">Salir</button>
        </div>
      </header>

      {vista === 'HISTORIAL' && (
        <div className="max-w-3xl w-full mx-auto p-4 md:p-6 space-y-4">
          <h2 className="text-xl font-black text-amber-400 flex items-center gap-2">
            <History size={20} /> Historial de Mis Viajes
          </h2>
          {historialViajes.length === 0 ? (
            <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 text-center text-slate-400 text-sm">
              Aún no has realizado viajes en Bólido.
            </div>
          ) : (
            <div className="space-y-3">
              {historialViajes.map((v) => (
                <div key={v.id} className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex flex-wrap justify-between items-center gap-4">
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded font-black text-[10px] ${
                        v.estado === 'FINALIZADA' ? 'bg-emerald-500/20 text-emerald-400' :
                        v.estado === 'CANCELADA' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {v.estado}
                      </span>
                      <span className="text-slate-400">{new Date(v.creado_en).toLocaleString()}</span>
                    </div>
                    <p className="text-slate-200"><strong className="text-emerald-400">[A] Recogida:</strong> {v.origen_texto}</p>
                    <p className="text-slate-200"><strong className="text-red-400">[B] Destino:</strong> {v.destino_texto} ({v.distancia_km} km)</p>
                    {v.conductor_nombre && (
                      <p className="text-slate-400">
                        Conductor: <strong className="text-white">{v.conductor_nombre} {v.conductor_apellido}</strong> • {v.marca_vehiculo} ({v.placa})
                      </p>
                    )}
                    {v.motivo_cancelacion && (
                      <p className="text-red-400">Motivo cancelación ({v.cancelado_por}): {v.motivo_cancelacion}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-black text-emerald-400 text-lg">
                      ${Number(v.tarifa_final_acordada || v.tarifa_ofertada_pasajero).toLocaleString()} COP
                    </p>
                    <p className="text-[11px] text-slate-400">Pago: {v.metodo_pago_viaje || 'EFECTIVO'}</p>
                    {v.calificacion && (
                      <p className="text-xs text-amber-400 font-bold mt-1">★ {v.calificacion} / 5</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {vista === 'MAPA' && (
        <div className="grid lg:grid-cols-3 flex-1">
          <div className="lg:col-span-2 h-[45vh] lg:h-auto relative z-0">
            {/* Leyenda flotante A y B en el mapa */}
            <div className="absolute bottom-3 left-3 z-[1000] bg-slate-950/90 border border-slate-700 px-3 py-1.5 rounded-xl flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-950 font-black inline-flex items-center justify-center text-[10px]">A</span>
                Recogida
              </span>
              <span className="flex items-center gap-1.5 font-bold text-red-400">
                <span className="w-4 h-4 rounded-full bg-red-500 text-white font-black inline-flex items-center justify-center text-[10px]">B</span>
                Llegada
              </span>
            </div>

            {conductorAsignado && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/95 border border-emerald-500 px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 text-xs">
                <Car size={16} className="text-emerald-400 animate-bounce" />
                <span className="font-bold text-white">
                  {viajeActivo?.estado === 'EN_CURSO'
                    ? `En viaje hacia [B] ${destino?.texto}`
                    : ubicacionCarro
                    ? `Tu Bólido llega al punto [A] en ${etaMinutos || 2} min`
                    : 'Conectando GPS del conductor...'}
                </span>
              </div>
            )}

            <MapaWaze3D
              origen={origen}
              destino={destino}
              ubicacionCarro={ubicacionCarro || (viajeActivo && ['ACEPTADA', 'EN_CURSO'].includes(viajeActivo.estado) && origen ? { lat: Number(origen.lat), lng: Number(origen.lng) } : null)}
              rutaPrincipal={rutaCoords}
              rutaSecundaria={rutaAcercamiento}
              colorRuta="#f59e0b"
              etapaViaje={viajeActivo?.estado || (destino ? 'COTIZANDO' : 'INICIO')}
            />
          </div>

          <div className="p-5 bg-slate-900 border-l border-slate-800 overflow-y-auto space-y-4">
            {!viajeActivo && (
              <form onSubmit={solicitarCarrera} className="space-y-4">
                <h2 className="font-black text-lg text-amber-400 flex items-center gap-2"><Navigation size={18} /> ¿A dónde vas hoy?</h2>

                {/* PUNTO A: SELECTOR GPS VS MANUAL */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-950 font-black inline-flex items-center justify-center text-[10px]">A</span>
                      Punto de recogida
                    </span>
                    <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => cambiarModoOrigen('GPS')}
                        className={`px-2 py-1 rounded-md font-bold flex items-center gap-1 transition ${modoOrigen === 'GPS' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'}`}
                      >
                        <LocateFixed size={11} /> Usar GPS
                      </button>
                      <button
                        type="button"
                        onClick={() => cambiarModoOrigen('MANUAL')}
                        className={`px-2 py-1 rounded-md font-bold flex items-center gap-1 transition ${modoOrigen === 'MANUAL' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}
                      >
                        <Edit3 size={11} /> Manual
                      </button>
                    </div>
                  </div>

                  {/* VISTA GPS (Se oculta si elige Manual) */}
                  {modoOrigen === 'GPS' && (
                    <div className="p-3 rounded-xl bg-slate-800/90 border border-emerald-500/40 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <LocateFixed size={16} className="text-emerald-400 shrink-0" />
                        <p className="text-xs text-slate-200 truncate">{textoOrigen}</p>
                      </div>
                      <button type="button" onClick={detectarUbicacionGPS} className="text-[11px] text-amber-400 font-bold shrink-0 hover:underline">
                        {buscandoGps ? 'Buscando...' : 'Actualizar'}
                      </button>
                    </div>
                  )}

                  {/* VISTA MANUAL (Se oculta si elige GPS) */}
                  {modoOrigen === 'MANUAL' && (
                    <div className="relative">
                      <div className="relative flex items-center">
                        <MapPin size={16} className="absolute left-3 text-emerald-400" />
                        <input
                          required
                          value={textoOrigen}
                          onChange={(e) => manejarCambioOrigenManual(e.target.value)}
                          placeholder="Escribe dirección o barrio donde te recogemos..."
                          className="w-full pl-9 pr-3 py-3 rounded-xl bg-slate-800 border border-emerald-500/50 text-xs text-white focus:border-emerald-400 outline-none"
                        />
                      </div>
                      {buscandoDirOrigen && <p className="text-[11px] text-emerald-400 pt-1">Buscando punto de recogida...</p>}
                      {sugerenciasOrigen.length > 0 && (
                        <div className="bg-slate-950 border border-slate-700 rounded-xl shadow-2xl divide-y divide-slate-800 max-h-40 overflow-y-auto mt-1 z-20">
                          {sugerenciasOrigen.map((item) => (
                            <button type="button" key={item.place_id} onClick={() => seleccionarSugerenciaOrigen(item)} className="w-full text-left p-2.5 hover:bg-slate-800 text-xs flex items-start gap-2">
                              <MapPin size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                              <span className="text-slate-200">{item.display_name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* PUNTO B: DESTINO */}
                <div className="space-y-1 relative">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-red-500 text-white font-black inline-flex items-center justify-center text-[10px]">B</span>
                      Punto de llegada (Destino)
                    </label>
                    {(textoDestino || destino || rutaCoords.length > 0) && (
                      <button
                        type="button"
                        onClick={limpiarBusquedaDestino}
                        className="text-[11px] font-bold text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-lg transition"
                      >
                        ✕ Limpiar búsqueda
                      </button>
                    )}
                  </div>
                  <div className="relative flex items-center">
                    <Search size={16} className="absolute left-3 text-red-400" />
                    <input
                      required
                      value={textoDestino}
                      onChange={(e) => manejarCambioDestino(e.target.value)}
                      placeholder="Escribe dirección, barrio o lugar de destino..."
                      className="w-full pl-9 pr-9 py-3 rounded-xl bg-slate-800 border border-slate-700 text-sm focus:border-amber-500 outline-none"
                    />
                    {textoDestino && (
                      <button
                        type="button"
                        onClick={limpiarBusquedaDestino}
                        title="Borrar destino"
                        className="absolute right-3 text-slate-400 hover:text-white text-xs font-black"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {buscandoDireccion && <p className="text-[11px] text-amber-400 pt-1">Buscando direcciones...</p>}
                  {sugerenciasDestino.length > 0 && (
                    <div className="bg-slate-950 border border-slate-700 rounded-xl shadow-2xl divide-y divide-slate-800 max-h-48 overflow-y-auto z-20">
                      {sugerenciasDestino.map((item) => (
                        <button type="button" key={item.place_id} onClick={() => seleccionarSugerenciaDestino(item)} className="w-full text-left p-2.5 hover:bg-slate-800 text-xs flex items-start gap-2">
                          <MapPin size={14} className="text-red-400 shrink-0 mt-0.5" />
                          <span className="text-slate-200">{item.display_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {destino && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                    <p className="text-slate-400">Distancia A → B: <strong className="text-white">{distanciaKm} km</strong> (~{duracionMin} min)</p>
                    <p className="text-slate-400 mt-0.5">Tarifa sugerida: <strong className="text-amber-400">${(distanciaKm * Number(config.valor_por_km)).toLocaleString()} COP</strong></p>
                  </div>
                )}

                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">¿Cómo pagarás al conductor?</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {((config.medios_pago_activos || []).filter((m) => m.para_pasajero).length > 0
                      ? (config.medios_pago_activos || []).filter((m) => m.para_pasajero)
                      : [
                          { id: 'EFECTIVO', nombre: 'Efectivo' },
                          { id: 'NEQUI', nombre: 'Nequi' },
                          { id: 'BRE_B', nombre: 'Llave Bre-B' },
                        ]
                    ).map((m) => {
                      const valor = m.nombre.toUpperCase();
                      const activo = metodoPago === valor;
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => setMetodoPago(valor)}
                          className={`py-2.5 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                            activo
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                          }`}
                        >
                          {valor.includes('EFECTIVO') ? <Banknote size={15} /> : <Smartphone size={15} />}
                          <span>{m.nombre}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-slate-400">Tu oferta de tarifa (COP)</label>
                    <span className="text-[11px] text-slate-400">Ajuste rápido ±$500</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setTarifaOfertada((prev) => Math.max(2000, (Number(prev) || 0) - 500))}
                      className="w-12 h-12 rounded-xl bg-slate-800 hover:bg-red-500/20 border border-slate-700 hover:border-red-500/50 text-red-400 font-black text-xl flex items-center justify-center shrink-0 active:scale-95 transition"
                      title="Disminuir $500"
                    >
                      −
                    </button>
                    <input
                      required
                      type="number"
                      step="500"
                      value={tarifaOfertada}
                      onChange={(e) => setTarifaOfertada(e.target.value)}
                      className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 text-lg font-bold text-emerald-400 text-center outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setTarifaOfertada((prev) => (Number(prev) || 0) + 500)}
                      className="w-12 h-12 rounded-xl bg-slate-800 hover:bg-emerald-500/20 border border-slate-700 hover:border-emerald-500/50 text-emerald-400 font-black text-xl flex items-center justify-center shrink-0 active:scale-95 transition"
                      title="Aumentar $500"
                    >
                      +
                    </button>
                  </div>
                </div>

                <button className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black">PEDIR BÓLIDO AHORA</button>
              </form>
            )}

            {viajeActivo && !conductorAsignado && (
              <div className="space-y-4">
                {(() => {
                  const pct = Math.max(0, Math.min(100, (segundos / 60) * 100));
                  const grados = (pct / 100) * 360;
                  const colorBorde = segundos > 30 ? '#10b981' : segundos > 15 ? '#f59e0b' : '#ef4444';
                  const claseTexto = segundos > 30 ? 'text-emerald-400' : segundos > 15 ? 'text-amber-400' : 'text-red-400 animate-pulse';

                  return (
                    <div
                      className="p-[3px] rounded-2xl shadow-lg transition-all duration-700"
                      style={{
                        background: `conic-gradient(${colorBorde} ${grados}deg, rgba(148, 163, 184, 0.2) ${grados}deg)`,
                      }}
                    >
                      <div className="p-4 rounded-[13px] bg-slate-950 text-center relative overflow-hidden">
                        <p className="text-xs text-slate-400">Buscando conductores cercanos...</p>
                        <p className={`text-3xl font-black flex items-center justify-center gap-2 mt-1 transition-colors duration-500 ${claseTexto}`}>
                          <Clock className={segundos <= 15 && segundos > 0 ? 'animate-spin' : ''} /> {segundos}s
                        </p>
                        <p className="text-xs mt-1">
                          Oferta: <strong>${Number(viajeActivo.tarifa_ofertada_pasajero).toLocaleString()} COP</strong> • Pago: <span className="text-amber-400 font-bold">{viajeActivo.metodo_pago_viaje}</span>
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {expirado && (
                  <div className="p-4 rounded-xl bg-amber-500/20 border border-amber-500 space-y-2">
                    <p className="text-sm font-bold text-amber-300">Ningún conductor aceptó en 60 segundos.</p>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setTarifaOfertada((prev) => Math.max(2000, (Number(prev) || 0) - 500))}
                        className="w-10 h-10 rounded-lg bg-slate-900 hover:bg-red-500/20 border border-slate-700 text-red-400 font-black text-lg flex items-center justify-center shrink-0"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        step="500"
                        value={tarifaOfertada}
                        onChange={(e) => setTarifaOfertada(e.target.value)}
                        className="flex-1 min-w-0 p-2 rounded-lg bg-slate-900 border border-slate-700 font-bold text-center text-emerald-400"
                      />
                      <button
                        type="button"
                        onClick={() => setTarifaOfertada((prev) => (Number(prev) || 0) + 500)}
                        className="w-10 h-10 rounded-lg bg-slate-900 hover:bg-emerald-500/20 border border-slate-700 text-emerald-400 font-black text-lg flex items-center justify-center shrink-0"
                      >
                        +
                      </button>
                      <button onClick={solicitarCarrera} className="px-3.5 h-10 rounded-lg bg-amber-500 text-slate-950 font-black text-xs shrink-0">
                        Reintentar
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase text-slate-400">Ofertas de Conductores ({ofertas.length}):</p>
                  {ofertas.map((of) => (
                    <div key={of.id} className="p-3 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <img src={`${API_URL}${of.foto_perfil_url}`} alt="Conductor" className="w-11 h-11 rounded-full object-cover bg-slate-700" />
                        <div>
                          <p className="font-bold text-sm flex items-center gap-1.5">
                            {of.conductor_nombre}
                            <span className="text-xs text-amber-400 flex items-center">★ {of.calificacion_promedio || '5.0'}</span>
                          </p>
                          <p className="text-xs text-slate-400">{of.marca_vehiculo} {of.anio_vehiculo} • {of.placa} ({of.color_vehiculo})</p>
                          <p className="text-emerald-400 font-black">${Number(of.monto_contraoferta).toLocaleString()} COP</p>
                        </div>
                      </div>
                      <button onClick={() => aceptarOferta(of.id)} className="px-3 py-2 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs">ACEPTAR</button>
                    </div>
                  ))}
                </div>

                <button onClick={() => setModalCancelar(true)} className="w-full py-2.5 rounded-xl bg-red-600/20 border border-red-500 text-red-300 text-xs font-bold">Cancelar Solicitud</button>
              </div>
            )}

            {viajeActivo && conductorAsignado && (
              <div className="space-y-4">
                {alertaCerca && (
                  <div className="p-3 rounded-xl bg-emerald-500 text-slate-950 font-black text-center text-sm animate-pulse">{alertaCerca}</div>
                )}

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-black px-2.5 py-1 rounded-full ${viajeActivo.estado === 'EN_CURSO' ? 'bg-emerald-500 text-slate-950' : 'bg-amber-500 text-slate-950'}`}>
                      {viajeActivo.estado === 'EN_CURSO' ? 'VIAJE EN CURSO' : 'CONDUCTOR EN CAMINO'}
                    </span>
                    <span className="text-xs text-emerald-400 font-bold">
                      {viajeActivo.estado === 'EN_CURSO'
                        ? `Destino [B]: ${destino?.texto}`
                        : etaMinutos
                        ? `Llega al punto [A] en ~${etaMinutos} min`
                        : 'Calculando llegada...'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <img src={`${API_URL}${conductorAsignado.foto_perfil_url}`} alt="Conductor" className="w-14 h-14 rounded-full object-cover border-2 border-amber-400" />
                    <img src={`${API_URL}${conductorAsignado.foto_vehiculo_frente_url}`} alt="Vehículo" className="w-20 h-14 rounded-xl object-cover border border-slate-700" />
                    <div>
                      <p className="font-bold">{conductorAsignado.nombre} {conductorAsignado.apellido}</p>
                      <p className="text-sm font-black text-amber-400">{conductorAsignado.placa}</p>
                      <p className="text-xs text-slate-300 font-medium">{conductorAsignado.marca_vehiculo} {conductorAsignado.anio_vehiculo} • Color {conductorAsignado.color_vehiculo}</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800">
                    <span>Tarifa: <strong className="text-emerald-400">${Number(viajeActivo.tarifa_final_acordada).toLocaleString()} COP</strong></span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 font-bold text-amber-300">Pago: {viajeActivo.metodo_pago_viaje}</span>
                  </div>

                  {viajeActivo.estado === 'ACEPTADA' && (
                    <button
                      onClick={iniciarRecorrido}
                      className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg"
                    >
                      <Play size={16} /> YA SUBÍ AL VEHÍCULO — INICIAR RECORRIDO
                    </button>
                  )}
                </div>

                <div className="bg-slate-950 rounded-2xl border border-slate-800 p-3 flex flex-col h-48">
                  <p className="text-xs font-bold text-slate-400 flex items-center gap-1 pb-2 border-b border-slate-800"><MessageSquare size={14} /> Chat con tu conductor</p>
                  <div className="flex-1 overflow-y-auto py-2 space-y-1.5 text-xs">
                    {mensajes.map((m, idx) => (
                      <div key={idx} className={`p-2 rounded-lg max-w-[85%] ${m.remitente_id === user.id ? 'bg-amber-500 text-slate-950 ml-auto font-medium' : 'bg-slate-800'}`}>
                        <span className="font-bold block text-[10px] opacity-75">{m.remitente_nombre}</span>
                        {m.mensaje}
                      </div>
                    ))}
                  </div>
                  <form onSubmit={enviarMensaje} className="flex gap-1.5 pt-2">
                    <input value={textoChat} onChange={(e) => setTextoChat(e.target.value)} placeholder="Escribe un mensaje..." className="flex-1 px-3 py-2 rounded-xl bg-slate-800 text-xs" />
                    <button className="p-2 rounded-xl bg-amber-500 text-slate-950"><Send size={15} /></button>
                  </form>
                </div>

                {viajeActivo.estado === 'ACEPTADA' && (
                  <button onClick={() => setModalCancelar(true)} className="w-full py-2.5 rounded-xl bg-red-600/20 border border-red-500 text-red-300 text-xs font-bold flex items-center justify-center gap-1">
                    <XOctagon size={14} /> Cancelar Carrera
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {viajeParaCalificar && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <form onSubmit={enviarCalificacion} className="bg-slate-900 border border-amber-500/40 p-6 rounded-2xl max-w-md w-full text-center space-y-4 shadow-2xl">
            <h3 className="font-black text-xl text-amber-400">¡Llegaste a tu destino!</h3>
            <p className="text-xs text-slate-300">
              Califica tu viaje con <strong>{viajeParaCalificar.conductor?.nombre}</strong> ({viajeParaCalificar.conductor?.placa})
            </p>
            <div className="flex justify-center gap-2 py-2">
              {[1, 2, 3, 4, 5].map((num) => (
                <button type="button" key={num} onClick={() => setEstrellas(num)} className="p-1 transition transform hover:scale-110">
                  <Star size={36} className={num <= estrellas ? 'text-amber-400 fill-amber-400' : 'text-slate-600'} />
                </button>
              ))}
            </div>
            <p className="text-xs font-bold text-amber-300">
              {estrellas > 0 ? `${estrellas} de 5 estrellas` : 'Selecciona una calificación (1 a 5 estrellas)'}
            </p>
            <textarea rows="2" value={comentarioCalif} onChange={(e) => setComentarioCalif(e.target.value)} placeholder="Comentario opcional sobre el servicio..." className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 text-xs" />
            <button
              type="submit"
              disabled={estrellas < 1}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-45 disabled:cursor-not-allowed text-slate-950 font-black text-sm transition"
            >
              ENVIAR CALIFICACIÓN
            </button>
          </form>
        </div>
      )}

      {modalCancelar && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="font-black text-lg text-red-400">Cancelar Viaje</h3>
            <p className="text-xs text-slate-300">Selecciona el motivo por el cual deseas cancelar:</p>

            <div className="space-y-2 text-xs">
              {[
                { id: 'DEMORA', titulo: '⏳ El conductor se demora mucho', desc: 'El vehículo tarda demasiado en llegar al punto de recogida.' },
                { id: 'NO_COMUNICACION', titulo: '📵 No hay comunicación con el conductor', desc: 'No responde mensajes ni llamadas.' },
                { id: 'SOLO_CANCELAR', titulo: '✖️ Solo quería cancelar', desc: 'Cambié de planes o ya no necesito el servicio.' },
              ].map((op) => (
                <button
                  type="button"
                  key={op.id}
                  onClick={() => setCodigoMotivo(op.id)}
                  className={`w-full text-left p-3 rounded-xl border transition ${
                    codigoMotivo === op.id ? 'bg-red-500/20 border-red-500 text-white' : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <p className="font-bold">{op.titulo}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{op.desc}</p>
                </button>
              ))}
            </div>

            <div>
              <label className="text-[11px] text-slate-400">Detalle adicional (opcional)</label>
              <textarea
                rows="2"
                value={motivoCancelacion}
                onChange={(e) => setMotivoCancelacion(e.target.value)}
                placeholder="Escribe una nota adicional si lo deseas..."
                className="w-full mt-1 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setModalCancelar(false)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-xs font-bold">Volver</button>
              <button onClick={confirmarCancelacion} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black">Confirmar Cancelación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
