<script setup lang="ts">
import { provide, ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import Header from './components/Header.vue';
import Sidebar from './components/Sidebar.vue';
import { useThemeStore } from './stores/theme';

// Types
interface Project {
    id: string | number;
    name: string;
    description: string;
    location: string;
    status: 'InProgress' | 'Completed' | 'InitialStage' | 'OnHold' | 'Abandoned';
}

// Initialize theme store
useThemeStore();

// App state
const isCollapsed = ref<boolean>(false);
const projects = ref<Project[]>([]);
const selectedProject = ref<Project | null>(null);
const isLaravelProject = ref<boolean>(false);

// Methods
const toggleSidebar = () => {
    isCollapsed.value = !isCollapsed.value;
};

const checkProjectType = async () => {
    if (!selectedProject.value) {
        isLaravelProject.value = false;
        return;
    }
    try {
        // We need to pass the ID as a string. selectedProject.value.id might be number or string.
        const id = String(selectedProject.value.id);
        const type = await invoke<string>('get_project_config', { id, key: 'project_type' });
        isLaravelProject.value = type === 'Laravel';
    } catch (error) {
        console.error('Failed to check project type:', error);
        isLaravelProject.value = false;
    }
};

const fetchProjects = async () => {
    try {
        const result = await invoke<Project[]>('get_projects');
        projects.value = result;
    } catch (error) {
        console.error('Failed to fetch projects:', error);
        projects.value = [];
    }
};

// Watch for changes in selectedProject
import { watch } from 'vue';
watch(selectedProject, () => {
    checkProjectType();
});

// Provide values to child components
provide('toggleSidebar', toggleSidebar);
provide('isCollapsed', isCollapsed);
provide('projects', projects);
provide('fetchProjects', fetchProjects);
provide('selectedProject', selectedProject);
provide('isLaravelProject', isLaravelProject);

// Initialize data
onMounted(async () => {
    await fetchProjects();
    
    // Initialize selectedProject from localStorage
    const storedProject = localStorage.getItem('selectedProject');
    if (storedProject) {
        try {
            selectedProject.value = JSON.parse(storedProject);
            // Check project type after restoring selection
            checkProjectType();
        } catch (e) {
            console.error('Failed to parse selectedProject from localStorage', e);
            localStorage.removeItem('selectedProject');
        }
    }
});
</script>

<template>
    <div class="h-screen flex flex-col overflow-hidden bg-base-300">
        <!-- App header -->
        <Header class="flex-shrink-0" />

        <!-- Main content area -->
        <div class="flex flex-1 overflow-hidden">
            <!-- Sidebar navigation -->
            <Sidebar class="flex-shrink-0" />

            <!-- Router view container -->
            <main
                class="flex-1 overflow-hidden"
                role="main"
                aria-label="Main content"
            >
                <router-view v-slot="{ Component }">
                    <component :is="Component" />
                </router-view>
            </main>
        </div>
    </div>
</template>

<style scoped>
/* Add any component-specific styles here */
</style>
