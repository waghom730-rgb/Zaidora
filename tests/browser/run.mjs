// Runs every browser suite against a fresh dev server. Exit code 1 on any failure or page error.
//   npm run test:browser            (starts its own Vite server)
//   BASE_URL=http://localhost:5173 npm run test:browser   (use a server that's already running)
import { launchBrowser, startServer } from './harness.mjs';
import * as flow from './flow.mjs';
import * as specials from './specials.mjs';
import * as stability from './stability.mjs';

const only = process.argv.slice(2);
const suites = { flow, specials, stability };

const server = await startServer();
const browser = await launchBrowser();
let failed = 0;
let passed = 0;
try {
  for (const [name, suite] of Object.entries(suites)) {
    if (only.length && !only.includes(name)) continue;
    console.log(`\n${name}`);
    const result = await suite.run(browser, server.url);
    passed += result.passed;
    failed += result.failed;
    if (result.pageErrors.length) {
      failed++;
      console.log(`  FAIL  page errors: ${result.pageErrors.join(' | ')}`);
    }
  }
} catch (err) {
  failed++;
  console.error('\nSuite crashed:', err);
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
