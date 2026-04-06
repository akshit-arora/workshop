import { useState, useEffect, useRef } from "react";
import mermaid from "mermaid";
import { invoke } from "@tauri-apps/api/core";

// Initialize mermaid with specific flowchart and font settings for better layout reliability
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  suppressErrorRendering: true,
  fontFamily: 'monospace',
  flowchart: {
    htmlLabels: true, // Resetting to true as it's more stable for many charts if font is correct
    useMaxWidth: false,
    curve: 'basis',
  },
});

interface MermaidChart {
  name: string;
  code: string;
}

export const MermaidEditor = ({ projectPath, charts: initialCharts, onRefresh }: { 
  projectPath: string, 
  charts: MermaidChart[],
  onRefresh: () => void 
}) => {
  const [charts, setCharts] = useState<MermaidChart[]>(initialCharts);
  const [activeChart, setActiveChart] = useState<MermaidChart | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [isNew, setIsNew] = useState(false);

  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setCharts(initialCharts);
  }, [initialCharts]);

  useEffect(() => {
    if (activeChart) {
      setEditCode(activeChart.code);
      setEditName(activeChart.name);
      setIsNew(false);
    } else {
      setEditCode("");
      setEditName("");
      setIsNew(true);
    }
  }, [activeChart]);

  useEffect(() => {
    if (error) {
      // Mermaid sometimes injects error divs at the end of body
      const cleanup = () => {
        document.querySelectorAll('[id^="dmermaid-"], .mermaid-err, #mermaid-error-id').forEach(el => el.remove());
      };
      cleanup();
      const timer = setTimeout(cleanup, 100);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const renderChart = async (code: string) => {
    if (!previewRef.current || !code) return;
    setError(null);
    
    try {
      // 1. Validate first
      await mermaid.parse(code);
      
      // 2. Generate unique IDs for this render pass
      const renderId = `m${Math.random().toString(36).substring(2, 11)}`;
      
      // 3. Create a temporary, off-screen but "visible" container for layout calculations
      const renderContainer = document.createElement('div');
      renderContainer.style.position = 'fixed';
      renderContainer.style.left = '-10000px';
      renderContainer.style.top = '0';
      renderContainer.style.width = '2000px'; // Provide ample space for layout
      renderContainer.style.height = '2000px';
      // Use opacity 0 instead of visibility hidden/display none so getBBox() works accurately
      renderContainer.style.opacity = '0';
      renderContainer.style.pointerEvents = 'none';
      document.body.appendChild(renderContainer);

      try {
        const { svg } = await mermaid.render(renderId, code, renderContainer);
        if (previewRef.current) {
          previewRef.current.innerHTML = svg;
        }
      } finally {
        // 4. Cleanup ONLY the temporary container
        document.body.removeChild(renderContainer);
      }
    } catch (e: any) {
      console.error("Mermaid caught error:", e);
      if (previewRef.current) previewRef.current.innerHTML = '';
      setError(e.message || e.str || "Invalid Mermaid syntax");
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      renderChart(editCode);
    }, 500);
    return () => clearTimeout(timer);
  }, [editCode]);

  const handleSave = async () => {
    if (!editName || !editCode) return;
    try {
      await invoke("save_mermaid_chart", { path: projectPath, name: editName, code: editCode });
      onRefresh();
      setIsNew(false);
      // Update local state to show saved chart
      setActiveChart({ name: editName, code: editCode });
    } catch (e: any) {
      setError(e.toString());
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Are you sure you want to delete chart "${name}"?`)) return;
    try {
      await invoke("delete_mermaid_chart", { path: projectPath, name });
      onRefresh();
      if (activeChart?.name === name) {
        setActiveChart(null);
      }
    } catch (e: any) {
      setError(e.toString());
    }
  };

  const handleCreateNew = () => {
    setActiveChart(null);
    setEditName("New Chart");
    setEditCode("graph TD\n    A[Start] --> B{Is it working?}\n    B -- Yes --> C[Great!]\n    B -- No --> D[Check code]");
    setIsNew(true);
  };

  const cheatSheet = [
    {
      label: "Flowchart",
      code: "graph TD\n  A[Start] --> B{Decision}\n  B -- Yes --> C[Result 1]\n  B -- No --> D[Result 2]"
    },
    {
      label: "Sequence",
      code: "sequenceDiagram\n  Alice->>John: Hello John, how are you?\n  John-->>Alice: Great!\n  Alice-)John: See you later!"
    },
    {
      label: "ER Diagram",
      code: "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE-ITEM : contains"
    },
    {
      label: "Gantt",
      code: "gantt\n  title A Gantt Diagram\n  section Section\n  A task :a1, 2023-01-01, 30d\n  Another task :after a1, 20d"
    },
    {
      label: "Class",
      code: "classDiagram\n  Animal <|-- Duck\n  Animal <|-- Fish\n  Animal : +int age\n  Animal : +isAlive()"
    },
    {
      label: "State",
      code: "stateDiagram-v2\n  [*] --> Still\n  Still --> [*]\n  Still --> Moving\n  Moving --> Still"
    }
  ];

  return (
    <div className="flex flex-col h-full bg-base-100 overflow-hidden rounded-xl border border-base-300 shadow-sm animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex h-full">
        {/* Sidebar */}
        <div className="w-64 border-r border-base-300 bg-base-200/30 flex flex-col">
          <div className="p-4 border-b border-base-300 flex justify-between items-center">
            <h2 className="font-bold text-sm uppercase tracking-wider opacity-60">My Charts</h2>
            <button className="btn btn-primary btn-xs" onClick={handleCreateNew}>+</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {charts.map(chart => (
              <div key={chart.name} className={`flex items-center justify-between group rounded-lg px-3 py-2 cursor-pointer transition-colors ${activeChart?.name === chart.name ? 'bg-primary text-primary-content' : 'hover:bg-base-300'}`} onClick={() => setActiveChart(chart)}>
                <span className="text-sm truncate font-medium">{chart.name}</span>
                <button className={`btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 ${activeChart?.name === chart.name ? 'text-primary-content hover:bg-white/20' : 'text-error'}`} onClick={(e) => { e.stopPropagation(); handleDelete(chart.name); }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            ))}
            {charts.length === 0 && !isNew && (
              <div className="text-center py-8 px-4">
                <p className="text-xs opacity-40 italic">No charts yet. Click + to create one.</p>
              </div>
            )}
          </div>
          
          {/* Cheat Sheet in Sidebar */}
          <div className="border-t border-base-300 bg-base-300/20">
            <div className="p-3 border-b border-base-300">
              <h3 className="text-[10px] font-black uppercase opacity-40 tracking-widest">Cheat Sheet</h3>
            </div>
            <div className="p-2 grid grid-cols-2 gap-1">
              {cheatSheet.map(item => (
                <button 
                  key={item.label} 
                  className="btn btn-xs btn-ghost justify-start text-[10px] font-bold h-7 min-h-0"
                  onClick={() => {
                    if (isNew || activeChart) {
                      setEditCode(item.code);
                    } else {
                      handleCreateNew();
                      setEditCode(item.code);
                      setEditName(item.label);
                    }
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          {(activeChart || isNew) ? (
            <>
              <div className="p-4 border-b border-base-300 flex justify-between items-center bg-base-200/10">
                <input 
                  type="text" 
                  className="input input-sm input-ghost font-bold text-lg focus:bg-base-200 w-full max-w-xs"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Chart Name"
                />
                <button className="btn btn-primary btn-sm px-6" onClick={handleSave}>Save Chart</button>
              </div>
              <div className="flex-1 flex overflow-hidden">
                {/* Code Editor */}
                <div className="w-1/3 border-r border-base-300 flex flex-col">
                  <div className="bg-base-300 px-3 py-1 text-[10px] font-bold uppercase opacity-50 tracking-tighter">Mermaid Code</div>
                  <textarea
                    className="flex-1 p-4 font-mono text-xs bg-base-100 resize-none focus:outline-none"
                    value={editCode}
                    onChange={e => setEditCode(e.target.value)}
                    spellCheck={false}
                  ></textarea>
                </div>
                {/* Preview */}
                <div className="flex-1 flex flex-col bg-slate-900 overflow-auto relative">
                  <div className="bg-slate-800 px-3 py-1 text-[10px] font-bold uppercase text-white/50 tracking-tighter shrink-0 flex justify-between items-center">
                    <span>Live Preview</span>
                    <div className="flex gap-2 items-center bg-slate-700/50 rounded-md px-1 ml-4">
                      <button className="btn btn-ghost btn-xs h-5 min-h-0 px-1 text-white/70 hover:text-white" onClick={() => setZoom(prev => Math.max(0.1, prev - 0.1))}>−</button>
                      <span className="text-[9px] font-mono w-8 text-center text-white/50">{Math.round(zoom * 100)}%</span>
                      <button className="btn btn-ghost btn-xs h-5 min-h-0 px-1 text-white/70 hover:text-white" onClick={() => setZoom(prev => Math.min(5, prev + 0.1))}>+</button>
                      <button className="btn btn-ghost btn-xs h-5 min-h-0 px-1 text-white/70 hover:text-white border-l border-white/10 rounded-none" onClick={() => setZoom(1)}>Reset</button>
                    </div>
                  </div>
                  {error && (
                    <div className="absolute inset-0 z-10 bg-slate-900/90 flex items-center justify-center p-8 backdrop-blur-sm overflow-auto">
                      <div className="max-w-xl w-full bg-error/10 border border-error/20 rounded-xl p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center gap-3 mb-4 text-error">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                          <h3 className="font-bold">Mermaid Syntax Error</h3>
                        </div>
                        <pre className="text-[11px] font-mono whitespace-pre-wrap text-error/90 leading-relaxed bg-black/30 p-4 rounded-lg border border-error/10 max-h-[300px] overflow-auto">
                          {error}
                        </pre>
                        <p className="text-[10px] mt-4 opacity-50 text-white italic">Tip: Use the Cheat Sheet in the sidebar for syntax references.</p>
                      </div>
                    </div>
                  )}
                  <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
                    <div 
                      ref={previewRef} 
                      className="max-w-full transition-transform duration-200 ease-out" 
                      style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
                    ></div>
                  </div>
                </div>

              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-30">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <h2 className="text-2xl font-bold">Select a chart or create a new one</h2>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
