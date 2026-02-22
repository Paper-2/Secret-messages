import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Message {
  user: string;
  text: string;
  time: Date;
  isSystem?: boolean;
}

interface NetworkInfo {
  addresses: { name: string; address: string }[];
  hosting: boolean;
  port: number | null;
  peerCount: number;
}

@Component({
  selector: 'app-chat',
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class Chat implements OnInit, OnDestroy {
  private readonly messagesSignal = signal<Message[]>([]);
  protected readonly messages = this.messagesSignal;
  protected readonly input = signal('');
  protected readonly userName = signal('Anonymous');
  protected readonly isElectron = signal(false);
  protected readonly networkInfo = signal<NetworkInfo | null>(null);
  protected readonly peers = signal<string[]>([]);
  protected readonly discoveredPeers = signal<string[]>([]);
  protected readonly hostPort = signal(9000);
  protected readonly connectHost = signal('');
  protected readonly connectPort = signal(9000);
  protected readonly isConnecting = signal(false);
  protected readonly isHosting = signal(false);
  protected readonly isScanning = signal(false);
  protected readonly manualIp = signal('');

  private cleanupFns: (() => void)[] = [];

  ngOnInit() {
    this.isElectron.set(!!window.electronAPI?.isElectron);

    if (window.p2p) {
      // Set up P2P event listeners
      const unsubMessage = window.p2p.onMessage((data) => {
        const msg: Message = {
          user: data.user,
          text: data.text,
          time: new Date(data.time),
        };
        this.messagesSignal.update(msgs => [...msgs, msg]);
      });
      this.cleanupFns.push(unsubMessage);

      const unsubConnected = window.p2p.onPeerConnected((data) => {
        this.addSystemMessage(`Peer connected: ${data.peerId}`);
        this.refreshPeers();
        this.refreshInfo();
      });
      this.cleanupFns.push(unsubConnected);

      const unsubDisconnected = window.p2p.onPeerDisconnected((data) => {
        this.addSystemMessage(`Peer disconnected: ${data.peerId}`);
        this.refreshPeers();
        this.refreshInfo();
      });
      this.cleanupFns.push(unsubDisconnected);

      const unsubAutoHosted = window.p2p.onAutoHosted((data) => {
        this.addSystemMessage(`Auto-hosting on port ${data.port}`);
        this.isHosting.set(true);
        this.refreshInfo();
      });
      this.cleanupFns.push(unsubAutoHosted);

      const unsubScanning = window.p2p.onScanning(() => {
        this.isScanning.set(true);
        this.addSystemMessage('Scanning network for peers...');
      });
      this.cleanupFns.push(unsubScanning);

      const unsubScanComplete = window.p2p.onScanComplete(async (data) => {
        this.isScanning.set(false);
        this.discoveredPeers.set(data.peers);

        if (data.peers.length > 0) {
          this.addSystemMessage(`Found ${data.peers.length} peer(s): ${data.peers.join(', ')}`);
          // Auto-connect to discovered peers
          await this.autoConnectToPeers(data.peers);
        } else {
          this.addSystemMessage('No peers found on local network');
        }
      });
      this.cleanupFns.push(unsubScanComplete);

      // Initial info fetch
      this.refreshInfo();
    }
  }

  ngOnDestroy() {
    this.cleanupFns.forEach(fn => fn());
  }

  private addSystemMessage(text: string) {
    const msg: Message = { user: 'System', text, time: new Date(), isSystem: true };
    this.messagesSignal.update(msgs => [...msgs, msg]);
  }

  private async refreshPeers() {
    if (window.p2p) {
      const peers = await window.p2p.getPeers();
      this.peers.set(peers);
    }
  }

  private async refreshInfo() {
    if (window.p2p) {
      const info = await window.p2p.getInfo();
      this.networkInfo.set(info);
      this.isHosting.set(info.hosting);
    }
  }

  private async autoConnectToPeers(peers: string[]) {
    if (!window.p2p || peers.length === 0) return;

    try {
      const result = await window.p2p.autoConnect(peers, 9000);
      const connected = result.results.filter(r => r.success).length;
      if (connected > 0) {
        this.addSystemMessage(`Auto-connected to ${connected} peer(s)`);
      }
      await this.refreshPeers();
      await this.refreshInfo();
    } catch (err) {
      this.addSystemMessage(`Auto-connect failed: ${err}`);
    }
  }

  protected async rescan() {
    if (!window.p2p || this.isScanning()) return;

    this.isScanning.set(true);
    this.addSystemMessage('Rescanning network...');

    try {
      const result = await window.p2p.scan(9000);
      this.discoveredPeers.set(result.peers);

      if (result.peers.length > 0) {
        this.addSystemMessage(`Found ${result.peers.length} peer(s): ${result.peers.join(', ')}`);
        await this.autoConnectToPeers(result.peers);
      } else {
        this.addSystemMessage('No peers found');
      }
    } catch (err) {
      this.addSystemMessage(`Scan failed: ${err}`);
    } finally {
      this.isScanning.set(false);
    }
  }

  protected async addManualIp() {
    const ip = this.manualIp().trim();
    if (!ip || !window.p2p) return;

    this.isConnecting.set(true);
    try {
      await window.p2p.connect(ip, 9000);
      this.addSystemMessage(`Connected to ${ip}:9000`);
      this.manualIp.set('');
      await this.refreshPeers();
      await this.refreshInfo();
    } catch (err) {
      this.addSystemMessage(`Failed to connect to ${ip}: ${err}`);
    } finally {
      this.isConnecting.set(false);
    }
  }

  protected async startHosting() {
    if (!window.p2p) return;

    try {
      await window.p2p.host(this.hostPort());
      this.addSystemMessage(`Now hosting on port ${this.hostPort()}`);
      await this.refreshInfo();
    } catch (err) {
      this.addSystemMessage(`Failed to host: ${err}`);
    }
  }

  protected async connectToPeer() {
    if (!window.p2p) return;

    this.isConnecting.set(true);
    try {
      await window.p2p.connect(this.connectHost(), this.connectPort());
      this.addSystemMessage(`Connected to ${this.connectHost()}:${this.connectPort()}`);
      await this.refreshPeers();
      await this.refreshInfo();
    } catch (err) {
      this.addSystemMessage(`Failed to connect: ${err}`);
    } finally {
      this.isConnecting.set(false);
    }
  }

  protected async disconnect() {
    if (!window.p2p) return;

    await window.p2p.disconnect();
    this.addSystemMessage('Disconnected from all peers');
    this.peers.set([]);
    await this.refreshInfo();
  }

  protected async send() {
    const text = this.input();
    if (!text.trim()) return;

    const newMsg: Message = { user: this.userName(), text, time: new Date() };
    this.messagesSignal.update(msgs => [...msgs, newMsg]);
    this.input.set('');

    // Broadcast to peers if in Electron
    if (window.p2p && this.peers().length > 0) {
      try {
        await window.p2p.broadcast({
          user: this.userName(),
          text,
          time: new Date().toISOString(),
        });
      } catch (err) {
        this.addSystemMessage(`Failed to send: ${err}`);
      }
    }
  }
}

