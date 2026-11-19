const express = require('express');
const pool = require('../db');
const { verificarToken } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const router = express.Router();
router.use(verificarToken);

const temporizadoresViaje = new Map();

router.get('/config-publica', async (req, res) => {
  const { rows } = await pool.query('SELECT porcentaje_comision, valor_por_km, COALESCE(radio_busqueda_km, 15) AS radio_busqueda_km, nequi_numero, llave_bre_b, instrucciones_pago FROM configuracion_plataforma WHERE id = 1');
  res.json(rows[0]);
});

router.get('/mi-perfil-conductor', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM perfil_conductor WHERE usuario_id = $1', [req.user.id]);
  res.json(rows[0]);
});

router.post('/recargas', upload.single('comprobante'), async (req, res) => {
  const { monto, metodo_pago, numero_referencia } = req.body;
  const comprobante_url = req.file ? `/uploads/${req.file.filename}` : null;
  const { rows } = await pool.query(
    `INSERT INTO recargas_saldo (conductor_id, monto, metodo_pago, numero_referencia, comprobante_url)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.user.id, monto, metodo_pago, numero_referencia, comprobante_url]
  );
  res.status(201).json(rows[0]);
});

// Pasajero solicita carrera incluyendo método de pago (EFECTIVO o NEQUI)
router.post('/solicitar', async (req, res) => {
  const {
    origen_texto, origen_lat, origen_lng,
    destino_texto, destino_lat, destino_lng,
    distancia_km, tarifa_sugerida, tarifa_ofertada_pasajero,
    metodo_pago_viaje
  } = req.body;
  const io = req.app.get('io');

  const { rows } = await pool.query(
    `INSERT INTO viajes (
      pasajero_id, origen_texto, origen_lat, origen_lng,
      destino_texto, destino_lat, destino_lng, distancia_km,
      tarifa_sugerida, tarifa_ofertada_pasajero, metodo_pago_viaje
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      req.user.id, origen_texto, origen_lat, origen_lng,
      destino_texto, destino_lat, destino_lng, distancia_km,
      tarifa_sugerida, tarifa_ofertada_pasajero, metodo_pago_viaje || 'EFECTIVO'
    ]
  );
  const viaje = rows[0];

  io.emit('nueva_solicitud_viaje', { ...viaje, pasajero_nombre: req.user.nombre, segundos_restantes: 60 });

  const timer = setTimeout(async () => {
    const check = await pool.query("SELECT estado FROM viajes WHERE id = $1", [viaje.id]);
    if (check.rows[0]?.estado === 'NEGOCIANDO') {
      await pool.query("UPDATE viajes SET estado = 'EXPIRADA' WHERE id = $1", [viaje.id]);
      io.emit(`viaje_expirado_${viaje.id}`, { mensaje: 'Nadie aceptó en 60s. Sube un poco tu oferta.' });
      io.emit('viaje_cerrado_radar', { viaje_id: viaje.id });
    }
    temporizadoresViaje.delete(viaje.id);
  }, 60000);

  temporizadoresViaje.set(viaje.id, timer);
  res.status(201).json(viaje);
});

