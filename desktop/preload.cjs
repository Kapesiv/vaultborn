const { contextBridge } = require('electron');

// Expose a minimal API to the renderer so the game knows it's
// running inside the desktop client (not a regular browser).
contextBridge.exposeInMainWorld('desktopClient', {
  isDesktop: true,
  platform: process.platform,
});
