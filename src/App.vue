<script setup lang="ts">
import { provide, ref } from 'vue';
import Header from './components/Header.vue';
import Sidebar from './components/Sidebar.vue';
import { useThemeStore } from './stores/theme';

// Initialize theme store
useThemeStore();

const isCollapsed = ref(false);
const toggleSidebar = () => {
    isCollapsed.value = !isCollapsed.value;
};

provide('toggleSidebar', toggleSidebar);
provide('isCollapsed', isCollapsed);
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