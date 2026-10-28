// Every source file must be in the service worker cache list, or the installed app breaks offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
test('sw.js caches every src/*.js and css', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const files = [...walk(join(root, 'src')).filter((f) => f.endsWith('.js')), join(root, 'app.css'), join(root, 'report.css')]
    .map((f) => './' + f.slice(root.length));
  const missing = files.filter((f) => !sw.includes(`'${f}'`));
  assert.deepEqual(missing, []);
});
