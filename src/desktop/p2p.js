// P2P module - forwards all networking to C# backend via backend bridge
const { ipcMain } = require('electron');
const backend = require('./backend');

const DEFAULT_PORT = 9000;


function registerP2pHandlers(getMainWindow) {

  backend.events.on('p2p:peer-connected', (data) => {
    getMainWindow()?.webContents.send('p2p:peer-connected', data);
  });

  backend.events.on('p2p:peer-disconnected', (data) => {
    getMainWindow()?.webContents.send('p2p:peer-disconnected', data);
  });

  backend.events.on('p2p:message', (data) => {
    getMainWindow()?.webContents.send('p2p:message', data);
  });


  ipcMain.handle('p2p:host', async (event, { port }) => {
    return backend.p2pListen(port || DEFAULT_PORT);
  });

  ipcMain.handle('p2p:connect', async (event, { host, port }) => {
    return backend.p2pConnect(host, port || DEFAULT_PORT);
  });

  ipcMain.handle('p2p:broadcast', async (event, { message }) => {
    return backend.p2pBroadcast(JSON.stringify(message));
  });

  ipcMain.handle('p2p:send', async (event, { peerId, message }) => {
    return backend.p2pSend(peerId, JSON.stringify(message));
  });

  ipcMain.handle('p2p:peers', async () => {
    return backend.p2pPeers();
  });

  ipcMain.handle('p2p:disconnect', async (event, { peerId } = {}) => {
    return backend.p2pDisconnect(peerId);
  });

  ipcMain.handle('p2p:scan', async (event, { port }) => {
    return backend.p2pScan(port || DEFAULT_PORT);
  });


  ipcMain.handle('p2p:auto-connect', async (event, { peers, port }) => {
    const connectPort = port || DEFAULT_PORT;
    const results = [];
    for (const ip of peers) {
      try {
        await backend.p2pConnect(ip, connectPort);
        results.push({ ip, success: true });
      } catch (err) {
        results.push({ ip, success: false, error: err.message });
      }
    }
    return { results };
  });



  ipcMain.handle('p2p:info', async () => {
    return backend.p2pInfo();
  });
}



async function autoHost(mainWindow) {
  try {
    const result = await backend.p2pListen(DEFAULT_PORT);
    mainWindow?.webContents.send('p2p:auto-hosted', { port: DEFAULT_PORT });
    return { success: true, port: DEFAULT_PORT };
  } catch (err) {
    return { success: false, error: err.message };
  }
}



async function scanNetwork(mainWindow, port = DEFAULT_PORT) {
  mainWindow?.webContents.send('p2p:scanning', { status: 'started' });
  const result = await backend.p2pScan(port);
  return result.peers || [];
}

function shutdownP2p() {
  backend.p2pDisconnect().catch(() => {});
}

module.exports = { registerP2pHandlers, autoHost, scanNetwork, shutdownP2p };
