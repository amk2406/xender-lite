const os = require('os');
const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const qrcode = require('qrcode');
const chalk = require('chalk');
const express = require('express');
const { Socket, Server } = require('socket.io')
const logger = require('node-logger');
const multer = require('multer')
const { WebView } = require('webview-node')
const webviewapp = require('webview-node').app
const { WifiPlus, } = require('node-wifi-plus');

// custom modules
const generator = require('./modules/generator')
const network = require('./modules/networkinfo')
const util = require('./modules/utility')

// Path config
const datapath = path.resolve(process.env.LOCALAPPDATA, 'Xender Lite')
const tempdir = path.resolve(os.tmpdir(), 'Xender Lite')
const logpath = path.resolve(datapath, 'logs')
const chunkpath = path.relative(tempdir, 'chunks')
const configpath = path.resolve(datapath, 'config.json')
const settingpath = path.resolve(datapath, 'setting.json')
const webviewdata = path.resolve(datapath, 'Webview Data')

// Additional helper
fs.ensureDir = (dir) =>{ if (!fs.existsSync(dir)){fs.mkdirSync(dir); return dir}}
fs.ensureFile = (filepath, content = '') =>{fs.ensureDir(path.dirname(filepath));fs.writeFileSync(filepath, content)}

// Little helpers
const log = console.log
const err = console.error

// Module config
const wifi = new WifiPlus({
    autoReconnect: true,
    watchInterval: 1300,
})
const win = new WebView({
  title: 'Xender Lite',
  width: 1200,
  height: 700,
  minWidth: 500,
  windowsHide: false,
  icon: './res/icon.ico',
  devTools: false,
  backgroundColor: '#e71111',
  userDataFolder: webviewdata
});

// App config
let setting = settingdata(settingpath)
let config = configdata(configpath)

function settingdata(filepath = settingpath) {
   const layout = {
        theme: "light", accent: "primary",
        hideOnWeb: false, autoOganise: true,
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
            layout.autoOganise = typeof sett.autoOganise === 'boolean' ? sett.autoOganise : layout.autoOganise
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
        err('[SAVE ERR] fail to save setting data', err.message)
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
        err('[SAVE ERR] fail to save config data', err.message)
    }
}

const app = express()
const lanapp = express()

//log( >= 4)

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

app.use((err, req, res, next) =>{
    if (err) {
        err('[APP ROUTE] An error from App route ', err)
    } else{

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
        win.loadUrl('http://localhost:'+port)
        win.setMinSize(550, 300);

        let ipaddress = network.getLocalIP()
        let isontranfer = false
        let isinwifi = false
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
        wifi.on('networkChange', () =>{
            //ipaddress = network.getLocalIP()
        })
        
        const getQrcode = (string = `http://${lanhttp.address().address}:${lanhttp.address().port}`) => {
            return qrcode.toDataURL(string).then(link => { return link;
            }).catch(err => {
                err('[QRCODE] Fail to create qrcode for link ', err.message);return 'about:blank'
            })
        }

        const startLanapp = (ip, socket) =>{if (!islanconnect) {log(lanhttp.listening)}}
        const closelanapp = async () =>{
            try {
                await lanhttp.close()
                isontranfer = false
            } catch (er) {
                err('[LAN APP] err, fail to close lan http', er.message)
            }
        }

        appsocket.on('connection', (socket) =>{

            socket.onAny((event, ...args) =>{
                console.log(`Event fron id: ${socket.id},
                With event name of: ${event},
                And argument of: ${args}`)
            })

            if (lanhttp.listening) {
                const qr = getQrcode(`http://${lanhttp.address().address}:${lanhttp.address().port}`)
                const lanlink = `http://${lanhttp.address().address}:${lanhttp.address().port}`
                socket.emit('web-server-started', { link: lanlink, qr: qr })
                socket.emit('qrcode', {qr: qr})
                socket.emit('lan-link', lanlink)
            }
            socket.on('stop-web-server',  async () =>{
                if(lanhttp.listening && isontranfer) {
                    await win.dialog.confirm('There is A current Transfer, are you sure you Want to close it',
                        'Xender Lite').then( async (result)=> {
                        if (result === true) {
                            await closelanapp().then(() =>{
                                socket.emit('web-server-stopped', true)
                            })
                        }
                    })
                }
            });
        })
        //win.show()
    } catch (error) { err('[APP ROUTE] An error Occur Stack: ', error.stack)}
})