# 🚀 Workshop

**Workshop** is a modern, developer-focused dashboard built with **Tauri v2**, **React 18**, and **TypeScript**. It serves as a centralized hub for managing local projects, featuring integrated terminal management, database exploration, and automated project detection—specifically optimized for Laravel developers.

## ✨ Features

- **📂 Project Dashboard**: Easily manage and switch between local projects with auto-discovery and quick-access folders.
- **💻 Advanced Terminal**: Multi-tabbed terminal powered by `portable-pty` and `xterm.js`, with support for shell-specific commands.
- **🗄️ Database Viewer**: Explore SQLite and MySQL databases, run raw SQL queries, save frequently used searches, and edit records in-place.
- **🪵 Laravel Log Viewer**: Quickly view, search, and tail Laravel application logs without leaving the dashboard.
- **⚙️ Artisan Integration**: Specialized support for Laravel Artisan commands within the terminal.
- **🎨 Theming**: Customizable UI with 30+ themes powered by **DaisyUI**.
- **⚡ Fast & Secure**: Built on Tauri v2 for a lightweight footprint and maximum security.
- **🔄 Auto-Updater**: Built-in update manager to keep your workspace up-to-date.

## 🛠️ Tech Stack

- **Backend**: Rust, Tauri v2
- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, DaisyUI
- **Database**: SQLite (local config), SQLx (database connectivity)
- **Terminal**: `portable-pty`, `xterm.js`

## ⬇️ Downloads

Download the latest version for your platform from the [Releases](https://github.com/akshit-arora/workshop/releases) page.

- **Windows**: Download the `.exe` (installer) or `.msi`.
- **macOS**: Download the `.dmg` or `.app.tar.gz`. (Note: Since the app is unsigned, you will need to bypass the macOS quarantine).
- **Linux**: Download the `.AppImage` or `.deb`.

## 🚀 Installation & Usage

### 🍏 macOS (Unsigned App Bypass)
Because this application is not signed with an Apple Developer ID, macOS will block it from running. After moving the app to your `/Applications` folder, run the following command in your terminal to bypass the "app is damaged" or "developer cannot be verified" error:

```bash
sudo xattr -rd com.apple.quarantine /Applications/workshop.app
```

### 🪟 Windows
Simply run the `.exe` installer and follow the prompts.

### 🐧 Linux
For `.AppImage`, make it executable:
```bash
chmod +x workshop.AppImage
./workshop.AppImage
```

---

## 🛠️ Development Setup

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/) (stable)
- [Tauri Dependencies](https://tauri.app/v2/guides/getting-started/prerequisites)

### Local Development

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd Workshop
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start Development Server**:
   ```bash
   npm run tauri dev
   ```

## 🏗️ Build

To build the production-ready application for your platform:

```bash
npm run build
npm run tauri build
```

## 🧪 Testing

The project includes a comprehensive suite of Rust unit tests:

```bash
cd src-tauri
cargo test
```

## 📂 Project Structure

- `src/`: React frontend source code, components, and styling.
- `src-tauri/`: Rust backend, Tauri configuration, and native plugins.
- `src-tauri/src/`: Core backend logic (database, terminal, project detection).

---

Built with ❤️ for developers who love productivity.
