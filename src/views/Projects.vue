<script setup lang="ts">
import { inject, Ref, ref } from 'vue';
import { open } from '@tauri-apps/plugin-dialog';
import { PencilSquareIcon } from '@heroicons/vue/24/outline';
import { invoke } from '@tauri-apps/api/core';

// Types
interface Project {
    id: string | number;
    name: string;
    description: string;
    location: string;
    status: string;
}

interface StatusOption {
    label: string;
    value: string;
}

// Injected state
const projects = inject<Project[]>('projects', []);
const fetchProjects = inject<() => Promise<void>>('fetchProjects', async () => {
    console.warn('fetchProjects function was not provided');
});

// Component state
const showNewProjectModal = ref<boolean>(false);
const showEditProjectModal = ref<boolean>(false);
const projectIdToDelete = ref<string | number | null>(null);
const currentEditProject = ref<Project | null>(null);
const showDeleteConfirmModal = ref<boolean>(false);

// Form state
const projectName = ref<string>('');
const projectDescription = ref<string>('');
const projectLocation = ref<string>('');
const projectStatus = ref<string>('InProgress');

// Constants
const statusOptions: StatusOption[] = [
    { label: 'In Progress', value: 'InProgress' },
    { label: 'Completed', value: 'Completed' },
    { label: 'Initial Stage', value: 'InitialStage' },
    { label: 'On Hold', value: 'OnHold' },
    { label: 'Abandoned', value: 'Abandoned' }
];

const selectedProject = inject<Ref<Project | null>>('selectedProject');

// Project folder selection
const selectProjectFolder = async (e: MouseEvent) => {
    e.preventDefault();
    try {
        const selected = await open({
            directory: true,
            multiple: false,
            title: 'Select Project Location'
        });
        if (selected && typeof selected === 'string') {
            projectLocation.value = selected;
        }
    } catch (error) {
        console.error('Error selecting folder:', error);
    }
};

// Project CRUD operations
const handleSubmit = async (event: Event) => {
    event.preventDefault();
    if (!fetchProjects || !projectName.value || !projectLocation.value) {
        return;
    }

    try {
        await invoke('create_project', {
            name: projectName.value,
            description: projectDescription.value,
            location: projectLocation.value,
            status: projectStatus.value
        });
        await fetchProjects();
        resetForm();
        showNewProjectModal.value = false;
    } catch (error) {
        console.error('Failed to create project:', error);
    }
};

const confirmDelete = (projectId: string | number) => {
    projectIdToDelete.value = projectId;
    showDeleteConfirmModal.value = true;
};

const deleteProject = async (projectId: string | number | null) => {
    if (!fetchProjects || !projectId) return;

    if (selectedProject?.value?.id === projectId) {
        alert("You cannot delete the project you are currently working on.");

        return;
    }

    try {
        await invoke('delete_project', { id: projectId.toString() });
        await fetchProjects();
        projectIdToDelete.value = null;
        showDeleteConfirmModal.value = false;
    } catch (error) {
        console.error('Failed to delete project:', error);
    }
};

