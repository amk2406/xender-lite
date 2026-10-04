/**
 * Shared theme & accent helpers for Xender-lite
 */
(function (global) {
  const ACCENTS = {
    primary: { src: '/style/theme.css', icon: '/icon/logo.png' },
    colored: { src: '/style/theme-color.css', icon: '/icon/logo-color.png' },
    neon: { src: '/style/theme-dark.css', icon: '/icon/logo-dark.png' },
  };

  function setTheme(newTheme) {
    document.body.setAttribute('data-theme', newTheme || 'dark');
  }

  function setAccent(accent) {
    const accentTag = document.getElementById('accent');
    if (!accentTag) return;
    const found = ACCENTS[accent] || ACCENTS.primary;
    const iconTag = document.querySelector('link[rel="icon"]');
    if (iconTag) iconTag.href = found.icon;
    if (accentTag.href.indexOf(found.src) === -1) {
      accentTag.href = found.src;
    }
  }

  function wireThemeSocket(socket) {
    if (!socket) return;
    socket.on('theme', setTheme);
    socket.on('accent', setAccent);
  }

  global.setTheme = setTheme;
  global.setAccent = setAccent;
  global.wireThemeSocket = wireThemeSocket;
})(window);
