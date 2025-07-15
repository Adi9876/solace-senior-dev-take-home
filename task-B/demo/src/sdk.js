
async function generateKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

async function importKey(rawKey) {
  return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptBlob(data, key) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = enc.encode(data);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  const encryptedArr = new Uint8Array(encrypted);
  const tag = encryptedArr.slice(-16);
  const ciphertext = encryptedArr.slice(0, -16);
  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...ciphertext)),
    tag: btoa(String.fromCharCode(...tag)),
  };
}

async function decryptBlob(encrypted, key) {
  const dec = new TextDecoder();
  const iv = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), (c) =>
    c.charCodeAt(0)
  );
  const tag = Uint8Array.from(atob(encrypted.tag), (c) => c.charCodeAt(0));
  const full = new Uint8Array(ciphertext.length + tag.length);
  full.set(ciphertext);
  full.set(tag, ciphertext.length);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    full
  );
  return dec.decode(decrypted);
}

async function* recordAndDetectVoice() {
  for (let i = 0; i < 5; i++) {
    const frame = new Uint8Array([i, i + 1, i + 2]).buffer;
    yield { frame, timestamp: Date.now() };
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function uploadBlob(blob, apiUrl, token) {
  await new Promise((r) => setTimeout(r, 200));
  return "fake-blob-key";
}

async function downloadAndDecrypt(blobKey, apiUrl, key) {
  await new Promise((r) => setTimeout(r, 200));
  return "decrypted result";
}

export {
  generateKey,
  importKey,
  encryptBlob,
  decryptBlob,
  recordAndDetectVoice,
  uploadBlob,
  downloadAndDecrypt,
};
