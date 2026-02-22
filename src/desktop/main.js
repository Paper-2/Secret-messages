const { app, BrowserWindow } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const { registerP2pHandlers, autoHost, scanNetwork, shutdownP2p } = require('./p2p');
const backend = require('./backend');

let mainWindow;

function killAngularServer() {
  // Kill processes on port 4200 (Angular dev server)
  if (process.platform === 'win32') {
    exec('for /f "tokens=5" %a in (\'netstat -ano ^| findstr :4200 ^| findstr LISTENING\') do taskkill /F /PID %a', { shell: 'cmd.exe' });
  } else {
    exec('lsof -ti:4200 | xargs kill -9');
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const isDev = !app.isPackaged;

  if (isDev) {

    mainWindow.loadURL('http://localhost:4200');
    mainWindow.webContents.openDevTools();

  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/dist/renderer/browser/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null; });

  mainWindow.webContents.on('did-finish-load', async () => {
    await autoHost(mainWindow);
    const peers = await scanNetwork(mainWindow);
    mainWindow.webContents.send('p2p:scan-complete', { peers });

  });
}

registerP2pHandlers(() => mainWindow);


app.whenReady().then(async () => {
  await backend.start();
  createWindow();
});

app.on('window-all-closed', () => {
  shutdownP2p();
  backend.stop();
  killAngularServer();

  if (process.platform !== 'darwin') {
    app.quit();

  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
