# Sistema de Gestion Patrimonial UNP

Monorepo con dos piezas independientes: una **API REST** (Node.js/Express) y un
**frontend** (React + Vite), ambos sobre **Supabase (PostgreSQL)**.

## Estructura

```
SistemaPatrimonial/
├── backend/              API REST + WebSocket (repo raiz)
│   ├── server.js         Servidor Express, JWT, Socket.io
│   ├── migrar.js         Migracion SQLite -> Supabase
│   ├── inspector.js      Inspeccion del SQLite local
│   ├── inspect_db.js     Listado rapido de tablas
│   ├── install_deps.js   Instala dependencias del backend
│   └── .env.example      Plantilla de variables (copiar a .env)
├── frontend/             SPA React 19 + Vite (REPO SEPARADO, con remoto propio)
│   ├── src/views/        Vistas por modulo
│   ├── src/components/   Componentes de UI
│   ├── src/hooks/        Logica extraida de App.jsx
│   ├── src/services/     Sincronizacion, auditoria, cola offline
│   └── vercel.json       Rewrite SPA (debe vivir junto al package.json)
├── respaldo_esquema.sql  Notas del esquema y como regenerarlo
└── run_frontend.bat      Atajo para `npm run dev` del frontend
```

## Dos repositorios, dos propositos

`frontend/` es un repositorio git **anidado** con su propio remoto en GitHub
(228+ commits). Su historial no debe mezclarse con el de la raiz, asi que el
`.gitignore` de la raiz lo excluye. El repositorio raiz cubre unicamente
`backend/` y la documentacion.

Esto significa que los cambios en el frontend se versionan y despliegan por
separado del resto.

## Puesta en marcha

### Backend

```bash
cd backend
cp .env.example .env      # en Windows: copy .env.example .env
```

Completar en `.env`:

| Variable | Descripcion |
|---|---|
| `DATABASE_URL` | Cadena de conexion de PostgreSQL (Supabase) |
| `SECRET_KEY` | Clave de firma de los JWT (generar con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `ADMIN_INITIAL_PASSWORD` | Contrasena del usuario `admin` en el primer despliegue |
| `PORT` | Puerto del servidor (por defecto 3001) |

El servidor **sale con error claro si falta cualquiera de las tres primeras**:
no hay valores por defecto escritos en el codigo.

```bash
npm install
npm start        # o: npm run dev  (con nodemon)
```

### Frontend

```bash
cd frontend
cp .env.example .env
```

Completar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Son claves publicas
(van embebidas en el bundle); la seguridad real depende de las politicas RLS de
Supabase.

```bash
npm install
npm run dev
```

Desde la raiz tambien funciona `run_frontend.bat` en Windows.

## Scripts utiles

| Comando | Que hace |
|---|---|
| `npm run lint` | oxlint sobre el frontend |
| `npm test` | Pruebas unitarias (node:test) |
| `npm run build` | Build de produccion en `frontend/dist` |

## Esquema de base de datos

El esquema real vive en Supabase, no en este repositorio.
`respaldo_esquema.sql` esta vacio a proposito y documenta como regenerarlo con
`pg_dump`. Las tablas son `bens`, `fc10`, `fc11`, `fc04`, `estructuras`,
`usuarios` y `auditoria`; salvo `usuarios` y `auditoria`, cada una guarda el
registro completo dentro de una columna JSONB `data`.

## Notas de seguridad

- `.env`, `*.sqlite`, `node_modules` y `dist` estan ignorados por git. Nunca
  commitear credenciales.
- `backend/patrimonio.sqlite` es un residuo de la migracion SQLite -> Supabase y
  puede contener datos reales de bienes: esta en el `.gitignore` por eso.