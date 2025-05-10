<script setup lang="ts">
import { inject, ref } from 'vue';
import { open } from '@tauri-apps/plugin-dialog';
import { PencilSquareIcon } from '@heroicons/vue/24/outline';
import { invoke } from '@tauri-apps/api/core';

const projects = inject('projects');
const showNewProjectModal = ref(false);
const showEditProjectModal = ref(false);
const projectName = ref('');
const projectDescription = ref('');
const projectLocation = ref('');
const projectStatus = ref('In Progress');
const currentEditProject = ref(null);
const fetchProjects = inject('fetchProjects');

const statusOptions = [
    {
        'label': 'In Progress',
        'value': 'InProgress',
    },
    {
        'label': 'Completed',
        'value': 'Completed',
    },
    {
        'label': 'Initial Stage',
        'value': 'InitialStage',
    },
    {
        'label': 'On Hold',
        'value': 'OnHold',
    },
    {
        'label': 'Abandoned',
        'value': 'Abandoned',
    }
];

const createNewProject = () => {
    resetForm();
    showNewProjectModal.value = true;
};

const selectProjectFolder = async (isEdit = false) => {
    try {
        const selected = await open({
            directory: true,
            multiple: false,
            title: 'Select Project Location'
        });
        if (selected) {
            projectLocation.value = selected as string;
        }
    } catch (error) {
        console.error('Error selecting folder:', error);
    }
};

const handleSubmit = async (event: Event) => {
    event.preventDefault();
    try {
        const newProject = await invoke('create_project', {
            name: projectName.value,
            description: projectDescription.value,
            location: projectLocation.value,
            status: projectStatus.value
        });
        await fetchProjects();
        resetForm();
        showNewProjectModal.value = false;
    } catch (error) {
        console.error('Failed to create project', error);
    }
};

const deleteProject = async (projectId: string) => {
    try {
        await invoke('delete_project', { id: projectId });
        await fetchProjects();
    } catch (error) {
        console.error('Failed to delete project', error);
    }
};

const startEditProject = (project: any) => {
    currentEditProject.value = { ...project };
    projectName.value = project.name;
    projectDescription.value = project.description;
    projectLocation.value = project.location;
    projectStatus.value = project.status;
    showEditProjectModal.value = true;
};

const handleEditSubmit = async (event: Event) => {
    event.preventDefault();
    if (!currentEditProject.value) return;

    try {
        await invoke('update_project', {
            id: currentEditProject.value.id,
            name: projectName.value,
            description: projectDescription.value,
            location: projectLocation.value,
            status: projectStatus.value
        });
        await fetchProjects();
        resetForm();
        showEditProjectModal.value = false;
    } catch (error) {
        console.error('Failed to update project', error);
    }
};

const openProjectFolder = async (location: string) => {
    try {
        await invoke('open_folder', { location });
    } catch (error) {
        console.error('Failed to open project folder', error);
    }
};

const resetForm = () => {
    projectName.value = '';
    projectDescription.value = '';
    projectLocation.value = '';
    projectStatus.value = 'In Progress';
    currentEditProject.value = null;
};

fetchProjects();
</script>

