<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, reactive, inject, type Ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import {
    PlayIcon,
    BookmarkIcon,
    TrashIcon,
    InformationCircleIcon
} from '@heroicons/vue/24/outline';

//-----------------------------------------------------------------------------
// Type Definitions
//-----------------------------------------------------------------------------

/**
 * Represents a saved SQL query with a unique identifier and name
 */
interface SavedQuery {
    id: number;
    name: string;
    query: string;
    table: string;
}

/**
 * Represents a row in the database table
 * Can have an optional ID and dynamic properties
 */
interface TableRow {
    id?: string | number;
    [key: string]: any;
}

/**
 * Represents a project in the workspace
 */
interface Project {
    id: string | number;
    name: string;
}

/**
 * Represents the current state of a database table
 * including its structure and pagination info
 */
interface TableState {
    columns: string[];
    rows: TableRow[];
    total: number;
}

/** Valid page sizes for table pagination */
type PageSize = 20 | 50 | 100;

//-----------------------------------------------------------------------------
// State Management
//-----------------------------------------------------------------------------

/**
 * Table and Database State
 */
const tables = ref<string[]>([]);
const selectedTable = ref<string | null>(null);
const tableData = ref<TableState>({
    columns: [],
    rows: [],
    total: 0
});

/**
 * Loading States
 * Tracks loading status for async operations
 */
const loadingState = reactive({
    tables: false,  // Loading state for table list
    data: false,    // Loading state for table data
    query: false,   // Loading state for query execution
    deleting: false // Deleting a row
});

/**
 * Error States
 * Stores error messages for different operations
 */
const errorState = reactive({
    tables: null as string | null,  // Error state for table list
    data: null as string | null,    // Error state for table data
    query: null as string | null,   // Error state for query execution
    deleting: null as string | null // Error state for delete operations
});

/**
 * Query Management State
 * Handles SQL query input, saving, and search functionality
 */
const queryInput = ref<string>('');           // Current SQL query
const searchQuery = ref<string>('');          // Table search filter
const showSaveQueryModal = ref<boolean>(false);
const newQueryName = ref<string>('');
const savedQueries = ref<SavedQuery[]>([]);

/**
 * Pagination Configuration
 * Controls table data pagination
 */
const currentPage = ref<number>(1);
const perPage = ref<PageSize>(20);
const pageSizeOptions = [20, 50, 100] as const;

/**
 * Injected State
 */
const selectedProject = inject<Ref<Project | null>>('selectedProject');

//-----------------------------------------------------------------------------
// Computed Properties
//-----------------------------------------------------------------------------

/**
 * Filtered list of tables based on search query
 */
const filteredTables = computed(() => {
    return tables.value.filter(table =>
        table.toLowerCase().includes(searchQuery.value.toLowerCase())
    );
});

/**
 * Dynamic placeholder for the SQL query input
 * Shows table-specific hint when a table is selected
 */
const queryPlaceholder = computed(() =>
    selectedTable.value ? `SELECT * FROM ${selectedTable.value} WHERE...` : ''
);

/**
 * List of columns for the current table
 */
const tableColumns = computed(() => tableData.value.columns);

//-----------------------------------------------------------------------------
// Data Fetching Functions
//-----------------------------------------------------------------------------

/**
 * Fetches the list of available tables for the current project
 * Updates the tables state and handles loading/error states
 */
const fetchTables = async (): Promise<void> => {
    loadingState.tables = true;
    errorState.tables = null;

    try {
        if (!selectedProject?.value) {
            throw new Error('No project selected');
        }

        const project = selectedProject.value;
        const result = await invoke<string[]>('get_project_tables', { projectId: project.id });
        tables.value = result;
    } catch (error) {
        console.error('Failed to fetch tables:', error);
        tables.value = [];
        errorState.tables = error instanceof Error ? error.message : 'Failed to fetch tables';
    } finally {
        loadingState.tables = false;
    }
};

//-----------------------------------------------------------------------------
// Query Management Functions
//-----------------------------------------------------------------------------

/**
 * Saves the current query with a name to the saved queries list
 * Validates both query and name before saving
 */
const saveCurrentQuery = () => {
    if (newQueryName.value.trim() && queryInput.value.trim()) {
        savedQueries.value.push({
            id: Date.now(),
            name: newQueryName.value,
            query: queryInput.value,
            table: selectedTable.value || ''
        });
        newQueryName.value = '';
        showSaveQueryModal.value = false;
    }
};

/**
 * Loads a saved query into the query input
 */
