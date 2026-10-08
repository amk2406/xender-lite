const os = require('os');
const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const child_process = require('child_process');

const qrcode = require('qrcode');
const chalk = require('chalk');
const express = require('express');
const { Socket, Server } = require('socket.io')
const logger = require('node-logger');
const multer = require('multer')
const { WebView } = require('webview-node')
const webviewapp = require('webview-node').app
const { WifiPlus, } = require('node-wifi-plus');
const  { JSONDB } = require('file-json-db')

// custom modules
const generator = require('./modules/generator')
const network = require('./modules/networkinfo')
const util = require('./modules/utility')
const moduleutlt = require('./modules/license')
const { setupXenderBrowser } = require('./modules/xender-browser');

// Path config
const datapath = path.resolve(process.env.LOCALAPPDATA, 'Xender Lite')
const tempdir = path.resolve(os.tmpdir(), 'Xender Lite')
const logpath = path.resolve(datapath, 'logs')
const chunkpath = path.relative(tempdir, 'chunks')
const recentpath = path.resolve(datapath, 'Recent')
const configpath = path.resolve(datapath, 'config.json')
const settingpath = path.resolve(datapath, 'setting.json')
const webviewdata = path.resolve(datapath, 'Webview Data')

// Additional helper
fs.ensureDir = (dir) =>{ if (!fs.existsSync(dir)){fs.mkdirSync(dir); return dir}}
fs.ensureFile = (filepath, content = '') =>{fs.ensureDir(path.dirname(filepath));fs.writeFileSync(filepath, content)}

// Little helpers
const log = console.log
const err = console.error
const errlog = console.error
const version = '2.0.0'

// App setting and config
let setting = settingdata(settingpath)
let config = configdata(configpath)

// Module config
const wifi = new WifiPlus({
    autoReconnect: true,
    watchInterval: 1300,
})
const win = new WebView({
  title: 'Xender Lite',
  width: 1200,
  height: 700,
  minWidth: 800,
  windowsHide: false,
  devTools: false,
  backgroundColor: '#eee8e8',
  userDataFolder: webviewdata
});
const db = new JSONDB(recentpath)
const recent = db.collection({ name: 'recent',maxPartSize: 512000,autoId: true})

 
function settingdata(filepath = settingpath) {
   const layout = {
        theme: "light", accent: "primary",
        hideOnWeb: false, autoOrganise: true,
        savefolder: path.resolve(os.homedir(), 'desktop', 'Xender Lite'),
        servepaths: [
            path.resolve(os.homedir(), 'desktop'), path.resolve(os.homedir(), 'document'),
            path.resolve(os.homedir(), 'download'), path.resolve(os.homedir(), 'music'), 
            path.resolve(os.homedir(), 'pictures'), path.resolve(os.homedir(), 'videos'),
        ]
    }
    const data = function (){
        try {
            const sett = JSON.parse(fs.readFileSync(filepath))
            layout.theme = sett.theme || layout.theme
            layout.accent = sett.accent || layout.accent
            layout.hideOnWeb = typeof sett.hideOnWeb ===  'boolean' ? sett.hideOnWeb : layout.hideOnWeb
            layout.autoOrganise = typeof sett.autoOrganise === 'boolean' ? sett.autoOrganise : layout.autoOrganise
            layout.savefolder = typeof sett.savefolder === 'string' ? path.resolve(sett.savefolder) : layout.savefolder
            layout.servepaths = typeof sett.servepaths === 'object' ? sett.servepaths : layout.servepaths
            saveSetting(layout)
            return layout
        } catch (error) {
            err('[PARSEING ERR] fail to parse setting json', error.message)
            saveSetting(layout)
            return layout
        }
    }
    return data()
}
function saveSetting(data = setting) {
    try {
        const s = JSON.stringify(data, null, 2)
        fs.writeFileSync(settingpath, s)
    } catch (error) {
        err('[SAVE ERR] fail to save setting data', error.message)
    }
}

