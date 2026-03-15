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

const TOKEN = process.env.PROJECTS_TOKEN;
const DIR = path.resolve(process.env.PROJECTS_DIR || './memory/projects');
const PORT = parseInt(process.env.PORT || '3456', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

if (!TOKEN) {
  console.error('Error: PROJECTS_TOKEN env var is required');
  process.exit(1);
}

// --- YAML frontmatter parser (zero deps) ---

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { yaml: {}, body: content };
  try {
    const yaml = parseYaml(match[1]);
    return { yaml, body: match[2] };
  } catch (e) {
    return { yaml: {}, body: content };
  }
}

function serializeFrontmatter(yaml, body) {
  return `---\n${stringifyYaml(yaml)}---\n\n${body}`;
}

// Minimal YAML parser — handles the subset used in project files
function parseYaml(text) {
  const lines = text.split('\n');
  const root = {};
  const stack = [{ obj: root, indent: -1 }];

  function top() { return stack[stack.length - 1]; }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }

    const indent = line.search(/\S/);
    const content = line.trim();

    // Pop stack to correct level
    while (stack.length > 1 && indent <= top().indent) stack.pop();

    // List item
    if (content.startsWith('- ')) {
      const value = content.slice(2).trim();
      const parent = top().obj;
      const key = top().currentKey;
      if (key !== undefined) {
        if (!Array.isArray(parent[key])) parent[key] = [];
        if (value.includes(': ')) {
          // Inline object in list
          const obj = {};
          parent[key].push(obj);
          // parse remaining key: value pairs on next lines at deeper indent
          const itemIndent = indent + 2;
          const [k, v] = splitKV(value);
          obj[k] = parseScalar(v);
          // peek ahead for more fields of this object
          let j = i + 1;
          while (j < lines.length) {
            const nextLine = lines[j];
            if (!nextLine.trim()) { j++; continue; }
            const nextIndent = nextLine.search(/\S/);
            if (nextIndent < itemIndent) break;
            if (nextLine.trim().startsWith('- ')) break;
            const [nk, nv] = splitKV(nextLine.trim());
            obj[nk] = parseScalar(nv);
            j++;
          }
          i = j;
          continue;
        } else {
          parent[key].push(parseScalar(value));
        }
      }
      i++; continue;
    }

    // Key: value
    if (content.includes(':')) {
      const [k, v] = splitKV(content);
      const parent = top().obj;
      if (v === '' || v === null) {
        parent[k] = {};
        stack.push({ obj: parent[k], indent, currentKey: null });
        top().currentKey = k;
        // The new object is the child
        const child = parent[k];
        stack[stack.length - 1] = { obj: parent, indent: indent - 2, currentKey: k };
        stack.push({ obj: child, indent });
      } else {
        parent[k] = parseScalar(v);
        top().currentKey = k;
      }
      i++; continue;
    }

    i++;
  }

  return root;
}

function splitKV(str) {
  const idx = str.indexOf(':');
  if (idx === -1) return [str, ''];
  const k = str.slice(0, idx).trim();
  const v = str.slice(idx + 1).trim();
  return [k, v || ''];
}

function parseScalar(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  // Strip quotes
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

// Minimal YAML serializer
function stringifyYaml(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  let out = '';
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      if (v.length === 0) {
        out += `${pad}${k}: []\n`;
      } else if (typeof v[0] === 'object' && v[0] !== null) {
        out += `${pad}${k}:\n`;
        for (const item of v) {
          const entries = Object.entries(item);
          out += `${pad}  - ${entries[0][0]}: ${yamlScalar(entries[0][1])}\n`;
          for (const [ik, iv] of entries.slice(1)) {
            out += `${pad}    ${ik}: ${yamlScalar(iv)}\n`;
          }
        }
      } else {
        out += `${pad}${k}:\n`;
        for (const item of v) {
          out += `${pad}  - ${yamlScalar(item)}\n`;
        }
      }
    } else if (typeof v === 'object' && v !== null) {
      out += `${pad}${k}:\n`;
      out += stringifyYaml(v, indent + 1);
    } else {
      out += `${pad}${k}: ${yamlScalar(v)}\n`;
    }
  }
  return out;
}

function yamlScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  const s = String(v);
  if (s.includes(':') || s.includes('#') || s.startsWith('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}

// --- Project file helpers ---

function listProjects() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    .filter(f => f.endsWith('.md'))
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
