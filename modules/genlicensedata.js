const path = require('path');
const fs = require('fs')
const log = console.log
const packagelok = require('../package-lock.json');
const licensemodules = []
const modules = fs.readdirSync(path.resolve('license'))
let id = 1
const xenderliteLicenseInfo = [
    {
        id: id++,
        name: 'Xender Lite',
        group: 'Xender Lite',
        path: 'License.txt'
    },
    {
        id: id++,
        name: 'nodejs',
        group: 'Xender Lite',
        path: 'license/nodejs.txt'
    },
    {
        id: id++,
        name: 'nuget public',
        group: 'Nuget Package',
        path: 'license/nuget-public.txt'
    },
    {
        id: id++,
        name: 'nuget package',
        group: 'Nuget Package',
        path: 'license/nutget-package-mit.txt'
    },
    {
        id: id++,
        name: 'font awesome',
        group: 'Font Awesome',
        path: 'license/font-awesome.txt'
    }
]
licensemodules.push(...xenderliteLicenseInfo)
modules.forEach(module =>{
    if(module === 'license.json') return;
    const result = xenderliteLicenseInfo.find(li =>{
        const path = 'license/'+module
        return path === li.path
    })
    if (result) {
        return
    }
    const info = {
        id: id++,
        group: 'nodejs',
        name: path.parse(path.resolve(module)).name,
        path: 'lincense/'+module
    }
    licensemodules.push(info)
})
fs.writeFileSync(path.resolve('license', 'license.json'), JSON.stringify(licensemodules, null, 2))

module.exports = licensemodules