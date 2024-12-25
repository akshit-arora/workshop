<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, defineOptions } from 'vue';
import { 
    PlayIcon, 
    BookmarkIcon, 
    PencilSquareIcon, 
    DocumentDuplicateIcon, 
    TrashIcon 
} from '@heroicons/vue/24/outline';

// Dummy data for tables list
const tables = ref([
    'users',
    'projects',
    'tasks',
    'settings',
    'analytics',
    'logs'
]);

const searchQuery = ref('');
const filteredTables = computed(() => {
    return tables.value.filter(table => 
        table.toLowerCase().includes(searchQuery.value.toLowerCase())
    );
});

const selectedTable = ref('users');
const queryInput = ref('SELECT * FROM users');

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

// Load saved queries from localStorage on mount
onMounted(() => {
    const saved = localStorage.getItem('savedQueries');
    if (saved) {
        savedQueries.value = JSON.parse(saved);
    }
});

// Save to localStorage when queries change
const saveToPersistentStorage = () => {
    localStorage.setItem('savedQueries', JSON.stringify(savedQueries.value));
};

// Watch for changes in savedQueries
watch(savedQueries, saveToPersistentStorage, { deep: true });

// Dummy data for table content
const tableData = ref({
    headers: ['id', 'name', 'email', 'created_at'],
    rows: [
        { id: 1, name: 'John Doe', email: 'john@example.com', created_at: '2024-03-15' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', created_at: '2024-03-14' },
        { id: 3, name: 'Bob Johnson', email: 'bob@example.com', created_at: '2024-03-13' },
        { id: 4, name: 'Alice Brown', email: 'alice@example.com', created_at: '2024-03-12' },
        { id: 5, name: 'Charlie Wilson', email: 'charlie@example.com', created_at: '2024-03-11' }
    ]
});

const tableColumns = computed(() => {
    return Object.keys(tableData.value.rows[0]);
});

const selectTable = (table: string) => {
    selectedTable.value = table;
    queryInput.value = `SELECT * FROM ${table}`;
};

const executeQuery = () => {
    // In a real application, this would send the query to the backend
    console.log('Executing query:', queryInput.value);
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
</script>

<template>
    <div class="flex h-full">
        <!-- Tables sidebar -->
        <div class="w-64 bg-base-200 border-r border-base-300 p-4">
            <h2 class="text-lg font-semibold mb-4">Tables</h2>
            <div class="form-control mb-4">
                <input 
                    type="text"
                    v-model="searchQuery"
                    placeholder="Search tables..."
                    class="input input-bordered input-sm w-full"
                />
            </div>
            <ul class="menu bg-base-200 rounded-box">
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

        <!-- Main content -->
        <div class="flex-1 p-6">
            <!-- Query input -->
            <div class="mb-6">
                <div class="flex justify-between items-center mb-2">
                    <label class="label">
                        <span class="label-text">SQL Query</span>
                    </label>
                    <div class="dropdown dropdown-end">
                        <label tabindex="0" class="btn btn-ghost btn-sm">
                            Saved Queries
                        </label>
                        <ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
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
                        placeholder="Enter your SQL query here..."
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
            <div class="overflow-x-auto bg-base-100 rounded-box">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th v-for="column in tableColumns" :key="column">{{ column }}</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in tableData.rows" :key="row.id">
                            <td v-for="column in tableColumns" :key="column">
                                {{ row[column] }}
                            </td>
                            <td class="space-x-2">
                                <div class="tooltip" data-tip="Edit Record">
                                    <button @click="editRecord(row)" class="btn btn-ghost btn-xs">
                                        <PencilSquareIcon class="h-4 w-4" />
                                    </button>
                                </div>
                                <div class="tooltip" data-tip="Clone Record">
                                    <button @click="cloneRecord(row)" class="btn btn-ghost btn-xs">
                                        <DocumentDuplicateIcon class="h-4 w-4" />
                                    </button>
                                </div>
                                <div class="tooltip" data-tip="Delete Record">
                                    <button @click="deleteRecord(row)" class="btn btn-error btn-xs">
                                        <TrashIcon class="h-4 w-4" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
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
</template>

<style scoped>
.font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
</style>
