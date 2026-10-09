const fs = require('fs-extra');
const path = require('path');
const log = console.log

const datapath = path.resolve(process.env.LOCALAPPDATA, 'Xender Lite')
const logpath = path.resolve(datapath, 'logs')
fs.ensureDirSync(logpath)

const getLogFiles = () =>{
    const list = fs.readdirSync(logpath)
    return list
}

const getLogFileList = () =>{
    return getLogFiles()
}

const getLogFileContent = (filename) =>{
    if (!filename || typeof filename !== 'string') return null
    const filepath = path.resolve(logpath, filename)
    log(filepath)
    if (fs.existsSync(filepath)) {
        const filecontent = fs.readFileSync(filepath).toString()
        return filecontent
    } else{
        return null
    }
}
module.exports = {
    getLogFileList,
    getLogFiles,
    getLogFileContent
}