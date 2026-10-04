const { execFile } = require('child_process');
/**
 * selector.js
 *
 * Small Windows-only helper to open native File/Folder selection dialogs
 * from a Node.js process using PowerShell's System.Windows.Forms types.
 *
 * Why use this:
 * - No extra npm dependency required (uses system PowerShell)
 * - Lightweight: useful for CLI or simple desktop tools that run on Windows
 *
 * Caveats:
 * - Requires an interactive desktop session (will not work from services/CI/headless)
 * - Windows-only. For cross-platform GUIs use Electron or a native binding.
 * - If you prefer PowerShell Core use `pwsh` and set `options.ps` accordingly.
 *
 * Exported API:
 * - openFileSelector(options, cb)
 * - openFolderSelector(options, cb)
 * - openFileSelectorAsync(options) -> Promise
 * - openFolderSelectorAsync(options) -> Promise
 *
 * Options (common):
 * - ps: override the powershell executable (default: process.env.POWERSHELL || 'powershell.exe')
 * - initialDir: starting folder string (default: C:\\)
 * - windowsHide: passed to execFile (default: true)
 *
 * openFileSelector-specific options:
 * - filter: PowerShell/OpenFileDialog filter string, e.g. "Text files (*.txt)|*.txt|All files (*.*)|*.*"
 * - multiselect: boolean (default: false)
 */

function openFileSelector(options = {}, cb) {
  const ps = options.ps || process.env.POWERSHELL || 'powershell.exe';
  const filter = (options.filter || 'All files (*.*)|*.*').replace(/'/g, "''");
  const multiselect = options.multiselect ? '$true' : '$false';
  const initial = (options.initialDir || 'C:\\').replace(/'/g, "''");
  const windowsHide = typeof options.windowsHide === 'boolean' ? options.windowsHide : true;

  const script = `Add-Type -AssemblyName System.Windows.Forms
$ofd = New-Object System.Windows.Forms.OpenFileDialog
$ofd.Multiselect = ${multiselect}
$ofd.InitialDirectory = '${initial}'
$ofd.Filter = '${filter}'
if ($ofd.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  if ($ofd.Multiselect) { Write-Output ($ofd.FileNames -join '|') } else { Write-Output $ofd.FileName }
} else { exit 1 }`;

  execFile(ps, ['-STA', '-NoProfile', '-Command', script], { windowsHide }, (err, stdout) => {
    if (err) return cb(err);
    const out = stdout.toString().trim();
    if (!out) return cb(new Error('No selection'));
    const files = out.includes('|') ? out.split('|') : [out];
    cb(null, files);
  });
}

function openFolderSelector(options = {}, cb) {
  const ps = options.ps || process.env.POWERSHELL || 'powershell.exe';
  const initial = (options.initialDir || 'C:\\').replace(/'/g, "''");
  const windowsHide = typeof options.windowsHide === 'boolean' ? options.windowsHide : true;

  const script = `Add-Type -AssemblyName System.Windows.Forms
$fbd = New-Object System.Windows.Forms.FolderBrowserDialog
$fbd.SelectedPath = '${initial}'
if ($fbd.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $fbd.SelectedPath
} else { exit 1 }`;

  execFile(ps, ['-STA', '-NoProfile', '-Command', script], { windowsHide }, (err, stdout) => {
    if (err) return cb(err);
    const dir = stdout.toString().trim();
    if (!dir) return cb(new Error('No selection'));
    cb(null, dir);
  });
}

// Promise wrappers for convenience (async/await)
function openFileSelectorAsync(options = {}) {
  return new Promise((resolve, reject) => {
    openFileSelector(options, (err, files) => {
      if (err) return reject(err);
      resolve(files);
    });
  });
}

function openFolderSelectorAsync(options = {}) {
  return new Promise((resolve, reject) => {
    openFolderSelector(options, (err, dir) => {
      if (err) return reject(err);
      resolve(dir);
    });
  });
}

// Export the functions for use elsewhere in the app
module.exports = {
  openFileSelector,
  openFolderSelector,
  openFileSelectorAsync,
  openFolderSelectorAsync,
};