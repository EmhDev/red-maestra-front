const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = __dirname;
const APK_PATH = path.resolve(__dirname, '..', 'RedMaestra_v5-demo.apk');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.apk': 'application/vnd.android.package-archive',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Direct APK download endpoint
  if (pathname === '/download/RedMaestra_v5-demo.apk' || pathname === '/RedMaestra_v5-demo.apk') {
    if (fs.existsSync(APK_PATH)) {
      const stat = fs.statSync(APK_PATH);
      res.writeHead(200, {
        'Content-Type': MIME_TYPES['.apk'],
        'Content-Length': stat.size,
        'Content-Disposition': 'attachment; filename="RedMaestra_v5-demo.apk"',
      });
      fs.createReadStream(APK_PATH).pipe(res);
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'APK file not found at ' + APK_PATH }));
      return;
    }
  }

  if (pathname === '/') {
    pathname = '/index.html';
  }

  const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!safePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const indexFallback = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexFallback, (readErr, data) => {
        if (readErr) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
        res.end(data);
      });
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(safePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=============================================================`);
  console.log(`🌐 RedMaestra v5 Web Portal activo en:`);
  console.log(`   👉 Local:   http://localhost:${PORT}`);
  console.log(`   👉 Red LAN: http://192.168.0.11:${PORT}`);
  console.log(`   📦 APK:     http://localhost:${PORT}/download/RedMaestra_v5-demo.apk`);
  console.log(`=============================================================`);
});
