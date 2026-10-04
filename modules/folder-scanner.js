/**
 * Folder Scanner – watch folders with chokidar and index files in low-json-db.
 *
 * Stores the absolute (full) path of every file it finds, plus size, mtime,
 * basename, extension, category, and the root folder it was watched under.
 *
 * Dependencies:
 *   npm i chokidar low-json-db
 *   (or copy amk2406/low-json-db db.js next to this file and require('./db'))
 *
 * Example:
 *   const { createScanner } = require('./folder-scanner');
 *
 *   const scanner = createScanner({
 *     dbPath: './data',
 *     roots: ['/home/user/Documents', '/media/usb'],
 *     // wait instead of failing if a root is not ready yet
 *     waitForRoots: true,
 *     waitTimeout: 0,          // 0 = wait forever
 *     waitPollInterval: 1000,
 *     startDelay: 0,           // extra delay (ms) before watching
 *     skipMissingRoots: true,  // skip roots that never appear (when timeout hits)
 *   });
 *
 *   scanner.on('waiting', ({ root, reason }) => console.log('waiting', root));
 *   scanner.on('root-ready', (root) => console.log('root ready', root));
 *   scanner.on('ready', () => console.log('initial scan done'));
 *   scanner.on('add', (doc) => console.log('new', doc.category, doc.fullPath));
 *
 *   await scanner.start();
 *   // later: await scanner.stop();
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

let chokidar;
try {
  chokidar = require('chokidar');
} catch {
  throw new Error('chokidar is required. Run: npm i chokidar');
}

let JSONDB;
try {
  ({ JSONDB } = require('low-json-db'));
} catch {
  try {
    const mod = require('./db');
    JSONDB = mod.JSONDB || mod;
  } catch {
    throw new Error(
      'low-json-db is required. Run: npm i low-json-db  to continue'
    );
  }
}

const DEFAULT_IGNORED = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.svn/**',
  '**/.hg/**',
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/*.tmp',
  '**/*.temp',
  '**/*~'
];

/**
 * Extension → category map.
 * First matching list wins. Unknown extensions become "other".
 */
const CATEGORY_EXTENSIONS = {
  image: [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico',
    '.tif', '.tiff', '.heic', '.heif', '.avif', '.raw', '.cr2', '.nef',
    '.dng', '.orf', '.arw', '.jfif', '.psd'
  ],
  video: [
    '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v',
    '.mpeg', '.mpg', '.3gp', '.ts', '.m2ts', '.ogv', '.vob', '.mts'
  ],
  audio: [
    '.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.opus',
    '.aiff', '.aif', '.mid', '.midi', '.amr', '.ape', '.wv'
  ],
  text: [
    '.txt', '.md', '.markdown', '.html', '.htm', '.css', '.scss', '.sass',
    '.less', '.xml', '.json', '.yaml', '.yml', '.toml', '.ini', '.conf',
    '.cfg', '.log', '.rst', '.rtf', '.nfo', '.csv', '.tsv', '.env',
    '.gitignore', '.editorconfig', '.properties'
  ],
  code: [
    '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.php', '.py', '.rb',
    '.go', '.rs', '.java', '.kt', '.kts', '.swift', '.c', '.h', '.cpp',
    '.cc', '.cxx', '.hpp', '.hxx', '.cs', '.vb', '.lua', '.sh', '.bash',
    '.zsh', '.ps1', '.r', '.sql', '.pl', '.pm', '.dart', '.scala',
    '.groovy', '.vue', '.svelte', '.elm', '.ex', '.exs', '.erl', '.hs',
    '.ml', '.mli', '.clj', '.cljs', '.fs', '.fsx', '.asm', '.s',
    '.makefile', '.cmake', '.gradle', '.dockerfile'
  ],
  execution: [
    '.exe', '.dll', '.so', '.dylib', '.bat', '.cmd', '.com', '.msi',
    '.app', '.deb', '.rpm', '.apk', '.bin', '.run', '.sys', '.scr',
    '.cpl', '.drv', '.ocx', '.pif', '.vbs', '.vbe', '.wsf', '.jar',
    '.war', '.appimage', '.pkg', '.dmg'
  ],
  document: [
    '.pdf', '.doc', '.docx', '.odt', '.pages', '.epub', '.mobi', '.azw',
    '.azw3', '.tex', '.latex', '.odp'
  ],
  spreadsheet: [
    '.xls', '.xlsx', '.ods', '.xlsm', '.xlsb', '.numbers'
  ],
  presentation: [
    '.ppt', '.pptx', '.odp', '.key', '.pps', '.ppsx'
  ],
  archive: [
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tgz', '.tbz2',
    '.lz', '.lzma', '.zst', '.cab', '.iso'
  ],
  font: [
    '.ttf', '.otf', '.woff', '.woff2', '.eot', '.fon', '.fnt'
  ],
  design: [
    '.ai', '.xd', '.fig', '.sketch', '.indd', '.eps', '.cdr', '.afdesign',
    '.afphoto'
  ],
  model3d: [
    '.obj', '.fbx', '.stl', '.blend', '.gltf', '.glb', '.dae', '.3ds',
    '.max', '.c4d'
  ],
  database: [
    '.db', '.sqlite', '.sqlite3', '.mdb', '.accdb', '.odb', '.sqlitedb'
  ],
  subtitle: [
    '.srt', '.vtt', '.ass', '.ssa', '.sub', '.idx'
  ],
  disk: [
    '.img', '.vmdk', '.vdi', '.vhd', '.vhdx', '.qcow2'
  ]
};

