import React, { useState, useRef, useEffect } from "react";
import {
  recordAndDetectVoice,
  generateKey,
  encryptBlob,
  decryptBlob,
} from "./sdk";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

const VOICES = [
  { label: "Male", value: "Matthew" },
  { label: "Female", value: "Joanna" },
];

async function sendToWhisper(audioBlob) {
  const apiKey = process.env.REACT_APP_OPENAI_API_KEY;
  if (!apiKey) {
    return "[ASR transcript stub: no API key]";
  }
  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm");
  formData.append("model", "whisper-1");
  try {
    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });
    const data = await resp.json();
    if (data.text) return data.text;
    return "[ASR error: " + (data.error?.message || JSON.stringify(data)) + "]";
  } catch (e) {
    return "[ASR network error: " + e.message + "]";
  }
}

async function sendToChatbot(transcript) {
  const apiKey = process.env.REACT_APP_OPENAI_API_KEY;
  if (!apiKey) {
    return "[Chatbot response stub: no API key]";
  }
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a psychiatric voice companion. Be supportive, concise, and empathetic.",
          },
          { role: "user", content: transcript },
        ],
        max_tokens: 128,
      }),
    });
    const data = await resp.json();
    if (data.choices && data.choices[0]?.message?.content) {
      return data.choices[0].message.content;
    }
    return (
      "[Chatbot error: " + (data.error?.message || JSON.stringify(data)) + "]"
    );
  } catch (e) {
    return "[Chatbot network error: " + e.message + "]";
  }
}

async function synthesizeWithPolly(text, voice) {
  const accessKeyId = process.env.REACT_APP_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.REACT_APP_AWS_SECRET_ACCESS_KEY;
  const region = process.env.REACT_APP_AWS_REGION || "us-east-1";
  if (!accessKeyId || !secretAccessKey) {
    return { error: "No AWS credentials for Polly" };
  }
  const polly = new PollyClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  const input = {
    OutputFormat: "mp3",
    Text: text,
    VoiceId: voice,
    Engine: "neural",
  };
  try {
    const command = new SynthesizeSpeechCommand(input);
    const data = await polly.send(command);
    const audioChunks = [];
    for await (const chunk of data.AudioStream) {
      audioChunks.push(chunk);
    }
    const audioBlob = new Blob(audioChunks, { type: "audio/mp3" });
    return { audioBlob };
  } catch (e) {
    return { error: e.message };
  }
}

const MEMORY_KEY = "solace_transcripts";

async function saveTranscriptToMemory(transcript) {
  let keyRaw = window.localStorage.getItem("solace_aes_key");
  let key;
  if (!keyRaw) {
    key = await generateKey();
    const exported = await window.crypto.subtle.exportKey("raw", key);
    keyRaw = btoa(String.fromCharCode(...new Uint8Array(exported)));
    window.localStorage.setItem("solace_aes_key", keyRaw);
  } else {
    const raw = Uint8Array.from(atob(keyRaw), (c) => c.charCodeAt(0));
    key = await window.crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"]
    );
  }
  let memory = [];
  try {
    const encBlobs = JSON.parse(
      window.localStorage.getItem(MEMORY_KEY) || "[]"
    );
    for (const enc of encBlobs) {
      const dec = await decryptBlob(enc, key);
      memory.push(dec);
    }
  } catch {}
  memory.push(transcript);
  if (memory.length > 3) memory = memory.slice(-3);
  const encBlobs = await Promise.all(memory.map((t) => encryptBlob(t, key)));
  window.localStorage.setItem(MEMORY_KEY, JSON.stringify(encBlobs));
}

async function loadTranscriptsFromMemory() {
  let keyRaw = window.localStorage.getItem("solace_aes_key");
  if (!keyRaw) return [];
  const raw = Uint8Array.from(atob(keyRaw), (c) => c.charCodeAt(0));
  const key = await window.crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
  try {
    const encBlobs = JSON.parse(
      window.localStorage.getItem(MEMORY_KEY) || "[]"
    );
    const memory = await Promise.all(
      encBlobs.map((enc) => decryptBlob(enc, key))
    );
    return memory;
  } catch {
    return [];
  }
}

