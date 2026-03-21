# Workshop Project Overview

Workshop is a developer-focused tool built using **Tauri**, **React**, and **TypeScript**. It provides a dashboard for managing local projects, an integrated PTY terminal, and automated project type detection (e.g., identifying Laravel projects).

## Tech Stack

- **Backend:** Rust, Tauri v2
- **Frontend:** React 18, TypeScript, Vite
- **Styling:** Tailwind CSS, DaisyUI
- **Database:** SQLite (via Tauri SQL plugin)
- **Terminal:** `portable-pty` for PTY management, `xterm.js` for the frontend terminal UI

## Architecture

- **Backend (`src-tauri`):**
  - `lib.rs`: Main entry point where Tauri plugins and commands are registered.
  - `terminal.rs`: Handles PTY creation, reading, and writing for the terminal functionality.
  - `project.rs`: Manages project-specific metadata, including type detection (Laravel) and storage in a local `.workshop.json` file.
- **Frontend (`src`):**
  - `App.tsx`: Central application component managing routing (views), project state, and global layout.
  - `components/Terminal.tsx`: Terminal UI component utilizing `xterm.js`.
  - `index.html`: Entry point for the Vite-built React application.

## Building and Running

Alway check if the project is successfully compiling by running `cd src-tauri && cargo check`

### Prerequisites
- Node.js and npm
- Rust toolchain

### Development
```bash
# Run the application in development mode
npm run tauri dev
```

### Build
```bash
# Build the frontend and backend for production
npm run build
npm run tauri build
```

## Development Conventions

- **State Management:** The application uses React's `useState` and `useEffect` for local and semi-global state (e.g., active project).
- **Tauri Commands:** All backend interactions are performed via Tauri's `invoke` API. Commands are defined in Rust modules and registered in `lib.rs`.
- **Project Metadata:** Local project settings are stored in an SQLite database (`workshop.db`), while project-specific detection data is stored in a `.workshop.json` file within the project's own directory.
- **Styling:** DaisyUI themes are used for consistent look and feel, controlled via the `data-theme` attribute on the HTML element.