const loadSavedQuery = (query: SavedQuery) => {
    selectTable(query.table || '');
    queryInput.value = query.query;
    showSaveQueryModal.value = false;
    fetchTableData();
};

/**
 * Removes a saved query by its ID
 */
const removeSavedQuery = (id: number) => {
    savedQueries.value = savedQueries.value.filter(q => q.id !== id);
};

//-----------------------------------------------------------------------------
// Lifecycle Hooks & Watchers
//-----------------------------------------------------------------------------

/**
 * Component initialization
 * - Loads saved queries from localStorage
 * - Fetches initial table list
 */
onMounted(() => {
    const saved = localStorage.getItem('savedQueries');
    if (saved) {
        savedQueries.value = JSON.parse(saved);
    }
    fetchTables();
});

/**
 * Watches for project changes
 * Resets and refetches data when project changes
 */
watch(() => selectedProject?.value, (newProject) => {
    if (newProject) {
        fetchTables();
        currentPage.value = 1;
        fetchTableData();
    } else {
        tables.value = [];
        tableData.value = { columns: [], rows: [], total: 0 };
    }
}, { deep: true });

/**
 * Persists saved queries to localStorage
 */
const saveToPersistentStorage = () => {
    localStorage.setItem('savedQueries', JSON.stringify(savedQueries.value));
};

// Watch for changes in savedQueries and persist them
watch(savedQueries, saveToPersistentStorage, { deep: true });

//-----------------------------------------------------------------------------
// Utility Functions
//-----------------------------------------------------------------------------

/**
 * Type guard to validate page size values
 */
const isValidPageSize = (size: number): size is PageSize => {
    return pageSizeOptions.includes(size as PageSize);
};

/**
 * Handles page size change from dropdown
 * Validates input and updates pagination
 */
const handlePageSizeChange = (event: Event): void => {
    const size = Number((event.target as HTMLSelectElement).value);
    if (isValidPageSize(size)) {
        perPage.value = size;
        currentPage.value = 1; // Reset to first page when changing page size
        fetchTableData();
    }
};

/**
 * Fetches data for the selected table with pagination
 * Updates tableData state and handles loading/error states
 */
const fetchTableData = async (): Promise<void> => {
    loadingState.data = true;
    errorState.data = null;

    try {
        if (!selectedProject?.value) {
            throw new Error('No project selected');
        }

        const project = selectedProject.value;
        const result = await invoke<TableState>('get_table_data', {
            projectId: project.id,
            tableName: selectedTable.value,
            page: currentPage.value,
            perPage: perPage.value,
            whereClause: queryInput.value.trim()
        });

        tableData.value = result;
    } catch (error) {
        console.error('Failed to fetch table data:', error);
        tableData.value = { columns: [], rows: [], total: 0 };
        errorState.data = error instanceof Error ? error.message : 'Failed to fetch table data';
    } finally {
        loadingState.data = false;
    }
};

// Modal states
const modalState = reactive({
    saveQuery: {
        isOpen: false,
        newName: ''
    },
    rowDetails: {
        isOpen: false,
        isEditing: false,
        selectedRow: null as TableRow | null
    }
});

// Metadata State
type MetadataTab = 'columns' | 'indexes' | 'triggers';

const metadataState = reactive({
    isOpen: false,
    loading: false,
    activeTab: 'columns' as MetadataTab,
    columns: { columns: [], rows: [], total: 0 } as TableState,
    indexes: { columns: [], rows: [], total: 0 } as TableState,
    triggers: { columns: [], rows: [], total: 0 } as TableState,
    error: null as string | null
});

const fetchMetadata = async () => {
    if (!selectedTable.value || !selectedProject?.value) return;
    
    metadataState.loading = true;
    metadataState.error = null;
    metadataState.isOpen = true;
    
    try {
        const project = selectedProject.value;
        const tableName = selectedTable.value;
        
        // Run queries in parallel
        const [columnsRes, indexesRes, triggersRes] = await Promise.all([
            invoke<TableState>('execute_query', {
                projectId: project.id,
                query: `SHOW COLUMNS FROM ${tableName}`
            }),
            invoke<TableState>('execute_query', {
                projectId: project.id,
                query: `SHOW INDEX FROM ${tableName}`
            }),
            invoke<TableState>('execute_query', {
                projectId: project.id,
                query: `SHOW TRIGGERS LIKE '${tableName}'`
            })
        ]);

        metadataState.columns = columnsRes;
        metadataState.indexes = indexesRes;
        metadataState.triggers = triggersRes;
        
    } catch (e) {
        console.error('Failed to fetch metadata:', e);
        metadataState.error = e instanceof Error ? e.message : String(e);
    } finally {
        metadataState.loading = false;
    }
};