// Conductor envía contraoferta con su calificación promedio
router.post('/:id/ofertar', async (req, res) => {
  const { monto_contraoferta, tiempo_estimado_min } = req.body;
  const io = req.app.get('io');

  const cfg = (await pool.query('SELECT porcentaje_comision FROM configuracion_plataforma WHERE id=1')).rows[0];
  const perfil = (await pool.query('SELECT * FROM perfil_conductor WHERE usuario_id=$1', [req.user.id])).rows[0];
  const comisionEstimada = (Number(monto_contraoferta) * Number(cfg.porcentaje_comision)) / 100;

  if (!perfil || Number(perfil.saldo_disponible) < comisionEstimada) {
    return res.status(400).json({ error: `Saldo insuficiente. Necesitas al menos $${comisionEstimada} COP de saldo.` });
  }

  const ratingRes = await pool.query(
    'SELECT COALESCE(ROUND(AVG(calificacion), 1), 5.0) AS promedio, COUNT(calificacion) AS total FROM viajes WHERE conductor_id=$1 AND calificacion IS NOT NULL',
    [req.user.id]
  );

  const { rows } = await pool.query(
    `INSERT INTO ofertas_viaje (viaje_id, conductor_id, monto_contraoferta, tiempo_estimado_min)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.params.id, req.user.id, monto_contraoferta, tiempo_estimado_min || 5]
  );

  const ofertaCompleta = {
    ...rows[0],
    conductor_nombre: req.user.nombre,
    placa: perfil.placa,
    color_vehiculo: perfil.color_vehiculo, marca_vehiculo: perfil.marca_vehiculo, anio_vehiculo: perfil.anio_vehiculo,
    foto_perfil_url: perfil.foto_perfil_url,
    foto_vehiculo_frente_url: perfil.foto_vehiculo_frente_url,
    calificacion_promedio: ratingRes.rows[0].promedio,
    total_viajes_calificados: ratingRes.rows[0].total,
  };

  io.emit(`nueva_oferta_${req.params.id}`, ofertaCompleta);
  res.status(201).json(ofertaCompleta);
});

// Pasajero acepta oferta
router.post('/:id/aceptar-oferta/:ofertaId', async (req, res) => {
  const io = req.app.get('io');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const oferta = (await client.query('SELECT * FROM ofertas_viaje WHERE id=$1', [req.params.ofertaId])).rows[0];
    const cfg = (await client.query('SELECT porcentaje_comision FROM configuracion_plataforma WHERE id=1')).rows[0];
    const comision = (Number(oferta.monto_contraoferta) * Number(cfg.porcentaje_comision)) / 100;

    await client.query('UPDATE perfil_conductor SET saldo_disponible = saldo_disponible - $1 WHERE usuario_id = $2', [comision, oferta.conductor_id]);

    const viajeRes = await client.query(
      `UPDATE viajes SET conductor_id=$1, tarifa_final_acordada=$2, comision_cobrada=$3, estado='ACEPTADA'
       WHERE id=$4 RETURNING *`,
      [oferta.conductor_id, oferta.monto_contraoferta, comision, req.params.id]
    );

    const conductorInfo = (await client.query(
      `SELECT u.id, u.nombre, u.apellido, u.telefono, p.placa, p.color_vehiculo, p.marca_vehiculo, p.anio_vehiculo, p.foto_perfil_url, p.foto_vehiculo_frente_url
       FROM usuarios u JOIN perfil_conductor p ON u.id=p.usuario_id WHERE u.id=$1`,
      [oferta.conductor_id]
    )).rows[0];

    await client.query('COMMIT');

    if (temporizadoresViaje.has(req.params.id)) {
      clearTimeout(temporizadoresViaje.get(req.params.id));
      temporizadoresViaje.delete(req.params.id);
    }

    const payload = { viaje: viajeRes.rows[0], conductor: conductorInfo };
    io.emit(`viaje_confirmado_${req.params.id}`, payload);
    io.emit('viaje_cerrado_radar', { viaje_id: req.params.id });
    res.json(payload);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Iniciar recorrido (puede presionarlo tanto el Pasajero como el Conductor)
router.post('/:id/iniciar-recorrido', async (req, res) => {
  const io = req.app.get('io');
  const { rows } = await pool.query(
    "UPDATE viajes SET estado='EN_CURSO' WHERE id=$1 RETURNING *",
    [req.params.id]
  );
  io.emit(`recorrido_iniciado_${req.params.id}`, {
    viaje: rows[0],
    iniciado_por: req.user.rol,
  });
  res.json(rows[0]);
});

// Finalizar carrera
router.post('/:id/finalizar', async (req, res) => {
  const io = req.app.get('io');
  const { rows } = await pool.query("UPDATE viajes SET estado='FINALIZADA' WHERE id=$1 RETURNING *", [req.params.id]);
  io.emit(`viaje_finalizado_${req.params.id}`, rows[0]);
  res.json(rows[0]);
});

// Pasajero califica al conductor (1 a 5 estrellas)
router.post('/:id/calificar', async (req, res) => {
  const { calificacion, comentario } = req.body;
  if (!calificacion || calificacion < 1 || calificacion > 5) {
    return res.status(400).json({ error: 'La calificación debe ser entre 1 y 5 estrellas' });
  }
  const { rows } = await pool.query(
    'UPDATE viajes SET calificacion=$1, comentario_calificacion=$2 WHERE id=$3 RETURNING *',
    [calificacion, comentario || '', req.params.id]
  );
  res.json({ mensaje: '¡Gracias por tu calificación!', viaje: rows[0] });
});

// Cancelar carrera con motivo y regla de reembolso de saldo
router.post('/:id/cancelar', async (req, res) => {
  const { motivo, codigo_motivo } = req.body;
  const io = req.app.get('io');
  if (!motivo) return res.status(400).json({ error: 'Debes indicar el motivo de cancelación' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const vRes = await client.query('SELECT * FROM viajes WHERE id=$1 FOR UPDATE', [req.params.id]);
    const viaje = vRes.rows[0];
    if (!viaje) throw new Error('Viaje no encontrado');

    let reembolsado = false;
    let comisionFinal = Number(viaje.comision_cobrada || 0);

    // Si había conductor asignado y se había descontado comisión:
    // Solo se reembolsa el saldo si el pasajero cancela "porque solo quería cancelar" (SOLO_CANCELAR).
    // Si es por DEMORA o NO_COMUNICACION (o si cancela el conductor), el descuento se mantiene.
    if (viaje.conductor_id && comisionFinal > 0) {
      if (req.user.rol === 'PASAJERO' && codigo_motivo === 'SOLO_CANCELAR') {
        await client.query(
          'UPDATE perfil_conductor SET saldo_disponible = saldo_disponible + $1 WHERE usuario_id = $2',
          [comisionFinal, viaje.conductor_id]
        );
        comisionFinal = 0;
        reembolsado = true;
      }
    }

    const { rows } = await client.query(
      `UPDATE viajes
       SET estado='CANCELADA', cancelado_por=$1, motivo_cancelacion=$2, comision_cobrada=$3
       WHERE id=$4 RETURNING *`,
      [req.user.rol, motivo, comisionFinal, req.params.id]
    );

    await client.query('COMMIT');

    io.emit(`viaje_cancelado_${req.params.id}`, {
      cancelado_por: req.user.rol,
      motivo,
      codigo_motivo,
      reembolsado,
    });
    io.emit('viaje_cerrado_radar', { viaje_id: req.params.id });

    res.json({ ...rows[0], reembolsado });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});


// Historial de viajes (para Pasajero y Conductor) + Resumen de Ganancias del Conductor

// Recuperar viaje activo en curso (si el conductor o pasajero recargó o salió por error)

router.get('/radar-activos', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT v.*, u.nombre AS pasajero_nombre, u.apellido AS pasajero_apellido, u.telefono AS pasajero_telefono
       FROM viajes v
       LEFT JOIN usuarios u ON v.pasajero_id = u.id
       WHERE v.estado IN ('BUSCANDO', 'SOLICITADO', 'PENDIENTE')
       ORDER BY v.id DESC`
    );
    res.json({ solicitudes: rows || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/activo', async (req, res) => {
  try {
    if (req.user.rol === 'CONDUCTOR') {
      const { rows } = await pool.query(`
        SELECT v.*, u.nombre AS pasajero_nombre, u.apellido AS pasajero_apellido, u.telefono AS pasajero_telefono
        FROM viajes v
        LEFT JOIN usuarios u ON v.pasajero_id = u.id
        WHERE v.conductor_id = $1 AND v.estado IN ('ACEPTADA', 'EN_CURSO')
        ORDER BY v.creado_en DESC
        LIMIT 1
      `, [req.user.id]);

      return res.json({ viaje: rows[0] || null });
    } else {
      const vRes = await pool.query(`
        SELECT * FROM viajes
        WHERE pasajero_id = $1 AND estado IN ('PENDIENTE', 'ACEPTADA', 'EN_CURSO')
        ORDER BY creado_en DESC
        LIMIT 1
      `, [req.user.id]);

      const viaje = vRes.rows[0] || null;
      if (!viaje) return res.json({ viaje: null, conductor: null, ofertas: [] });

      let conductor = null;
      if (viaje.conductor_id) {
        const cRes = await pool.query(`
          SELECT u.id, u.nombre, u.apellido, u.telefono,
                 p.placa, p.color_vehiculo, p.marca_vehiculo, p.anio_vehiculo,
                 p.foto_perfil_url, p.foto_vehiculo_frente_url, '5.0' AS calificacion_promedio
          FROM usuarios u
          LEFT JOIN perfil_conductor p ON u.id = p.usuario_id
          WHERE u.id = $1
        `, [viaje.conductor_id]);
        conductor = cRes.rows[0] || null;
      }

      const oRes = await pool.query(`
        SELECT o.*, u.nombre AS conductor_nombre, u.apellido AS conductor_apellido,
               p.placa, p.color_vehiculo, p.marca_vehiculo, p.anio_vehiculo,
               p.foto_perfil_url, '5.0' AS calificacion_promedio
        FROM ofertas_viaje o
        JOIN usuarios u ON o.conductor_id = u.id
        JOIN perfil_conductor p ON u.id = p.usuario_id
        WHERE o.viaje_id = $1 AND o.estado = 'PENDIENTE'
        ORDER BY o.creado_en DESC
      `, [viaje.id]);

      return res.json({ viaje, conductor, ofertas: oRes.rows });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/historial', async (req, res) => {
  try {
    if (req.user.rol === 'CONDUCTOR') {
      const resumenRes = await pool.query(`
        SELECT
          COUNT(*) AS total_viajes,
          COALESCE(SUM(tarifa_final_acordada), 0) AS total_bruto,
          COALESCE(SUM(comision_cobrada), 0) AS total_comisiones,
          COALESCE(SUM(tarifa_final_acordada - COALESCE(comision_cobrada, 0)), 0) AS ganancia_neta_total,
          COALESCE(SUM(CASE WHEN DATE(creado_en) = CURRENT_DATE THEN (tarifa_final_acordada - COALESCE(comision_cobrada, 0)) ELSE 0 END), 0) AS ganancia_neta_hoy
        FROM viajes
        WHERE conductor_id = $1 AND estado = 'FINALIZADA'
      `, [req.user.id]);

      const viajesRes = await pool.query(`
        SELECT v.*, u.nombre AS pasajero_nombre, u.apellido AS pasajero_apellido
        FROM viajes v
        LEFT JOIN usuarios u ON v.pasajero_id = u.id
        WHERE v.conductor_id = $1
        ORDER BY v.creado_en DESC
        LIMIT 50
      `, [req.user.id]);

      return res.json({
        resumen: resumenRes.rows[0],
        viajes: viajesRes.rows,
      });
    } else {
      // Historial para el Pasajero
      const viajesRes = await pool.query(`
        SELECT v.*, u.nombre AS conductor_nombre, u.apellido AS conductor_apellido,
               p.placa, p.marca_vehiculo, p.color_vehiculo
        FROM viajes v
        LEFT JOIN usuarios u ON v.conductor_id = u.id
        LEFT JOIN perfil_conductor p ON u.id = p.usuario_id
        WHERE v.pasajero_id = $1
        ORDER BY v.creado_en DESC
        LIMIT 50
      `, [req.user.id]);

      return res.json({
        viajes: viajesRes.rows,
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