function configdata(filepath = configpath) {
    const layout = {
        ports: {
            default: generator.generatePortNumber(5), lanport: generator.generatePortNumber(5),
            socketport: generator.generatePortNumber(5), tcpport: generator.generatePortNumber(5)
        },
    }
    try {
        const conf = JSON.parse(fs.readFileSync(filepath))
        layout.ports = typeof conf.ports === 'object' ? conf.ports : layout.ports;
        layout.ports.default = typeof conf.ports.default === 'number' ? conf.ports.default : layout.ports.default
        layout.ports.lanport = typeof conf.ports.lanport === 'number' ? conf.ports.lanport : layout.ports.lanport
        layout.ports.socketport = typeof conf.ports.socketport === 'number' ? conf.ports.socketport : layout.ports.socketport
        layout.ports.tcpport = typeof conf.ports.tcpport === 'number' ? conf.ports.tcpport : layout.ports.tcpport
        saveConfig(layout); return layout
    } catch (error) {
        err('[PARSEING ERR] fail to parse config json', error.message)
        saveConfig(layout); return layout
    }
}
function saveConfig(data = config) {
    try {
        const s = JSON.stringify(data, null, 2)
        fs.writeFileSync(configpath, s)
    } catch (error) {
        err('[SAVE ERR] fail to save config data', error.message)
    }
}

const ACCENTS = {
    primary: { icon: path.resolve('res/icon.ico') }, colored: {icon: path.resolve('res/icon-color.ico') },
    neon: { icon: path.resolve('res/icon-dark.ico') },
};

function getIcon(accent = 'primary') {
    const found = ACCENTS[accent] || ACCENTS.primary;
    return found.icon
}
const app = express()
const lanapp = express()

app.use(express.static(path.resolve('static')),express.json())
lanapp.use(express.static(path.resolve('static')),express.json())

app.get('/', (req, res, next) =>{
    try {
        res.status(200).sendFile(path.resolve('views', 'local', 'index.html'))
    } catch (err) { next(err)}
})
app.get('/files', (req, res, next) =>{
    try {
        res.status(200).sendFile(path.resolve('views', 'local', 'files.html'))
    } catch (err) { next(err)}
})
app.get('/devices', (req, res, next) =>{
    try {
        res.status(200).sendFile(path.resolve('views', 'local', 'devices.html'))
    } catch (err) { next(err)}
})
app.get('/settings', (req, res, next) =>{
    try {
        res.status(200).sendFile(path.resolve('views', 'local', 'settings.html'))
    } catch (err) { next(err)}
})
app.get('/log', (req, res, next) =>{
    try {
        res.status(200).sendFile(path.resolve('views', 'local', 'log.html'))
    } catch (err) { next(err)}
})
app.get('/license', (req, res, next) =>{
    try {
        res.status(200).sendFile(path.resolve('views', 'local', 'license.html'))
    } catch (err) { next(err)}
})
app.get('/license', (req, res, next) =>{
    try {
        const modulename = req.query.module
        if(typeof modulename !== 'string' || !modulename) return res.status(404).json({error: 'module not found'})
    } catch (error) {
        next(error)
    }
})
app.use((err, req, res, next) =>{
    if (err) {
        errlog('[APP ROUTE] An error from App route ', err)
    } else{

    }
})

const packagelok = require('./package-lock.json');
const [bin, packagelockjson, ...modules] = fs.readdirSync(path.resolve('node_modules'))
modules.forEach(module =>{
    const packagejson = path.resolve('node_modules', module, 'license')
    if (fs.existsSync(packagejson)) {
        log(fs.readFileSync(packagejson).toString())
    }
})
lanapp.use((req, res, next) =>{
    try {
        
    } catch (error) {
        next(error)
    }
})

lanapp.get('/upload', async (req, res, next) =>{
    try {
        return res.status(200).sendFile(path.resolve('views', 'lan', 'upload.html'))
    } catch (error) {
        next(error)
    }
})