// Table operations
const selectTable = (table: string): void => {
    selectedTable.value = table;
    currentPage.value = 1; // Reset to first page
    // Reset the query input when a new table is selected
    queryInput.value = '';
    fetchTableData();
};

const executeQuery = async (): Promise<void> => {
    loadingState.query = true;
    errorState.query = null;

    try {
        let query = queryInput.value.trim();
        if (!query) {
            await fetchTableData();
            return;
        }

        if (!query.toLowerCase().includes('limit')) {
            query = `${query} LIMIT ${perPage.value}`;
        }
        
        if (!selectedProject?.value) {
            throw new Error('No project selected');
        }
        const project = selectedProject.value;
        const result = await invoke<TableState>('execute_query', {
            projectId: project.id,
            query: `SELECT * FROM ${selectedTable.value} WHERE ${query}`
        });

        tableData.value = result;
    } catch (error) {
        console.error('Failed to execute query:', error);
        tableData.value = { columns: [], rows: [], total: 0 };
        errorState.query = error instanceof Error ? error.message : 'Failed to execute query';
    } finally {
        loadingState.query = false;
    }
};

// Row operations
const editRecord = async (row: TableRow): Promise<void> => {
    if (!selectedProject?.value) return;

    const project = selectedProject.value;

    if (!selectedTable.value) return;

    // Determine primary key column
    const pkColumn = (('id' in row) ? 'id' : (tableColumns.value && tableColumns.value.length ? tableColumns.value[0] : null));
    if (!pkColumn) return;

    const pkValue = row[pkColumn];

    try {
        await invoke('update_row', {
            projectId: project.id,
            tableName: selectedTable.value,
            pkColumn,
            pkValue: String(pkValue),
            data: row
        });
        await fetchTableData();
        modalState.rowDetails.isOpen = false;
    } catch (error) {
        console.error('Failed to update record:', error);
        alert('Failed to update record: ' + (error instanceof Error ? error.message : String(error)));
    }
};

const deleteRecord = async (row: TableRow): Promise<void> => {
    // Determine project
    if (!selectedProject?.value) {
        errorState.deleting = 'No project selected';
        return;
    }

    const project = selectedProject.value;
    if (!selectedTable.value) {
        errorState.deleting = 'No table selected';
        return;
    }

    // Determine primary key column (prefer 'id', otherwise first column)
    const pkColumn = (('id' in row) ? 'id' : (tableColumns.value && tableColumns.value.length ? tableColumns.value[0] : null));
    if (!pkColumn) {
        errorState.deleting = 'Could not determine primary key column for deletion';
        return;
    }

    const pkValue = (row as any)[pkColumn];
    if (pkValue === undefined || pkValue === null) {
        errorState.deleting = `Primary key value (${pkColumn}) not found on row`;
        return;
    }

    // Confirm with the user
    const confirmed = await ask(`Delete record where ${pkColumn} = ${pkValue}? This action cannot be undone.`, {
        title: 'Confirm Deletion',
        kind: 'warning'
    });
    if (!confirmed) return;

    loadingState.deleting = true;
    errorState.deleting = null;

    try {
        const affected = await invoke<number>('delete_row', {
            projectId: project.id,
            tableName: selectedTable.value,
            pkColumn,
            pkValue: String(pkValue)
        });

        if (affected && affected > 0) {
            await fetchTableData();
        } else {
            errorState.deleting = 'No rows were deleted';
        }
    } catch (e) {
        console.error('Failed to delete row:', e);
        errorState.deleting = e instanceof Error ? e.message : String(e);
    } finally {
        loadingState.deleting = false;
    }
};

const showRowDetails = (row: TableRow): void => {
    modalState.rowDetails.selectedRow = { ...row };
    modalState.rowDetails.isEditing = false;
    modalState.rowDetails.isOpen = true;
};

// Event handlers
const handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && modalState.rowDetails.isOpen) {
        modalState.rowDetails.isOpen = false;
    }
};

