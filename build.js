console.log('Importing Modules')
const fs = require('fs-extra');
const path = require('path');
const child_process = require('child_process');
const command = 'pkg . --fallback-to-source'
const savepath = path.resolve('dist', 'Xender Lite')

const copyfolders = [
    'static/',
    'views/',
    'res/',
    'license/',
    'bin/',
    'CHANGELOG.md',
    'LICENSE.txt',
    'package.json',
    'README.md',
]

console.log('Running compilling command', command)
child_process.exec(command, (err, output) =>{
    if (err) {
        console.log('[PKG ERR] fail to compile app error:', err)
        setTimeout(() => {process.exit(1)}, 1200);
        return
    }
    console.log(output, '\n')
    console.log('[PKG] Compilling successfull at '+savepath+' dir.\n')
    console.log('[COPY] Copying neccesary file to '+ savepath+'\n')
    copyfolders.forEach(async file =>{
        fs.ensureDirSync(savepath)
        try {
            console.log('[COPY] Copying ', file, 'to', path.normalize(savepath)+file)
            await fs.copy(path.resolve(file), path.resolve(savepath, file))
            console.log('[COPY]', file, 'copyied to', path.resolve(savepath, file))
        } catch (error) {
            console.error('[COPY ERR] fail to copy', file, 'MSG:', error.message)
        }
            
    })
    console.log('\nCompilling finish, closing in 3s')
    setTimeout(() => {
        process.exit(0)
    }, 3000);
})