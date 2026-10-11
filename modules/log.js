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
    if (fs.existsSync(filepath)) {
        const filecontent = fs.readFileSync(filepath).toString()
        return filecontent
    } else{
        return null
    }
}

const deleteLogFile = (filename) =>{
    if (!filename || typeof filename !== 'string') return false
    const filepath = path.resolve(logpath, filename)
    if (fs.existsSync(filepath)) {
        try {
            const filecontent = fs.removeSync(filepath)
            return true
        } catch (error) {
            console.log('[LOG ERR] fail to delet log file', error.message)
            return false
        }
    } else{
        return false
    }
}

const deletAllLogs = () =>{
    const filepath = path.resolve(logpath)
    if (fs.existsSync(filepath)) {
        try {
            const filecontent = fs.removeSync(filepath)
            return true
        } catch (error) {
            console.log('[LOG ERR] fail to delet log file', error.message)
            return false
        }
    } else{
        return false
    }
}
module.exports = {
    getLogFileList,
    getLogFiles,
    getLogFileContent,
    deleteLogFile,
    deletAllLogs
}