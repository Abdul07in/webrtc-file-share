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

  private config: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
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

  async createOffer(): Promise<string> {
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
    return btoa(JSON.stringify(sdp));
  }

  async handleOffer(encodedOffer: string): Promise<string> {
    const offer = JSON.parse(atob(encodedOffer));
    
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
    return btoa(JSON.stringify(sdp));
  }

  async handleAnswer(encodedAnswer: string) {
    const answer = JSON.parse(atob(encodedAnswer));
    await this.peerConnection?.setRemoteDescription(answer);
  }

  private waitForIceGathering(): Promise<void> {
    return new Promise((resolve) => {
      if (this.peerConnection?.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const checkState = () => {
        if (this.peerConnection?.iceGatheringState === 'complete') {
          this.peerConnection.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };

      this.peerConnection?.addEventListener('icegatheringstatechange', checkState);
      
      // Timeout after 5 seconds
      setTimeout(resolve, 5000);
    });
  }

  private setupConnectionHandlers() {
    if (!this.peerConnection) return;

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

  private handleIncomingMessage(data: ArrayBuffer | string) {
    if (typeof data === 'string') {
      const message = JSON.parse(data);
      
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
      // Binary data - file chunk
      const view = new DataView(data);
      const idLength = view.getUint8(0);
      const decoder = new TextDecoder();
      const id = decoder.decode(new Uint8Array(data, 1, idLength));
      const chunk = new Uint8Array(data, 1 + idLength);
      
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
    
    // Send file metadata
    this.dataChannel.send(JSON.stringify({
      type: 'file-meta',
      id,
      name: file.name,
      size: file.size,
      fileType: file.type,
    }));

    // Read and send file in chunks
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const idBytes = new TextEncoder().encode(id);
    
    let offset = 0;
    while (offset < data.length) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      
      // Create packet with ID prefix
      const packet = new Uint8Array(1 + idBytes.length + chunk.length);
      packet[0] = idBytes.length;
      packet.set(idBytes, 1);
      packet.set(chunk, 1 + idBytes.length);
      
      // Wait for buffer to clear if needed
      while (this.dataChannel.bufferedAmount > 1024 * 1024) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      this.dataChannel.send(packet);
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

  disconnect() {
    this.dataChannel?.close();
    this.peerConnection?.close();
    this.dataChannel = null;
    this.peerConnection = null;
    this.receivedChunks.clear();
    this.receivedMeta.clear();
  }
}

export const webrtc = new WebRTCManager();
