import { createApp } from './app';

const app = await createApp();
const port = await app.listen();
console.log(`Chess Uno server listening on http://localhost:${port} (WebSocket: ws://localhost:${port}/ws)`);
console.log(`Database: ${app.config.databaseUrl.replace(/\/\/[^@]*@/, '//***@')}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    console.log(`\n${sig} received, shutting down…`);
    await app.close();
    process.exit(0);
  });
}
