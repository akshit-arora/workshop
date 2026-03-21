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

export const Terminal = ({ activeProject }: { activeProject: any }) => {
    const [tabs, setTabs] = useState<TerminalTab[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const terminalRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const xtermInstances = useRef<Record<string, XTerm>>({});
    const fitAddons = useRef<Record<string, FitAddon>>({});

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
