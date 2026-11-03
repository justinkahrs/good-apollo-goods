import 'dotenv/config';
import { maintenance } from '../src/server/maintenance';
import { db } from '../src/server/db';
console.log(await maintenance());
await db().$disconnect();
