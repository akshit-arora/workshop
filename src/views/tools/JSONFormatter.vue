<script setup lang="ts">
import VueJSONPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';
import { ref, computed } from 'vue';
const jsonData = ref('');

// Computed property to parse JSON if valid, else null
const parsedJson = computed(() => {
  try {
    return jsonData.value.trim() ? JSON.parse(jsonData.value) : null;
  } catch (e) {
    return null;
  }
});

// Method to copy formatted JSON to clipboard
function copyFormattedJson() {
  if (parsedJson.value) {
    navigator.clipboard.writeText(JSON.stringify(parsedJson.value, null, 2));
  }
}

function copyMinifiedJson() {
  if (parsedJson.value) {
    navigator.clipboard.writeText(JSON.stringify(parsedJson.value));
  }
}
</script>

<template>
    <div class="p-6">
        <h1 class="text-2xl font-bold mb-4">JSON Formatter</h1>
    </div>
    <!-- Add an input field for JSON data -->
    <div class="mb-6">
        <label for="jsonInput" class="block mb-2 text-sm font-medium text-gray-700">Enter JSON Data:</label>
        <textarea
            id="jsonInput"
            rows="6"
            class="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder='{"key": "value"}'
            style="font-family: monospace; white-space: pre-wrap; overflow-x: auto;"
            v-model="jsonData"
            @input="jsonData = jsonData.trim()"
            @keydown.enter.prevent="jsonData = jsonData.trim()"
        ></textarea>
    </div>
    <div class="card bg-base-100 shadow-xl p-6">
        <VueJSONPretty :data="parsedJson" />
        <!-- Add option to copy the formatted JSON -->
        <div v-if="parsedJson" class="mt-4">
            <button
                class="btn btn-primary"
                @click="copyFormattedJson"
            >
                Copy Formatted JSON
            </button>
            <button
                class="btn btn-primary ml-2"
                @click="copyMinifiedJson"
            >
                Copy Minified JSON
            </button>
            <button
                class="btn btn-secondary ml-2"
                @click="jsonData = ''"
            >
                Clear Input
            </button>
        </div>
    </div>
    <div v-if="!parsedJson" class="text-red-500 mt-4">
        Invalid JSON format. Please check your input.
    </div>
</template>
