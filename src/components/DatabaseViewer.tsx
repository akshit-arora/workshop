import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface DbConfig {
  connection: string;
  host?: string;
  port?: string;
  database: string;
  username?: string;
  password?: string;
}

interface QueryResult {
  columns: string[];
  rows: any[];
  total_count: number | null;
}

interface ColumnSchema {
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
}

interface SavedQuery {
  name: string;
  sql: string;
}

interface ProjectInfo {
  project_type: string;
  db_config?: DbConfig;
}

const ManualConnectionForm = ({ projectPath, onConnected }: { projectPath: string, onConnected: (cfg: DbConfig) => void }) => {
  const [connection, setConnection] = useState("mysql");
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("3306");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("root");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (connection === "sqlite") {
      setPort("");
      setHost("");
      if (!database) setDatabase("database/database.sqlite");
    } else {
      setPort("3306");
      setHost("127.0.0.1");
    }
  }, [connection]);

  const handleConnect = async (save: boolean) => {
    const cfg: DbConfig = { connection, host, port, database, username, password };
    setLoading(true);
    setError(null);

    try {
      // Test connection first
      await invoke("test_db_connection", { config: cfg, projectPath });
      
      if (save) {
        await invoke("save_custom_db_config", { path: projectPath, config: cfg });
      }
      
      onConnected(cfg);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-base-100 overflow-auto">
      <div className="card w-full max-w-lg bg-base-200 shadow-xl border border-base-300">
        <div className="card-body">
          <h2 className="card-title text-2xl mb-2">Connect to Database</h2>
          <p className="text-sm opacity-60 mb-6">Enter your database credentials to connect and explore.</p>
          
          {error && (
            <div className="alert alert-error mb-6 py-2 text-sm text-white">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="form-control col-span-2">
              <label className="label"><span className="label-text font-bold text-xs uppercase opacity-60">Connection Type</span></label>
              <select className="select select-bordered w-full" value={connection} onChange={e => setConnection(e.target.value)}>
                <option value="mysql">MySQL</option>
                <option value="sqlite">SQLite</option>
              </select>
            </div>

            {connection === "mysql" && (
              <>
                <div className="form-control">
                  <label className="label"><span className="label-text font-bold text-xs uppercase opacity-60">Host</span></label>
                  <input type="text" className="input input-bordered w-full" value={host} onChange={e => setHost(e.target.value)} placeholder="127.0.0.1" />
                </div>
                <div className="form-control">
                  <label className="label"><span className="label-text font-bold text-xs uppercase opacity-60">Port</span></label>
                  <input type="text" className="input input-bordered w-full" value={port} onChange={e => setPort(e.target.value)} placeholder="3306" />
                </div>
              </>
            )}

            <div className="form-control col-span-2">
              <label className="label"><span className="label-text font-bold text-xs uppercase opacity-60">{connection === "sqlite" ? "Database Path" : "Database Name"}</span></label>
              <input type="text" className="input input-bordered w-full" value={database} onChange={e => setDatabase(e.target.value)} placeholder={connection === "sqlite" ? "database/database.sqlite" : "my_database"} />
            </div>

            {connection === "mysql" && (
              <>
                <div className="form-control">
                  <label className="label"><span className="label-text font-bold text-xs uppercase opacity-60">Username</span></label>
                  <input type="text" className="input input-bordered w-full" value={username} onChange={e => setUsername(e.target.value)} placeholder="root" />
                </div>
                <div className="form-control">
                  <label className="label"><span className="label-text font-bold text-xs uppercase opacity-60">Password</span></label>
                  <input type="password" opacity-60 className="input input-bordered w-full" value={password} onChange={e => setPassword(e.target.value)} />
                </div>
              </>
            )}
          </div>

          <div className="card-actions justify-end mt-8 gap-2">
            <button className={`btn btn-primary flex-1 ${loading ? 'loading' : ''}`} onClick={() => handleConnect(true)} disabled={loading || !database}>
              Connect & Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const DatabaseViewer = ({ projectPath, keepAliveMinutes }: { projectPath: string, keepAliveMinutes: number }) => {
  const [config, setConfig] = useState<DbConfig | null>(null);
  const [isManualMode, setIsManualMode] = useState(false);
  const [tables, setTables] = useState<string[]>([]);
  const [filteredTables, setFilteredTables] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [data, setData] = useState<QueryResult | null>(null);
  const [schema, setSchema] = useState<ColumnSchema[]>([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailedRow, setDetailedRow] = useState<any | null>(null);
  const [showMetadata, setShowMetadata] = useState(false);
  const [editData, setEditData] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [queryTime, setQueryTime] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);

  // Saved Queries
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [selectedSavedQueryName, setSelectedSavedQueryName] = useState("");

  // Sorting state
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"ASC" | "DESC" | null>(null);

  // Search & SQL Mode state
  const [isSqlMode, setIsSqlMode] = useState(false);
  const [whereClause, setWhereClause] = useState("");
  const [rawSql, setRawSql] = useState("");
  const [activeWhere, setActiveWhere] = useState(""); // The where clause currently applied

  // Keyboard navigation state
  const [focusedRowIdx, setFocusedRowIdx] = useState<number | null>(null);
  const [focusedColIdx, setFocusedCellIdx] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Close modals on Escape key
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDetailedRow(null);
        setShowMetadata(false);
        setIsEditing(false);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Auto-scroll to focused cell
  useEffect(() => {
    if (focusedRowIdx !== null && focusedColIdx !== null && tableRef.current) {
      const focusedElement = tableRef.current.querySelector('[data-focused="true"]');
      if (focusedElement) {
        focusedElement.scrollIntoView({
          block: "nearest",
          inline: "nearest",
        });
      }
    }
  }, [focusedRowIdx, focusedColIdx]);

  // Use refs to track project changes for session reset
  const prevProjectPath = useRef(projectPath);

  useEffect(() => {
    if (prevProjectPath.current !== projectPath) {
      // Project changed, reset local state
      setConfig(null);
      setIsManualMode(false);
      setTables([]);
      setSelectedTable(null);
      setData(null);
      setSchema([]);
      setTotalCount(null);
      setFocusedRowIdx(null);
      setFocusedCellIdx(null);
      setSortCol(null);
      setSortDir(null);
      setWhereClause("");
      setActiveWhere("");
      setRawSql("");
      setIsSqlMode(false);
      setSavedQueries([]);
      prevProjectPath.current = projectPath;
    }
    fetchConfig();
    fetchSavedQueries();
  }, [projectPath]);

  useEffect(() => {
    if (config) {
      fetchTables();
    }
  }, [config]);

  useEffect(() => {
    if (selectedTable && config && !isSqlMode) {
      fetchData();
      fetchSchema();
    }
  }, [selectedTable, page, perPage, sortCol, sortDir, activeWhere, isSqlMode]);

  useEffect(() => {
    setFilteredTables(
      tables.filter((t) => t.toLowerCase().includes(search.toLowerCase()))
    );
  }, [search, tables]);

  // Update raw SQL when table changes
  useEffect(() => {
    if (selectedTable && !isSqlMode) {
      setRawSql(`SELECT * FROM \`${selectedTable}\``);
    }
  }, [selectedTable]);

  const fetchSavedQueries = async () => {
    try {
      const q = await invoke<SavedQuery[]>("get_saved_queries", { path: projectPath });
      setSavedQueries(q);
    } catch (e) {
      console.error("Failed to fetch saved queries", e);
    }
  };

  const [saveQueryModalOpen, setSaveQueryModalOpen] = useState(false);
  const [newQueryName, setNewQueryName] = useState("");

  const handleSaveQuery = async () => {
    let sqlToSave = rawSql;

    if (!isSqlMode) {
      if (!selectedTable) return;
      sqlToSave = `SELECT * FROM \`${selectedTable}\``;
      if (whereClause.trim()) {
        sqlToSave += ` WHERE ${whereClause.trim()}`;
      }
    }

    if (!sqlToSave) return;
    setSaveQueryModalOpen(true);
  };

  const confirmSaveQuery = async () => {
    let sqlToSave = rawSql;
    if (!isSqlMode) {
      sqlToSave = `SELECT * FROM \`${selectedTable}\``;
      if (whereClause.trim()) sqlToSave += ` WHERE ${whereClause.trim()}`;
    }

    try {
      console.log("Saving query...", { path: projectPath, name: newQueryName, sql: sqlToSave });
      await invoke("save_query", { path: projectPath, name: newQueryName, sql: sqlToSave });
      await fetchSavedQueries();
      setSaveQueryModalOpen(false);
      setNewQueryName("");
      window.alert("Query saved successfully!");
    } catch (e: any) {
      console.error("Failed to save query", e);
      setError("Failed to save query: " + e.toString());
      window.alert("Failed to save query: " + e.toString());
    }
  };

  const handleSavedQuerySelect = (query: SavedQuery) => {
    console.log("Loading saved query...", query);
    setSelectedSavedQueryName(query.name);
    setRawSql(query.sql);
    setIsSqlMode(true);
    fetchRawSql(query.sql);
  };

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Try Laravel config first
      const cfg = await invoke<DbConfig>("get_laravel_db_config", { projectPath });
      setConfig(cfg);
      setIsManualMode(false);
    } catch (e: any) {
      // 2. If not Laravel, check if we have a saved manual config
      try {
        const info = await invoke<ProjectInfo | null>("get_project_info", { path: projectPath });
        if (info && info.db_config) {
          setConfig(info.db_config);
          setIsManualMode(false);
        } else {
          // No config found anywhere, show manual form
          setIsManualMode(true);
        }
      } catch (err) {
        setIsManualMode(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchTables = async () => {
    if (!config) return;
    setLoading(true);
    try {
      const t = await invoke<string[]>("list_tables", { config, projectPath });
      setTables(t);
      setError(null);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    if (!config || !selectedTable || isSqlMode) return;
    setLoading(true);
    const startTime = performance.now();
    try {
      const res = await invoke<QueryResult>("get_table_data", {
        config,
        projectPath,
        table: selectedTable,
        page,
        perPage,
        sortCol,
        sortDir,
        whereClause: activeWhere || null,
      });
      const endTime = performance.now();
      setQueryTime(Math.round(endTime - startTime));
      setData(res);
      setError(null);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  const fetchCount = async () => {
    if (!selectedTable || !config) return;
    setLoadingCount(true);
    try {
      const count = await invoke<number>("get_table_count", {
        config,
        projectPath,
        table: selectedTable,
        whereClause: activeWhere || null,
      });
      setTotalCount(count);
    } catch (e: any) {
      console.error("Failed to fetch count", e);
    } finally {
      setLoadingCount(false);
    }
  };

  const fetchRawSql = async (overrideSql?: string) => {
    const sqlToRun = overrideSql || rawSql;
    if (!config || !sqlToRun.trim()) return;
    setLoading(true);
    setError(null);
    const startTime = performance.now();
    try {
      const res = await invoke<QueryResult>("execute_raw_sql", {
        config,
        projectPath,
        sql: sqlToRun,
      });
      const endTime = performance.now();
      setQueryTime(Math.round(endTime - startTime));
      setData(res);
      setTotalCount(res.total_count);
    } catch (e: any) {
      setError(e.toString());
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchSchema = async () => {
    if (!config || !selectedTable) return;
    try {
      const s = await invoke<ColumnSchema[]>("get_table_schema", {
        config,
        projectPath,
        table: selectedTable
      });
      setSchema(s);
    } catch (e) {
      console.error("Failed to fetch schema", e);
    }
  };

  const handleTableSelect = (table: string) => {
    if (selectedTable === table) {
      if (isSqlMode) fetchRawSql(); else fetchData();
    } else {
      setSelectedTable(table);
      setPage(1);
      setData(null);
      setSchema([]);
      setQueryTime(null);
      setTotalCount(null); // Reset count for new table
      setFocusedRowIdx(null);
      setFocusedCellIdx(null);
      setSortCol(null);
      setSortDir(null);
      setWhereClause("");
      setActiveWhere("");
      setSelectedSavedQueryName("");
      setIsSqlMode(false);
    }
  };

  const handleSort = (column: string) => {
    if (isSqlMode) return; // Disable standard sorting in SQL mode
    if (sortCol === column) {
      if (sortDir === "ASC") {
        setSortDir("DESC");
      } else if (sortDir === "DESC") {
        setSortCol(null);
        setSortDir(null);
      }
    } else {
      setSortCol(column);
      setSortDir("ASC");
    }
    setPage(1); // Reset to first page on sort
  };

  const startEditing = () => {
    setEditData({ ...detailedRow });
    setIsEditing(true);
    setSaveError(null);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditData(null);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!config || !selectedTable || !detailedRow || !editData) return;

    setSaveLoading(true);
    setSaveError(null);

    try {
      const primaryKeys: Record<string, any> = {};
      const updatedFields: Record<string, any> = {};

      schema.forEach(col => {
        if (col.is_primary_key) {
          primaryKeys[col.name] = detailedRow[col.name];
        } else {
          updatedFields[col.name] = editData[col.name];
        }
      });

      await invoke("update_table_row", {
        config,
        projectPath,
        table: selectedTable,
        primaryKeys,
        data: updatedFields
      });

      // Refresh data
      if (isSqlMode) await fetchRawSql(); else await fetchData();
      setDetailedRow({ ...editData });
      setIsEditing(false);
      setEditData(null);
    } catch (e: any) {
      setSaveError(e.toString());
    } finally {
      setSaveLoading(false);
    }
  };

  const handleInputChange = (column: string, value: any, dataType: string) => {
    let finalValue = value;

    // Basic validation based on simple data types
    if (value !== null && value !== "") {
      const lowerType = dataType.toLowerCase();
      if (lowerType.includes("int") || lowerType.includes("decimal") || lowerType.includes("float") || lowerType.includes("double")) {
        const num = Number(value);
        if (!isNaN(num)) finalValue = num;
      } else if (lowerType === "boolean" || lowerType === "tinyint(1)") {
        finalValue = value === "true" || value === "1" || value === 1;
      }
    } else if (value === "") {
      finalValue = null;
    }

    setEditData({ ...editData, [column]: finalValue });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // If an input, textarea or contenteditable is focused, let it handle the keyboard event
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' || 
      target.tagName === 'TEXTAREA' || 
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ) {
      return;
    }

    if (!data || data.rows.length === 0 || detailedRow) return;

    const rowCount = data.rows.length;
    const colCount = data.columns.length;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedRowIdx(prev => (prev === null ? 0 : Math.min(prev + 1, rowCount - 1)));
      if (focusedColIdx === null) setFocusedCellIdx(0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedRowIdx(prev => (prev === null ? 0 : Math.max(prev - 1, 0)));
      if (focusedColIdx === null) setFocusedCellIdx(0);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setFocusedCellIdx(prev => (prev === null ? 0 : Math.min(prev + 1, colCount - 1)));
      if (focusedRowIdx === null) setFocusedRowIdx(0);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setFocusedCellIdx(prev => (prev === null ? 0 : Math.max(prev - 1, 0)));
      if (focusedRowIdx === null) setFocusedRowIdx(0);
    } else if (e.key === "Tab") {
      if (focusedRowIdx !== null) {
        e.preventDefault();
        setDetailedRow(data.rows[focusedRowIdx]);
      }
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setActiveWhere(whereClause);
      setPage(1);
      setTotalCount(null);
    }
  };

  const handleSqlKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      fetchRawSql();
    }
  };

  return (
    <div
      className="flex h-full bg-base-100 overflow-hidden rounded-xl border border-base-300 shadow-sm relative text-base-content font-sans outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {isManualMode ? (
        <ManualConnectionForm 
          projectPath={projectPath} 
          onConnected={(cfg) => {
            setConfig(cfg);
            setIsManualMode(false);
          }} 
        />
      ) : (
        <>
          {/* Sidebar - Tables */}
          <div className="w-64 border-r border-base-300 flex flex-col bg-base-200/50">
        <div className="p-4 border-b border-base-300 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-sm uppercase tracking-wider opacity-60">Tables</h3>
            <button
              className={`btn btn-ghost btn-xs btn-square ${loading ? 'loading' : ''}`}
              onClick={fetchTables}
              title="Refresh Tables"
            >
              {!loading && <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.001 0 01-15.357-2m15.357 2H15" /></svg>}
            </button>
          </div>
          <input
            type="text"
            placeholder="Search tables..."
            className="input input-bordered input-sm w-full bg-base-100"
            value={search}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()} // Prevent search input from triggering table navigation
          />
        </div>
        <div className="flex-1 overflow-y-auto text-base-content">
          <ul className="menu menu-sm p-2 gap-1">
            {filteredTables.map((t) => (
              <li key={t}>
                <a
                  className={`${selectedTable === t ? "active" : ""}`}
                  onClick={() => handleTableSelect(t)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  {t}
                </a>
              </li>
            ))}
            {filteredTables.length === 0 && !loading && (
              <div className="text-center py-8 opacity-40 text-xs italic">No tables found</div>
            )}
          </ul>
        </div>
      </div>

      {/* Main Content - Records */}
      <div className="flex-1 flex flex-col min-w-0 bg-base-100 relative">
        {error && (
          <div className="m-4 alert alert-error shadow-sm text-sm py-2 text-white font-medium">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{error}</span>
          </div>
        )}

        {selectedTable || isSqlMode ? (
          <>
            {/* Toolbar */}
            <div className="p-4 border-b border-base-300 flex justify-between items-center bg-base-200/30 shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{isSqlMode ? "Raw SQL Query" : selectedTable}</h2>
                {!isSqlMode && (
                  <button
                    className="btn btn-ghost btn-xs btn-circle"
                    onClick={() => setShowMetadata(true)}
                    title="View Metadata"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                )}
                <div className="flex items-center gap-2 ml-2">
                  {totalCount !== null ? (
                    <div className="badge badge-outline badge-sm opacity-60 font-mono tracking-tighter">{totalCount.toLocaleString()} total records</div>
                  ) : !isSqlMode ? (
                    <button
                      className={`btn btn-xs btn-ghost border border-base-content/10 opacity-60 hover:opacity-100 ${loadingCount ? 'loading' : ''}`}
                      onClick={fetchCount}
                      disabled={loadingCount}
                    >
                      {!loadingCount && 'Show count'}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-4">
                {savedQueries.length > 0 && (
                  <select 
                    className="select select-bordered select-xs bg-base-100 max-w-[150px]"
                    value={selectedSavedQueryName}
                    onChange={(e) => {
                      const q = savedQueries.find(sq => sq.name === e.target.value);
                      if (q) handleSavedQuerySelect(q);
                    }}
                  >
                    <option value="" disabled>Saved Queries...</option>
                    {savedQueries.map(q => (
                      <option key={q.name} value={q.name}>{q.name}</option>
                    ))}
                  </select>
                )}
                <div className="flex items-center gap-2">
                  <label className="label cursor-pointer gap-2 py-0">
                    <span className="label-text text-[10px] font-bold opacity-60 uppercase">SQL Mode</span>
                    <input type="checkbox" className="toggle toggle-primary toggle-xs" checked={isSqlMode} onChange={e => setIsSqlMode(e.target.checked)} />
                  </label>
                </div>

                <div className="flex items-center gap-2 text-xs font-medium text-base-content/70 border-l border-base-content/10 pl-4">
                  <span className="opacity-60">Rows:</span>
                  <select
                    className="select select-bordered select-xs bg-base-100"
                    value={perPage}
                    disabled={isSqlMode}
                    onChange={(e) => {
                      setPerPage(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    {[10, 25, 50, 100].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>

                <div className="join shadow-sm border border-base-300">
                  <button
                    className="join-item btn btn-xs px-3"
                    disabled={page === 1 || loading || isSqlMode}
                    onClick={() => setPage(p => p - 1)}
                  >
                    «
                  </button>
                  <button className="join-item btn btn-xs no-animation cursor-default bg-base-100 border-x-0 font-mono text-base-content/70">
                    Page {page} {totalCount !== null && !isSqlMode ? `of ${Math.ceil(totalCount / perPage)}` : ''}
                  </button>
                  <button
                    className="join-item btn btn-xs px-3"
                    disabled={(!data || (totalCount !== null && !isSqlMode && page >= Math.ceil(totalCount / perPage))) || loading || isSqlMode}
                    onClick={() => setPage(p => p + 1)}
                  >
                    »
                  </button>
                </div>
              </div>
            </div>

            {/* Search / SQL Bar */}
            <div className="p-4 bg-base-200/50 border-b border-base-300 shrink-0">
              {isSqlMode ? (
                <div className="flex flex-col gap-2">
                  <div className="relative group">
                    <textarea
                      className="textarea textarea-bordered w-full font-mono text-xs h-24 focus:textarea-primary bg-base-100"
                      placeholder="Enter full SQL query..."
                      value={rawSql}
                      onChange={e => setRawSql(e.target.value)}
                      onKeyDown={handleSqlKeyDown}
                    ></textarea>
                    <div className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-40 transition-opacity text-[10px] font-bold">
                      Cmd+Enter to run
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={handleSaveQuery}
                      title="Save this query"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                      Save Query
                    </button>
                    <button
                      className={`btn btn-primary btn-xs px-6 ${loading ? 'loading' : ''}`}
                      onClick={() => fetchRawSql()}
                    >
                      Run Query
                    </button>
                  </div>
                </div>
              ) : (
                <div className="join w-full">
                  <div className="join-item bg-base-300 px-4 flex items-center text-xs font-bold opacity-60 uppercase border border-r-0 border-base-300">
                    WHERE
                  </div>
                  <input
                    type="text"
                    className="input input-bordered join-item w-full input-sm focus:input-primary bg-base-100"
                    placeholder="DISABLED_AT IS NULL"
                    value={whereClause}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck="false"
                    onChange={e => setWhereClause(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                  />
                  <button
                    className={`btn btn-primary btn-sm join-item ${loading ? 'loading' : ''}`}
                    onClick={() => { setActiveWhere(whereClause); setPage(1); setTotalCount(null); }}
                  >
                    Search
                  </button>
                  <button
                    className="btn btn-ghost btn-sm join-item border border-base-300"
                    onClick={handleSaveQuery}
                    title="Save this search as a query"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                  </button>
                </div>
              )}
            </div>

            {/* Table Container */}
            <div className="flex-1 overflow-auto bg-base-100" ref={tableRef}>
              {loading && !data && (
                <div className="absolute inset-0 bg-base-100/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
                  <span className="loading loading-spinner loading-lg text-primary"></span>
                </div>
              )}
              {data && (
                <table className="border-separate border-spacing-0 w-max min-w-full">
                  <thead className="sticky top-0 z-10 bg-base-200">
                    <tr>
                      {data.columns.map((col, colIdx) => (
                        <th
                          key={col}
                          className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider border-b border-r border-base-300 text-base-content/70 whitespace-nowrap last:border-r-0 min-w-[120px] cursor-pointer hover:bg-base-300 transition-colors group ${focusedColIdx === colIdx ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/30' : ''}`}
                          title={`Sort by ${col}`}
                          onClick={() => handleSort(col)}
                        >
                          <div className="flex items-center gap-2">
                            {col}
                            <span className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                              {sortCol === col ? (
                                sortDir === "ASC" ? (
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-primary opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 15l7-7 7 7" /></svg>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-primary opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                                )
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                              )}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-base-300">
                    {data.rows.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className={`transition-colors cursor-pointer ${focusedRowIdx === rowIdx ? 'bg-primary/5' : 'hover:bg-primary/5'}`}
                        onClick={() => setFocusedRowIdx(rowIdx)}
                      >
                        {data.columns.map((col, colIdx) => (
                          <td
                            key={colIdx}
                            data-focused={focusedRowIdx === rowIdx && focusedColIdx === colIdx}
                            className={`px-4 py-2 border-r border-base-300 last:border-r-0 font-mono text-[11px] whitespace-nowrap overflow-hidden truncate max-w-[300px] text-base-content/80 ${focusedRowIdx === rowIdx && focusedColIdx === colIdx ? 'ring-2 ring-inset ring-primary/50 bg-primary/10' : ''}`}
                            title={row[col] === null ? 'NULL' : String(row[col])}
                            onClick={(e) => {
                              e.stopPropagation();
                              setFocusedRowIdx(rowIdx);
                              setFocusedCellIdx(colIdx);
                            }}
                          >
                            {row[col] === null ? (
                              <span className="opacity-30 italic text-[10px]">NULL</span>
                            ) : (
                              String(row[col])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {data.rows.length === 0 && (
                      <tr>
                        <td colSpan={data.columns.length || 1} className="px-4 py-20 text-center opacity-40 italic border-b border-base-300">
                          No records found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Table Footer */}
            <div className="p-2 px-4 border-t border-base-300 bg-base-200/30 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4 text-[10px] font-bold tracking-tight opacity-60 uppercase">
                {queryTime !== null && (
                  <span className="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Query Time: {queryTime}ms
                  </span>
                )}
                {data && (
                  <span className="flex items-center gap-1.5 border-l border-base-content/10 pl-4">
                    Showing {data.rows.length} records
                  </span>
                )}
                <span className="flex items-center gap-1.5 border-l border-base-content/10 pl-4 lowercase font-normal italic normal-case">
                  use arrows to navigate, press tab to view details
                </span>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-bold opacity-40 uppercase">
                <button 
                  className="btn btn-link btn-xs text-[10px] p-0 h-auto min-h-0 text-error opacity-60 hover:opacity-100"
                  onClick={async () => {
                    if (window.confirm("Clear custom database configuration?")) {
                      await invoke("save_custom_db_config", { path: projectPath, config: null });
                      setConfig(null);
                      setIsManualMode(true);
                    }
                  }}
                >
                  Clear Config
                </button>
                <span className="border-l border-base-content/10 pl-4">Session: {keepAliveMinutes}m keep-alive</span>
                <span className="border-l border-base-content/10 pl-4">{config?.connection} connection</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30 select-none text-base-content">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
            <p className="text-xl font-medium">Select a table to view records</p>
          </div>
        )}
      </div>

      {/* Save Query Modal */}
      {saveQueryModalOpen && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="card w-full max-w-md bg-base-100 shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-base-300 bg-base-200/50">
              <h3 className="text-xl font-bold">Save Query</h3>
              <p className="text-xs opacity-50 uppercase tracking-widest">Give this query a recognizable name</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text font-bold text-xs uppercase opacity-60">Query Name</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full focus:input-primary"
                  placeholder="e.g. Active Users"
                  autoFocus
                  value={newQueryName}
                  onChange={(e) => setNewQueryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newQueryName.trim()) confirmSaveQuery();
                    if (e.key === "Escape") setSaveQueryModalOpen(false);
                  }}
                />
              </div>
            </div>
            <div className="p-4 border-t border-base-300 bg-base-200/50 flex justify-end gap-2">
              <button className="btn btn-ghost btn-sm px-6" onClick={() => setSaveQueryModalOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary btn-sm px-8"
                onClick={confirmSaveQuery}
                disabled={!newQueryName.trim()}
              >
                Save Query
              </button>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => setSaveQueryModalOpen(false)}></div>
        </div>
      )}

      {/* Metadata Modal */}
      {showMetadata && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="card w-full max-w-3xl bg-base-100 shadow-2xl overflow-hidden animate-in zoom-in duration-200 max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-base-300 flex justify-between items-center bg-base-200/50">
              <div>
                <h3 className="text-xl font-bold">Table Metadata</h3>
                <p className="text-xs opacity-50 uppercase tracking-widest">{selectedTable}</p>
              </div>
              <button className="btn btn-circle btn-ghost btn-sm" onClick={() => setShowMetadata(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-0 text-base-content">
              <table className="table table-zebra w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-base-100">
                  <tr className="border-b border-base-300">
                    <th className="bg-base-200/50 text-left px-6 py-3">Column</th>
                    <th className="bg-base-200/50 text-left px-6 py-3">Type</th>
                    <th className="bg-base-200/50 text-left px-6 py-3">Nullable</th>
                    <th className="bg-base-200/50 text-center px-6 py-3">PK</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-300">
                  {schema.map((col) => (
                    <tr key={col.name} className="hover:bg-base-200/30">
                      <td className="px-6 py-4 font-bold text-sm text-primary/80">{col.name}</td>
                      <td className="px-6 py-4 font-mono text-xs opacity-70">{col.data_type}</td>
                      <td className="px-6 py-4">
                        {col.is_nullable ? (
                          <span className="badge badge-ghost badge-sm opacity-50">YES</span>
                        ) : (
                          <span className="badge badge-error badge-outline badge-sm">NO</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {col.is_primary_key && (
                          <div className="flex justify-center">
                            <span className="badge badge-primary badge-sm font-bold">KEY</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-base-300 bg-base-200/50 flex justify-end">
              <button className="btn btn-primary btn-sm px-10" onClick={() => setShowMetadata(false)}>Close</button>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => setShowMetadata(false)}></div>
        </div>
      )}

      {/* Detail Modal */}
      {detailedRow && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="card w-full max-w-2xl bg-base-100 shadow-2xl overflow-hidden animate-in zoom-in duration-200 max-h-[80vh] flex flex-col text-base-content font-sans">
            <div className="p-6 border-b border-base-300 flex justify-between items-center bg-base-200/50">
              <div>
                <h3 className="text-xl font-bold">{isEditing ? 'Edit Record' : 'Record Details'}</h3>
                <p className="text-xs opacity-50 uppercase tracking-widest">{selectedTable}</p>
              </div>
              <div className="flex gap-2">
                {!isEditing && (
                  <button className="btn btn-sm btn-outline btn-primary" onClick={startEditing}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Edit
                  </button>
                )}
                <button className="btn btn-circle btn-ghost btn-sm" onClick={() => { setDetailedRow(null); setIsEditing(false); }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            {saveError && (
              <div className="mx-6 mt-4 alert alert-error shadow-sm text-sm py-2 text-white font-medium">
                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>{saveError}</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-0">
              <div className="p-6 space-y-4 text-base-content">
                {schema.map((col) => (
                  <div key={col.name} className="form-control w-full">
                    <label className="label py-1">
                      <span className="label-text font-bold text-xs uppercase tracking-wider text-base-content/60">
                        {col.name}
                        {col.is_primary_key && <span className="ml-2 badge badge-ghost badge-xs">PK</span>}
                        {!col.is_nullable && <span className="text-error ml-1">*</span>}
                      </span>
                      <span className="label-text-alt opacity-40">{col.data_type}</span>
                    </label>

                    {isEditing ? (
                      <div className="relative group">
                        {col.is_primary_key ? (
                          <div className="input input-bordered input-sm w-full bg-base-200 flex items-center opacity-70 cursor-not-allowed text-base-content/70">
                            {String(detailedRow[col.name])}
                          </div>
                        ) : (
                          <>
                            <input
                              type="text"
                              className={`input input-bordered input-sm w-full focus:input-primary bg-base-100 ${editData[col.name] === null ? 'bg-base-200 italic opacity-60' : ''}`}
                              value={editData[col.name] === null ? "" : String(editData[col.name])}
                              placeholder={col.is_nullable ? "NULL" : ""}
                              onChange={(e) => handleInputChange(col.name, e.target.value, col.data_type)}
                            />
                            {col.is_nullable && (
                              <button
                                className={`absolute right-2 top-1/2 -translate-y-1/2 btn btn-xs btn-ghost text-[10px] ${editData[col.name] === null ? 'text-primary' : 'opacity-0 group-hover:opacity-100'}`}
                                onClick={() => handleInputChange(col.name, editData[col.name] === null ? "" : null, col.data_type)}
                              >
                                {editData[col.name] === null ? 'SET VALUE' : 'SET NULL'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 bg-base-200/50 rounded-lg font-mono text-sm break-all whitespace-pre-wrap min-h-[40px] flex items-center text-base-content/80">
                        {detailedRow[col.name] === null ? (
                          <span className="opacity-30 italic text-xs">NULL</span>
                        ) : (
                          String(detailedRow[col.name])
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-base-300 bg-base-200/50 flex justify-end gap-2">
              {isEditing ? (
                <>
                  <button className="btn btn-ghost btn-sm px-6" onClick={cancelEditing} disabled={saveLoading}>Cancel</button>
                  <button className={`btn btn-primary btn-sm px-8 ${saveLoading ? 'loading' : ''}`} onClick={handleSave} disabled={saveLoading}>
                    {saveLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              ) : (
                <button className="btn btn-primary btn-sm px-10" onClick={() => setDetailedRow(null)}>Close</button>
              )}
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => { if (!saveLoading) { setDetailedRow(null); setIsEditing(false); } }}></div>
        </div>
      )}
    </>
  )}
</div>
  );
};
