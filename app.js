const os = require('os');
const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const qrcode = require('qrcode');
const express = require('express');
const socket = require('socket.io')
const logger = require('node-logger');
const multer = require('multer')
const { WebView } = require('webview-node')
const { WifiPlus } = require('node-wifi-plus');

// custom modules
const generator = require('./modules/generator')

// Path config
const datapath = path.resolve(process.env.LOCALAPPDATA, 'Xender Lite')
const tempdir = path.resolve(os.tmpdir(), 'Xender Lite')
const logpath = path.resolve(datapath, 'logs')
const chunkpath = path.relative(tempdir, 'chunks')

// Additional config
fs.ensureDir = (dir) =>{if (!fs.existsSync(dir)){fs.mkdirSync(dir); return dir}}
const app = express()

app.use(express.static(path.resolve('static')),express.json())

app.get('/', (req, res, next) =>{
    try {
        res.status(200).sendFile(path.resolve('views', 'local', 'index.html'))
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

const apphttp = http.createServer(app)







apphttp.listen(3000)