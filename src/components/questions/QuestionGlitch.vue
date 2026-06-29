<template>
  <div class="flex-1 flex flex-col items-center">
    <div class="mb-8 max-w-3xl mx-auto drop-shadow-lg w-full">
      <div class="min-h-[80px] flex items-center justify-center">
        <GlitchText :text="store.currentQuestion.q" 
                    :seed="store.glitchSeed" 
                    :isFinished="store.showAnswer" 
                    :isPaused="store.questionStatus !== 'buzzer_active' && store.questionStatus !== 'buzzer_countdown' || store.buzzerResults.length > 0" 
                    class="text-4xl md:text-5xl font-black leading-relaxed text-center" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { useGameStore } from '../../stores/game'
import GlitchText from '../GlitchText.vue'

const store = useGameStore()
</script>
