const os = require('os');
const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const qrcode = require('qrcode');
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
fs.ensureFile = (filepath) =>{fs.ensureDir(path.dirname(filepath));fs.writeFileSync(filepath, '')}

// Little helpers
const log = console.log

// Module configuration
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

//win.show()
const app = express()
const lanapp = express()

app.use(express.static(path.resolve('static')),express.json())

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



const apphttp = http.createServer(app)
const appsocket = new Server(apphttp, {cors: { methods: ['GET', 'POST']}})






const port = 3000

apphttp.listen(port, (err)=>{
    if (err) {
        if (err.code === 'EADDRINUSE') {
            log('[APP HTTP] Error starting local app http ', err.message)
            setTimeout(() => {
                process.exit(1)
            }, 650);
        }
        log('[APP HTTP] Error starting local app http ', err.message)
    }

    log('[APP HTTP] App start successfully on port ', port)
    win._options.url = 'http://localhost:'+port
    //win.show()

    let ipaddress = network.getLocalIP()
    
    appsocket.on('connection', (socket) =>{
        socket.onAny((event, ...args) =>{
            console.log(`Event fron id: ${socket.id},
            With event name of: ${event},
            And argument of: ${args}`)
        })
    })
})