# CLAUDE.md — Dhwani

> Read this entire file before writing a single line of code.
> Every architectural decision is here and has a reason behind it.

---

## What Dhwani is

Dhwani is an open-source real-time call communication assistant for deaf and
hard-of-hearing gig delivery partners. When a customer calls a deaf Zomato,
Swiggy, Zepto, or Blinkit partner, Dhwani:

1. Captures call audio from the Android device microphone
2. Streams raw PCM audio to a Node.js server over WebSocket
3. Pipes audio to Sarvam AI for streaming Hindi/Hinglish transcription
4. Pushes the transcript to the partner's screen via Socket.io in real time
5. Lets the partner respond by tapping a pre-recorded audio phrase button

No Twilio. No virtual numbers. No platform deals. Works on every delivery app
simultaneously because it captures device-level audio, not platform telephony.

---

## Why open source

This project is intentionally open source. The goal is:

- Deaf delivery partners in India can use it today, free
- Developers globally can fork it for deaf ride-share drivers, couriers, anyone
- The community can swap ASR providers (Sarvam → Whisper → Google) via the
  abstracted ASR interface
- Accessibility developers can contribute phrase sets in Tamil, Telugu, Bengali

This is why the stack prioritises contributor accessibility over raw performance.

---

## Monorepo structure

```
dhwani/
├── CLAUDE.md                    ← you are here
├── README.md
├── package.json                 ← pnpm workspace root
├── pnpm-workspace.yaml
├── .env.example                 ← copy to .env, fill in SARVAM_API_KEY
│
├── mobile/                      ← React Native + Expo (TypeScript)
│   ├── app/
│   │   ├── index.tsx            ← entry, navigation setup
│   │   ├── home.tsx             ← HomeScreen
│   │   └── call.tsx             ← CallScreen
│   ├── components/
│   │   ├── TranscriptBox.tsx    ← scrolling live transcript display
│   │   └── PhraseButton.tsx     ← tappable audio reply button
│   ├── services/
│   │   ├── AudioCapture.ts      ← mic capture, PCM streaming
│   │   ├── SocketClient.ts      ← Socket.io connection + events
│   │   └── PhrasePlayer.ts      ← MediaPlayer wrapper for .mp3 files
│   ├── assets/
│   │   └── audio/               ← 6 pre-recorded .mp3 phrase files
│   ├── constants/
│   │   └── phrases.ts           ← phrase definitions (text + audio file ref)
│   ├── app.json
│   ├── tsconfig.json
│   └── package.json
│
└── server/                      ← Node.js + TypeScript
    ├── src/
    │   ├── index.ts             ← HTTP + WebSocket + Socket.io setup
    │   ├── audioPipeline.ts     ← buffers PCM, flushes to ASR
    │   ├── asr/
    │   │   ├── interface.ts     ← ASRProvider interface (swap providers here)
    │   │   └── sarvam.ts        ← Sarvam AI implementation
    │   └── types.ts
    ├── tsconfig.json
    └── package.json
```

---

## Tech stack — every choice explained

| Layer | Choice | Why NOT the alternative |
|---|---|---|
| Mobile framework | React Native + Expo | Kotlin would limit contributors to Android devs only. RN opens to all JS/TS devs. |
| Mobile language | TypeScript | Signals seriousness. Better DX for contributors. |
| Audio capture | `react-native-audio-record` + `VOICE_COMMUNICATION` audio source | This source captures the call audio path, not ambient mic. Critical difference. |
| Audio format | PCM 16-bit, 8kHz, mono | Exactly what Sarvam expects. Minimal bandwidth. |
| Chunk size | 100ms (1,600 bytes) | Balances real-time latency vs WebSocket overhead. |
| Transport | Binary WebSocket (raw PCM) | No base64 encoding overhead. Raw bytes are 33% smaller. |
| Server language | Node.js + TypeScript | Same language as mobile. Contributors don't context-switch. |
| ASR | Sarvam AI | Only Indian ASR built specifically for Hindi/Hinglish. Lowest WER on street audio. |
| ASR abstraction | `ASRProvider` interface | Community can swap in Whisper, Google, Azure without touching pipeline logic. |
| Real-time push | Socket.io | Handles reconnection automatically. Every web dev knows it. |
| Hosting | Railway | One-click deploy. `railway up` in the README. Zero infra knowledge needed. |
| Package manager | pnpm workspaces | Single `pnpm install` sets up both mobile and server. |

---

## Environment variables

