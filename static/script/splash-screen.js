// ============================================================
//  Xender-lite PWA-style Splash Screen  (single file)
// ============================================================
(function () {
  "use strict";

  const CONFIG = {
    minDisplayTime: 1400,
    fadeDuration: 550,
    defaultTheme: "primary",
    logos: {
      primary:   "icon/logo.png",
      colored:   "icon/logo-color.png",
      neon:      "icon/logo-dark.png",
      alternate: "icon/logo-color.png",
      light:     "icon/logo-light.png",
      dark:      "icon/logo-dark.png"
    }
  };

  const SESSION_KEY = "xender-splash-shown";

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
      background: var(--bg, #000);
      transition: opacity ${CONFIG.fadeDuration}ms ease,
                  visibility ${CONFIG.fadeDuration}ms ease;
    }

    #xender-splash.hide {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }

    #xender-splash img {
      width: 200px;
      height: 200px;
      object-fit: contain;
      animation: xenderPulse 1.6s ease-in-out infinite;
      filter: drop-shadow(0 0 24px color-mix(in srgb, var(--accent, #0A84FF) 40%, transparent));
      transition: opacity 0.35s ease, transform 0.35s ease;
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

  function getAccentLogo() {
    const accentTag = document.getElementById("accent") || document.getElementById("accent-tag");
    let accent = "primary";
    if (accentTag && accentTag.href) {
      if (accentTag.href.includes("theme-color")) accent = "colored";
      else if (accentTag.href.includes("theme-dark")) accent = "neon";
    }
    return CONFIG.logos[accent] || CONFIG.logos.primary;
  }

  function createSplash() {
    const logoSrc = getAccentLogo();
    const splash = document.createElement("div");
    splash.id = "xender-splash";
    splash.innerHTML = `
      <img src="${logoSrc}" alt="Xender-lite" id="xender-splash-logo" />
      <div class="brand">Xender-lite</div>
    `;
    document.body.prepend(splash);
    document.body.classList.add("xender-loading");
    return splash;
  }

  function updateSplashLogo(accent) {
    const img = document.getElementById("xender-splash-logo");
    if (!img) return;
    const src = CONFIG.logos[accent] || CONFIG.logos.primary;
    if (img.src.indexOf(src) === -1) {
      img.style.opacity = "0";
      img.style.transform = "scale(0.92)";
      setTimeout(() => {
        img.src = src;
        img.style.opacity = "1";
        img.style.transform = "scale(1)";
      }, 180);
    }
  }

  function hideSplash(splash) {
    const start = performance.now();
    function finish() {
      const elapsed = performance.now() - start;
      const wait = Math.max(0, CONFIG.minDisplayTime - elapsed);
      setTimeout(() => {
        splash.classList.add("hide");
        document.body.classList.remove("xender-loading");
        document.body.classList.add("xender-ready");
        try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (_) {}
        setTimeout(() => splash.remove(), CONFIG.fadeDuration + 40);
      }, wait);
    }
    if (document.readyState === "complete") finish();
    else window.addEventListener("load", finish);
  }

  function init() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", init);
      return;
    }

    // Skip splash if already shown this session
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") {
        document.body.classList.add("xender-ready");
        return;
      }
    } catch (_) {}

    const splash = createSplash();
    hideSplash(splash);

    // Accent listener – update logo while splash is visible
    window.addEventListener("xender-accent", (e) => {
      if (e.detail && e.detail.accent) updateSplashLogo(e.detail.accent);
    });
  }

  init();

  window.XenderSplash = {
    setTheme(theme) {
      document.documentElement.setAttribute("data-theme", theme);
    },
    setAccent(accent) {
      updateSplashLogo(accent);
    },
    resetSession() {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
    }
  };
})();
