'use strict';

const { execFile } = require('child_process');

/**
 * Escape a value for use inside a PowerShell single-quoted string.
 */
function escapePowerShellString(value) {
  return String(value ?? '').replace(/'/g, "''");
}

/**
 * Validate a value against an allowed list.
 */
function normalizeName(value, fallback, allowed) {
  const key = String(value ?? fallback);
  return allowed.includes(key) ? key : fallback;
}

/**
 * Show a native Windows MessageBox.
 *
 * @param {string} message
 * @param {string} title
 * @param {object} options
 * @returns {Promise<string|null>}
 */
function showWindowsMessageDialog(
  message,
  title = 'Xender Lite',
  options = {}
) {
  message = String(message ?? '');
  title = String(title ?? 'Xender Lite');

  const buttonType = normalizeName(
    options.buttons,
    'OK',
    [
      'OK',
      'OKCancel',
      'AbortRetryIgnore',
      'YesNoCancel',
      'YesNo',
      'RetryCancel',
      'CancelTryContinue',
    ]
  );

  const iconType = normalizeName(
    options.icon,
    'Information',
    [
      'None',
      'Hand',
      'Question',
      'Exclamation',
      'Asterisk',
      'Stop',
      'Error',
      'Warning',
      'Information',
    ]
  );

  const defaultButtonType = normalizeName(
    options.defaultButton,
    'Button1',
    [
      'Button1',
      'Button2',
      'Button3',
    ]
  );

  const script = [
    'Add-Type -AssemblyName System.Windows.Forms;',
    '$result = [System.Windows.Forms.MessageBox]::Show(',
    `  '${escapePowerShellString(message)}',`,
    `  '${escapePowerShellString(title)}',`,
    `  [System.Windows.Forms.MessageBoxButtons]::${buttonType},`,
    `  [System.Windows.Forms.MessageBoxIcon]::${iconType},`,
    `  [System.Windows.Forms.MessageBoxDefaultButton]::${defaultButtonType}`,
    ');',
    'Write-Output $result',
  ].join('\n');

  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        script,
      ],
      {
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          reject(error);
          return;
        }

        const result = (stdout || '').trim();

        resolve(result || null);
      }
    );
  });
}

/**
 * Simple information dialog.
 *
 * @returns {Promise<string|null>}
 */
function alert(message, title = 'Xender Lite') {
  return showWindowsMessageDialog(message, title, {
    buttons: 'OK',
    icon: 'Information',
  });
}

/**
 * Information message.
 *
 * @returns {Promise<string|null>}
 */
function info(message, title = 'Xender Lite') {
  return showWindowsMessageDialog(message, title, {
    buttons: 'OK',
    icon: 'Information',
  });
}

/**
 * Warning dialog.
 *
 * @returns {Promise<string|null>}
 */
function warning(message, title = 'Xender Lite') {
  return showWindowsMessageDialog(message, title, {
    buttons: 'OK',
    icon: 'Warning',
  });
}

/**
 * Error dialog.
 *
 * @returns {Promise<string|null>}
 */
function error(message, title = 'Xender Lite') {
  return showWindowsMessageDialog(message, title, {
    buttons: 'OK',
    icon: 'Error',
  });
}

/**
 * Question dialog.
 *
 * @returns {Promise<string|null>}
 */
function question(message, title = 'Xender Lite') {
  return showWindowsMessageDialog(message, title, {
    buttons: 'YesNo',
    icon: 'Question',
  });
}

/**
 * Confirmation dialog.
 *
 * Returns true when the user selects Yes.
 *
 * @returns {Promise<boolean>}
 */
async function confirm(message, title = 'Xender Lite') {
  const result = await showWindowsMessageDialog(
    message,
    title,
    {
      buttons: 'YesNo',
      icon: 'Question',
      defaultButton: 'Button1',
    }
  );

  return result === 'Yes';
}

/**
 * Callback-based message dialog.
 */
function message(messageText, title, callback) {
  showWindowsMessageDialog(
    messageText,
    title,
    {
      buttons: 'OK',
      icon: 'Information',
    }
  )
    .then((result) => {
      if (typeof callback === 'function') {
        callback(result);
      }
    })
    .catch((error) => {
      if (typeof callback === 'function') {
        callback(null, error);
      }
    });
}

/**
 * Callback-based confirmation dialog.
 */
function confirmCallback(messageText, title, callback) {
  showWindowsMessageDialog(
    messageText,
    title,
    {
      buttons: 'YesNo',
      icon: 'Question',
    }
  )
    .then((result) => {
      if (typeof callback === 'function') {
        callback(result === 'Yes');
      }
    })
    .catch((error) => {
      if (typeof callback === 'function') {
        callback(false, error);
      }
    });
}

module.exports = {
  showWindowsMessageDialog,

  // Simple dialogs
  alert,
  info,
  warning,
  error,
  question,
  confirm,

  // Callback versions
  message,
  confirmCallback,
};

module.exports.default = showWindowsMessageDialog;