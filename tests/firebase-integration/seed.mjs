import { seed } from './emulatorRest.mjs';
import { seedRecords } from './fixtures.mjs';
await seed(seedRecords());
if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  const { seedAuth } = await import('./authEmulator.mjs');
  await seedAuth();
}
console.log('Seeded synthetic records in demo-community-connect-web on 127.0.0.1:8089.');
