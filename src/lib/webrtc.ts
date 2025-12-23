import {
  generateKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveSharedKey,
  encryptData,
  decryptData,
  encryptString,
  decryptString,
  type EncryptionKeys,
} from './crypto';

const CHUNK_SIZE = 16384; // 16KB chunks

export interface FileTransfer {
  id: string;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: 'pending' | 'transferring' | 'completed' | 'error';
  data?: Blob;
}

export interface PeerConnection {
  id: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  isInitiator: boolean;
}

type MessageHandler = (message: any) => void;
type FileHandler = (file: FileTransfer) => void;

class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private fileHandlers: Set<FileHandler> = new Set();
  private receivedChunks: Map<string, Uint8Array[]> = new Map();
  private receivedMeta: Map<string, { name: string; size: number; type: string }> = new Map();
  
  // Encryption
  private keyPair: EncryptionKeys | null = null;
  private sharedKey: CryptoKey | null = null;
  private isEncrypted: boolean = false;

  private config: RTCConfiguration = {
    iceServers: [
      // Multiple STUN servers for better connectivity
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },

      // TURN relay (needed for many mobile-data / symmetric NAT scenarios)
      // Note: public TURN is often unreliable; for production, use your own TURN provider.
      {
        urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: ['turns:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'],
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ],
    iceCandidatePoolSize: 10,
  };

  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onFile(handler: FileHandler) {
    this.fileHandlers.add(handler);
    return () => this.fileHandlers.delete(handler);
  }

  private emit(message: any) {
    this.messageHandlers.forEach(handler => handler(message));
  }

  private emitFile(file: FileTransfer) {
    this.fileHandlers.forEach(handler => handler(file));
  }

  async createOffer(): Promise<{ offer: string; publicKey: string }> {
    // Generate encryption keys
    this.keyPair = await generateKeyPair();
    const publicKeyStr = await exportPublicKey(this.keyPair.publicKey);
    
    this.peerConnection = new RTCPeerConnection(this.config);
    this.setupConnectionHandlers();

    this.dataChannel = this.peerConnection.createDataChannel('fileTransfer', {
      ordered: true,
    });
    this.setupDataChannelHandlers(this.dataChannel);

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    // Wait for ICE gathering to complete
    await this.waitForIceGathering();

    const sdp = this.peerConnection.localDescription;
    return {
      offer: btoa(JSON.stringify(sdp)),
      publicKey: publicKeyStr,
    };
  }

  async handleOffer(encodedOffer: string, peerPublicKey: string): Promise<{ answer: string; publicKey: string }> {
    const offer = JSON.parse(atob(encodedOffer));
    
    // Generate our keys and derive shared key
    this.keyPair = await generateKeyPair();
    const publicKeyStr = await exportPublicKey(this.keyPair.publicKey);
    
    const peerKey = await importPublicKey(peerPublicKey);
    this.sharedKey = await deriveSharedKey(this.keyPair.privateKey, peerKey);
    this.isEncrypted = true;
    
    this.peerConnection = new RTCPeerConnection(this.config);
    this.setupConnectionHandlers();

    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannelHandlers(this.dataChannel);
    };

    await this.peerConnection.setRemoteDescription(offer);
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    await this.waitForIceGathering();

    const sdp = this.peerConnection.localDescription;
    return {
      answer: btoa(JSON.stringify(sdp)),
      publicKey: publicKeyStr,
    };
  }

  async handleAnswer(encodedAnswer: string, peerPublicKey: string) {
    const answer = JSON.parse(atob(encodedAnswer));
    
    // Derive shared key from peer's public key
    if (this.keyPair) {
      const peerKey = await importPublicKey(peerPublicKey);
      this.sharedKey = await deriveSharedKey(this.keyPair.privateKey, peerKey);
      this.isEncrypted = true;
    }
    
    await this.peerConnection?.setRemoteDescription(answer);
  }

  private waitForIceGathering(timeoutMs: number = 20000): Promise<void> {
    return new Promise((resolve) => {
      if (!this.peerConnection) return resolve();
      if (this.peerConnection.iceGatheringState === 'complete') return resolve();

      const onStateChange = () => {
        if (this.peerConnection?.iceGatheringState === 'complete') {
          this.peerConnection?.removeEventListener('icegatheringstatechange', onStateChange);
          resolve();
        }
      };

      this.peerConnection.addEventListener('icegatheringstatechange', onStateChange);

      // Many relay candidates (TURN) can take longer than 5s to gather.
      // We wait up to timeoutMs; if it still isn't complete, we proceed with what we have.
      setTimeout(() => {
        this.peerConnection?.removeEventListener('icegatheringstatechange', onStateChange);
        resolve();
      }, timeoutMs);
    });
  }

  private setupConnectionHandlers() {
    if (!this.peerConnection) return;

    this.peerConnection.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', this.peerConnection?.iceGatheringState);
    };

    this.peerConnection.onicecandidateerror = (event) => {
      console.warn('ICE candidate error:', event);
      this.emit({ type: 'iceCandidateError', event });
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log('ICE connection state:', state);
      this.emit({ type: 'connectionState', state });
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log('Connection state:', state);
      this.emit({ type: 'connectionState', state });
    };
  }

  private setupDataChannelHandlers(channel: RTCDataChannel) {
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      console.log('Data channel opened');
      this.emit({ type: 'channelOpen' });
    };

    channel.onclose = () => {
      console.log('Data channel closed');
      this.emit({ type: 'channelClose' });
    };

    channel.onmessage = (event) => {
      this.handleIncomingMessage(event.data);
    };

    channel.onerror = (error) => {
      console.error('Data channel error:', error);
      this.emit({ type: 'error', error });
    };
  }

  private async handleIncomingMessage(data: ArrayBuffer | string) {
    if (typeof data === 'string') {
      let message = JSON.parse(data);
      
      // Decrypt metadata if encrypted
      if (message.encrypted && this.sharedKey) {
        try {
          if (message.type === 'file-meta') {
            message.name = await decryptString(this.sharedKey, message.name);
            message.fileType = await decryptString(this.sharedKey, message.fileType);
          }
        } catch (error) {
          console.error('Decryption error:', error);
        }
      }
      
      if (message.type === 'file-meta') {
        this.receivedMeta.set(message.id, {
          name: message.name,
          size: message.size,
          type: message.fileType,
        });
        this.receivedChunks.set(message.id, []);
        this.emitFile({
          id: message.id,
          name: message.name,
          size: message.size,
          type: message.fileType,
          progress: 0,
          status: 'transferring',
        });
      } else if (message.type === 'file-complete') {
        const chunks = this.receivedChunks.get(message.id);
        const meta = this.receivedMeta.get(message.id);
        
        if (chunks && meta) {
          const blobParts = chunks.map(chunk => chunk.buffer as ArrayBuffer);
          const blob = new Blob(blobParts, { type: meta.type });
          this.emitFile({
            id: message.id,
            name: meta.name,
            size: meta.size,
            type: meta.type,
            progress: 100,
            status: 'completed',
            data: blob,
          });
          this.receivedChunks.delete(message.id);
          this.receivedMeta.delete(message.id);
        }
      } else {
        this.emit(message);
      }
    } else {
      // Binary data - file chunk (possibly encrypted)
      const view = new DataView(data);
      const idLength = view.getUint8(0);
      const decoder = new TextDecoder();
      const id = decoder.decode(new Uint8Array(data, 1, idLength));
      
      let chunk: Uint8Array;
      
      if (this.isEncrypted && this.sharedKey) {
        // Extract IV (12 bytes) and encrypted data
        const iv = new Uint8Array(data, 1 + idLength, 12);
        const encrypted = new Uint8Array(data, 1 + idLength + 12);
        
        try {
          chunk = await decryptData(this.sharedKey, iv, encrypted);
        } catch (error) {
          console.error('Chunk decryption error:', error);
          return;
        }
      } else {
        chunk = new Uint8Array(data, 1 + idLength);
      }
      
      const chunks = this.receivedChunks.get(id);
      const meta = this.receivedMeta.get(id);
      
      if (chunks && meta) {
        chunks.push(chunk);
        const received = chunks.reduce((acc, c) => acc + c.length, 0);
        const progress = Math.round((received / meta.size) * 100);
        
        this.emitFile({
          id,
          name: meta.name,
          size: meta.size,
          type: meta.type,
          progress,
          status: 'transferring',
        });
      }
    }
  }

  async sendFile(file: File): Promise<string> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel not ready');
    }

    const id = crypto.randomUUID();
    
    // Send file metadata (encrypted if available)
    const meta: any = {
      type: 'file-meta',
      id,
      name: file.name,
      size: file.size,
      fileType: file.type,
      encrypted: this.isEncrypted,
    };
    
    if (this.isEncrypted && this.sharedKey) {
      meta.name = await encryptString(this.sharedKey, file.name);
      meta.fileType = await encryptString(this.sharedKey, file.type);
    }
    
    this.dataChannel.send(JSON.stringify(meta));

    // Read and send file in chunks
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const idBytes = new TextEncoder().encode(id);
    
    let offset = 0;
    while (offset < data.length) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      
      let packet: Uint8Array;
      
      if (this.isEncrypted && this.sharedKey) {
        // Encrypt the chunk
        const { iv, encrypted } = await encryptData(this.sharedKey, chunk);
        
        // Create packet: idLength(1) + id + iv(12) + encrypted
        packet = new Uint8Array(1 + idBytes.length + 12 + encrypted.length);
        packet[0] = idBytes.length;
        packet.set(idBytes, 1);
        packet.set(iv, 1 + idBytes.length);
        packet.set(encrypted, 1 + idBytes.length + 12);
      } else {
        // Unencrypted packet
        packet = new Uint8Array(1 + idBytes.length + chunk.length);
        packet[0] = idBytes.length;
        packet.set(idBytes, 1);
        packet.set(chunk, 1 + idBytes.length);
      }
      
      // Wait for buffer to clear if needed
      while (this.dataChannel.bufferedAmount > 1024 * 1024) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Create a proper ArrayBuffer copy to avoid SharedArrayBuffer type issues
      const packetBuffer = new ArrayBuffer(packet.length);
      new Uint8Array(packetBuffer).set(packet);
      this.dataChannel.send(packetBuffer);
      offset += CHUNK_SIZE;
      
      const progress = Math.round((offset / data.length) * 100);
      this.emitFile({
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        progress: Math.min(progress, 100),
        status: 'transferring',
      });
    }

    // Send completion message
    this.dataChannel.send(JSON.stringify({
      type: 'file-complete',
      id,
    }));

    this.emitFile({
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      progress: 100,
      status: 'completed',
    });

    return id;
  }

  isConnected(): boolean {
    return this.dataChannel?.readyState === 'open';
  }
  
  isEncryptionEnabled(): boolean {
    return this.isEncrypted;
  }

  disconnect() {
    this.dataChannel?.close();
    this.peerConnection?.close();
    this.dataChannel = null;
    this.peerConnection = null;
    this.receivedChunks.clear();
    this.receivedMeta.clear();
    this.keyPair = null;
    this.sharedKey = null;
    this.isEncrypted = false;
  }
}

export const webrtc = new WebRTCManager();
