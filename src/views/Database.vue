<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, defineOptions } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import {
    PlayIcon,
    BookmarkIcon,
    PencilSquareIcon,
    DocumentDuplicateIcon,
    TrashIcon
} from '@heroicons/vue/24/outline';

const tables = ref<string[]>([]);

const fetchTables = async () => {
    try {
        const projectId = localStorage.getItem('selectedProject') || '';
        if (!projectId) return;

        const result = await invoke('get_project_tables', { projectId: JSON.parse(projectId).id });
        tables.value = result as string[];
    } catch (error) {
        console.error('Failed to fetch tables:', error);
        tables.value = [];
    }
};

const searchQuery = ref('');
const filteredTables = computed(() => {
    return tables.value.filter(table =>
        table.toLowerCase().includes(searchQuery.value.toLowerCase())
    );
});

const selectedTable = ref('users');
const queryInput = ref('');

const queryPlaceholder = computed(() => `SELECT * FROM ${selectedTable.value} WHERE...`);

// Saved queries management
const savedQueries = ref([
    { id: 1, name: 'Get All Users', query: 'SELECT * FROM users' },
    { id: 2, name: 'Active Projects', query: 'SELECT * FROM projects WHERE status = "active"' },
    { id: 3, name: 'Recent Tasks', query: 'SELECT * FROM tasks ORDER BY created_at DESC LIMIT 10' }
]);

const showSaveQueryModal = ref(false);
const newQueryName = ref('');
const dropdownRef = ref<HTMLElement | null>(null);

const saveCurrentQuery = () => {
    if (newQueryName.value.trim() && queryInput.value.trim()) {
        savedQueries.value.push({
            id: Date.now(),
            name: newQueryName.value,
            query: queryInput.value
        });
        newQueryName.value = '';
        showSaveQueryModal.value = false;
    }
};

const loadSavedQuery = (query: { query: string }) => {
    queryInput.value = query.query;
    showSaveQueryModal.value = false;
};

const deleteSavedQuery = (queryId: number, event: Event) => {
    event.stopPropagation();
    savedQueries.value = savedQueries.value.filter(q => q.id !== queryId);
};

const closeDropdown = () => {
    showSaveQueryModal.value = false;
};

// Load saved queries from localStorage and fetch tables on mount
onMounted(() => {
    const saved = localStorage.getItem('savedQueries');
    if (saved) {
        savedQueries.value = JSON.parse(saved);
    }
    fetchTables();
});

// Watch for project changes
watch(() => localStorage.getItem('selectedProject'), () => {
    fetchTables();
    currentPage.value = 1;
    fetchTableData();
});

// Save to localStorage when queries change
const saveToPersistentStorage = () => {
    localStorage.setItem('savedQueries', JSON.stringify(savedQueries.value));
};

// Watch for changes in savedQueries
watch(savedQueries, saveToPersistentStorage, { deep: true });

// Table data state
const tableData = ref({
    columns: [] as string[],
    rows: [] as Record<string, string>[],
    total: 0
});

// Pagination state
const currentPage = ref(1);
const perPage = ref(20);
const pageSizeOptions = [20, 50, 100];

const handlePageSizeChange = (event: Event) => {
    const size = Number((event.target as HTMLSelectElement).value);
    perPage.value = size;
    currentPage.value = 1; // Reset to first page when changing page size
    fetchTableData();
};

const tableColumns = computed(() => tableData.value.columns);

const fetchTableData = async () => {
    try {
        const projectId = localStorage.getItem('selectedProject') || '';
        if (!projectId) return;

        const result = await invoke('get_table_data', {
            projectId: JSON.parse(projectId).id,
            tableName: selectedTable.value,
            page: currentPage.value,
            perPage: perPage.value
        });

        tableData.value = result as typeof tableData.value;
    } catch (error) {
        console.error('Failed to fetch table data:', error);
        tableData.value = { columns: [], rows: [], total: 0 };
    }
};

const selectTable = (table: string) => {
    selectedTable.value = table;
    currentPage.value = 1; // Reset to first page
    fetchTableData();
};

