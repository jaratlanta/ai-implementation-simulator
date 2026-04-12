import { resolve } from 'path';
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function test() {
  try {
    await import(resolve(__dirname, './server/src/routes/chat.ts'));
    console.log("SUCCESS. No compilation exceptions.");
  } catch (e) {
    console.error("IMPORT FAILED:", e);
  }
}
test();
