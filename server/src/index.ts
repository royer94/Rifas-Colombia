import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { getDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { seedInitialAdmin } from './db/seed.js';
import { authRouter } from './routes/auth.js';
import { adminRafflesRouter } from './routes/adminRaffles.js';
import { publicRouter } from './routes/public.js';
import { releaseExpiredNumbers } from './services/expiration.js';

let initPromise: Promise<void> | null = null;

export function ensureDatabaseReady(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const db = getDb();
      await runMigrations(db);
      if (process.env.AUTO_SEED !== 'false') {
        await seedInitialAdmin(db);
      }
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export function resetDatabaseInitForTesting(): void {
  initPromise = null;
}

export function createApp(options: { serveStatic?: boolean } = {}) {
  const app = express();

  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    try {
      await ensureDatabaseReady();
      const db = getDb();
      res.json({ ok: true, dialect: db.dialect, time: new Date().toISOString() });
    } catch (err) {
      console.error('Error en /api/health:', err);
      res.status(500).json({ ok: false, error: 'Base de datos no disponible.' });
    }
  });

  // Asegura migraciones y seed en entornos serverless (ej. Vercel) en el primer request
  app.use('/api', async (_req, _res, next) => {
    try {
      await ensureDatabaseReady();
      next();
    } catch (err) {
      next(err);
    }
  });

  app.use('/api/public', publicRouter);
  app.use('/api/admin/auth', authRouter);
  app.use('/api/admin/raffles', adminRafflesRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Ruta de API no encontrada.' });
  });

  if (options.serveStatic !== false) {
    const distClient = path.resolve(process.cwd(), 'dist-client');
    if (fs.existsSync(distClient)) {
      app.use(express.static(distClient));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distClient, 'index.html'));
      });
    }
  }

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error('Error no controlado:', err);
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  );

  return app;
}

export async function startServer() {
  await ensureDatabaseReady();
  const db = getDb();
  await releaseExpiredNumbers(db);

  // Tarea periódica cada 60 segundos para liberar números amarillos vencidos
  const interval = setInterval(() => {
    releaseExpiredNumbers(db)
      .then((released) => {
        if (released > 0) {
          console.log(`[Expiración] Se liberaron ${released} número(s) por vencimiento.`);
        }
      })
      .catch((err) => {
        console.error('[Expiración] Error al liberar números vencidos:', err);
      });
  }, 60_000);
  interval.unref();

  const port = Number(process.env.PORT ?? 3001);
  const app = createApp();
  const server = app.listen(port, () => {
    console.log(
      `Servidor de Rifas Colombia (${db.dialect}) escuchando en http://localhost:${port}`
    );
  });

  return { app, server, interval };
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'));

if (isMain) {
  startServer().catch((err) => {
    console.error('Error al iniciar el servidor:', err);
    process.exit(1);
  });
}
