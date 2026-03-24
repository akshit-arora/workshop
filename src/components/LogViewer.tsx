import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

interface LogFile {
    name: string;
    path: string;
    size: number;
    last_modified: number;
}

interface LogEntry {
    timestamp: string;
    date: string;
    time: string;
    env: string;
    level: string;
    message: string;
    fullContent: string;
}

export const LogViewer = ({ projectPath }: { projectPath: string }) => {
    const [logFiles, setLogFiles] = useState<LogFile[]>([]);
    const [selectedLog, setSelectedLog] = useState<LogFile | null>(null);
    const [selectedLevel, setSelectedLevel] = useState<string>("ALL");
    const [entries, setEntries] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [limit, setLimit] = useState(500);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);
    const lastSeenLogRef = useRef<string | null>(null);
    const lastModifiedRef = useRef<number>(0);
    const lastLaravelLogModifiedRef = useRef<number>(0);

    useEffect(() => {
        setSelectedLog(null);
        setEntries([]);
        setError(null);
        setSelectedLevel("ALL");
        lastSeenLogRef.current = null;
        lastModifiedRef.current = 0;
        lastLaravelLogModifiedRef.current = 0;
        fetchLogFiles(true);
    }, [projectPath]);

    useEffect(() => {
        if (selectedLog) {
            readLog();
        } else {
            setEntries([]);
        }
    }, [selectedLog, limit]);

    // Auto-refresh interval
    useEffect(() => {
        let interval: any;
        if (autoRefresh) {
            interval = setInterval(() => {
                refreshLogsSilently();
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [autoRefresh, selectedLog, projectPath]);

    const fetchLogFiles = async (selectDefault = false) => {
        if (!selectDefault) setLoading(true);
        try {
            const files = await invoke<LogFile[]>("list_laravel_logs", { projectPath });
            setLogFiles(files);
            
            // Always try to select the best log for the NEW project
            if (selectDefault && files.length > 0) {
                const laravelLog = files.find(f => f.name === "laravel.log");
                const defaultLog = laravelLog || files[0];
                setSelectedLog(defaultLog);
                lastModifiedRef.current = defaultLog.last_modified;
                
                if (laravelLog) {
                    lastLaravelLogModifiedRef.current = laravelLog.last_modified;
                }
            }
        } catch (e: any) {
            setError(e.toString());
        } finally {
            if (!selectDefault) setLoading(false);
        }
    };

    const refreshLogsSilently = async () => {
        try {
            const files = await invoke<LogFile[]>("list_laravel_logs", { projectPath });
            const laravelLog = files.find(f => f.name === "laravel.log");
            
            // 1. Check for notifications (always check laravel.log)
            if (laravelLog && laravelLog.last_modified > lastLaravelLogModifiedRef.current) {
                lastLaravelLogModifiedRef.current = laravelLog.last_modified;
                
                // If laravel.log is selected, readLog will handle it
                // If NOT selected, we need to fetch it specifically for notifications
                if (selectedLog?.name !== 'laravel.log') {
                    const data = await invoke<string>("read_laravel_log", { 
                        filePath: laravelLog.path, 
                        lastLines: 50 // Just enough for notification check
                    });
                    const parsed = parseLogs(data);
                    await checkForErrorNotifications(parsed);
                }
            }

            // 2. Refresh current UI if needed
            if (selectedLog) {
                const currentLog = files.find(f => f.path === selectedLog.path);
                if (currentLog && currentLog.last_modified > lastModifiedRef.current) {
                    lastModifiedRef.current = currentLog.last_modified;
                    await readLog(true);
                }
            }
            
            setLogFiles(files);
        } catch (e) {
            console.error("Silent refresh failed", e);
        }
    };

    const parseLogs = (content: string): LogEntry[] => {
        const entries: LogEntry[] = [];
        const lines = content.split('\n');
        let currentEntry: LogEntry | null = null;
        let orphanedLines: string[] = [];

        for (const line of lines) {
            // Match [YYYY-MM-DD HH:MM:SS] level.ENV: message OR [YYYY-MM-DD HH:MM:SS] message
            const match = line.match(/^\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\] (?:(.*?)\.(.*?): )?(.*)/);
            
            if (match) {
                if (currentEntry) entries.push(currentEntry);
                currentEntry = {
                    date: match[1],
                    time: match[2],
                    timestamp: `${match[1]} ${match[2]}`,
                    env: match[3] || 'UNKNOWN',
                    level: match[4] || 'INFO',
                    message: match[5] || '',
                    fullContent: line
                };
            } else if (currentEntry) {
                currentEntry.fullContent += '\n' + line;
            } else if (line.trim()) {
                orphanedLines.push(line);
            }
        }
        if (currentEntry) entries.push(currentEntry);
        
        // If there were orphaned lines at the beginning, group them as one entry
        if (orphanedLines.length > 0) {
            entries.push({
                date: 'Unknown',
                time: '--:--:--',
                timestamp: '0000-00-00 00:00:00',
                env: 'SYSTEM',
                level: 'DEBUG',
                message: 'Partial/Orphaned log lines at start of chunk',
                fullContent: orphanedLines.join('\n')
            });
        }
        
        return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    };

    const checkForErrorNotifications = async (newEntries: LogEntry[]) => {
        if (newEntries.length === 0) return;
        
        const latestEntry = newEntries[0];
        const latestKey = `${latestEntry.timestamp}-${latestEntry.message}`;
        
        // If we haven't seen any log yet, just set the reference
        if (!lastSeenLogRef.current) {
            lastSeenLogRef.current = latestKey;
            return;
        }
        
        // If it's the same as before, nothing new
        if (lastSeenLogRef.current === latestKey) return;
        
        // Find entries newer than the last seen one
        const newerEntries = [];
        for (const entry of newEntries) {
            const key = `${entry.timestamp}-${entry.message}`;
            if (key === lastSeenLogRef.current) break;
            newerEntries.push(entry);
        }
        
        lastSeenLogRef.current = latestKey;
        
        // Check for Errors in newer entries
        const errorEntries = newerEntries.filter(e => 
            ['ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY'].includes(e.level.toUpperCase())
        );
        
        if (errorEntries.length > 0) {
            let permission = await isPermissionGranted();
            if (!permission) {
                const permissionResponse = await requestPermission();
                permission = permissionResponse === 'granted';
            }
            
            if (permission) {
                sendNotification({
                    title: `Laravel Error Detected`,
                    body: errorEntries[0].message.substring(0, 100) + (errorEntries[0].message.length > 100 ? '...' : ''),
                });
            }
        }
    };

    const readLog = async (silent = false) => {
        if (!selectedLog) return;
        if (!silent) setLoading(true);
        try {
            const data = await invoke<string>("read_laravel_log", { 
                filePath: selectedLog.path, 
                lastLines: limit 
            });
            const parsed = parseLogs(data);
            
            // Check for notifications before updating state
            if (selectedLog.name === 'laravel.log') {
                await checkForErrorNotifications(parsed);
            }
            
            setEntries(parsed);
            
            // For descending order, we usually want to be at the top
            // Only scroll if NOT silent or if we were already at the top
            if (!silent && scrollRef.current) {
                scrollRef.current.scrollTo({ top: 0, behavior: 'instant' as any });
            }
        } catch (e: any) {
            setError(e.toString());
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const levels = ["ALL", ...new Set(entries.map(e => e.level.toUpperCase()))].sort();

    const filteredEntries = selectedLevel === "ALL" 
        ? entries 
        : entries.filter(e => e.level.toUpperCase() === selectedLevel);

    const groupedEntries = filteredEntries.reduce((groups, entry) => {
        const date = entry.date;
        if (!groups[date]) {
            groups[date] = [];
        }
        groups[date].push(entry);
        return groups;
    }, {} as Record<string, LogEntry[]>);

    const getLevelColor = (level: string) => {
        level = level.toUpperCase();
        if (level.includes('ERROR') || level.includes('CRITICAL') || level.includes('ALERT') || level.includes('EMERGENCY')) return 'text-error';
        if (level.includes('WARNING')) return 'text-warning';
        if (level.includes('INFO')) return 'text-info';
        if (level.includes('DEBUG')) return 'text-success';
        return 'text-base-content/60';
    };

    const getLevelBadge = (level: string) => {
        level = level.toUpperCase();
        if (level.includes('ERROR') || level.includes('CRITICAL') || level.includes('ALERT') || level.includes('EMERGENCY')) return 'badge-error';
        if (level.includes('WARNING')) return 'badge-warning';
        if (level.includes('INFO')) return 'badge-info';
        if (level.includes('DEBUG')) return 'badge-success';
        return 'badge-ghost';
    };

    return (
        <div className="flex h-full bg-base-100 overflow-hidden rounded-xl border border-base-300 shadow-sm relative text-base-content font-sans flex-col animate-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="p-4 border-b border-base-300 flex justify-between items-center bg-base-200/30 shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Laravel Logs
                    </h2>
                    
                    <div className="flex gap-1 overflow-x-auto max-w-md no-scrollbar">
                        {logFiles.map(file => (
                            <button 
                                key={file.path}
                                className={`btn btn-xs whitespace-nowrap ${selectedLog?.path === file.path ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => {
                                    setSelectedLog(file);
                                    lastModifiedRef.current = file.last_modified;
                                    lastSeenLogRef.current = null;
                                }}
                            >
                                {file.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase opacity-40">Live</span>
                        <input 
                            type="checkbox" 
                            className="toggle toggle-xs toggle-primary" 
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold opacity-40 uppercase">Filter:</span>
                        <select 
                            className="select select-bordered select-xs bg-base-100 min-w-[100px]"
                            value={selectedLevel}
                            onChange={(e) => setSelectedLevel(e.target.value)}
                        >
                            {levels.map(level => (
                                <option key={level} value={level}>{level}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold opacity-40 uppercase">Lines:</span>
                        <select 
                            className="select select-bordered select-xs bg-base-100"
                            value={limit}
                            onChange={(e) => setLimit(Number(e.target.value))}
                        >
                            <option value={100}>100</option>
                            <option value={500}>500</option>
                            <option value={1000}>1000</option>
                            <option value={5000}>5000</option>
                        </select>
                    </div>

                    <button 
                        className={`btn btn-ghost btn-xs btn-square ${loading ? 'loading' : ''}`}
                        onClick={() => { fetchLogFiles(); if (selectedLog) readLog(); }}
                        title="Refresh Logs"
                    >
                        {!loading && <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.001 0 01-15.357-2m15.357 2H15" /></svg>}
                    </button>
                </div>
            </div>

            {/* Log Content */}
            <div className="flex-1 bg-base-100 overflow-hidden relative">
                {error && (
                    <div className="absolute top-4 left-4 right-4 z-10 alert alert-error shadow-lg py-2 text-white text-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span>{error}</span>
                    </div>
                )}
                
                <div 
                    ref={scrollRef}
                    className="h-full w-full overflow-auto bg-base-300/10 scroll-smooth"
                >
                    {loading && entries.length === 0 ? (
                        <div className="flex items-center justify-center h-full opacity-50 font-medium italic">
                            Loading logs...
                        </div>
                    ) : entries.length === 0 ? (
                        <div className="flex items-center justify-center h-full opacity-50 font-medium italic">
                            No log data found.
                        </div>
                    ) : (
                        <div className="p-4 space-y-8">
                            {Object.entries(groupedEntries)
                                .sort(([dateA], [dateB]) => {
                                    if (dateA === 'Unknown') return 1;
                                    if (dateB === 'Unknown') return -1;
                                    return dateB.localeCompare(dateA);
                                })
                                .map(([date, group]) => (
                                    <div key={date} className="space-y-3">
                                        <div className="sticky top-0 z-10 flex items-center gap-4 py-1">
                                            <div className="h-[1px] flex-1 bg-base-300"></div>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-base-content/40 bg-base-100 px-3 py-1 rounded-full border border-base-300 shadow-sm">
                                                {date === 'Unknown' 
                                                    ? 'Earlier Logs / Partial Entry' 
                                                    : new Date(date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                            </span>
                                            <div className="h-[1px] flex-1 bg-base-300"></div>
                                        </div>
                                        
                                        <div className="space-y-1">
                                            {group.map((entry, i) => (
                                                <div key={i} className="group flex flex-col bg-base-100 border border-base-300 rounded-lg overflow-hidden hover:border-base-content/20 transition-colors shadow-sm">
                                                    <div className="flex items-center gap-3 px-3 py-2 bg-base-200/50 text-[11px] font-mono border-b border-base-300/50">
                                                        <span className="font-bold text-base-content/50">{entry.time}</span>
                                                        <span className={`badge badge-xs font-bold uppercase ${getLevelBadge(entry.level)}`}>{entry.level}</span>
                                                        <span className="opacity-30">|</span>
                                                        <span className="text-base-content/40 uppercase tracking-tighter">{entry.env}</span>
                                                    </div>
                                                    <div className="p-3 text-[12px] font-mono leading-relaxed whitespace-pre-wrap break-all">
                                                        <span className={getLevelColor(entry.level)}>{entry.message}</span>
                                                        {(entry.fullContent.includes('\n') || entry.date === 'Unknown') && (
                                                            <details className="mt-2 group/details" open={entry.date === 'Unknown'}>
                                                                <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-base-content/30 hover:text-primary transition-colors list-none flex items-center gap-1">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 group-open/details:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                                                    {entry.date === 'Unknown' ? 'View Fragment' : 'Stack Trace / Details'}
                                                                </summary>
                                                                <div className="mt-2 p-3 bg-black/5 rounded border border-base-300 text-[10px] text-base-content/70 overflow-x-auto whitespace-pre">
                                                                    {entry.fullContent}
                                                                </div>
                                                            </details>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="p-2 px-4 border-t border-base-300 bg-base-200/30 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4 text-[10px] font-bold tracking-tight opacity-60 uppercase">
                    {selectedLog && (
                        <>
                            <span>Size: {(selectedLog.size / 1024).toFixed(2)} KB</span>
                            <span className="border-l border-base-content/10 pl-4">Last Modified: {new Date(selectedLog.last_modified * 1000).toLocaleString()}</span>
                            {autoRefresh && <span className="text-primary animate-pulse ml-2">● Live</span>}
                        </>
                    )}
                </div>
                <div className="text-[10px] font-bold opacity-40 uppercase">
                    Laravel Log Viewer
                </div>
            </div>
        </div>
    );
};
