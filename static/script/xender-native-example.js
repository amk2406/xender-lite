/**
 * Example wiring for a Xender Lite web UI (browser / WebView2).
 * Assumes xender-native.js is loaded first.
 *
 * <script src="/xender-native.js"></script>
 * <script src="/xender-native-example.js"></script>
 */

(async function () {
  const api = window.XenderNative;
  if (!api) {
    console.warn("XenderNative not loaded");
    return;
  }

  const {
    native,
    whenReady,
    isNativeHost,
    onNativeEvent,
    setTransferInProgress, 
    chooseDownloadRoot,
    chooseFilesToSend,
    updateTitleFromTransfers,
    notifyTransferDone,
  } = api;

  const ready = await whenReady(5000);
  console.log("[Xender] native host:", isNativeHost(), "ready:", ready);

  if (!isNativeHost()) {
    // Running in a normal browser — hide native-only buttons, use <input type="file"> etc.
    return;
  }

  // Window chrome defaults
  await native.setMinSize(800, 500);
  await native.setTitle("Xender Lite");

  // --- Events ---
  onNativeEvent("windowResized", function (data) {
    console.log("resized", data);
  });

  onNativeEvent("windowMinimized", function () {
    console.log("minimized");
  });

  onNativeEvent("windowFocused", function () {
    console.log("focused");
  });

  onNativeEvent("appReady", function (data) {
    console.log("appReady", data);
  });

  // windowClosing is handled inside xender-native.js using transfer count.
  // Override if you need custom logic:
  // api.setCloseHandler(async () => {
  //   const r = await native.confirm({ title: "Quit?", message: "Leave now?", danger: true });
  //   return r.ok && r.data.confirmed;
  // });

  // --- Example: wire UI buttons (ids optional) ---
  function $(id) {
    return document.getElementById(id);
  }

  const btnDownloadRoot = $("btn-download-root");
  if (btnDownloadRoot) {
    btnDownloadRoot.addEventListener("click", async function () {
      const r = await chooseDownloadRoot(async function (path) {
        // Persist in YOUR Node settings — host does not save
        await fetch("/api/settings/download-root", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: path }),
        });
      });
      if (r.ok) {
        const el = $("download-root-label");
        if (el) el.textContent = r.data.path;
      }
    });
  }

  const btnSendFiles = $("btn-send-files");
  if (btnSendFiles) {
    btnSendFiles.addEventListener("click", async function () {
      const r = await chooseFilesToSend({
        multiple: true,
        filters: "All files (*.*)|*.*|Images|*.png;*.jpg;*.jpeg;*.gif|Videos|*.mp4;*.mkv",
      });
      if (!r.ok) return; // cancelled

      // Start a transfer (your app logic)
      setTransferInProgress(true);
      await updateTitleFromTransfers();

      try {
        await fetch("/api/transfer/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: r.data.files }),
        });
        await notifyTransferDone();
        await native.showInfo({
          title: "Xender Lite",
          message: "Transfer finished.",
        });
      } catch (err) {
        await native.showError({
          title: "Transfer failed",
          message: String(err && err.message ? err.message : err),
        });
      } finally {
        setTransferInProgress(false);
        await updateTitleFromTransfers();
      }
    });
  }

  const btnReveal = $("btn-reveal");
  if (btnReveal) {
    btnReveal.addEventListener("click", async function () {
      const path = ($("download-root-label") || {}).textContent;
      if (path) await native.revealInExplorer(path);
    });
  }

  const btnClose = $("btn-close");
  if (btnClose) {
    btnClose.addEventListener("click", function () {
      native.close(); // goes through windowClosing handshake
    });
  }
})();
