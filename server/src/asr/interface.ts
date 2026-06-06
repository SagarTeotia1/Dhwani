export interface ASRProvider {
  connect(): Promise<void>
  sendChunk(buffer: Buffer): void
  close(): void
  onPartial: (text: string) => void
  onFinal: (text: string) => void
  onError: (err: Error) => void
}
