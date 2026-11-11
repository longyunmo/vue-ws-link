export type WebSocketStatus = 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting'
export type WebSocketMessage = string | ArrayBuffer | Blob | ArrayBufferView

export interface WebSocketClientOptions {
  url: string | (() => string)
  protocols?: string | string[]
  /** Heartbeat payload. Defaults to JSON { type: 'ping' }. */
  heartbeatMessage?: WebSocketMessage
  heartbeatInterval?: number
  /** If supplied, only matching messages count as pong responses. */
  isHeartbeatResponse?: (data: unknown) => boolean
  /** Extract a refreshed credential from an application message. */
  getTokenFromMessage?: (data: unknown) => string | null | undefined
  /** Persist the refreshed credential before the client reconnects. */
  onToken?: (token: string) => void
  reconnect?: boolean
  reconnectInterval?: number
  maxReconnectAttempts?: number
  /** Called when a connection opens, including after reconnect. */
  onOpen?: (event: Event) => void
  onMessage?: (event: MessageEvent) => void
  onError?: (event: Event | Error) => void
  onClose?: (event: CloseEvent) => void
  onStatusChange?: (status: WebSocketStatus) => void
}

/** Browser WebSocket wrapper. A browser cannot send protocol-level ping frames; heartbeatMessage is an app-level message. */
export class WebSocketClient {
  private socket: WebSocket | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private manuallyClosed = false
  private currentStatus: WebSocketStatus = 'closed'
  private listeningForOnline = false
  private readonly handleOnline = () => {
    if (!this.manuallyClosed && !this.connected) {
      this.clearReconnectTimer()
      this.connect()
    }
  }

  constructor(private readonly options: WebSocketClientOptions) {}

  get status(): WebSocketStatus { return this.currentStatus }
  get connected(): boolean { return this.socket?.readyState === WebSocket.OPEN }

  connect(): void {
    if (typeof WebSocket === 'undefined') throw new Error('当前环境不支持 WebSocket')
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) return
    this.manuallyClosed = false
    this.listenForOnline()
    this.clearReconnectTimer()
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setStatus('reconnecting')
      return
    }
    this.setStatus(this.reconnectAttempts ? 'reconnecting' : 'connecting')
    const url = typeof this.options.url === 'function' ? this.options.url() : this.options.url
    let socket: WebSocket
    try {
      socket = new WebSocket(url, this.options.protocols)
    } catch (error) {
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)))
      if (!this.manuallyClosed && this.options.reconnect !== false) this.scheduleReconnect()
      else this.setStatus('closed')
      return
    }
    this.socket = socket

    socket.onopen = (event) => {
      if (socket !== this.socket) return
      this.reconnectAttempts = 0
      this.setStatus('open')
      this.startHeartbeat()
      this.options.onOpen?.(event)
    }
    socket.onmessage = (event) => {
      if (socket !== this.socket) return
      if (this.options.isHeartbeatResponse?.(event.data)) return
      const data = this.parseMessageData(event.data)
      const token = this.options.getTokenFromMessage?.(data)
      if (token) {
        this.options.onToken?.(token)
        this.disconnect()
        this.connect()
        return
      }
      this.options.onMessage?.(event)
    }
    socket.onerror = (event) => this.options.onError?.(event)
    socket.onclose = (event) => {
      if (socket !== this.socket) return
      this.stopHeartbeat()
      this.options.onClose?.(event)
      if (!this.manuallyClosed && this.options.reconnect !== false) this.scheduleReconnect()
      else this.setStatus('closed')
    }
  }

  send(data: WebSocketMessage | Record<string, unknown>): boolean {
    if (!this.connected || !this.socket) return false
    const payload = typeof data === 'string' || data instanceof Blob || data instanceof ArrayBuffer || ArrayBuffer.isView(data)
      ? data as WebSocketMessage
      : JSON.stringify(data)
    this.socket.send(payload)
    return true
  }

  /** Stops reconnect and heartbeat timers, then closes the active connection. */
  disconnect(code?: number, reason?: string): void {
    this.manuallyClosed = true
    this.stopListeningForOnline()
    this.clearReconnectTimer()
    this.stopHeartbeat()
    const socket = this.socket
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      this.setStatus('closing')
      socket.close(code, reason)
    } else this.setStatus('closed')
    this.socket = null
    this.setStatus('closed')
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    const interval = this.options.heartbeatInterval ?? 5000
    if (interval <= 0) return
    this.heartbeatTimer = setInterval(() => {
      const message = this.options.heartbeatMessage ?? JSON.stringify({ type: 'ping', timestamp: Date.now() })
      if (this.connected) this.socket?.send(message)
    }, interval)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  private scheduleReconnect(): void {
    const max = this.options.maxReconnectAttempts ?? Infinity
    if (this.reconnectAttempts >= max) { this.setStatus('closed'); return }
    this.setStatus('reconnecting')
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    this.reconnectAttempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.manuallyClosed) this.connect()
    }, this.options.reconnectInterval ?? 3000)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private listenForOnline(): void {
    if (typeof window === 'undefined' || this.listeningForOnline) return
    window.addEventListener('online', this.handleOnline)
    this.listeningForOnline = true
  }

  private stopListeningForOnline(): void {
    if (typeof window === 'undefined' || !this.listeningForOnline) return
    window.removeEventListener('online', this.handleOnline)
    this.listeningForOnline = false
  }

  private setStatus(status: WebSocketStatus): void {
    this.currentStatus = status
    this.options.onStatusChange?.(status)
  }

  private parseMessageData(data: unknown): unknown {
    if (typeof data !== 'string') return data
    try { return JSON.parse(data) as unknown } catch { return data }
  }
}
