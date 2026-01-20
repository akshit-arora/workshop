<script setup lang="ts">
import { ref, onMounted, computed, inject, watch } from 'vue';
import type { Ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

interface LangFile {
    path: string;
    name: string;
    type: string;
}

interface LangLocale {
    locale: string;
    files: LangFile[];
}

interface LangData {
    default_locale: string;
    locales: LangLocale[];
}

interface DictionaryItem {
    id: number;
    key: string;
    value: string;
}

const selectedProject = inject<Ref<any>>('selectedProject');
const langData = ref<LangData | null>(null);
const selectedLocale = ref<string>('');
const selectedFile = ref<LangFile | null>(null);
const fileContent = ref<string>('');
const parsedContent = ref<DictionaryItem[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const searchQuery = ref('');
const parseError = ref<string | null>(null);

const defaultEditor = computed(() => {
    return localStorage.getItem('defaultEditor') || 'VSCode';
});

const localeFiles = computed(() => {
    if (!langData.value || !selectedLocale.value) return [];
    const loc = langData.value.locales.find(l => l.locale === selectedLocale.value);
    return loc ? loc.files : [];
});

const filteredDictionary = computed(() => {
    if (!searchQuery.value) return parsedContent.value;
    const q = searchQuery.value.toLowerCase();
    return parsedContent.value.filter(item =>
        item.key.toLowerCase().includes(q) || item.value.toLowerCase().includes(q)
    );
});

const fetchFiles = async () => {
    if (!selectedProject || !selectedProject.value || !selectedProject.value.id) return;
    isLoading.value = true;
    try {
        const data = await invoke<LangData>('get_lang_files', { id: String(selectedProject.value.id) });
        langData.value = data;
        if (data.locales.length > 0) {
            selectedLocale.value = data.default_locale || data.locales[0].locale;
        }
    } catch (e) {
        console.error(e);
    } finally {
        isLoading.value = false;
    }
};

const selectFile = async (file: LangFile) => {
    if (!selectedProject || !selectedProject.value || !selectedProject.value.id) return;
    selectedFile.value = file;
    isLoading.value = true;
    parseError.value = null;
    try {
        const content = await invoke<string>('read_lang_file', {
            id: String(selectedProject.value.id),
            filePath: file.path
        });
        fileContent.value = content;
        tryParse(content, file.type);
    } catch (e) {
        console.error(e);
    } finally {
        isLoading.value = false;
    }
};

const tryParse = (content: string, type: string) => {
    parsedContent.value = [];
    parseError.value = null;
    if (type === 'json') {
        try {
            const obj = JSON.parse(content);
            parsedContent.value = Object.entries(obj).map(([k, v], i) => ({ id: i, key: k, value: String(v) }));
        } catch (e) {
            parseError.value = "Invalid JSON. Use 'Open in Editor' to fix.";
        }
    } else if (type === 'php') {
        const regex = /(['"])((?:(?!\1|\\).|\\.)*)\1\s*=>\s*(['"])((?:(?!\3|\\).|\\.)*)\3/g;
        const matches = [...content.matchAll(regex)];

        if (matches.length > 0 && !content.includes('=> [') && !content.includes('=> array(')) {
            parsedContent.value = matches.map((m, i) => ({ id: i, key: m[2], value: m[4] }));
        } else {
            if (content.trim().length < 50 && !content.includes('=>')) {
                parsedContent.value = [];
            } else {
                parseError.value = "Complex PHP structure detected. Use 'Open in Editor' to edit.";
            }
        }
    }
};

const openInEditor = async () => {
    if (!selectedFile.value || !selectedProject || !selectedProject.value) return;
    const editor = defaultEditor.value;
    const fullPath = `${selectedProject.value.location}/${selectedFile.value.path}`;
    try {
        await invoke('open_in_editor', { editor, location: fullPath, line: 1 });
    } catch (e) {
        console.error('Failed to open editor', e);
        alert('Failed to open editor: ' + e);
    }
};

const saveFile = async () => {
    if (!selectedFile.value || !selectedProject || !selectedProject.value || !selectedProject.value.id) return;
    isSaving.value = true;

    let contentToSave = fileContent.value;

    if (selectedFile.value.type === 'json') {
        const obj = parsedContent.value.reduce((acc, item) => {
            acc[item.key] = item.value;
            return acc;
        }, {} as Record<string, string>);
        contentToSave = JSON.stringify(obj, null, 4);
    } else if (selectedFile.value.type === 'php') {
        const lines = parsedContent.value.map(item => `    '${item.key}' => '${item.value.replace(/'/g, "\\'")}',`);
        contentToSave = `<?php\n\nreturn [\n${lines.join('\n')}\n];`;
    }

    try {
        await invoke('save_lang_file', {
            id: String(selectedProject.value.id),
            filePath: selectedFile.value.path,
            content: contentToSave
        });
        fileContent.value = contentToSave;
    } catch (e) {
        console.error(e);
        alert('Failed to save');
    } finally {
        isSaving.value = false;
    }
};

const addKey = () => {
    parsedContent.value.unshift({ id: Date.now(), key: 'new_key', value: 'New Value' });
};

const deleteKey = (item: DictionaryItem) => {
    const idx = parsedContent.value.indexOf(item);
    if (idx > -1) {
        parsedContent.value.splice(idx, 1);
    }
};

onMounted(() => {
    fetchFiles();
});

watch(() => selectedProject?.value, fetchFiles);

watch(selectedLocale, () => {
    selectedFile.value = null;
    parsedContent.value = [];
    fileContent.value = '';
    parseError.value = null;
});

</script>

<template>
    <div class="h-full flex bg-base-100">
        <!-- Sidebar -->
        <div class="w-72 border-r border-base-300 flex flex-col bg-base-200/50">
            <div class="p-4 border-b border-base-300">
                <h2 class="font-bold mb-3 flex items-center gap-2">
                    <span>🌐</span> Language Manager
                </h2>
                <!-- Locale Dropdown -->
                <div class="form-control w-full">
                    <label class="label py-1">
                        <span class="label-text text-xs opacity-70">Locale</span>
                        <span v-if="langData && selectedLocale === langData.default_locale" class="badge badge-xs badge-primary">default</span>
                    </label>
                    <select v-model="selectedLocale" class="select select-sm select-bordered w-full">
                        <option v-for="loc in langData?.locales || []" :key="loc.locale" :value="loc.locale">
                            {{ loc.locale.toUpperCase() }} ({{ loc.files.length }} files)
                        </option>
                    </select>
                </div>
            </div>
            <div class="flex-1 overflow-y-auto">
                <div class="p-2 text-xs opacity-50 uppercase tracking-wider">Files</div>
                <ul class="menu w-full p-2 text-sm">
                    <li v-for="file in localeFiles" :key="file.path">
                        <a
                            :class="{ active: selectedFile?.path === file.path }"
                            @click="selectFile(file)"
                        >
                            <span class="truncate">{{ file.name }}</span>
                            <span class="badge badge-xs badge-ghost">{{ file.type }}</span>
                        </a>
                    </li>
                    <li v-if="localeFiles.length === 0" class="text-base-content/50 italic px-4 py-2">
                        No files for this locale
                    </li>
                </ul>
            </div>
        </div>

        <!-- Main Area -->
        <div class="flex-1 flex flex-col h-full overflow-hidden bg-base-100">
            <div v-if="!selectedFile" class="flex-1 flex flex-col items-center justify-center text-base-content/50">
                <div class="text-4xl mb-4">🌐</div>
                <p>Select a language file to start editing</p>
            </div>
            <template v-else>
                <!-- Toolbar -->
                <div class="p-4 border-b border-base-300 flex items-center justify-between gap-4 bg-base-100">
                    <div class="flex items-center gap-4">
                        <div class="breadcrumbs text-sm">
                            <ul>
                                <li>{{ selectedLocale.toUpperCase() }}</li>
                                <li>{{ selectedFile.name }}</li>
                            </ul>
                        </div>
                        <button
                            class="btn btn-sm btn-ghost gap-2"
                            @click="openInEditor"
                        >
                            📝 Open in {{ defaultEditor }}
                        </button>
                    </div>
                    <div class="flex items-center gap-2">
                        <input
                            v-model="searchQuery"
                            class="input input-sm input-bordered"
                            placeholder="Search keys..."
                        />
                        <button class="btn btn-sm btn-success text-white" @click="saveFile" :disabled="isSaving || !!parseError">
                            {{ isSaving ? 'Saving...' : 'Save Changes' }}
                        </button>
                    </div>
                </div>

                <!-- Content -->
                <div class="flex-1 overflow-hidden relative">
                    <div v-if="parseError" class="flex-1 flex flex-col items-center justify-center text-base-content/50 h-full">
                        <div class="alert alert-warning max-w-md shadow-lg">
                            <div>
                                <span>⚠️</span>
                                <span>{{ parseError }}</span>
                            </div>
                        </div>
                        <button class="btn btn-primary mt-4 gap-2" @click="openInEditor">
                            📝 Open in {{ defaultEditor }}
                        </button>
                    </div>
                    <div v-else class="h-full flex flex-col">
                        <div class="p-2 border-b border-base-200 bg-base-200/30 flex items-center justify-between">
                            <button class="btn btn-sm btn-ghost gap-2 text-primary" @click="addKey">
                                <span class="text-lg">+</span> Add Key
                            </button>
                            <span class="text-xs opacity-50">{{ filteredDictionary.length }} entries</span>
                        </div>
                        <div class="flex-1 overflow-y-auto p-4">
                            <div class="overflow-x-auto">
                                <table class="table table-pin-rows">
                                    <thead>
                                        <tr>
                                            <th>Key</th>
                                            <th>Value</th>
                                            <th class="w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="item in filteredDictionary" :key="item.id" class="hover:bg-base-200/50">
                                            <td><input v-model="item.key" class="input input-sm input-ghost w-full font-mono text-xs" /></td>
                                            <td><input v-model="item.value" class="input input-sm input-ghost w-full" /></td>
                                            <td>
                                                <button class="btn btn-ghost btn-xs text-error" @click="deleteKey(item)">✕</button>
                                            </td>
                                        </tr>
                                        <tr v-if="filteredDictionary.length === 0">
                                            <td colspan="3" class="text-center text-base-content/50 py-8">
                                                No entries found. Click "+ Add Key" to create one.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </template>
        </div>
    </div>
</template>
