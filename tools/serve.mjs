// Servidor estático mínimo para desarrollo (sin dependencias).
// Uso: node tools/serve.mjs   (puerto: variable PORT, por defecto 8080)
// Sirve con tipos MIME correctos (los módulos ES los exigen) y sin caché HTTP.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;
const HOST = '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const notFound = (res) => res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No encontrado');

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(pathname);
    // Nada de archivos ocultos (.git, .claude...).
    if (path.split('/').some((seg) => seg.startsWith('.'))) return notFound(res);

    let file = resolve(ROOT, `.${path}`);
    if (file !== ROOT && !file.startsWith(ROOT + sep)) return notFound(res);

    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) {
      file = join(file, 'index.html');
      info = await stat(file).catch(() => null);
    }
    if (!info?.isFile()) return notFound(res);

    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (err) {
    console.error(err);
    res.writeHead(500).end();
  }
}).listen(PORT, HOST, () => {
  console.log(`Sirviendo ${ROOT}`);
  console.log(`Abrí http://localhost:${PORT}`);
});
