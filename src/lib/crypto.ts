// E2E Encryption utilities using Web Crypto API

export interface EncryptionKeys {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface ExportedPublicKey {
  key: JsonWebKey;
}

// Generate an ECDH key pair for key exchange
export async function generateKeyPair(): Promise<EncryptionKeys> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey']
  );
  
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

// Export public key for transmission
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('jwk', key);
  return btoa(JSON.stringify(exported));
}

// Import a received public key
export async function importPublicKey(encodedKey: string): Promise<CryptoKey> {
  const jwk = JSON.parse(atob(encodedKey));
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  );
}

// Derive a shared AES key from ECDH key exchange
export async function deriveSharedKey(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: peerPublicKey,
    },
    privateKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt data with AES-GCM
export async function encryptData(
  key: CryptoKey,
  data: Uint8Array
): Promise<{ iv: Uint8Array; encrypted: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  // Create a proper ArrayBuffer copy to avoid SharedArrayBuffer type issues
  const dataBuffer = new ArrayBuffer(data.length);
  new Uint8Array(dataBuffer).set(data);
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    dataBuffer
  );
  
  return {
    iv,
    encrypted: new Uint8Array(encrypted),
  };
}

// Decrypt data with AES-GCM
export async function decryptData(
  key: CryptoKey,
  iv: Uint8Array,
  encrypted: Uint8Array
): Promise<Uint8Array> {
  // Create proper ArrayBuffer copies to avoid SharedArrayBuffer type issues
  const ivBuffer = new ArrayBuffer(iv.length);
  new Uint8Array(ivBuffer).set(iv);
  const encryptedBuffer = new ArrayBuffer(encrypted.length);
  new Uint8Array(encryptedBuffer).set(encrypted);
  
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBuffer,
    },
    key,
    encryptedBuffer
  );
  
  return new Uint8Array(decrypted);
}

// Encrypt a string (for metadata)
export async function encryptString(key: CryptoKey, text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const { iv, encrypted } = await encryptData(key, data);
  
  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(new Uint8Array(iv));
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

// Decrypt a string (for metadata)
export async function decryptString(key: CryptoKey, encoded: string): Promise<string> {
  const combined = new Uint8Array(
    atob(encoded).split('').map(c => c.charCodeAt(0))
  );
  
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  const decrypted = await decryptData(key, iv, encrypted);
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}
