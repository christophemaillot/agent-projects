#!/usr/bin/env node
/**
 * agent-projects micro-server
 * Exposes project files (YAML+MD) via a simple REST API.
 *
 * Usage:
 *   PROJECTS_TOKEN=secret PROJECTS_DIR=/path/to/memory/projects node index.js
 *
 * Env vars:
 *   PROJECTS_TOKEN  — Bearer token for auth (required)
 *   PROJECTS_DIR    — Path to projects directory (default: ./memory/projects)
 *   PORT            — Port to listen on (default: 3456)
 *   CORS_ORIGIN     — Allowed origin for CORS (default: *)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const TOKEN = process.env.PROJECTS_TOKEN;
const DIR = path.resolve(process.env.PROJECTS_DIR || './memory/projects');
const PORT = parseInt(process.env.PORT || '3456', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

if (!TOKEN) {
  console.error('Error: PROJECTS_TOKEN env var is required');
  process.exit(1);
}

// --- YAML frontmatter parser (using js-yaml) ---

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { yaml: {}, body: content };
  try {
    const parsed = yaml.load(match[1]) || {};
    return { yaml: parsed, body: match[2] };
  } catch (e) {
    return { yaml: {}, body: content };
  }
}

function serializeFrontmatter(data, body) {
  return `---\n${yaml.dump(data, { lineWidth: 120, quotingType: '"' })}---\n\n${body}`;
}

// --- Project file helpers ---

function listProjects() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    .filter(f => f.endsWith('.md') && !f.startsWith('.'))
    .map(f => f.replace('.md', ''));
}

function readProject(slug) {
  const file = path.join(DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const content = fs.readFileSync(file, 'utf8');
  const { yaml, body } = parseFrontmatter(content);
  return { slug, ...yaml, _body: body };
}

function writeProject(slug, data) {
  const file = path.join(DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return false;
  const content = fs.readFileSync(file, 'utf8');
  const { yaml, body } = parseFrontmatter(content);
  // Merge patch into yaml
  const { _body, slug: _slug, ...patch } = data;
  const updated = { ...yaml, ...patch };
  fs.writeFileSync(file, serializeFrontmatter(updated, body));
  return true;
}

// --- HTTP server ---

function auth(req) {
  const header = req.headers['authorization'] || '';
  return header === `Bearer ${TOKEN}`;
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': CORS_ORIGIN,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    });
    res.end();
    return;
  }

  // Serve UI
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const uiPath = path.join(__dirname, 'ui', 'index.html');
    if (fs.existsSync(uiPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(uiPath));
    } else {
      json(res, 404, { error: 'UI not found' });
    }
    return;
  }

  // API routes
  if (!auth(req)) return json(res, 401, { error: 'Unauthorized' });

  // GET /api/projects
  if (req.method === 'GET' && pathname === '/api/projects') {
    const slugs = listProjects();
    const projects = slugs.map(readProject).filter(Boolean);
    return json(res, 200, projects);
  }

  // GET /api/projects/:slug
  const matchGet = pathname.match(/^\/api\/projects\/([a-z0-9_-]+)$/);
  if (req.method === 'GET' && matchGet) {
    const project = readProject(matchGet[1]);
    if (!project) return json(res, 404, { error: 'Not found' });
    return json(res, 200, project);
  }

  // PATCH /api/projects/:slug
  const matchPatch = pathname.match(/^\/api\/projects\/([a-z0-9_-]+)$/);
  if (req.method === 'PATCH' && matchPatch) {
    try {
      const body = await readBody(req);
      const ok = writeProject(matchPatch[1], body);
      if (!ok) return json(res, 404, { error: 'Not found' });
      return json(res, 200, { ok: true });
    } catch (e) {
      return json(res, 400, { error: 'Bad request' });
    }
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`agent-projects server running on port ${PORT}`);
  console.log(`Projects dir: ${DIR}`);
});
