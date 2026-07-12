// Копирует IIFE-сборку SDK платформы из монорепозитория gamehub в public/vendor/.
// Запуск: npm run sdk:sync [путь-к-репо-gamehub]
// Перед этим SDK должен быть собран: pnpm --filter @mygame/sdk build (в D:\dev\mygame)

import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mygameRepo = process.argv[2] || resolve(root, '..', 'mygame')
const src = resolve(mygameRepo, 'packages', 'sdk', 'dist', 'mygame-sdk.global.js')
const destDir = resolve(root, 'public', 'vendor')
const dest = resolve(destDir, 'mygame-sdk.global.js')

if (!existsSync(src)) {
  console.error(`[sdk:sync] Не найдено: ${src}`)
  console.error('[sdk:sync] Сначала соберите SDK в репозитории gamehub:')
  console.error('[sdk:sync]   cd ' + mygameRepo + ' && pnpm --filter @mygame/sdk build')
  process.exit(1)
}

mkdirSync(destDir, { recursive: true })
copyFileSync(src, dest)
console.log(`[sdk:sync] OK: ${src} -> ${dest}`)
