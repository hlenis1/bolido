const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, '/app/uploads'),
  filename: (req, file, cb) => {
    cb(null, `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

const uploadDocumentosConductor = upload.fields([
  { name: 'foto_perfil', maxCount: 1 },
  { name: 'foto_cedula_frente', maxCount: 1 },
  { name: 'foto_cedula_reverso', maxCount: 1 },
  { name: 'foto_licencia', maxCount: 1 },
  { name: 'foto_tarjeta_propiedad', maxCount: 1 },
  { name: 'foto_vehiculo_frente', maxCount: 1 },
]);

module.exports = { upload, uploadDocumentosConductor };