function App() {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [voice, setVoice] = useState(VOICES[0].value);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const framesRef = useRef([]);
  const vadIteratorRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [audioUrl, setAudioUrl] = useState("");
  const [memory, setMemory] = useState([]);

  useEffect(() => {
    loadTranscriptsFromMemory().then(setMemory);
  }, []);

  const handleTalk = async () => {
    setError("");
    setTranscript("");
    setResponse("");
    setRecording(true);
    framesRef.current = [];
    vadIteratorRef.current = recordAndDetectVoice();
    audioChunksRef.current = [];
    try {
      // Start mic capture
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new window.MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.start();
      for await (const { frame, timestamp } of vadIteratorRef.current) {
        if (!recording) break;
        framesRef.current.push({ frame, timestamp });
      }
    } catch (e) {
      setError("VAD or mic error: " + e.message);
    }
  };

  const handleStop = async () => {
    setRecording(false);
    // Stop mic and get audio blob
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      await new Promise((resolve) => {
        mediaRecorder.onstop = resolve;
        mediaRecorder.stop();
      });
    }
    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    setTranscript("[Transcribing...]");
    // Send to ASR (OpenAI Whisper or stub)
    const asrResult = await sendToWhisper(audioBlob);
    setTranscript(asrResult);
    // Save transcript to memory
    try {
      await saveTranscriptToMemory(asrResult);
      const mem = await loadTranscriptsFromMemory();
      setMemory(mem);
    } catch (e) {
      setError("Memory encryption error: " + e.message);
    }
    // Send transcript to Chatbot (OpenAI GPT-3.5/4)
    setResponse("[Chatbot thinking...]");
    const chatResult = await sendToChatbot(asrResult);
    setResponse(chatResult);
  };

  const handlePlayResponse = async () => {
    setPlaying(true);
    setError("");
    setAudioUrl("");
    if (!response) {
      setError("No chatbot response to synthesize.");
      setPlaying(false);
      return;
    }
    // Call TTS API (AWS Polly) with response and selected voice
    const { audioBlob, error: ttsError } = await synthesizeWithPolly(
      response,
      voice
    );
    if (ttsError) {
      setError("TTS error: " + ttsError);
      setPlaying(false);
      return;
    }
    const url = URL.createObjectURL(audioBlob);
    setAudioUrl(url);
    const audio = new window.Audio(url);
    audio.onended = () => setPlaying(false);
    audio.onerror = () => {
      setError("Audio playback error");
      setPlaying(false);
    };
    audio.play();
  };

  return (
    <div style={{ padding: 32, maxWidth: 500, margin: "auto" }}>
      <h1>Solace Lite Voice Companion Demo</h1>
      <div style={{ marginBottom: 16 }}>
        <button onClick={handleTalk} disabled={recording}>
          Talk
        </button>
        <button onClick={handleStop} disabled={!recording}>
          Stop
        </button>
        <button onClick={handlePlayResponse} disabled={!response || playing}>
          Play Response
        </button>
        <select
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          style={{ marginLeft: 16 }}
        >
          {VOICES.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 8 }}>
        <strong>Transcript:</strong>
        <div style={{ minHeight: 24 }}>{transcript}</div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <strong>Response:</strong>
        <div style={{ minHeight: 24 }}>{response}</div>
      </div>
      {audioUrl && <audio src={audioUrl} controls style={{ width: "100%" }} />}
      <div style={{ marginTop: 16 }}>
        <strong>Last 3 Transcripts (Encrypted):</strong>
        <ul>
          {memory.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>
      {error && (
        <div style={{ color: "red", marginTop: 8 }}>
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
}

export default App;
