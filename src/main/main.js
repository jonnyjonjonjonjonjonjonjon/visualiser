const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');

let mainWindow = null;
let isAlwaysOnTop = false;

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

  console.log('IPC handlers set up successfully');
}

/**
 * Clean up resources on app quit
 */
function cleanup() {
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
