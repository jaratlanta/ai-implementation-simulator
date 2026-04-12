/**
 * AI Implementation Simulator - Backend Server
 * Express server for Meaningful AI owl agent workshop
 */
console.log("------------------ SERVER STARTING ------------------");
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env first (where VITE_OPENAI_API_KEY lives)
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });
// Then load local server/.env
dotenv.config({ override: true });

import chatRoutes from './routes/chat.js';
import aiRoutes from './routes/ai.js';
import { closePool } from './db/index.js';



const app = express();
const PORT = process.env.PORT || 7811;

// CORS
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:7812',
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: (origin, callback) => {
    // In production, allow all origins (same-domain serving)
    if (!origin || process.env.NODE_ENV === 'production') return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('[CORS] Allowed non-listed origin:', origin);
      callback(null, true);
    }
  },
  credentials: true,
}));
// Reduced from 50mb to 5mb to prevent RAM exhaustion from 50 concurrent users
app.use(express.json({ limit: '5mb' }));

// Request logging in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/chat', chatRoutes);
app.use('/ai', aiRoutes);

// Serve static frontend in production
// In Docker: server runs from /app/server/dist/, frontend is at /app/dist/client/
const distPath = path.resolve(__dirname, '../../dist/client');
const distPathFallback = path.resolve(__dirname, '../../dist');
const staticDir = (process.env.STATIC_DIR)
  ? path.resolve(process.env.STATIC_DIR)
  : fs.existsSync(distPath) ? distPath : distPathFallback;

if (process.env.NODE_ENV === 'production') {
  console.log(`[Server] Serving static files from: ${staticDir}`);
  app.use(express.static(staticDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down...');
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received, shutting down...');
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
});

export default app;
