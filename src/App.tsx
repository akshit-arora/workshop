import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { readDir } from "@tauri-apps/plugin-fs";
import { Terminal } from "./components/Terminal";
import "./App.css";

const DAISY_THEMES = [
  "light", "dark", "cupcake", "bumblebee", "emerald", "corporate", "synthwave", "retro", "cyberpunk", "valentine", "halloween", "garden", "forest", "aqua", "lofi", "pastel", "fantasy", "wireframe", "black", "luxury", "dracula", "cmyk", "autumn", "business", "acid", "lemonade", "night", "coffee", "winter", "dim", "nord", "sunset"
];

interface Project {
  id: number;
  name: string;
  path: string;
  description: string;
}

export interface TextEditor {
  id: string;
  name: string;
  command: string;
}

const Dashboard = ({ name, activeProject, openProjectFolder, setView, dbError, defaultEditor, openInEditor }: {
  name: string,
  activeProject: Project | null,
  openProjectFolder: (path: string) => Promise<void>,
  setView: (view: string) => void,
  dbError: string | null,
  defaultEditor: TextEditor | null,
  openInEditor: (command: string, path: string) => Promise<void>
}) => (
  <div className="max-w-4xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
    {dbError && (
      <div className="alert alert-error mb-6 shadow-lg">
        <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span>Database Error: {dbError}</span>
      </div>
    )}
    <div className="flex flex-col md:flex-row gap-8">
      <div className="flex-1">
        <h1 className="text-4xl font-extrabold tracking-tight">
          Hey {name || "there"}, good to see you! 👋
        </h1>
        <p className="text-xl text-base-content/60 mt-4 leading-relaxed">
          {activeProject
            ? `You are currently working on ${activeProject.name}.`
            : "Workshop is currently in dev mode. Pick a tool from the side to get started on your next big thing."
          }
        </p>
      </div>
      {activeProject && (
        <div className="card bg-primary text-primary-content shadow-xl md:w-80">
          <div className="card-body p-6">
            <h2 className="card-title text-lg font-bold truncate">{activeProject.name}</h2>
            <p className="text-xs opacity-80 font-mono truncate">{activeProject.path}</p>
            {activeProject.description && (
              <p className="text-sm mt-2 line-clamp-2 italic">"{activeProject.description}"</p>
            )}
            <div className="card-actions justify-end mt-4">
              <button
                className="btn btn-sm btn-ghost bg-white/20 hover:bg-white/30 border-none"
                onClick={() => openProjectFolder(activeProject.path)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                Open Folder
              </button>
              {defaultEditor && (
                <button
                  className="btn btn-sm btn-primary border-none shadow-md"
                  onClick={() => openInEditor(defaultEditor.command, activeProject.path)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                  Open in {defaultEditor.name}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
      <div className="card bg-base-200 shadow-xl border border-base-300 hover:scale-[1.02] transition-all duration-300 cursor-default">
        <div className="card-body">
          <h2 className="card-title text-xl">Dynamic Layouts</h2>
          <p className="opacity-70">Toggle the sidebar using the hamburger menu in the header. Notice the smooth transitions and responsive design.</p>
          <div className="card-actions justify-end mt-4">
            <button className="btn btn-primary btn-sm">Explore Features</button>
          </div>
        </div>
      </div>

      <div className="card bg-base-200 shadow-xl border border-base-300 hover:scale-[1.02] transition-all duration-300 cursor-default">
        <div className="card-body">
          <h2 className="card-title text-xl">Theming Built-in</h2>
          <p className="opacity-70">Included is a theme controller in the header. Try toggling between light and dark modes.</p>
          <div className="card-actions justify-end mt-4">
            <button className="btn btn-secondary btn-sm" onClick={() => setView("settings")}>Change Theme</button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const Projects = ({ projects, activeProject, createProject, switchProject, openProjectFolder, deleteProject, projectsRootPath, saveProjectsRoot, syncAutoDiscoveredProjects, db }: {
  projects: Project[],
  activeProject: Project | null,
  createProject: (name: string, path: string, desc: string) => Promise<void>,
  switchProject: (project: Project) => Promise<void>,
  openProjectFolder: (path: string) => Promise<void>,
  deleteProject: (id: number) => Promise<void>,
  projectsRootPath: string,
  saveProjectsRoot: (path: string) => Promise<void>,
  syncAutoDiscoveredProjects: (db: Database, path: string) => Promise<void>,
  db: Database | null
}) => {
  const [projName, setProjName] = useState("");
  const [projPath, setProjPath] = useState("");
  const [projDesc, setProjDesc] = useState("");
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  useEffect(() => {
    if (db && projectsRootPath) {
      syncAutoDiscoveredProjects(db, projectsRootPath);
    }
  }, []);

  const handlePickFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Project Folder"
    });
    if (selected && typeof selected === "string") {
      setProjPath(selected);
      const parts = selected.split("/");
      const folderName = parts[parts.length - 1] || "New Project";
      setProjName(folderName);
    }
  };

  const handlePickRoot = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Projects Root Folder"
    });
    if (selected && typeof selected === "string") {
      await saveProjectsRoot(selected);
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Projects</h1>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={handlePickRoot}>
            {projectsRootPath ? "Change Root" : "Auto Discover Projects"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => (document.getElementById('new_project_modal') as HTMLDialogElement).showModal()}>
            New Project
          </button>
        </div>
      </div>

      {projectsRootPath && (
        <div className="alert alert-info mb-8 text-sm py-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          <span>Auto-syncing projects from: <span className="font-mono">{projectsRootPath}</span>. All subfolders are automatically added.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-base-200 rounded-2xl border-2 border-dashed border-base-300">
            <div className="text-5xl mb-4">📂</div>
            <h3 className="text-xl font-bold">No projects yet</h3>
            <p className="opacity-60">Create your first project or select a root folder to auto-discover</p>
          </div>
        ) : (
          projects.map(p => (
            <div key={p.id} className={`card bg-base-200 shadow-md border-2 transition-all ${activeProject?.id === p.id ? 'border-primary' : 'border-transparent hover:border-base-300'}`}>
              <div className="card-body p-6 flex flex-col h-full">
                <div className="flex justify-between items-start mb-2">
                  <h2 className="card-title truncate flex-1">{p.name}</h2>
                  {activeProject?.id === p.id && <div className="badge badge-primary badge-sm shrink-0">Active</div>}
                </div>
                <p className="text-xs opacity-60 font-mono truncate mb-4">{p.path}</p>
                <div className="card-actions justify-end mt-auto pt-4 border-t border-base-300/50 gap-1">
                  <button className="btn btn-ghost btn-xs text-error" onClick={() => {
                    setProjectToDelete(p);
                    (document.getElementById('delete_confirm_modal') as HTMLDialogElement).showModal();
                  }}>Delete</button>
                  <button className="btn btn-ghost btn-xs" onClick={() => openProjectFolder(p.path)}>Open Folder</button>
                  <button className={`btn btn-sm ${activeProject?.id === p.id ? 'btn-disabled' : 'btn-primary'}`} onClick={() => switchProject(p)}>
                    {activeProject?.id === p.id ? 'Selected' : 'Select'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <dialog id="new_project_modal" className="modal modal-bottom sm:modal-middle">
        <div className="modal-box">
          <h3 className="font-bold text-lg mb-6">Create New Project</h3>
          <div className="space-y-4">
            <div className="form-control w-full">
              <label className="label"><span className="label-text">Project Path</span></label>
              <div className="flex gap-2">
                <input type="text" readOnly value={projPath} placeholder="Pick a folder..." className="input input-bordered flex-1" />
                <button className="btn btn-square" onClick={handlePickFolder}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9l-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </button>
              </div>
            </div>
            <div className="form-control w-full">
              <label className="label"><span className="label-text">Project Name</span></label>
              <input type="text" value={projName} onChange={(e) => setProjName(e.target.value)} className="input input-bordered w-full" />
            </div>
            <div className="form-control w-full">
              <label className="label"><span className="label-text">Description (Optional)</span></label>
              <textarea value={projDesc} onChange={(e) => setProjDesc(e.target.value)} className="textarea textarea-bordered h-24" placeholder="Briefly describe what this project is about"></textarea>
            </div>
          </div>
          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-ghost mr-2">Cancel</button>
              <button className="btn btn-primary" disabled={!projPath || !projName} onClick={() => {
                createProject(projName, projPath, projDesc);
                setProjName(""); setProjPath(""); setProjDesc("");
              }}>Create Project</button>
            </form>
          </div>
        </div>
      </dialog>

      <dialog id="delete_confirm_modal" className="modal modal-bottom sm:modal-middle">
        <div className="modal-box border-t-4 border-error shadow-2xl">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-error/10 p-3 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="font-bold text-xl text-error">Delete Project?</h3>
          </div>
          <p className="text-base-content/80 leading-relaxed">
            Are you sure you want to delete <span className="font-bold text-base-content">"{projectToDelete?.name}"</span>?
            This action will remove the project from your Workshop dashboard.
          </p>
          <div className="bg-base-200 p-3 rounded-lg mt-4 flex items-start gap-2 border border-base-300">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-info shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <p className="text-xs opacity-70 italic">Don't worry, your physical files at <span className="font-mono truncate max-w-full inline-block align-bottom">{projectToDelete?.path}</span> will not be touched.</p>
          </div>
          <div className="modal-action gap-2">
            <form method="dialog" className="flex gap-2">
              <button className="btn btn-ghost" onClick={() => setProjectToDelete(null)}>Cancel</button>
              <button
                className="btn btn-error px-6"
                onClick={() => {
                  if (projectToDelete) {
                    deleteProject(projectToDelete.id);
                    setProjectToDelete(null);
                  }
                }}
              >
                Confirm Delete
              </button>
            </form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={() => setProjectToDelete(null)}>close</button>
        </form>
      </dialog>
    </div>
  );
};

const Settings = ({ tempName, setTempName, tempTheme, setTempTheme, setTheme, DAISY_THEMES, saveSettings, editors, setEditors, defaultEditorId, setDefaultEditorId, db }: {
  tempName: string,
  setTempName: (val: string) => void,
  tempTheme: string,
  setTempTheme: (val: string) => void,
  setTheme: (val: string) => void,
  DAISY_THEMES: string[],
  saveSettings: (name: string, theme: string) => Promise<void>,
  editors: TextEditor[],
  setEditors: (editors: TextEditor[]) => void,
  defaultEditorId: string | null,
  setDefaultEditorId: (id: string | null) => void,
  db: Database | null
}) => {
  const [newEditorName, setNewEditorName] = useState("");
  const [newEditorCmd, setNewEditorCmd] = useState("");

  const handleAddEditor = async () => {
    if (!newEditorName || !newEditorCmd || !db) return;
    const newEditor: TextEditor = {
      id: crypto.randomUUID(),
      name: newEditorName,
      command: newEditorCmd
    };
    const updated = [...editors, newEditor];
    setEditors(updated);
    await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('editors', $1)", [JSON.stringify(updated)]);
    if (!defaultEditorId) {
      setDefaultEditorId(newEditor.id);
      await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('default_editor_id', $1)", [newEditor.id]);
    }
    setNewEditorName("");
    setNewEditorCmd("");
  };

  const handleRemoveEditor = async (id: string) => {
    if (!db) return;
    const updated = editors.filter(e => e.id !== id);
    setEditors(updated);
    await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('editors', $1)", [JSON.stringify(updated)]);
    if (defaultEditorId === id) {
      const newDefault = updated.length > 0 ? updated[0].id : null;
      setDefaultEditorId(newDefault);
      if (newDefault) {
        await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('default_editor_id', $1)", [newDefault]);
      } else {
        await db.execute("DELETE FROM settings WHERE key = 'default_editor_id'");
      }
    }
  };

  const handleSetDefault = async (id: string) => {
    if (!db) return;
    setDefaultEditorId(id);
    await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('default_editor_id', $1)", [id]);
  };

  return (
    <div className="max-w-2xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      <div className="space-y-8">
        <div className="card bg-base-200 border border-base-300 shadow-sm">
          <div className="card-body">
            <h2 className="card-title mb-4">Profile</h2>
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Your Name</span>
              </label>
              <input
                type="text"
                className="input input-bordered w-full"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="card bg-base-200 border border-base-300 shadow-sm">
          <div className="card-body">
            <h2 className="card-title mb-2">Appearance</h2>
            <p className="text-xs opacity-60 mb-4">Choose your favorite DaisyUI theme.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DAISY_THEMES.map((t) => (
                <button
                  key={t}
                  className={`btn btn-sm capitalize ${tempTheme === t ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => {
                    setTempTheme(t);
                    setTheme(t); // Real-time preview
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card bg-base-200 border border-base-300 shadow-sm">
          <div className="card-body">
            <h2 className="card-title mb-2">Text Editors</h2>
            <p className="text-xs opacity-60 mb-4">Add your favorite code editors to quickly open projects from the dashboard.</p>

            <div className="flex gap-2 mb-4">
              <input type="text" placeholder="Editor Name (e.g. VSCode)" className="input input-sm input-bordered flex-1" value={newEditorName} onChange={e => setNewEditorName(e.target.value)} />
              <input type="text" placeholder="Command (e.g. code)" className="input input-sm input-bordered flex-1" value={newEditorCmd} onChange={e => setNewEditorCmd(e.target.value)} />
              <button className="btn btn-sm btn-primary" onClick={handleAddEditor} disabled={!newEditorName || !newEditorCmd}>Add</button>
            </div>

            {editors.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="table table-sm w-full">
                  <thead>
                    <tr>
                      <th>Default</th>
                      <th>Name</th>
                      <th>Command</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editors.map(ed => (
                      <tr key={ed.id}>
                        <td>
                          <input type="radio" name="default_editor" className="radio radio-primary radio-sm" checked={defaultEditorId === ed.id} onChange={() => handleSetDefault(ed.id)} />
                        </td>
                        <td className="font-semibold">{ed.name}</td>
                        <td className="font-mono text-xs opacity-70">{ed.command}</td>
                        <td className="text-right">
                          <button className="btn btn-ghost btn-xs text-error" onClick={() => handleRemoveEditor(ed.id)}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-4 opacity-50 text-sm italic">No text editors configured</div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            className="btn btn-primary px-10"
            onClick={() => saveSettings(tempName, tempTheme)}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [theme, setTheme] = useState("light");
  const [name, setName] = useState("");
  const [tempName, setTempName] = useState("");
  const [tempTheme, setTempTheme] = useState("");
  const [showFTUE, setShowFTUE] = useState(false);
  const [ftueStep, setFtueStep] = useState(1);
  const [view, setView] = useState("dashboard"); // "dashboard", "settings", "projects"
  const [db, setDb] = useState<Database | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [projectsRootPath, setProjectsRootPath] = useState("");
  const [editors, setEditors] = useState<TextEditor[]>([]);
  const [defaultEditorId, setDefaultEditorId] = useState<string | null>(null);

  const openInEditor = async (command: string, path: string) => {
    try {
      await invoke("open_in_editor", { command, path });
    } catch (err) {
      console.error("Failed to open editor:", err);
      alert(`Failed to open editor: ${err}`);
    }
  };

  const syncAutoDiscoveredProjects = async (dbInstance: Database, rootPath: string) => {
    if (!rootPath) return;
    try {
      const entries = await readDir(rootPath);
      const subdirs = entries.filter((e: any) => e.isDirectory);

      for (const dir of subdirs) {
        const fullPath = `${rootPath}/${dir.name}`;
        // Check if project exists
        const existing = await dbInstance.select<any[]>("SELECT id FROM projects WHERE path = $1", [fullPath]);
        if (existing.length === 0) {
          await dbInstance.execute("INSERT INTO projects (name, path) VALUES ($1, $2)", [dir.name, fullPath]);
        }
      }

      const newList = await dbInstance.select<Project[]>("SELECT * FROM projects");
      setProjects(newList);
    } catch (err) {
      console.error("Auto-discovery failed:", err);
    }
  };

  // Initialize DB and load settings
  useEffect(() => {
    async function initDb() {
      try {
        const _db = await Database.load("sqlite:workshop.db");
        setDb(_db);

        // Check if settings table exists with old structure
        const tableCheck = await _db.select<any[]>("PRAGMA table_info(settings)");
        const isOldSchema = tableCheck.length > 0 && tableCheck.some(c => c.name === 'name');

        if (isOldSchema) {
          // migrate old data to temp
          const oldData = await _db.select<any[]>("SELECT * FROM settings WHERE id = 1");
          await _db.execute("DROP TABLE settings");
          await _db.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)");
          if (oldData.length > 0) {
            if (oldData[0].name) await _db.execute("INSERT INTO settings (key, value) VALUES ('name', $1)", [oldData[0].name]);
            if (oldData[0].theme) await _db.execute("INSERT INTO settings (key, value) VALUES ('theme', $1)", [oldData[0].theme]);
            if (oldData[0].active_project_id) await _db.execute("INSERT INTO settings (key, value) VALUES ('active_project_id', $1)", [oldData[0].active_project_id.toString()]);
          }
        } else {
          await _db.execute(`
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT
            )
          `);
        }

        await _db.execute(`
          CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            description TEXT
          )
        `);

        const settingsResult = await _db.select<{ key: string; value: string }[]>("SELECT key, value FROM settings");
        const settingsMap: Record<string, string> = {};
        settingsResult.forEach(s => settingsMap[s.key] = s.value);

        if (settingsMap.name || settingsMap.theme) {
          if (settingsMap.name) {
            setName(settingsMap.name);
            setTempName(settingsMap.name);
          }
          if (settingsMap.theme) {
            setTheme(settingsMap.theme);
            setTempTheme(settingsMap.theme);
          }
          if (settingsMap.projects_root_path) {
            setProjectsRootPath(settingsMap.projects_root_path);
            await syncAutoDiscoveredProjects(_db, settingsMap.projects_root_path);
          }

          if (settingsMap.editors) {
            try { setEditors(JSON.parse(settingsMap.editors)); } catch (e) { console.error("Failed to parse editors", e); }
          }
          if (settingsMap.default_editor_id) {
            setDefaultEditorId(settingsMap.default_editor_id);
          }

          // Load projects (again after sync)
          const projectList = await _db.select<Project[]>("SELECT * FROM projects");
          setProjects(projectList);

          if (settingsMap.active_project_id) {
            const activeId = parseInt(settingsMap.active_project_id);
            const active = projectList.find(p => p.id === activeId);
            if (active) setActiveProject(active);
          }
        } else {
          setShowFTUE(true);
          setTempTheme("light");
        }
      } catch (err: any) {
        console.error("DB Error:", err);
        setDbError(err.toString());
      }
    }
    initDb();
  }, []);

  // Handle theme switching
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const saveSettings = async (newName: string, newTheme: string) => {
    if (!db) return;

    await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('name', $1)", [newName]);
    await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', $1)", [newTheme]);

    setName(newName);
    setTheme(newTheme);
  };

  const saveProjectsRoot = async (path: string) => {
    if (!db) return;
    await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('projects_root_path', $1)", [path]);
    setProjectsRootPath(path);
    await syncAutoDiscoveredProjects(db, path);
  };

  const handleFinishFTUE = async () => {
    await saveSettings(tempName, tempTheme);
    setShowFTUE(false);
  };

  const createProject = async (projName: string, path: string, description: string) => {
    if (!db) return;
    const result = await db.execute("INSERT INTO projects (name, path, description) VALUES ($1, $2, $3)", [projName, path, description]);
    const newList = await db.select<Project[]>("SELECT * FROM projects");
    setProjects(newList);
    if (result.lastInsertId) {
      const newProj = newList.find(p => p.id === result.lastInsertId);
      if (newProj) await switchProject(newProj);
    }
  };

  const deleteProject = async (projectId: number) => {
    if (!db) return;
    await db.execute("DELETE FROM projects WHERE id = $1", [projectId]);
    if (activeProject?.id === projectId) {
      setActiveProject(null);
      await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_project_id', NULL)");
    }
    const newList = await db.select<Project[]>("SELECT * FROM projects");
    setProjects(newList);
  };

  const switchProject = async (project: Project) => {
    if (!db) return;
    await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_project_id', $1)", [project.id.toString()]);
    setActiveProject(project);
    setView("dashboard");
  };

  const openProjectFolder = async (path: string) => {
    try {
      await revealItemInDir(path);
    } catch (err) {
      console.error("Failed to open folder:", err);
    }
  };

  const renderFTUE = () => {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md px-4">
        <div className="card w-full max-w-lg bg-base-100 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
          <div className="card-body p-8">
            {ftueStep === 1 && (
              <div className="space-y-6 text-center py-4">
                <div className="text-5xl mb-4">🚀</div>
                <h2 className="card-title text-3xl font-bold justify-center">Welcome!</h2>
                <p className="text-lg opacity-80">Thanks for installing Workshop. Your own development tool.</p>
                <div className="card-actions justify-center pt-4">
                  <button className="btn btn-primary px-8" onClick={() => setFtueStep(2)}>Get Started</button>
                </div>
              </div>
            )}

            {ftueStep === 2 && (
              <div className="space-y-6 py-4">
                <h2 className="card-title text-2xl font-bold">What should we call you?</h2>
                <div className="form-control w-full">
                  <input
                    type="text"
                    placeholder="Enter your name"
                    className="input input-bordered input-lg w-full focus:input-primary transition-all"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="card-actions justify-end pt-4">
                  <button className="btn btn-ghost" onClick={() => setFtueStep(1)}>Back</button>
                  <button
                    className="btn btn-primary px-8"
                    disabled={!tempName.trim()}
                    onClick={() => setFtueStep(3)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {ftueStep === 3 && (
              <div className="space-y-6 py-4">
                <h2 className="card-title text-2xl font-bold">Choose your vibe</h2>
                <p className="text-sm opacity-60 m-0">You can always change your theme later in the settings.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto p-1 bg-base-200 rounded-lg">
                  {DAISY_THEMES.map((t) => (
                    <button
                      key={t}
                      className={`btn btn-sm capitalize ${tempTheme === t ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => {
                        setTempTheme(t);
                        setTheme(t); // Real-time preview
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="card-actions justify-end pt-4">
                  <button className="btn btn-ghost" onClick={() => setFtueStep(2)}>Back</button>
                  <button className="btn btn-primary px-8" onClick={() => setFtueStep(4)}>Next</button>
                </div>
              </div>
            )}

            {ftueStep === 4 && (
              <div className="space-y-6 text-center py-4">
                <div className="text-5xl mb-4">✨</div>
                <h2 className="card-title text-3xl font-bold justify-center">You're all set!</h2>
                <p className="text-lg opacity-80">Workshop is ready for you. Let's build something awesome.</p>
                <div className="card-actions justify-center pt-4">
                  <button className="btn btn-primary px-8" onClick={handleFinishFTUE}>Continue using the app</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-base-100 text-base-content overflow-hidden font-sans transition-all duration-500">
      {showFTUE && renderFTUE()}

      {/* Header */}
      <header className="navbar bg-base-300 min-h-12 h-12 shadow-md shrink-0 z-30 px-4">
        <div className="flex-none">
          <button
            className="btn btn-square btn-ghost btn-sm hover:bg-base-200"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              className={`inline-block w-5 h-5 stroke-current transition-transform duration-300 ${!isSidebarOpen ? 'rotate-180' : ''}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
          </button>
        </div>
        <div className="flex-1 px-2 mx-2 flex items-center gap-4">
          <span className="text-lg font-bold tracking-tight">Workshop</span>
          <div className="h-6 w-[1px] bg-base-content/10 mx-2"></div>
          {projects.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                className="select select-bordered select-xs h-8 bg-base-100/50"
                value={activeProject?.id || ""}
                onChange={(e) => {
                  const id = parseInt(e.target.value);
                  const p = projects.find(proj => proj.id === id);
                  if (p) switchProject(p);
                }}
              >
                {!activeProject && <option value="" disabled>Select Project</option>}
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">
        <aside
          className={`bg-base-200 border-r border-base-300 flex-shrink-0 transition-all duration-300 ease-in-out absolute md:relative z-20 h-full shadow-lg md:shadow-none overflow-hidden
            ${isSidebarOpen ? 'w-64 opacity-100' : 'w-0 opacity-0'}
          `}
        >
          <div className="w-64">
            <ul className="menu p-4 w-64 h-full text-base-content font-medium">
              <li className="menu-title text-opacity-40 uppercase text-[10px] font-bold tracking-widest mb-2">Workspace</li>
              <li>
                <a className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                  Dashboard
                </a>
              </li>
              <li>
                <a className={view === 'projects' ? 'active' : ''} onClick={() => setView('projects')}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  Projects
                </a>
              </li>
              {activeProject && (
                <li>
                  <a className={view === 'terminal' ? 'active' : 'flex items-center gap-2'} onClick={() => setView('terminal')}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Terminal
                  </a>
                </li>
              )}
              <li className="menu-title text-opacity-40 uppercase text-[10px] font-bold tracking-widest mb-2 mt-4">System</li>
              <li>
                <a className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Settings
                </a>
              </li>
            </ul>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto relative bg-base-100 p-8">
          <div className={`${view === 'dashboard' ? 'block' : 'hidden'}`}>
            <Dashboard name={name} activeProject={activeProject} openProjectFolder={openProjectFolder} setView={setView} dbError={dbError} defaultEditor={editors.find(e => e.id === defaultEditorId) || null} openInEditor={openInEditor} />
          </div>
          <div className={`${view === 'projects' ? 'block' : 'hidden'}`}>
            <Projects projects={projects} activeProject={activeProject} createProject={createProject} switchProject={switchProject} openProjectFolder={openProjectFolder} deleteProject={deleteProject} projectsRootPath={projectsRootPath} saveProjectsRoot={saveProjectsRoot} syncAutoDiscoveredProjects={syncAutoDiscoveredProjects} db={db} />
          </div>
          <div className={`${view === 'settings' ? 'block' : 'hidden'}`}>
            <Settings tempName={tempName} setTempName={setTempName} tempTheme={tempTheme} setTempTheme={setTempTheme} setTheme={setTheme} DAISY_THEMES={DAISY_THEMES} saveSettings={saveSettings} editors={editors} setEditors={setEditors} defaultEditorId={defaultEditorId} setDefaultEditorId={setDefaultEditorId} db={db} />
          </div>
          {activeProject && (
            <div className={`absolute inset-0 ${view === 'terminal' ? 'block' : 'hidden'}`}>
              <Terminal activeProject={activeProject} />
            </div>
          )}
        </main>

        {isSidebarOpen && (
          <div className="md:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-10" onClick={() => setIsSidebarOpen(false)}></div>
        )}
      </div>

      <footer className="footer px-4 py-1 bg-primary text-primary-content h-7 shrink-0 text-[10px] font-bold tracking-widest flex justify-between items-center z-30 shadow-inner">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 opacity-90"><div className="w-2 h-2 rounded-full bg-success"></div> connected</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{name ? `USER: ${name.toUpperCase()}` : 'GUEST'}</span>
          <span className="opacity-90 uppercase">v0.1.0</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
