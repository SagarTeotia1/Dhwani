import type { ASRProvider } from './interface'

export class SarvamASR implements ASRProvider {
  onPartial: (text: string) => void = () => {}
  onFinal: (text: string) => void = () => {}
  onError: (err: Error) => void = () => {}

  async connect(): Promise<void> {
    // TODO Step 4: open WebSocket to Sarvam streaming ASR endpoint
    // Endpoint: Sarvam streaming ASR API
    // Language: hi-IN, Model: saarika:v2
    // Auth: Authorization: Bearer ${SARVAM_API_KEY}
  }

  sendChunk(buffer: Buffer): void {
    // TODO Step 4: forward buffer to Sarvam WebSocket
  }

  close(): void {
    // TODO Step 4: close Sarvam WebSocket cleanly
  }
}
