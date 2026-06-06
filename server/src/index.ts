import 'dotenv/config'
import http from 'http'
import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import { Server } from 'socket.io'
import type { ServerToClientEvents, ClientToServerEvents } from './types'
import { AudioPipeline } from './audioPipeline'

const PORT = parseInt(process.env['PORT'] ?? '3000', 10)

const app = express()
const httpServer = http.createServer(app)

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*' },
})

const wss = new WebSocketServer({ server: httpServer, path: '/audio' })

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' })
})

wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url ?? '', `http://localhost:${PORT}`)
  const sessionId = url.searchParams.get('sessionId')

  if (!sessionId) {
    ws.close(1008, 'sessionId required')
    return
  }

  console.log(`[WS] connected sessionId=${sessionId}`)
  const pipeline = new AudioPipeline(sessionId, io)

  ws.on('message', (data: Buffer) => {
    pipeline.onChunk(data)
  })

  ws.on('close', () => {
    console.log(`[WS] closed sessionId=${sessionId}`)
    pipeline.destroy()
  })

  ws.on('error', (err) => {
    console.error(`[WS] error sessionId=${sessionId}:`, err)
  })
})

io.on('connection', (socket) => {
  socket.on('join_room', (sessionId: string) => {
    socket.join(sessionId)
    console.log(`[Socket.io] ${socket.id} joined room ${sessionId}`)
  })
})

httpServer.listen(PORT, () => {
  console.log(`[Server] listening on port ${PORT}`)
})
