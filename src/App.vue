<script setup lang="ts">
import { provide, ref } from 'vue';
import Header from './components/Header.vue';
import Sidebar from './components/Sidebar.vue';
import { useThemeStore } from './stores/theme';
import { invoke } from '@tauri-apps/api/core';

// Initialize theme store
useThemeStore();

const isCollapsed = ref(false);
const toggleSidebar = () => {
    isCollapsed.value = !isCollapsed.value;
};
const projects = ref([]);
const selectedProject = ref(null);

// Fetch projects on component mount
const fetchProjects = async () => {
    try {
        projects.value = await invoke('get_projects');
    } catch (error) {
        console.error('Failed to fetch projects', error);
    }
};

provide('toggleSidebar', toggleSidebar);
provide('isCollapsed', isCollapsed);
provide('projects', projects);
provide('fetchProjects', fetchProjects);
provide('selectedProject', selectedProject);

fetchProjects();
</script>

<template>
    <div class="h-screen flex flex-col overflow-hidden bg-base-300">
        <Header class="flex-shrink-0" />
        <div class="flex flex-1 overflow-hidden">
            <Sidebar class="flex-shrink-0" />
            <main class="flex-1 overflow-hidden">
                <router-view></router-view>
            </main>
        </div>
    </div>
</template>
