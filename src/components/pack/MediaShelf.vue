<template>
  <div class="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" @click.self="$emit('close')">
    <div class="panel-glass w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-black text-hub-accent text-lg">🗂 Медиа пака</h3>
        <button @click="$emit('close')" class="hub-btn text-xs">✕</button>
      </div>

      <p v-if="loading" class="text-hub-muted text-sm py-8 text-center">Загрузка…</p>
      <template v-else>
        <p v-if="err" class="text-hub-negative text-sm mb-3">{{ err }}</p>
        <p v-if="!files.length" class="text-hub-muted text-sm py-8 text-center">Медиафайлов пока нет — загрузите что-нибудь в любом вопросе.</p>
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div v-for="f in files" :key="f.name" class="border rounded-lg p-2 flex flex-col gap-1.5"
               :class="usedSet.has(f.name) ? 'border-hub-border' : 'border-dashed border-hub-warning/50'">
            <img v-if="isImage(f.name)" :src="f.url" class="h-16 w-full object-cover rounded bg-hub-deep" />
            <div v-else class="h-16 w-full flex items-center justify-center bg-hub-deep rounded text-2xl">{{ isAudio(f.name) ? '🎵' : '🎬' }}</div>
            <p class="text-[10px] text-hub-muted truncate" :title="f.name">{{ f.name }}</p>
            <p class="text-[10px]" :class="usedSet.has(f.name) ? 'text-hub-muted' : 'text-hub-warning'">
              {{ usedSet.has(f.name) ? 'используется' : 'не используется' }}
            </p>
            <button v-if="target" @click="pick(f)" class="hub-btn text-[10px] py-1">Использовать здесь</button>
          </div>
        </div>
        <div class="flex justify-between items-center flex-wrap gap-2">
          <span class="text-xs text-hub-muted">{{ orphans.length }} неиспользуемых файлов</span>
          <button v-if="orphans.length" @click="gc" :disabled="gcBusy" class="hub-btn text-xs !text-hub-negative disabled:opacity-50">
            {{ gcBusy ? 'Удаляем…' : '🧹 Удалить неиспользуемые' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { usePacksStore } from '../../stores/packs'

const props = defineProps({
  packId: { type: String, required: true },
  usedNames: { type: Array, default: () => [] },
  target: { type: Object, default: null } // если задан — показываем «Использовать здесь»
})
const emit = defineEmits(['close', 'pick', 'gc-done'])
const packs = usePacksStore()

const files = ref([])
const loading = ref(true)
const gcBusy = ref(false)
const err = ref('')

const usedSet = computed(() => new Set(props.usedNames))
const orphans = computed(() => files.value.filter(f => !usedSet.value.has(f.name)))

function isImage(n) { return /\.(png|jpe?g|gif|webp)$/i.test(n) }
function isAudio(n) { return /\.(mp3|wav)$/i.test(n) }
function mediaTypeOf(n) { return isImage(n) ? 'image' : isAudio(n) ? 'audio' : 'video' }

function pick(f) {
  if (!props.target) return
  props.target.mediaSrc = f.url
  props.target.mediaType = mediaTypeOf(f.name)
  emit('pick')
  emit('close')
}

async function gc() {
  gcBusy.value = true
  try {
    for (const f of orphans.value) { await packs.deleteMedia(props.packId, f.name) }
    await load()
    emit('gc-done')
  } catch (e) { err.value = e.message }
  finally { gcBusy.value = false }
}

async function load() {
  loading.value = true
  try { files.value = (await packs.listMedia(props.packId)).files || [] }
  catch (e) { err.value = e.message }
  finally { loading.value = false }
}
onMounted(load)
</script>
