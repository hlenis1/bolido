const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { uploadDocumentosConductor } = require('../middleware/upload');

const router = express.Router();
router.use(verificarToken, soloAdmin);

const asegurarColumnaRadio = () =>
  pool.query('ALTER TABLE configuracion_plataforma ADD COLUMN IF NOT EXISTS radio_busqueda_km DECIMAL(6,2) NOT NULL DEFAULT 15.00').catch(() => {});
asegurarColumnaRadio();

router.get('/configuracion', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM configuracion_plataforma WHERE id = 1');
  res.json(rows[0]);
});

router.put('/configuracion', async (req, res) => {
  const { porcentaje_comision, valor_por_km, radio_busqueda_km, nequi_numero, llave_bre_b, instrucciones_pago } = req.body;
  const radioKm = Math.max(1, Number(radio_busqueda_km) || 15);
  const { rows } = await pool.query(
    `UPDATE configuracion_plataforma
     SET porcentaje_comision=$1, valor_por_km=$2, radio_busqueda_km=$3, nequi_numero=$4, llave_bre_b=$5, instrucciones_pago=$6
     WHERE id=1 RETURNING *`,
    [porcentaje_comision, valor_por_km, radioKm, nequi_numero, llave_bre_b, instrucciones_pago]
  );
  res.json(rows[0]);
});

