const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow = null;
let isAlwaysOnTop = false;
let proxyServer = null;
let currentProxyUrl = null;
const PROXY_PORT = 9876;

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false,
    resizable: true,
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      // Enable web security but allow audio capture
      webSecurity: true,
      enableRemoteModule: false,
    },
  });

  // Load the renderer - from Vite dev server in development, from built files in production
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173').catch((err) => {
      console.error('Failed to load from Vite dev server:', err);
    });
  } else {
    const indexPath = path.join(__dirname, '../../dist/renderer/index.html');
    mainWindow.loadFile(indexPath).catch((err) => {
      console.error('Failed to load index.html:', err);
    });
  }

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Set up keyboard shortcuts
  setupKeyboardShortcuts();

  // Log window creation
  console.log('Main window created successfully');
}

/**
 * Set up global keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  // F11 or F for fullscreen toggle
  globalShortcut.register('F11', () => {
    if (mainWindow) {
      toggleFullscreen();
    }
  });

  globalShortcut.register('F', () => {
    if (mainWindow && mainWindow.isFocused()) {
      toggleFullscreen();
    }
  });

  // Escape to exit fullscreen
  globalShortcut.register('Escape', () => {
    if (mainWindow && mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
  });

  // T for always-on-top toggle
  globalShortcut.register('T', () => {
    if (mainWindow && mainWindow.isFocused()) {
      toggleAlwaysOnTop();
    }
  });
}

/**
 * Toggle fullscreen mode
 */
function toggleFullscreen() {
  if (!mainWindow) return;

  const isFullScreen = mainWindow.isFullScreen();
  mainWindow.setFullScreen(!isFullScreen);

  // Notify renderer of fullscreen state change
  mainWindow.webContents.send('fullscreen-changed', !isFullScreen);

  // Send resize event after fullscreen transition completes
  setTimeout(() => {
    if (mainWindow) {
      const [width, height] = mainWindow.getContentSize();
      mainWindow.webContents.send('window-resized', { width, height });
    }
  }, 150);
}

/**
 * Toggle always-on-top mode
 */
function toggleAlwaysOnTop() {
  if (!mainWindow) return;

  isAlwaysOnTop = !isAlwaysOnTop;
  mainWindow.setAlwaysOnTop(isAlwaysOnTop);

  // Notify renderer of always-on-top state change
  mainWindow.webContents.send('always-on-top-changed', isAlwaysOnTop);
}

/**
 * Set up IPC handlers
 */
