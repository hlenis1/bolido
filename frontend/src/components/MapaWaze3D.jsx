import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Compass, Layers } from 'lucide-react';

const crearEstiloMapa = (oscuro) => ({
  version: 8,
  name: oscuro ? 'Bolido Dark' : 'Bolido Light',
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': oscuro ? '#0b1120' : '#f1f5f9' },
    },
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
      paint: oscuro
        ? {
            'raster-brightness-max': 0.55,
            'raster-saturation': -0.45,
            'raster-contrast': 0.25,
          }
        : {
            'raster-brightness-max': 1,
            'raster-saturation': 0.05,
            'raster-contrast': 0.05,
          },
    },
  ],
});

const extraerLatLng = (punto) => {
  if (!punto) return null;
  const lat = Number(punto.lat ?? punto.latitud);
  const lng = Number(punto.lng ?? punto.longitud);
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
};

export default function MapaWaze3D({
  centroInicial = [-76.532, 3.4516],
  zoomInicial = 14.5,
  origen = null,
  destino = null,
  ubicacionCarro = null,
  rutaPrincipal = [],
  rutaSecundaria = [],
  colorRuta = '#f59e0b',
  etapaViaje = 'IDLE',
  triggerCentrar = 0,
}) {
  const contenedorRef = useRef(null);
  const mapRef = useRef(null);
  const markerARef = useRef(null);
  const markerBRef = useRef(null);
  const ultimaEtapaRef = useRef(null);
  const ultimoTriggerRef = useRef(0);
  const ultimaConsultaOsrmRef = useRef('');
  const temaInicialRef = useRef(!document.documentElement.classList.contains('tema-claro'));

  const [vista3D, setVista3D] = useState(true);
  const [esOscuro, setEsOscuro] = useState(temaInicialRef.current);
  const [rutaDesdeCarro, setRutaDesdeCarro] = useState([]);
  const [svgPaths, setSvgPaths] = useState({ principal: '', secundaria: '', carroPx: null });

  const datosRef = useRef({
    rutaPrincipal,
    rutaSecundaria,
    rutaDesdeCarro,
    origen,
    destino,
    ubicacionCarro,
    etapaViaje,
  });
  datosRef.current = {
    rutaPrincipal,
    rutaSecundaria,
    rutaDesdeCarro,
    origen,
    destino,
    ubicacionCarro,
    etapaViaje,
  };

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const claro = document.documentElement.classList.contains('tema-claro');
      setEsOscuro(!claro);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Trazar ruta real por calles (OSRM) de forma inmediata en ACEPTADA (si rutaPrincipal viene vacía) y en EN_CURSO (desde el carrito)
  useEffect(() => {
    const orig = extraerLatLng(origen);
    const carro = extraerLatLng(ubicacionCarro);
    const dest = extraerLatLng(destino);

    if (!dest) {
      setRutaDesdeCarro([]);
      ultimaConsultaOsrmRef.current = '';
      return;
    }

    const necesitaRutaPropia =
      etapaViaje === 'EN_CURSO' ||
      (etapaViaje === 'ACEPTADA' && (!Array.isArray(rutaPrincipal) || rutaPrincipal.length < 2));

    if (!necesitaRutaPropia) {
      setRutaDesdeCarro([]);
      ultimaConsultaOsrmRef.current = '';
      return;
    }

    const inicio = etapaViaje === 'EN_CURSO' ? (carro || orig) : (orig || carro);
    if (!inicio) return;

    const clave = `${etapaViaje}:${inicio.lat.toFixed(4)},${inicio.lng.toFixed(4)}->${dest.lat.toFixed(4)},${dest.lng.toFixed(4)}`;
    if (ultimaConsultaOsrmRef.current === clave) return;
    ultimaConsultaOsrmRef.current = clave;

    let cancelado = false;
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${inicio.lng},${inicio.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelado) return;
        if (data?.routes?.[0]?.geometry?.coordinates?.length >= 2) {
          setRutaDesdeCarro(data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]));
        }
      })
      .catch(() => {});

    return () => {
      cancelado = true;
    };
  }, [etapaViaje, ubicacionCarro, origen, destino, rutaPrincipal]);

  const recalcularProyeccionRutas = () => {
    const map = mapRef.current;
    if (!map) return;

    const {
      rutaPrincipal: principal,
      rutaSecundaria: secundaria,
      rutaDesdeCarro: vivaCarroB,
      origen: origRaw,
      destino: destRaw,
      ubicacionCarro: carroRaw,
      etapaViaje: etapa,
    } = datosRef.current;

    const orig = extraerLatLng(origRaw);
    const dest = extraerLatLng(destRaw);
    const carro = extraerLatLng(carroRaw);

    let pts1 = [];
    if (etapa === 'EN_CURSO' && carro && dest) {
      // En curso: la línea nace directamente desde el carrito hasta el destino [B]
      const rutaBase = (vivaCarroB || []).filter(
        (p) => Array.isArray(p) && p.length >= 2 && !isNaN(Number(p[0])) && !isNaN(Number(p[1]))
      );
      if (rutaBase.length >= 2) {
        pts1 = [[carro.lat, carro.lng], ...rutaBase.slice(1)];
      } else {
        pts1 = [
          [carro.lat, carro.lng],
          [dest.lat, dest.lng],
        ];
      }
    } else {
      const fuentePrincipal = Array.isArray(principal) && principal.length >= 2 ? principal : vivaCarroB;
      pts1 = (fuentePrincipal || []).filter(
        (p) => Array.isArray(p) && p.length >= 2 && !isNaN(Number(p[0])) && !isNaN(Number(p[1]))
      );
      if (pts1.length < 2 && orig && dest) {
        pts1 = [
          [orig.lat, orig.lng],
          [dest.lat, dest.lng],
        ];
      }
    }

    let pts2 = [];
    if (etapa !== 'EN_CURSO') {
      pts2 = (secundaria || []).filter(
        (p) => Array.isArray(p) && p.length >= 2 && !isNaN(Number(p[0])) && !isNaN(Number(p[1]))
      );
      if (pts2.length < 2 && carro && orig) {
        const dist = Math.abs(carro.lat - orig.lat) + Math.abs(carro.lng - orig.lng);
        if (dist > 0.0005) {
          pts2 = [
            [carro.lat, carro.lng],
            [orig.lat, orig.lng],
          ];
        }
      }
    }

    const aStringPuntos = (lista) =>
      lista
        .map(([lat, lng]) => {
          const p = map.project([Number(lng), Number(lat)]);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        })
        .join(' ');

    let carroPx = null;
    const carroEfectivo = carro || (etapa !== 'IDLE' ? orig : null);
    if (carroEfectivo) {
      let cLat = carroEfectivo.lat;
      let cLng = carroEfectivo.lng;
      // Solo separar visualmente del pin [A] si el pin [A] sigue visible (antes de EN_CURSO)
      if (
        etapa !== 'EN_CURSO' &&
        orig &&
        Math.abs(cLat - orig.lat) < 0.0001 &&
        Math.abs(cLng - orig.lng) < 0.0001
      ) {
        cLat -= 0.00018;
        cLng -= 0.00018;
      }
      const pCarro = map.project([cLng, cLat]);
      carroPx = { x: pCarro.x, y: pCarro.y };
    }

    setSvgPaths({
      principal: pts1.length >= 2 ? aStringPuntos(pts1) : '',
      secundaria: pts2.length >= 2 ? aStringPuntos(pts2) : '',
      carroPx,
    });
  };

  useEffect(() => {
    if (!contenedorRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: contenedorRef.current,
      style: crearEstiloMapa(temaInicialRef.current),
      center: (() => { const o = extraerLatLng(origen); return o ? [o.lng, o.lat] : centroInicial; })(),
      zoom: zoomInicial,
      pitch: 52,
      bearing: 0,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right');

    const sincronizar = () => recalcularProyeccionRutas();

    map.on('load', () => {
      map.resize();
      ultimaEtapaRef.current = null;
      sincronizar();
      const o = extraerLatLng(datosRef.current.origen);
      if (o && !datosRef.current.destino) {
        map.jumpTo({ center: [o.lng, o.lat], zoom: 15.5, pitch: 52 });
      }
    });
    map.on('move', sincronizar);
    map.on('zoom', sincronizar);
    map.on('pitch', sincronizar);
    map.on('rotate', sincronizar);
    map.on('resize', sincronizar);

    const resizeObs = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
        sincronizar();
      }
    });
    resizeObs.observe(contenedorRef.current);

    mapRef.current = map;

    return () => {
      resizeObs.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || temaInicialRef.current === esOscuro) return;
    temaInicialRef.current = esOscuro;
    map.setStyle(crearEstiloMapa(esOscuro));
  }, [esOscuro]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ pitch: vista3D ? 52 : 0, duration: 600 });
  }, [vista3D]);

  useEffect(() => {
    recalcularProyeccionRutas();
  }, [rutaPrincipal, rutaSecundaria, rutaDesdeCarro, origen, destino, ubicacionCarro, etapaViaje]);

  // Marcador Punto A (desaparece cuando etapaViaje === 'EN_CURSO')
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (markerARef.current) {
      markerARef.current.remove();
      markerARef.current = null;
    }
    if (etapaViaje === 'EN_CURSO') return;

    const orig = extraerLatLng(origen);
    if (orig) {
      const el = document.createElement('div');
      el.style.width = '36px';
      el.style.height = '36px';
      el.style.zIndex = '15';
      el.innerHTML = `<div style="background:#10b981;color:#052e16;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;border:3px solid #ffffff;box-shadow:0 4px 14px rgba(16,185,129,0.75);">A</div>`;
      markerARef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([orig.lng, orig.lat])
        .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML(`<strong>Punto A (Recogida):</strong> ${origen?.texto || ''}`))
        .addTo(map);
    }
  }, [origen, etapaViaje]);

  // Marcador Punto B
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (markerBRef.current) {
      markerBRef.current.remove();
      markerBRef.current = null;
    }
    const dest = extraerLatLng(destino);
    if (dest) {
      const el = document.createElement('div');
      el.style.width = '36px';
      el.style.height = '36px';
      el.style.zIndex = '15';
      el.innerHTML = `<div style="background:#ef4444;color:#ffffff;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px;border:3px solid #ffffff;box-shadow:0 4px 14px rgba(239,68,68,0.75);">B</div>`;
      markerBRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([dest.lng, dest.lat])
        .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML(`<strong>Punto B (Destino):</strong> ${destino?.texto || ''}`))
        .addTo(map);
    }
  }, [destino]);

  // Encuadre inteligente
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const orig = etapaViaje === 'EN_CURSO' ? null : extraerLatLng(origen);
    const dest = extraerLatLng(destino);
    const carro = extraerLatLng(ubicacionCarro);

    const claveEtapa = `${etapaViaje}_${orig?.lat || ''}_${dest?.lat || ''}_${dest?.lng || ''}`;
    const cambioEtapa = ultimaEtapaRef.current !== claveEtapa;
    const pidioCentrar = ultimoTriggerRef.current !== triggerCentrar;
    if (!cambioEtapa && !pidioCentrar && ultimaEtapaRef.current !== null) return;

    const bounds = new maplibregl.LngLatBounds();
    let count = 0;

    if (orig) {
      bounds.extend([orig.lng, orig.lat]);
      count++;
    }
    if (dest) {
      bounds.extend([dest.lng, dest.lat]);
      count++;
    }
    if (carro) {
      bounds.extend([carro.lng, carro.lat]);
      count++;
    }

    if (count >= 2) {
      map.fitBounds(bounds, { padding: 80, maxZoom: 16.5, pitch: vista3D ? 52 : 0, duration: 800 });
      ultimaEtapaRef.current = claveEtapa;
      ultimoTriggerRef.current = triggerCentrar;
    } else if (count === 1) {
      const unico = orig || dest || carro;
      map.flyTo({ center: [unico.lng, unico.lat], zoom: 15.5, pitch: vista3D ? 52 : 0, duration: 800 });
      ultimaEtapaRef.current = claveEtapa;
      ultimoTriggerRef.current = triggerCentrar;
    }
  }, [origen, destino, ubicacionCarro, etapaViaje, triggerCentrar]);

  return (
    <div className="relative w-full h-full min-h-[380px] overflow-hidden">
      <div ref={contenedorRef} className="w-full h-full min-h-[380px]" />

      {/* Capa SVG sincronizada con MapLibre */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 5 }}
      >
        {svgPaths.secundaria && (
          <>
            <polyline
              points={svgPaths.secundaria}
              fill="none"
              stroke="#052e16"
              strokeWidth="9"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.85"
            />
            <polyline
              points={svgPaths.secundaria}
              fill="none"
              stroke="#10b981"
              strokeWidth="5"
              strokeDasharray="10 8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}

        {svgPaths.principal && (
          <>
            <polyline
              points={svgPaths.principal}
              fill="none"
              stroke={colorRuta}
              strokeWidth="16"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.28"
            />
            <polyline
              points={svgPaths.principal}
              fill="none"
              stroke="#090d16"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.92"
            />
            <polyline
              points={svgPaths.principal}
              fill="none"
              stroke={colorRuta}
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
      </svg>

      {/* Carrito 3D proyectado en tiempo real siempre visible */}
      {svgPaths.carroPx && (
        <div
          style={{
            position: 'absolute',
            left: `${svgPaths.carroPx.x}px`,
            top: `${svgPaths.carroPx.y}px`,
            transform: 'translate(-50%, -50%)',
            zIndex: 40,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'radial-gradient(circle,#f59e0b 42%,rgba(245,158,11,0.32) 78%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '3px solid #ffffff',
              boxShadow: '0 0 20px rgba(245,158,11,1)',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 64 64" fill="none">
              <rect x="16" y="8" width="32" height="48" rx="10" fill="#0f172a" stroke="#f59e0b" strokeWidth="3" />
              <path d="M20 20H44L41 31H23L20 20Z" fill="#38bdf8" />
              <path d="M22 43H42L40 49H24L22 43Z" fill="#38bdf8" opacity="0.9" />
              <rect x="18" y="9" width="7" height="3.5" rx="1.5" fill="#fef08a" />
              <rect x="39" y="9" width="7" height="3.5" rx="1.5" fill="#fef08a" />
              <rect x="18" y="52" width="7" height="3.5" rx="1.5" fill="#ef4444" />
              <rect x="39" y="52" width="7" height="3.5" rx="1.5" fill="#ef4444" />
            </svg>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setVista3D(!vista3D)}
        className="absolute top-3 left-3 z-10 bg-slate-950/90 hover:bg-amber-500 hover:text-slate-950 border border-slate-700 text-amber-400 px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-lg transition"
      >
        {vista3D ? <Compass size={14} /> : <Layers size={14} />}
        {vista3D ? 'Vista 3D' : 'Vista 2D Plana'}
      </button>
    </div>
  );
}
