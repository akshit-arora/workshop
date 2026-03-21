import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface TerminalTab {
    id: string;
    name: string;
}

interface ArtisanCommand {
    name: string;
    description: string;
    usage: string[];
}

const ArtisanCommandSelector = ({ path, onSelect }: { path: string, onSelect: (cmd: string) => void }) => {
    const [commands, setCommands] = useState<ArtisanCommand[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchCommands = async () => {
            setLoading(true);
            try {
                const cmds = await invoke<ArtisanCommand[]>("get_artisan_commands", { path });
                setCommands(cmds);
            } catch (err) {
                console.error("Failed to fetch artisan commands:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchCommands();
    }, [path]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredCommands = commands.filter(cmd => 
        cmd.name.toLowerCase().includes(search.toLowerCase()) || 
        cmd.description.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="dropdown dropdown-end" ref={dropdownRef}>
            <div 
                tabIndex={0} 
                role="button" 
                className="btn btn-ghost btn-xs gap-2 border border-base-300"
                onClick={() => setIsOpen(!isOpen)}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Artisan
            </div>
            {isOpen && (
                <ul tabIndex={0} className="dropdown-content z-[20] menu p-2 shadow-2xl bg-base-200 rounded-box w-80 max-h-96 overflow-hidden flex-nowrap border border-base-300 mt-1">
                    <div className="px-2 pb-2 sticky top-0 bg-base-200 z-10">
                        <input
                            type="text"
                            placeholder="Search artisan commands..."
                            className="input input-bordered input-sm w-full bg-base-100"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="overflow-y-auto flex-1 custom-scrollbar">
                        {loading ? (
                            <li className="p-4 text-center opacity-50 italic">Loading artisan commands...</li>
                        ) : filteredCommands.length === 0 ? (
                            <li className="p-4 text-center opacity-50 italic">No commands found</li>
                        ) : (
                            filteredCommands.map(cmd => (
                                <li key={cmd.name}>
                                    <button 
                                        className="flex flex-col items-start gap-0 py-2 hover:bg-primary hover:text-primary-content"
                                        onClick={() => {
                                            onSelect(`php artisan ${cmd.name}`);
                                            setIsOpen(false);
                                            setSearch("");
                                        }}
                                    >
                                        <span className="font-bold font-mono text-xs">{cmd.name}</span>
                                        <span className="text-[10px] opacity-70 line-clamp-1">{cmd.description}</span>
                                    </button>
                                </li>
                            ))
                        )}
                    </div>
                </ul>
            )}
        </div>
    );
};

export const Terminal = ({ activeProject }: { activeProject: any }) => {
    const [tabs, setTabs] = useState<TerminalTab[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const [projectInfo, setProjectInfo] = useState<any>(null);
    const terminalRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const xtermInstances = useRef<Record<string, XTerm>>({});
    const fitAddons = useRef<Record<string, FitAddon>>({});

    useEffect(() => {
        if (activeProject?.path) {
            invoke("get_project_info", { path: activeProject.path })
                .then(setProjectInfo)
                .catch(console.error);
        }
    }, [activeProject?.path]);

    const executeCommand = (command: string) => {
        if (activeTabId && xtermInstances.current[activeTabId]) {
            invoke("write_to_terminal", { id: activeTabId, data: command + "\n" });
        }
    };

    const createTab = async () => {
        const id = crypto.randomUUID();

        setTabs((prev) => {
            const newTab = { id, name: `Terminal ${prev.length + 1}` };
            return [...prev, newTab];
        });

        setActiveTabId(id);

        // Give React time to render the new tab's container
        setTimeout(async () => {
            await initTerminal(id);
        }, 100);
    };

    const initTerminal = async (id: string) => {
        if (!terminalRefs.current[id] || xtermInstances.current[id]) return;

        const term = new XTerm({
            cursorBlink: true,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: 13,
            theme: {
                background: '#1d232a', // night theme background
            }
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRefs.current[id]!);
        fitAddon.fit();

        xtermInstances.current[id] = term;
        fitAddons.current[id] = fitAddon;

        try {
            await invoke("create_terminal", { id, cwd: activeProject.path });

            const unlisten = await listen(`terminal-data-${id}`, (event: any) => {
                term.write(event.payload);
            });

            term.onData((data) => {
                invoke("write_to_terminal", { id, data });
            });

            term.onResize(({ cols, rows }) => {
                invoke("resize_terminal", { id, cols, rows });
            });

            // Cleanup on unmount or tab close
            (term as any)._unlisten = unlisten;
        } catch (err) {
            term.write(`\r\n\x1b[31mError starting terminal: ${err}\x1b[0m\r\n`);
        }
    };

    const lastProjectId = useRef<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new ResizeObserver(() => {
            Object.values(fitAddons.current).forEach(fit => {
                try {
                    fit.fit();
                } catch (e) {
                    // Fit might fail if the terminal is not visible or already disposed
                }
            });
        });

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => {
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        if (activeProject) {
            if (activeProject.id !== lastProjectId.current) {
                // If the project changed, close all old tabs
                tabs.forEach(tab => closeTab(tab.id));
                setTabs([]); // Ensure front-end state clears alongside closeTab backend disposes
                lastProjectId.current = activeProject.id;
                createTab();
            } else if (tabs.length === 0) {
                // If it's the same project but no tabs are open (e.g. user closed them all), we don't automatically recreate
                // to respect user's choice to close all tabs. Or we can auto recreate. Usually users expect at least 1.
                // Let's rely on the user clicking '+' if they closed everything, or we can restore 1.
            }
        }
    }, [activeProject?.id]);

    const closeTab = (id: string) => {
        setTabs(prev => {
            const newTabs = prev.filter(t => t.id !== id);
            if (activeTabId === id) {
                setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
            }
            return newTabs;
        });
        const term = xtermInstances.current[id];
        if (term) {
            if ((term as any)._unlisten) (term as any)._unlisten();
            term.dispose();
            delete xtermInstances.current[id];
            delete fitAddons.current[id];
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center px-4 bg-base-200 border-b border-base-300 min-h-10">
                <div className="flex flex-1 overflow-x-auto gap-1 py-1 no-scrollbar">
                    {tabs.map((tab) => (
                        <div
                            key={tab.id}
                            className={`flex items-center gap-2 px-3 py-1 rounded-t-lg transition-all cursor-pointer text-sm whitespace-nowrap
                ${activeTabId === tab.id ? 'bg-[#1d232a] text-white border-t-2 border-primary' : 'bg-base-300 hover:bg-base-100 opacity-70'}
              `}
                            onClick={() => {
                                setActiveTabId(tab.id);
                                setTimeout(() => fitAddons.current[tab.id]?.fit(), 0);
                            }}
                        >
                            <span>{tab.name}</span>
                            <button
                                className="hover:text-error transition-colors text-xs"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    closeTab(tab.id);
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                    <button
                        className="btn btn-ghost btn-xs rounded-full h-7 w-7 p-0 flex items-center justify-center font-bold"
                        onClick={createTab}
                    >
                        ＋
                    </button>
                </div>

                <div className="flex items-center gap-2 pr-4">
                    {projectInfo?.project_type === "Laravel" && (
                        <ArtisanCommandSelector 
                            path={activeProject.path} 
                            onSelect={executeCommand}
                        />
                    )}
                    
                    <button 
                        className="btn btn-ghost btn-xs gap-2 border border-base-300"
                        onClick={() => executeCommand("clear")}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        Clear
                    </button>
                </div>
            </div>

            <div className="flex-1 relative bg-[#1d232a]" ref={containerRef}>
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        ref={(el) => (terminalRefs.current[tab.id] = el)}
                        className={`absolute inset-0 transition-opacity duration-200 ${activeTabId === tab.id ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}
                    />
                ))}

                {tabs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full opacity-30">
                        <div className="text-4xl mb-4">💻</div>
                        <p>No active terminals. Click + to start one.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
