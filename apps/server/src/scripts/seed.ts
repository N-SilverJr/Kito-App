import { openDatabase } from '../db.js';
import { loadConfig } from '../env.js';
import { seedCatalog } from '../seed/foods.js';

const config = loadConfig();
const db = openDatabase(config.databasePath, config.migrationsDir);
const count = seedCatalog(db);
console.info(`Seeded ${count} catalog foods into ${config.databasePath}`);
db.close();
