import type { Server } from 'socket.io'
import type { ServerToClientEvents, ClientToServerEvents } from './types'
import { SarvamASR } from './asr/sarvam'

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>

export class AudioPipeline {
  private sessionId: string
  private io: IOServer
  private asr: SarvamASR
  private buffer: Buffer = Buffer.alloc(0)
  // 300ms at 8kHz 16-bit mono = 4,800 bytes
  private readonly FLUSH_BYTES = 4800

  constructor(sessionId: string, io: IOServer) {
    this.sessionId = sessionId
    this.io = io
    this.asr = new SarvamASR()
    this.asr.onPartial = (text) => this.onPartial(text)
    this.asr.onFinal = (text) => this.onFinal(text)
    this.asr.onError = (err) => console.error('[AudioPipeline] ASR error:', err)
  }

  onChunk(chunk: Buffer): void {
    // TODO Step 4: accumulate and flush to ASR
    this.buffer = Buffer.concat([this.buffer, chunk])
    if (this.buffer.length >= this.FLUSH_BYTES) {
      this.flush()
    }
  }

  private onPartial(text: string): void {
    this.io.to(this.sessionId).emit('transcript:chunk', { text, isFinal: false })
  }

  private onFinal(text: string): void {
    this.io.to(this.sessionId).emit('transcript:chunk', { text, isFinal: true })
  }

  flush(): void {
    if (this.buffer.length === 0) return
    // TODO Step 4: send this.buffer to ASR, reset buffer
    this.buffer = Buffer.alloc(0)
  }

  destroy(): void {
    this.flush()
    this.asr.close()
    this.io.to(this.sessionId).emit('call:ended')
  }
}
