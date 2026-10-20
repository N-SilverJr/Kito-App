import path from 'node:path';
import { buildApp } from './app.js';
import { loadConfig } from './env.js';

function loadEnvFiles(): void {
  const candidates = [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '..', '..', '.env')];
  for (const candidate of candidates) {
    try {
      process.loadEnvFile(candidate);
      console.info(`[env] loaded ${candidate}`);
      return;
    } catch {
      // Optional file: continue to the next candidate.
    }
  }
}

async function main(): Promise<void> {
  loadEnvFiles();
  const config = loadConfig();
  const { app } = await buildApp({ config });
  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error(error);
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`NutriPals API ready on http://localhost:${config.port} (AI provider: ${config.aiProvider})`);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
