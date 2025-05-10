<script setup lang="ts">
// Header component
import { inject } from 'vue';
import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';

const toggleSidebar = inject('toggleSidebar');


// Project-related variables
const projects = inject('projects');
const selectedProject = inject('selectedProject');
const projectDropdown = ref(null);

// Handle project selection
const selectProject = (project) => {
    selectedProject.value = project;
    localStorage.setItem('selectedProject', JSON.stringify(project));

    // Close dropdown by removing focus
    if (projectDropdown.value) {
        projectDropdown.value.blur();
    }
};

// onMounted(fetchProjects);
</script>

<template>
    <div class="navbar bg-base-100">
        <div class="navbar-start">
            <button @click="toggleSidebar" class="btn btn-ghost btn-circle">
                <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor">
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 6h16M4 12h16M4 18h7" />
                </svg>
            </button>
        </div>
        <div class="navbar-center">
            <a class="btn btn-ghost text-xl">Workshop</a>
        </div>
        <div class="navbar-end">
            <!-- Project Dropdown -->
            <div class="dropdown dropdown-end mx-2">
                <div
                    ref="projectDropdown"
                    tabindex="0"
                    role="button"
                    class="btn btn-ghost m-1 gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                    </svg>
                    <span>{{ selectedProject ? selectedProject.name : 'Select Project' }}</span>
                    <svg width="12px" height="12px" class="h-2 w-2 fill-current opacity-60 inline-block" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048"><path d="M1799 349l242 241-1017 1017L7 590l242-241 775 775 775-775z"></path></svg>
                </div>
                <ul tabindex="0" class="dropdown-content z-[1] p-2 shadow-2xl bg-base-200 rounded-box w-52 max-h-[70vh] overflow-y-auto">
                    <li v-for="project in projects" :key="project.id">
                        <button
                            class="btn btn-sm btn-block btn-ghost justify-start"
                            @click="selectProject(project)"
                            :class="{ 'bg-primary text-primary-content': selectedProject?.id === project.id }"
                        >
                            {{ project.name }}
                        </button>
                    </li>
                </ul>
            </div>

            <div class="form-control">
                <input type="text" placeholder="Search" class="input input-bordered w-24 md:w-auto" />
            </div>
            <button class="btn btn-ghost btn-circle">
            <div class="indicator">
                <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor">
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span class="badge badge-xs badge-primary indicator-item"></span>
            </div>
            </button>
        </div>
    </div>
</template>
