const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const child_process = require('child_process');

const express = require('express');
const { Server } = require('socket.io');
const multer = require('multer');
const nodewifi = require('node-wifi-plus');
const qrcode = require('qrcode');
const logger = require('node-logger');

const generator = require('./modules/generator.js');
const network = require('./modules/networkinfo.js');
const msg = require('./modules/windows-dialog');
const { setupXenderBrowser } = require('./modules/xender-browser');
const {generateMaxWait, getFileCategory, getFreeDiskSpaceMb, getUniqueFilePath} = require('./modules/utility.js')

// Path configuration
const datapath = path.resolve(process.env.LOCALAPPDATA, 'xender-lite');
const configFile = path.resolve(datapath, 'config.json');
const settingFile = path.resolve(datapath, 'setting.json');
const webviewdata = path.resolve(datapath, 'bin')
const CHUNK_DIR = path.join(os.tmpdir(), 'xender-lite', 'chunk');
const loger = logger({
    path: path.resolve(process.env.LOCALAPPDATA, 'xender-lite', 'logs'),
    colors: true
});
const log = console.log;
nodewifi.init({ iface: null });

const app = express();
const appLan = express();

let apphttp = http.createServer(app);
let appLanhttp = http.createServer(appLan);

// ===== APP METADATA =====
const version = '2.0.0';
let config;
let setting;

function ensureDir(dir) {
    const resolved = path.resolve(dir);
    if (!fs.existsSync(resolved)) {fs.mkdirSync(resolved, { recursive: true });}
}

function saveSetting(data = setting) {
    fs.writeFileSync(settingFile, JSON.stringify(data, null, 2), 'utf-8');
}

function saveConfig(data = config) {
    fs.writeFileSync(configFile, JSON.stringify(data, null, 2), 'utf-8');
}

function validateConfig(raw) {
    const defaults = {
        ports: {
            default: generator.generatePortNumber(5),
            lanPort: generator.generatePortNumber(5),
            socketPort: generator.generatePortNumber(5),
            tcpport: generator.generatePortNumber(5)
        },
        serverdir: []
    };

    const cfg = raw && typeof raw === 'object' ? raw : {};
    cfg.ports = cfg.ports || {};
    for (const [key, value] of Object.entries(defaults.ports)) {
        cfg.ports[key] ??= value;
    }
    cfg.serverdir ??= defaults.serverdir;
    return cfg;
}

function validateSetting(raw) {
    const defaults = {
        theme: 'light',
        accent: 'primary',
        hideOnWeb: true,
        savingFolder: path.resolve(os.homedir(), 'document', 'Xender lite'),
        autoOganise: false, // keep key for compatibility with existing UI
        serverdir: []
    };

    const s = raw && typeof raw === 'object' ? raw : {};
    for (const [key, value] of Object.entries(defaults)) {
        s[key] ??= value;
    }
    return s;
}

// ===== LOAD CONFIG =====
ensureDir(path.dirname(configFile));
if (fs.existsSync(configFile)) {
    try {
        config = validateConfig(JSON.parse(fs.readFileSync(configFile, 'utf-8')));
    } catch {
        config = validateConfig(null);
        saveConfig(config);
    }
} else {
    config.servedir = [
        path.resolve(os.homedir(), 'Downloads'),
        path.resolve(os.homedir(), 'Desktop'),
        path.resolve(os.homedir(), 'Documents'),
        path.resolve(os.homedir(), 'Pictures'),
        path.resolve(os.homedir(), 'Videos'),
        path.resolve(os.homedir(), 'Music')
    ];
    saveConfig(config);
}