// Lifecycle hooks
onMounted(() => {
    document.addEventListener('keydown', handleKeydown);
    void fetchTables(); // Initial data load
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
                <div v-if="loadingState.tables" class="flex justify-center items-center p-4">
                    <span class="loading loading-spinner loading-md"></span>
                </div>
                <div v-else-if="errorState.tables" class="p-4 text-error text-sm">
                    {{ errorState.tables }}
                </div>
                <ul v-else class="menu bg-base-200 rounded-box p-4">
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
                        <ul tabindex="0" class="dropdown-content z-1 menu p-2 shadow-sm bg-base-100 rounded-box w-72">
                            <li v-for="query in savedQueries" :key="query.id">
                                <div class="flex justify-between items-center w-full px-4 py-2 hover:bg-base-200 rounded-lg">
                                    <a class="flex-1" @click="loadSavedQuery(query)">{{ query.name }}</a>
                                    <button
                                        @click.stop="removeSavedQuery(query.id)"
                                        class="btn btn-ghost btn-xs"
                                    >
                                        <TrashIcon class="h-4 w-4" />
                                    </button>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
                <div class="join w-full">
                    <input
                        v-model="queryInput"
                        class="input input-bordered join-item w-full font-mono"
                        :placeholder="selectedTable ? queryPlaceholder : 'Select a table to begin...'"
                        @keyup.enter="fetchTableData()"
                        autocomplete="off"
                        autocorrect="off"
                        autocapitalize="off"
                        spellcheck="false"
                        :disabled="!selectedTable"
                    />
                    <div class="join-item flex items-center space-x-2">
                        <div class="tooltip" :data-tip="!selectedTable ? 'Select a table first' : 'Execute Query'">
                            <button
                                @click="fetchTableData()"
                                class="btn btn-primary"
                                :class="{ 'loading': loadingState.query }"
                                :disabled="loadingState.query || !selectedTable"
                            >
                                <PlayIcon class="h-5 w-5" v-if="!loadingState.query" />
                            </button>
                        </div>
                        <div class="tooltip" :data-tip="!selectedTable ? 'Select a table first' : 'Save Query'">
                            <button
                                @click="showSaveQueryModal = true"
                                class="btn btn-ghost"
                                :disabled="loadingState.query || !selectedTable"
                            >
                                <BookmarkIcon class="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Results table -->
            <div class="bg-base-100 flex-1 flex flex-col min-h-0 p-6 rounded-box">
                <div v-if="!selectedTable" class="flex-1 flex justify-center items-center">
                    <div class="text-center text-base-content/70">
                        <h3 class="text-lg font-semibold mb-2">No Table Selected</h3>
                        <p>Please select a table from the sidebar to view its data.</p>
                    </div>
                </div>
                <div v-else-if="loadingState.data || loadingState.query" class="flex-1 flex justify-center items-center">
                    <span class="loading loading-spinner loading-lg"></span>
                </div>
                <div v-else-if="errorState.data || errorState.query" class="flex-1 flex justify-center items-center">
                    <div class="text-error text-center">
                        <p>{{ errorState.data || errorState.query }}</p>
                        <button @click="fetchTableData" class="btn btn-sm btn-outline mt-4">Retry</button>
                    </div>
                </div>
                <div v-else class="flex-1 flex flex-col min-h-0 relative">
                    <div class="flex justify-between items-center mb-4 px-1">
                        <h3 class="text-lg font-bold flex items-center gap-2">
                            {{ selectedTable }}
                            <span class="badge badge-sm">{{ tableData.total }} rows</span>
                        </h3>
                        <button @click="fetchMetadata" class="btn btn-sm btn-outline gap-2">
                            <InformationCircleIcon class="w-4 h-4" />
                            Metadata
                        </button>
                    </div>
                    <div class="flex-1 relative border rounded-lg overflow-hidden">
                        <div class="absolute inset-0 overflow-auto">
                            <table class="table table-zebra table-pin-rows">
                                <thead class="bg-base-100 z-10">
                                    <tr>
                                        <th v-for="column in tableColumns" :key="column" class="whitespace-nowrap">
                                            {{ column }}
                                        </th>
                                        <th class="sticky right-0 bg-base-100 w-28 shadow-[-5px_0_5px_-5px_rgba(0,0,0,0.1)]">Actions</th>
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
                                        <td class="sticky right-0 bg-base-100 w-28 shadow-[-5px_0_5px_-5px_rgba(0,0,0,0.1)]">
                                            <div class="flex items-center justify-center space-x-2">
                                                <div>
                                                    <button @click.stop="deleteRecord(row)" class="btn btn-error btn-xs" :disabled="loadingState.deleting">
                                                        <TrashIcon v-if="!loadingState.deleting" class="h-4 w-4" />
                                                        <span v-else class="loading loading-spinner h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Pagination -->
                <div v-if="selectedTable && tableData.total > 0" class="flex justify-between items-center p-4">
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
    <dialog :open="modalState.rowDetails.isOpen" class="modal">
        <div class="modal-box w-11/12 max-w-2xl">
            <h3 class="font-bold text-lg mb-4">Row Details</h3>
            <div class="overflow-y-auto max-h-[70vh]">
                <div v-if="modalState.rowDetails.selectedRow" class="grid gap-4">
                    <div v-for="column in tableColumns" :key="column" class="grid grid-cols-3 gap-4 items-center p-3 rounded-lg hover:bg-base-200">
                        <div class="font-semibold text-base-content/70">{{ column }}</div>
                        <div class="col-span-2">
                            <input
                                v-if="modalState.rowDetails.isEditing && column !== 'id'"
                                v-model="modalState.rowDetails.selectedRow[column]"
                                type="text"
                                autocorrect="off"
                                autocapitalize="off"
                                autocomplete="off"
                                spellcheck="false"
                                class="input input-bordered w-full input-sm font-mono"
                            />
                            <span v-else class="font-mono break-all">{{ modalState.rowDetails.selectedRow[column] }}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-action">
                <button @click="modalState.rowDetails.isOpen = false" class="btn">
                    {{ modalState.rowDetails.isEditing ? 'Cancel' : 'Close' }}
                </button>
                <button
                    v-if="!modalState.rowDetails.isEditing"
                    @click="modalState.rowDetails.isEditing = true"
                    class="btn btn-primary"
                >
                    Edit
                </button>
                <button
                    v-if="modalState.rowDetails.isEditing && modalState.rowDetails.selectedRow"
                    @click="editRecord(modalState.rowDetails.selectedRow)"
                    class="btn btn-primary"
                >
                    Save
                </button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop" @click="modalState.rowDetails.isOpen = false">
            <button>close</button>
        </form>
    </dialog>

    <!-- Metadata Modal -->
    <dialog :open="metadataState.isOpen" class="modal">
        <div class="modal-box w-11/12 max-w-5xl h-[80vh] flex flex-col p-0 overflow-hidden">
            <!-- Header -->
            <div class="flex justify-between items-center p-4 border-b bg-base-100">
                <h3 class="font-bold text-lg flex items-center gap-2">
                    <InformationCircleIcon class="w-5 h-5" />
                    Table Metadata: {{ selectedTable }}
                </h3>
                <button @click="metadataState.isOpen = false" class="btn btn-sm btn-circle btn-ghost">✕</button>
            </div>
            
            <!-- Content -->
            <div class="flex-1 flex flex-col min-h-0 bg-base-200/50">
                <div v-if="metadataState.loading" class="flex-1 flex justify-center items-center">
                    <span class="loading loading-spinner loading-lg"></span>
                </div>
                <div v-else-if="metadataState.error" class="flex-1 flex justify-center items-center text-error p-4">
                    {{ metadataState.error }}
                </div>
                <div v-else class="flex-1 flex flex-col min-h-0 p-4">
                    <div class="tabs tabs-boxed mb-4 flex-shrink-0">
                        <a 
                            v-for="tab in ['columns', 'indexes', 'triggers']" 
                            :key="tab"
                            class="tab" 
                            :class="{ 'tab-active': metadataState.activeTab === tab }"
                            @click="metadataState.activeTab = tab as MetadataTab"
                        >
                            {{ tab.charAt(0).toUpperCase() + tab.slice(1) }}
                        </a>
                    </div>
                    
                    <div class="flex-1 overflow-auto bg-base-100 rounded-box border shadow-sm">
                        <table class="table table-zebra table-pin-rows table-xs w-full">
                            <thead>
                                <tr>
                                    <th v-for="col in metadataState[metadataState.activeTab].columns" :key="col" class="bg-base-200">
                                        {{ col }}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(row, i) in metadataState[metadataState.activeTab].rows" :key="i">
                                    <td v-for="col in metadataState[metadataState.activeTab].columns" :key="col" class="whitespace-nowrap">
                                        {{ row[col] }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <div v-if="metadataState[metadataState.activeTab].rows.length === 0" class="flex flex-col items-center justify-center h-40 text-base-content/50">
                            <p>No {{ metadataState.activeTab }} found.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop" @click="metadataState.isOpen = false">
            <button>close</button>
        </form>
    </dialog>
</template>

<style scoped>
.font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
</style>