```env
# Copy .env.example to .env and fill in:
SARVAM_API_KEY=your_key_here
PORT=3000
SERVER_URL=wss://your-railway-app.railway.app
NODE_ENV=development
```

`SERVER_URL` is the WebSocket endpoint the mobile app connects to.
In development use `ws://YOUR_LOCAL_IP:3000` (not localhost — device can't reach it).
In production use the Railway `wss://` URL.

Set `SERVER_URL` as a build-time constant in `mobile/constants/config.ts`.

---

## Mobile app — component specification

### HomeScreen (`mobile/app/home.tsx`)

- Full black screen. No navigation bar. No status bar.
- Partner name displayed at top (hardcoded `"Ravi"` for Phase 1 — no auth)
- Status indicator: green dot "● Ready" or gray dot "● Offline"
- One large button: "Go online" / "Go offline"
- On mount: connect SocketClient, register event listeners
- On `call:incoming` socket event: navigate to CallScreen, pass `sessionId`
- On unmount: disconnect socket

### CallScreen (`mobile/app/call.tsx`)

- Full black screen. No status bar.
- Auto-launched by HomeScreen when `call:incoming` fires
- Layout:
  - Top 60%: `<TranscriptBox>`
  - Bottom 40%: 2×3 grid of `<PhraseButton>`
- On mount: join socket room, start AudioCapture service
- On `call:ended` event: show "Call ended" for 2s, navigate back to HomeScreen
- On unmount: stop AudioCapture, leave socket room

### TranscriptBox (`mobile/components/TranscriptBox.tsx`)

Props: `segments: TranscriptSegment[]`

```ts
type TranscriptSegment = {
  id: string
  text: string
  isFinal: boolean
  timestamp: number
}
```

- ScrollView that auto-scrolls to bottom on every new segment
- Partial segments (isFinal: false): gray `#888`, italic, replaced when final arrives
- Final segments (isFinal: true): white `#FFF`, normal weight, appended permanently
- Font size: minimum 24sp — partner reads while riding
- Empty state: "Waiting for customer to speak..." centered, gray

### PhraseButton (`mobile/components/PhraseButton.tsx`)

Props: `{ label: string, audioFile: string, onPress: () => void }`

- Dark gray background `#1A1A1A`, white text, `#333` border
- On press: play audio via PhrasePlayer, brief visual flash to `#2A2A2A` for 150ms
- Debounce: 1.2s between taps on same button to prevent double-fire
- Different buttons can fire simultaneously

---

## Mobile app — service specification

### AudioCapture (`mobile/services/AudioCapture.ts`)

Uses `react-native-audio-record`.

```ts
// Config that must match exactly:
AudioRecord.init({
  sampleRate: 8000,
  channels: 1,
  bitsPerSample: 16,
  audioSource: 7,        // 7 = VOICE_COMMUNICATION — captures call audio path
  wavFile: '',           // no file, stream only
})
```

CRITICAL: `audioSource: 7` (`VOICE_COMMUNICATION`) not `1` (`MIC`).
`VOICE_COMMUNICATION` captures the voice call audio path on Android.
`MIC` captures ambient room noise. Wrong source = garbage transcript.

On `start()`: begin recording, on each chunk send binary frame to WebSocket.
On `stop()`: stop recording, close WebSocket cleanly.

The WebSocket connection is managed inside AudioCapture:
- Connect to `${SERVER_URL}/audio?sessionId=${sessionId}`
- Send each PCM chunk as binary message
- Reconnect with exponential backoff on disconnect

### SocketClient (`mobile/services/SocketClient.ts`)

Singleton. Wraps socket.io-client.
Exposes:
```ts
connect(partnerId: string, onEvent: (event: string, data: unknown) => void): void
disconnect(): void
joinRoom(sessionId: string): void
leaveRoom(sessionId: string): void
```

Events received:
- `call:incoming` → data: sessionId string
- `transcript:chunk` → data: `{ text: string, isFinal: boolean }`
- `call:ended` → no data

### PhrasePlayer (`mobile/services/PhrasePlayer.ts`)

Wraps `expo-av` Audio.
Preloads all 6 phrase sounds on init.
`play(audioFile: string)`: plays the corresponding sound immediately.
No async delay — sounds must be pre-loaded, not loaded on tap.

---

## The 6 phrases

These MUST be recorded with a real human voice. Not TTS. Not AI voice.
Record on any phone in a quiet room. Export as .mp3 at 128kbps mono.
Place in `mobile/assets/audio/`.

```ts
// mobile/constants/phrases.ts
export const PHRASES = [
  { id: 'arriving',   label: 'Pahunch raha hoon',      file: require('../assets/audio/arriving.mp3') },
  { id: 'five_min',   label: '5 minute mein aata hoon', file: require('../assets/audio/five_min.mp3') },
  { id: 'downstairs', label: 'Main neeche hoon',        file: require('../assets/audio/downstairs.mp3') },
  { id: 'otp',        label: 'OTP batayein',            file: require('../assets/audio/otp.mp3') },
  { id: 'delivered',  label: 'Deliver ho gaya',         file: require('../assets/audio/delivered.mp3') },
  { id: 'hearing',    label: 'Sunne mein takleef hai',  file: require('../assets/audio/hearing.mp3') },
]
```

---

## Server — component specification

### index.ts

Single entry point. Creates one HTTP server shared by Express, `ws`, and Socket.io.

```
GET  /health          → 200 OK  (Railway health check, must respond < 5s)
WS   /audio           → binary WebSocket, query: ?sessionId=XXX
     socket.io        → standard namespace
```

On WebSocket connection:
- Parse sessionId from query
- Instantiate AudioPipeline(sessionId, io)
- Pipe binary messages to pipeline.onChunk()
- On close: pipeline.flush(), pipeline.destroy()

On Socket.io connection:
- Client emits `join_room` with sessionId
- Server calls `socket.join(sessionId)`

### audioPipeline.ts

```ts
class AudioPipeline {
  constructor(sessionId: string, io: Server) {}

  onChunk(buffer: Buffer): void
  // Buffer chunks until 300ms of audio accumulated (4,800 bytes)
  // Then flush to ASR provider
  // Reset buffer

  private onPartial(text: string): void
  // io.to(sessionId).emit('transcript:chunk', { text, isFinal: false })

  private onFinal(text: string): void
  // io.to(sessionId).emit('transcript:chunk', { text, isFinal: true })

  flush(): void
  // Send remaining buffer to ASR

  destroy(): void
  // io.to(sessionId).emit('call:ended')
  // Clean up ASR connection
}
```

### asr/interface.ts

```ts
export interface ASRProvider {
  connect(): Promise<void>
  sendChunk(buffer: Buffer): void
  close(): void
  onPartial: (text: string) => void
  onFinal: (text: string) => void
  onError: (err: Error) => void
}
```

Any contributor can implement this interface to add a new ASR provider.
The pipeline only depends on this interface, never on Sarvam directly.

### asr/sarvam.ts

Implements `ASRProvider`.

```
Endpoint: Sarvam streaming ASR API
Language: hi-IN
Model: saarika:v2
Content-Type: audio/x-raw, rate=8000
Auth: Authorization: Bearer ${SARVAM_API_KEY}
```

On partial result: call `this.onPartial(text)`
On final result: call `this.onFinal(text)`
On error: call `this.onError(err)` — do NOT crash the server

---

## Build sequence — strict order, no skipping

### Step 1 — monorepo scaffold (Day 1 morning)

```bash
mkdir dhwani && cd dhwani
pnpm init
# create pnpm-workspace.yaml with packages: ['mobile', 'server']
# create .env.example
# scaffold mobile/ with expo: pnpm create expo-app mobile --template blank-typescript
# scaffold server/: mkdir server/src, add tsconfig, package.json
pnpm install
```

Verify: `pnpm --filter mobile start` launches Expo.
Verify: `pnpm --filter server dev` starts Node without errors.

### Step 2 — AudioRecord validation (Day 1 afternoon — CRITICAL gate)

This is the most important test in the entire project. Do it before any other mobile code.

```ts
// Temporary test in App.tsx:
import AudioRecord from 'react-native-audio-record'
AudioRecord.init({ sampleRate: 8000, channels: 1, bitsPerSample: 16, audioSource: 7 })
AudioRecord.on('data', (data) => {
  const bytes = Buffer.from(data, 'base64')
  const allZero = bytes.every(b => b === 0)
  console.log(`Chunk: ${bytes.length} bytes, allZero: ${allZero}`)
})
AudioRecord.start()
```

Make a real phone call to the test device.
Watch Metro logs.
Expected: chunks of ~1600 bytes, NOT all zero.

If all zero: the audio source is returning silence.
Try audioSource: 1 (MIC) and audioSource: 4 (VOICE_CALL).
Document which source works on which device model.
Do NOT proceed until you have non-silent audio.

### Step 3 — WebSocket stream (Day 2)

- Implement server `index.ts` with ws WebSocket endpoint
- Deploy to Railway: `railway up`
- Implement `AudioCapture.ts` to send chunks to Railway URL
- Server should log: `received ${bytes.length} bytes from ${sessionId}`
- Gate: continuous stream of ~1600-byte log lines during a test call

### Step 4 — Sarvam ASR (Day 2-3)

- Implement `asr/sarvam.ts`
- Implement `audioPipeline.ts`
- Wire into server WebSocket handler
- Test first with a static Hindi audio file, not a live call:
  ```bash
  curl -X POST https://your-app.railway.app/test-audio \
    --data-binary @test_hindi.raw
  ```
- Gate: Hindi text appears in server logs within 2 seconds of speech

### Step 5 — Socket.io + CallScreen (Day 3-4)

- Implement `SocketClient.ts`
- Wire HomeScreen → CallScreen navigation on `call:incoming`
- Implement `TranscriptBox` with live updates from socket events
- End-to-end test: real phone call → text appears on device screen
- Implement `PhraseButton` grid with `PhrasePlayer`
- Gate: full flow works — call → transcript on screen → tap phrase → hear audio

### Step 6 — APK build + pilot (Day 4-5)

```bash
cd mobile
npx expo run:android --variant release
# or: eas build --platform android --profile preview
```

Install APK on 5 partner devices.
Run one supervised test call per partner.
Gate: 5 partners have used Dhwani for at least one real delivery call.

---

## Android-specific requirements

### Required permissions in app.json

```json
{
  "expo": {
    "android": {
      "permissions": [
        "RECORD_AUDIO",
        "READ_PHONE_STATE",
        "READ_CALL_LOG",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_MICROPHONE",
        "WAKE_LOCK"
      ]
    }
  }
}
```

### Call state detection

Use `react-native-phone-call-state` or a custom native module to detect:
- `OFFHOOK` (call answered) → start AudioCapture
- `IDLE` (call ended) → stop AudioCapture, emit call:ended

Without call state detection the partner must manually tap "Start" which
defeats the purpose. Auto-detection is required for the pilot.

### Foreground service

Android kills background processes after ~60 seconds.
`react-native-audio-record` must run inside a foreground service.
The library handles this if `showNotification: true` is set in init config.
Set notification text to "Dhwani is listening to your call".

---

## Out of scope — Phase 1

Do not build any of the following. Add ideas to `TODO_PHASE2.md`.

- User authentication
- Database or call log persistence
- Ops dashboard
- iOS support (Apple blocks call audio capture at OS level)
- Twilio or virtual phone numbers
- Play Store release (APK sideload only)
- TTS for phrases (use pre-recorded human voice only)
- Custom phrase sets per platform
- Multi-language beyond Hindi/Hinglish
- Payment or subscription logic
- Admin interface
- Analytics

---

## Done criteria

Phase 1 is complete when ALL of the following are true:

1. Customer makes a real phone call to the partner's number
2. Within 2 seconds the customer's words appear on the partner's screen in Hindi
3. Partner taps a phrase button and hears the pre-recorded voice immediately
4. The server runs for 30 minutes without crashing
5. Works on Android 8+ devices with 2GB+ RAM (test on a ₹8,000 phone)
6. Five real deaf delivery partners have used it for at least one live delivery
7. The GitHub repo has a working README and one-command setup

---

## Code conventions

- TypeScript strict mode throughout (`"strict": true` in all tsconfigs)
- No `any` types — use `unknown` and narrow properly
- 2-space indent, single quotes, no semicolons (Prettier default)
- File naming: `PascalCase.tsx` for components, `camelCase.ts` for services
- Every async function returns `Promise<T>` explicitly, never inferred
- Errors are logged with context: `console.error('[AudioCapture] failed to send chunk:', err)`
- No console.log in production builds — use `__DEV__ && console.log()`
- Comments explain WHY, not WHAT. If the code doesn't explain itself, simplify it first.
- One feature per PR when open source contributions come in

---

## Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| AudioRecord returns all zeros | Wrong audio source | Try audioSource 1, 4, 7 — document per device |
| Transcript never appears | Socket room not joined before emit | Ensure `join_room` fires before `call:incoming` |
| App killed mid-call | No foreground service | Set `showNotification: true` in AudioRecord init |
| Sarvam 401 error | API key not in env | Check Railway env vars, not just local .env |
| High latency (>3s) | Chunk too small, too many requests | Increase flush interval from 300ms to 500ms |
| Phrase button fires twice | Missing debounce | 1200ms debounce on PhrasePlayer.play() |
