<script setup lang="ts">
</script>
<template>
    <div class="p-6">
        <h1 class="text-2xl font-bold mb-4">Tools</h1>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <router-link to="/tools/json-formatter" class="card bg-base-100 shadow-xl p-6">
                <h2 class="text-lg font-semibold mb-2">JSON Formatter</h2>
                <p>Format and validate your JSON data for better readability.</p>
            </router-link>
            <router-link to="/tools/markdown-previewer" class="card bg-base-100 shadow-xl p-6">
                <h2 class="text-lg font-semibold mb-2">Markdown Previewer</h2>
                <p>Write and preview Markdown in real-time with a split-pane view.</p>
            </router-link>
        </div>
    </div>
</template>
