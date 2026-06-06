export interface TranscriptChunk {
  text: string
  isFinal: boolean
}

export interface ServerToClientEvents {
  'transcript:chunk': (chunk: TranscriptChunk) => void
  'call:ended': () => void
  'call:incoming': (sessionId: string) => void
}

export interface ClientToServerEvents {
  join_room: (sessionId: string) => void
}
