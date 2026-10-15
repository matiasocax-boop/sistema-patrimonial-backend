/**
 * ============================================================================
 * SERVIDOR BACKEND (API REST) - SISTEMA DE GESTIÓN PATRIMONIAL UNP (SUPABASE)
 * ============================================================================
 * Maneja las peticiones PostgreSQL parseando la columna JSON 'data' para todas
 * las entidades (bens, fc10, fc11, fc04, estructuras).
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3001;
const SECRET_KEY = process.env.SECRET_KEY;

// Servidor HTTP y Sockets para notificaciones
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ["GET", "POST", "PUT", "DELETE"] }
});

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Conexión a Supabase (PostgreSQL). La URL sale de la variable de entorno
// DATABASE_URL (ver .env.example). Nunca commitear credenciales en el código.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ Falta la variable de entorno DATABASE_URL. Copia .env.example a .env y completa la URL de conexión.');
  process.exit(1);
}

// La clave de firma de los JWT no puede tener un valor por defecto: quedaría
// escrita en el repositorio y cualquiera que lo lea podría firmar tokens.
// Sigue la misma convención que DATABASE_URL: entorno o salida limpia.
if (!SECRET_KEY) {
  console.error('❌ Falta la variable de entorno SECRET_KEY. Genera una con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  process.exit(1);
}

// Contraseña del usuario administrador inicial. También es obligatoria para no
// dejar una cuenta conocida con clave por defecto expuesta en cada despliegue nuevo.
const ADMIN_INITIAL_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD;
if (!ADMIN_INITIAL_PASSWORD) {
  console.error('❌ Falta la variable de entorno ADMIN_INITIAL_PASSWORD (contraseña del admin inicial). Ver .env.example.');
  process.exit(1);
}
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect((err, client, release) => {
  if (err) {
    return console.error('❌ Error al conectar con Supabase (PostgreSQL):', err.message);
  }
  console.log('✅ Conectado exitosamente a Supabase (Cloud)');
  release();
  inicializarTablas();
});

function inicializarTablas() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS bens (id TEXT PRIMARY KEY, data JSONB)`,
    `CREATE TABLE IF NOT EXISTS fc10 (id TEXT PRIMARY KEY, data JSONB)`,
    `CREATE TABLE IF NOT EXISTS fc11 (id TEXT PRIMARY KEY, data JSONB)`,
    `CREATE TABLE IF NOT EXISTS fc04 (id TEXT PRIMARY KEY, data JSONB)`,
    `CREATE TABLE IF NOT EXISTS estructuras (id TEXT PRIMARY KEY, data JSONB)`,
    `CREATE TABLE IF NOT EXISTS usuarios (username TEXT PRIMARY KEY, nombre TEXT, password TEXT, cargo TEXT)`,
    `CREATE TABLE IF NOT EXISTS auditoria (
      id TEXT PRIMARY KEY, tipoRegistro TEXT, usuarioDestino TEXT, titulo TEXT,
      mensaje TEXT, leido INTEGER, fecha TEXT, bienId TEXT, accion TEXT
    )`
  ];

  (async () => {
    try {
      for (let q of queries) {
        await pool.query(q);
      }
      // Insertar admin por defecto si no existe
      const hashAdmin = bcrypt.hashSync(ADMIN_INITIAL_PASSWORD, 8);
      await pool.query(
        `INSERT INTO usuarios (username, nombre, password, cargo) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (username) DO NOTHING`,
        ['admin', 'Administrador General', hashAdmin, 'admin']
      );
      console.log('✅ Tablas verificadas/inicializadas en Supabase.');
    } catch (e) {
      console.error('❌ Error al inicializar tablas:', e.message);
    }
  })();
}

/**
 * Función auxiliar para desempaquetar la columna JSON
 */
function parseRowData(row) {
  if (!row) return null;
  if (row.data) {
    try {
      const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      return { ...parsed, id: row.id || parsed.id };
    } catch (e) {
      return row;
    }
  }
  return row;
}

// ----------------------------------------------------------------------------
// RUTAS DE LA API REST (/api)
// ----------------------------------------------------------------------------

