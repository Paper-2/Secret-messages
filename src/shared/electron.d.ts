export {};

interface P2pMessageData {
  user: string;
  text: string;
  time: string;
}

interface P2pPeerData {
  peerId: string;
}

interface P2pAutoHostedData {
  port: number;
}

interface P2pScanCompleteData {
  peers: string[];
}

interface P2pApi {
  host: (port: number) => Promise<{ success: boolean; port: number }>;
  connect: (host: string, port: number) => Promise<{ success: boolean; peerId?: string }>;
  broadcast: (message: unknown) => Promise<{ success: boolean }>;
  send: (peerId: string, message: string) => Promise<{ success: boolean }>;
  getPeers: () => Promise<string[]>;
  disconnect: () => Promise<void>;
  getInfo: () => Promise<{
    addresses: { name: string; address: string }[];
    hosting: boolean;
    port: number | null;
    peerCount: number;
  }>;
  scan: (port: number) => Promise<{ peers: string[] }>;
  autoConnect: (peers: string[], port: number) => Promise<{ results: { success: boolean }[] }>;

  onMessage: (callback: (data: P2pMessageData) => void) => () => void;
  onPeerConnected: (callback: (data: P2pPeerData) => void) => () => void;
  onPeerDisconnected: (callback: (data: P2pPeerData) => void) => () => void;
  onAutoHosted: (callback: (data: P2pAutoHostedData) => void) => () => void;
  onScanning: (callback: (data: unknown) => void) => () => void;
  onScanComplete: (callback: (data: P2pScanCompleteData) => void) => () => void;
}

interface ElectronApi {
  isElectron: boolean;
  platform: string;
}

declare global {
  interface Window {
    p2p?: P2pApi;
    electronAPI?: ElectronApi;
  }
}
