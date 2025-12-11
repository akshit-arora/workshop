import { createRouter, createWebHistory } from 'vue-router'
import Projects from '../views/Projects.vue'
import Dashboard from '../views/Dashboard.vue'
import Database from '../views/Database.vue'
import Settings from '../views/Settings.vue'
import Tools from '../views/Tools.vue'
import LogManager from '../views/tools/LogManager.vue'
import JSONFormatter from '../views/tools/JSONFormatter.vue'
import MarkdownPreviewer from '../views/tools/MarkdownPreviewer.vue'
import SQLBeautifier from '../views/tools/SQLBeautifier.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: Dashboard
    },
    {
      path: '/projects',
      name: 'projects',
      component: Projects
    },
    {
      path: '/database',
      name: 'database',
      component: Database
    },
    {
      path: '/settings',
      name: 'settings',
      component: Settings
    },
    {
      path: '/tools',
      name: 'tools',
      component: Tools
    },
    {
      path: '/tools/json-formatter',
      name: 'json-formatter',
      component: JSONFormatter
    },
    {
      path: '/tools/markdown-previewer',
      name: 'markdown-previewer',
      component: MarkdownPreviewer
    },
    {
      path: '/tools/sql-beautifier',
      name: 'sql-beautifier',
      component: SQLBeautifier
    },
    {
      path: '/tools/log-manager',
      name: 'log-manager',
      component: LogManager
    }
  ]
})

export default router
