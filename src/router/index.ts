import { createRouter, createWebHistory } from 'vue-router'
import Projects from '../views/Projects.vue'
import Dashboard from '../views/Dashboard.vue'
import Database from '../views/Database.vue'
import Settings from '../views/Settings.vue'

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
    }
  ]
})

export default router
