const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('p2p', {
  host: (port) => ipcRenderer.invoke('p2p:host', { port }),
  connect: (host, port) => ipcRenderer.invoke('p2p:connect', { host, port }),
  broadcast: (message) => ipcRenderer.invoke('p2p:broadcast', { message }),
  send: (peerId, message) => ipcRenderer.invoke('p2p:send', { peerId, message }),
  getPeers: () => ipcRenderer.invoke('p2p:peers'),
  disconnect: () => ipcRenderer.invoke('p2p:disconnect'),
  getInfo: () => ipcRenderer.invoke('p2p:info'),
  scan: (port) => ipcRenderer.invoke('p2p:scan', { port }),
  autoConnect: (peers, port) => ipcRenderer.invoke('p2p:auto-connect', { peers, port }),

  onMessage: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('p2p:message', handler);
    return () => ipcRenderer.removeListener('p2p:message', handler);
  },
  onPeerConnected: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('p2p:peer-connected', handler);
    return () => ipcRenderer.removeListener('p2p:peer-connected', handler);
  },
  onPeerDisconnected: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('p2p:peer-disconnected', handler);
    return () => ipcRenderer.removeListener('p2p:peer-disconnected', handler);
  },
  onAutoHosted: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('p2p:auto-hosted', handler);
    return () => ipcRenderer.removeListener('p2p:auto-hosted', handler);
  },
  onScanning: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('p2p:scanning', handler);
    return () => ipcRenderer.removeListener('p2p:scanning', handler);
  },
  onScanComplete: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('p2p:scan-complete', handler);
    return () => ipcRenderer.removeListener('p2p:scan-complete', handler);
  },
});

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
});
