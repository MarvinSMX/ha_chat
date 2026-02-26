<script setup lang="ts">
import { ref, computed } from 'vue';
import ChatThread from './components/ChatThread.vue';
import OnenoteCard from './components/OnenoteCard.vue';

const errorMessage = ref('');
</script>

<template>
  <div class="app">
    <OnenoteCard />
    <ChatThread v-model:error="errorMessage" />
    <div v-if="errorMessage" class="error">{{ errorMessage }}</div>
  </div>
</template>

<style>
* { box-sizing: border-box; }
html, body, #app, .app {
  margin: 0;
  height: 100%;
  font-family: Roboto, sans-serif;
}
.app {
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: #1c1c1c;
  color: #e0e0e0;
}
.error {
  color: #ff8a80;
  margin-top: 8px;
  font-size: 0.9em;
}
</style>
