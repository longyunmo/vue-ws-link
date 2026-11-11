import { inject, readonly, ref, type App, type DeepReadonly, type InjectionKey, type Ref } from 'vue'
import { WebSocketClient, type WebSocketClientOptions, type WebSocketMessage, type WebSocketStatus } from './websocket-client'

export type UseWebSocketOptions = Omit<WebSocketClientOptions, 'onOpen' | 'onMessage' | 'onError' | 'onClose' | 'onStatusChange'> & {
  /** Keep false when the app should connect only after checking authentication. */
  immediate?: boolean
}

export interface UseWebSocketReturn {
  status: DeepReadonly<Ref<WebSocketStatus>>
  connected: DeepReadonly<Ref<boolean>>
  messages: DeepReadonly<Ref<MessageEvent[]>>
  lastMessage: DeepReadonly<Ref<MessageEvent | null>>
  connect: () => void
  disconnect: (code?: number, reason?: string) => void
  send: (data: WebSocketMessage | Record<string, unknown>) => boolean
  clearMessages: () => void
}

export type WebSocketPlugin = UseWebSocketReturn & { install: (app: App) => void }
const webSocketKey: InjectionKey<UseWebSocketReturn> = Symbol('vue-ws-link')

/** Create one app-wide WebSocket service and install it with app.use(service). */
export function createWebSocket(options: UseWebSocketOptions): WebSocketPlugin {
  const status = ref<WebSocketStatus>('closed')
  const connected = ref(false)
  const messages = ref<MessageEvent[]>([])
  const lastMessage = ref<MessageEvent | null>(null)
  const client = new WebSocketClient({
    ...options,
    onStatusChange(value) { status.value = value; connected.value = value === 'open' },
    onMessage(event) { lastMessage.value = event; messages.value.push(event) },
  })
  const service: WebSocketPlugin = {
    status: readonly(status),
    connected: readonly(connected),
    messages: readonly(messages),
    lastMessage: readonly(lastMessage),
    connect: () => client.connect(),
    disconnect: (code, reason) => client.disconnect(code, reason),
    send: (data) => client.send(data),
    clearMessages: () => { messages.value = []; lastMessage.value = null },
    install(app) { app.provide(webSocketKey, service) },
  }
  if (options.immediate) service.connect()
  return service
}

/** Use the app-wide service created once with createWebSocket() in main.ts. */
export function useWebSocket(): UseWebSocketReturn {
  const service = inject(webSocketKey)
  if (!service) throw new Error('WebSocket 未初始化，请先在 main.ts 调用 app.use(createWebSocket(...))')
  return service
}
