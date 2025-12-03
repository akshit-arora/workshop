<script setup lang="ts">
import { inject, Ref, ref } from 'vue';

// Types
interface Project {
    id: string | number;
    name: string;
}

// Injected state
const toggleSidebar = inject<() => void>('toggleSidebar');
const projects = inject<Project[]>('projects', []);
const selectedProject = inject<Ref<Project | null>>('selectedProject', ref(null));

// Component state
const projectDropdown = ref<HTMLDivElement | null>(null);

// Methods
const selectProject = (project: Project) => {
    if (selectedProject) {
        selectedProject.value = project;
        localStorage.setItem('selectedProject', JSON.stringify(project));
        projectDropdown.value?.blur();
    }
};
</script>

<template>
    <div class="navbar bg-base-100">
        <!-- Left section -->
        <div class="navbar-start">
            <button
                @click="toggleSidebar"
                class="btn btn-ghost btn-circle"
                type="button"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 6h16M4 12h16M4 18h7"
                    />
                </svg>
            </button>
        </div>

        <!-- Center section -->
        <div class="navbar-center">
            <a class="btn btn-ghost text-xl">Workshop</a>
        </div>

        <!-- Right section -->
        <div class="navbar-end">
            <div class="dropdown dropdown-end mx-2">
                <!-- Project selector button -->
                <div
                    ref="projectDropdown"
                    tabindex="0"
                    role="button"
                    class="btn btn-ghost m-1 gap-2"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="size-6"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
                        />
                    </svg>
                    <span>{{ selectedProject?.name || 'Select Project' }}</span>
                    <svg
                        class="h-2 w-2 fill-current opacity-60 inline-block"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 2048 2048"
                    >
                        <path d="M1799 349l242 241-1017 1017L7 590l242-241 775 775 775-775z" />
                    </svg>
                </div>

                <!-- Projects dropdown -->
                <ul
                    tabindex="0"
                    class="dropdown-content z-1 p-2 shadow-2xl bg-base-200 rounded-box w-52 max-h-[70vh] overflow-y-auto"
                >
                    <li v-for="project in projects" :key="project.id">
                        <button
                            type="button"
                            class="btn btn-sm btn-block btn-ghost justify-start"
                            :class="{ 'bg-primary text-primary-content': selectedProject?.id === project.id }"
                            @click="selectProject(project)"
                        >
                            {{ project.name }}
                        </button>
                    </li>
                </ul>
            </div>
        </div>
    </div>
</template>
