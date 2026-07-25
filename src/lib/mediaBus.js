// Активный медиаэлемент текущего вопроса — вне реактивности Pinia (DOM-элементу
// нечего делать в reactive-обёртке). Ведущий читает currentTime как якорь для
// host:controlMedia; useSyncedMedia регистрирует/снимает элемент.
let activeEl = null

export function setActiveMediaEl(el) { activeEl = el }
export function clearActiveMediaEl(el) { if (activeEl === el) activeEl = null }
export function activeMediaTime() { return activeEl?.currentTime || 0 }
