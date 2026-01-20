<script setup lang="ts">
import { ref, onMounted, onUnmounted, inject, watch, nextTick, type Ref, computed, onActivated } from 'vue';
import { Terminal } from 'xterm';

defineOptions({
  name: 'Xterm'
});
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { 
    TrashIcon, 
    PlusIcon,
    ChevronDownIcon
} from '@heroicons/vue/24/outline';

// Types
interface SavedCommand {
    id: number;
    name: string;
    command: string;
    projectId?: string | number;
}

interface Project {
    id: string;
    name: string;
    location: string;
}

interface LaravelCommand {
    name: string;
    description?: string;
}

// Injections
const selectedProject = inject<Ref<Project | null>>('selectedProject');
const isLaravelProject = inject<Ref<boolean>>('isLaravelProject');

// State
const terminalContainer = ref<HTMLElement | null>(null);
const savedCommands = ref<SavedCommand[]>([]);
const newCommandName = ref('');
const newCommandContent = ref('');
const isModalOpen = ref(false);
const isTerminalReady = ref(false);
const termId = ref<string>(`term-${Date.now()}`);

// Terminal instances
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let unlisten: (() => void) | null = null;

// Load saved commands from storage
const loadSavedCommands = () => {
    const saved = localStorage.getItem('savedCommands.' + selectedProject?.value?.id);
    if (saved) {
        savedCommands.value = JSON.parse(saved);
    }
};

// Save to storage
const saveCommandsToStorage = () => {
    localStorage.setItem('savedCommands.' + selectedProject?.value?.id, JSON.stringify(savedCommands.value));
};

// Filter commands for current project
// Filter commands for current project
const projectCommands = ref<SavedCommand[]>([]);
const laravelCommands = ref<LaravelCommand[]>([]);
const laravelCommandSearch = ref('');

const filteredLaravelCommands = computed(() => {
    if (!laravelCommandSearch.value) return laravelCommands.value;
    const lower = laravelCommandSearch.value.toLowerCase();
    return laravelCommands.value.filter(c => 
        c.name.toLowerCase().includes(lower) || 
        (c.description && c.description.toLowerCase().includes(lower))
    );
});

const fetchLaravelCommands = async () => {
    if (!selectedProject?.value?.id) {
        console.log('Skipping fetchLaravelCommands: No selected project ID');
        return;
    }
    console.log('Fetching Laravel commands for project:', selectedProject.value.id);
    try {
        const cmds = await invoke<LaravelCommand[]>('get_laravel_commands', {
             id: String(selectedProject.value.id)
        });
        console.log('Fetched commands:', cmds);
        laravelCommands.value = cmds;
    } catch (e) {
        console.error("Failed to fetch laravel commands", e);
        laravelCommands.value = [];
    }
};

watch(() => isLaravelProject?.value, async (newVal) => {
    if (newVal) {
        await fetchLaravelCommands();
    } else {
        laravelCommands.value = [];
    }
});

watch([savedCommands, selectedProject], () => {
    if (selectedProject?.value) {
        projectCommands.value = savedCommands.value.filter(
            cmd => !cmd.projectId || String(cmd.projectId) === String(selectedProject.value?.id)
        );
    } else {
        projectCommands.value = savedCommands.value;
    }
}, { deep: true });

const saveNewCommand = () => {
    if (newCommandName.value && newCommandContent.value) {
        savedCommands.value.push({
            id: Date.now(),
            name: newCommandName.value,
            command: newCommandContent.value,
            projectId: selectedProject?.value?.id
        });
        saveCommandsToStorage();
        newCommandName.value = '';
        newCommandContent.value = '';
        isModalOpen.value = false;
    }
};

const deleteCommand = (id: number) => {
    savedCommands.value = savedCommands.value.filter(c => c.id !== id);
    saveCommandsToStorage();
};

const runSavedCommand = (cmd: SavedCommand) => {
    if (isTerminalReady.value) {
        invoke('write_pty', {
            id: termId.value,
            data: cmd.command + '\r'
        }).catch(err => {
            console.error('Failed to write command to PTY:', err);
            term?.write(`\r\nError: ${err}\r\n`);
        });
    }
};

