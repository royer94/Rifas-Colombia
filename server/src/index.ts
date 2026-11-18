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

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.use('/api/public', publicRouter);
  app.use('/api/admin/auth', authRouter);
  app.use('/api/admin/raffles', adminRafflesRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Ruta de API no encontrada.' });
  });

  const distClient = path.resolve(process.cwd(), 'dist-client');
  if (fs.existsSync(distClient)) {
    app.use(express.static(distClient));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distClient, 'index.html'));
    });
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

export function startServer() {
  const db = getDb();
  runMigrations(db);
  if (process.env.AUTO_SEED !== 'false') {
    seedInitialAdmin(db);
  }
  releaseExpiredNumbers(db);

  // Tarea periódica cada 60 segundos para liberar números amarillos vencidos
  const interval = setInterval(() => {
    try {
      const released = releaseExpiredNumbers(db);
      if (released > 0) {
        console.log(`[Expiración] Se liberaron ${released} número(s) por vencimiento.`);
      }
    } catch (err) {
      console.error('[Expiración] Error al liberar números vencidos:', err);
    }
  }, 60_000);
  interval.unref();

  const port = Number(process.env.PORT ?? 3001);
  const app = createApp();
  const server = app.listen(port, () => {
    console.log(`Servidor de Rifas Colombia escuchando en http://localhost:${port}`);
  });

  return { app, server, interval };
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'));

if (isMain) {
  startServer();
}
