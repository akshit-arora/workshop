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
    <div class="min-h-screen bg-base-300">
        <Header />
        <div class="flex">
            <Sidebar />
            <main class="flex-1 p-6">
                <router-view></router-view>
            </main>
        </div>
    </div>
</template>
