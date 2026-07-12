import { defineStore } from 'pinia'
import { useGameStore } from './game'

// Стор паков вопросов: CRUD + загрузка медиа + экспорт/импорт ZIP.
// Все запросы под платформенной сессией (Bearer из game-стора).

export const usePacksStore = defineStore('packs', {
  state: () => ({
    packs: [],       // мета: { id, name, createdAt, expiresAt }
    loading: false
  }),

  actions: {
    _headers(json = true) {
      const game = useGameStore()
      return {
        ...(json ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${game.token}`
      }
    },
    _base() { return `${useGameStore().API_URL}/api/packs` },

    async fetchPacks() {
      this.loading = true
      try {
        const res = await fetch(this._base(), { headers: this._headers(false) })
        if (res.ok) this.packs = (await res.json()).packs || []
      } finally { this.loading = false }
    },

    async getPack(id) {
      const res = await fetch(`${this._base()}/${id}`, { headers: this._headers(false) })
      if (!res.ok) throw new Error('Пак не найден')
      return res.json() // { id, name, createdAt, expiresAt, data }
    },

    async createPack(name, data) {
      const res = await fetch(this._base(), {
        method: 'POST', headers: this._headers(), body: JSON.stringify({ name, data })
      })
      if (!res.ok) throw new Error('Не удалось создать пак')
      const pack = await res.json()
      await this.fetchPacks()
      return pack
    },

    async updatePack(id, name, data) {
      const res = await fetch(`${this._base()}/${id}`, {
        method: 'PUT', headers: this._headers(), body: JSON.stringify({ name, data })
      })
      if (!res.ok) throw new Error('Не удалось сохранить пак')
      await this.fetchPacks()
    },

    async deletePack(id) {
      const res = await fetch(`${this._base()}/${id}`, { method: 'DELETE', headers: this._headers(false) })
      if (!res.ok) throw new Error('Не удалось удалить пак')
      await this.fetchPacks()
    },

    // dataUrl (base64) файла → сохранённый на сервере URL медиа
    async uploadMedia(packId, dataUrl) {
      const res = await fetch(`${this._base()}/${packId}/media`, {
        method: 'POST', headers: this._headers(), body: JSON.stringify({ dataUrl })
      })
      if (!res.ok) {
        let msg = 'Ошибка загрузки медиа'
        try { msg = (await res.json()).error || msg } catch { /* ок */ }
        throw new Error(msg)
      }
      return (await res.json()).url
    },

    // Скачать ZIP пака
    async exportPack(id, name) {
      const res = await fetch(`${this._base()}/${id}/export`, { headers: this._headers(false) })
      if (!res.ok) throw new Error('Не удалось выгрузить пак')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(name || 'pack').replace(/[^\wа-яё\- ]/gi, '_')}.zip`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    },

    // Импорт ZIP (File) → новый пак
    async importPack(file) {
      const zipBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = reject
        reader.onload = () => resolve(String(reader.result).split(',')[1]) // без data:...;base64,
        reader.readAsDataURL(file)
      })
      const res = await fetch(`${this._base()}/import`, {
        method: 'POST', headers: this._headers(), body: JSON.stringify({ zipBase64 })
      })
      if (!res.ok) {
        let msg = 'Не удалось импортировать'
        try { msg = (await res.json()).error || msg } catch { /* ок */ }
        throw new Error(msg)
      }
      await this.fetchPacks()
      return res.json()
    }
  }
})
