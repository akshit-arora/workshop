import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

interface TelescopeSummary {
    total_requests: number;
    total_exceptions: number;
    total_queries: number;
    total_failed_jobs: number;
    total_cache_hits: number;
    total_cache_misses: number;
}

interface SlowQueryInsight {
    sql: string;
    avg_time: number;
    count: number;
}

interface ExceptionInsight {
    class: string;
    message: string;
    count: number;
    last_seen: string;
}

interface CacheInsight {
    key: string;
    hits: number;
    misses: number;
}

interface HttpInsight {
    method: string;
    uri: string;
    avg_duration: number;
    count: number;
}

interface NPlusOneInsight {
    uri: string;
    query_count: number;
    batch_id: string;
}

interface RequestInsight {
    uuid: string;
    batch_id: string;
    method: string;
    uri: string;
    duration: number;
    status: number;
    controller_action?: string;
    content: string;
    created_at: string;
}

interface BatchEntry {
    uuid: string;
    type_name: string;
    content: string;
    created_at: string;
}

export const TelescopeViewer = ({ projectPath, openInEditor, defaultEditor }: { 
    projectPath: string, 
    openInEditor?: (command: string, path: string) => Promise<void>,
    defaultEditor?: { command: string } | null
}) => {
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"overview" | "requests" | "database" | "exceptions" | "cache" | "http">("overview");
    const [summary, setSummary] = useState<TelescopeSummary | null>(null);
    const [slowQueries, setSlowQueries] = useState<SlowQueryInsight[]>([]);
    const [exceptions, setExceptions] = useState<ExceptionInsight[]>([]);
    const [cacheInsights, setCacheInsights] = useState<CacheInsight[]>([]);
    const [httpInsights, setHttpInsights] = useState<HttpInsight[]>([]);
    const [nPlusOne, setNPlusOne] = useState<NPlusOneInsight[]>([]);
    const [recentRequests, setRecentRequests] = useState<RequestInsight[]>([]);
    const [selectedRequest, setSelectedRequest] = useState<RequestInsight | null>(null);
    const [batchEntries, setBatchEntries] = useState<BatchEntry[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [querySort, setQuerySort] = useState<{ field: 'time' | 'index', order: 'asc' | 'desc' }>({ field: 'index', order: 'asc' });

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [summaryData, queries, ex, cache, http, n1, requests] = await Promise.all([
                invoke<TelescopeSummary>("get_telescope_summary", { projectPath }),
                invoke<SlowQueryInsight[]>("get_telescope_slow_queries", { projectPath }),
                invoke<ExceptionInsight[]>("get_telescope_exceptions", { projectPath }),
                invoke<CacheInsight[]>("get_telescope_cache_insights", { projectPath }),
                invoke<HttpInsight[]>("get_telescope_http_insights", { projectPath }),
                invoke<NPlusOneInsight[]>("get_telescope_n_plus_one", { projectPath }),
                invoke<RequestInsight[]>("get_telescope_recent_requests", { projectPath })
            ]);

            setSummary(summaryData);
            setSlowQueries(queries || []);
            setExceptions(ex || []);
            setCacheInsights(cache || []);
            setHttpInsights(http || []);
            setNPlusOne(n1 || []);
            setRecentRequests(requests || []);

        } catch (err: any) {
            console.error(err);
            setError(err.toString());
        } finally {
            setLoading(false);
        }
    };

    const fetchRequestDetails = async (request: RequestInsight) => {
        setSelectedRequest(request);
        setLoadingDetails(true);
        try {
            const entries = await invoke<BatchEntry[]>("get_telescope_batch_entries", { 
                projectPath, 
                batchId: request.batch_id 
            });
            setBatchEntries(entries || []);
        } catch (err: any) {
            console.error(err);
        } finally {
            setLoadingDetails(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [projectPath]);

    const requestQueries = useMemo(() => {
        const queries = batchEntries
            .filter(e => e.type_name === 'query')
            .map((e, index) => ({ ...JSON.parse(e.content), index }));

        return [...queries].sort((a, b) => {
            const factor = querySort.order === 'asc' ? 1 : -1;
            if (querySort.field === 'time') return (a.time - b.time) * factor;
            return (a.index - b.index) * factor;
        });
    }, [batchEntries, querySort]);

    const requestData = useMemo(() => {
        if (!selectedRequest) return null;
        try {
            return JSON.parse(selectedRequest.content);
        } catch (e) {
            return {};
        }
    }, [selectedRequest]);

    const requestNPlusOne = useMemo(() => {
        const counts: Record<string, number> = {};
        requestQueries.forEach(q => {
            counts[q.sql] = (counts[q.sql] || 0) + 1;
        });
        return Object.entries(counts)
            .filter(([_, count]) => count > 5)
            .map(([sql, count]) => ({ sql, count }));
    }, [requestQueries]);

    const handleOpenOrigin = (file: string, line: number) => {
        if (!defaultEditor) {
            alert("Please configure a default text editor in Settings to open source files.");
            return;
        }
        
        if (openInEditor && file) {
            let resolvedPath = file;
            
            // Smart Path Resolution: Handle potential path mismatches (e.g. Docker/Sail environments)
            if (file.startsWith('/')) {
                const laravelMarkers = ['/app/', '/vendor/', '/routes/', '/config/', '/database/', '/resources/'];
                for (const marker of laravelMarkers) {
                    const index = file.indexOf(marker);
                    if (index !== -1) {
                        const relativePart = file.substring(index + 1);
                        resolvedPath = `${projectPath}/${relativePart}`;
                        break;
                    }
                }
            } else {
                resolvedPath = `${projectPath}/${file}`;
            }

            console.log(`Resolved path: ${resolvedPath}`);
            console.log(`Opening in editor: ${defaultEditor.command} ${resolvedPath}:${line}`);
            openInEditor(defaultEditor.command, `${resolvedPath}:${line}`);
        }
    };

    const handleOpenController = async (action: string) => {
        if (!defaultEditor || !openInEditor || !action) return;

        try {
            // Clean the string from potential JSON quotes or escapes from the DB
            let cleanAction = action.trim();
            if (cleanAction.startsWith('"') && cleanAction.endsWith('"')) {
                cleanAction = cleanAction.slice(1, -1);
            }
            // Fix double backslashes which are common in escaped JSON
            cleanAction = cleanAction.replace(/\\\\/g, '\\');

            const [className, method] = cleanAction.split('@');
            if (!className) return;

            // Map Namespace to Path
            let relativePath = '';
            // Match exactly "App\" (with optional leading slash)
            const normalizedClass = className.startsWith('\\') ? className.slice(1) : className;
            
            if (normalizedClass.startsWith('App\\')) {
                relativePath = normalizedClass.replace(/^App\\/, 'app/').replace(/\\/g, '/') + '.php';
            } else {
                // Heuristic for vendor packages: Try vendor/ (split by first two segments usually)
                // e.g. Laravel\Telescope\Http\... -> vendor/laravel/telescope/src/Http/...
                // But this is very IDE-specific. For now, let's try a simpler approach:
                // If it doesn't start with App, it's likely a package.
                // We'll try to find it in vendor/ assuming lowercase names.
                const parts = className.split('\\');
                if (parts.length >= 2) {
                    const vendor = parts[0].toLowerCase();
                    const package_name = parts[1].toLowerCase();
                    const remaining = parts.slice(2).join('/');
                    relativePath = `vendor/${vendor}/${package_name}/src/${remaining}.php`;
                }
            }
            
            if (!relativePath) {
                relativePath = className.replace(/\\/g, '/') + '.php';
            }

            // Clean up projectPath and relativePath connection
            const cleanProjectPath = projectPath.endsWith('/') ? projectPath.slice(0, -1) : projectPath;
            const cleanRelativePath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
            let fullPath = `${cleanProjectPath}/${cleanRelativePath}`;
            
            // Final sanitation: replace any double forward slashes with single ones
            fullPath = fullPath.replace(/\/+/g, '/');

            console.log(`Resolved controller path: ${fullPath} (Target: ${method})`);

            // Find line number
            let line = 1;
            if (method) {
                try {
                    line = await invoke<number>("find_php_method_line", { path: fullPath, method });
                } catch (e: any) {
                    console.warn("Could not find method line, falling back to line 1", e);
                    // If file not found, this will also fail, but we'll catch it below
                }
            }

            await openInEditor(defaultEditor.command, `${fullPath}:${line}`);
        } catch (e: any) {
            console.error("Failed to open controller", e);
            alert(`Could not open controller source: ${e.toString()}`);
        }
    };

    const formatUri = (uri: string) => uri.replace(/\\\//g, '/');

    if (loading && !summary) return (
        <div className="flex flex-col items-center justify-center h-96 space-y-6 bg-base-100/50 rounded-3xl border border-base-300">
            <span className="loading loading-infinity loading-lg text-primary scale-150"></span>
            <div className="text-center group">
                <p className="text-lg font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent animate-pulse">Analyzing Telescope Data</p>
                <p className="text-xs opacity-50">Extracting advanced insights from your Laravel application...</p>
            </div>
        </div>
    );

    if (error) return (
        <div className="alert alert-error shadow-2xl rounded-2xl text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-8 w-8" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div>
                <h3 className="font-bold">Analytics Failure</h3>
                <div className="text-sm opacity-90">{error}</div>
            </div>
            <button className="btn btn-sm btn-ghost bg-white/10 hover:bg-white/20 border-none" onClick={fetchData}>Retry</button>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-20">
            {!selectedRequest ? (
                <>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h2 className="text-3xl font-black tracking-tight text-base-content flex items-center gap-2">
                                Telescope <span className="text-primary italic">Pulse</span>
                                <div className="badge badge-primary badge-outline text-[10px] font-bold">ALPHA</div>
                            </h2>
                            <p className="text-sm opacity-60 font-medium">Elevating your developer experience with deep analytics.</p>
                        </div>
                        <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 no-scrollbar">
                            <button className="btn btn-sm btn-ghost bg-base-200 hover:bg-base-300 border-none px-6" onClick={fetchData}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.001 0 01-15.357-2m15.357 2H15" /></svg>
                                Refresh
                            </button>
                            <div className="join bg-base-200 p-0.5 rounded-lg border border-base-300 shadow-sm">
                                {(["overview", "requests", "database", "exceptions", "cache", "http"] as const).map((tab) => (
                                    <button
                                        key={tab}
                                        className={`join-item btn btn-xs md:btn-sm border-none capitalize px-4 font-bold transition-all ${activeTab === tab ? 'btn-primary text-primary-content shadow-lg' : 'btn-ghost opacity-60 hover:opacity-100'}`}
                                        onClick={() => setActiveTab(tab)}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {activeTab === "overview" && summary && (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 animate-in fade-in slide-in-from-bottom-2">
                            <StatCard label="Requests" value={summary.total_requests} color="primary" icon="M13 10V3L4 14h7v7l9-11h-7z" />
                            <StatCard label="Queries" value={summary.total_queries} color="secondary" icon="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                            <StatCard label="Exceptions" value={summary.total_exceptions} color="error" icon="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            <StatCard label="Failed Jobs" value={summary.total_failed_jobs} color="warning" icon="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                            <StatCard label="Cache Hits" value={summary.total_cache_hits} color="success" icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            <StatCard label="Cache Miss" value={summary.total_cache_misses} color="ghost" icon="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </div>
                    )}

                    <div className="card bg-base-100 shadow-xl border border-base-300 overflow-hidden min-h-[400px]">
                        <div className="card-body p-0">
                            {activeTab === "requests" && (
                                <div className="divide-y divide-base-300">
                                    <div className="bg-base-200/50 p-6 flex justify-between items-center">
                                        <div>
                                            <h3 className="text-xl font-bold flex items-center gap-2">
                                                <span className="p-2 bg-primary/10 rounded-lg text-primary">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                                </span>
                                                Recent Requests
                                            </h3>
                                            <p className="text-sm opacity-60 ml-12">Analyze individual page loads for bottlenecks and query efficiency.</p>
                                        </div>
                                    </div>
                                    <div className="p-6">
                                        <div className="overflow-x-auto">
                                            <table className="table w-full">
                                                <thead>
                                                    <tr className="border-b-base-300">
                                                        <th className="bg-transparent opacity-40 uppercase text-[10px] tracking-widest text-center">Status</th>
                                                        <th className="bg-transparent opacity-40 uppercase text-[10px] tracking-widest">Route & Controller</th>
                                                        <th className="bg-transparent opacity-40 uppercase text-[10px] tracking-widest text-center">Duration</th>
                                                        <th className="bg-transparent opacity-40 uppercase text-[10px] tracking-widest text-right">Time</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="text-base-content">
                                                    {recentRequests.map((r) => (
                                                        <tr 
                                                            key={r.uuid} 
                                                            className="hover:bg-primary/5 cursor-pointer transition-all group"
                                                            onClick={(e) => {
                                                                if ((e.target as HTMLElement).closest('button')) return;
                                                                fetchRequestDetails(r);
                                                            }}
                                                        >
                                                            <td className="text-center">
                                                                <span className={`badge badge-sm font-bold ${r.status >= 500 ? 'badge-error' : r.status >= 400 ? 'badge-warning' : r.status >= 300 ? 'badge-secondary' : 'badge-success'}`}>
                                                                    {r.status}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <div className="flex flex-col gap-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="badge badge-ghost badge-xs uppercase font-black opacity-40">{r.method}</span>
                                                                        <span className="font-mono text-sm font-bold opacity-80 group-hover:text-primary transition-colors">{formatUri(r.uri)}</span>
                                                                    </div>
                                                                    {r.controller_action && (
                                                                        <button 
                                                                            className="flex items-center gap-1 text-[10px] font-mono opacity-40 hover:opacity-100 hover:text-primary transition-all w-fit group/ctrl"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleOpenController(r.controller_action!);
                                                                            }}
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                                                                            {r.controller_action}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="text-center">
                                                                <span className={`font-bold italic ${r.duration > 500 ? 'text-error animate-pulse' : 'text-primary'}`}>
                                                                    {r.duration}ms
                                                                </span>
                                                            </td>
                                                            <td className="text-right text-[10px] opacity-40 font-bold uppercase">
                                                                {r.created_at}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === "database" && (
                                <div className="divide-y divide-base-300">
                                    <div className="bg-base-200/50 p-6 text-base-content">
                                        <h3 className="text-xl font-bold flex items-center gap-2">
                                            <span className="p-2 bg-secondary/10 rounded-lg text-secondary">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
                                            </span>
                                            Global Database Insights
                                        </h3>
                                        <p className="text-sm opacity-60 ml-12">Aggregate performance hotspots across all requests.</p>
                                    </div>
                                    <div className="p-6">
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-1 gap-4">
                                                <h4 className="text-xs font-black uppercase tracking-widest opacity-40 text-base-content">Slowest Queries</h4>
                                                {slowQueries.length > 0 ? slowQueries.map((q, i) => (
                                                    <div key={i} className="group flex flex-col md:flex-row md:items-center justify-between p-4 bg-base-200 hover:bg-base-300/50 rounded-2xl border border-base-300 transition-all duration-300">
                                                        <div className="flex-1 min-w-0 pr-4">
                                                            <code className="text-xs text-secondary font-mono bg-base-300/50 p-2 rounded-lg block overflow-x-auto whitespace-pre group-hover:bg-base-100 transition-colors shadow-sm">{q.sql}</code>
                                                        </div>
                                                        <div className="flex gap-4 items-center mt-4 md:mt-0 shrink-0">
                                                            <div className="text-right">
                                                                <div className="text-lg font-black text-secondary">{q.avg_time.toFixed(2)}ms</div>
                                                                <div className="text-[10px] opacity-40 uppercase font-bold tracking-tighter">Avg Latency</div>
                                                            </div>
                                                            <div className="divider divider-horizontal mx-0"></div>
                                                            <div className="text-right min-w-[60px]">
                                                                <div className="text-lg font-black text-base-content">{q.count}</div>
                                                                <div className="text-[10px] opacity-40 uppercase font-bold tracking-tighter">Calls</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <div className="text-center py-10 opacity-30 italic text-base-content">No query performance data available.</div>
                                                )}
                                            </div>

                                            {nPlusOne.length > 0 && (
                                                <div className="grid grid-cols-1 gap-4 pt-6 border-t border-base-300">
                                                    <h4 className="text-xs font-black uppercase tracking-widest text-warning">Potential N+1 Requests</h4>
                                                    {nPlusOne.map((n, i) => (
                                                        <div key={i} className="flex items-center justify-between p-4 bg-warning/5 border border-warning/20 rounded-2xl">
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-bold truncate font-mono text-base-content">{formatUri(n.uri)}</div>
                                                                <div className="text-[10px] opacity-40 font-bold uppercase tracking-tight">Requires Eager Loading Optimization</div>
                                                            </div>
                                                            <div className="text-right bg-warning text-warning-content px-4 py-1 rounded-xl shadow-lg shadow-warning/20">
                                                                <div className="text-xl font-black">{n.query_count}</div>
                                                                <div className="text-[9px] font-black uppercase leading-none text-warning-content">Queries</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === "exceptions" && (
                                <div className="divide-y divide-base-300 animate-in slide-in-from-right-2">
                                    <div className="bg-base-200/50 p-6 text-error">
                                        <h3 className="text-xl font-bold flex items-center gap-2">
                                            <span className="p-2 bg-error/10 rounded-lg">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                            </span>
                                            Most Frequent Exceptions
                                        </h3>
                                        <p className="text-sm opacity-60 ml-12 text-base-content">Target the biggest stability issues first.</p>
                                    </div>
                                    <div className="p-6">
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            {exceptions.length > 0 ? exceptions.map((e, i) => (
                                                <div key={i} className="flex items-start gap-4 p-5 bg-error/5 hover:bg-error/10 rounded-2xl border border-error/10 border-l-4 border-l-error transition-all cursor-default">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs font-black opacity-40 uppercase mb-1">{e.class.split('\\').pop()}</div>
                                                        <h4 className="text-sm font-bold truncate text-error font-mono" title={e.class}>{e.class}</h4>
                                                        <p className="text-xs mt-2 opacity-70 line-clamp-2 italic text-base-content italic">"{e.message}"</p>
                                                        <p className="text-[9px] mt-2 opacity-40 font-bold uppercase text-base-content">Last Seen: {e.last_seen}</p>
                                                    </div>
                                                    <div className="text-4xl font-black text-error/20 flex flex-col items-center">
                                                        {e.count}
                                                        <span className="text-[10px] uppercase font-bold tracking-widest text-error/40 text-error">hits</span>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="col-span-full text-center py-20 opacity-30 italic text-base-content">No exceptions logged recently. Good job!</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === "cache" && (
                                <div className="divide-y divide-base-300 text-base-content">
                                    <div className="bg-base-200/50 p-6 text-success">
                                        <h3 className="text-xl font-bold flex items-center gap-2">
                                            <span className="p-2 bg-success/10 rounded-lg">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            </span>
                                            Cache Strategy Efficiency
                                        </h3>
                                        <p className="text-sm opacity-60 ml-12 text-base-content">Optimize your cache hit ratio and reduce load peaks.</p>
                                    </div>
                                    <div className="p-6 overflow-x-auto">
                                        <table className="table w-full">
                                            <thead>
                                                <tr className="border-b-base-300">
                                                    <th className="bg-transparent opacity-40 uppercase text-[10px] tracking-widest">Cache Key</th>
                                                    <th className="bg-transparent opacity-40 uppercase text-[10px] tracking-widest text-center">Efficiency</th>
                                                    <th className="bg-transparent opacity-40 uppercase text-[10px] tracking-widest text-right">Total Interactions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {cacheInsights.length > 0 ? cacheInsights.map((c, i) => {
                                                    const total = c.hits + c.misses;
                                                    const hitRate = total > 0 ? (c.hits / total) * 100 : 0;
                                                    return (
                                                        <tr key={i} className="hover:bg-base-200/50 border-b-base-300/50 transition-colors">
                                                            <td className="font-mono text-sm font-bold opacity-80">{c.key}</td>
                                                            <td className="w-1/3">
                                                                <div className="flex items-center gap-3">
                                                                    <progress className={`progress flex-1 h-3 ${hitRate > 70 ? 'progress-success' : hitRate > 30 ? 'progress-warning' : 'progress-error'}`} value={hitRate} max={100}></progress>
                                                                    <span className="text-xs font-black min-w-[45px]">{hitRate.toFixed(0)}%</span>
                                                                </div>
                                                            </td>
                                                            <td className="text-right">
                                                                <div className="flex justify-end gap-2 text-xs">
                                                                    <span className="badge badge-success badge-sm text-[9px] font-bold">H: {c.hits}</span>
                                                                    <span className="badge badge-ghost badge-sm text-[9px] font-bold">M: {c.misses}</span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                }) : (
                                                    <tr>
                                                        <td colSpan={3} className="text-center py-20 opacity-30 italic border-none text-base-content">No cache activity detected.</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {activeTab === "http" && (
                                <div className="divide-y divide-base-300 text-base-content">
                                    <div className="bg-base-200/50 p-6 text-primary">
                                        <h3 className="text-xl font-bold flex items-center gap-2">
                                            <span className="p-2 bg-primary/10 rounded-lg">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                                            </span>
                                            External Latency Explorer
                                        </h3>
                                        <p className="text-sm opacity-60 ml-12 text-base-content">Monitor performance of external API integrations and services.</p>
                                    </div>
                                    <div className="p-6">
                                        <div className="space-y-4">
                                            {httpInsights.length > 0 ? httpInsights.map((h, i) => (
                                                <div key={i} className="flex items-center justify-between p-4 bg-base-200/40 rounded-2xl border border-base-300 group hover:border-primary/30 transition-all shadow-sm">
                                                    <div className="flex items-center gap-4 min-w-0">
                                                        <span className={`btn btn-xs font-bold pointer-events-none ${h.method === 'GET' ? 'btn-success' : 'btn-primary'}`}>{h.method}</span>
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-bold truncate opacity-80 font-mono" title={h.uri}>{formatUri(h.uri)}</div>
                                                            <div className="text-[10px] opacity-40 font-bold uppercase tracking-widest">{h.count} requests total</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right pl-4">
                                                        <div className="text-xl font-black text-primary">{h.avg_duration.toFixed(0)}<span className="text-xs ml-0.5">ms</span></div>
                                                        <div className="text-[9px] opacity-40 uppercase font-black tracking-tighter">Average</div>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="text-center py-20 opacity-30 italic text-base-content">No outgoing HTTP activity recorded by Telescope.</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <div className="animate-in fade-in slide-in-from-left-4 duration-500 min-h-screen text-base-content">
                    <div className="flex items-center justify-between gap-4 mb-6">
                        <div className="flex items-center gap-4">
                            <button className="btn btn-circle btn-ghost bg-base-200 shadow-md" onClick={() => setSelectedRequest(null)}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className={`badge font-bold ${selectedRequest.status >= 500 ? 'badge-error' : selectedRequest.status >= 400 ? 'badge-warning' : 'badge-success'}`}>
                                        {selectedRequest.status}
                                    </span>
                                    <h2 className="text-2xl font-black font-mono">{formatUri(selectedRequest.uri)}</h2>
                                </div>
                                <p className="text-xs opacity-50 font-bold uppercase tracking-widest mt-1">
                                    {selectedRequest.method} • {selectedRequest.duration}ms • {selectedRequest.created_at}
                                </p>
                            </div>
                        </div>

                        {selectedRequest.controller_action && (
                            <button 
                                className="btn btn-outline btn-primary btn-sm gap-2 px-6 rounded-xl font-mono text-[10px]"
                                onClick={() => handleOpenController(selectedRequest.controller_action!)}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                                {selectedRequest.controller_action}
                            </button>
                        )}
                    </div>

                    <div className="space-y-6 mb-8">
                        {selectedRequest.duration > 500 && (
                            <div className="alert alert-error shadow-lg rounded-2xl text-white py-3">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                <div><h3 className="font-black text-xs uppercase tracking-widest">Slow Page Load</h3><p className="text-[11px] opacity-80 font-medium">This request took {selectedRequest.duration}ms to respond.</p></div>
                            </div>
                        )}
                        {requestQueries.length > 30 && (
                            <div className="alert alert-warning shadow-lg rounded-2xl py-3 border-none bg-warning/20">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6 text-warning-content"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
                                <div><h3 className="font-black text-xs uppercase tracking-widest text-warning-content">High Query Count</h3><p className="text-[11px] opacity-80 font-medium text-warning-content">This page load triggered {requestQueries.length} database queries.</p></div>
                            </div>
                        )}
                        {requestNPlusOne.length > 0 && (
                            <div className="alert alert-warning shadow-lg rounded-2xl py-3 bg-warning text-warning-content border-none">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <div><h3 className="font-black text-xs uppercase tracking-widest">N+1 Issues Detected</h3><p className="text-[11px] opacity-80 font-medium">Found {requestNPlusOne.length} redundant query patterns.</p></div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        <div className="lg:col-span-3 space-y-6">
                            <div className="card bg-base-100 border border-base-300 shadow-xl overflow-hidden">
                                <div className="bg-base-200/50 p-4 border-b border-base-300 flex justify-between items-center">
                                    <h3 className="font-black text-xs uppercase tracking-widest opacity-60">SQL Query Timeline</h3>
                                    <div className="join">
                                        <button 
                                            className={`btn btn-xs join-item ${querySort.field === 'index' ? 'btn-primary' : 'btn-ghost'}`}
                                            onClick={() => setQuerySort(prev => ({ field: 'index', order: prev.field === 'index' ? (prev.order === 'asc' ? 'desc' : 'asc') : 'asc' }))}
                                        >
                                            Sequence {querySort.field === 'index' && (querySort.order === 'asc' ? '↑' : '↓')}
                                        </button>
                                        <button 
                                            className={`btn btn-xs join-item ${querySort.field === 'time' ? 'btn-primary' : 'btn-ghost'}`}
                                            onClick={() => setQuerySort(prev => ({ field: 'time', order: prev.field === 'time' ? (prev.order === 'asc' ? 'desc' : 'asc') : 'asc' }))}
                                        >
                                            Duration {querySort.field === 'time' && (querySort.order === 'asc' ? '↑' : '↓')}
                                        </button>
                                    </div>
                                </div>
                                <div className="card-body p-0 max-h-[700px] overflow-y-auto">
                                    {loadingDetails ? (
                                        <div className="p-20 text-center"><span className="loading loading-spinner text-primary"></span></div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="table table-compact w-full border-separate border-spacing-0">
                                                <thead className="sticky top-0 bg-base-100 z-10 shadow-sm">
                                                    <tr>
                                                        <th className="bg-base-200/80 text-[10px] uppercase font-black w-12 text-center text-base-content">#</th>
                                                        <th className="bg-base-200/80 text-[10px] uppercase font-black text-base-content">Query & Origin</th>
                                                        <th className="bg-base-200/80 text-[10px] uppercase font-black w-24 text-center text-base-content">Time</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-base-300 text-base-content">
                                                    {requestQueries.map((q) => {
                                                        const isDuplicate = requestNPlusOne.some(n => n.sql === q.sql);
                                                        return (
                                                            <tr key={q.index} className={`transition-colors ${isDuplicate ? 'bg-warning/5 hover:bg-warning/10' : 'hover:bg-base-200/30'}`}>
                                                                <td className="text-center">
                                                                    <div className="badge badge-ghost badge-xs opacity-40 font-mono">{q.index + 1}</div>
                                                                </td>
                                                                <td className="py-4">
                                                                    <div className="space-y-3">
                                                                        <code className="text-[11px] font-mono block whitespace-pre-wrap break-all opacity-80 leading-relaxed max-w-2xl px-2">
                                                                            {q.sql}
                                                                        </code>
                                                                        {q.file && (
                                                                            <div className="flex items-center gap-2">
                                                                                <button 
                                                                                    className="btn btn-xs btn-ghost gap-1 px-1 h-auto min-h-0 text-[10px] font-mono text-primary normal-case hover:bg-primary/10"
                                                                                    onClick={() => handleOpenOrigin(q.file, q.line)}
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                                                                                    {q.file.split('/').slice(-2).join('/')}:{q.line}
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                        {q.bindings && Object.keys(q.bindings).length > 0 && (
                                                                            <div className="text-[9px] opacity-40 bg-base-200/50 p-2 rounded-lg font-mono ml-2 border border-base-300 w-fit">
                                                                                Bindings: {JSON.stringify(q.bindings)}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="text-center font-black text-primary text-xs">
                                                                    {q.time}ms
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="card bg-base-100 border border-base-300 shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 duration-700">
                                <div className="bg-base-200/50 p-4 border-b border-base-300">
                                    <h3 className="font-black text-xs uppercase tracking-widest opacity-60">Request Headers</h3>
                                </div>
                                <div className="card-body p-0 max-h-[500px] overflow-y-auto">
                                    {requestData?.headers ? (
                                        <div className="p-4 space-y-4">
                                            {Object.entries(requestData.headers).map(([key, val]: [string, any]) => (
                                                <div key={key}>
                                                    <div className="opacity-40 uppercase font-black text-[9px] mb-1 tracking-tighter">{key}</div>
                                                    <div className="font-mono text-[10px] break-all p-2 bg-base-200 rounded-lg shadow-inner">{String(val)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-10 text-center opacity-30 italic text-xs">No headers recorded.</div>
                                    )}
                                </div>
                            </div>

                            <div className="card bg-base-100 border border-base-300 shadow-xl overflow-hidden opacity-80 grayscale-[0.5] hover:grayscale-0 transition-all">
                                <div className="bg-base-200/50 p-4 border-b border-base-300">
                                    <h3 className="font-black text-xs uppercase tracking-widest opacity-60">Payload & Data</h3>
                                </div>
                                <div className="card-body p-4 text-[10px] space-y-4 font-mono">
                                    {requestData?.payload && Object.keys(requestData.payload).length > 0 ? (
                                        <div>
                                            <div className="opacity-40 uppercase font-black text-[9px] mb-2 tracking-tighter">POST / Input</div>
                                            <pre className="bg-base-200 p-3 rounded-xl overflow-x-auto whitespace-pre shadow-inner">
                                                {JSON.stringify(requestData.payload, null, 2)}
                                            </pre>
                                        </div>
                                    ) : (
                                        <div className="text-center py-6 opacity-30 italic">No payload sent.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const StatCard = ({ label, value, color, icon }: { label: string, value: number, color: string, icon: string }) => (
    <div className={`card bg-base-100 shadow-sm border border-base-300 hover:border-${color} transition-all duration-300 hover:shadow-lg group animate-in zoom-in duration-500`}>
        <div className="card-body p-4 items-center text-center">
            <div className={`p-2 bg-${color}/10 rounded-xl text-${color} mb-2 group-hover:scale-110 transition-transform`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} />
                </svg>
            </div>
            <div className={`text-2xl font-black text-base-content`}>{value.toLocaleString()}</div>
            <div className="text-[10px] opacity-40 uppercase font-extrabold tracking-widest text-base-content">{label}</div>
        </div>
    </div>
);
