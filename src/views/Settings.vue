<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useThemeStore } from '../stores/theme';

const userName = ref(localStorage.getItem('userName') || '');
const defaultEditor = ref(localStorage.getItem('defaultEditor') || 'VSCode');
const themeStore = useThemeStore();

const editors = [
    'VSCode',
    'Sublime Text',
    'PHPStorm',
    'Windsurf',
    'Zed'
];

const themes = [
    "light",
    "dark",
    "cupcake",
    "bumblebee",
    "emerald",
    "corporate",
    "synthwave",
    "retro",
    "cyberpunk",
    "valentine",
    "halloween",
    "garden",
    "forest",
    "aqua",
    "lofi",
    "pastel",
    "fantasy",
    "wireframe",
    "black",
    "luxury",
    "dracula",
    "cmyk",
    "autumn",
    "business",
    "acid",
    "lemonade",
    "night",
    "coffee",
    "winter",
    "dim",
    "nord",
    "sunset",
    "caramellatte",
    "abyss",
    "silk",
];

const saveName = () => {
    localStorage.setItem('userName', userName.value);
};

// Watch for changes in defaultEditor and save immediately
watch(defaultEditor, (newEditor) => {
    localStorage.setItem('defaultEditor', newEditor);
});
</script>

<template>
    <div class="p-6">
        <h1 class="text-2xl font-bold mb-6">Settings</h1>

        <div class="card bg-base-100 shadow-xl mb-6">
            <div class="card-body">
                <h2 class="card-title mb-4">Personal Settings</h2>

                <div class="form-control w-full max-w-md mb-4">
                    <label class="label">
                        <span class="label-text">Your Name</span>
                    </label>
                    <div class="flex gap-2">
                        <input
                            type="text"
                            v-model="userName"
                            placeholder="Enter your name"
                            class="input input-bordered w-full"
                        />
                        <button
                            @click="saveName"
                            class="btn btn-primary"
                        >
                            Save
                        </button>
                    </div>
                </div>

                <div class="form-control w-full max-w-md">
                    <label class="label">
                        <span class="label-text">Default Code Editor</span>
                    </label>
                    <select
                        v-model="defaultEditor"
                        class="select select-bordered w-full"
                    >
                        <option
                            v-for="editor in editors"
                            :key="editor"
                            :value="editor"
                        >
                            {{ editor }}
                        </option>
                    </select>
                    <label class="label">
                        <span class="label-text-alt text-base-content/70">
                            Select your preferred code editor for opening projects
                        </span>
                    </label>
                </div>
            </div>
        </div>

        <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
                <h2 class="card-title mb-4">Appearance</h2>

                <div class="form-control w-full max-w-md">
                    <label class="label">
                        <span class="label-text">Theme</span>
                    </label>
                    <select
                        class="select select-bordered w-full"
                        v-model="themeStore.theme"
                        @change="themeStore.setTheme(themeStore.theme)"
                    >
                        <option
                            v-for="t in themes"
                            :key="t"
                            :value="t"
                        >
                            {{ t }}
                        </option>
                    </select>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.select {
    text-transform: capitalize;
}
</style>
