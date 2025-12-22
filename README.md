# Workshop

**Workshop** is a comprehensive Developer Experience (DevX) tool designed to streamline the workflow for Laravel developers and other projects. Built with performance and aesthetics in mind, it combines a robust Rust-based backend with a modern Vue 3 frontend to provide a suite of essential tools in a desktop application.

## Features

- 🚀 **Integrated Terminal**: Includes a fully functional terminal with support for pseudo-terminal (PTY) commands and optimized workflow for running Laravel Artisan commands.
- 🗄️ **Database Manager**: Connect to and query SQLite and MySQL databases. Features smart credential detection for Laravel projects and manual configuration for custom setups.
- 📝 **Markdown Previewer**: A dedicated tool for writing, editing, and previewing Markdown content in real-time.
- 💅 **SQL Beautifier**: Instantly format and beautify complex SQL queries for better readability.
- 🪵 **Log Manager**: specialized view for monitoring and managing application logs.
- 🎨 **Modern UI/UX**: Built with a "wow" factor in mind, featuring dynamic animations, glassmorphism, and multiple themes (Light, Dark, Cyberpunk, Retro, etc.).
- 🛠️ **Project Awareness**: Context-aware features that adapt based on the project you are working on.

## Tech Stack

### Frontend
- **Framework**: [Vue 3](https://vuejs.org/) (Script Setup) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) + [DaisyUI v5](https://daisyui.com/)
- **State Management**: [Pinia](https://pinia.vuejs.org/)
- **Routing**: [Vue Router](https://router.vuejs.org/)
- **Terminal**: [Xterm.js](https://xtermjs.org/)

### Backend (Desktop)
- **Framework**: [Tauri v2](https://tauri.app/) (Rust)
- **Database Drivers**: `rusqlite` (SQLite), `mysql` (MySQL)
- **System Integration**: `portable-pty` for terminal emulation, `dirs` for file system paths.

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (Latest LTS recommended)
- [Rust](https://www.rust-lang.org/tools/install) (required for building the Tauri backend)
- Package manager: `npm`, `pnpm`, or `yarn`

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd workshop
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in Development Mode**
   This command starts the Vite development server and launches the Tauri desktop window.
   ```bash
   npm run tauri dev
   ```

   *Note: If you only want to work on the UI without backend calls, you can run `npm run dev`, but Tauri-specific features will not function.*

## Building for Production

To build the optimized application bundle for your operating system (macOS, Linux, or Windows):

```bash
npm run tauri build
```

The output binaries will be located in `src-tauri/target/release/bundle/`.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/)
- **Extensions**:
  - [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (Vue 3 support)
  - [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
  - [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

This project is licensed under the [MIT License](LICENSE).
Copyright © 2025 [Akshit Arora](https://x.com/akshitarora0907).