const startEditProject = (project: Project) => {
    currentEditProject.value = { ...project };
    projectName.value = project.name;
    projectDescription.value = project.description || '';
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

const getStatusLabel = (status: string): string => {
    return statusOptions.find((option) => option.value === status)?.label || status;
}

fetchProjects();
</script>

<template>
    <div class="p-6">
        <!-- Header section -->
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-2xl font-bold">Projects</h1>
            <button
                type="button"
                class="btn btn-primary"
                @click="showNewProjectModal = true"
            >
                Create New Project
            </button>
        </div>

        <!-- Project grid -->
        <div
            class="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            role="grid"
            aria-label="Projects list"
        >
            <div
                v-for="project in projects"
                :key="project.id"
                class="card bg-base-100 shadow-xl"
                role="gridcell"
            >
                <div class="card-body">
                    <h2 class="card-title">{{ project.name }}</h2>
                    <p class="text-base-content/70">{{ project.description }}</p>
                    <div
                        class="badge badge-outline cursor-pointer"
                        :class="{
                            'badge-success': project.status === 'Completed',
                            'badge-warning': project.status === 'OnHold',
                            'badge-error': project.status === 'Abandoned'
                        }"
                    >
                        {{ getStatusLabel(project.status) }}
                    </div>
                    <div class="card-actions justify-between items-center mt-4">
                        <button
                            type="button"
                            class="btn btn-sm btn-ghost"
                            @click="openProjectFolder(project.location)"
                            title="Open project folder"
                        >
                            Open Folder
                        </button>
                        <div class="flex gap-2">
                            <button
                                type="button"
                                class="btn btn-ghost btn-sm"
                                @click="startEditProject(project)"
                                title="Edit project"
                            >
                                <PencilSquareIcon class="h-5 w-5" />
                                <span class="sr-only">Edit {{ project.name }}</span>
                            </button>
                            <button
                                type="button"
                                class="btn btn-error btn-sm"
                                @click="confirmDelete(project.id)"
                                title="Delete project" 
                                v-if="project.id != selectedProject?.id"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Create New Project Modal -->
        <dialog :open="showNewProjectModal" class="modal">
            <div class="modal-box">
                <h3 class="font-bold text-lg mb-4">Create New Project</h3>
                <form @submit="handleSubmit">
                    <div class="form-control w-full">
                        <label class="label" for="projectName">
                            <span class="label-text">Project Name</span>
                        </label>
                        <input
                            id="projectName"
                            type="text"
                            v-model="projectName"
                            class="input input-bordered w-full"
                            required
                        />
                    </div>

                    <div class="form-control w-full mt-4">
                        <label class="label" for="projectDescription">
                            <span class="label-text">Description</span>
                        </label>
                        <textarea
                            id="projectDescription"
                            v-model="projectDescription"
                            class="textarea textarea-bordered h-24 w-full"
                        ></textarea>
                    </div>

                    <div class="form-control w-full mt-4">
                        <label class="label" for="projectLocation">
                            <span class="label-text">Project Location</span>
                        </label>
                        <div class="flex gap-2">
                            <input
                                id="projectLocation"
                                type="text"
                                v-model="projectLocation"
                                class="input input-bordered flex-1"
                                readonly
                                required
                            />
                            <button
                                type="button"
                                class="btn"
                                @click="selectProjectFolder"
                            >
                                Browse
                            </button>
                        </div>
                    </div>

                    <div class="form-control w-full mt-4">
                        <label class="label" for="projectStatus">
                            <span class="label-text">Status</span>
                        </label>
                        <select
                            id="projectStatus"
                            v-model="projectStatus"
                            class="select select-bordered w-full"
                        >
                            <option
                                v-for="option in statusOptions"
                                :key="option.value"
                                :value="option.value"
                            >
                                {{ option.label }}
                            </option>
                        </select>
                    </div>

                    <div class="modal-action">
                        <button type="submit" class="btn btn-primary">Create</button>
                        <button
                            type="button"
                            class="btn"
                            @click="showNewProjectModal = false"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button @click="showNewProjectModal = false">Close</button>
            </form>
        </dialog>

        <!-- Edit Project Modal -->
        <dialog :open="showEditProjectModal" class="modal">
            <div class="modal-box">
                <h3 class="font-bold text-lg mb-4">Edit Project</h3>
                <form @submit="handleEditSubmit">
                    <div class="form-control w-full">
                        <label class="label" for="editProjectName">
                            <span class="label-text">Project Name</span>
                        </label>
                        <input
                            id="editProjectName"
                            type="text"
                            v-model="projectName"
                            class="input input-bordered w-full"
                            required
                        />
                    </div>

                    <div class="form-control w-full mt-4">
                        <label class="label" for="editProjectDescription">
                            <span class="label-text">Description</span>
                        </label>
                        <textarea
                            id="editProjectDescription"
                            v-model="projectDescription"
                            class="textarea textarea-bordered h-24 w-full"
                        ></textarea>
                    </div>

                    <div class="form-control w-full mt-4">
                        <label class="label" for="editProjectLocation">
                            <span class="label-text">Project Location</span>
                        </label>
                        <input
                            id="editProjectLocation"
                            type="text"
                            v-model="projectLocation"
                            class="input input-bordered w-full"
                            readonly
                            required
                        />
                    </div>

                    <div class="form-control w-full mt-4">
                        <label class="label" for="editProjectStatus">
                            <span class="label-text">Status</span>
                        </label>
                        <select
                            id="editProjectStatus"
                            v-model="projectStatus"
                            class="select select-bordered w-full"
                        >
                            <option
                                v-for="option in statusOptions"
                                :key="option.value"
                                :value="option.value"
                            >
                                {{ option.label }}
                            </option>
                        </select>
                    </div>

                    <div class="modal-action">
                        <button type="submit" class="btn btn-primary">Save Changes</button>
                        <button
                            type="button"
                            class="btn"
                            @click="showEditProjectModal = false"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button @click="showEditProjectModal = false">Close</button>
            </form>
        </dialog>

        <!-- Delete Confirmation Modal -->
        <dialog :open="showDeleteConfirmModal" class="modal">
            <div class="modal-box">
                <h3 class="font-bold text-lg">Delete Project</h3>
                <p class="py-4">Are you sure you want to delete this project? This action cannot be undone.</p>
                <div class="modal-action">
                    <button
                        type="button"
                        class="btn btn-error"
                        @click="deleteProject(projectIdToDelete)"
                    >
                        Delete
                    </button>
                    <button
                        type="button"
                        class="btn"
                        @click="showDeleteConfirmModal = false"
                    >
                        Cancel
                    </button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button @click="showDeleteConfirmModal = false">Close</button>
            </form>
        </dialog>
    </div>
</template>

<style scoped>
.modal {
    background-color: rgba(0, 0, 0, 0.4);
}

.modal-backdrop {
    background: none;
}

.modal-box {
    max-height: 90vh;
}
</style>