const runLaravelCommand = (commandName: string) => {
    if (isTerminalReady.value) {
        invoke('write_pty', {
            id: termId.value,
            data: `php artisan ${commandName}\r`
        }).catch(err => {
             console.error('Failed to write command to PTY:', err);
             term?.write(`\r\nError: ${err}\r\n`);
        });
    }
};

// Terminal Logic
const initTerminal = async () => {
    if (!terminalContainer.value) return;

    term = new Terminal({
        cursorBlink: true,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 14,
        theme: {
            background: '#1d232a', // base-300 approx
            foreground: '#a6adbb', // base-content approx
        },
        allowProposedApi: true
    });

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalContainer.value);
    fitAddon.fit();
    
    // Initial welcome message (optional, shell will provide prompt)
    // term.writeln('Initializing shell...');

    // Handle user input
    term.onData(data => {
        invoke('write_pty', {
            id: termId.value,
            data: data
        }).catch(err => {
            console.error('Failed to write to PTY:', err);
        });
    });

    // Start PTY
    await startPty();

    isTerminalReady.value = true;
    
    // Check if we need to load Laravel commands immediately
    if (isLaravelProject?.value) {
        console.log('Terminal ready and is Laravel, fetching commands...');
        fetchLaravelCommands();
    }
};

const startPty = async () => {
    const cwd = selectedProject?.value?.location || undefined;
    const cols = term?.cols || 80;
    const rows = term?.rows || 24;

    try {
        await invoke('spawn_pty', {
            id: termId.value,
            cwd: cwd,
            rows: rows,
            cols: cols
        });

        // Listen for output
        unlisten = await listen<string>(`pty-output-${termId.value}`, (event) => {
            term?.write(event.payload);
        });

    } catch (err) {
        term?.writeln(`\r\nError starting terminal: ${err}`);
        console.error('Error starting PTY:', err);
    }
};

const handleResize = () => {
    if (!fitAddon || !term) return;
    
    fitAddon.fit();
    
    // Notify backend of resize
    invoke('resize_pty', {
        id: termId.value,
        rows: term.rows,
        cols: term.cols
    }).catch(console.error);
};

onMounted(() => {
    loadSavedCommands();
    // Wait for container
    nextTick(() => {
        initTerminal();
    });
    
    window.addEventListener('resize', handleResize);
});

onActivated(() => {
    // When the component is reactivated (KeepAlive), ensure the terminal fits the container
    nextTick(() => {
        handleResize();
        term?.focus();
    });
});

onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
    if (unlisten) {
        unlisten();
    }
    term?.dispose();
    // Ideally we should also kill the PTY on the backend
});

watch(() => selectedProject?.value, (newVal) => {
    if (newVal && isTerminalReady.value) {
        // Change directory in the running terminal
        // This is a bit naive but works for most shells
        invoke('write_pty', {
            id: termId.value,
            data: `cd "${newVal.location}"\r`
        }).catch(console.error);
        
        term?.focus();
        
        // Also fetch commands if laravel
        if (isLaravelProject?.value) {
            console.log('Selected project changed and is Laravel, fetching commands...');
            fetchLaravelCommands();
        }
    }
});

</script>

