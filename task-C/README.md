# Task C: Solace Lite End-to-End Demo

## Goal
Prototype a minimal voice→voice companion with chat and voice customization. Trained in psychiatric knowledge.

## Features
1. **Voice Capture & ASR**
   - Capture mic input in browser (Web Audio API)
   - Implement VAD (reuse or stub @solace/client-sdk logic)
   - Stream or batch-send to an ASR endpoint (OpenAI Whisper or other free ASR API)
2. **Chatbot**
   - Send ASR transcript + minimal context to OpenAI GPT-3.5/4 API
   - Receive text response
3. **TTS & Voice Customization**
   - Integrate a TTS service (AWS Polly or similar)
   - UI toggle for two voices (e.g., male/female)
   - Play synthesized audio back to user
4. **UI/UX**
   - Minimal React wireframe
   - Buttons: Talk, Stop, Play Response; Dropdown: Voice Selection
5. **Optional Memory Layer**
   - Store last 3 transcripts in localStorage as encrypted blobs (AES-GCM, see sdk.js in task-B)
6. **Error Handling & Logging**
   - Surface basic errors (network, decryption) in UI

## Setup

1. Clone repo and install dependencies:
   ```sh
   cd task-C
   npm install
   ```
2. Create a `.env` file with the following (see below for details):
   ```env
   REACT_APP_OPENAI_API_KEY=your-openai-key
   REACT_APP_TTS_API_KEY=your-tts-key
   REACT_APP_TTS_REGION=your-tts-region
   # (Optional) For AWS Polly:
   REACT_APP_AWS_ACCESS_KEY_ID=...
   REACT_APP_AWS_SECRET_ACCESS_KEY=...
   REACT_APP_AWS_REGION=us-east-1
   ```

## Running the Demo

```sh
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables
- `REACT_APP_OPENAI_API_KEY`: OpenAI API key for GPT/Whisper
- `REACT_APP_TTS_API_KEY`: API key for TTS provider (or AWS credentials for Polly)
- `REACT_APP_TTS_REGION`: Region for TTS provider
- `REACT_APP_AWS_ACCESS_KEY_ID`, `REACT_APP_AWS_SECRET_ACCESS_KEY`, `REACT_APP_AWS_REGION`: For AWS Polly (if used)

## Architecture
- **Frontend**: React, Web Audio API, minimal UI
- **ASR**: OpenAI Whisper API (or stub)
- **Chatbot**: OpenAI GPT-3.5/4 API
- **TTS**: AWS Polly or similar
- **Encryption**: AES-GCM (see task-B/demo/src/sdk.js)

## File Structure
```
task-C/
  README.md
  package.json
  src/
    App.js
    sdk.js
    ...
```

## References
- See `task-B/demo/src/sdk.js` for encryption/VAD stubs
- See `task-B/demo/src/App.js` for AWS upload/decrypt flow
- See `notes.txt` for S3, KMS, and API Gateway details (if needed)

## License
MIT 