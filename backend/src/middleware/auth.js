const jwt = require('jsonwebtoken');

const verificarToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
};

const soloAdmin = (req, res, next) => {
  if (req.user.rol !== 'ADMIN') return res.status(403).json({ error: 'Solo administradores' });
  next();
};

module.exports = { verificarToken, soloAdmin };
