<script setup lang="ts">
import { ref, onMounted, computed, inject } from 'vue';
import type { Ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

interface LogEntry {
    timestamp: string;
    environment: string;
    level: string;
    message: string;
    context: string;
    stackTrace: string;
    id: number;
    isOpen: boolean;
}

const logFiles = ref<string[]>([]);
const selectedFile = ref<string | null>(null);
const parsedLogs = ref<LogEntry[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);
const searchQuery = ref('');

const selectedProject = inject<Ref<any>>('selectedProject');
const isLaravelProject = inject<Ref<boolean>>('isLaravelProject');

const filteredLogs = computed(() => {
    if (!searchQuery.value) return parsedLogs.value;
    const query = searchQuery.value.toLowerCase();
    return parsedLogs.value.filter(log => 
        log.message.toLowerCase().includes(query) || 
        log.level.toLowerCase().includes(query) ||
        log.environment.toLowerCase().includes(query)
    );
});

const fetchLogFiles = async () => {
    if (!selectedProject?.value?.id) return;
    
    if (!isLaravelProject?.value) {
        error.value = 'This tool is only available for Laravel projects.';
        return;
    }

    isLoading.value = true;
    error.value = null;
    try {
        const files = await invoke<string[]>('get_log_files', { id: String(selectedProject.value.id) });
        logFiles.value = files;
        if (files.length > 0) {
            selectFile(files[0]);
        } else {
            // clear logs if no files
            parsedLogs.value = [];
            selectedFile.value = null;
        }
    } catch (e) {
        console.error(e);
        error.value = 'Failed to fetch log files.';
    } finally {
        isLoading.value = false;
    }
};

const selectFile = async (filename: string) => {
    if (!selectedProject?.value?.id) return;
    selectedFile.value = filename;
    isLoading.value = true;
    parsedLogs.value = [];
    try {
        const content = await invoke<string>('read_log_file', { id: String(selectedProject.value.id), filename });
        parseLogs(content);
    } catch (e) {
        console.error(e);
        error.value = `Failed to read ${filename}`;
    } finally {
        isLoading.value = false;
    }
};

const parseLogs = (content: string) => {
    const lines = content.split('\n');
    const entries: LogEntry[] = [];
    let currentEntry: Partial<LogEntry> | null = null;
    let stackTraceBuffer: string[] = [];
    
    // Regex for log header: [2024-12-04 08:51:00] local.ERROR:
    const logHeaderRegex = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] (\w+)\.(\w+): (.*)/;

    lines.forEach((line, index) => {
        const match = line.match(logHeaderRegex);
        if (match) {
            // Save previous entry if exists
            if (currentEntry) {
                (currentEntry as any).stackTrace = stackTraceBuffer.join('\n');
                entries.push(currentEntry as LogEntry);
            }

            // Start new entry
            stackTraceBuffer = [];
            currentEntry = {
                id: index,
                timestamp: match[1],
                environment: match[2],
                level: match[3],
                message: match[4],
                context: '', // Context usually follows message, need better parsing if context is complex
                isOpen: false
            };
        } else {
            if (currentEntry) {
                stackTraceBuffer.push(line);
            }
        }
    });

    // Push last entry
    if (currentEntry) {
        (currentEntry as any).stackTrace = stackTraceBuffer.join('\n');
        entries.push(currentEntry as LogEntry);
    }

    parsedLogs.value = entries.reverse(); // Show newest first
};

const openInEditor = async (path: string, line: number = 1) => {
    const editor = localStorage.getItem('defaultEditor') || 'VSCode';
    try {
        await invoke('open_in_editor', { editor, location: path, line });
    } catch (e) {
        console.error('Failed to open editor', e);
        alert('Failed to open editor: ' + e);
    }
};

// Helper to render stack trace with clickable links
// We will use a component or method to render this in the template
const formatStackTrace = (trace: string) => {
    if (!trace) return [];
    return trace.split('\n').map(line => {
        // Look for file paths like /path/to/file.php(123) or /path/to/file.php:123
        // Also handle standard laravel stack trace format: #0 /path/to/file.php(123): ...
        const match = line.match(/(\/[a-zA-Z0-9_\-\/.]+\.php)[\(:](\d+)[\)]?/);
        if (match) {
            return {
                text: line,
                hasLink: true,
                path: match[1],
                line: parseInt(match[2])
            };
        }
        return { text: line, hasLink: false };
    });
};