<template>
    <div class="flex flex-col h-full p-4 gap-4">
        <!-- Top Toolbar -->
        <!-- Top Toolbar -->
        <div class="flex items-center gap-2">
            <!-- Left Side: Command Buttons -->
            <div class="flex gap-2">
                 <!-- Saved Commands Dropdown -->
                <div class="dropdown">
                    <div tabindex="0" role="button" class="btn btn-sm">
                        Saved Commands
                        <ChevronDownIcon class="w-4 h-4 ml-1" />
                    </div>
                    <!-- Dropdown Content -->
                    <div tabindex="0" class="dropdown-content z-[10] menu p-2 shadow bg-base-200 rounded-box w-96 max-h-[80vh] overflow-y-auto flex flex-col gap-1 mt-1">
                        <div class="flex justify-between items-center px-4 py-2 border-b border-base-300 mb-2">
                            <span class="font-bold text-sm">Project Commands</span>
                            <button @click="isModalOpen = true" class="btn btn-xs btn-ghost btn-square" title="Add Command">
                                <PlusIcon class="w-4 h-4" />
                            </button>
                        </div>
                        
                        <div v-if="projectCommands.length === 0" class="text-center p-4 opacity-50 text-sm">
                            No saved commands
                        </div>
                        
                        <div v-for="cmd in projectCommands" :key="cmd.id" 
                             class="group relative flex items-center p-2 hover:bg-base-100 rounded-lg cursor-pointer ml-1 mr-1"
                             @click="runSavedCommand(cmd); ($event.currentTarget as HTMLElement).parentElement?.blur()">
                             <div class="flex flex-col min-w-0 flex-1">
                                <span class="font-medium text-sm">{{ cmd.name }}</span>
                                <span class="text-xs opacity-60 font-mono truncate">{{ cmd.command }}</span>
                             </div>
                             <button @click.stop="deleteCommand(cmd.id)" class="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 ml-2">
                                <TrashIcon class="w-4 h-4 text-error" />
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Laravel Commands Dropdown -->
                <div v-if="isLaravelProject" class="dropdown">
                    <div tabindex="0" role="button" class="btn btn-sm">
                        Laravel Commands
                        <ChevronDownIcon class="w-4 h-4 ml-1" />
                    </div>
                    <div tabindex="0" class="dropdown-content z-[10] shadow bg-base-200 rounded-box w-[600px] mt-1 flex flex-col">
                         <div class="px-2 py-2 border-b border-base-300 bg-base-200">
                            <input 
                                type="text" 
                                v-model="laravelCommandSearch" 
                                class="input input-sm input-bordered w-full" 
                                placeholder="Search artisan commands..."
                                @click.stop
                            />
                        </div>
                         <div class="overflow-y-auto overflow-x-hidden max-h-[60vh] p-2">
                             <div v-if="filteredLaravelCommands.length === 0" class="text-center p-4 opacity-50 text-sm">
                                No commands found
                             </div>
                             <div v-for="cmd in filteredLaravelCommands" :key="cmd.name"
                                  class="group relative flex items-center p-2 hover:bg-base-100 rounded-lg cursor-pointer"
                                  @click="runLaravelCommand(cmd.name); (($event.currentTarget as HTMLElement).closest('.dropdown-content') as HTMLElement)?.blur()">
                                  <div class="flex flex-col min-w-0 flex-1">
                                    <span class="font-medium text-sm truncate text-primary">{{ cmd.name }}</span>
                                    <span class="text-xs opacity-60 truncate block" :title="cmd.description">{{ cmd.description }}</span>
                                  </div>
                             </div>
                         </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Terminal Area -->
        <div class="flex-1 min-w-0">
            <div class="h-full rounded-box overflow-hidden border border-base-300 bg-[#1d232a] relative">
                 <div ref="terminalContainer" class="absolute inset-0 p-2"></div>
            </div>
        </div>

        <!-- Add Command Modal -->
        <dialog class="modal" :class="{ 'modal-open': isModalOpen }">
            <div class="modal-box">
                <h3 class="font-bold text-lg mb-4">Save Command</h3>
                <div class="form-control w-full mb-4">
                    <label class="label"><span class="label-text">Name</span></label>
                    <input type="text" v-model="newCommandName" class="input input-bordered w-full" placeholder="e.g. Run Migrations" />
                </div>
                <div class="form-control w-full mb-4">
                    <label class="label"><span class="label-text">Command</span></label>
                    <textarea v-model="newCommandContent" class="textarea textarea-bordered h-24 font-mono w-full" placeholder="npm run migrate"></textarea>
                </div>
                <div class="modal-action">
                    <button class="btn" @click="isModalOpen = false">Cancel</button>
                    <button class="btn btn-primary" @click="saveNewCommand" :disabled="!newCommandName || !newCommandContent">Save</button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button @click="isModalOpen = false">close</button>
            </form>
        </dialog>
    </div>
</template>

<style scoped>
/* Ensure xterm fits container */
:deep(.xterm-viewport) {
    overflow-y: auto !important;
}
</style>