const executeQuery = async () => {
    try {
        const projectId = localStorage.getItem('selectedProject') || '';
        if (!projectId) return;

        const query = queryInput.value.trim();
        if (!query) {
            fetchTableData();
            return;
        };

        const result = await invoke('execute_query', {
            projectId: JSON.parse(projectId).id,
            query: `SELECT * FROM ${selectedTable.value} WHERE ${query}`
        });

        // Update the table data with the query results
        tableData.value = result as typeof tableData.value;
    } catch (error) {
        console.error('Failed to execute query:', error);
        tableData.value = { columns: [], rows: [], total: 0 };
    }
};

const editRecord = (row: any) => {
    console.log('Editing record:', row);
    // Here you would implement the edit logic
};

const deleteRecord = (row: any) => {
    console.log('Deleting record:', row);
    // Here you would implement the delete logic
};

const cloneRecord = (row: any) => {
    console.log('Cloning record:', row);
    // Here you would implement the clone logic
};

// Row details modal state
const showDetailsModal = ref(false);
const selectedRowDetails = ref<Record<string, string> | null>(null);

const showRowDetails = (row: Record<string, string>) => {
    selectedRowDetails.value = row;
    showDetailsModal.value = true;
};

// Handle escape key press
const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && showDetailsModal.value) {
        showDetailsModal.value = false;
    }
};

