/**
 * Modern Toast Notification (Updated)
 * 
 * Simple usage:
 *   Toast.success('Saved successfully')
 *   Toast.error('Something went wrong', 4000)   // 4 seconds
 *   Toast.warning('Check your input', 5000)
 *   Toast.info('New update available')
 *
 * Full options still supported:
 *   Toast.error('Failed', { duration: 5000, position: 'bottom-center' })
 */

(function (window) {
  'use strict';

  // ====================== DEFAULTS ======================
  const DEFAULTS = {
    duration: 3500,
    position: 'bottom-right', // top-right | top-left | top-center | bottom-right | bottom-left | bottom-center
    showProgress: true,
    maxToasts: 6,
    pauseOnHover: true,
  };

  // ====================== STYLES ======================
  const STYLES = `
    .toast-container {
      position: fixed;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: none;
      padding: 16px;
      max-width: 100%;
    }

    .toast-container.top-right { top: 0; right: 0; align-items: flex-end; }
    .toast-container.top-left { top: 0; left: 0; align-items: flex-start; }
    .toast-container.top-center { top: 0; left: 50%; transform: translateX(-50%); align-items: center; }
    .toast-container.bottom-right { bottom: 0; right: 0; align-items: flex-end; }
    .toast-container.bottom-left { bottom: 0; left: 0; align-items: flex-start; }
    .toast-container.bottom-center { bottom: 0; left: 50%; transform: translateX(-50%); align-items: center; }

    .toast {
      pointer-events: auto;
      min-width: 280px;
      max-width: 420px;
      width: max-content;
      background: var(--toast-bg);
      color: var(--toast-text);
      border-radius: 12px;
      box-shadow: var(--toast-shadow);
      border: 1px solid var(--toast-border);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: toast-in 0.35s cubic-bezier(0.21, 1.02, 0.73, 1) forwards;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.45;
    }

    .toast.hide {
      animation: toast-out 0.28s ease forwards;
    }

    .toast-content {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
    }

    .toast-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      margin-top: 1px;
    }

    .toast-message {
      flex: 1;
      padding-right: 8px;
      word-break: break-word;
    }

    .toast-close {
      background: none;
      border: none;
      color: var(--toast-text);
      opacity: 0.5;
      cursor: pointer;
      padding: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: opacity 0.2s, background 0.2s;
      flex-shrink: 0;
    }

    .toast-close:hover {
      opacity: 1;
      background: var(--toast-close-hover);
    }

    .toast-progress {
      height: 3px;
      width: 100%;
      transform-origin: left;
      background: var(--toast-accent);
    }

    .toast-progress.running {
      animation: toast-progress linear forwards;
    }

    /* Types */
    .toast.success { --toast-accent: #22c55e; }
    .toast.error   { --toast-accent: #ef4444; }
    .toast.warning { --toast-accent: #f59e0b; }
    .toast.info    { --toast-accent: #3b82f6; }

    .toast .toast-icon { color: var(--toast-accent); }

    /* Light Theme */
    :root, [data-theme="light"] {
      --toast-bg: #ffffff;
      --toast-text: #1f2937;
      --toast-border: #e5e7eb;
      --toast-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.05);
      --toast-close-hover: #f3f4f6;
    }

    /* Dark Theme */
    [data-theme="dark"] {
      --toast-bg: #1f2937;
      --toast-text: #f3f4f6;
      --toast-border: #374151;
      --toast-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -4px rgb(0 0 0 / 0.3);
      --toast-close-hover: #374151;
    }

    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        --toast-bg: #1f2937;
        --toast-text: #f3f4f6;
        --toast-border: #374151;
        --toast-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -4px rgb(0 0 0 / 0.3);
        --toast-close-hover: #374151;
      }
    }

    /* Animations */
    @keyframes toast-in {
      from { opacity: 0; transform: translateY(-18px) scale(0.96); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes toast-out {
      to { opacity: 0; transform: translateY(-12px) scale(0.96); }
    }

    @keyframes toast-progress {
      from { transform: scaleX(1); }
      to   { transform: scaleX(0); }
    }

    /* Mobile */
    @media (max-width: 480px) {
      .toast-container {
        padding: 12px;
        left: 0 !important;
        right: 0 !important;
        transform: none !important;
        align-items: stretch !important;
      }
      .toast {
        min-width: 0;
        max-width: 100%;
        width: 100%;
      }
    }
  `;

  // ====================== ICONS ======================
  const ICONS = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  };

  // ====================== CORE ======================
  let styleInjected = false;
  const containers = {};

  function injectStyles() {
    if (styleInjected) return;
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
    styleInjected = true;
  }

  function getContainer(position) {
    if (containers[position]) return containers[position];

    const el = document.createElement('div');
    el.className = `toast-container ${position}`;
    document.body.appendChild(el);
    containers[position] = el;
    return el;
  }

  function normalizeOptions(secondArg) {
    // Allow: Toast.error('msg', 4000)
    if (typeof secondArg === 'number') {
      return { duration: secondArg };
    }
    // Allow: Toast.error('msg', { duration: 4000, position: '...' })
    if (secondArg && typeof secondArg === 'object') {
      return secondArg;
    }
    return {};
  }

  function createToast(message, secondArg, forceType) {
    injectStyles();

    const userOptions = normalizeOptions(secondArg);
    const config = { ...DEFAULTS, ...userOptions };

    if (forceType) config.type = forceType;

    const type = config.type || 'info';
    const container = getContainer(config.position);

    // Limit max toasts
    while (container.children.length >= config.maxToasts) {
      const first = container.firstChild;
      if (first) first.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-icon">${ICONS[type] || ICONS.info}</div>
        <div class="toast-message">${message}</div>
        <button class="toast-close" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      ${config.showProgress && config.duration > 0 ? `<div class="toast-progress"></div>` : ''}
    `;

    container.appendChild(toast);

    const progressBar = toast.querySelector('.toast-progress');
    let remaining = config.duration;
    let startTime = Date.now();
    let timer = null;
    let paused = false;

    function hide() {
      toast.classList.add('hide');
      clearTimeout(timer);
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, 280);
    }

    function startTimer() {
      if (config.duration <= 0) return;

      if (progressBar) {
        progressBar.style.animationDuration = remaining + 'ms';
        progressBar.classList.add('running');
        progressBar.style.animationPlayState = 'running';
      }

      timer = setTimeout(hide, remaining);
    }

    // Close button
    toast.querySelector('.toast-close').addEventListener('click', hide);

    // Pause on hover
    if (config.pauseOnHover && config.duration > 0) {
      toast.addEventListener('mouseenter', () => {
        if (paused) return;
        paused = true;
        clearTimeout(timer);
        remaining -= (Date.now() - startTime);
        if (remaining < 0) remaining = 0;
        if (progressBar) progressBar.style.animationPlayState = 'paused';
      });

      toast.addEventListener('mouseleave', () => {
        if (!paused) return;
        paused = false;
        startTime = Date.now();
        startTimer();
      });
    }

    startTimer();

    return { hide, el: toast };
  }

  // ====================== PUBLIC API ======================
  const Toast = {
    show(message, secondArg) {
      return createToast(message, secondArg);
    },
    success(message, secondArg) {
      return createToast(message, secondArg, 'success');
    },
    error(message, secondArg) {
      return createToast(message, secondArg, 'error');
    },
    warning(message, secondArg) {
      return createToast(message, secondArg, 'warning');
    },
    info(message, secondArg) {
      return createToast(message, secondArg, 'info');
    },

    // Change global defaults
    config(newConfig) {
      Object.assign(DEFAULTS, newConfig);
    }
  };

  window.Toast = Toast;

})(window);