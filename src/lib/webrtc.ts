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

// Dynamic transfer configuration
interface TransferConfig {
  chunkSize: number;
  bufferThreshold: number;
  bufferLowThreshold: number;
  maxMessageSize: number;
  effectiveBandwidth: number; // bytes per second
  isCalibrated: boolean;
}

// Default conservative values
const DEFAULT_CONFIG: TransferConfig = {
  chunkSize: 16384, // 16KB - conservative default
  bufferThreshold: 64 * 1024,
  bufferLowThreshold: 16 * 1024,
  maxMessageSize: 262144, // 256KB default
  effectiveBandwidth: 0,
  isCalibrated: false,
};

// Calibration test sizes (from small to large)
const CALIBRATION_SIZES = [16384, 32768, 65536, 131072, 262144]; // 16KB to 256KB

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

export interface ConnectionStats {
  chunkSize: number;
  maxMessageSize: number;
  effectiveBandwidth: number;
  isCalibrated: boolean;
  connectionType: string;
  rtt: number;
}

type MessageHandler = (message: any) => void;
type FileHandler = (file: FileTransfer) => void;
type CalibrationHandler = (stats: ConnectionStats) => void;

class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private fileHandlers: Set<FileHandler> = new Set();
  private calibrationHandlers: Set<CalibrationHandler> = new Set();
  private receivedChunks: Map<string, Uint8Array[]> = new Map();
  private receivedMeta: Map<string, { name: string; size: number; type: string }> = new Map();

  // Encryption
  private keyPair: EncryptionKeys | null = null;
  private sharedKey: CryptoKey | null = null;
  private isEncrypted: boolean = false;

  // Dynamic transfer configuration
  private transferConfig: TransferConfig = { ...DEFAULT_CONFIG };
  private isCalibrating: boolean = false;
  private calibrationResults: Map<string, { size: number; startTime: number }> = new Map();

  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      {
        urls: 'turn:global.relay.metered.ca:80',
        username: 'e8dd65b92f6ec01bf7e7c5a3',
        credential: 'uWdEMvEiz+qsS3V2',
      },
      {
        urls: 'turn:global.relay.metered.ca:80?transport=tcp',
        username: 'e8dd65b92f6ec01bf7e7c5a3',
        credential: 'uWdEMvEiz+qsS3V2',
      },
      {
        urls: 'turn:global.relay.metered.ca:443',
        username: 'e8dd65b92f6ec01bf7e7c5a3',
        credential: 'uWdEMvEiz+qsS3V2',
      },
      {
        urls: 'turns:global.relay.metered.ca:443?transport=tcp',
        username: 'e8dd65b92f6ec01bf7e7c5a3',
        credential: 'uWdEMvEiz+qsS3V2',
      },
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all',
  };

  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onFile(handler: FileHandler) {
    this.fileHandlers.add(handler);
    return () => this.fileHandlers.delete(handler);
  }

  onCalibration(handler: CalibrationHandler) {
    this.calibrationHandlers.add(handler);
    return () => this.calibrationHandlers.delete(handler);
  }

  private emit(message: any) {
    this.messageHandlers.forEach(handler => handler(message));
  }

  private emitFile(file: FileTransfer) {
    this.fileHandlers.forEach(handler => handler(file));
  }

  private emitCalibration(stats: ConnectionStats) {
    this.calibrationHandlers.forEach(handler => handler(stats));
  }

  getTransferConfig(): TransferConfig {
    return { ...this.transferConfig };
  }

  async createOffer(): Promise<{ offer: string; publicKey: string }> {
    this.keyPair = await generateKeyPair();
    const publicKeyStr = await exportPublicKey(this.keyPair.publicKey);

    this.peerConnection = new RTCPeerConnection(this.rtcConfig);
    this.setupConnectionHandlers();

    this.dataChannel = this.peerConnection.createDataChannel('fileTransfer', {
      ordered: true,
      maxRetransmits: 30,
    });
    this.dataChannel.bufferedAmountLowThreshold = this.transferConfig.bufferLowThreshold;
    this.setupDataChannelHandlers(this.dataChannel);

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    await this.waitForIceGathering();

    const sdp = this.peerConnection.localDescription;
    return {
      offer: btoa(JSON.stringify(sdp)),
      publicKey: publicKeyStr,
    };
  }

  async handleOffer(encodedOffer: string, peerPublicKey: string): Promise<{ answer: string; publicKey: string }> {
    const offer = JSON.parse(atob(encodedOffer));

    this.keyPair = await generateKeyPair();
    const publicKeyStr = await exportPublicKey(this.keyPair.publicKey);

    const peerKey = await importPublicKey(peerPublicKey);
    this.sharedKey = await deriveSharedKey(this.keyPair.privateKey, peerKey);
    this.isEncrypted = true;

    this.peerConnection = new RTCPeerConnection(this.rtcConfig);
    this.setupConnectionHandlers();

    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.dataChannel.bufferedAmountLowThreshold = this.transferConfig.bufferLowThreshold;
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

    if (this.keyPair) {
      const peerKey = await importPublicKey(peerPublicKey);
      this.sharedKey = await deriveSharedKey(this.keyPair.privateKey, peerKey);
      this.isEncrypted = true;
    }

    await this.peerConnection?.setRemoteDescription(answer);
  }

  private waitForIceGathering(timeoutMs: number = 4000): Promise<void> {
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

      setTimeout(() => {
        this.peerConnection?.removeEventListener('icegatheringstatechange', onStateChange);
        resolve();
      }, timeoutMs);
    });
  }

  // ============= DYNAMIC CALIBRATION =============

  async calibrateConnection(): Promise<ConnectionStats> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel not ready for calibration');
    }

    this.isCalibrating = true;
    console.log('Starting connection calibration...');
    this.emit({ type: 'calibrationStart' });

    try {
      // Get connection stats first
      const stats = await this.getConnectionStats();
      
      // Determine optimal chunk size through progressive testing
      let optimalChunkSize = DEFAULT_CONFIG.chunkSize;
      let maxSuccessfulSize = DEFAULT_CONFIG.chunkSize;
      let bestBandwidth = 0;

      for (const testSize of CALIBRATION_SIZES) {
        try {
          const bandwidth = await this.testChunkSize(testSize);
          console.log(`Chunk size ${testSize} bytes: ${(bandwidth / 1024 / 1024).toFixed(2)} MB/s`);
          
          if (bandwidth > bestBandwidth) {
            bestBandwidth = bandwidth;
            optimalChunkSize = testSize;
            maxSuccessfulSize = testSize;
          }
        } catch (error) {
          console.log(`Chunk size ${testSize} failed, stopping calibration at this size`);
          break;
        }
      }

      // Set optimal configuration based on calibration
      this.transferConfig = {
        chunkSize: optimalChunkSize,
        bufferThreshold: optimalChunkSize * 4, // 4 chunks in buffer
        bufferLowThreshold: optimalChunkSize, // Resume when 1 chunk left
        maxMessageSize: maxSuccessfulSize,
        effectiveBandwidth: bestBandwidth,
        isCalibrated: true,
      };

      // Update data channel threshold
      if (this.dataChannel) {
        this.dataChannel.bufferedAmountLowThreshold = this.transferConfig.bufferLowThreshold;
      }

      const connectionStats: ConnectionStats = {
        chunkSize: this.transferConfig.chunkSize,
        maxMessageSize: this.transferConfig.maxMessageSize,
        effectiveBandwidth: this.transferConfig.effectiveBandwidth,
        isCalibrated: true,
        connectionType: stats.connectionType,
        rtt: stats.rtt,
      };

      console.log('Calibration complete:', connectionStats);
      this.emit({ type: 'calibrationComplete', stats: connectionStats });
      this.emitCalibration(connectionStats);

      return connectionStats;
    } finally {
      this.isCalibrating = false;
    }
  }

  private async testChunkSize(size: number): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
        reject(new Error('Channel not ready'));
        return;
      }

      const testId = `calibrate_${size}_${Date.now()}`;
      const testData = new Uint8Array(size);
      
      // Fill with random data for realistic test
      crypto.getRandomValues(testData);

      const testPacket = new Uint8Array(1 + testId.length + testData.length);
      const idBytes = new TextEncoder().encode(testId);
      testPacket[0] = idBytes.length;
      testPacket.set(idBytes, 1);
      testPacket.set(testData, 1 + idBytes.length);

      const startTime = performance.now();
      this.calibrationResults.set(testId, { size, startTime });

      // Set timeout for this test
      const timeout = setTimeout(() => {
        this.calibrationResults.delete(testId);
        reject(new Error(`Chunk size ${size} timed out`));
      }, 5000);

      // Send calibration request
      this.dataChannel.send(JSON.stringify({
        type: 'calibration-ping',
        id: testId,
        size,
      }));

      // Create handler for response
      const handleMessage = (msg: any) => {
        if (msg.type === 'calibration-pong' && msg.id === testId) {
          clearTimeout(timeout);
          const endTime = performance.now();
          const rtt = endTime - startTime;
          const bandwidth = (size * 2) / (rtt / 1000); // Round trip, so x2
          this.calibrationResults.delete(testId);
          this.messageHandlers.delete(handleMessage);
          resolve(bandwidth);
        }
      };

      this.messageHandlers.add(handleMessage);

      // Also send the actual binary data to test throughput
      try {
        const buffer = new ArrayBuffer(testPacket.length);
        new Uint8Array(buffer).set(testPacket);
        this.dataChannel.send(buffer);
      } catch (error) {
        clearTimeout(timeout);
        this.calibrationResults.delete(testId);
        reject(error);
      }
    });
  }

  private async getConnectionStats(): Promise<{ connectionType: string; rtt: number }> {
    if (!this.peerConnection) {
      return { connectionType: 'unknown', rtt: 0 };
    }

    try {
      const stats = await this.peerConnection.getStats();
      let connectionType = 'unknown';
      let rtt = 0;

      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          rtt = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0;
        }
        if (report.type === 'local-candidate') {
          connectionType = report.candidateType || 'unknown';
        }
      });

      return { connectionType, rtt };
    } catch {
      return { connectionType: 'unknown', rtt: 0 };
    }
  }

  // ============= CONNECTION HANDLERS =============

  private setupConnectionHandlers() {
    if (!this.peerConnection) return;

    this.peerConnection.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', this.peerConnection?.iceGatheringState);
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('ICE candidate type:', event.candidate.type, 'protocol:', event.candidate.protocol);
      }
    };

    this.peerConnection.onicecandidateerror = (event) => {
      if (event.errorCode !== 701) {
        console.warn('ICE candidate error:', event.errorCode, event.errorText);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log('ICE connection state:', state);
      this.emit({ type: 'connectionState', state });

      if (state === 'disconnected' || state === 'failed') {
        console.log('Attempting ICE restart...');
        this.attemptIceRestart();
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log('Connection state:', state);
      this.emit({ type: 'connectionState', state });
    };
  }

  private async attemptIceRestart() {
    if (!this.peerConnection) return;

    try {
      const offer = await this.peerConnection.createOffer({ iceRestart: true });
      await this.peerConnection.setLocalDescription(offer);
      console.log('ICE restart initiated');
    } catch (error) {
      console.error('ICE restart failed:', error);
    }
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

      // Handle calibration messages
      if (message.type === 'calibration-ping') {
        // Respond to calibration ping
        this.dataChannel?.send(JSON.stringify({
          type: 'calibration-pong',
          id: message.id,
          size: message.size,
        }));
        return;
      }

      if (message.type === 'calibration-pong') {
        // Let the handler in testChunkSize process this
        this.emit(message);
        return;
      }

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
      // Binary data - could be calibration or file chunk
      const view = new DataView(data);
      const idLength = view.getUint8(0);
      const decoder = new TextDecoder();
      const id = decoder.decode(new Uint8Array(data, 1, idLength));

      // Skip calibration data
      if (id.startsWith('calibrate_')) {
        return;
      }

      let chunk: Uint8Array;

      if (this.isEncrypted && this.sharedKey) {
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
    const { chunkSize, bufferThreshold } = this.transferConfig;

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

    // Read and send file in chunks using dynamic chunk size
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const idBytes = new TextEncoder().encode(id);

    let offset = 0;
    while (offset < data.length) {
      const chunk = data.slice(offset, offset + chunkSize);

      let packet: Uint8Array;

      if (this.isEncrypted && this.sharedKey) {
        const { iv, encrypted } = await encryptData(this.sharedKey, chunk);

        packet = new Uint8Array(1 + idBytes.length + 12 + encrypted.length);
        packet[0] = idBytes.length;
        packet.set(idBytes, 1);
        packet.set(iv, 1 + idBytes.length);
        packet.set(encrypted, 1 + idBytes.length + 12);
      } else {
        packet = new Uint8Array(1 + idBytes.length + chunk.length);
        packet[0] = idBytes.length;
        packet.set(idBytes, 1);
        packet.set(chunk, 1 + idBytes.length);
      }

      // Wait for buffer to clear if needed (flow control)
      if (this.dataChannel.bufferedAmount > bufferThreshold) {
        await new Promise<void>(resolve => {
          const onBufferLow = () => {
            this.dataChannel?.removeEventListener('bufferedamountlow', onBufferLow);
            resolve();
          };
          this.dataChannel?.addEventListener('bufferedamountlow', onBufferLow);
        });
      }

      const packetBuffer = new ArrayBuffer(packet.length);
      new Uint8Array(packetBuffer).set(packet);
      this.dataChannel.send(packetBuffer);
      offset += chunkSize;

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

  isConnectionCalibrated(): boolean {
    return this.transferConfig.isCalibrated;
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
    this.transferConfig = { ...DEFAULT_CONFIG };
    this.calibrationResults.clear();
  }
}

export const webrtc = new WebRTCManager();