// Add and remove event listener
onMounted(() => {
    document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
    <div class="flex h-full">
        <!-- Tables sidebar -->
        <div class="w-64 rounded-box bg-base-200 border-r border-base-300 flex flex-col h-full m-4">
            <div class="p-4 flex-shrink-0">
                <h2 class="text-lg font-semibold mb-4">Tables</h2>
                <div class="form-control mb-4">
                    <input
                    type="text"
                    v-model="searchQuery"
                    placeholder="Search tables..."
                    class="input input-bordered input-sm w-full"
                ></div>
            </div>
            <div class="flex-1 overflow-y-auto">
                <ul class="menu bg-base-200 rounded-box p-4">
                    <li v-for="table in filteredTables" :key="table">
                        <a
                            @click="selectTable(table)"
                            :class="{ 'active': selectedTable === table }"
                        >
                            {{ table }}
                        </a>
                    </li>
                </ul>
            </div>
        </div>

        <!-- Main content -->
        <div class="flex-1 flex flex-col h-full">
            <!-- Query input -->
            <div class="flex-shrink-0 py-6">
                <div class="flex justify-between items-center mb-2">
                    <label class="label">
                        <span class="label-text">SQL Query</span>
                    </label>
                    <div class="dropdown dropdown-end">
                        <label tabindex="0" class="btn btn-ghost btn-sm">
                            Saved Queries
                        </label>
                        <ul tabindex="0" class="dropdown-content z-1 menu p-2 shadow-sm bg-base-100 rounded-box w-52">
                            <li v-for="query in savedQueries" :key="query.id">
                                <a @click="loadSavedQuery(query)">{{ query.name }}</a>
                            </li>
                        </ul>
                    </div>
                </div>
                <div class="join w-full">
                    <input
                        v-model="queryInput"
                        class="input input-bordered join-item w-full font-mono"
                        :placeholder="queryPlaceholder"
                        @keyup.enter="executeQuery"
                        autocomplete="off"
                        autocorrect="off"
                        autocapitalize="off"
                        spellcheck="false"
                    />
                    <div class="join-item flex items-center space-x-2">
                        <div class="tooltip" data-tip="Execute Query">
                            <button @click="executeQuery" class="btn btn-primary">
                                <PlayIcon class="h-5 w-5" />
                            </button>
                        </div>
                        <div class="tooltip" data-tip="Save Query">
                            <button @click="showSaveQueryModal = true" class="btn btn-ghost">
                                <BookmarkIcon class="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Results table -->
            <div class="bg-base-100 flex-1 flex flex-col min-h-0 p-6 rounded-box">
                <div class="flex-1 relative">
                    <div class="absolute inset-0 overflow-auto">
                        <table class="table table-zebra">
                            <thead class="sticky top-0 bg-base-100 z-10">
                                <tr>
                                    <th v-for="column in tableColumns" :key="column" class="whitespace-nowrap">
                                        {{ column }}
                                    </th>
                                    <th class="sticky right-0 bg-base-100 w-28">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="row in tableData.rows"
                                    :key="row.id || Math.random()"
                                    @click="showRowDetails(row)"
                                    class="cursor-pointer hover:bg-base-200"
                                >
                                    <td v-for="column in tableColumns" :key="column" class="whitespace-nowrap">
                                        {{ row[column] }}
                                    </td>
                                    <td class="sticky right-0 bg-base-100 w-28">
                                        <div class="flex items-center justify-center space-x-2">
                                            <div class="tooltip" data-tip="Edit Record">
                                                <button @click.stop="editRecord(row)" class="btn btn-ghost btn-xs">
                                                    <PencilSquareIcon class="h-4 w-4" />
                                                </button>
                                            </div>
                                            <div class="tooltip" data-tip="Clone Record">
                                                <button @click.stop="cloneRecord(row)" class="btn btn-ghost btn-xs">
                                                    <DocumentDuplicateIcon class="h-4 w-4" />
                                                </button>
                                            </div>
                                            <div class="tooltip" data-tip="Delete Record">
                                                <button @click.stop="deleteRecord(row)" class="btn btn-error btn-xs">
                                                    <TrashIcon class="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Pagination -->
                <div class="flex justify-between items-center p-4">
                    <div class="flex items-center gap-4">
                        <select
                            class="select select-bordered select-sm w-24"
                            :value="perPage"
                            @change="handlePageSizeChange"
                        >
                            <option v-for="size in pageSizeOptions" :key="size" :value="size">
                                {{ size }} rows
                            </option>
                        </select>
                        <div class="text-sm text-base-content/70">
                            Showing {{ (currentPage - 1) * perPage + 1 }} to {{ Math.min(currentPage * perPage, tableData.total) }} of {{ tableData.total }} entries
                        </div>
                    </div>
                    <div class="join">
                        <button
                            class="join-item btn btn-sm"
                            :disabled="currentPage === 1"
                            @click="currentPage--; fetchTableData();"
                        >
                            Previous
                        </button>
                        <button
                            class="join-item btn btn-sm"
                            :disabled="currentPage * perPage >= tableData.total"
                            @click="currentPage++; fetchTableData();"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Save Query Modal -->
    <dialog :open="showSaveQueryModal" class="modal">
        <div class="modal-box">
            <h3 class="font-bold text-lg">Save Query</h3>
            <div class="form-control w-full">
                <label class="label">
                    <span class="label-text">Query Name</span>
                </label>
                <input
                    v-model="newQueryName"
                    type="text"
                    placeholder="Enter query name"
                    class="input input-bordered w-full"
                />
            </div>
            <div class="modal-action">
                <button @click="showSaveQueryModal = false" class="btn">Cancel</button>
                <button @click="saveCurrentQuery" class="btn btn-primary">Save</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>close</button>
        </form>
    </dialog>

    <!-- Row Details Modal -->
    <dialog :open="showDetailsModal" class="modal">
        <div class="modal-box w-11/12 max-w-2xl">
            <h3 class="font-bold text-lg mb-4">Row Details</h3>
            <div class="overflow-y-auto max-h-[70vh]">
                <div v-if="selectedRowDetails" class="grid gap-4">
                    <div v-for="column in tableColumns" :key="column" class="grid grid-cols-3 gap-4 items-start p-3 rounded-lg hover:bg-base-200">
                        <div class="font-semibold text-base-content/70">{{ column }}</div>
                        <div class="col-span-2 font-mono break-all">{{ selectedRowDetails[column] }}</div>
                    </div>
                </div>
            </div>
            <div class="modal-action">
                <button @click="showDetailsModal = false" class="btn">Close</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop" @click="showDetailsModal = false">
            <button>close</button>
        </form>
    </dialog>
</template>

<style scoped>
.font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
</style>
