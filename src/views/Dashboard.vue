<script setup lang="ts">
import { ref, inject, computed, type Ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { FolderIcon, CodeBracketIcon } from '@heroicons/vue/24/outline';
import WelcomeSection from '../components/WelcomeSection.vue';

// Types
interface Project {
    id: string | number;
    name: string;
    description: string;
    location: string;
    status: ProjectStatus;
}

type ProjectStatus = 'InProgress' | 'Completed' | 'InitialStage' | 'OnHold' | 'Abandoned';

interface EditorConfig {
    name: string;
    command: string;
    icon?: string;
}

// Constants
const EDITOR_CONFIGS: Record<string, EditorConfig> = {
    'VSCode': { name: 'VS Code', command: 'code' },
    'Sublime Text': { name: 'Sublime Text', command: 'subl' },
    'PHPStorm': { name: 'PhpStorm', command: 'phpstorm' },
    'Windsurf': { name: 'Windsurf', command: 'windsurf' },
    'Zed': { name: 'Zed', command: 'zed' }
} as const;

const STATUS_CLASSES: Record<ProjectStatus, string> = {
    'InProgress': 'badge-primary',
    'Completed': 'badge-success',
    'InitialStage': 'badge-warning',
    'OnHold': 'badge-neutral',
    'Abandoned': 'badge-error'
} as const;

const STATUS_LABELS: Record<ProjectStatus, string> = {
    'InProgress': 'In Progress',
    'Completed': 'Completed',
    'InitialStage': 'Initial Stage',
    'OnHold': 'On Hold',
    'Abandoned': 'Abandoned'
} as const;

// State & Refs
const projectRef = inject<Ref<Project | null>>('selectedProject', ref(null));
const currentProject = computed(() => projectRef?.value);
const defaultEditor = ref<keyof typeof EDITOR_CONFIGS>(
    localStorage.getItem('defaultEditor') as keyof typeof EDITOR_CONFIGS || 'VSCode'
);

// Methods
const getStatusBadgeClass = (status: ProjectStatus): string => {
    return STATUS_CLASSES[status] || 'badge-ghost';
};

const getStatusLabel = (status: ProjectStatus): string => {
    return STATUS_LABELS[status] || status;
};

const openProjectFolder = async (): Promise<void> => {
    const project = currentProject.value;
    if (!project) return;

    try {
        await invoke('open_folder', {
            location: project.location
        });
    } catch (error) {
        console.error('Failed to open project folder:', error);
    }
};

const openProjectInEditor = async (): Promise<void> => {
    const project = currentProject.value;
    if (!project) return;

    try {
        const editorConfig = EDITOR_CONFIGS[defaultEditor.value];
        if (!editorConfig) {
            console.error('Unsupported editor:', defaultEditor.value);
            return;
        }

        await invoke('open_in_editor', {
            editor: editorConfig.command,
            location: project.location
        });
    } catch (error) {
        console.error('Failed to open project in editor:', error);
    }
};
</script>

<template>
    <div class="space-y-6 p-6">
        <WelcomeSection />

        <!-- No Project Selected State -->
        <div v-if="!currentProject" class="text-center py-8">
            <h2 class="text-xl font-semibold mb-2">No Project Selected</h2>
            <p class="text-base-content/70">Select a project from the header to view its details</p>
        </div>

        <!-- Selected Project Section -->
        <div v-else class="card bg-base-100 shadow-xl">
            <div class="card-body">
                <div class="flex justify-between items-center">
                    <h2 class="card-title">Current Project</h2>
                    <div
                        class="badge"
                        :class="getStatusBadgeClass(currentProject.status)"
                    >
                        {{ getStatusLabel(currentProject.status) }}
                    </div>
                </div>

                <div class="grid md:grid-cols-2 gap-4 mt-4">
                    <div>
                        <p class="font-bold">{{ currentProject.name }}</p>
                        <p>{{ currentProject.description || 'No description provided' }}</p>
                    </div>
                </div>

                <div class="card-actions mt-4 flex justify-between items-center">
                    <div class="flex space-x-2">
                        <button
                            type="button"
                            @click="openProjectFolder"
                            class="btn btn-ghost btn-sm gap-2"
                            title="Open Project Folder"
                        >
                            <FolderIcon class="w-5 h-5" />
                            <span>Open Folder</span>
                        </button>
                        <button
                            type="button"
                            @click="openProjectInEditor"
                            class="btn btn-ghost btn-sm gap-2"
                            :title="`Open in ${EDITOR_CONFIGS[defaultEditor].name}`"
                        >
                            <CodeBracketIcon class="w-5 h-5" />
                            <span class="text-xs">{{ EDITOR_CONFIGS[defaultEditor].name }}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.card-body > * + * {
    margin-top: 1rem;
}

.badge {
    text-transform: capitalize;
    transition: background-color 0.2s, color 0.2s;
}

.btn {
    transition: background-color 0.2s, color 0.2s;
}
</style>
