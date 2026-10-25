const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 5173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end('Bad request'); return; }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || pathname.split('/').some(part => part.startsWith('.'))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    const type=types[path.extname(file)]||'application/octet-stream';
    const charset=type.startsWith('text/')||['application/json','image/svg+xml'].includes(type)?'; charset=utf-8':'';
    res.writeHead(200, { 'Content-Type': type+charset, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Run with PORT=5174 npm start.` : error.message); process.exit(1); });
server.listen(port, '127.0.0.1', () => console.log(`CLTTR is ready at http://localhost:${port}`));
