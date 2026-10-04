/**
 * Xender-lite File Browser Module
 * --------------------------------
 * - Dark theme + cyan accent (#22D3EE)
 * - Navbar with Files / Upload
 * - Hierarchical folder listing (serve-index style)
 * - Nested-root deduplication (if one path is inside another, only the parent is shown at top level)
 * - File preview page (image / video / audio / pdf / text) + download + info
 * - Font Awesome icons + emoji fallback
 * - Socket.IO live refresh
 *
 * Usage:
 *   const { setupXenderBrowser } = require('./xender-browser');
 *   const browser = setupXenderBrowser(app, io, {
 *     rootDir: path.join(__dirname, 'shared'),          // single root
 *     // OR multiple roots (nested ones are auto-collapsed):
 *     // roots: ['C:/Users/123/Desktop', 'C:/Users/123/Desktop/files'],
 *     routePrefix: '/files',
 *     uploadPath: '/upload-page',
 *     socketRoom: 'xender',
 *   });
 *
 *   // After a successful upload:
 *   browser.notifyBrowserChanged();
 */

const path = require('path');
const fs = require('fs');

// ---------- Helpers ----------
function formatSize(bytes) {
  if (bytes == null || isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getExt(name) {
  return (name.split('.').pop() || '').toLowerCase();
}

/** Font Awesome class + emoji fallback */
function getFileIcon(name, isDir) {
  if (isDir) return { fa: 'fa-folder', emoji: '📁', color: '#F59E0B' };
  const ext = getExt(name);
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext))
    return { fa: 'fa-file-image', emoji: '🖼️', color: '#22D3EE' };
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v'].includes(ext))
    return { fa: 'fa-file-video', emoji: '🎬', color: '#A78BFA' };
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext))
    return { fa: 'fa-file-audio', emoji: '🎵', color: '#34D399' };
  if (['pdf'].includes(ext))
    return { fa: 'fa-file-pdf', emoji: '📄', color: '#EF4444' };
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext))
    return { fa: 'fa-file-zipper', emoji: '📦', color: '#F97316' };
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext))
    return { fa: 'fa-file-word', emoji: '📝', color: '#3B82F6' };
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext))
    return { fa: 'fa-file-excel', emoji: '📊', color: '#22C55E' };
  if (['ppt', 'pptx', 'odp'].includes(ext))
    return { fa: 'fa-file-powerpoint', emoji: '📑', color: '#F97316' };
  if (['txt', 'md', 'log', 'json', 'xml', 'yml', 'yaml'].includes(ext))
    return { fa: 'fa-file-lines', emoji: '📃', color: '#94A3B8' };
  if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'py', 'java', 'c', 'cpp', 'go', 'rs'].includes(ext))
    return { fa: 'fa-file-code', emoji: '💻', color: '#67E8F9' };
  return { fa: 'fa-file', emoji: '📄', color: '#64748B' };
}

function getPreviewType(name) {
  const ext = getExt(name);
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'].includes(ext)) return 'audio';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['txt', 'md', 'json', 'js', 'ts', 'css', 'html', 'xml', 'yml', 'yaml', 'log', 'csv'].includes(ext)) return 'text';
  return 'none';
}

/** Remove nested roots so only the outermost paths appear at top level */
function dedupeRoots(roots) {
  const resolved = roots.map((r) => path.resolve(r)).filter((r) => fs.existsSync(r));
  const unique = [];
  for (const r of resolved) {
    const isNested = unique.some(
      (u) => r !== u && (r.startsWith(u + path.sep) || r.startsWith(u + '/'))
    );
    if (!isNested) {
      // also remove any previously added that are nested under this new one
      for (let i = unique.length - 1; i >= 0; i--) {
        if (unique[i].startsWith(r + path.sep) || unique[i].startsWith(r + '/')) {
          unique.splice(i, 1);
        }
      }
      unique.push(r);
    }
  }
  return unique;
}

