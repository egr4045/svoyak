<template>
  <div class="relative font-mono tracking-widest break-words flex flex-col items-center">
    <!-- Невидимый слой-заглушка: резервирует точное место, которое займет финальный текст -->
    <div class="invisible select-none pointer-events-none opacity-0" aria-hidden="true">
      {{ text }}
    </div>
    
    <!-- Видимый слой с глитч-эффектом -->
    <div class="absolute inset-0 h-full w-full transition-colors duration-300 flex justify-center text-center" 
         :class="{'text-emerald-400': isFinished, 'text-red-500': !isFinished}">
      {{ displayedText }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  text: String,
  seed: Number,
  isFinished: Boolean,
  isPaused: Boolean
})

const displayedText = ref('')
let flickerInterval = null
let revealInterval = null
let revealedCount = 0
let allIndices = []
let revealedIndices = []

function pseudoRandom(seed) {
  let x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

const glitchChars = '!<>-_\\/[]{}—=+*^?#_0101';

function updateText() {
  if (props.isFinished) {
    displayedText.value = props.text;
    if (flickerInterval) clearInterval(flickerInterval);
    return;
  }
  if (props.isPaused) return; // Заморозка анимации!
  
  let result = '';
  let localSeed = (props.seed || 123) + Math.floor(Date.now() / 50); 
  
  for (let i = 0; i < props.text.length; i++) {
    if (revealedIndices.includes(i) || props.text[i] === ' ') {
      result += props.text[i];
    } else {
      result += glitchChars[Math.floor(pseudoRandom(localSeed + i) * glitchChars.length)];
    }
  }
  displayedText.value = result;
}

onMounted(() => {
  revealedCount = 0;
  revealedIndices = [];
  allIndices = [];
  
  // Собираем индексы букв (исключая пробелы)
  for(let i=0; i<props.text.length; i++) {
    if (props.text[i] !== ' ') allIndices.push(i);
  }
  
  // Перемешиваем индексы псевдослучайно на основе seed
  let seedForShuffle = props.seed || 42;
  for (let i = allIndices.length - 1; i > 0; i--) {
    const j = Math.floor(pseudoRandom(seedForShuffle++) * (i + 1));
    [allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]];
  }

  displayedText.value = props.text.replace(/[^ ]/g, '#');
  flickerInterval = setInterval(updateText, 50);
  
  revealInterval = setInterval(() => {
    if (props.isFinished) {
      clearInterval(revealInterval);
      return;
    }
    if (props.isPaused) return; // Пауза раскрытия
    
    if (revealedCount < allIndices.length) {
      revealedIndices.push(allIndices[revealedCount]);
      revealedCount++;
    } else {
      clearInterval(revealInterval);
    }
  }, 300); // Скорость раскрытия
})

onUnmounted(() => {
  if (flickerInterval) clearInterval(flickerInterval);
  if (revealInterval) clearInterval(revealInterval);
})

watch(() => props.isFinished, (val) => {
  if (val) {
    displayedText.value = props.text;
    if (flickerInterval) clearInterval(flickerInterval);
    if (revealInterval) clearInterval(revealInterval);
  }
})
</script>