const EXT_TO_CATEGORY = (() => {
  const map = Object.create(null);
  for (const [category, exts] of Object.entries(CATEGORY_EXTENSIONS)) {
    for (const ext of exts) {
      if (!map[ext]) map[ext] = category;
    }
  }
  return map;
})();

function categoryOf(extOrPath) {
  if (!extOrPath) return 'other';
  const ext = extOrPath.includes('.') && !extOrPath.startsWith('.')
    ? path.extname(extOrPath).toLowerCase()
    : String(extOrPath).toLowerCase();
  const normalized = ext.startsWith('.') ? ext : `.${ext}`;
  return EXT_TO_CATEGORY[normalized] || 'other';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isExistingDir(dir) {
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Build a stable document describing a file on disk.
 * Always includes absolute fullPath and category.
 */
function fileDoc(fullPath, root) {
  const abs = path.resolve(fullPath);
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;

  const parsed = path.parse(abs);
  const ext = parsed.ext ? parsed.ext.toLowerCase() : '';
  return {
    fullPath: abs,
    root: root ? path.resolve(root) : null,
    name: parsed.base,
    basename: parsed.name,
    ext,
    category: categoryOf(ext),
    dir: parsed.dir,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
    birthtimeMs: stat.birthtimeMs,
    updatedAt: Date.now()
  };
}

/**
 * Create a folder scanner.
 *
 * @param {object} [options]
 * @param {string} [options.dbPath='./data']
 * @param {string} [options.collection='files']
 * @param {string[]} [options.roots=[]]
 * @param {string[]|function} [options.ignored]
 * @param {boolean} [options.persistent=true]
 * @param {boolean} [options.ignoreInitial=false]
 * @param {number} [options.depth]
 * @param {boolean} [options.awaitWriteFinish=true]
 * @param {number} [options.stabilityThreshold=800]
 * @param {boolean} [options.followSymlinks=false]
 * @param {string[]} [options.extensions]
 * @param {boolean} [options.waitForRoots=true]     wait until roots exist instead of throwing
 * @param {number} [options.waitTimeout=0]          ms to wait (0 = forever)
 * @param {number} [options.waitPollInterval=1000]  how often to re-check roots
 * @param {number} [options.startDelay=0]           extra delay before starting watcher
 * @param {boolean} [options.skipMissingRoots=true] skip roots still missing after wait
 * @param {object} [options.categories]             extra { category: ['.ext'] } merges
 */
function createScanner(options = {}) {
  const dbPath = options.dbPath || path.join(process.cwd(), 'data');
  const collectionName = options.collection || 'files';
  const roots = (options.roots || []).map((r) => path.resolve(r));
  const extensions = options.extensions
    ? options.extensions.map((e) => (e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`))
    : null;

  const waitForRoots = options.waitForRoots !== false;
  const waitTimeout = Number.isFinite(options.waitTimeout) ? options.waitTimeout : 0;
  const waitPollInterval = options.waitPollInterval || 1000;
  const startDelay = options.startDelay || 0;
  const skipMissingRoots = options.skipMissingRoots !== false;

  if (options.categories && typeof options.categories === 'object') {
    for (const [cat, list] of Object.entries(options.categories)) {
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        const ext = raw.startsWith('.') ? raw.toLowerCase() : `.${String(raw).toLowerCase()}`;
        EXT_TO_CATEGORY[ext] = cat;
      }
    }
  }

  const db = new JSONDB(dbPath);
  const files = db.collection({
    name: collectionName,
    autoId: true,
    indexes: ['fullPath', 'ext', 'root', 'name', 'category']
  });

  const emitter = new EventEmitter();
  let watcher = null;
  let started = false;
  let starting = false;
  const rootSet = new Set(roots);

  function isAllowedExt(fullPath) {
    if (!extensions) return true;
    const ext = path.extname(fullPath).toLowerCase();
    return extensions.includes(ext);
  }

  function findRootFor(absPath) {
    const abs = path.resolve(absPath);
    let best = null;
    for (const root of rootSet) {
      if (abs === root || abs.startsWith(root + path.sep)) {
        if (!best || root.length > best.length) best = root;
      }
    }
    return best;
  }

  function upsertFile(fullPath) {
    const abs = path.resolve(fullPath);
    if (!isAllowedExt(abs)) return null;

    const root = findRootFor(abs);
    const doc = fileDoc(abs, root);
    if (!doc) return null;

    const existing = files.findOne({ fullPath: abs });
    if (existing) {
      files.updateOne(
        { fullPath: abs },
        {
          $set: {
            size: doc.size,
            mtimeMs: doc.mtimeMs,
            ctimeMs: doc.ctimeMs,
            birthtimeMs: doc.birthtimeMs,
            name: doc.name,
            basename: doc.basename,
            ext: doc.ext,
            category: doc.category,
            dir: doc.dir,
            root: doc.root,
            updatedAt: doc.updatedAt
          }
        }
      );
      const updated = files.findOne({ fullPath: abs });
      return { kind: 'change', doc: updated };
    }

    const inserted = files.insert(doc);
    return { kind: 'add', doc: inserted };
  }

  function removeFile(fullPath) {
    const abs = path.resolve(fullPath);
    const existing = files.findOne({ fullPath: abs });
    if (!existing) return null;
    files.deleteOne({ fullPath: abs });
    return existing;
  }

  function buildIgnored() {
    const base = Array.isArray(options.ignored)
      ? [...DEFAULT_IGNORED, ...options.ignored]
      : [...DEFAULT_IGNORED];

    if (typeof options.ignored === 'function') {
      return (p, stats) => {
        if (options.ignored(p, stats)) return true;
        return false;
      };
    }
    return base;
  }

  async function waitUntilRootsReady() {
    const pending = [...rootSet];
    if (pending.length === 0) return [];

    const ready = [];
    const missing = pending.filter((r) => !isExistingDir(r));
    const already = pending.filter((r) => isExistingDir(r));
    ready.push(...already);

    if (missing.length === 0 || !waitForRoots) {
      if (!waitForRoots) {
        for (const r of missing) {
          emitter.emit('waiting', { root: r, reason: 'missing', skipped: true });
        }
      }
      return skipMissingRoots || waitForRoots ? ready : pending;
    }

    const startedAt = Date.now();
    const stillMissing = new Set(missing);

    for (const r of stillMissing) {
      emitter.emit('waiting', { root: r, reason: 'not-found' });
    }

    while (stillMissing.size > 0) {
      if (waitTimeout > 0 && Date.now() - startedAt >= waitTimeout) break;

      await sleep(waitPollInterval);

      for (const r of [...stillMissing]) {
        if (isExistingDir(r)) {
          stillMissing.delete(r);
          ready.push(r);
          emitter.emit('root-ready', r);
        } else {
          emitter.emit('waiting', { root: r, reason: 'not-found' });
        }
      }
    }

    if (stillMissing.size > 0) {
      for (const r of stillMissing) {
        emitter.emit('waiting', {
          root: r,
          reason: 'timeout',
          skipped: skipMissingRoots
        });
      }
      if (!skipMissingRoots) {
        const list = [...stillMissing].join(', ');
        throw new Error(`Roots not ready after wait: ${list}`);
      }
    }

    return ready;
  }

  async function start() {
    if (started || starting) return emitter;
    starting = true;

    try {
      if (rootSet.size === 0) {
        throw new Error('No roots to watch. Pass options.roots or call addRoot() first.');
      }

      if (startDelay > 0) {
        emitter.emit('waiting', { reason: 'start-delay', ms: startDelay });
        await sleep(startDelay);
      }

      const watchPaths = await waitUntilRootsReady();
      if (watchPaths.length === 0) {
        throw new Error(
          'No ready roots to watch. Mount the folder or pass waitForRoots / skipMissingRoots options.'
        );
      }

      const awaitWriteFinish = options.awaitWriteFinish === false
        ? false
        : {
            stabilityThreshold: options.stabilityThreshold || 800,
            pollInterval: 100
          };

      watcher = chokidar.watch(watchPaths, {
        ignored: buildIgnored(),
        persistent: options.persistent !== false,
        ignoreInitial: options.ignoreInitial === true,
        depth: options.depth,
        followSymlinks: options.followSymlinks === true,
        awaitWriteFinish,
        ignorePermissionErrors: true
      });

      watcher.on('add', (p) => {
        try {
          const result = upsertFile(p);
          if (!result) return;
          emitter.emit(result.kind, result.doc);
          emitter.emit('file', result.kind, result.doc);
        } catch (err) {
          emitter.emit('error', err);
        }
      });

      watcher.on('change', (p) => {
        try {
          const result = upsertFile(p);
          if (!result) return;
          emitter.emit('change', result.doc);
          emitter.emit('file', 'change', result.doc);
        } catch (err) {
          emitter.emit('error', err);
        }
      });

      watcher.on('unlink', (p) => {
        try {
          const removed = removeFile(p);
          if (!removed) return;
          emitter.emit('unlink', removed);
          emitter.emit('file', 'unlink', removed);
        } catch (err) {
          emitter.emit('error', err);
        }
      });

      watcher.on('error', (err) => {
        // permission / disappeared-root errors should not crash the process
        emitter.emit('error', err);
      });

      await new Promise((resolve, reject) => {
        watcher.once('ready', resolve);
        watcher.once('error', reject);
      });

      started = true;
      emitter.emit('ready', {
        roots: watchPaths,
        pendingRoots: [...rootSet].filter((r) => !watchPaths.includes(r)),
        count: files.find({}).count()
      });
      return emitter;
    } catch (err) {
      starting = false;
      throw err;
    } finally {
      starting = false;
    }
  }

  async function stop() {
    if (watcher) {
      await watcher.close();
      watcher = null;
    }
    started = false;
    starting = false;
    emitter.emit('stop');
  }

  function addRoot(dir) {
    const abs = path.resolve(dir);
    rootSet.add(abs);

    if (isExistingDir(abs)) {
      if (watcher) watcher.add(abs);
      emitter.emit('root-ready', abs);
      return abs;
    }

    emitter.emit('waiting', { root: abs, reason: 'not-found' });

    if (!waitForRoots) {
      return abs;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (isExistingDir(abs)) {
        clearInterval(timer);
        if (watcher) watcher.add(abs);
        emitter.emit('root-ready', abs);
        return;
      }
      if (waitTimeout > 0 && Date.now() - startedAt >= waitTimeout) {
        clearInterval(timer);
        emitter.emit('waiting', { root: abs, reason: 'timeout', skipped: skipMissingRoots });
      }
    }, waitPollInterval);

    if (typeof timer.unref === 'function') timer.unref();
    return abs;
  }

  function removeRoot(dir) {
    const abs = path.resolve(dir);
    rootSet.delete(abs);
    if (watcher) watcher.unwatch(abs);
    files.deleteMany({ root: abs });
    return abs;
  }

  /** One-shot recursive scan without starting the watcher. */
  function scanOnce(dir) {
    const absRoot = path.resolve(dir || [...rootSet][0]);
    if (!absRoot) throw new Error('No directory given');
    if (!isExistingDir(absRoot)) {
      emitter.emit('waiting', { root: absRoot, reason: 'not-found', skipped: true });
      return [];
    }

    const results = [];
    function walk(current) {
      let entries;
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        const full = path.join(current, ent.name);
        if (ent.isDirectory()) {
          const skip = DEFAULT_IGNORED.some((g) => {
            return (
              (g.includes('node_modules') && ent.name === 'node_modules') ||
              (g.includes('.git') && ent.name === '.git')
            );
          });
          if (!skip) walk(full);
        } else if (ent.isFile()) {
          const result = upsertFile(full);
          if (result) results.push(result.doc);
        }
      }
    }
    walk(absRoot);
    return results;
  }

  function findByPath(fullPath) {
    return files.findOne({ fullPath: path.resolve(fullPath) });
  }

  function findByExt(ext) {
    const e = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    return files.find({ ext: e }).toArray();
  }

  function findByRoot(root) {
    return files.find({ root: path.resolve(root) }).toArray();
  }

  function findByName(name) {
    return files.find({ name }).toArray();
  }

  function findByCategory(category) {
    return files.find({ category: String(category).toLowerCase() }).toArray();
  }

  function search(filter = {}) {
    return files.find(filter).toArray();
  }

  function all() {
    return files.find({}).toArray();
  }

  function count() {
    return files.find({}).count();
  }

  function countByCategory() {
    const rows = files.find({}).toArray();
    const out = {};
    for (const row of rows) {
      const cat = row.category || 'other';
      out[cat] = (out[cat] || 0) + 1;
    }
    return out;
  }

  function clear() {
    files.deleteMany({});
  }

  return Object.assign(emitter, {
    start,
    stop,
    addRoot,
    removeRoot,
    scanOnce,

    findByPath,
    findByExt,
    findByRoot,
    findByName,
    findByCategory,
    search,
    all,
    count,
    countByCategory,
    clear,

    collection: files,
    db,

    get roots() {
      return [...rootSet];
    },
    get isRunning() {
      return started;
    },
    get categories() {
      const cats = new Set(Object.values(EXT_TO_CATEGORY));
      cats.add('other');
      return [...cats].sort();
    }
  });
}

module.exports = {
  createScanner,
  fileDoc,
  categoryOf,
  CATEGORY_EXTENSIONS
};
