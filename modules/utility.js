function getFileCategory(filename) {
    const ext = path.extname(filename).toLowerCase().slice(1);
    const map = {
        image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tif', 'tiff', 'heic', 'heif', 'avif', 'raw', 'cr2', 'nef', 'dng', 'orf', 'arw', 'jfif', 'psd'],
        video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'],
        audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'],
        pdf: ['pdf'],
        text: ['txt', 'md', 'markdown', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'xml', 'json', 'yaml', 'yml', 'log', 'rst', 'rtf', 'tsv', 'env'],
        document: ['doc', 'docx', 'odt', 'pages', 'epub', 'mobi', 'azw', 'azw3', 'tex', 'latex', 'odp', 'xls', 'xlsx', 'ods', 'xlsm', 'xlsb', 'ppt', 'pptx', 'pps', 'ppsx'],
        archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'tbz2', 'lz', 'lzma', 'zst', 'cab', 'iso']
    };

    for (const [category, exts] of Object.entries(map)) {
        if (exts.includes(ext)) return category;
    }
    return 'others';
}
function getUniqueFilePath(dir, originalName) {
    const ext = path.extname(originalName);
    const base = path.basename(originalName, ext);
    let finalName = originalName;
    let counter = 1;
    let fullPath = path.join(dir, finalName);

    while (fs.existsSync(fullPath)) {
        finalName = `${base}-${counter}${ext}`;
        fullPath = path.join(dir, finalName);
        counter++;
    }
    return { fullPath, finalName };
}
function getFreeDiskSpaceMb(dirPath = process.cwd()) {
    try {
        const stats = fs.statfsSync(dirPath);
        const bytesFree = Number(stats.bavail) * Number(stats.bsize);
        return bytesFree / (1024 * 1024);
    } catch {
        try {
            const drive = path.parse(dirPath).root || 'C:\\';
            const out = child_process.execSync(
                `wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace /value`,
                { encoding: 'utf8' }
            );
            const match = out.match(/FreeSpace=(\d+)/);
            return match ? Number(match[1]) / (1024 * 1024) : 1024;
        } catch {
            return 1024;
        }
    }
}
function generateMaxWait() {
    const totalRamMb = Math.max(1, os.totalmem() / 1024 / 1024);
    const freeRamMb = Math.max(0, os.freemem() / 1024 / 1024);
    const freeDiskMb = Math.max(0, getFreeDiskSpaceMb());

    let maxWait = 500;
    const ramRatio = freeRamMb / totalRamMb;

    if (ramRatio > 0.35) maxWait += 70;
    if (ramRatio > 0.60) maxWait += 150;
    if (ramRatio > 0.80) maxWait += 280;
    if (freeDiskMb > 2 * 1024) maxWait += 70;
    if (freeDiskMb > 10 * 1024) maxWait += 150;
    if (freeDiskMb > 50 * 1024) maxWait += 300;

    return Math.max(500, Math.min(maxWait, 5000));
}
module.exports = {
    getFileCategory,
    getUniqueFilePath,
    getFreeDiskSpaceMb,
    generateMaxWait
}