// ===== LOAD SETTINGS =====
ensureDir(path.dirname(settingFile));
if (fs.existsSync(settingFile)) {
    try {
        setting = validateSetting(JSON.parse(fs.readFileSync(settingFile, 'utf-8')));
    } catch {
        setting = validateSetting(null);
        setting.serverdir = [
            path.resolve(os.homedir(), 'Downloads'),
            path.resolve(os.homedir(), 'Desktop'),
            path.resolve(os.homedir(), 'Documents'),
            path.resolve(os.homedir(), 'Pictures'),
            path.resolve(os.homedir(), 'Videos'),
            path.resolve(os.homedir(), 'Music')
        ];
        saveSetting(setting);
    }
} else {
    setting = validateSetting(null);
    setting.serverdir = [
        path.resolve(os.homedir(), 'Downloads'),
        path.resolve(os.homedir(), 'Desktop'),
        path.resolve(os.homedir(), 'Documents'),
        path.resolve(os.homedir(), 'Pictures'),
        path.resolve(os.homedir(), 'Videos'),
        path.resolve(os.homedir(), 'Music')
    ];
    saveSetting(setting);
}

ensureDir(CHUNK_DIR);
ensureDir(setting.savingFolder);

// ===== SOCKET.IO =====
const appSocket = new Server(apphttp, {
    cors: {
        origin: `http://localhost:${config.ports.default}`,
        methods: ['GET', 'POST']
    }
});

let appLanSocket = new Server(appLanhttp, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// ===== MIDDLEWARE =====
app.use(express.static(path.join(__dirname, 'static')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

appLan.use(express.static(path.join(__dirname, 'static')));
appLan.use(express.json());
appLan.use(express.urlencoded({ extended: true }));

// ===== LOCAL ROUTES =====
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'views', 'local', 'index.html'));
});
app.get('/files', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'views', 'local', 'files.html'));
});
app.get('/settings', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'views', 'local', 'settings.html'));
});
app.get('/devices', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'views', 'local', 'devices.html'));
});

// ===== LAN ROUTES =====
if (setting.hideOnWeb) {
    appLan.get('/', (req, res) => {
        res.sendFile(path.resolve(__dirname, 'views', 'lan', 'index.html'));
    });
} else {
    appLan.get('/', (req, res) => {
        res.redirect('/files');
    });
}

appLan.get('/upload', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'views', 'lan', 'upload.html'));
});

appLan.get('/download', (req, res) => {
    const filePath = req.query.path && path.resolve(req.query.path);
    if (filePath && fs.existsSync(filePath)) {
        res.status(200).download(filePath);
    } else {
        res.status(400).send('');
    }
});

// ===== RESUMABLE UPLOAD =====
const upload = multer({ dest: CHUNK_DIR });

