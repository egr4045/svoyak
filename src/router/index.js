import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import LobbyView from '../views/LobbyView.vue'
import GameView from '../views/GameView.vue'
import { useGameStore } from '../stores/game'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/lobby/:id',
      name: 'lobby',
      component: LobbyView,
      meta: { requiresAuth: true }
    },
    {
      path: '/game/:id',
      name: 'game',
      component: GameView,
      meta: { requiresAuth: true }
    }
  ]
})

// Navigation guard
router.beforeEach(async (to, from, next) => {
  const store = useGameStore();
  
  if (!store.user && store.token) {
    await store.fetchMe();
  }

  if (to.meta.requiresAuth && !store.user) {
    next({ name: 'home' });
  } else {
    next();
  }
})

export default router
