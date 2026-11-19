CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE configuracion_plataforma (
    id SERIAL PRIMARY KEY,
    porcentaje_comision DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    valor_por_km DECIMAL(10,2) NOT NULL DEFAULT 1200.00,
    radio_busqueda_km DECIMAL(6,2) NOT NULL DEFAULT 15.00,
    nequi_numero VARCHAR(20) DEFAULT '3001234567',
    llave_bre_b VARCHAR(100) DEFAULT '@bolido.pagos',
    instrucciones_pago TEXT DEFAULT 'Transfiere el valor de tu recarga y registra el número de referencia.'
);

INSERT INTO configuracion_plataforma (porcentaje_comision, valor_por_km) VALUES (10.00, 1200.00);

CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rol VARCHAR(20) CHECK (rol IN ('PASAJERO', 'CONDUCTOR', 'ADMIN')) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    telefono VARCHAR(20) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    estado_cuenta VARCHAR(20) DEFAULT 'APROBADO',
    push_subscription JSONB,
    creado_en TIMESTAMP DEFAULT NOW()
);

-- Admin por defecto (Tel: 3000000000 | Pass: admin123)
INSERT INTO usuarios (rol, nombre, apellido, telefono, password_hash, estado_cuenta)
VALUES ('ADMIN', 'Admin', 'Bolido', '3000000000', '$2b$10$8K1p/a0dL1LXMIgoEDFrwOfMQ1/zK5Z8.C9bE3u/7Y2w0Z1X2C3V4', 'APROBADO');

CREATE TABLE perfil_conductor (
    usuario_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    saldo_disponible DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    placa VARCHAR(10) NOT NULL,
    color_vehiculo VARCHAR(30) NOT NULL,
    foto_perfil_url TEXT NOT NULL,
    foto_cedula_frente_url TEXT NOT NULL,
    foto_cedula_reverso_url TEXT NOT NULL,
    foto_licencia_url TEXT NOT NULL,
    foto_tarjeta_propiedad_url TEXT NOT NULL,
    foto_vehiculo_frente_url TEXT NOT NULL,
    en_linea BOOLEAN DEFAULT FALSE,
    latitud DECIMAL(10,8),
    longitud DECIMAL(11,8)
);

CREATE TABLE recargas_saldo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conductor_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
    monto DECIMAL(12,2) NOT NULL,
    metodo_pago VARCHAR(20) CHECK (metodo_pago IN ('NEQUI', 'BRE_B')),
    numero_referencia VARCHAR(100) NOT NULL,
    comprobante_url TEXT,
    estado VARCHAR(20) DEFAULT 'PENDIENTE',
    creado_en TIMESTAMP DEFAULT NOW(),
    aprobado_en TIMESTAMP
);

CREATE TABLE viajes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pasajero_id UUID REFERENCES usuarios(id),
    conductor_id UUID REFERENCES usuarios(id),
    origen_texto TEXT NOT NULL,
    origen_lat DECIMAL(10,8) NOT NULL,
    origen_lng DECIMAL(11,8) NOT NULL,
    destino_texto TEXT NOT NULL,
    destino_lat DECIMAL(10,8) NOT NULL,
    destino_lng DECIMAL(11,8) NOT NULL,
    distancia_km DECIMAL(6,2) NOT NULL,
    tarifa_sugerida DECIMAL(12,2) NOT NULL,
    tarifa_ofertada_pasajero DECIMAL(12,2) NOT NULL,
    tarifa_final_acordada DECIMAL(12,2),
    comision_cobrada DECIMAL(12,2),
    estado VARCHAR(30) DEFAULT 'NEGOCIANDO',
    cancelado_por VARCHAR(20),
    motivo_cancelacion TEXT,
    creado_en TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ofertas_viaje (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viaje_id UUID REFERENCES viajes(id) ON DELETE CASCADE,
    conductor_id UUID REFERENCES usuarios(id),
    monto_contraoferta DECIMAL(12,2) NOT NULL,
    tiempo_estimado_min INT DEFAULT 5,
    estado VARCHAR(20) DEFAULT 'ACTIVA',
    creado_en TIMESTAMP DEFAULT NOW()
);

CREATE TABLE mensajes_chat (
    id SERIAL PRIMARY KEY,
    viaje_id UUID REFERENCES viajes(id) ON DELETE CASCADE,
    remitente_id UUID REFERENCES usuarios(id),
    mensaje TEXT NOT NULL,
    enviado_en TIMESTAMP DEFAULT NOW()
);
