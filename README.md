<div align="center">

# धwani

**Real-time call communication for deaf delivery partners**

*Open source · Hindi/Hinglish · Android · Works on Zomato, Swiggy, Zepto, Blinkit — any platform*

---

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Built with React Native](https://img.shields.io/badge/React_Native-Expo-blue)](https://expo.dev)
[![ASR: Sarvam AI](https://img.shields.io/badge/ASR-Sarvam_AI-orange)](https://sarvam.ai)

</div>

---

> **430 million people** live with disabling hearing loss globally.  
> In India, thousands of them work as delivery partners — and every time a customer calls, they have no way to respond.  
> Dhwani fixes that.

---

## What it does

When a customer calls a deaf delivery partner, Dhwani:

1. Captures the call audio directly from the Android device
2. Transcribes what the customer says in real time — Hindi, Hinglish, whatever they speak
3. Shows the text on the partner's screen instantly
4. Lets the partner reply by tapping a pre-recorded audio phrase

No separate app for the customer. No platform integration needed. Works on Zomato, Swiggy, Zepto, Blinkit, Dunzo — any delivery platform simultaneously.

---

## Demo

> 🎥 *[Demo GIF coming — first pilot with 5 deaf delivery partners in Delhi, week of launch]*

---

## Architecture

```
Customer speaks on call
        │
        ▼
Android mic (AudioRecord · VOICE_COMMUNICATION source)
        │  PCM 16-bit · 8kHz · 100ms chunks
        ▼
Node.js server (Railway) ──── chunks ────▶ Sarvam AI streaming ASR
        │                                         │
        │◀────── transcript:chunk (Socket.io) ────┘
        ▼
Partner's screen — live Hindi text
        │
        ▼
Partner taps phrase button → pre-recorded voice plays to customer
```

**Why Android mic capture and not platform telephony?**  
Because Zomato, Swiggy, and every other platform routes calls through their own
infrastructure — you can't intercept those calls without a platform deal. By capturing
audio at the device level, Dhwani works universally, on every platform, without
asking anyone's permission.

---

## Quick start

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Android device or emulator (Android 8+)
- Expo Go app on your device, OR Android Studio for APK builds
- [Sarvam AI API key](https://sarvam.ai) (free tier available)

### Setup

```bash
# 1. Clone
git clone https://github.com/yourusername/dhwani.git
cd dhwani

# 2. Install all dependencies (mobile + server in one command)
pnpm install

# 3. Configure environment
cp .env.example .env
# Edit .env and add your SARVAM_API_KEY

# 4. Start everything
pnpm dev
# This starts the Node.js server AND opens Expo simultaneously
```

### Run on your Android device

```bash
# Option A: Expo Go (easiest, for development)
pnpm --filter mobile start
# Scan the QR code with Expo Go app

# Option B: Build APK (for real pilot deployment)
pnpm --filter mobile build:android
# Follow prompts, get .apk file, sideload to device
```

### Deploy server to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway up --service server
```

Copy the Railway URL to your `.env` as `SERVER_URL`.

---

## Repository structure

```
dhwani/
├── mobile/                      React Native + Expo (TypeScript)
│   ├── app/
│   │   ├── index.tsx            Entry point, navigation
│   │   ├── home.tsx             HomeScreen — partner status
│   │   └── call.tsx             CallScreen — transcript + phrase buttons
│   ├── components/
│   │   ├── TranscriptBox.tsx    Live scrolling transcript
│   │   └── PhraseButton.tsx     Tappable audio reply button
│   ├── services/
│   │   ├── AudioCapture.ts      Mic capture + WebSocket stream
│   │   ├── SocketClient.ts      Socket.io events
│   │   └── PhrasePlayer.ts      Audio playback
│   ├── assets/audio/            6 pre-recorded .mp3 phrases
│   └── constants/phrases.ts     Phrase definitions
│
└── server/                      Node.js + TypeScript
    └── src/
        ├── index.ts             HTTP + WebSocket + Socket.io
        ├── audioPipeline.ts     Buffer + flush logic
        └── asr/
            ├── interface.ts     ASRProvider interface (swap providers here)
            └── sarvam.ts        Sarvam AI implementation
```

---

## The 6 phrases

These are pre-recorded in a real human voice (not TTS) and bundled with the app.
Partners tap a button, the customer hears the voice.

| Button | Hindi | Meaning |
|---|---|---|
| 1 | Pahunch raha hoon | I'm on my way |
| 2 | 5 minute mein aata hoon | Coming in 5 minutes |
| 3 | Main neeche hoon | I'm downstairs |
| 4 | OTP batayein please | Please share the OTP |
| 5 | Deliver ho gaya | Order delivered |
| 6 | Sunne mein takleef hai | I have a hearing difficulty |

---

## Adding a new ASR provider

Dhwani's ASR layer is abstracted behind a simple interface. To add Google Speech,
Whisper, Azure, or any other provider:

```typescript
// server/src/asr/interface.ts
export interface ASRProvider {
  connect(): Promise<void>
  sendChunk(buffer: Buffer): void
  close(): void
  onPartial: (text: string) => void
  onFinal: (text: string) => void
  onError: (err: Error) => void
}
```

Implement this interface in `server/src/asr/your_provider.ts`, then swap it in
`audioPipeline.ts`. Open a PR — we'll review and merge.

---

## Adding phrases in other languages

The phrase system is designed to be extended.

```typescript
// mobile/constants/phrases.ts
export const PHRASES_TAMIL = [
  { id: 'arriving_ta', label: 'வருகிறேன்', file: require('../assets/audio/arriving_ta.mp3') },
  // ...
]
```

Record phrases in the target language with a native speaker.
Add the audio files to `mobile/assets/audio/`.
Open a PR with the phrase file and a brief description of the language/region.

---

## Known limitations (Phase 1)

- **Android only** — iOS blocks call audio capture at the OS level. iOS support requires platform SDK integration (Phase 3).
- **Hindi/Hinglish only** — Tamil, Telugu, Bengali phrase sets are community contributions we'd love.
- **No persistence** — calls are not logged. Phase 2 adds an ops dashboard.
- **Tested on Android 8–14** — may behave differently on very old devices.
- **AudioRecord device variance** — `VOICE_COMMUNICATION` audio source works on most devices but not all. See [troubleshooting](#troubleshooting).

---

## Troubleshooting

### Transcript shows nothing / is always empty

Most likely cause: wrong audio source. The app uses `audioSource: 7` (VOICE_COMMUNICATION).
On some Samsung devices this returns silence. Try:

1. Make sure a call is actively in progress when capture starts
2. If still silent, open an issue with your device model — we'll add a device-specific override

### App gets killed mid-call

Android's battery optimisation kills background processes. Fix:

1. Go to Settings → Apps → Dhwani → Battery → "Unrestricted"
2. On Samsung: Settings → Device Care → Battery → Background usage limits → Dhwani → "No restrictions"

### Sarvam API returns 401

Your `SARVAM_API_KEY` is not set correctly. Check:
- Local dev: is it in `.env`? Is the server restarted after adding it?
- Railway: is it set in Railway's environment variables dashboard?

### High latency (transcript takes 3+ seconds)

Increase the chunk flush interval in `server/src/audioPipeline.ts`:
```ts
const FLUSH_INTERVAL_BYTES = 4800  // default: 300ms of audio
// Try: 8000  (500ms) for better accuracy at the cost of slight latency
```

---

## Contributing

Contributions are very welcome. Before opening a PR:

1. Read `CLAUDE.md` — it explains every architectural decision
2. Check open issues for what's needed most
3. For new features: open an issue first to discuss before building

**Highest priority contributions right now:**
- [ ] Tamil phrase set with native speaker audio
- [ ] Telugu phrase set with native speaker audio  
- [ ] Google Speech ASR provider implementation
- [ ] iOS investigation — does any call audio capture method exist?
- [ ] Call state detection on more device models
- [ ] Accessibility audit of the UI itself

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and PR guidelines.

---

## Roadmap

**Phase 1 (current) — Android demo**  
Works. 5 deaf delivery partners piloting in Delhi.

**Phase 2 — Ops dashboard + partner onboarding**  
Web dashboard for NGOs and fleet operators. Call logs. Complaint delta tracking.

**Phase 3 — Platform SDK**  
Zomato, Swiggy, Uber embed Dhwani directly. No separate app needed for partners.
WebRTC replaces Android mic capture. iOS becomes possible.

---

## Why this matters

Gig delivery work is one of the most accessible employment paths for deaf people in India —
no office, no team meetings, no phone calls required. Except there is one phone call:
the customer calling to find out where their order is.

That one call is the gap Dhwani fills.

This project started as a 4-week build by a 21-year-old CS student in Delhi.
If you're a deaf delivery partner, an NGO working with the deaf community,
or a developer who wants to help — you're in the right place.

---

## Tech stack

- [React Native](https://reactnative.dev) + [Expo](https://expo.dev)
- [TypeScript](https://www.typescriptlang.org)
- [Sarvam AI](https://sarvam.ai) — Hindi/Hinglish ASR
- [Socket.io](https://socket.io)
- [Railway](https://railway.app)
- [react-native-audio-record](https://github.com/goodatlas/react-native-audio-record)
- [expo-av](https://docs.expo.dev/versions/latest/sdk/av/)

---

## License

MIT — do whatever you want with this. If you deploy it for deaf workers in your city,
we'd love to hear about it. Open an issue or reach out.

---

## Acknowledgements

Built by [Sagar Teotia](https://sagarteotia.in) as part of Dhwani's open source initiative.  
ASR powered by [Sarvam AI](https://sarvam.ai).  
Inspired by every deaf delivery partner who figured out a workaround because no one built a solution.

---

<div align="center">
  <sub>If this helped someone, star the repo. If it needs fixing, open a PR.</sub>
</div>