appLan.post('/upload-file', upload.single('file'), async (req, res) => {
    try {
        const chunkNumber = parseInt(req.body.resumableChunkNumber || req.query.resumableChunkNumber || '1', 10);
        const totalChunks = parseInt(req.body.resumableTotalChunks || req.query.resumableTotalChunks || '1', 10);
        const totalSize = parseInt(req.body.resumableTotalSize || req.query.resumableTotalSize || '0', 10);
        const identifier = req.body.resumableIdentifier || req.query.resumableIdentifier || '';
        const filename = req.body.resumableFilename || req.query.resumableFilename || (req.file && req.file.originalname) || 'unknown';

        if (!req.file) {
            return res.status(400).json({ error: 'No chunk received' });
        }

        const fileChunkDir = path.join(CHUNK_DIR, identifier);
        ensureDir(fileChunkDir);

        const chunkPath = path.join(fileChunkDir, `chunk_${chunkNumber}`);
        fs.renameSync(req.file.path, chunkPath);

        const progress = Math.round((chunkNumber / totalChunks) * 100);
        const progressPayload = {
            id: identifier,
            name: filename,
            progress,
            chunk: chunkNumber,
            totalChunks
        };
        appLanSocket.emit('upload:progress', progressPayload);
        appSocket.emit('upload:progress', progressPayload);

        if (chunkNumber < totalChunks) {
            return res.status(200).json({ message: 'Chunk received' });
        }

        // Last chunk → assemble
        log(`[Upload] Assembling: ${filename}`);

        let targetDir = setting.savingFolder;
        if (setting.autoOganise) {
            const category = getFileCategory(filename);
            targetDir = path.join(setting.savingFolder, category);
            ensureDir(targetDir);
        }
        ensureDir(targetDir);

        const { fullPath, finalName } = getUniqueFilePath(targetDir, filename);
        const writeStream = fs.createWriteStream(fullPath);

        for (let i = 1; i <= totalChunks; i++) {
            const chunkFile = path.join(fileChunkDir, `chunk_${i}`);
            if (!fs.existsSync(chunkFile)) {
                throw new Error(`Missing chunk ${i}`);
            }
            writeStream.write(fs.readFileSync(chunkFile));
        }

        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
            writeStream.end();
        });

        fs.rmSync(fileChunkDir, { recursive: true, force: true });

        const payload = {
            id: identifier,
            originalName: filename,
            finalName,
            path: fullPath,
            size: totalSize
        };

        appLanSocket.emit('upload:success', payload);
        appSocket.emit('upload:success', payload);

        res.status(200).json({
            success: true,
            message: 'File uploaded successfully',
            file: payload
        });
    } catch (err) {
        console.error('[Upload] Error:', err.stack);
        const name = (req.body && req.body.resumableFilename) || 'unknown';
        appLanSocket.emit('upload:error', { name, error: err.message });
        appSocket.emit('upload:error', { name, error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
});

// Check if chunk already exists (for resume)
appLan.get('/upload-file', (req, res) => {
    const identifier = req.query.resumableIdentifier;
    const chunkNumber = req.query.resumableChunkNumber;

    if (!identifier || !chunkNumber) {
        return res.status(204).send('Not found');
    }

    const chunkPath = path.join(CHUNK_DIR, identifier, `chunk_${chunkNumber}`);
    if (fs.existsSync(chunkPath)) {
        return res.status(200).send('OK');
    }
    return res.status(204).send('Not found');
});

function closeServer() {
    return new Promise((resolve) => {
        if (!isconnect && !appLanhttp.listening) {
            isconnect = false;
            return resolve();
        }
        if (isClosing) return resolve();

        isClosing = true;
        try {
            appLanhttp.close(() => {
                isconnect = false;
                isClosing = false;
                resolve();
            });
            // Safety timeout if clients hold the connection open
            setTimeout(() => {
                if (isClosing) {
                    isconnect = false;
                    isClosing = false;
                    resolve();
                }
            }, 2000);
        } catch {
            isconnect = false;
            isClosing = false;
            resolve();
        }
    });
}
 
// ===== FILE BROWSER (LAN) =====
function setupBrowser() {
    const roots = (setting.serverdir && setting.serverdir.length > 0)
        ? setting.serverdir
        : [setting.savingFolder || path.resolve(os.homedir(), 'Desktop')];
    setupXenderBrowser(appLan, appLanSocket, {
        roots,
        routePrefix: '/files',
        uploadPath: '/upload',
        socketRoom: 'xender'
    });
}
apphttp.listen(config.ports.default, (err) => {
    if (err) {
        if (err.code === 'EADDRINUSE') {
            log(`Port ${config.ports.default} is already in use.`);
            process.exit(1);
        }
        log(err)
        return;
    }
    log(`Local server running on http://localhost:${config.ports.default}`);
    saveSetting();
    saveConfig();

});

// ===== GRACEFUL SHUTDOWN =====
async function shutdown() {
    try {
        await closeServer();
        if (child) {
            child.kill(0)
        }
    } catch (_) {}
    try {
        apphttp.close();
        if (child) {
            child.kill(0)
        }
    } catch (_) {}
    if (child) {
        child.kill(0)
    }
    process.exit(0);
}

setInterval(() => {
    console.clear()
}, 20000);

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);