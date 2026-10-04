// Load or create settings
if (fs.existsSync(settingFile)) {
  try {
    setting = JSON.parse(fs.readFileSync(settingFile, 'utf-8'));
  } catch (e) {
    setting = null;
  }
}

if (!setting) {
  setting = {
    saveDir: path.resolve(os.homedir(), 'Downloads', 'Xender-lite'),
    autoOrganise: true,
    autoAccept: true,
    theme: 'dark'
  };
  fs.mkdirSync(path.dirname(settingFile), { recursive: true });
  fs.writeFileSync(settingFile, JSON.stringify(setting, null, 2));
}

// Make sure save folder exists
if (!fs.existsSync(setting.saveDir)) {
  fs.mkdirSync(setting.saveDir, { recursive: true });
}



const r = new Resumable({
  target: '/upload',
  chunkSize: 1 * 1024 * 1024, // 1MB
  simultaneousUploads: 3,
  testChunks: true,           // important for resume
  throttleProgressCallbacks: 1,
  headers: {},
  query: {}
});



const fs = require('fs')

fs.ensureDirSync = (path) =>{
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path, {recursive: true})
  }
}

function getFileCategory(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  const map = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic'],
    video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'],
    audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'],
    pdf: ['pdf'],
    document: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'csv'],
    archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']
  };

  for (const [category, exts] of Object.entries(map)) {
    if (exts.includes(ext)) return category;
  }
  return 'others';
}

function getUniqueFilePath(dir, originalName) {
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext);
  let finalName = originalName;
  let counter = 1;
  let fullPath = path.join(dir, finalName);

  while (fs.existsSync(fullPath)) {
    finalName = `${base}-${counter}${ext}`;
    fullPath = path.join(dir, finalName);
    counter++;
  }
  return { fullPath, finalName };
}

// Temp folder for chunks
const CHUNK_DIR = path.join(os.tmpdir(), 'xender-lite', 'chunk');
fs.ensureDirSync(CHUNK_DIR);


const multer = require('multer');
const upload = multer({ dest: CHUNK_DIR });

// ========== RESUMABLE UPLOAD ==========
appLan.post('/upload', upload.single('file'), async (req, res) => {
  try {
    // Resumable.js fields
    const chunkNumber = parseInt(req.body.resumableChunkNumber || req.query.resumableChunkNumber || '1');
    const totalChunks = parseInt(req.body.resumableTotalChunks || req.query.resumableTotalChunks || '1');
    const chunkSize = parseInt(req.body.resumableChunkSize || req.query.resumableChunkSize || '0');
    const totalSize = parseInt(req.body.resumableTotalSize || req.query.resumableTotalSize || '0');
    const identifier = req.body.resumableIdentifier || req.query.resumableIdentifier || '';
    const filename = req.body.resumableFilename || req.query.resumableFilename || (req.file && req.file.originalname) || 'unknown';

    if (!req.file) {
      return res.status(400).json({ error: 'No chunk received' });
    }

    // Create a folder for this file's chunks
    const fileChunkDir = path.join(CHUNK_DIR, identifier);
    fs.ensureDirSync(fileChunkDir);

    // Move current chunk to its place
    const chunkPath = path.join(fileChunkDir, `chunk_${chunkNumber}`);
    fs.renameSync(req.file.path, chunkPath);

    console.log(`\r[Upload] Chunk ${chunkNumber}/ ${totalChunks} received → ${filename}`);

    // Emit progress
    const progress = Math.round((chunkNumber / totalChunks) * 100);
    appLanSocket.emit('upload:progress', {
      id: identifier,
      name: filename,
      progress,
      chunk: chunkNumber,
      totalChunks
    });

    // If not the last chunk, just acknowledge
    if (chunkNumber < totalChunks) {
      return res.status(200).json({ message: 'Chunk received' });
    }

    // ===== LAST CHUNK → assemble file =====
    console.log(`[Upload] All chunks received. Assembling: ${filename}`);

    // Decide final directory
    let targetDir = setting.saveDir;
    if (setting.autoOrganise) {
      const category = getFileCategory(filename);
      targetDir = path.join(setting.saveDir, category);
      fs.ensureDirSync(targetDir);
      console.log(`[Upload] Auto-organise → ${category}/`);
    }

    // Unique final name
    const { fullPath, finalName } = getUniqueFilePath(targetDir, filename);

    // Merge all chunks
    const writeStream = fs.createWriteStream(fullPath);

    for (let i = 1; i <= totalChunks; i++) {
      const chunkFile = path.join(fileChunkDir, `chunk_${i}`);
      if (!fs.existsSync(chunkFile)) {
        throw new Error(`Missing chunk ${i}`);
      }
      const data = fs.readFileSync(chunkFile);
      writeStream.write(data);
    }

    writeStream.end();

    // Wait until writing is finished
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Clean up chunks
    fs.unlinkSync(fileChunkDir);

    console.log(`[Upload] Success: ${finalName}`);
    console.log(`[Upload] Saved to: ${fullPath}`);

    // Emit success
    const payload = {
      id: identifier,
      originalName: filename,
      finalName,
      path: fullPath,
      size: totalSize
    };

    appLanSocket.emit('upload:success', payload);
    appSocket.emit('upload:success', payload); // also notify local UI

    res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      file: payload
    });

  } catch (err) {
    console.error('[Upload] Error:', err.message);

    appLanSocket.emit('upload:error', {
      name: req.body.resumableFilename || 'unknown',
      error: err.message
    });

    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== TEST CHUNK (needed for resume) ==========
appLan.get('/upload', (req, res) => {
  const identifier = req.query.resumableIdentifier;
  const chunkNumber = req.query.resumableChunkNumber;

  const chunkPath = path.join(CHUNK_DIR, identifier, `chunk_${chunkNumber}`);

  if (fs.existsSync(chunkPath)) {
    // Chunk already exists → tell Resumable.js to skip it
    return res.status(200).send('OK');
  } else {
    // Chunk missing → Resumable.js will re-upload it
    return res.status(204).send('Not found');
  }
});