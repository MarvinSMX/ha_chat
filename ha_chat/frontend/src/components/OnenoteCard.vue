<script setup lang="ts">
import { ref } from 'vue';

const apiBase = () => {
  const origin = window.location.origin;
  const path = (window.location.pathname || '/').replace(/\/$/, '');
  return path ? origin + path : origin;
};

const msg = ref('');
const currentNotebook = ref('');
const notebooks = ref<Array<{ id?: string; displayName?: string }>>([]);
const showList = ref(false);

async function loadNotebooks() {
  msg.value = 'Lade …';
  showList.value = false;
  try {
    const r = await fetch(apiBase() + '/api/onenote_status');
    const data = await r.json();
    msg.value = data.success ? (data.message || '') : (data.message || 'Fehler');
    if (data.notebooks?.length) {
      notebooks.value = data.notebooks;
      showList.value = true;
    }
    if (data.configured_notebook_name) {
      currentNotebook.value = 'Aktuell für Sync: ' + data.configured_notebook_name;
    }
  } catch (e) {
    msg.value = 'Fehler: ' + (e instanceof Error ? e.message : String(e));
  }
}

function selectNotebook(id: string, name: string) {
  msg.value = 'Speichere …';
  fetch(apiBase() + '/api/onenote_notebook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notebook_id: id, notebook_name: name }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.error) {
        msg.value = 'Fehler: ' + data.error;
      } else {
        msg.value = 'Gespeichert.';
        currentNotebook.value = 'Aktuell für Sync: ' + (name || id || '');
      }
    })
    .catch((e) => {
      msg.value = 'Fehler: ' + (e instanceof Error ? e.message : String(e));
    });
}
</script>

<template>
  <div class="onenote-card">
    <h3>OneNote – Notizbuch für Sync</h3>
    <p class="desc">Wähle das Notizbuch, das beim Sync in die Wissensbasis übernommen werden soll.</p>
    <button @click="loadNotebooks">Notizbücher laden</button>
    <p v-if="msg" class="msg">{{ msg }}</p>
    <p v-if="currentNotebook" class="current">{{ currentNotebook }}</p>
    <ul v-if="showList && notebooks.length" class="list">
      <li v-for="nb in notebooks" :key="nb.id || ''">
        <span>{{ nb.displayName || nb.id || 'Unbenannt' }}</span>
        <button
          type="button"
          class="secondary"
          @click="selectNotebook(nb.id ?? '', nb.displayName ?? '')"
        >
          Dieses Notizbuch für Sync verwenden
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.onenote-card {
  background: #2d2d2d;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.onenote-card h3 {
  margin: 0 0 8px 0;
  font-size: 1em;
}
.desc {
  font-size: 0.9em;
  color: #aaa;
  margin: 0 0 8px 0;
}
.onenote-card button {
  padding: 6px 12px;
  margin-right: 8px;
  margin-bottom: 4px;
  cursor: pointer;
  background: #0d47a1;
  color: #fff;
  border: none;
  border-radius: 4px;
}
.onenote-card button.secondary {
  background: #555;
}
.msg, .current {
  font-size: 0.85em;
  margin-top: 6px;
  color: #aaa;
}
.current {
  color: #82b1ff;
}
.list {
  list-style: none;
  padding: 0;
  margin: 8px 0 0 0;
  max-height: 200px;
  overflow-y: auto;
}
.list li {
  padding: 6px 8px;
  margin: 4px 0;
  background: #1c1c1c;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
