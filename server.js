import { createServer } from 'node:https'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'

const ROOT = import.meta.dirname
const PORT = Number(process.env.PORT ?? 8443)
const KEY = process.env.TLS_KEY ?? join(ROOT, 'certs', 'localhost-key.pem')
const CERT = process.env.TLS_CERT ?? join(ROOT, 'certs', 'localhost.pem')

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
}

function readCredentials() {
  try {
    return { key: readFileSync(KEY), cert: readFileSync(CERT) }
  } catch (e) {
    console.error(`Could not read TLS material.\n  key:  ${KEY}\n  cert: ${CERT}\n\n${e.message}`)
    console.error('\nPoint TLS_KEY / TLS_CERT at your self-signed localhost pair, or drop them at the paths above.')
    process.exit(1)
  }
}

// Resolve under ROOT and confirm containment, so "GET /../../secrets" cannot escape.
function resolveRequest(url) {
  const pathname = decodeURIComponent(new URL(url, 'https://localhost').pathname)
  const target = normalize(join(ROOT, pathname === '/' ? 'index.html' : pathname))

  return target === ROOT || target.startsWith(ROOT + sep) ? target : null
}

createServer(readCredentials(), async (req, res) => {
  const target = resolveRequest(req.url)

  if (!target) {
    res.writeHead(403).end('Forbidden')
    return
  }

  try {
    const body = await readFile(target)

    res.writeHead(200, {
      'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
      // A wallet's injected script is exempt from page CSP; everything the page
      // itself loads is not. Tightening this is the point of testing over HTTPS.
      'content-security-policy': "default-src 'self' 'unsafe-inline'; connect-src 'self' https: wss: ; style-src 'self' 'unsafe-inline';;",
      'cache-control': 'no-store',
    })
    res.end(body)
  } catch {
    res.writeHead(404).end('Not found')
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`https://localhost:${PORT}`)
})