// Autenticación de Usuario
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(`SELECT * FROM usuarios WHERE username = $1`, [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: "Credenciales incorrectas" });
    
    const user = result.rows[0];
    let isMatch = false;
    try {
      isMatch = bcrypt.compareSync(password, user.password);
    } catch (e) {
      isMatch = (password === user.password);
    }

    if (!isMatch && password === user.password) {
      isMatch = true;
    }

    if (!isMatch) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    const token = jwt.sign(
      { username: user.username, role: user.cargo },
      SECRET_KEY,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { username: user.username, nombre: user.nombre, role: user.cargo }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET: Obtener todos los bienes
app.get('/api/bens', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM bens`);
    const bienes = result.rows.map(r => {
      const item = parseRowData(r);
      return {
        ...item,
        hasFC10: Boolean(item.hasFC10),
        hasQR: Boolean(item.hasQR),
        solicitudBaja: Boolean(item.solicitudBaja)
      };
    });

    console.log(`📦 Enviando ${bienes.length} bienes al cliente.`);
    res.json(bienes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Crear nuevo bien
app.post('/api/bens', async (req, res) => {
  const b = req.body;
  try {
    const jsonStr = JSON.stringify(b);
    await pool.query(
      `INSERT INTO bens (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
      [b.id, jsonStr]
    );
    io.emit('data_updated');
    res.status(201).json({ message: "Bien creado exitosamente", id: b.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST Masivo: Carga de archivo CSV
app.post('/api/bens/bulk', async (req, res) => {
  const bienesArray = req.body;
  if (!Array.isArray(bienesArray)) return res.status(400).json({ error: "Arreglo inválido" });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let b of bienesArray) {
      await client.query(
        `INSERT INTO bens (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
        [b.id, JSON.stringify(b)]
      );
    }
    await client.query('COMMIT');
    io.emit('data_updated');
    res.status(201).json({ message: `${bienesArray.length} bienes importados` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT: Actualizar un bien
app.put('/api/bens/:id', async (req, res) => {
  const b = req.body;
  try {
    await pool.query(
      `UPDATE bens SET data = $1 WHERE id = $2`,
      [JSON.stringify(b), req.params.id]
    );
    io.emit('data_updated');
    res.json({ message: "Bien actualizado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE: Eliminar un bien
app.delete('/api/bens/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM bens WHERE id = $1`, [req.params.id]);
    io.emit('data_updated');
    res.json({ message: "Bien eliminado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET: Obtener registros FC-10
app.get('/api/fc10', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM fc10`);
    res.json(result.rows.map(r => parseRowData(r)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Crear registro FC-10
app.post('/api/fc10', async (req, res) => {
  const f = req.body;
  try {
    await pool.query(
      `INSERT INTO fc10 (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
      [f.id, JSON.stringify(f)]
    );
    io.emit('data_updated');
    res.status(201).json({ message: "FC-10 registrado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT: Actualizar FC-10
app.put('/api/fc10/:id', async (req, res) => {
  const f = req.body;
  try {
    await pool.query(`UPDATE fc10 SET data = $1 WHERE id = $2`, [JSON.stringify(f), req.params.id]);
    io.emit('data_updated');
    res.json({ message: "FC-10 actualizado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE: Eliminar FC-10
app.delete('/api/fc10/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM fc10 WHERE id = $1`, [req.params.id]);
    io.emit('data_updated');
    res.json({ message: "FC-10 eliminado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET: Obtener registros FC-11
app.get('/api/fc11', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM fc11`);
    res.json(result.rows.map(r => parseRowData(r)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Crear registro FC-11
app.post('/api/fc11', async (req, res) => {
  const f = req.body;
  try {
    await pool.query(
      `INSERT INTO fc11 (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
      [f.id, JSON.stringify(f)]
    );
    io.emit('data_updated');
    res.status(201).json({ message: "FC-11 registrado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET: Obtener registros FC-04
app.get('/api/fc04', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM fc04`);
    res.json(result.rows.map(r => parseRowData(r)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Crear registro FC-04
app.post('/api/fc04', async (req, res) => {
  const f = req.body;
  try {
    await pool.query(
      `INSERT INTO fc04 (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
      [f.id, JSON.stringify(f)]
    );
    io.emit('data_updated');
    res.status(201).json({ message: "FC-04 registrado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET: Obtener estructuras
app.get('/api/estructuras', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM estructuras`);
    res.json(result.rows.map(r => parseRowData(r)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Crear estructura
app.post('/api/estructuras', async (req, res) => {
  const e = req.body;
  try {
    await pool.query(
      `INSERT INTO estructuras (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
      [e.id, JSON.stringify(e)]
    );
    res.status(201).json({ message: "Estructura guardada" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET: Usuarios
app.get('/api/usuarios', async (req, res) => {
  try {
    const result = await pool.query(`SELECT username, nombre, cargo FROM usuarios`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Crear usuario
app.post('/api/usuarios', async (req, res) => {
  const { username, nombre, password, cargo } = req.body;
  try {
    const hashedPassword = bcrypt.hashSync(password, 8);
    await pool.query(
      `INSERT INTO usuarios (username, nombre, password, cargo) VALUES ($1, $2, $3, $4)`,
      [username, nombre, hashedPassword, cargo]
    );
    res.status(201).json({ message: "Usuario creado exitosamente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE: Eliminar usuario
app.delete('/api/usuarios/:username', async (req, res) => {
  try {
    await pool.query(`DELETE FROM usuarios WHERE username = $1`, [req.params.username]);
    res.json({ message: "Usuario eliminado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET: Auditoría
app.get('/api/auditoria', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM auditoria`);
    res.json(result.rows.map(r => ({ ...r, leido: Boolean(r.leido) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Crear notificación de auditoría
app.post('/api/auditoria', async (req, res) => {
  const a = req.body;
  try {
    await pool.query(
      `INSERT INTO auditoria (id, tipoRegistro, usuarioDestino, titulo, mensaje, leido, fecha, bienId, accion) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [a.id, a.tipoRegistro, a.usuarioDestino, a.titulo, a.mensaje, a.leido ? 1 : 0, a.fecha, a.bienId || '', a.accion || '']
    );
    res.status(201).json({ message: "Notificación creada" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manejador del servidor HTTP
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ El puerto ${PORT} está ocupado. Cierra los otros procesos node de tu sistema.`);
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor Backend corriendo en http://localhost:${PORT}`);
});