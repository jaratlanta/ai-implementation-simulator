import { query } from './server/src/db/index.js';

async function test() {
  try {
    const result = await query('SELECT 1');
    console.log("DB SUCCESS:", result.rows);
  } catch (e) {
    console.error("DB FAILED:", e);
  }
}
test();
