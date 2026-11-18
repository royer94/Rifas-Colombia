# Rifas Colombia — Plataforma Web de Rifas Online

Aplicación web full-stack, responsive y *mobile-first* para organizar, compartir y administrar rifas en línea basadas en las **dos últimas cifras del premio mayor de loterías colombianas**, con valores en **pesos colombianos (COP)**.

## Características principales

- **Persistencia real en SQLite** con migraciones SQL versionadas y modo WAL (`node:sqlite`).
- **Regla anti-duplicados transaccional**: restricción `UNIQUE(raffle_id, number)` en base de datos y reserva atómica en transacción `BEGIN IMMEDIATE`. Si dos personas intentan apartar el mismo número al mismo tiempo, solo una lo obtiene y la otra recibe un aviso inmediato sin reservar ningún número parcial.
- **Actualización automática en vivo**: el tablero público (00 al 99) se refresca automáticamente cada pocos segundos.
- **Liberación automática**: los números apartados en amarillo se liberan automáticamente al vencer el plazo configurado en horas por cada rifa (24 horas por defecto).
- **Seguridad**: contraseñas con hash `bcryptjs`, sesiones en base de datos con cookie `httpOnly`, bloqueo temporal ante intentos fallidos de inicio de sesión, aislamiento estricto por administrador y cero exposición pública de datos personales de compradores.
- **Panel de administración completo**: crear/editar rifas, tablero interactivo (confirmar pago, liberar, reasignar, venta en persona), tabla de participantes con búsqueda y filtros, confirmación masiva por comprador, mensajes precargados de confirmación y recordatorio por WhatsApp, registro de número ganador y exportación a **CSV (UTF-8 con BOM compatible con Excel)**.

---

## Requisitos previos

- **Node.js 22.13+ o 24+** (el proyecto utiliza `node:sqlite` incluido en Node.js).
- **npm 10+**.

---

## Instalación y puesta en marcha

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Ejecutar migraciones de base de datos y seed inicial:**
   ```bash
   npm run setup
   ```
   Esto ejecuta `npm run migrate` y `npm run seed`, creando la base de datos en `./data/rifas.db` y el usuario administrador inicial:
   - **Usuario:** `admin`
   - **Contraseña inicial:** `Rifas2026!`

   > **AVISO DE SEGURIDAD:** Cambia la contraseña del usuario `admin` inmediatamente después de iniciar sesión por primera vez usando el botón **"Cambiar clave"** dentro del panel `/admin`.

3. **Ejecutar en modo desarrollo (backend + frontend con recarga en vivo):**
   ```bash
   npm run dev
   ```
   - Frontend (Vite): `http://localhost:5173`
   - Backend API: `http://localhost:3001`

4. **Construir y ejecutar en modo producción:**
   ```bash
   npm run build
   npm start
   ```
   En producción, el servidor Express sirve tanto la API como los archivos compilados del frontend en `http://localhost:3001`.

5. **Ejecutar pruebas automatizadas:**
   ```bash
   npm test
   ```

---

## Variables de entorno opcionales

- `PORT`: puerto del servidor HTTP (por defecto `3001`).
- `DATABASE_PATH`: ruta del archivo SQLite (por defecto `./data/rifas.db`).
- `COOKIE_SECURE`: poner en `true` si se despliega detrás de HTTPS en producción.
- `AUTO_SEED`: poner en `false` si no deseas ejecutar el seed automático al iniciar el servidor.
