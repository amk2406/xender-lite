/**
 * Xender Lite — native host client
 * Works with the PowerShell WebView2 host (window.xenderNative bridge).
 *
 * Usage:
 *   import { native, onNativeEvent, isNativeHost } from './xender-native.js';
 *   // or <script src="xender-native.js"></script> → window.XenderNative
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else if (typeof define === "function" && define.amd) {
    define([], factory);
  } else {
    root.XenderNative = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // -------------------------------------------------------------------------
  // Internal state
  // -------------------------------------------------------------------------
  let transferCount = 0;
  const eventHandlers = new Map(); // eventName -> Set<fn>
  let closeHandler = null;
  let readyPromise = null;
  let readyResolve = null;
  let bridgeAttached = false;

  function ensureReadyDeferred() {
    if (!readyPromise) {
      readyPromise = new Promise(function (resolve) {
        readyResolve = resolve;
      });
    }
    return readyPromise;
  }

  // -------------------------------------------------------------------------
  // Bridge access
  // -------------------------------------------------------------------------
  function getBridge() {
    return typeof window !== "undefined" ? window.xenderNative : null;
  }

  function isNativeHost() {
    const b = getBridge();
    return !!(b && b.__bridge);
  }

  /**
   * Wait until the host has injected the bridge and fired appReady
   * (or timeout). Resolves to true if native is available.
   */
  function whenReady(timeoutMs) {
    timeoutMs = timeoutMs == null ? 8000 : timeoutMs;
    if (isNativeHost() && bridgeAttached) {
      return Promise.resolve(true);
    }
    const p = ensureReadyDeferred();
    return Promise.race([
      p.then(function () {
        return isNativeHost();
      }),
      new Promise(function (resolve) {
        setTimeout(function () {
          resolve(isNativeHost());
        }, timeoutMs);
      }),
    ]);
  }

  function call(method, args) {
    const b = getBridge();
    if (!b || typeof b[method] !== "function") {
      return Promise.resolve({
        ok: false,
        error: "native_unavailable",
      });
    }
    try {
      const result = b[method].apply(b, args || []);
      return Promise.resolve(result);
    } catch (err) {
      return Promise.resolve({
        ok: false,
        error: "exception",
        detail: String(err && err.message ? err.message : err),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Public API (mirrors host methods)
  // -------------------------------------------------------------------------
  const native = {
    // Pickers (paths only — save settings in Node)
    pickDownloadRoot: function () {
      return call("pickDownloadRoot");
    },
    selectFolder: function () {
      return call("selectFolder");
    },
    selectFiles: function (opts) {
      return call("selectFiles", [opts || {}]);
    },
    selectSavePath: function (opts) {
      return call("selectSavePath", [opts || {}]);
    },
    revealInExplorer: function (path) {
      return call("revealInExplorer", [path]);
    },

    // Native dialogs
    showInfo: function (opts) {
      return call("showInfo", [opts || {}]);
    },
    showWarning: function (opts) {
      return call("showWarning", [opts || {}]);
    },
    showError: function (opts) {
      return call("showError", [opts || {}]);
    },
    confirm: function (opts) {
      return call("confirm", [opts || {}]);
    },
    confirmYesNoCancel: function (opts) {
      return call("confirmYesNoCancel", [opts || {}]);
    },

    // Window chrome
    setTitle: function (title) {
      return call("setTitle", [title]);
    },
    setAlwaysOnTop: function (value) {
      return call("setAlwaysOnTop", [!!value]);
    },
    minimize: function () {
      return call("minimize");
    },
    maximize: function () {
      return call("maximize");
    },
    restore: function () {
      return call("restore");
    },
    close: function () {
      return call("close");
    },
    flash: function () {
      return call("flash");
    },
    setSize: function (width, height) {
      return call("setSize", [width, height]);
    },
    getSize: function () {
      return call("getSize");
    },
    setMinSize: function (width, height) {
      return call("setMinSize", [width, height]);
    },
    setMaxSize: function (width, height) {
      return call("setMaxSize", [width, height]);
    },
    setResizable: function (value) {
      return call("setResizable", [!!value]);
    },
    setPosition: function (x, y) {
      return call("setPosition", [x, y]);
    },
    center: function () {
      return call("center");
    },
    getBounds: function () {
      return call("getBounds");
    },
    getAppInfo: function () {
      return call("getAppInfo");
    },

    ackWindowClosing: function (payload) {
      const b = getBridge();
      if (b && typeof b.ackWindowClosing === "function") {
        b.ackWindowClosing(payload || { allow: true });
      }
    },
  };

  // -------------------------------------------------------------------------
  // Transfer tracking (for close confirm)
  // -------------------------------------------------------------------------
  function setTransferInProgress(active) {
    if (active) transferCount += 1;
    else transferCount = Math.max(0, transferCount - 1);
  }

  function hasTransferInProgress() {
    return transferCount > 0;
  }

  function resetTransfers() {
    transferCount = 0;
  }

  /**
   * Optional custom close gate.
   * handler: async () => boolean  (true = allow close)
   * If set, runs instead of the default transfer check.
   */
  function setCloseHandler(handler) {
    closeHandler = typeof handler === "function" ? handler : null;
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------
  function onNativeEvent(eventName, fn) {
    if (typeof fn !== "function") return function () {};
    if (!eventHandlers.has(eventName)) eventHandlers.set(eventName, new Set());
    eventHandlers.get(eventName).add(fn);
    return function off() {
      const set = eventHandlers.get(eventName);
      if (set) set.delete(fn);
    };
  }

  function emitLocal(eventName, data) {
    const set = eventHandlers.get(eventName);
    if (!set) return;
    set.forEach(function (fn) {
      try {
        fn(data);
      } catch (err) {
        console.error("[XenderNative] event handler error:", err);
      }
    });
    const any = eventHandlers.get("*");
    if (any) {
      any.forEach(function (fn) {
        try {
          fn({ event: eventName, data: data });
        } catch (err) {
          console.error("[XenderNative] event handler error:", err);
        }
      });
    }
  }

  async function handleWindowClosing() {
    try {
      let allow = true;

      if (closeHandler) {
        allow = !!(await closeHandler());
      } else if (hasTransferInProgress()) {
        const r = await native.confirm({
          title: "Transfer in progress",
          message:
            "A transfer is still running. Close Xender Lite anyway?\n\nUnfinished transfers will be stopped.",
          danger: true,
        });
        allow = !!(r && r.ok && r.data && r.data.confirmed);
      }

      native.ackWindowClosing({ allow: allow });
    } catch (err) {
      console.error("[XenderNative] windowClosing handler failed:", err);
      // Fail open so the window is not stuck
      native.ackWindowClosing({ allow: true });
    }
  }

  function onHostMessage(msg) {
    if (!msg || !msg.event) return;

    if (msg.event === "appReady") {
      bridgeAttached = true;
      if (readyResolve) {
        readyResolve(true);
        readyResolve = null;
      }
    }

    if (msg.event === "windowClosing") {
      handleWindowClosing();
    }

    emitLocal(msg.event, msg.data);
  }

  function attachToBridge() {
    const b = getBridge();
    if (b) {
      b.onEvent = onHostMessage;
      bridgeAttached = true;
    }

    if (typeof window !== "undefined") {
      window.addEventListener("xender-event", function (e) {
        const detail = e && e.detail;
        if (detail) onHostMessage(detail);
      });
    }
  }

  // -------------------------------------------------------------------------
  // Helpers for common UI flows
  // -------------------------------------------------------------------------

  /**
   * Pick download root and optionally persist via your callback.
   * saveFn(path) should write to Node/settings — host does not save.
   */
  async function chooseDownloadRoot(saveFn) {
    const r = await native.pickDownloadRoot();
    if (!r.ok) return r;
    if (typeof saveFn === "function") {
      try {
        await saveFn(r.data.path);
      } catch (err) {
        return { ok: false, error: "save_failed", detail: String(err) };
      }
    }
    return r;
  }

  async function chooseFilesToSend(opts) {
    return native.selectFiles(
      opts || {
        multiple: true,
        filters: "All files (*.*)|*.*",
      }
    );
  }

  async function updateTitleFromTransfers() {
    if (!hasTransferInProgress()) {
      await native.setTitle("Xender Lite");
      return;
    }
    const n = transferCount;
    const label = n === 1 ? "1 transfer" : n + " transfers";
    await native.setTitle("Xender Lite — " + label);
  }

  async function notifyTransferDone() {
    await native.flash();
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  ensureReadyDeferred();
  if (typeof window !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", attachToBridge);
    } else {
      attachToBridge();
    }
    // Host may inject bridge slightly later
    setTimeout(attachToBridge, 0);
    setTimeout(attachToBridge, 200);
    setTimeout(attachToBridge, 1000);
  }

  return {
    native: native,
    isNativeHost: isNativeHost,
    whenReady: whenReady,
    onNativeEvent: onNativeEvent,

    setTransferInProgress: setTransferInProgress,
    hasTransferInProgress: hasTransferInProgress,
    resetTransfers: resetTransfers,
    setCloseHandler: setCloseHandler,

    chooseDownloadRoot: chooseDownloadRoot,
    chooseFilesToSend: chooseFilesToSend,
    updateTitleFromTransfers: updateTitleFromTransfers,
    notifyTransferDone: notifyTransferDone,
  };
});
