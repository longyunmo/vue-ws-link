<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWebSocket } from './use-websocket'

const draft = ref('Hello WebSocket')
const ws = useWebSocket()
const statusLabel = computed(() => ({ connecting: '连接中', open: '已连接', closing: '断开中', closed: '已断开', reconnecting: '重连中' })[ws.status.value])
function send() { if (draft.value.trim()) ws.send({ type: 'message', data: draft.value, timestamp: new Date().toISOString() }) }
function format(data: unknown) { return typeof data === 'string' ? data : JSON.stringify(data) }
</script>

<template>
  <main class="shell">
    <header><span class="eyebrow">VUE 3 · WEBSOCKET</span><h1>实时连接控制台</h1><p>连接、收发消息、自动重连与 5 秒应用层心跳。</p></header>
    <section class="card connection">
      <div class="section-title"><div><span class="eyebrow">连接状态</span><h2>WebSocket</h2></div><span class="status" :class="ws.status.value"><i></i>{{ statusLabel }}</span></div>
      <div class="endpoint">wss://echo.websocket.org</div>
      <div class="actions"><button class="primary" :disabled="ws.connected.value" @click="ws.connect">建立连接</button><button :disabled="!ws.connected.value" @click="ws.disconnect()">主动断开</button></div>
      <div class="facts"><span>心跳间隔 <b>5 秒</b></span><span>自动重连 <b>开启</b></span><span>重连间隔 <b>3 秒</b></span></div>
    </section>
    <section class="card">
      <div class="section-title"><div><span class="eyebrow">消息通道</span><h2>发送消息</h2></div></div>
      <form class="composer" @submit.prevent="send"><input v-model="draft" placeholder="输入要发送的内容" :disabled="!ws.connected.value" /><button class="primary" :disabled="!ws.connected.value">发送</button></form>
    </section>
    <section class="card log-card">
      <div class="section-title"><div><span class="eyebrow">实时数据</span><h2>消息记录 <small>{{ ws.messages.value.length }}</small></h2></div><button class="quiet" @click="ws.clearMessages">清空</button></div>
      <div v-if="ws.messages.value.length" class="messages"><article v-for="(message, index) in [...ws.messages.value].reverse()" :key="index"><span class="message-dot"></span><div><div class="message-meta">收到消息 <time>{{ new Date(message.timeStamp).toLocaleTimeString() }}</time></div><pre>{{ format(message.data) }}</pre></div></article></div>
      <div v-else class="empty"><span>⌁</span><p>还没有收到消息</p><small>连接服务端后，收到的内容会显示在这里。</small></div>
    </section>
    <footer>此连接由应用入口统一管理；退出登录时主动断开。</footer>
  </main>
</template>