const getLevelClass = (level: string) => {
    switch (level.toUpperCase()) {
        case 'ERROR': return 'text-error';
        case 'WARNING': return 'text-warning';
        case 'INFO': return 'text-info';
        case 'DEBUG': return 'text-secondary';
        case 'CRITICAL': return 'text-error font-bold';
        case 'ALERT': return 'text-error font-bold';
        case 'EMERGENCY': return 'text-error font-bold';
        default: return 'text-base-content';
    }
};

import { watch } from 'vue';

watch(() => selectedProject?.value, (newVal) => {
    if (newVal) {
        fetchLogFiles();
    } else {
        logFiles.value = [];
        parsedLogs.value = [];
    }
});

onMounted(() => {
    fetchLogFiles();
});
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <!-- Header -->
        <div class="navbar bg-base-200 border-b border-base-300 px-4 min-h-[4rem] flex flex-wrap gap-4">
            <div class="flex items-center gap-4 flex-1 min-w-0">
                <h1 class="text-xl font-bold flex items-center gap-2 whitespace-nowrap">
                    <span class="text-2xl">📋</span> Log Manager
                </h1>
                
                <!-- Log File Selector -->
                <select 
                    v-if="logFiles.length > 0"
                    v-model="selectedFile"
                    @change="selectFile(selectedFile!)"
                    class="select select-sm select-bordered w-full max-w-xs"
                >
                    <option v-for="file in logFiles" :key="file" :value="file">
                        {{ file }}
                    </option>
                </select>
                <div v-else class="text-sm opacity-50 italic whitespace-nowrap">
                    No log files found
                </div>
            </div>
            
            <div class="flex-none flex items-center gap-2">
                <div class="form-control">
                    <input type="text" v-model="searchQuery" placeholder="Search logs..." class="input input-sm input-bordered w-24 md:w-auto" />
                </div>
                <button class="btn btn-sm btn-ghost" @click="fetchLogFiles">
                    Refresh
                </button>
            </div>
        </div>

        <div v-if="error" class="p-8 text-center text-error">
            <h2 class="text-xl font-bold">Error</h2>
            <p>{{ error }}</p>
        </div>

        <div v-else class="flex-1 flex overflow-hidden">
            <!-- Main Content: Log Viewer -->
            <div class="flex-1 flex flex-col overflow-hidden bg-base-100 relative">
                <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-base-100/50 z-10">
                    <span class="loading loading-spinner loading-lg"></span>
                </div>

                <div class="flex-1 overflow-y-auto p-4 space-y-4">
                    <div v-if="filteredLogs.length === 0 && !isLoading" class="text-center opacity-50 mt-10">
                        No logs to display.
                    </div>

                    <div v-for="entry in filteredLogs" :key="entry.id" class="card bg-base-200 shadow-sm border border-base-300">
                        <div class="card-body p-4">
                            <div class="flex items-start gap-4 cursor-pointer" @click="entry.isOpen = !entry.isOpen">
                                <div class="flex-none pt-1">
                                    <div :class="`badge badge-outline ${getLevelClass(entry.level)}`">{{ entry.level }}</div>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="flex justify-between items-center mb-1">
                                        <span class="text-xs opacity-50 font-mono">{{ entry.timestamp }} • {{ entry.environment }}</span>
                                        <span class="text-xs opacity-50">{{ entry.isOpen ? 'Collapse' : 'Expand' }}</span>
                                    </div>
                                    <p class="font-mono text-sm break-words line-clamp-2" :class="{ 'line-clamp-none': entry.isOpen }">
                                        {{ entry.message }}
                                    </p>
                                </div>
                            </div>

                            <!-- Stack Trace Accordion -->
                            <div v-if="entry.isOpen && entry.stackTrace" class="mt-4 pt-4 border-t border-base-content/10">
                                <div class="mockup-code bg-base-300 text-xs shadow-inner max-h-96 overflow-y-auto">
                                    <pre class="px-4 py-2"><code><template v-for="(line, _idx) in formatStackTrace(entry.stackTrace || '')" :key="_idx"><div class="py-0.5"><span v-if="line.hasLink" class="text-primary hover:underline cursor-pointer" @click.stop="openInEditor(line.path || '', line.line || 1)">{{ line.text }}</span><span v-else>{{ line.text }}</span></div></template></code></pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.mockup-code pre {
    padding: 0;
}
</style>
