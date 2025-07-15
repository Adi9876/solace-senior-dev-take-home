import React, { useState, useRef } from "react";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { KMSClient, EncryptCommand } from "@aws-sdk/client-kms";

const DECRYPT_API_URL =
  "https://jumvxncusi.execute-api.us-east-1.amazonaws.com/dev/decrypt";

function App() {
  const [result, setResult] = useState("");
  const [recording, setRecording] = useState(false);
  const [awsCreds, setAwsCreds] = useState({
    accessKeyId: "",
    secretAccessKey: "",
    region: "us-east-1",
  });
  const framesRef = useRef([]);
  const vadIteratorRef = useRef(null);
  const blobKeyRef = useRef("");

  React.useEffect(() => {
    const accessKeyId = prompt(
      "Enter AWS Access Key ID:",
      awsCreds.accessKeyId || ""
    );
    const secretAccessKey = prompt(
      "Enter AWS Secret Access Key:",
      awsCreds.secretAccessKey || ""
    );
    setAwsCreds({ ...awsCreds, accessKeyId, secretAccessKey });
  }, []);

  const handleStart = async () => {
    setResult("");
    setRecording(true);
    framesRef.current = [];
    vadIteratorRef.current = recordAndDetectVoice();
    (async () => {
      for await (const { frame, timestamp } of vadIteratorRef.current) {
        if (!recording) break;
        framesRef.current.push({ frame, timestamp });
      }
    })();
  };

  async function* recordAndDetectVoice() {
    for (let i = 0; i < 5; i++) {
      const frame = new Uint8Array([i, i + 1, i + 2]).buffer;
      yield { frame, timestamp: Date.now() };
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const handleStopAndUpload = async () => {
    setRecording(false);
    setResult("Encrypting and uploading...");
    const data = JSON.stringify(
      framesRef.current.map((f) => Array.from(new Uint8Array(f.frame)))
    );
    const kms = new KMSClient({
      region: awsCreds.region,
      credentials: {
        accessKeyId: awsCreds.accessKeyId,
        secretAccessKey: awsCreds.secretAccessKey,
      },
    });
    const encCmd = new EncryptCommand({
      KeyId: KMS_KEY_ID,
      Plaintext: new TextEncoder().encode(data),
    });
    let encrypted;
    try {
      const encRes = await kms.send(encCmd);
      encrypted = encRes.CiphertextBlob;
    } catch (e) {
      setResult("KMS encryption failed: " + e);
      return;
    }
    
    const s3 = new S3Client({
      region: awsCreds.region,
      credentials: {
        accessKeyId: awsCreds.accessKeyId,
        secretAccessKey: awsCreds.secretAccessKey,
      },
    });
    const blobKey = `web-demo-blob-${Date.now()}`;
    blobKeyRef.current = blobKey;
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: blobKey,
          Body: encrypted,
        })
      );
      setResult(`Uploaded!\nBlobKey: ${blobKey}`);
    } catch (e) {
      setResult("S3 upload failed: " + e);
      return;
    }
  };

  const handleFetchAndDecrypt = async () => {
    setResult("Calling decrypt API...");
    const blobKey = blobKeyRef.current;
    if (!blobKey) {
      setResult("No blobKey found. Please record and upload first.");
      return;
    }
    try {
      const resp = await fetch(DECRYPT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobKey }),
      });
      const data = await resp.json();
      if (data.plaintext) {
        setResult("Fetched & Decrypted:\n" + data.plaintext);
      } else {
        setResult("API error: " + JSON.stringify(data));
      }
    } catch (e) {
      setResult("API call failed: " + e);
    }
  };

  return (
    <div style={{ padding: 32 }}>
      <h1>Solace Client SDK Demo (Real AWS)</h1>
      <button onClick={handleStart} disabled={recording}>
        Start Recording
      </button>
      <button onClick={handleStopAndUpload} disabled={!recording}>
        Stop & Upload
      </button>
      <button onClick={handleFetchAndDecrypt}>Fetch & Decrypt</button>
      <div style={{ marginTop: 24 }}>
        <strong>Result:</strong>
        <pre>{result}</pre>
      </div>
    </div>
  );
}

export default App;
