const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const viajesRoutes = require('./routes/viajes.routes');
const pool = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('/app/uploads'));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/viajes', viajesRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'Bólido API operando' }));
app.set('io', io);

// Fórmula Haversine para detectar cuando el carro está a <= 150 metros del pasajero
function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

io.on('connection', (socket) => {
  // GPS en tiempo real del conductor + alerta automática de cercanía
  socket.on('actualizar_ubicacion_conductor', async (data) => {
    const { viaje_id, lat, lng, origen_lat, origen_lng, eta_minutos } = data;
    io.emit(`ubicacion_viaje_${viaje_id}`, { lat, lng, eta_minutos });

    if (origen_lat && origen_lng) {
      const metros = calcularDistanciaMetros(lat, lng, origen_lat, origen_lng);
      if (metros <= 150) {
        io.emit(`conductor_cerca_${viaje_id}`, {
          mensaje: '¡Tu Bólido está a menos de 150 metros!',
          metros: Math.round(metros),
        });
      }
    }
  });

  // Chat en tiempo real
  socket.on('enviar_mensaje_chat', async (data) => {
    const { viaje_id, remitente_id, remitente_nombre, mensaje } = data;
    await pool.query('INSERT INTO mensajes_chat (viaje_id, remitente_id, mensaje) VALUES ($1,$2,$3)', [viaje_id, remitente_id, mensaje]);
    io.emit(`chat_viaje_${viaje_id}`, { remitente_id, remitente_nombre, mensaje, hora: new Date().toLocaleTimeString() });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Bólido API corriendo en puerto ${PORT}`));