lanapp.get('/download', async (req, res, next) =>{
    try {
        
    } catch (error) {
        next(error)
    }
})

lanapp.use((req, res, next) =>{
    try {
        return res.status(404).sendFile(path.resolve('views', 'lan', '404.html'))
    } catch (error) {
        
    }
})

lanapp.use((err, req, res, next) =>{
    try {
        errlog('[LAN APP] receive error', (err.message || err.stack || err))
        return res.status(404).sendFile(path.resolve('views', 'lan', '404.html'))
    } catch (error) {
        errlog('[LAN APP] error at error middle were')
        return res.status(500).send('')
    }
})


const apphttp = http.createServer(app)
const appsocket = new Server(apphttp, {cors: { methods: ['GET', 'POST']}})


const lanhttp = http.createServer(lanapp)
const lansocket = new Server(lanhttp, {cors: { methods: ['GET', 'POST']}})

const port = config.ports.default
apphttp.listen(port, async (err)=>{
    if (err) {
        if (err.code === 'EADDRINUSE') {
            log('[APP HTTP] Error starting local app http ', err.message)
            setTimeout(() => {
                process.exit(1)
            }, 650);
        }
        log('[APP HTTP] Error starting local app http ', err.message)
    }
    try {
        log('[APP HTTP] App start successfully on port ', port)
        win.loadURL('http://localhost:'+port)
        win.setIcon(getIcon(setting.accent))
        let ipaddress = network.getLocalIP()
        let isontranfer = false
        let isinwifi = false
        let isspawn = false
        wifi.on('connect', () =>{
            isinwifi = true
            ipaddress = network.getLocalIP()
        })
        wifi.on('reconnect', () =>{
            isinwifi = true
        })
        wifi.on('disconnect', () =>{
            isinwifi = false
        })
        wifi.on('networkChange', async () =>{
            if (isontranfer && ipaddress !== network.getLocalIP()) {
                await win.dialog.confirm(
                    'We detect a network change will you like to switch the View to the new Network',
                    'Xender Lite'
                ).then(async result =>{
                    if (result === "true" || true) {
                        ipaddress = network.getLocalIP()
                        await closelanapp(appsocket)
                        await startLanapp(ipaddress, appsocket)
                    }
                })
            }
        })
        
        const getQrcode = (string = `http://${lanhttp.address().address}:${lanhttp.address().port}`) => {
            return qrcode.toDataURL(string).then(link => {return link;
            }).catch(err => {
                err('[QRCODE] Fail to create qrcode for link ', err.message);return 'about:blank'
            })
        }

        const startLanapp = async (ip = ipaddress, socket) =>{
            ipaddress = network.getLocalIP()
            if (!lanhttp.listening){
                ipaddress = network.getLocalIP()
                if (await wifi.isConnected() && ip) {
                    lanhttp.listen(config.ports.lanport, ip, async (err) =>{
                        if (err) {
                            if (err.code === 'EADDRINUSE') {
                                log('[LAN APP] Error starting local app http ', err.message)
                            }
                            errlog('[LAN APP] fail to start lan app')
                        }
                        log('[LAN APP] lan start on port', `http://${lanhttp.address().address}:${lanhttp.address().port}`)
                        if (!isspawn) {
                            isspawn = true
                            child_process.exec(`start http://${lanhttp.address().address}:${lanhttp.address().port}`)
                        }
                        if (socket) {
                            const qr = await getQrcode(`http://${lanhttp.address().address}:${lanhttp.address().port}`)
                            const lanlink = `http://${lanhttp.address().address}:${lanhttp.address().port}`
                            socket.broadcast.emit('web-server-started', { link: lanlink, qr: qr })
                            socket.emit('web-server-started', { link: lanlink, qr: qr })
                            socket.emit('qrcode', qr)
                            socket.broadcast.emit('qrcode', qr)
                        }
                    })
                }
            }
        }
        const closelanapp = async (socket) =>{
            try {
                if (lanhttp.listening) {
                    await lanhttp.close()
                    isontranfer = false
                    socket.broadcast.emit('web-server-stopped', true)
                    socket.emit('web-server-stopped', true)
                    socket.emit('web-server-closed', true)
                } else{
                    socket.broadcast.emit('web-server-stopped', true)
                    socket.emit('web-server-stopped', true)
                    socket.emit('web-server-closed', true)
                }
            } catch (er) {
                errlog('[LAN APP] err, fail to close lan http', er.message)
            }
        }

        appsocket.on('connection', async (socket) =>{

            socket.onAny((event, ...args) =>{
                log(`Event fron id: ${socket.id},
                With event name of: ${event},
                And argument of: ${args}`)
            })

            if (lanhttp.listening) {
                const qr = await getQrcode(`http://${lanhttp.address().address}:${lanhttp.address().port}`)
                const lanlink = `http://${lanhttp.address().address}:${lanhttp.address().port}`;
                socket.emit('web-server-started', { link: lanlink, qr: qr })
                socket.emit('qrcode', qr)
                socket.emit('lan-link', lanlink)
            }

            socket.on('start-web-server',  async () =>{
                ipaddress = network.getLocalIP()
                if(!lanhttp.listening) {
                    await startLanapp(ipaddress, socket).then(() =>{
                    }).catch(er => {
                        win.dialog.error('Fail to start LAN server, pls try again', 'Xender Lite')
                        errlog('[LAN APP] failt to start lan app', er.message)
                    })
                } else {
                    const qr = await getQrcode(`http://${lanhttp.address().address}:${lanhttp.address().port}`)
                    const lanlink = `http://${lanhttp.address().address}:${lanhttp.address().port}`
                    socket.broadcast.emit('web-server-started', { link: lanlink, qr: qr })
                    socket.emit('web-server-started', { link: lanlink, qr: qr })
                }
            });
            socket.on('stop-web-server',  async () =>{
                if(lanhttp.listening) {
                    if (isontranfer) {
                        win.flash(); win.focus()
                        await win.dialog.confirm('There is A current Transfer Inprogress, are you sure you want to close it.', 'Xender Lite'
                        ).then(async re => {
                            if (re === 'true' || true) {await closelanapp(socket).catch(er => log('[LAN APP] fail to close lan app', er.message)) }
                        })
                    }
                    await closelanapp().catch(er => log('[LAN APP] fail to close lan app', er.message))
                }else{socket.broadcast.emit('web-server-stopped', true); socket.emit('web-server-stopped', true)}
            });

            socket.on('get-recent-transfers', async () =>{
                try {
                        const data = await recent.find({}).limit(40).toArray()
                    if (data && data.length !== 0) {
                        socket.emit('recent-transfers', data)
                    }
                } catch (error) {
                    errlog('[RECENT DB] fail to find recent data', error.message)
                }
            })

            socket.on('get-connected-devices', async () =>{
               try {
                    const scanwifi = await wifi.getCurrentConnection()
                    log(scanwifi)
                    socket.emit('connected-devices', [scanwifi])
               } catch (error) {
                    err('[WIFI ERR] wifi error at scanning', error.message)
               }
            })
            socket.on('connect-device', async  (payload) =>{
               try {
                    await wifi.connect(payload.ssid || payload.name, payload.password || '').then((connect) =>{
                        socket.emit('connect-device-result', {ok: true, success: true})
                    }).catch((err) =>{
                        errlog('[WIFI ERR] error connecting wifi', err.message)
                        socket.emit('device-connect-error', false)
                    })
               } catch (error) {
                    errlog('[WIFI ERR] wifi error at connecting', error.message)
               }
            })

            socket.on('disconnect-device', async (device) =>{
                await wifi.disconnect().then(discon =>{
                }).catch(error =>{
                    errlog('[WIFI ERR] fail to diconnect wifi', error.message)
                })
            })
            
            wifi.on('connect', (device) =>{
                socket.emit('connected-devices', [device])
            })
            wifi.on('disconnect', async (device) =>{
                socket.emit('connected-devices', [])
                const scanwifi = await wifi.scan()
                socket.emit('wifi-devices', scanwifi)
            })

            socket.on('scan-wifi-devices', async () =>{
               try {
                    const scanwifi = await wifi.scan()
                    socket.emit('wifi-devices', scanwifi)
               } catch (error) {
                    errlog('[WIFI ERR] wifi error at scanning', error.message)
                    socket.emit('scan-error', {})
               }
            })
            socket.on('get-wifi-devices', async () =>{
               try {
                    const scanwifi = await wifi.scan()
                    socket.emit('wifi-devices', scanwifi)
               } catch (error) {
                    errlog('[WIFI ERR] wifi error at scanning', error.message)
                    socket.emit('scan-error', {})
               }
            })

            socket.emit('version', version);
            socket.on('app-version', () => {
                socket.broadcast.emit('version', version);
            });

            // Web mode
            socket.emit('web-mode', setting.hideOnWeb);
            socket.on('get-web-mode', () => {
                socket.emit('web-mode', setting.hideOnWeb);
            });
            socket.on('save-web-mode', (mode) => {
                setting.hideOnWeb = typeof mode === 'boolean' ? mode : true;
                saveSetting();
                socket.broadcast.emit('web-mode', setting.hideOnWeb);
                socket.emit('web-mode', setting.hideOnWeb);
            });

            // Auto-organise
            socket.emit('auto-organize', setting.autoOrganise);
            socket.on('get-auto-organize', () => {socket.emit('auto-organize', setting.autoOrganise);});
            socket.on('save-auto-organize', (mode) => {
                setting.autoOrganise = mode;saveSetting();
                socket.broadcast.emit('auto-organize', setting.autoOrganise);
            });

            // Save directory
            socket.emit('save-dir', setting.savefolder);
            socket.on('save-save-dir', (dir) => {
                setting.savefolder = path.resolve(dir);saveSetting();
                socket.broadcast.emit('save-dir', dir);
            });

            // Scan directories
            socket.emit('scan-dir', setting.servepaths);
            socket.on('get-scan-dir', () => {socket.emit('scan-dir', setting.servepaths);});
            socket.on('add-scan-dir', (dir) => {
                if (!setting.servepaths.includes(dir)) {
                    setting.servepaths.push(dir); config.servepaths.push(dir);
                    saveSetting(); saveConfig();
                    socket.broadcast.emit('scan-dir', setting.servepaths);
                }
            });
            socket.on('remove-scan-dir', (dir) => {
                setting.servepaths = setting.servepaths.filter((item) => item !== dir);
                saveSetting(); socket.broadcast.emit('scan-dir', setting.servepaths);
            });

            // Theme
            socket.emit('theme', setting.theme);
            socket.on('get-theme', () => {socket.emit('theme', setting.theme);});
            socket.on('save-theme', (theme) => {
                setting.theme = theme === 'dark' || 'light' ? theme : 'light';
                saveSetting(); socket.broadcast.emit('theme', setting.theme);
            });

            // Accent
            socket.emit('accent', setting.accent);
            socket.on('get-accent', () => {socket.emit('accent', setting.accent);});
            socket.on('save-accent', (accent) => {
                setting.accent = accent === 'primary' || 'color' || 'colored' || 'noen' ? accent : 'primary';
                saveSetting(); win.setIcon(getIcon(setting.accent));socket.broadcast.emit('accent', setting.accent);
            });

            // Full settings
            socket.on('user-setting', () => {socket.emit('setting', setting);});

            socket.on('select-saving-dir', async () =>{
                await win.dialog.selectFolder({}).then(async (dir) =>{
                    setting.savefolder = path.resolve(dir);
                    saveSetting();socket.emit('save-dir', dir)
                })
            })

        })
        //win.show()
    } catch (error) {
        errlog('[APP ROUTE] An error Occur Stack: ', error.stack)
        
    }
})