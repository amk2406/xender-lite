// ============================================================
//  Xender-lite PWA-style Splash Screen  (single file)
// ============================================================
(function () {
  "use strict";

  // ---------- CONFIG ----------
  const CONFIG = {
    minDisplayTime: 1400,          // minimum time splash is shown (ms)
    fadeDuration: 550,             // fade-out duration (must match CSS)
    defaultTheme: "primary",

    // Logo paths for each theme
    logos: {
      primary:   "icon/logo.png",
      alternate: "icon/logo-color.png",
      light:     "icon/logo-light.png",
      dark:      "icon/logo-dark.png"
    }
  };

  // ---------- INJECT CSS ----------
  const style = document.createElement("style");
  style.textContent = `
    #xender-splash {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: var(--bg);
      transition: opacity ${CONFIG.fadeDuration}ms ease,
                  visibility ${CONFIG.fadeDuration}ms ease;
    }

    #xender-splash.hide {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }

    #xender-splash img {
      width: 220px;
      height: 220px;
      object-fit: contain;
      animation: xenderPulse 1.6s ease-in-out infinite;
    }

    #xender-splash .brand {
      margin-top: 18px;
      color: var(--text, #fff);
      font-family: Inter, system-ui, -apple-system, sans-serif;
      font-size: 15px;
      font-weight: 500;
      letter-spacing: 0.4px;
      opacity: 0.75;
    }

    @keyframes xenderPulse {
      0%, 100% { transform: scale(1);    opacity: 1; }
      50%      { transform: scale(1.07); opacity: 0.82; }
    }

    /* Hide real content until splash finishes */
    body.xender-loading > *:not(#xender-splash) {
      opacity: 0 !important;
      pointer-events: none;
    }

    body.xender-ready > *:not(#xender-splash) {
      opacity: 1;
      transition: opacity 0.45s ease 0.1s;
    }
  `;
  document.head.appendChild(style);

  // ---------- CREATE SPLASH ----------
  function createSplash() {
    const theme = document.documentElement.getAttribute("data-theme") || CONFIG.defaultTheme;
    const logoSrc = CONFIG.logos[theme] || CONFIG.logos.primary;

    const splash = document.createElement("div");
    splash.id = "xender-splash";

    splash.innerHTML = `
      <img src="${logoSrc}" alt="Xender-lite" />
      <div class="brand">Xender-lite</div>
    `;

    document.body.prepend(splash);
    document.body.classList.add("xender-loading");

    return splash;
  }

  // ---------- HIDE SPLASH ----------
  function hideSplash(splash) {
    const start = performance.now();

    function finish() {
      const elapsed = performance.now() - start;
      const wait = Math.max(0, CONFIG.minDisplayTime - elapsed);

      setTimeout(() => {
        splash.classList.add("hide");
        document.body.classList.remove("xender-loading");
        document.body.classList.add("xender-ready");

        // Clean up after animation
        setTimeout(() => {
          splash.remove();
        }, CONFIG.fadeDuration + 40);
      }, wait);
    }

    if (document.readyState === "complete") {
      finish();
    } else {
      window.addEventListener("load", finish);
    }
  }

  // ---------- INIT ----------
  function init() {
    // Make sure body exists
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", init);
      return;
    }

    const splash = createSplash();
    hideSplash(splash);
  }

  // Start
  init();

  // Optional: expose a small helper if you want to change theme later
  window.XenderSplash = {
    setTheme(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      const img = document.querySelector("#xender-splash img");
      if (img && CONFIG.logos[theme]) {
        img.src = CONFIG.logos[theme];
      }
    }
  };
})();