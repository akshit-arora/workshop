<script setup lang="ts">
import { ref, onMounted } from 'vue';

const username = ref(localStorage.getItem('userName') || 'User');
const currentTime = ref(new Date());
const greeting = ref(currentTime.value.getHours() < 12 ? 'Good Morning' : currentTime.value.getHours() < 18 ? 'Good Afternoon' : 'Good Evening');

onMounted(() => {
    const storedName = localStorage.getItem('userName');
    if (storedName) {
        username.value = storedName;
    }
});
</script>

<template>
    <h1 class="text-3xl font-bold mb-4">
        {{ greeting }}, {{ username }}
    </h1>
    <p class="text-base-content/70 max-w-xl">
        Welcome to your Workshop dashboard.
    </p>
</template>

<style scoped>
h1 {
    letter-spacing: -0.025em;
}
</style>
