# vue-ws-link

Vue 3 WebSocket 客户端库，提供应用级共享连接、消息收发、断线重连、5 秒应用层心跳，以及断网暂停重试、网络恢复后立即重连。仓库包含 Vite 演示页面，npm 发布包仅包含 `dist` 和本说明。

## 本地运行

```bash
npm install
npm run dev
```

演示页面连接 `wss://echo.websocket.org`。浏览器 WebSocket 不开放协议级 Ping 帧，因此默认每 5 秒发送应用层 JSON 心跳；生产服务端需按约定处理心跳消息。

## 发布到 npm

首次发布或每次准备新版本时，先在 `package.json` 更新版本号。已发布过的版本号不能重复使用：

```bash
npm version patch   # 修复版本，例如 1.0.0 -> 1.0.1
# 或 npm version minor  # 新增兼容功能，例如 1.0.0 -> 1.1.0
# 或 npm version major  # 不兼容改动，例如 1.0.0 -> 2.0.0
```

安装锁文件中的依赖，构建并预览 npm 实际会上传的文件：

```bash
npm ci
npm run release:check
```

打包清单应只包含 `package.json`、`README.md` 和 `dist/` 下的 JS 与 `.d.ts` 文件。`package.json` 的 `files` 白名单会排除 demo、源码、隐藏文件、`.idea` 等内容；`.gitignore` 用于 Git 忽略规则，不代替 npm 打包清单。

确认版本号和清单无误后发布：

```bash
npm publish
```

包已在 `package.json` 固定为公开发布到 npm 官方 registry。`prepublishOnly` 会在发布前自动重新构建，因此正常发布时不需要手动再跑一次 build；`release:check` 用于发布前预览 tarball。

### 使用当前安全密钥进行双因素验证

账号设置显示已启用安全密钥时，不需要安装验证器或猜 6 位数字。使用电脑的 Touch ID / 系统安全密钥，或已绑定的实体安全密钥：

1. 在项目终端运行 `npm publish`。
2. 按 npm CLI 提示打开它给出的 npm 登录/验证链接。
3. 在打开的 npm 页面选择 **Use security key**，按浏览器提示使用 Touch ID 或安全密钥。
4. 若页面生成一次性验证 token，将其复制回 CLI 的 **Enter OTP** 提示。它是安全密钥流程生成的临时 token，不是密码，也不是验证器里的 6 位码。
5. 等待 CLI 显示发布成功，再检查包页版本号。

如果 CLI 只显示 `Enter OTP` 且没有验证链接，先运行 `npm login`，按终端给出的链接完成安全密钥验证，再重新运行 `npm publish`。不要运行 `npm stage publish`，那会进入单独的 staged publishing 流程。

发布完成后，其他 Vue 3 项目可以安装：

```bash
npm install vue-ws-link
```

## 在 Vue 项目中使用

在 `main.ts` / `main.js` 创建并注册一次。URL 使用函数时，每次连接或自动重连都会读取最新 token：

```ts
import { createApp } from 'vue'
import { createWebSocket } from 'vue-ws-link'
import App from './App.vue'

const app = createApp(App)
const ws = createWebSocket({
  url: () => {
    const token = localStorage.getItem('token')
    return `wss://example.com/ws?token=${encodeURIComponent(token ?? '')}`
  },
  immediate: false, // 先判断登录状态，避免未登录时连接
  heartbeatInterval: 5000,
  heartbeatMessage: JSON.stringify({ type: 'ping' }),
  reconnect: true,
  reconnectInterval: 3000,
  // 按后端实际推送格式修改消息类型和 token 字段。
  getTokenFromMessage(data) {
    if (!data || typeof data !== 'object') return undefined
    const message = data as { type?: unknown; token?: unknown }
    return message.type === 'token_refresh' && typeof message.token === 'string'
      ? message.token
      : undefined
  },
  onToken(token) {
    localStorage.setItem('token', token)
  },
})

app.use(ws)
if (localStorage.getItem('token')) ws.connect()
app.mount('#app')
```

登录成功时保存 token 后连接；退出登录时断开并清除 token：

```ts
localStorage.setItem('token', loginResult.token)
ws.connect()

ws.disconnect()
localStorage.removeItem('token')
```

各页面调用 `useWebSocket()` 获取相同的状态和连接，不会创建新 WebSocket，也不会因页面组件卸载而断开：

```vue
<script setup lang="ts">
import { useWebSocket } from 'vue-ws-link'

const { status, connected, messages, lastMessage, send, clearMessages } = useWebSocket()
send({ type: 'chat', text: '你好' })
</script>

<template>
  <p>状态：{{ status }} / {{ connected ? '在线' : '离线' }}</p>
  <button :disabled="!connected" @click="send({ type: 'ping' })">发送</button>
  <pre v-if="lastMessage">{{ lastMessage.data }}</pre>
  <div v-for="(message, index) in messages" :key="index">{{ message.data }}</div>
</template>
```

状态值：`connecting | open | closing | closed | reconnecting`。手动 `disconnect()` 会停止心跳和重连；之后可再次 `connect()`。如果服务端要求特定 token 参数格式，请按服务端约定拼接 URL。

当服务端推送匹配 `getTokenFromMessage` 的消息时，客户端会先调用 `onToken` 保存新 token，再立即断开旧连接并用 URL 函数读取的新 token 重连。token 推送消息不会进入普通消息列表。请把 `token_refresh` 和 `token` 替换成后端真实的消息类型和字段名。

## 独立客户端

也可不使用 Vue 注入，直接创建 `WebSocketClient` 并自行管理实例生命周期：

```ts
import { WebSocketClient } from 'vue-ws-link'

const client = new WebSocketClient({
  url: 'wss://example.com/ws',
  heartbeatInterval: 5000,
  onMessage: (event) => console.log('收到:', event.data),
})
client.connect()
client.send({ type: 'hello' })
client.disconnect()
```