function setupIpcHandlers() {
  // Handle fullscreen toggle request from renderer
  ipcMain.handle('toggle-fullscreen', async () => {
    try {
      if (!mainWindow) {
        throw new Error('Main window not available');
      }
      toggleFullscreen();
      return { success: true, isFullScreen: mainWindow.isFullScreen() };
    } catch (error) {
      console.error('Error toggling fullscreen:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle always-on-top toggle request from renderer
  ipcMain.handle('toggle-always-on-top', async () => {
    try {
      if (!mainWindow) {
        throw new Error('Main window not available');
      }
      toggleAlwaysOnTop();
      return { success: true, isAlwaysOnTop };
    } catch (error) {
      console.error('Error toggling always-on-top:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle audio devices list request from renderer
  ipcMain.handle('get-audio-devices', async () => {
    try {
      if (!mainWindow) {
        throw new Error('Main window not available');
      }

      // Get media devices through the renderer process
      const devices = await mainWindow.webContents.executeJavaScript(`
        (async () => {
          try {
            // Request permission to enumerate devices
            await navigator.mediaDevices.getUserMedia({ audio: true });
            const deviceList = await navigator.mediaDevices.enumerateDevices();
            return deviceList
              .filter(device => device.kind === 'audioinput')
              .map(device => ({
                deviceId: device.deviceId,
                label: device.label || 'Unknown Device',
                kind: device.kind,
                groupId: device.groupId
              }));
          } catch (error) {
            console.error('Error enumerating devices:', error);
            return [];
          }
        })()
      `);

      return { success: true, devices };
    } catch (error) {
      console.error('Error getting audio devices:', error);
      return { success: false, error: error.message, devices: [] };
    }
  });

  // Handle window state queries
  ipcMain.handle('get-window-state', async () => {
    try {
      if (!mainWindow) {
        throw new Error('Main window not available');
      }

      return {
        success: true,
        isFullScreen: mainWindow.isFullScreen(),
        isAlwaysOnTop,
      };
    } catch (error) {
      console.error('Error getting window state:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle window close request
  ipcMain.handle('close-window', async () => {
    try {
      if (mainWindow) {
        mainWindow.close();
      }
      return { success: true };
    } catch (error) {
      console.error('Error closing window:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle window minimize request
  ipcMain.handle('minimize-window', async () => {
    try {
      if (!mainWindow) {
        throw new Error('Main window not available');
      }
      mainWindow.minimize();
      return { success: true };
    } catch (error) {
      console.error('Error minimizing window:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle window maximize/restore request
  ipcMain.handle('maximize-window', async () => {
    try {
      if (!mainWindow) {
        throw new Error('Main window not available');
      }

      if (mainWindow.isMaximized()) {
        mainWindow.restore();
      } else {
        mainWindow.maximize();
      }

      return { success: true, isMaximized: mainWindow.isMaximized() };
    } catch (error) {
      console.error('Error maximizing/restoring window:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle MJPEG proxy start request
  ipcMain.handle('start-mjpeg-proxy', async (event, targetUrl) => {
    try {
      const result = await startMjpegProxy(targetUrl);
      return result;
    } catch (error) {
      console.error('Error starting MJPEG proxy:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle MJPEG proxy stop request
  ipcMain.handle('stop-mjpeg-proxy', async () => {
    try {
      stopMjpegProxy();
      return { success: true };
    } catch (error) {
      console.error('Error stopping MJPEG proxy:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('IPC handlers set up successfully');
}

/**
 * Start MJPEG proxy server
 * Proxies an MJPEG stream through localhost to bypass CORS
 * @param {string} targetUrl - The URL of the MJPEG stream to proxy
 * @returns {Promise<{success: boolean, proxyUrl?: string, error?: string}>}
 */
function startMjpegProxy(targetUrl) {
  return new Promise((resolve) => {
    // Stop existing proxy if running
    if (proxyServer) {
      proxyServer.close();
      proxyServer = null;
    }

    currentProxyUrl = targetUrl;

    proxyServer = http.createServer((req, res) => {
      // Add CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Parse the target URL
      let parsedUrl;
      try {
        parsedUrl = new URL(currentProxyUrl);
      } catch (e) {
        res.writeHead(400);
        res.end('Invalid target URL');
        return;
      }

      // Create request to target
      const proxyReq = http.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 80,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'Accept': '*/*'
        }
      }, (proxyRes) => {
        // Forward headers (especially content-type for MJPEG)
        const headers = {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': proxyRes.headers['content-type'] || 'multipart/x-mixed-replace'
        };

        res.writeHead(proxyRes.statusCode, headers);

        // Pipe the stream
        proxyRes.pipe(res);

        // Handle client disconnect
        res.on('close', () => {
          proxyRes.destroy();
        });
      });

      proxyReq.on('error', (err) => {
        console.error('Proxy request error:', err.message);
        if (!res.headersSent) {
          res.writeHead(502);
          res.end('Proxy error: ' + err.message);
        }
      });

      proxyReq.end();
    });

    proxyServer.on('error', (err) => {
      console.error('Proxy server error:', err);
      resolve({ success: false, error: err.message });
    });

    proxyServer.listen(PROXY_PORT, '127.0.0.1', () => {
      console.log(`MJPEG proxy started on port ${PROXY_PORT} for ${targetUrl}`);
      resolve({
        success: true,
        proxyUrl: `http://127.0.0.1:${PROXY_PORT}/`
      });
    });
  });
}

/**
 * Stop MJPEG proxy server
 */
function stopMjpegProxy() {
  if (proxyServer) {
    proxyServer.close(() => {
      console.log('MJPEG proxy stopped');
    });
    proxyServer = null;
    currentProxyUrl = null;
  }
}

/**
 * Clean up resources on app quit
 */
function cleanup() {
  // Stop proxy server
  stopMjpegProxy();

  // Unregister all shortcuts
  globalShortcut.unregisterAll();
  console.log('Cleaned up global shortcuts');
}

// App event handlers
app.whenReady().then(() => {
  console.log('App is ready, creating window...');
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked and no windows are open
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, apps typically stay active until user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  cleanup();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});
