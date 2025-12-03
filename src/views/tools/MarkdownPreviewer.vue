<script setup lang="ts">
import { ref, watch } from 'vue';
import { marked } from 'marked';

const markdownInput = ref<string>('# Hello World\n\nStart typing markdown here...');
const renderedMarkdown = ref<string>('');

watch(markdownInput, async (newVal) => {
    const result = marked.parse(newVal);
    if (result instanceof Promise) {
        renderedMarkdown.value = await result;
    } else {
        renderedMarkdown.value = result;
    }
}, { immediate: true });

const copyHtmlSuccess = ref(false);
const copyRichTextSuccess = ref(false);

const copyHtml = async () => {
    try {
        await navigator.clipboard.writeText(renderedMarkdown.value);
        copyHtmlSuccess.value = true;
        setTimeout(() => {
            copyHtmlSuccess.value = false;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy', err);
    }
};

const copyRichText = async () => {
    try {
        const blobHtml = new Blob([renderedMarkdown.value], { type: 'text/html' });
        const blobText = new Blob([markdownInput.value], { type: 'text/plain' });
        const data = [new ClipboardItem({
            ["text/html"]: blobHtml,
            ["text/plain"]: blobText
        })];
        await navigator.clipboard.write(data);
        copyRichTextSuccess.value = true;
        setTimeout(() => {
            copyRichTextSuccess.value = false;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy rich text', err);
    }
};
</script>

<template>
    <div class="h-[calc(100vh-4rem)] flex flex-col p-4 gap-4">
        <div class="flex justify-between items-center">
            <h1 class="text-2xl font-bold">Markdown Previewer</h1>
        </div>
        
        <div class="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 h-full overflow-hidden">
            <!-- Editor Section -->
            <div class="flex flex-col h-full bg-base-100 rounded-lg shadow-lg overflow-hidden">
                <div class="bg-base-200 p-2 px-4 border-b border-base-300 flex justify-between items-center">
                    <span class="font-semibold text-sm uppercase tracking-wider">Editor</span>
                </div>
                <textarea 
                    v-model="markdownInput"
                    class="flex-1 w-full h-full p-4 resize-none focus:outline-none bg-base-100 font-mono text-sm leading-relaxed"
                    placeholder="Type your markdown here..."
                ></textarea>
            </div>

            <!-- Preview Section -->
            <div class="flex flex-col h-full bg-base-100 rounded-lg shadow-lg overflow-hidden">
                <div class="bg-base-200 p-2 px-4 border-b border-base-300 flex justify-between items-center">
                    <span class="font-semibold text-sm uppercase tracking-wider">Preview</span>
                    <div class="flex gap-2">
                        <button 
                            @click="copyRichText"
                            class="btn btn-xs btn-ghost gap-1"
                            :class="{ 'text-success': copyRichTextSuccess }"
                        >
                            <span v-if="!copyRichTextSuccess">Copy</span>
                            <span v-else>Copied!</span>
                        </button>
                        <button 
                            @click="copyHtml"
                            class="btn btn-xs btn-ghost gap-1"
                            :class="{ 'text-success': copyHtmlSuccess }"
                        >
                            <span v-if="!copyHtmlSuccess">Copy HTML</span>
                            <span v-else>Copied!</span>
                        </button>
                    </div>
                </div>
                <div 
                    class="flex-1 w-full h-full p-6 overflow-y-auto prose prose-sm md:prose-base lg:prose-lg max-w-none dark:prose-invert"
                    v-html="renderedMarkdown"
                ></div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Custom scrollbar for better UX */
textarea::-webkit-scrollbar,
div[class*="overflow-y-auto"]::-webkit-scrollbar {
    width: 8px;
}

textarea::-webkit-scrollbar-track,
div[class*="overflow-y-auto"]::-webkit-scrollbar-track {
    background: transparent;
}

textarea::-webkit-scrollbar-thumb,
div[class*="overflow-y-auto"]::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.5);
    border-radius: 4px;
}

textarea::-webkit-scrollbar-thumb:hover,
div[class*="overflow-y-auto"]::-webkit-scrollbar-thumb:hover {
    background-color: rgba(156, 163, 175, 0.8);
}
</style>
