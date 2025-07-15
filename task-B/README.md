# @solace/client-sdk

A cross-platform SDK and demo for secure blob encryption and VAD-based audio capture, with real AWS KMS, S3, and Lambda integration.

---

## Features
- **AES-GCM encryption** (browser/Node.js)
- **Voice Activity Detection (VAD)** (simulated, can be extended)
- **Upload encrypted blobs to S3**
- **Decrypt via AWS Lambda API**
- **React demo app** for end-to-end flow

---

## Installation

Clone the repo and install dependencies:

```sh
cd task-B/demo
npm install
```

---

## Usage (Demo)

1. **Start the demo app:**
   ```sh
   npm start
   ```
2. **Open** [http://localhost:3000](http://localhost:3000) in your browser.
3. **Enter your AWS credentials** (Access Key ID, Secret Access Key) when prompted.
4. **Click through the UI:**
   - Start Recording (simulated audio)
   - Stop & Upload (encrypts with KMS, uploads to S3)
   - Fetch & Decrypt (calls API Gateway, decrypts via Lambda)
5. **See the decrypted result** in the UI.

---

## Real AWS Integration
- **S3 Bucket:** `solace-prod-encrypted-blobs-mxf0vel6`
- **KMS Key ID:** `bc7f7768-8e59-447c-a111-a58c051a04fb`
- **Decrypt API:** `https://jumvxncusi.execute-api.us-east-1.amazonaws.com/dev/decrypt`

**CORS must be enabled on the S3 bucket** for browser uploads. Example CORS config:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedOrigins": ["http://localhost:3000"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

---

## SDK API (see `demo/src/sdk.js` for browser version)

- `generateKey()` - Generate AES-GCM key (Node only)
- `encryptBlob(data, key)` - Encrypt string with AES-GCM
- `decryptBlob({iv, ciphertext, tag}, key)` - Decrypt
- `recordAndDetectVoice()` - Simulated VAD async generator
- `uploadBlob(blob, apiUrl, token)` - (Demo uses AWS SDK directly)
- `downloadAndDecrypt(blobKey, apiUrl, key)` - (Demo uses real API)

---

## Testing
- The demo app is the main test harness for the real AWS flow.
- For Node.js SDK unit tests, see the original `src/index.test.js` (if present).

---

## Security Note
**Never expose real AWS credentials in a public or production app!**
For production, use Cognito or a backend proxy for AWS access.

---

## License
MIT 