<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import WelcomeSection from '../components/WelcomeSection.vue';

const selectedProject = ref(null);
const defaultEditor = ref(localStorage.getItem('defaultEditor') || 'VSCode');

onMounted(() => {
    const storedProject = localStorage.getItem('selectedProject');
    if (storedProject) {
        selectedProject.value = JSON.parse(storedProject);
    }
});

const statusBadgeClass = (status: string) => {
    const statusClasses = {
        'InProgress': 'badge-primary',
        'Completed': 'badge-success', 
        'InitialStage': 'badge-warning',
        'OnHold': 'badge-neutral',
        'Abandoned': 'badge-error'
    };
    return statusClasses[status] || 'badge-ghost';
};

const openProjectFolder = async () => {
    if (selectedProject.value) {
        try {
            await invoke('open_folder', { location: selectedProject.value.location });
        } catch (error) {
            console.error('Failed to open project folder', error);
        }
    }
};

const openProjectInEditor = async () => {
    if (selectedProject.value) {
        try {
            // Mapping of editors to their command-line launch commands
            const editorCommands = {
                'VSCode': 'code',
                'Sublime Text': 'subl',
                'PHPStorm': 'phpstorm',
                'Windsurf': 'windsurf',
                'Zed': 'zed'
            };

            // Get the command for the selected editor
            const command = editorCommands[defaultEditor.value];
            
            if (command) {
                // Use Tauri invoke to run the editor command
                await invoke('open_in_editor', { 
                    editor: command, 
                    location: selectedProject.value.location 
                });
            } else {
                console.error('Unsupported editor:', defaultEditor.value);
            }
        } catch (error) {
            console.error('Failed to open project in editor', error);
        }
    }
};
</script>

<template>
    <div class="space-y-6">
        <WelcomeSection />
        
        <!-- Selected Project Section -->
        <div 
            v-if="selectedProject" 
            class="card bg-base-100 shadow-xl"
        >
            <div class="card-body">
                <div class="flex justify-between items-center">
                    <h2 class="card-title">Current Project</h2>
                    <div 
                        class="badge" 
                        :class="statusBadgeClass(selectedProject.status)"
                    >
                        {{ 
                            {
                                'InProgress': 'In Progress',
                                'Completed': 'Completed', 
                                'InitialStage': 'Initial Stage',
                                'OnHold': 'On Hold',
                                'Abandoned': 'Abandoned'
                            }[selectedProject.status] || selectedProject.status 
                        }}
                    </div>
                </div>
                <div class="grid md:grid-cols-2 gap-4 mt-4">
                    <div>
                        <p class="font-bold">{{ selectedProject.name }}</p>
                        <p>{{ selectedProject.description || 'No description provided' }}</p>
                    </div>
                </div>
                
                <div class="card-actions mt-4 flex justify-between items-center">
                    <div class="flex space-x-2">
                        <button 
                            @click="openProjectFolder" 
                            class="btn btn-ghost btn-sm"
                            title="Open Project Folder"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
                            </svg>
                        </button>
                        <button 
                            @click="openProjectInEditor" 
                            class="btn btn-ghost btn-sm"
                            :title="`Open in ${defaultEditor}`"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" />
                            </svg>
                            <span class="ml-2 text-xs">{{ defaultEditor }}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.truncate {
    max-width: 250px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>
