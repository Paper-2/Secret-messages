// Backend bridge - spawns C# backend and handles communication
const { spawn } = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');

const events = new EventEmitter();
let backendProcess = null;
let pendingRequests = new Map();
let requestId = 0;
let isReady = false;
let readyPromise = null;
let resolveReady = null;

function getBackendPath() {
  const isDev = !require('electron').app.isPackaged;
  if (isDev) {
    // Development: use dotnet run or built dll
    return {
      command: 'dotnet',
      args: ['run', '--project', path.join(__dirname, '../backend')]
    };
  } else {
    // Production: use published executable
    const exePath = path.join(process.resourcesPath, 'backend', 'Backend.exe');
    return { command: exePath, args: [] };
  }
}

function start() {
  if (backendProcess) return readyPromise;

  readyPromise = new Promise((resolve) => {
    resolveReady = resolve;
  });

  const { command, args } = getBackendPath();
  console.log(`Starting backend: ${command} ${args.join(' ')}`);

  backendProcess = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false
  });

  let buffer = '';

  backendProcess.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        handleMessage(msg);
      } catch (e) {
        console.error('Failed to parse backend message:', line, e);
      }
    }
  });

  backendProcess.stderr.on('data', (data) => {
    console.error('Backend stderr:', data.toString());
  });

  backendProcess.on('error', (err) => {
    console.error('Backend process error:', err);
  });

  backendProcess.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
    backendProcess = null;
    isReady = false;
  });

  return readyPromise;
}

function handleMessage(msg) {
  // Handle ready signal
  if (msg.type === 'ready') {
    console.log('Backend ready, version:', msg.version);
    isReady = true;
    if (resolveReady) resolveReady();
    return;
  }

  // Handle events from backend
  if (msg.type) {
    events.emit(msg.type, msg);
    return;
  }

  // Handle response to a request
  if (msg.id && pendingRequests.has(msg.id)) {
    const { resolve, reject } = pendingRequests.get(msg.id);
    pendingRequests.delete(msg.id);

    if (msg.success) {
      resolve(msg.data);
    } else {
      reject(new Error(msg.error || 'Unknown error'));
    }
  }
}

async function send(command, data = {}) {
  if (!backendProcess) {
    await start();
  }

  if (!isReady) {
    await readyPromise;
  }

  const id = String(++requestId);
  const request = { id, command, ...data };

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    backendProcess.stdin.write(JSON.stringify(request) + '\n');
  });
}

function stop() {
  if (backendProcess) {
    send('exit').catch(() => {});
    setTimeout(() => {
      if (backendProcess) {
        backendProcess.kill();
        backendProcess = null;
      }
    }, 1000);
  }
}

// P2P API
async function p2pListen(port) {
  return send('p2pListen', { port });
}

async function p2pConnect(host, port) {
  return send('p2pConnect', { host, port });
}

async function p2pSend(peerId, message) {
  return send('p2pSend', { peerId, message });
}

async function p2pBroadcast(message) {
  return send('p2pBroadcast', { message });
}

async function p2pDisconnect(peerId) {
  return send('p2pDisconnect', { peerId });
}

async function p2pPeers() {
  return send('p2pPeers');
}

async function p2pInfo() {
  return send('p2pInfo');
}

async function p2pScan(port) {
  return send('p2pScan', { port });
}

module.exports = {
  start,
  stop,
  send,
  events,
  p2pListen,
  p2pConnect,
  p2pSend,
  p2pBroadcast,
  p2pDisconnect,
  p2pPeers,
  p2pInfo,
  p2pScan
};
