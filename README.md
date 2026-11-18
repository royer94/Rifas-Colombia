# Rifas Colombia — Plataforma Web de Rifas Online

Aplicación web full-stack, responsive y *mobile-first* para organizar, compartir y administrar rifas en línea basadas en las **dos últimas cifras del premio mayor de loterías colombianas**, con valores en **pesos colombianos (COP)**.

## Características principales

- **Doble soporte de base de datos relacional**:
  - **Producción en la nube (Vercel + Supabase)**: PostgreSQL mediante `DATABASE_URL` con bloqueos transaccionales `FOR UPDATE` y migraciones en `server/src/db/migrations_pg/`.
  - **Desarrollo local inmediato**: SQLite (`node:sqlite` en modo WAL) si no se define `DATABASE_URL`.
- **Regla anti-duplicados transaccional**: restricción `UNIQUE(raffle_id, number)` en base de datos y reserva atómica. Si dos personas intentan apartar el mismo número al mismo tiempo, solo una lo obtiene y la otra recibe un aviso inmediato sin reservar ningún número parcial.
- **Actualización automática en vivo**: el tablero público (00 al 99) se refresca automáticamente cada pocos segundos.
- **Liberación automática**: los números apartados en amarillo se liberan automáticamente al vencer el plazo configurado en horas por cada rifa (24 horas por defecto).
- **Seguridad**: contraseñas con hash `bcryptjs`, sesiones en base de datos con cookie `httpOnly`, bloqueo temporal ante intentos fallidos de inicio de sesión, aislamiento estricto por administrador y cero exposición pública de datos personales de compradores.
- **Panel de administración completo**: crear/editar rifas, tablero interactivo (confirmar pago, liberar, reasignar, venta en persona), tabla de participantes con búsqueda y filtros, confirmación masiva por comprador, mensajes precargados de confirmación y recordatorio por WhatsApp, registro de número ganador y exportación a **CSV (UTF-8 con BOM compatible con Excel)**.

---

## Despliegue gratis en Vercel + Supabase (Dominio `.vercel.app`)

1. **Crea un proyecto gratis en [Supabase](https://supabase.com):**
   - Entra a **Project Settings -> Database** (o el botón **Connect** en la parte superior).
   - Copia la cadena de conexión del **Transaction Pooler** o **Session Pooler** (puerto `6543` o `5432`, host `*.pooler.supabase.com`, **muy importante usar el Pooler para compatibilidad IPv4 con Vercel**).
   - Ejemplo:
     ```
     postgresql://postgres.TU_PROYECTO:TU_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
     ```

2. **Importa este repositorio en [Vercel](https://vercel.com):**
   - Crea cuenta / inicia sesión con GitHub y selecciona `royer94/Rifas-Colombia`.
   - En **Environment Variables**, agrega:
     - `DATABASE_URL` = tu cadena de conexión Pooler de Supabase.
   - Haz clic en **Deploy**.

3. **Inicialización automática:**
   - En la primera petición a tu sitio desplegado, el servidor ejecuta automáticamente las migraciones de PostgreSQL (`server/src/db/migrations_pg/`) y crea el usuario administrador inicial si aún no existe:
     - **Usuario:** `admin`
     - **Contraseña inicial:** `Rifas2026!`
   - > **AVISO DE SEGURIDAD:** Inicia sesión en `/admin` y cambia la contraseña de inmediato desde el botón **"Cambiar clave"**.

---

## Instalación y uso local

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Ejecutar migraciones de base de datos y seed inicial:**
   ```bash
   npm run setup
   ```
   *(Sin `DATABASE_URL`, crea `./data/rifas.db` en SQLite; con `DATABASE_URL`, migra y siembra en PostgreSQL/Supabase).*

3. **Ejecutar en modo desarrollo (backend + frontend con recarga en vivo):**
   ```bash
   npm run dev
   ```
   - Frontend (Vite): `http://localhost:5173`
   - Backend API: `http://localhost:3001`

4. **Construir y ejecutar en modo producción local:**
   ```bash
   npm run build && npm start
   ```

5. **Ejecutar pruebas automatizadas:**
   ```bash
   npm test
   ```

---

## Variables de entorno opcionales

- `DATABASE_URL`: cadena de conexión PostgreSQL (ej. Supabase Pooler). Si se omite, usa SQLite local.
- `PORT`: puerto del servidor HTTP local (por defecto `3001`).
- `DATABASE_PATH`: ruta del archivo SQLite local (por defecto `./data/rifas.db`).
- `COOKIE_SECURE`: poner en `true` si se despliega con servidor propio detrás de HTTPS (en Vercel se activa automáticamente).
- `AUTO_SEED`: poner en `false` si no deseas ejecutar el seed automático al iniciar el servidor.
