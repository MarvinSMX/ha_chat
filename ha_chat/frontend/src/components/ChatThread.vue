<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';

const emit = defineEmits<{ (e: 'update:error', v: string): void }>();
const threadEl = ref<HTMLElement | null>(null);

const apiBase = () => {
  const origin = window.location.origin;
  const path = (window.location.pathname || '/').replace(/\/$/, '');
  return path ? origin + path : origin;
};

async function parseJsonResponse(r: Response) {
  const text = await r.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    const msg = r.status ? `HTTP ${r.status}` : 'Antwort ist kein JSON';
    throw new Error(text?.indexOf('<') === 0 ? msg + ' – Fehlerseite' : msg);
  }
  if (!r.ok) {
    const err = (data as { error?: string })?.error ?? (r.status ? `HTTP ${r.status}` : 'Fehler');
    throw new Error(err);
  }
  return data as Record<string, unknown>;
}

const thread = ref<Array<{ role: 'user' | 'assistant'; content: string; sources?: Array<{ title: string; url: string }>; pending?: boolean }>>([]);
const input = ref('');
const sendDisabled = ref(false);

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function setLastAssistant(content: string, sources: Array<{ title: string; url: string }> = []) {
  for (let i = thread.value.length - 1; i >= 0; i--) {
    if (thread.value[i].role === 'assistant') {
      thread.value[i].content = content;
      thread.value[i].sources = sources;
      thread.value[i].pending = false;
      return;
    }
  }
}

async function send() {
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  thread.value.push({ role: 'user', content: text });
  thread.value.push({ role: 'assistant', content: '', pending: true });
  emit('update:error', '');
  sendDisabled.value = true;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const r = await fetch(apiBase() + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await parseJsonResponse(r);
    if ((data as { error?: string }).error) {
      emit('update:error', (data as { error: string }).error);
      setLastAssistant('Fehler: ' + (data as { error: string }).error);
    } else {
      const res = data as { answer?: string; sources?: Array<{ title: string; url: string }> };
      setLastAssistant(res.answer ?? '', res.sources ?? []);
    }
  } catch (e: unknown) {
    clearTimeout(timeoutId);
    const err = e instanceof Error ? e.message : String(e);
    emit('update:error', err);
    const msg = e instanceof Error && e.name === 'AbortError'
      ? 'Zeitüberschreitung. Bitte erneut versuchen.'
      : 'Verbindung fehlgeschlagen. Add-on-Log prüfen oder Seite neu laden.';
    setLastAssistant(msg);
  } finally {
    sendDisabled.value = false;
  }
}

watch(thread, () => {
  nextTick(() => {
    if (threadEl.value) threadEl.value.scrollTop = threadEl.value.scrollHeight;
  });
}, { deep: true });
</script>

<template>
  <div class="thread" ref="threadEl">
    <div
      v-for="(m, i) in thread"
      :key="i"
      :class="['msg', m.role]"
    >
      <div v-if="m.pending" class="content typing">
        <span class="typing-indicator"><span></span><span></span><span></span></span>
      </div>
      <template v-else>
        <div class="content">{{ m.content }}</div>
        <div v-if="m.sources?.length" class="sources">
          Quellen:
          <a v-for="(s, j) in m.sources" :key="j" :href="s.url" target="_blank" rel="noopener">{{ s.title }}</a>
        </div>
      </template>
    </div>
  </div>
  <div class="input-row">
    <input v-model="input" type="text" placeholder="Frage stellen..." @keydown.enter="send" />
    <button @click="send" :disabled="sendDisabled">Senden</button>
  </div>
</template>

<style scoped>
.thread {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 16px;
}
.msg {
  margin: 8px 0;
  padding: 10px 12px;
  border-radius: 8px;
  max-width: 85%;
}
.msg.user {
  background: #0d47a1;
  color: #fff;
  margin-left: auto;
}
.msg.assistant {
  background: #2d2d2d;
  border: 1px solid #444;
}
.msg .content {
  white-space: pre-wrap;
  word-break: break-word;
}
.typing-indicator {
  display: inline-flex;
  gap: 4px;
}
.typing-indicator span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #82b1ff;
  animation: typing 0.6s ease-in-out infinite both;
}
.typing-indicator span:nth-child(2) { animation-delay: 0.1s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.2s; }
@keyframes typing {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}
.sources {
  margin-top: 8px;
  font-size: 0.9em;
}
.sources a {
  color: #82b1ff;
  margin-right: 12px;
}
.input-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.input-row input {
  flex: 1;
  padding: 10px 12px;
  background: #2d2d2d;
  border: 1px solid #444;
  color: #e0e0e0;
  border-radius: 4px;
}
.input-row button {
  padding: 10px 20px;
  cursor: pointer;
  background: #0d47a1;
  color: #fff;
  border: none;
  border-radius: 4px;
}
.input-row button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
