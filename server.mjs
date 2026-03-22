import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, 'dist');
const port = process.env.PORT || 3000;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  // Strip query strings
  const urlPath = req.url.split('?')[0];
  let filePath = path.join(distPath, urlPath === '/' ? 'index.html' : urlPath);
  let extname = String(path.extname(filePath)).toLowerCase();

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      extname = '.html';
    }
  } catch (err) {
    // SPA fallback: si el archivo no existe, devolver index.html
    filePath = path.join(distPath, 'index.html');
    extname = '.html';
  }

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404);
      res.end('404 Not Found');
    } else {
      res.writeHead(500);
      res.end('500 Internal Server Error: ' + error.code);
    }
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Servidor Node.js Nativo corriendo en http://0.0.0.0:${port}`);
});
