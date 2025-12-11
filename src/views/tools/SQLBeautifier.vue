<script setup lang="ts">
import { ref, computed } from 'vue';
import { format } from 'sql-formatter';

const sqlInput = ref('');
const error = ref('');

const formattedSql = computed(() => {
  if (!sqlInput.value.trim()) return '';
  try {
    error.value = '';
    return format(sqlInput.value);
  } catch (e) {
    error.value = (e as Error).message;
    return sqlInput.value;
  }
});

function copyFormatted() {
  if (formattedSql.value) {
    navigator.clipboard.writeText(formattedSql.value);
  }
}

function clearInput() {
    sqlInput.value = '';
}
</script>

<template>
    <div class="p-6">
        <h1 class="text-2xl font-bold mb-4">SQL Beautifier</h1>
        
        <div class="mb-6">
            <label for="sqlInput" class="block mb-2 text-sm font-medium text-gray-700">Enter SQL Query:</label>
            <textarea
                id="sqlInput"
                rows="6"
                class="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="SELECT * FROM users WHERE id = 1"
                v-model="sqlInput"
            ></textarea>
        </div>

        <div class="card bg-base-100 shadow-xl p-6">
            <div v-if="error" class="alert alert-error mb-4">
                <span>{{ error }}</span>
            </div>
            
            <div class="relative">
                <pre class="bg-gray-100 p-4 rounded-lg overflow-x-auto font-mono min-h-[100px]">{{ formattedSql }}</pre>
            </div>

            <div class="mt-4 flex gap-2">
                <button
                    class="btn btn-primary"
                    @click="copyFormatted"
                    :disabled="!formattedSql || !!error"
                >
                    Copy Formatted SQL
                </button>
                <button
                    class="btn btn-secondary"
                    @click="clearInput"
                >
                    Clear Input
                </button>
            </div>
        </div>
    </div>
</template>
