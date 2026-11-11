import { createApp } from 'vue'
import App from './App.vue'
import { createWebSocket } from './index'
import './style.css'

const app = createApp(App)
const webSocket = createWebSocket({
  url: 'wss://echo.websocket.org',
  immediate: false,
  heartbeatInterval: 5000,
  heartbeatMessage: JSON.stringify({ type: 'ping' }),
  reconnect: true,
  reconnectInterval: 3000,
})
app.use(webSocket)

// 演示页连接公开 echo 服务；真实业务请在登录态有效时调用 connect()。
webSocket.connect()
app.mount('#app')