/**
 * @param {import('express').Application|import('express').Router} app
 * @param {import('socket.io').Server} io
 * @param {object} options
 * @param {string}   [options.rootDir]     - Single root folder
 * @param {string[]} [options.roots]       - Multiple root folders (nested ones collapsed)
 * @param {string}   [options.routePrefix='/files']
 * @param {string}   [options.uploadPath='/upload-page']
 * @param {string}   [options.socketRoom='xender']
 */
function setupXenderBrowser(app, io, options = {}) {
  let rootList = [];
  if (Array.isArray(options.roots) && options.roots.length) {
    rootList = dedupeRoots(options.roots);
  } else {
    const single = path.resolve(options.rootDir || path.join(process.cwd(), 'shared'));
    if (!fs.existsSync(single)) fs.mkdirSync(single, { recursive: true });
    rootList = [single];
  }

  // Primary root used for relative paths (first one)
  const primaryRoot = rootList[0];
  const routePrefix = options.routePrefix || '/files';
  const uploadPath = options.uploadPath || '/upload-page';
  const socketRoom = options.socketRoom || 'xender';

  // Map short labels for multi-root (basename)
  const rootLabels = rootList.map((r) => ({
    abs: r,
    label: path.basename(r) || r,
  }));

  // ---------- Path safety ----------
  function safeResolve(relPath = '', rootAbs = primaryRoot) {
    const decoded = decodeURIComponent(relPath || '').replace(/^\/+/, '').replace(/\\/g, '/');
    // Support multi-root: "rootLabel/sub/path"
    let targetRoot = rootAbs;
    let rest = decoded;

    if (rootList.length > 1 && decoded) {
      const firstSeg = decoded.split('/')[0];
      const match = rootLabels.find((rl) => rl.label === firstSeg);
      if (match) {
        targetRoot = match.abs;
        rest = decoded.slice(firstSeg.length).replace(/^\//, '');
      }
    }

    const full = path.resolve(targetRoot, rest);
    // Prevent traversal outside any allowed root
    const ok = rootList.some((r) => full === r || full.startsWith(r + path.sep) || full.startsWith(r + '/'));
    if (!ok) throw new Error('Path traversal detected');
    return { abs: full, root: targetRoot, relative: rest };
  }

  function listDir(absPath) {
    const items = fs.readdirSync(absPath, { withFileTypes: true });
    const result = [];
    for (const item of items) {
      try {
        const full = path.join(absPath, item.name);
        const stat = fs.statSync(full);
        const icon = getFileIcon(item.name, item.isDirectory());
        result.push({
          name: item.name,
          isDirectory: item.isDirectory(),
          size: item.isDirectory() ? null : stat.size,
          sizeFormatted: item.isDirectory() ? '—' : formatSize(stat.size),
          mtime: stat.mtime.toISOString(),
          iconFa: icon.fa,
          iconEmoji: icon.emoji,
          iconColor: icon.color,
          previewType: item.isDirectory() ? null : getPreviewType(item.name),
        });
      } catch (_) {
        /* skip inaccessible */
      }
    }
    result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    return result;
  }

  // ---------- API: list ----------
  app.get(`${routePrefix}/api/list`, (req, res) => {
    try {
      const rel = req.query.path || '';
      // Multi-root at top level: show the root labels as folders
      if (!rel && rootList.length > 1) {
        const items = rootLabels.map((rl) => {
          let mtime = new Date().toISOString();
          try {
            mtime = fs.statSync(rl.abs).mtime.toISOString();
          } catch (_) {}
          return {
            name: rl.label,
            isDirectory: true,
            size: null,
            sizeFormatted: '—',
            mtime,
            iconFa: 'fa-hard-drive',
            iconEmoji: '💾',
            iconColor: '#22D3EE',
            previewType: null,
            isRoot: true,
          };
        });
        return res.json({ path: '', parent: null, items, multiRoot: true });
      }

      const { abs } = safeResolve(rel);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
        return res.status(404).json({ error: 'Directory not found' });
      }
      const items = listDir(abs);
      const relative = rel.replace(/\\/g, '/');
      const parent =
        relative && relative.includes('/')
          ? relative.split('/').slice(0, -1).join('/')
          : relative
          ? ''
          : null;

      res.json({
        path: relative,
        parent,
        items,
        multiRoot: false,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ---------- API: file info ----------
  app.get(`${routePrefix}/api/info`, (req, res) => {
    try {
      const rel = req.query.path || '';
      const { abs } = safeResolve(rel);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        return res.status(404).json({ error: 'File not found' });
      }
      const stat = fs.statSync(abs);
      const name = path.basename(abs);
      const icon = getFileIcon(name, false);
      res.json({
        name,
        path: rel,
        size: stat.size,
        sizeFormatted: formatSize(stat.size),
        mtime: stat.mtime.toISOString(),
        ctime: stat.ctime.toISOString(),
        previewType: getPreviewType(name),
        iconFa: icon.fa,
        iconEmoji: icon.emoji,
        iconColor: icon.color,
        mimeHint: getExt(name),
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ---------- Download ----------
  app.get(`${routePrefix}/download`, (req, res) => {
    try {
      const rel = req.query.path || '';
      const { abs } = safeResolve(rel);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        return res.status(404).send('File not found');
      }
      res.download(abs, path.basename(abs));
    } catch (err) {
      res.status(400).send(err.message);
    }
  });

  // ---------- Raw file (for preview: images, video, audio, pdf, text) ----------
  app.get(`${routePrefix}/raw`, (req, res) => {
    try {
      const rel = req.query.path || '';
      const { abs } = safeResolve(rel);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        return res.status(404).send('File not found');
      }
      res.sendFile(abs);
    } catch (err) {
      res.status(400).send(err.message);
    }
  });

  // ---------- Browser UI ----------
  app.get([routePrefix, `${routePrefix}/`], (req, res) => {
    res.type('html').send(getBrowserHTML({ routePrefix, uploadPath, socketRoom }));
  });

  // ---------- Preview page ----------
  app.get(`${routePrefix}/preview`, (req, res) => {
    const filePath = req.query.path || '';
    res.type('html').send(getPreviewHTML({ routePrefix, uploadPath, socketRoom, filePath }));
  });

  // ---------- Socket.IO ----------
  io.on('connection', (socket) => {
    socket.join(socketRoom);
    socket.on('browser:refresh', () => {
      io.to(socketRoom).emit('browser:changed');
    });
  });

  function notifyBrowserChanged() {
    io.to(socketRoom).emit('browser:changed');
  }

  return {
    notifyBrowserChanged,
    rootDir: primaryRoot,
    roots: rootList,
    routePrefix,
  };
}

// ============================================================
//  BROWSER HTML
// ============================================================
function getBrowserHTML({ routePrefix, uploadPath, socketRoom }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Files • Xender-lite</title>
  <link rel="stylesheet" href="/font-icon/css/all.min.css" />
  <script src="/socket.io/socket.io.js"></script>
  <link rel="stylesheet" id="accent"/>
  <link rel="icon"/>
  <script src="/script/setting.js"></script>
  <style>
    *{
      scroll-behavior: smooth;
      scrollbar-width: thin;
      scrollbar-color: var(--accent) var(--bg-tertiary);
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      line-height: 1.5;
    }
    .navbar {
      position: sticky; top: 0; z-index: 100;
      background: var(--bg-tertiary);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 0 16px; height: 56px;
      display: flex; align-items: center; gap: 12px;
    }
    .nav-brand {
      font-weight: 700; font-size: 1.15rem; color: var(--accent);
      text-decoration: none; display: flex; align-items: center; gap: 8px; margin-right: 8px;
    }
    .nav-brand i { font-size: 1.2rem; }
    .nav-links { display: flex; gap: 4px; flex: 1; }
    .nav-link {
      padding: 8px 14px; border-radius: 10px; color: var(--text-muted);
      text-decoration: none; font-size: 0.9rem; font-weight: 500;
      transition: all var(--transition);
    }
    .nav-link:hover { color: var(--text); background: rgba(34,211,238,0.08); }
    .nav-link.active { color: var(--accent); background: rgba(34,211,238,0.12); }
    .status-pill {
      font-size: 0.75rem; padding: 4px 10px; border-radius: 999px;
      background: rgba(34,211,238,0.12); color: var(--accent); white-space: nowrap;
    }
    .app { max-width: 95%; margin: 0 auto; padding: 20px 16px 48px; }
    .breadcrumb {
      display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
      margin-bottom: 18px; font-size: 0.88rem;
    }
    .breadcrumb a, .breadcrumb span {
      color: var(--text-muted); text-decoration: none; padding: 4px 8px;
      border-radius: 8px; transition: all var(--transition);
    }
    .breadcrumb a:hover { color: var(--accent); background: rgba(34,211,238,0.08); }
    .breadcrumb .current { color: var(--text); font-weight: 600; }
    .breadcrumb .sep { color: var(--border); padding: 0 2px; }
    .toolbar {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 14px; gap: 12px;
    }
    .toolbar h2 { font-size: 1.15rem; font-weight: 700; }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 14px; border-radius: 10px; border: 1px solid var(--border);
      background: var(--card); color: var(--text); font-size: 0.85rem;
      font-weight: 500; cursor: pointer; text-decoration: none;
      transition: all var(--transition);
    }
    .btn:hover { border-color: var(--accent); color: var(--accent); }
    .btn-primary {
      background: rgba(34,211,238,0.15); border-color: var(--accent); color: var(--accent);
    }
    .btn-primary:hover { background: rgba(34,211,238,0.25); }
    .file-list { display: flex; flex-direction: column; gap: 6px; }
    .file-item {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 14px; background: var(--card);
      border: 1px solid var(--border); border-radius: 12px;
      cursor: pointer; transition: all var(--transition);
      text-decoration: none; color: inherit;
    }
    .file-item:hover {
      border-color: var(--accent); background: rgba(34,211,238,0.04);
      transform: translateY(-1px);
    }
    .file-item .icon {
      width: 42px; height: 42px; border-radius: 10px;
      background: rgba(34,211,238,0.1);
      display: flex; align-items: center; justify-content: center;
      font-size: 1.15rem; flex-shrink: 0;
    }
    .file-item .info { flex: 1; min-width: 0; }
    .file-item .name {
      font-size: 0.92rem; font-weight: 500;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .file-item .meta { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
    .file-item .arrow { color: var(--text-muted); font-size: 0.95rem; opacity: 0.55; }
    .empty { text-align: center; padding: 48px 20px; color: var(--text-muted); font-size: 0.95rem; }
    .empty .big { font-size: 2.5rem; margin-bottom: 12px; }
    .loading { text-align: center; padding: 40px; color: var(--text-muted); }
    .parent-row { border-style: dashed; opacity: 0.9; }
  </style>
</head>
<body>
  <nav class="navbar">
    <a class="nav-brand" href="${routePrefix}">
      <i class="fa-solid fa-folder-open"></i> Xender-lite
    </a>
    <div class="nav-links">
      <a class="nav-link active" href="${routePrefix}"><i class="fa-solid fa-hard-drive"></i> Files</a>
      <a class="nav-link" href="${uploadPath}"><i class="fa-solid fa-cloud-arrow-up"></i> Upload</a>
    </div>
    <div class="status-pill" id="connectionStatus">Connecting...</div>
  </nav>

  <div class="app">
    <div class="breadcrumb" id="breadcrumb"></div>
    <div class="toolbar">
      <h2 id="folderTitle">Files</h2>
      <div style="display:flex;gap:8px;">
        <button class="btn" id="btnRefresh" title="Refresh"><i class="fa-solid fa-rotate"></i> Refresh</button>
        <a class="btn btn-primary" href="${uploadPath}"><i class="fa-solid fa-upload"></i> Upload</a>
      </div>
    </div>
    <div class="file-list" id="fileList">
      <div class="loading">Loading...</div>
    </div>
  </div>
<a id="download-tag"></a>
  <script>
    const routePrefix = ${JSON.stringify(routePrefix)};
    const socket = io();
    const connectionStatus = document.getElementById('connectionStatus');
    const fileList = document.getElementById('fileList');
    const breadcrumb = document.getElementById('breadcrumb');
    const folderTitle = document.getElementById('folderTitle');
    let currentPath = '';
    const dtag = document.getElementById('download-tag');
    function download(link) {
      dtag.href = link
      dtag.click();
    }
    socket.on('connect', () => {
      connectionStatus.textContent = 'Connected';
      connectionStatus.style.color = '#22C55E';
      wireThemeSocket(socket);
      socket.on('download-file', async (file) =>{
        if (typeof file === 'object' && file.length !== 0) {
          download('/download?path=' + file.path)
        }
      })
    });
    socket.on('disconnect', () => {
      connectionStatus.textContent = 'Disconnected';
      connectionStatus.style.color = '#EF4444';
    });
    socket.on('browser:changed', () => loadDir(currentPath));

    function formatDate(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    function escapeHtml(str) {
      return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function buildBreadcrumb(relPath) {
      const parts = relPath ? relPath.split('/').filter(Boolean) : [];
      let html = '<a href="#" data-path=""><i class="fa-solid fa-house"></i> Home</a>';
      let acc = '';
      parts.forEach((p, i) => {
        acc += (acc ? '/' : '') + p;
        html += '<span class="sep">/</span>';
        if (i === parts.length - 1) {
          html += '<span class="current">' + escapeHtml(p) + '</span>';
        } else {
          html += '<a href="#" data-path="' + encodeURIComponent(acc) + '">' + escapeHtml(p) + '</a>';
        }
      });
      breadcrumb.innerHTML = html;
      breadcrumb.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          loadDir(decodeURIComponent(a.dataset.path || ''));
        });
      });
    }

    async function loadDir(relPath = '') {
      currentPath = relPath;
      fileList.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
      buildBreadcrumb(relPath);

      try {
        const res = await fetch(routePrefix + '/api/list?path=' + encodeURIComponent(relPath));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');

        folderTitle.textContent = data.path ? data.path.split('/').pop() : 'Files';

        let html = '';

        if (data.path) {
          const parent = data.parent === '.' ? '' : (data.parent || '');
          html += \`
            <a class="file-item parent-row" href="#" data-path="\${encodeURIComponent(parent)}">
              <div class="icon" style="color:#94A3B8"><i class="fa-solid fa-arrow-up"></i></div>
              <div class="info">
                <div class="name">..</div>
                <div class="meta">Parent folder</div>
              </div>
              <div class="arrow"><i class="fa-solid fa-chevron-right"></i></div>
            </a>\`;
        }

        if (!data.items.length && !data.path) {
          html = \`
            <div class="empty">
              <div class="big"><i class="fa-regular fa-folder-open"></i></div>
              <div>No files yet</div>
              <div style="margin-top:8px;font-size:0.85rem;">Upload something to get started</div>
            </div>\`;
        } else if (!data.items.length) {
          html += \`
            <div class="empty">
              <div class="big"><i class="fa-regular fa-folder"></i></div>
              <div>This folder is empty</div>
            </div>\`;
        } else {
          data.items.forEach(item => {
            const itemPath = (data.path ? data.path + '/' : '') + item.name;
            const iconHtml = \`<i class="fa-solid \${item.iconFa}" style="color:\${item.iconColor}"></i>\`;
            if (item.isDirectory) {
              html += \`
                <a class="file-item" href="#" data-path="\${encodeURIComponent(itemPath)}">
                  <div class="icon">\${iconHtml}</div>
                  <div class="info">
                    <div class="name">\${escapeHtml(item.name)}</div>
                    <div class="meta">Folder · \${formatDate(item.mtime)}</div>
                  </div>
                  <div class="arrow"><i class="fa-solid fa-chevron-right"></i></div>
                </a>\`;
            } else {
              const previewUrl = routePrefix + '/preview?path=' + encodeURIComponent(itemPath);
              html += \`
                <a class="file-item" href="\${previewUrl}">
                  <div class="icon">\${iconHtml}</div>
                  <div class="info">
                    <div class="name">\${escapeHtml(item.name)}</div>
                    <div class="meta">\${item.sizeFormatted} · \${formatDate(item.mtime)}</div>
                  </div>
                  <div class="arrow"><i class="fa-solid fa-chevron-right"></i></div>
                </a>\`;
            }
          });
        }

        fileList.innerHTML = html;
        fileList.querySelectorAll('[data-path]').forEach(el => {
          el.addEventListener('click', (e) => {
            e.preventDefault();
            loadDir(decodeURIComponent(el.dataset.path || ''));
          });
        });
      } catch (err) {
        fileList.innerHTML = \`<div class="empty"><div class="big">⚠️</div><div>\${escapeHtml(err.message)}</div></div>\`;
      }
    }

    document.getElementById('btnRefresh').addEventListener('click', () => loadDir(currentPath));

    // Support ?path= so Back from preview can restore the folder
    const urlParams = new URLSearchParams(window.location.search);
    const startPath = urlParams.get('path') || '';
    loadDir(startPath);
  </script>
</body>
</html>`;
}

// ============================================================
//  PREVIEW HTML
// ============================================================
function getPreviewHTML({ routePrefix, uploadPath, socketRoom, filePath }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview • Xender-lite</title>
  <link rel="stylesheet" href="/font-icon/css/all.min.css" />
  <script src="/socket.io/socket.io.js"></script>
  <link rel="stylesheet" id="accent"/>
  <link rel="icon"/>
  <script src="/script/setting.js"></script>
  <style>
    *{
      scroll-behavior: smooth;
      scrollbar-width: thin;
      scrollbar-color: var(--accent) var(--bg-tertiary);
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg); color: var(--text); min-height: 100vh; line-height: 1.5;
    }
    .navbar {
      position: sticky; top: 0; z-index: 100;
      background: var(--bg-tertiary); backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 0 16px; height: 56px;
      display: flex; align-items: center; gap: 12px;
    }
    .nav-brand {
      font-weight: 700; font-size: 1.15rem; color: var(--accent);
      text-decoration: none; display: flex; align-items: center; gap: 8px;
    }
    .nav-links { display: flex; gap: 4px; flex: 1; }
    .nav-link {
      padding: 8px 14px; border-radius: 10px; color: var(--text-muted);
      text-decoration: none; font-size: 0.9rem; font-weight: 500;
      transition: all var(--transition);
    }
    .nav-link:hover { color: var(--text); background: rgba(34,211,238,0.08); }
    .nav-link.active { color: var(--accent); background: rgba(34,211,238,0.12); }
    .status-pill {
      font-size: 0.75rem; padding: 4px 10px; border-radius: 999px;
      background: rgba(34,211,238,0.12); color: var(--accent);
    }
    .app { max-width: 95%; margin: 0 auto; padding: 20px 16px 48px; }
    .back-row { margin-bottom: 16px; display: flex; align-items: center;  }
    .btn {
      display: flex; align-items: center; gap: 6px; justify-content: center;
      padding: 8px 14px; border-radius: 10px; border: 1px solid var(--border);
      background: var(--card); color: var(--text); font-size: 0.85rem;
      font-weight: 500; cursor: pointer; text-decoration: none;
      transition: all var(--transition);
    }
    .btn:hover { border-color: var(--accent); color: var(--accent); }
    .btn-primary {
      background: rgba(34,211,238,0.15); border-color: var(--accent); color: var(--accent);
    }
    .btn-primary:hover { background: rgba(34,211,238,0.25); }
    .btn-lg { padding: 12px 20px; font-size: 0.95rem; }

    .preview-card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 16px; overflow: hidden; margin-bottom: 20px;
    }
    .preview-area {
      background: var(--bg-tertiary); min-height: 220px;
      display: flex; align-items: center; justify-content: center;
      padding: 24px; position: relative;
    }
    .preview-area img {
      max-width: 100%; max-height: 70vh; border-radius: 8px;
      object-fit: contain;
    }
    .preview-area video, .preview-area audio {
      max-width: 100%; width: 100%; border-radius: 8px;
    }
    .preview-area iframe {
      width: 100%; height: 70vh; border: none; border-radius: 8px; background: #111;
    }
    .preview-area pre {
      width: 100%; max-height: 60vh; overflow: auto;
      background: #0c0c0c; padding: 16px; border-radius: 8px;
      font-size: 0.82rem; color: #e2e8f0; white-space: pre-wrap; word-break: break-word;
    }
    .preview-placeholder {
      text-align: center; color: var(--text-muted); padding: 40px 20px;
    }
    .preview-placeholder i { font-size: 3rem; margin-bottom: 12px; display: block; opacity: 0.6; }

    .info-section { padding: 20px; }
    .file-title {
      font-size: 1.2rem; font-weight: 700; margin-bottom: 6px;
      word-break: break-all;
    }
    .file-meta-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px; margin: 18px 0;
    }
    .meta-item {
      background: var(--bg-tertiary); border-radius: 10px; padding: 12px 14px;
    }
    .meta-item .label {
      font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em;
      color: var(--text-muted); margin-bottom: 4px;
    }
    .meta-item .value { font-size: 0.9rem; font-weight: 500; }

    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
    .loading { text-align: center; padding: 60px; color: var(--text-muted); }
  </style>
</head>
<body>
  <nav class="navbar">
    <a class="nav-brand" href="${routePrefix}">
      <i class="fa-solid fa-folder-open"></i> Xender-lite
    </a>
    <div class="nav-links">
      <a class="nav-link" href="${routePrefix}"><i class="fa-solid fa-hard-drive"></i> Files</a>
      <a class="nav-link" href="${uploadPath}"><i class="fa-solid fa-cloud-arrow-up"></i> Upload</a>
    </div>
    <div class="status-pill" id="connectionStatus">Connecting...</div>
  </nav>

  <div class="app">
    <div class="back-row">
      <a class="btn" href="#" id="btnBack"><i class="fa-solid fa-arrow-left"></i> Back</a>
    </div>

    <div id="content">
      <div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading file info...</div>
    </div>
  </div>
<a id="download-tag"></a>
  <script>
    const routePrefix = ${JSON.stringify(routePrefix)};
    const initialPath = ${JSON.stringify(filePath)};
    const socket = io();
    const connectionStatus = document.getElementById('connectionStatus');
    const content = document.getElementById('content');
    const dtag = document.getElementById('download-tag');
    function download(link) {
      dtag.href = link
      dtag.click();
    }
    socket.on('connect', () => {
      connectionStatus.textContent = 'Connected';
      connectionStatus.style.color = '#22C55E';
      wireThemeSocket(socket);
      socket.on('download-file', async (file) =>{
        if (typeof file === 'object' && file.length !== 0) {
          download('/download?path=' + file.path)
        }
      })
    });
    socket.on('disconnect', () => {
      connectionStatus.textContent = 'Disconnected';
      connectionStatus.style.color = '#EF4444';
    });

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function formatDate(iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleString();
    }

    function parentPath(p) {
      if (!p) return '';
      const parts = p.split('/').filter(Boolean);
      parts.pop();
      return parts.join('/');
    }

    // Back → parent folder (not always root)
    (function () {
      const parent = parentPath(initialPath);
      const backUrl = parent
        ? routePrefix + '?path=' + encodeURIComponent(parent)
        : routePrefix;
      const btn = document.getElementById('btnBack');
      btn.href = backUrl;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = backUrl;
      });
    })();

    async function loadInfo() {
      try {
        const res = await fetch(routePrefix + '/api/info?path=' + encodeURIComponent(initialPath));
        const info = await res.json();
        if (!res.ok) throw new Error(info.error || 'Failed to load');

        const rawUrl = routePrefix + '/raw?path=' + encodeURIComponent(initialPath);
        const downloadUrl = routePrefix + '/download?path=' + encodeURIComponent(initialPath);

        let previewHtml = '';
        switch (info.previewType) {
          case 'image':
            previewHtml = \`<img src="\${rawUrl}" alt="\${escapeHtml(info.name)}" />\`;
            break;
          case 'video':
            previewHtml = \`<video controls src="\${rawUrl}"></video>\`;
            break;
          case 'audio':
            previewHtml = \`<audio controls src="\${rawUrl}" style="width:100%"></audio>\`;
            break;
          case 'pdf':
            previewHtml = \`<iframe src="\${rawUrl}" title="PDF preview"></iframe>\`;
            break;
          case 'text':
            previewHtml = \`<pre id="textPreview">Loading text...</pre>\`;
            break;
          default:
            previewHtml = \`
              <div class="preview-placeholder">
                <i class="fa-solid \${info.iconFa}" style="color:\${info.iconColor}"></i>
                <div>No preview available for this file type</div>
              </div>\`;
        }

        content.innerHTML = \`
          <div class="preview-card">
            <div class="preview-area">\${previewHtml}</div>
            <div class="info-section">
              <div class="file-title">
                <i class="fa-solid \${info.iconFa}" style="color:\${info.iconColor};margin-right:8px"></i>
                \${escapeHtml(info.name)}
              </div>
              <div class="file-meta-grid">
                <div class="meta-item">
                  <div class="label">Size</div>
                  <div class="value">\${info.sizeFormatted}</div>
                </div>
                <div class="meta-item">
                  <div class="label">Extension</div>
                  <div class="value">\${(info.mimeHint || 'file').toUpperCase()}</div>
                </div>
                <div class="meta-item">
                  <div class="label">Modified</div>
                  <div class="value">\${formatDate(info.mtime)}</div>
                </div>
                <div class="meta-item">
                  <div class="label">Created</div>
                  <div class="value">\${formatDate(info.ctime)}</div>
                </div>
              </div>
              <div class="actions">
                <a class="btn btn-primary btn-lg" href="\${downloadUrl}">
                  <i class="fa-solid fa-download"></i> Download
                </a>
                <a class="btn btn-lg" href="\${rawUrl}" target="_blank">
                  <i class="fa-solid fa-up-right-from-square"></i> Open raw
                </a>
              </div>
            </div>
          </div>\`;

        if (info.previewType === 'text') {
          fetch(rawUrl)
            .then(r => r.text())
            .then(t => {
              const el = document.getElementById('textPreview');
              if (el) el.textContent = t.slice(0, 200000); // safety limit
            })
            .catch(() => {
              const el = document.getElementById('textPreview');
              if (el) el.textContent = 'Could not load text content.';
            });
        }
      } catch (err) {
        content.innerHTML = \`
          <div class="preview-card">
            <div class="preview-area">
              <div class="preview-placeholder">
                <i class="fa-solid fa-triangle-exclamation" style="color:#EF4444"></i>
                <div>\${escapeHtml(err.message)}</div>
              </div>
            </div>
          </div>\`;
      }
    }

    loadInfo();
  </script>
</body>
</html>`;
}

module.exports = {
  setupXenderBrowser,
  formatSize,
  getFileIcon,
  getPreviewType,
  dedupeRoots,
};
