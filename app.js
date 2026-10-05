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
const { WifiPlus } = require('node-wifi-plus');

// custom modules
const generator = require('./modules/generator')

// Path config
const datapath = path.resolve(process.env.LOCALAPPDATA, 'Xender Lite')
const tempdir = path.resolve(os.tmpdir(), 'Xender Lite')
const logpath = path.resolve(datapath, 'logs')
const chunkpath = path.relative(tempdir, 'chunks')
const configpath = path.resolve(datapath, 'config.json')
const settingpath = path.resolve(datapath, 'setting.json')

// Additional helper
fs.ensureDir = (dir) =>{ if (!fs.existsSync(dir)){fs.mkdirSync(dir); return dir}}
fs.ensureFile = (filepath) =>{fs.ensureDir(path.dirname(filepath));fs.writeFileSync(filepath, '')}

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









apphttp.listen(3000, ()=>{
    console.log('server start')
})