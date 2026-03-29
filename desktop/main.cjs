const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

let mainWindow = null;
let serverProcess = null;

const SERVER_PORT = 3000;
const SERVER_DIR = path.join(__dirname, '..', 'server');
const CLIENT_DIR = path.join(__dirname, '..', 'client', 'dist');

/** Check if a port is in use (i.e. server is already running). */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(400);
    sock.once('connect', () => {
      sock.destroy();
      resolve(true);
    });
    sock.once('error', () => resolve(false));
    sock.once('timeout', () => {
      sock.destroy();
      resolve(false);
    });
    sock.connect(port, '127.0.0.1');
  });
}

/** Wait until the server port is accepting connections. */
async function waitForServer(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortInUse(port)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** Start the game server as a child process. */
function startServer() {
  return new Promise((resolve, reject) => {
    const distMain = path.join(SERVER_DIR, 'dist', 'main.js');

    serverProcess = spawn('node', [distMain], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(SERVER_PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (d) => console.log('[server]', d.toString().trim()));
    serverProcess.stderr.on('data', (d) => console.error('[server]', d.toString().trim()));

    serverProcess.once('error', (err) => {
      console.error('Failed to start server:', err);
      reject(err);
    });

    serverProcess.once('exit', (code) => {
      if (code !== null && code !== 0) {
        console.error(`Server exited with code ${code}`);
      }
      serverProcess = null;
    });

    // Resolve once spawned; caller should waitForServer() separately
    resolve();
  });
}

function killServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'SAAB',
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Remove menu bar for cleaner game experience
  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadURL(`http://127.0.0.1:${SERVER_PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const alreadyRunning = await isPortInUse(SERVER_PORT);

  if (!alreadyRunning) {
    try {
      await startServer();
    } catch (err) {
      dialog.showErrorBox(
        'Server Error',
        `Could not start the game server.\n\n${err.message}\n\nMake sure you have built the project first:\n  npm run build`,
      );
      app.quit();
      return;
    }

    const ready = await waitForServer(SERVER_PORT);
    if (!ready) {
      dialog.showErrorBox(
        'Server Timeout',
        'The game server did not start in time.\nCheck the console for errors.',
      );
      killServer();
      app.quit();
      return;
    }
  } else {
    console.log('Server already running on port', SERVER_PORT);
  }

  createWindow();
});

app.on('window-all-closed', () => {
  killServer();
  app.quit();
});

app.on('before-quit', () => {
  killServer();
});