// Listar todos los usuarios (Pasajeros y Conductores con su perfil)
router.get('/usuarios', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.rol, u.nombre, u.apellido, u.telefono, u.estado_cuenta, u.creado_en,
           p.saldo_disponible, p.placa, p.color_vehiculo, p.marca_vehiculo, p.anio_vehiculo,
           p.foto_perfil_url, p.foto_cedula_frente_url, p.foto_cedula_reverso_url,
           p.foto_licencia_url, p.foto_tarjeta_propiedad_url, p.foto_vehiculo_frente_url
    FROM usuarios u
    LEFT JOIN perfil_conductor p ON u.id = p.usuario_id
    WHERE u.rol IN ('PASAJERO', 'CONDUCTOR')
    ORDER BY u.creado_en DESC
  `);
  res.json(rows);
});

// Editar datos de Usuario o Conductor (incluyendo cambio de contraseña)
router.put('/usuarios/:id', async (req, res) => {
  const {
    nombre, apellido, telefono, password, estado_cuenta,
    placa, color_vehiculo, marca_vehiculo, anio_vehiculo, saldo_disponible
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (password && password.trim() !== '') {
      const hash = await bcrypt.hash(password, 10);
      await client.query(
        'UPDATE usuarios SET nombre=$1, apellido=$2, telefono=$3, password_hash=$4, estado_cuenta=$5 WHERE id=$6',
        [nombre, apellido, telefono, hash, estado_cuenta, req.params.id]
      );
    } else {
      await client.query(
        'UPDATE usuarios SET nombre=$1, apellido=$2, telefono=$3, estado_cuenta=$4 WHERE id=$5',
        [nombre, apellido, telefono, estado_cuenta, req.params.id]
      );
    }

    // Si tiene perfil de conductor, actualizar datos del vehículo y saldo
    await client.query(
      `UPDATE perfil_conductor
       SET placa=$1, color_vehiculo=$2, marca_vehiculo=$3, anio_vehiculo=$4, saldo_disponible=$5
       WHERE usuario_id=$6`,
      [
        (placa || '').toUpperCase(),
        color_vehiculo || '',
        marca_vehiculo || '',
        anio_vehiculo || '',
        Number(saldo_disponible || 0),
        req.params.id
      ]
    );

    await client.query('COMMIT');
    res.json({ mensaje: 'Datos actualizados correctamente' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: 'Error al actualizar: ' + err.message });
  } finally {
    client.release();
  }
});

router.patch('/conductores/:id/estado', async (req, res) => {
  await pool.query('UPDATE usuarios SET estado_cuenta = $1 WHERE id = $2', [req.body.estado, req.params.id]);
  res.json({ mensaje: 'Estado actualizado' });
});

router.post('/crear-usuario', uploadDocumentosConductor, async (req, res) => {
  const { rol, nombre, apellido, telefono, password, placa, color_vehiculo, marca_vehiculo, anio_vehiculo, saldo_inicial } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(password, 10);
    const uRes = await client.query(
      `INSERT INTO usuarios (rol, nombre, apellido, telefono, password_hash, estado_cuenta)
       VALUES ($1, $2, $3, $4, $5, 'APROBADO') RETURNING id`,
      [rol, nombre, apellido, telefono, hash]
    );
    if (rol === 'CONDUCTOR') {
      const f = req.files || {};
      await client.query(
        `INSERT INTO perfil_conductor (
          usuario_id, saldo_disponible, placa, color_vehiculo, marca_vehiculo, anio_vehiculo, foto_perfil_url,
          foto_cedula_frente_url, foto_cedula_reverso_url, foto_licencia_url,
          foto_tarjeta_propiedad_url, foto_vehiculo_frente_url
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          uRes.rows[0].id, saldo_inicial || 0, (placa || 'SINPLACA').toUpperCase(), color_vehiculo || 'Blanco',
          marca_vehiculo || 'No especificada', anio_vehiculo || 'N/A',
          f.foto_perfil ? `/uploads/${f.foto_perfil[0].filename}` : '',
          f.foto_cedula_frente ? `/uploads/${f.foto_cedula_frente[0].filename}` : '',
          f.foto_cedula_reverso ? `/uploads/${f.foto_cedula_reverso[0].filename}` : '',
          f.foto_licencia ? `/uploads/${f.foto_licencia[0].filename}` : '',
          f.foto_tarjeta_propiedad ? `/uploads/${f.foto_tarjeta_propiedad[0].filename}` : '',
          f.foto_vehiculo_frente ? `/uploads/${f.foto_vehiculo_frente[0].filename}` : '',
        ]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ mensaje: `${rol} creado exitosamente` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get('/recargas', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT r.*, u.nombre, u.apellido, u.telefono, p.placa
    FROM recargas_saldo r
    JOIN usuarios u ON r.conductor_id = u.id
    JOIN perfil_conductor p ON u.id = p.usuario_id
    ORDER BY r.creado_en DESC
  `);
  res.json(rows);
});

router.post('/recargas/:id/aprobar', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rec = await client.query("SELECT * FROM recargas_saldo WHERE id=$1 AND estado='PENDIENTE' FOR UPDATE", [req.params.id]);
    if (!rec.rows[0]) throw new Error('Recarga no válida');
    await client.query("UPDATE recargas_saldo SET estado='APROBADA', aprobado_en=NOW() WHERE id=$1", [req.params.id]);
    await client.query('UPDATE perfil_conductor SET saldo_disponible = saldo_disponible + $1 WHERE usuario_id=$2', [rec.rows[0].monto, rec.rows[0].conductor_id]);
    await client.query('COMMIT');
    res.json({ mensaje: 'Saldo acreditado' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});


// Reporte de ganancias por comisiones y recargas
router.get('/ganancias', async (req, res) => {
  try {
    const resumenViajes = await pool.query(`
      SELECT
        COUNT(*) AS total_viajes,
        COALESCE(SUM(tarifa_final_acordada), 0) AS volumen_bruto,
        COALESCE(SUM(comision_cobrada), 0) AS ganancia_total_comisiones,
        COALESCE(SUM(CASE WHEN DATE(creado_en) = CURRENT_DATE THEN comision_cobrada ELSE 0 END), 0) AS ganancia_hoy,
        COALESCE(SUM(CASE WHEN DATE_TRUNC('month', creado_en) = DATE_TRUNC('month', CURRENT_DATE) THEN comision_cobrada ELSE 0 END), 0) AS ganancia_mes
      FROM viajes
      WHERE estado IN ('ACEPTADA', 'EN_CURSO', 'FINALIZADA') AND comision_cobrada IS NOT NULL
    `);

    const resumenRecargas = await pool.query(`
      SELECT COALESCE(SUM(monto), 0) AS total_recargas_aprobadas
      FROM recargas_saldo
      WHERE estado = 'APROBADA'
    `);

    const porConductor = await pool.query(`
      SELECT
        u.id, u.nombre, u.apellido, p.placa,
        COUNT(v.id) AS viajes_realizados,
        COALESCE(SUM(v.tarifa_final_acordada), 0) AS total_facturado,
        COALESCE(SUM(v.comision_cobrada), 0) AS comision_generada
      FROM usuarios u
      JOIN perfil_conductor p ON u.id = p.usuario_id
      LEFT JOIN viajes v ON u.id = v.conductor_id AND v.estado IN ('ACEPTADA', 'EN_CURSO', 'FINALIZADA')
      WHERE u.rol = 'CONDUCTOR'
      GROUP BY u.id, u.nombre, u.apellido, p.placa
      ORDER BY comision_generada DESC
    `);

    const historial = await pool.query(`
      SELECT
        v.id, v.creado_en, v.origen_texto, v.destino_texto, v.estado,
        v.tarifa_final_acordada, v.comision_cobrada, v.metodo_pago_viaje,
        pas.nombre AS pasajero_nombre, pas.apellido AS pasajero_apellido,
        cond.nombre AS conductor_nombre, cond.apellido AS conductor_apellido,
        p.placa
      FROM viajes v
      LEFT JOIN usuarios pas ON v.pasajero_id = pas.id
      LEFT JOIN usuarios cond ON v.conductor_id = cond.id
      LEFT JOIN perfil_conductor p ON cond.id = p.usuario_id
      WHERE v.comision_cobrada IS NOT NULL
      ORDER BY v.creado_en DESC
      LIMIT 50
    `);

    res.json({
      resumen: {
        ...resumenViajes.rows[0],
        total_recargas_aprobadas: resumenRecargas.rows[0].total_recargas_aprobadas,
      },
      porConductor: porConductor.rows,
      historial: historial.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
