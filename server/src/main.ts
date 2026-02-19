import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { Server as ColyseusServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { createServer } from 'http';

import { HubRoom } from './rooms/HubRoom.js';
import { DungeonRoom } from './rooms/DungeonRoom.js';
import { initDB } from './db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000', 10);

async function main() {
  // Initialize database
  await initDB();
  console.log('Database initialized');

  // Create raw HTTP server first
  const httpServer = createServer();

  // Create Fastify, attach to existing HTTP server
  const fastify = Fastify({ logger: true, serverFactory: (handler) => {
    httpServer.on('request', handler);
    return httpServer;
  }});

  await fastify.register(fastifyCors, { origin: true });

  // Required for SharedArrayBuffer (WASM ONNX TTS worker)
  fastify.addHook('onSend', async (_request, reply) => {
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
  });

  // Serve client build in production
  const clientDist = join(__dirname, '../../client/dist');
  if (existsSync(clientDist)) {
    await fastify.register(fastifyStatic, {
      root: clientDist,
      prefix: '/',
    });
  }

  // REST API routes
  fastify.get('/api/health', async () => ({ status: 'ok', time: Date.now() }));

  // Create Colyseus server sharing the same HTTP server
  const gameServer = new ColyseusServer({
    transport: new WebSocketTransport({ server: httpServer }),
  });

  // Register room types
  gameServer.define('hub', HubRoom);
  gameServer.define('dungeon', DungeonRoom);

  // Start listening
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Game server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
