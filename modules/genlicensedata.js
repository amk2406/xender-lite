const path = require('path');
const fs = require('fs')
const log = console.log
const packagelok = require('../package-lock.json');
const licensemodules = []
const [bin, packagelockjson, ...modules] = fs.readdirSync(path.resolve('node_modules'))
let id = 1

modules.forEach(module =>{
    const licensepath = path.resolve('node_modules', module, 'license')
    const info = {
        id: id,
        group: 'nodejs'
    }
    if (fs.existsSync(licensepath)) {
        id++
        info.name = module; info.path = 'node_modules/'+ module+'/'+ path.parse(licensepath).name;
        if(fs.existsSync(path.resolve('node_modules', module, 'package.json'))){
            info.type = require(path.resolve('node_modules', module, 'package.json')).license || 'MIT'
        }
        licensemodules.push(info)
    } else if (fs.existsSync(licensepath+'.txt')) {
        id++
        info.name = module; info.path = 'node_modules/'+ module+'/'+ path.parse(licensepath+'.txt').name;
        if(fs.existsSync(path.resolve('node_modules', module, 'package.json'))){
            info.type = require(path.resolve('node_modules', module, 'package.json')).license || 'MIT'
        }
        licensemodules.push(info)
    } else if (fs.existsSync(licensepath+'.md')) {
        id++
        info.name = module; info.path = 'node_modules/'+ module+'/'+ path.parse(licensepath+'.md').name;;
        if(fs.existsSync(path.resolve('node_modules', module, 'package.json'))){
            info.type = require(path.resolve('node_modules', module, 'package.json')).license || 'MIT'
        }
        licensemodules.push(info)
    }
})

fs.writeFileSync(path.resolve('modules', 'license.json'), JSON.stringify(licensemodules, null, 2))

module.exports = licensemodules