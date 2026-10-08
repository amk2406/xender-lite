const path = require('path');
let license 
try {
    license = require('./license.json');
} catch (error) {
    license = require('./genlicensedata');
}
const log = console.log
log(path.parse('C:\\Users\\M A COMPUTERS\\Desktop\\Xender Lite\\node_modules\\accepts\\license'))
const getName = (name) =>{
    if (!name || typeof name !== 'string') return null;
    const result = license.find(item => {
        return item.name.toLowerCase() === name.toLowerCase()
    })
    return result
}

const getPath = (name) =>{
    if (!name || typeof name !== 'string') return null;
    const result = license.filter(item => {
        return item.path.toLowerCase() === name.toLowerCase()
    })
    log(result)
}

const getListName = () =>{
    let list = [];
    license.forEach(li =>{
        if(li.name){
            list.push(li.name)
        }
    })
    return list
}

const getAll = () =>{
    return license
}

module.exports = {
    getName,
    getPath,
    getListName,
    getAll
}