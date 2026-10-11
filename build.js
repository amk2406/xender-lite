console.log('Importing Modules')
const fs = require('fs-extra');
const path = require('path');
const child_process = require('child_process');
const command = 'pkg . --options no-console'
const savepath = path.resolve('dist', 'Xender Lite')
const copyfolders = [
    path.resolve('static/'),
    path.resolve('views/'),
    path.resolve('res/'),
    path.resolve('license/'),
    path.resolve('bin/'),
    path.resolve('views'),
    path.resolve('build.js'),
    path.resolve('CHANGELOG.md'),
    path.resolve('LICENSE.txt'),
    path.resolve('package.json'),
    path.resolve('README.md'),
]

console.log('Running compilling command', command)
child_process.exec(command, (err, output) =>{
    if (err) {
        console.log('[PKG ERR] fail to compile app error:', err.stack),
        setTimeout(() => {process.exit(1)}, 1200);
    }
    console.log(output, '\n')
    console.log('[PKG] compilling successfull at '+savepath+' dir.\n')
    console.log('copying neccesary file to '+ savepath+'\n')
    copyfolders.forEach(async file =>{
        console.log('copying ', file)
        await fs.copy(file, savepath)
        .then(finsh =>{
            console.log('finish copying', file)
        })
        .catch(err =>{ console.log('fail to copy', file, err.stack) })
            
    })
    console.log('\n compilling finish, closing in 3s')
    process.exit(0)
})