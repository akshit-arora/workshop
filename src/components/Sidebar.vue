<script setup lang="ts">
import { ref, inject, computed } from 'vue';

// Types
interface MenuItem {
    icon: string;
    label: string;
    route?: string;
    onClick?: () => void;
}

// Injected state
import type { Ref } from 'vue';
const isCollapsed = inject<boolean>('isCollapsed', false);
const isLaravelProject = inject<Ref<boolean>>('isLaravelProject');
const selectedProject = inject<Ref<unknown | null>>('selectedProject');

const isAboutOpen = ref(false);

// Menu items
const baseMenuItems = ref<MenuItem[]>([
    { icon: '🏠', label: 'Dashboard', route: '/' },
    { icon: '📁', label: 'Projects', route: '/projects' },
    { icon: '⚙️', label: 'Settings', route: '/settings' }
]);

const additionalMenuItems = ref<MenuItem[]>([
    { icon: '💻', label: 'Database Viewer', route: '/database' },
    { icon: '⌨️', label: 'Terminal', route: '/xterm' },
    { icon: '🛠️', label: 'Tools', route: '/tools' }
]);

// Computed
const menuItems = computed<MenuItem[]>(() => {
    let items = selectedProject && selectedProject.value
        ? [...baseMenuItems.value, ...additionalMenuItems.value]
        : [...baseMenuItems.value];
    
    if (isLaravelProject && isLaravelProject.value) {
        items.push({ icon: '📋', label: 'Log Manager', route: '/tools/log-manager' });
    }

    // Add About item
    items.push({
        icon: 'ℹ️',
        label: 'About',
        onClick: () => { isAboutOpen.value = true; }
    });

    return items;
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
                    :key="item.label"
                >
                    <component
                        :is="item.route ? 'router-link' : 'a'"
                        :to="item.route"
                        @click="item.onClick && item.onClick()"
                        class="flex items-center gap-4"
                        :class="{ 'active': item.route && $route.path === item.route }"
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
                    </component>
                </li>
            </ul>
        </nav>

        <!-- About Modal -->
        <dialog class="modal" :class="{ 'modal-open': isAboutOpen }">
            <div class="modal-box">
                <h3 class="font-bold text-lg mb-4">About Workshop</h3>
                <div class="py-4 space-y-4">
                    <div class="flex items-center gap-4">
                        <div class="avatar">
                            <div class="w-12">
                                <img src="/icon.png" alt="Workshop App Icon" />
                            </div>
                        </div>
                        <div>
                            <p class="font-semibold">Workshop App</p>
                            <p class="text-sm opacity-70">Version 0.1.0</p>
                        </div>
                    </div>
                    
                    <div class="divider"></div>
                    
                    <div class="grid gap-2">
                        <p class="font-semibold text-sm">Created by</p>
                        <div class="flex items-center gap-2">
                            <span>Akshit Arora</span>
                            <a href="https://x.com/akshitarora0907" target="_blank" class="btn btn-xs btn-ghost text-info">
                                @akshitarora0907
                            </a>
                        </div>
                    </div>

                    <div class="alert bg-base-200 border-base-300 text-base-content shadow-sm">
                        <div class="flex flex-col gap-1 w-full">
                            <div class="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z" clip-rule="evenodd" /></svg>
                                <h3 class="font-bold text-sm">MIT License</h3>
                            </div>
                            <div class="text-xs opacity-75">This project is free and open-source.</div>
                        </div>
                    </div>

                    <div class="collapse collapse-arrow bg-base-200">
                        <input type="checkbox" /> 
                        <div class="collapse-title font-medium text-sm">
                            Open Source Credits
                        </div>
                        <div class="collapse-content text-xs"> 
                            <p class="mb-2 opacity-70">Built with these amazing projects:</p>
                            <ul class="grid grid-cols-2 gap-x-4 gap-y-1 list-disc list-inside">
                                <li>Tauri</li>
                                <li>Vue.js</li>
                                <li>Vite</li>
                                <li>Tailwind CSS</li>
                                <li>DaisyUI</li>
                                <li>Pinia</li>
                                <li>Rusqlite</li>
                                <li>Serde</li>
                                <li>Marked</li>
                                <li>SQL Formatter</li>
                            </ul>
                        </div>
                    </div>
                </div>
                <div class="modal-action">
                    <button class="btn" @click="isAboutOpen = false">Close</button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button @click="isAboutOpen = false">close</button>
            </form>
        </dialog>
    </aside>
</template>

<style scoped>
.router-link-active {
    background-color: hsl(var(--bc) / 0.1);
}
</style>
