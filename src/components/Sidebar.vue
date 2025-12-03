<script setup lang="ts">
import { ref, inject, computed } from 'vue';

// Types
interface MenuItem {
    icon: string;
    label: string;
    route: string;
}

// Injected state
const isCollapsed = inject<boolean>('isCollapsed', false);

// Menu items
const baseMenuItems = ref<MenuItem[]>([
    { icon: '🏠', label: 'Dashboard', route: '/' },
    { icon: '📁', label: 'Projects', route: '/projects' },
    { icon: '⚙️', label: 'Settings', route: '/settings' }
]);

const additionalMenuItems = ref<MenuItem[]>([
    { icon: '💻', label: 'Database Viewer', route: '/database' },
    { icon: '🛠️', label: 'Tools', route: '/tools' }
]);

// Computed
const menuItems = computed(() => {
    const selectedProject = localStorage.getItem('selectedProject');
    return selectedProject
        ? [...baseMenuItems.value, ...additionalMenuItems.value]
        : baseMenuItems.value;
});
</script>

<template>
    <aside
        class="min-h-screen transition-all duration-100 relative bg-base-200"
        :class="{ 'w-64': !isCollapsed, 'w-20': isCollapsed }"
    >
        <nav class="p-2">
            <ul class="menu bg-base-200 rounded-box">
                <li
                    v-for="item in menuItems"
                    :key="item.route"
                >
                    <router-link
                        :to="item.route"
                        class="flex items-center gap-4"
                        :class="{ 'active': $route.path === item.route }"
                        :title="isCollapsed ? item.label : undefined"
                    >
                        <span class="transition text-xl">
                            {{ item.icon }}
                        </span>
                        <span
                            v-show="!isCollapsed"
                            class="transition-all duration-100"
                        >
                            {{ item.label }}
                        </span>
                    </router-link>
                </li>
            </ul>
        </nav>
    </aside>
</template>

<style scoped>
.router-link-active {
    background-color: hsl(var(--bc) / 0.1);
}
</style>

<style scoped>
.router-link-active {
    background-color: hsl(var(--bc) / 0.1);
}
</style>
