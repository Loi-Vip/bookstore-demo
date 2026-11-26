import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const files = ['catalog.js', 'catalog-compat.js', 'api.js', 'store.js', 'app.js', 'auth.js', 'admin/admin.js', 'admin/login.js', 'serve.mjs'];
for (const directory of ['server', 'scripts']) {
  files.push(...readdirSync(path.join(root, directory)).filter(name => name.endsWith('.mjs')).map(name => `${directory}/${name}`));
}
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Đã kiểm tra cú pháp ${files.length} tệp JavaScript.`);