<template>
    <div class="p-6">
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-2xl font-bold">Projects</h1>
            <button
                @click="createNewProject"
                class="btn btn-primary"
            >
                Create New Project
            </button>
        </div>

        <!-- Project Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div
                v-for="project in projects"
                :key="project.id"
                class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow duration-300"
            >
                <div class="card-body">
                    <div class="flex justify-between items-center">
                        <h2 class="card-title">{{ project.name }}</h2>
                        <div class="badge"
                            :class="{
                                'badge-primary': project.status === 'InProgress',
                                'badge-success': project.status === 'Completed',
                                'badge-warning': project.status === 'InitialStage',
                                'badge-neutral': project.status === 'OnHold',
                                'badge-error': project.status === 'Abandoned'
                            }"
                        >
                            {{
                                statusOptions.find(status => status.value === project.status)?.label || project.status
                            }}
                        </div>
                    </div>
                    <p>{{ project.description }}</p>
                    <div class="flex justify-between items-center mt-4">
                        <button
                            @click="openProjectFolder(project.location)"
                            class="btn btn-ghost btn-sm"
                            title="Open Project Folder"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
                            </svg>
                        </button>
                        <div class="flex space-x-2">
                            <button
                                @click="startEditProject(project)"
                                class="btn btn-ghost btn-sm"
                                title="Edit Project"
                            >
                                <PencilSquareIcon class="h-5 w-5" />
                            </button>
                            <button
                                @click="deleteProject(project.id)"
                                class="btn btn-ghost btn-sm text-error"
                                title="Delete Project"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L6.16 5.79m14.788 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- New Project Modal -->
        <dialog :open="showNewProjectModal" class="modal">
            <div class="modal-box">
                <form @submit="handleSubmit" class="space-y-4">
                    <h3 class="font-bold text-lg">Create New Project</h3>

                    <div class="form-control w-full">
                        <label class="label">
                            <span class="label-text">Project Name</span>
                        </label>
                        <input
                            v-model="projectName"
                            type="text"
                            required
                            class="input input-bordered w-full"
                        />
                    </div>

                    <div class="form-control w-full">
                        <label class="label">
                            <span class="label-text">Description</span>
                        </label>
                        <textarea
                            v-model="projectDescription"
                            class="textarea textarea-bordered h-24"
                        ></textarea>
                    </div>

                    <div class="form-control w-full">
                        <label class="label">
                            <span class="label-text">Project Location</span>
                        </label>
                        <div class="join">
                            <input
                                v-model="projectLocation"
                                type="text"
                                readonly
                                class="input input-bordered join-item w-full"
                            />
                            <button
                                type="button"
                                @click="selectProjectFolder"
                                class="btn join-item"
                            >
                                Browse
                            </button>
                        </div>
                    </div>

                    <div class="form-control w-full">
                        <label class="label">
                            <span class="label-text">Status</span>
                        </label>
                        <select
                            v-model="projectStatus"
                            class="select select-bordered w-full"
                        >
                            <option v-for="status in statusOptions" :key="status.value" :value="status.value">
                                {{ status.label }}
                            </option>
                        </select>
                    </div>

                    <div class="modal-action">
                        <button type="button" class="btn" @click="showNewProjectModal = false">Cancel</button>
                        <button type="submit" class="btn btn-primary">Create Project</button>
                    </div>
                </form>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button @click="showNewProjectModal = false">close</button>
            </form>
        </dialog>

        <!-- Edit Project Modal -->
        <dialog :open="showEditProjectModal" class="modal">
            <div class="modal-box">
                <form @submit="handleEditSubmit" class="space-y-4">
                    <h3 class="font-bold text-lg">Edit Project</h3>

                    <div class="form-control w-full">
                        <label class="label">
                            <span class="label-text">Project Name</span>
                        </label>
                        <input
                            v-model="projectName"
                            type="text"
                            required
                            class="input input-bordered w-full"
                        />
                    </div>

                    <div class="form-control w-full">
                        <label class="label">
                            <span class="label-text">Description</span>
                        </label>
                        <textarea
                            v-model="projectDescription"
                            class="textarea textarea-bordered h-24"
                        ></textarea>
                    </div>

                    <div class="form-control w-full">
                        <label class="label">
                            <span class="label-text">Project Location</span>
                        </label>
                        <div class="join">
                            <input
                                v-model="projectLocation"
                                type="text"
                                readonly
                                class="input input-bordered join-item w-full"
                            />
                            <button
                                type="button"
                                @click="selectProjectFolder"
                                class="btn join-item"
                            >
                                Browse
                            </button>
                        </div>
                    </div>

                    <div class="form-control w-full">
                        <label class="label">
                            <span class="label-text">Status</span>
                        </label>
                        <select
                            v-model="projectStatus"
                            class="select select-bordered w-full"
                        >
                            <option v-for="status in statusOptions" :key="status.value" :value="status.value">
                                {{ status.label }}
                            </option>
                        </select>
                    </div>

                    <div class="modal-action">
                        <button type="button" class="btn" @click="showEditProjectModal = false">Cancel</button>
                        <button type="submit" class="btn btn-primary">Update Project</button>
                    </div>
                </form>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button @click="showEditProjectModal = false">close</button>
            </form>
        </dialog>
    </div>
</template>

<style scoped>
/* Add any additional styles here */
</style>
