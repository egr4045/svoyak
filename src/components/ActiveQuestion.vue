<template>
  <div v-if="store.activeCell" class="absolute inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-slate-950/90 backdrop-blur-sm rounded-3xl">
    <div class="bg-slate-900 border border-blue-800/50 rounded-2xl p-4 md:p-6 max-w-4xl w-full shadow-2xl flex flex-col text-center relative max-h-[95vh] overflow-y-auto">
      
      <!-- Custom UI Alert -->
      <div v-if="customAlert" class="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-rose-600 border-2 border-rose-400 text-white font-bold px-8 py-4 rounded-2xl shadow-[0_0_30px_rgba(225,29,72,0.8)] animate-pulse transition-all">
          ⚠️ {{ customAlert }}
      </div>
      
      <!-- Confirm Reveal Dialog -->
      <div v-if="confirmRevealDialog" class="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
         <div class="bg-slate-900 border-2 border-rose-500 rounded-3xl p-8 max-w-lg w-full flex flex-col items-center text-center shadow-[0_0_50px_rgba(225,29,72,0.3)]">
            <h3 class="text-3xl font-black text-rose-500 mb-4 uppercase">Еще не все ответили!</h3>
            <p class="text-slate-300 text-lg mb-8">Часть игроков еще не успела отправить свой ответ. Вскрываем, лишая их шанса?</p>
            <div class="flex gap-4 w-full">
               <button @click="confirmRevealDialog = false" class="flex-1 py-4 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-bold transition border border-slate-700">Подождать</button>
               <button @click="confirmRevealDialog = false; store.revealTextAnswers()" class="flex-1 py-4 bg-rose-600 hover:bg-rose-500 rounded-xl text-white font-black transition shadow-[0_0_20px_rgba(225,29,72,0.5)] border border-rose-400">Вскрываем!</button>
            </div>
         </div>
      </div>

      <div class="inline-block px-4 py-1.5 rounded-lg bg-blue-950/50 text-blue-400 font-medium text-sm mb-6 border border-blue-800/50 mx-auto">
        {{ store.currentCategoryName }} — 
        <span class="text-yellow-500 font-bold">
          {{ store.activeBet !== null ? store.activeBet : store.currentQuestion.points }}
        </span>
        <span class="ml-2 px-2 py-0.5 bg-purple-900/50 text-purple-400 rounded text-xs border border-purple-800" v-if="store.currentQuestion.type === 'cat'">
          Кот в мешке
        </span>
        <span class="ml-2 px-2 py-0.5 bg-yellow-900/50 text-yellow-400 rounded text-xs border border-yellow-800" v-else-if="store.currentQuestion.type === 'auction'">
          Аукцион
        </span>
      </div>

      <h3 v-if="store.questionStatus === 'cat_target_selection' || store.questionStatus === 'cat_roulette'" class="text-4xl md:text-5xl font-black leading-relaxed text-purple-400 mb-8 max-w-3xl mx-auto animate-pulse drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]">
        🐈 КОТ В МЕШКЕ!
      </h3>
      <h3 v-else-if="store.questionStatus === 'auction_bidding'" class="text-4xl md:text-5xl font-black leading-relaxed text-yellow-400 mb-8 max-w-3xl mx-auto animate-pulse drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]">
        🔨 ВОПРОС-АУКЦИОН!
      </h3>
      <h3 v-else-if="store.questionStatus === 'poker_bidding'" class="text-4xl md:text-5xl font-black leading-relaxed text-yellow-500 mb-8 max-w-3xl mx-auto animate-pulse drop-shadow-[0_0_15px_rgba(245,158,11,0.5)] flex items-center justify-center gap-4">
        🃏 ВОПРОС-ПОКЕР
      </h3>

      <!-- Основной контент вопроса: показываем только если статус позволяет ИЛИ если это ведущий -->
      <template v-if="isHost || !['cat_target_selection', 'cat_roulette', 'auction_bidding'].includes(store.questionStatus)">
        <div v-if="store.currentQuestion.type === 'glitch'" class="mb-8 max-w-3xl mx-auto drop-shadow-lg w-full">
          <div class="min-h-[80px] flex items-center justify-center">
            <GlitchText :text="store.currentQuestion.q" :seed="store.glitchSeed" :isFinished="store.showAnswer" :isPaused="store.questionStatus !== 'buzzer_active' && store.questionStatus !== 'buzzer_countdown' || store.buzzerResults.length > 0" class="text-4xl md:text-5xl font-black leading-relaxed text-center" />
          </div>
        </div>
        <h3 v-else-if="store.currentQuestion.type === 'among_us' && store.imposterId === store.user?.id && store.questionStatus === 'text_inputting'" class="text-3xl md:text-4xl font-bold leading-relaxed text-slate-100 mb-8 max-w-3xl mx-auto drop-shadow-lg">
          <span class="text-rose-500 animate-pulse font-black text-5xl flex items-center justify-center gap-4 mb-4">🔪 ВЫ — ШПИОН!</span>
          <span class="text-2xl text-slate-300">Остальные видят вопрос.<br><br>Ваша задача: <span class="text-yellow-400">"{{ store.currentCategoryName }}"</span>.<br>Придумайте реалистичный ответ!</span>
        </h3>
        <!-- Медиа-контент (универсальный блок) -->
        <div v-else-if="store.currentQuestion?.mediaType || store.currentQuestion?.image" class="mb-8 w-full max-w-2xl mx-auto rounded-2xl overflow-hidden border-2 border-slate-700/50 bg-black/40 shadow-2xl relative group flex-shrink-0">
          <!-- Обычная картинка (может быть в любом вопросе) -->
          <img v-if="store.currentQuestion.image || store.currentQuestion.mediaType === 'image'" 
               :src="store.getAssetUrl(store.currentQuestion.image || store.currentQuestion.mediaSrc)" 
               class="w-full h-auto object-contain max-h-[40vh] transition-transform duration-500 group-hover:scale-[1.02]" />
          
          <!-- Видео (только для типа media) -->
          <div v-else-if="store.currentQuestion.mediaType === 'video'" class="w-full aspect-video flex flex-col items-center justify-center bg-slate-950">
            <video v-if="store.mediaState?.status === 'playing'" ref="videoPlayer" :src="store.getAssetUrl(store.currentQuestion.mediaSrc)" class="w-full h-full" autoplay></video>
            <div v-else class="flex flex-col items-center gap-4 text-slate-600">
               <Video class="w-16 h-16 opacity-30" />
               <span class="text-sm font-black uppercase tracking-[0.2em]">Видеоматериал</span>
               <p v-if="!isHost" class="text-xs italic opacity-50">Ждем запуска ведущим...</p>
            </div>
          </div>

          <!-- Аудио (только для типа media) -->
          <div v-else-if="store.currentQuestion.mediaType === 'audio'" class="w-full py-10 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950">
            <audio v-if="store.mediaState?.status === 'playing'" ref="audioPlayer" :src="store.getAssetUrl(store.currentQuestion.mediaSrc)" autoplay></audio>
            <div class="flex flex-col items-center gap-4">
               <div class="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20" :class="{'animate-pulse shadow-[0_0_30px_rgba(59,130,246,0.3)]': store.mediaState?.status === 'playing'}">
                  <Volume2 class="w-10 h-10 text-blue-500" />
               </div>
               <span class="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Аудиофрагмент</span>
            </div>
          </div>
        </div>

        <div v-else class="flex-1 flex flex-col justify-start items-center overflow-y-auto min-h-0 py-2 pb-6">
          <h3 v-if="store.currentQuestion.type === 'media'" 
              class="font-black leading-tight text-white italic opacity-80 max-w-4xl mx-auto"
              :class="isHost ? 'text-lg md:text-xl mb-2' : 'text-xl md:text-3xl mb-4'">
             {{ store.currentQuestion.q }}
          </h3>

          <div v-else-if="store.currentQuestion.type === 'glitch'">
            <!-- Текст вопроса скрыт, отображается только GlitchText выше (или заменяется на пустой блок здесь) -->
          </div>

          <h3 v-else 
              class="font-black leading-tight text-slate-100 max-w-4xl mx-auto drop-shadow-2xl overflow-hidden break-words hyphens-auto"
              :class="isHost ? 'text-lg md:text-2xl lg:text-3xl mb-4' : 'text-xl md:text-3xl lg:text-4xl mb-6'">
            {{ store.currentQuestion.q }}
          </h3>
        </div>
      </template>

      <!-- Обычный блок ввода ответов (text_input / text_inputting / text_judging) -->
      <div v-if="store.currentQuestion.type === 'text_input' || store.questionStatus === 'text_inputting' || store.questionStatus === 'text_judging'" class="w-full flex flex-col items-center">
        <div v-if="store.questionStatus === 'text_inputting'" class="w-full bg-slate-950/50 p-6 rounded-xl border border-slate-800 mb-8 max-w-2xl mx-auto">
          
          <!-- Для Ведущего: список игроков и статус -->
          <div v-if="isHost" class="flex flex-col gap-4">
            <h4 class="text-xl font-bold text-slate-300 mb-4">Ожидание ответов:</h4>
            <div class="flex gap-4 justify-center flex-wrap">
              <div v-for="player in store.players" :key="player.id" class="flex flex-col items-center gap-2 bg-slate-800/50 p-3 rounded-lg border border-slate-700 w-32 shadow-inner">
                <span class="text-sm font-bold text-slate-300">{{ player.name }}</span>
                <span v-if="store.textAnswers[player.id]" class="text-emerald-400 font-bold text-xs bg-emerald-900/30 border border-emerald-500/50 px-2 py-1 rounded">✔ ОТВЕТИЛ</span>
                <span v-else class="text-slate-500 text-xs font-bold animate-pulse">ПИШЕТ...</span>
              </div>
            </div>
            <button @click="requestRevealTextAnswers" class="mt-8 py-4 px-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black tracking-widest uppercase transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)] flex items-center justify-center gap-3 w-full hover:scale-[1.02]"><Eye class="w-6 h-6" /> ВСКРЫТЬ ОТВЕТЫ</button>
          </div>
          
          <!-- Для Игрока (право ответа) -->
          <div v-else-if="canIAnswer" class="flex flex-col items-center gap-6">
            <p class="text-slate-400 text-lg">Введите ваш ответ на вопрос:</p>
            <div v-if="store.textAnswers[store.user?.id]" class="w-full py-5 bg-emerald-900/40 border-2 border-emerald-500/50 text-emerald-400 rounded-xl text-xl font-bold text-center shadow-inner">
              Ответ отправлен! Ожидание ведущего...
            </div>
            <div v-else class="w-full relative group">
              <input type="text" v-model="myTextAnswer" @keydown.enter="submitMyAnswer" placeholder="Текст ответа..." class="w-full px-6 py-5 bg-slate-900 border-2 border-slate-600 rounded-xl text-white text-xl outline-none focus:border-blue-500 focus:shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all font-medium" />
              <button @click="submitMyAnswer" class="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 rounded-lg transition-colors text-lg">Отправить</button>
            </div>
          </div>

          <!-- Для Наблюдателя -->
          <div v-else class="text-slate-400 text-lg font-medium italic py-10 border border-slate-700 rounded-xl bg-slate-900/50 shadow-inner w-full">
            Игроки набирают ответы. Ожидайте...
          </div>

        </div>
        <div v-if="store.questionStatus === 'text_judging'" class="w-full mb-8">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div v-for="(answer, pId) in store.textAnswers" :key="pId" class="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col items-center">
              <span class="text-slate-400 text-sm mb-2 font-bold">{{ store.players.find(p => p.id == pId)?.name }}</span>
              <span class="text-xl font-bold text-white mb-4">"{{ answer }}"</span>
              <div v-if="isHost" class="flex gap-2 w-full">
                <button @click="store.judgeSingleTextAnswer(pId, true)" class="flex-1 py-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 rounded-lg"><Check class="w-5 h-5 mx-auto"/></button>
                <button @click="store.judgeSingleTextAnswer(pId, false)" class="flex-1 py-2 bg-rose-600/20 text-rose-400 hover:bg-rose-600 rounded-lg"><X class="w-5 h-5 mx-auto"/></button>
              </div>
            </div>
          </div>
          <div class="mt-8 flex justify-center gap-4">
            <button v-if="isHost && store.currentQuestion.type === 'among_us'" @click="store.startAmongUsTimer" class="py-3 px-8 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition shadow-[0_0_15px_rgba(225,29,72,0.5)]">Начать обсуждение (Таймер)</button>
            <button v-else-if="isHost" @click="store.closeQuestion" class="py-3 px-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300">Закрыть вопрос</button>
          </div>
        </div>
      </div>

      <!-- Аукцион: Слепые ставки -->
      <div v-else-if="store.questionStatus === 'auction_bidding'" class="w-full mb-8 flex flex-col items-center">
        <div v-if="!isHost" class="flex flex-col items-center gap-6 animate-in slide-in-from-bottom flex-1 w-full max-w-lg">
          <p class="text-slate-300 font-bold">Сделайте вашу ставку вслепую. Побеждает наибольшая!</p>
          <div v-if="store.auctionBets && store.auctionBets[store.user?.id] !== undefined" class="text-emerald-400 font-bold text-xl border border-emerald-500/50 bg-emerald-900/30 px-6 py-3 rounded-lg w-full text-center shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            Ставка принята! Ожидаем вскрытия...
          </div>
          <div v-else class="flex w-full gap-4 relative justify-center flex-col items-center">
             <!-- Пресеты ставок -->
             <div class="flex gap-2 w-full justify-center flex-wrap">
               <button v-for="preset in auctionPresets" :key="preset.label"
                 @click="myAuctionBet = preset.value"
                 class="px-4 py-2 rounded-xl text-sm font-bold border transition-all"
                 :class="myAuctionBet === preset.value ? 'bg-yellow-600 border-yellow-400 text-white shadow-[0_0_10px_rgba(202,138,4,0.5)]' : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-yellow-600 hover:text-yellow-400'"
               >{{ preset.label }}</button>
             </div>
             <div class="flex w-full gap-4 relative justify-center">
               <input type="number" v-model.number="myAuctionBet" :min="1" :max="auctionBetMax"
                 @input="myAuctionBet = Math.max(1, Math.min(auctionBetMax, myAuctionBet || 1))"
                 class="flex-1 max-w-[200px] text-center px-4 py-3 bg-slate-900 border-2 rounded-xl font-bold text-2xl outline-none transition-colors"
                 :class="isAuctionBetValid ? 'border-yellow-600 text-yellow-400 focus:border-yellow-400' : 'border-rose-600 text-rose-400 focus:border-rose-400'" />
               <button @click="submitMyAuctionBet_safe"
                 :disabled="!isAuctionBetValid"
                 class="px-6 py-3 font-bold rounded-xl transition-all"
                 :class="isAuctionBetValid ? 'bg-yellow-600 hover:bg-yellow-500 text-white shadow-[0_0_15px_rgba(202,138,4,0.4)] cursor-pointer' : 'bg-slate-700 text-slate-500 cursor-not-allowed'"
               >Поставить</button>
             </div>
             <div class="text-slate-400 text-sm italic">Баланс: <b class="text-white">{{ myBalance }}</b>. Макс. ставка: <span class="text-yellow-400 font-bold">{{ auctionBetMax }}</span></div>
          </div>
        </div>

        <div v-if="isHost" class="w-full flex flex-col items-center gap-6 mt-4">
          <p class="text-slate-400 font-bold mb-4">Ожидание ставок игроков...</p>
          <div class="flex gap-4 justify-center flex-wrap">
              <div v-for="player in store.players" :key="player.id" class="flex flex-col items-center gap-2 bg-slate-800/50 p-3 rounded-lg border border-slate-700 w-40 shadow-inner">
                <span class="text-sm font-bold text-slate-300">{{ player.name }}</span>
                <span v-if="store.auctionBets && store.auctionBets[player.id] !== undefined" class="text-emerald-400 font-bold text-xl">✔ СТАВКА</span>
                <span v-else class="text-slate-500 text-sm font-bold animate-pulse">ДУМАЕТ...</span>
              </div>
          </div>
          <button @click="handleRevealAuctionBets"
            :disabled="revealLoading"
            class="mt-8 py-4 px-12 rounded-xl text-white font-black tracking-widest uppercase transition-all"
            :class="revealLoading ? 'bg-slate-700 cursor-not-allowed text-slate-400' : 'bg-yellow-600 hover:bg-yellow-500 shadow-[0_0_20px_rgba(202,138,4,0.4)] cursor-pointer'"
          >
            <span v-if="revealLoading" class="flex items-center gap-3"><span class="inline-block w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span> Вскрываем...</span>
            <span v-else>Вскрыть ставки!</span>
          </button>
        </div>
      </div>

      <!-- Кот в мешке: Рулетка (запускается автоматически) -->
      <div v-else-if="store.questionStatus === 'cat_roulette'" class="w-full mb-8 flex flex-col items-center overflow-hidden">

        <div class="w-full max-w-2xl mt-4 relative bg-slate-950 p-6 rounded-2xl border-2 border-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.3)] overflow-hidden">
           <div class="text-center text-xl font-bold text-white mb-6 animate-pulse uppercase tracking-widest text-purple-400">Кому же достанется кот?</div>
           <div class="h-28 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden relative flex items-center justify-center">
              <div class="absolute left-1/2 top-0 bottom-0 w-1.5 bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,1)] z-10 -translate-x-1/2"></div>
              
              <div class="flex absolute top-0 bottom-0 left-1/2 items-center transition-transform duration-[3800ms] ease-[cubic-bezier(0.1,0,0,1)] gap-4" :style="{ transform: `translateX(${rouletteOffset}px)` }">
                 <div v-for="(p, idx) in rouletteItems" :key="idx" class="w-36 h-24 bg-slate-800 border-2 rounded-xl flex items-center justify-center flex-shrink-0 transition-all" :class="(idx === targetRouletteIdx && showCatWinner) ? 'border-yellow-500 text-yellow-400 bg-yellow-900/30 shadow-[0_0_20px_rgba(234,179,8,0.5)] z-20 scale-105' : 'border-slate-700 text-slate-300'">
                    <span class="text-xl font-bold px-2 truncate block text-center w-full">{{ p.name }}</span>
                 </div>
              </div>
           </div>
        </div>
      </div>

      <!-- Амогус Голосование -->
      <div v-else-if="store.questionStatus === 'among_us_voting'" class="w-full mb-8 flex flex-col items-center">
        <h4 class="text-4xl font-black text-rose-500 mb-6 flex items-center gap-3">ОБСУЖДЕНИЕ ШПИОНА</h4>
        
        <div class="text-7xl font-mono font-bold text-yellow-400 mb-8 tracking-widest drop-shadow-[0_0_20px_rgba(250,204,21,0.3)]">
          {{ formatTime(amongUsTimeLeft) }}
        </div>

        <div v-if="isHost" class="flex gap-4 mb-12">
          <button v-if="store.amongUsTimerState?.status === 'running'" @click="pauseTimer" class="py-3 px-8 bg-amber-600 hover:bg-amber-500 rounded-lg text-white font-bold transition">Пауза</button>
          <button v-else @click="resumeTimer" class="py-3 px-8 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-bold transition">Продолжить</button>
          <button @click="store.revealAmongUs" class="py-3 px-8 bg-rose-700 hover:bg-rose-500 rounded-lg text-white font-bold transition uppercase tracking-widest shadow-[0_0_20px_rgba(225,29,72,0.5)]">Вскрыть Роли!</button>
        </div>

        <!-- Показываем ответы, чтобы удобнее было обсуждать -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
            <div v-for="(answer, pId) in store.textAnswers" :key="pId" class="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col items-center relative min-h-[140px] transition-all" :class="{'border-rose-500 shadow-[0_0_15px_rgba(225,29,72,0.5)] bg-rose-950/20 scale-105 z-10': store.showAnswer && pId == store.imposterId, 'opacity-50': store.showAnswer && pId != store.imposterId}">
              <span class="text-slate-400 text-sm mb-2 font-bold">{{ store.players.find(p => p.id == pId)?.name }}</span>
              <span class="text-xl font-bold text-white text-center mb-4">"{{ answer }}"</span>
              
              <div v-if="store.showAnswer && pId == store.imposterId" class="mt-auto text-rose-500 font-bold uppercase text-xl animate-pulse drop-shadow-[0_0_10px_rgba(225,29,72,0.8)]">ШПИОН!</div>
              
              <!-- Кнопка голосования -->
              <button v-if="!isHost && !store.showAnswer && store.user?.id != pId && store.amongUsVotes[store.user?.id] != pId" @click="store.voteAmongUs(pId)" class="mt-auto py-2 px-4 rounded bg-slate-700 hover:bg-rose-600 hover:text-white transition-colors text-xs text-slate-300">Подозреваю его</button>
              <div v-if="!isHost && !store.showAnswer && store.amongUsVotes[store.user?.id] == pId" class="mt-auto py-2 px-4 rounded bg-rose-600 text-white font-bold text-xs uppercase animate-pulse shadow-[0_0_15px_rgba(225,29,72,0.5)] border border-rose-500">Ваш голос</div>
              
              <!-- Счетчик голосов -->
              <div v-if="Object.values(store.amongUsVotes || {}).filter(v => v == pId).length > 0" class="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-rose-600 border-2 border-slate-900 flex items-center justify-center text-white font-bold shadow-lg z-20">
                {{ Object.values(store.amongUsVotes || {}).filter(v => v == pId).length }}
              </div>
            </div>
        </div>
      </div>

      <!-- Покер-Торги -->
      <div v-else-if="store.questionStatus === 'poker_bidding'" class="w-full flex justify-center mb-8">
        <div class="bg-slate-900 border border-yellow-600 p-6 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col items-center">
          <h4 class="text-3xl font-black text-yellow-500 mb-4 flex items-center gap-3">КРУГ СТАВОК</h4>

          <!-- Вопрос виден всем во время ставок -->
          <div class="w-full bg-black/40 border border-yellow-600/30 rounded-xl px-5 py-4 mb-6 text-center">
            <p class="text-slate-400 text-xs uppercase tracking-widest mb-2 font-bold">Вопрос</p>
            <p class="text-white text-lg md:text-xl font-semibold leading-snug">{{ store.currentQuestion?.q }}</p>
          </div>

          <div class="flex flex-col gap-3 w-full mb-8">
            <div v-for="pId in store.pokerActivePlayers" :key="pId" class="flex justify-between items-center p-3 rounded-lg border transition-all duration-300" :class="store.pokerActivePlayers[store.pokerTurnIdx] === pId ? 'bg-amber-900/40 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'bg-slate-800 border-slate-700'">
              <span class="font-bold text-lg" :class="store.pokerActivePlayers[store.pokerTurnIdx] === pId ? 'text-amber-400' : 'text-slate-300'">{{ store.players.find(p=>p.id===pId)?.name }}</span>
              <div class="flex items-center gap-4">
                <span class="text-slate-400 text-sm" v-if="store.pokerPlayersActed?.includes(pId)">Сходил</span>
                <span class="font-mono text-xl text-yellow-500 font-bold bg-black/30 px-3 py-1 rounded">Ставка: {{ store.pokerBets[pId] || 0 }}</span>
              </div>
            </div>
          </div>

          <!-- Панель действий если мой ход -->
          <div v-if="!isHost && store.pokerActivePlayers[store.pokerTurnIdx] === store.user?.id" class="w-full animate-in slide-in-from-bottom-4 duration-500">
            <p class="text-center text-emerald-400 font-bold mb-4 animate-pulse">Ваш ход!</p>
            <div class="flex gap-4 mb-4">
              <button @click="store.pokerAction('fold')" class="flex-1 py-3 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-slate-300 font-bold transition-colors shadow-md">Пас</button>
              <button @click="store.pokerAction('call')" class="flex-1 py-3 bg-blue-600 hover:bg-blue-500 border border-blue-500 rounded-lg text-white font-bold transition-colors shadow-lg">Колл (сровнять до {{ store.pokerCurrentBet }})</button>
            </div>
            <!-- Пресеты покерного рейза -->
            <div class="flex gap-2 mb-3 flex-wrap justify-center">
              <button v-for="preset in pokerPresets" :key="preset.label"
                @click="pokerRaiseAmount = preset.value"
                class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all"
                :class="pokerRaiseAmount === preset.value ? 'bg-amber-600 border-amber-400 text-white' : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-amber-500 hover:text-amber-400'"
              >{{ preset.label }}</button>
            </div>
            <div class="flex gap-4 items-stretch h-14">
              <input type="number" v-model.number="pokerRaiseAmount" :min="1" :max="Math.max(store.currentQuestion.points, myBalance)" class="w-1/3 min-w-[100px] bg-slate-800 border border-slate-600 rounded-lg text-center font-mono text-xl text-yellow-400 focus:outline-none focus:border-amber-500" />
              <button @click="pokerRaise_safe" class="flex-1 bg-amber-600 hover:bg-amber-500 border border-amber-500 rounded-lg text-white font-bold transition-colors shadow-[0_0_15px_rgba(217,119,6,0.5)]">Колл + Рейз {{ pokerRaiseAmount }}</button>
            </div>
            <p class="text-xs text-slate-500 mt-3 text-center flex flex-col gap-1">
              <span>Ваш баланс: <b class="text-white">{{ myBalance }}</b>. Макс. общая ставка: <b class="text-amber-400 text-base">{{ Math.max(store.currentQuestion.points, myBalance) }}</b></span>
              <span>При рейзе вы ставите сумму текущей максимальной ставки + ваш шаг.</span>
            </p>
          </div>
          <div v-else-if="!isHost && store.pokerActivePlayers.includes(store.user?.id)" class="text-slate-500 text-center font-medium bg-black/20 p-4 rounded-lg w-full">
            Ожидайте своего хода...
          </div>
          <div v-else-if="!isHost" class="text-slate-600 text-center italic bg-black/20 p-4 rounded-lg w-full">
            Вы спасовали (или не участвуете). Наблюдайте за торгами.
          </div>
          <div v-if="isHost" class="text-slate-500 text-center italic bg-black/20 p-4 rounded-lg w-full">Ведущий наблюдает за торгами...</div>
        </div>
      </div>
      <!-- Скетч (Рисование) -->
      <div v-else-if="store.currentQuestion.type === 'sketch'" class="w-full flex flex-col items-center">
        <!-- Стадия рисования: если я игрок, показываем холст. Если ведущий - ждем. -->
        <div v-if="store.questionStatus === 'sketch_drawing'" class="w-full bg-slate-950/50 p-6 rounded-xl mb-8 flex flex-col items-center">
          <p v-if="isHost" class="text-slate-400 mb-4 animate-pulse">Игроки рисуют ответ (у них есть 20 секунд)...</p>
          <SketchCanvas v-else-if="!store.sketchAnswers[store.user?.id]" @submit="store.submitSketch" />
          <div v-else class="text-emerald-400 font-bold text-xl border border-emerald-500/50 bg-emerald-900/30 px-6 py-3 rounded-lg">Рисунок отправлен! Ожидаем остальных...</div>

          <!-- Ведущий или любой может вызвать досрочное вскрытие, если сервер примет, но лучше ведущий -->
          <button v-if="isHost" @click="store.revealSketches" class="mt-8 py-3 px-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg">Показать рисунки</button>
        </div>

        <!-- Стадия голосования / оценки -->
        <div v-if="store.questionStatus === 'sketch_judging'" class="w-full mb-8">
          <h4 class="text-2xl font-bold mb-4 text-center text-yellow-400">Голосование зрительских симпатий</h4>
          <div class="flex flex-wrap justify-center gap-6">
            <div v-for="(dataUrl, pId) in store.sketchAnswers" :key="pId" class="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col items-center w-64">
              <span class="text-slate-300 text-sm mb-2 font-bold">{{ store.players.find(p => p.id == pId)?.name }}</span>
              <img :src="dataUrl" class="w-48 h-48 bg-white border-2 border-slate-500 rounded-lg mb-4 object-contain" />
              
              <div class="w-full flex flex-col gap-2">
                <span class="text-center font-bold text-amber-500 bg-amber-900/30 py-1 rounded">Голосов: {{ Object.values(store.sketchVotes).filter(v => v == pId).length }}</span>
                <button v-if="!isHost && store.user?.id != pId && store.sketchVotes[store.user?.id] != pId" @click="store.voteSketch(pId)" class="w-full py-2 bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white rounded-lg transition text-sm">Голосовать</button>
                <div v-if="!isHost && store.sketchVotes[store.user?.id] == pId" class="w-full py-2 bg-emerald-600 border border-emerald-500 text-white rounded-lg text-center text-sm font-bold shadow-lg">Твой голос</div>
                <!-- Ведущий выдает награду -->
                <button v-if="isHost" @click="store.awardSketchWinner(pId)" class="w-full py-2 bg-amber-600/30 hover:bg-amber-600 border border-amber-600 text-amber-400 hover:text-white mt-2 rounded-lg font-bold text-sm shadow-lg">🎖 Наградить</button>
              </div>
            </div>
            <div v-if="Object.keys(store.sketchAnswers).length === 0" class="text-slate-500 italic">Никто ничего не нарисовал.</div>
          </div>
          <button v-if="isHost" @click="store.closeQuestion" class="mt-8 mx-auto block py-3 px-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300">Никто не заслужил</button>
        </div>
      </div>

      <!-- Блок баззера / чтения / ответа — рендерится для ЛЮБОГО типа вопроса (включая glitch) -->
      <div v-if="['reading','buzzer_countdown','buzzer_active','buzzer_results','answering'].includes(store.questionStatus)" class="w-full">
        
        <div class="mb-4 h-auto min-h-[48px] flex justify-center items-center w-full">
          <div v-if="store.questionStatus === 'reading'" class="text-slate-400 flex flex-col items-center gap-2 animate-pulse mt-4">
            <Mic class="w-8 h-8 text-blue-400 mb-2" /> 
            <span class="text-xl">Ведущий читает вопрос...</span>
            <span v-if="!isHost" class="text-sm text-slate-500 mt-2">Приготовьтесь! Скоро начнется отсчет.</span>
          </div>

          <div v-else-if="store.questionStatus === 'buzzer_countdown'" class="text-center w-full relative h-40 flex items-center justify-center">
             <div :key="countdownNumber" class="text-[12rem] font-black text-amber-500 absolute inset-0 flex items-center justify-center pointer-events-none drop-shadow-[0_0_50px_rgba(245,158,11,0.8)] animate-pulse" style="animation-duration: 1s;">
               {{ countdownNumber > 0 ? countdownNumber : 'ГОУ!' }}
             </div>
          </div>

          <div v-else-if="store.questionStatus === 'buzzer_active' && !isHost" @mousedown="handleScreenClick" class="absolute inset-0 z-50 rounded-3xl cursor-pointer flex flex-col justify-end items-center pb-8 group">
            <template v-if="myBuzzerResult">
              <div class="absolute inset-0 rounded-3xl border-4 border-emerald-500/50 bg-emerald-900/40 pointer-events-none"></div>
              <div class="text-3xl font-black text-emerald-400 bg-emerald-950/90 px-12 py-4 rounded-full border border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.5)] pointer-events-none text-center">
                ОТКЛИК ЗАРЕГИСТРИРОВАН!<br><span class="text-xl text-emerald-300 font-bold opacity-80 mt-2 block">Ваше время: {{ myBuzzerResult.time }} мс. Ожидайте...</span>
              </div>
            </template>
            <template v-else>
              <div class="absolute inset-0 rounded-3xl border-4 border-rose-500/50 animate-pulse bg-rose-900/10 shadow-[inset_0_0_50px_rgba(225,29,72,0.2)] pointer-events-none"></div>
              <div class="text-3xl font-black text-rose-400 bg-rose-950/80 px-12 py-4 rounded-full border border-rose-500 shadow-[0_0_30px_rgba(225,29,72,0.6)] group-hover:scale-105 transition-transform pointer-events-none">
                ВРЕМЯ ПОШЛО — ЖМИТЕ!
              </div>
            </template>
          </div>
          
          <div v-else-if="store.questionStatus === 'buzzer_active' && isHost" class="flex flex-col items-center gap-2 py-4">
             <div class="px-6 py-2 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-500 font-black animate-pulse flex items-center gap-2">
                <BellRing class="w-5 h-5" /> 🚨 БАЗЗЕР АКТИВЕН — ЖДЕМ ОТКЛИКА
             </div>
          </div>

          <div v-else-if="store.questionStatus === 'buzzer_results'" class="w-full flex flex-col items-center">
            <h4 class="text-3xl font-black text-emerald-400 mb-6 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]">Результаты реакции</h4>
            <div class="flex flex-col gap-3 w-full max-w-sm">
              <div v-for="(res, idx) in store.buzzerResults" :key="res.playerId" class="flex justify-between items-center p-3 rounded-xl border bg-slate-800" :class="idx === 0 ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] bg-emerald-900/40' : 'border-slate-700'">
                <div class="flex items-center gap-3">
                  <span class="text-2xl font-black" :class="idx === 0 ? 'text-emerald-400' : 'text-slate-500'">#{{ idx + 1 }}</span>
                  <span class="font-bold text-lg text-white">{{ store.players.find(p => p.id === res.playerId)?.name }}</span>
                </div>
                <span class="font-mono font-bold text-yellow-400 text-xl">{{ res.time }} мс</span>
              </div>
            </div>
          </div>

          <div v-else-if="store.questionStatus === 'cat_target_selection'" class="text-purple-400 flex items-center gap-2">Выбор жертвы для Кота...</div>
          <div v-else-if="store.questionStatus === 'auction_bidding'" class="text-yellow-400 flex items-center gap-2">Идут торги...</div>
          <div v-else-if="store.questionStatus === 'answering'" class="text-emerald-400 text-2xl font-black bg-emerald-900/30 px-6 py-2 rounded-full border border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            <span v-if="store.answeringPlayerId === store.user?.id">ВЫ ОТВЕЧАЕТЕ</span>
            <span v-else>ОТВЕЧАЕТ: {{ activePlayerName }}</span>
          </div>
        </div>
      </div>

      <!-- Фиксированная Панель Ведущего в нижней части -->
      <div v-if="isHost" class="mt-auto border-t border-slate-800 pt-3 flex flex-col items-center w-full relative flex-shrink-0">
        <div class="text-[10px] text-slate-500 uppercase tracking-widest mb-3 flex w-full justify-between items-center relative gap-4">
          <div class="flex-1 h-px bg-slate-800"></div>
          <span class="bg-slate-900 px-4 whitespace-nowrap">Управление Ведущего</span>
          <div class="flex-1 h-px bg-slate-800"></div>
        </div>
        
        <div class="flex gap-2 flex-wrap justify-center w-full mb-3">
          <!-- Кнопка Медиа (если есть аудио/видео) -->
          <button v-if="store.currentQuestion?.mediaType === 'audio' || store.currentQuestion?.mediaType === 'video'" 
                  @click="store.controlMedia({ status: store.mediaState?.status === 'playing' ? 'stopped' : 'playing' })" 
                  class="py-2 px-6 rounded-xl border transition-all flex items-center gap-2 text-sm"
                  :class="store.mediaState?.status === 'playing' ? 'bg-amber-600/20 border-amber-500 text-amber-500' : 'bg-blue-600 text-white border-blue-400 shadow-lg'">
            <Play v-if="store.mediaState?.status !== 'playing'" class="w-4 h-4" />
            <Square v-else class="w-4 h-4" />
            {{ store.mediaState?.status === 'playing' ? 'Стоп' : 'Старт медиа' }}
          </button>

          <button @click="store.showAnswer = !store.showAnswer" class="py-2 px-6 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all flex items-center gap-2 text-sm font-bold">
            <Eye v-if="!store.showAnswer" class="w-4 h-4" />
            <EyeOff v-else class="w-4 h-4" />
            {{ store.showAnswer ? 'Скрыть ответ' : 'Ответ' }}
          </button>
          
          <button v-if="store.questionStatus === 'reading'" @click="store.startBuzzer" class="py-2 px-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black transition-all shadow-lg flex items-center gap-2 text-sm">
            <Play class="w-4 h-4" /> Пуск таймера
          </button>
          
          <button v-if="store.questionStatus === 'answering'" @click="store.correctAnswer" class="py-2 px-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black transition-all shadow-lg flex items-center gap-2 text-sm">
            <Check class="w-4 h-4" /> Да
          </button>
          
          <button v-if="store.questionStatus === 'answering'" @click="store.wrongAnswer" class="py-2 px-8 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black transition-all shadow-lg flex items-center gap-2 text-sm">
            <X class="w-4 h-4" /> Нет
          </button>
          
          <button @click="store.closeQuestion" class="py-2 px-6 rounded-xl bg-slate-950 hover:bg-black text-rose-500 border border-rose-900/30 transition-all text-sm">
            Закрыть
          </button>
        </div>

        <!-- Дополнительные действия для текстовых вопросов -->
        <div v-if="store.questionStatus === 'text_inputting'" class="mb-4">
           <button @click="requestRevealTextAnswers" class="py-2 px-6 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600 hover:text-white transition-all text-xs font-bold uppercase tracking-wider">Вскрыть раньше времени</button>
        </div>
      </div>

      <Transition name="slide-up">
        <div v-show="store.showAnswer" class="mt-4 p-6 bg-slate-800/80 border-2 border-amber-500/30 rounded-2xl relative shadow-xl">
          <p class="text-xs font-black text-amber-500 uppercase tracking-widest mb-2 opacity-70">Правильный ответ:</p>
          <p class="text-3xl md:text-5xl font-black text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]">{{ store.currentQuestion.a }}</p>
        </div>
      </Transition>

    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '../stores/game'
import { Eye, EyeOff, Check, X, Play, Square, BellRing, Mic, Video, Volume2 } from 'lucide-vue-next'
import GlitchText from './GlitchText.vue'
import SketchCanvas from './SketchCanvas.vue'

const store = useGameStore()
const isHost = computed(() => store.host?.id === store.user?.id)

const myAuctionBet = ref(1)
const pokerRaiseAmount = ref(100)
const manualPlayerId = ref('')
const revealLoading = ref(false)
const confirmRevealDialog = ref(false)
const customAlert = ref('')
const videoPlayer = ref(null)
const audioPlayer = ref(null)

function requestRevealTextAnswers() {
  const allAnswered = store.players.every(p => store.textAnswers[p.id]);
  if (allAnswered) {
    store.revealTextAnswers();
  } else {
    confirmRevealDialog.value = true;
  }
}

const myBalance = computed(() => {
  return store.players.find(p => p.id === store.user?.id)?.score || 0
})

const auctionBetMax = computed(() => {
  return myBalance.value <= 0 ? store.currentQuestion.points : myBalance.value
})

const isAuctionBetValid = computed(() => {
  return myAuctionBet.value >= 1 && myAuctionBet.value <= auctionBetMax.value
})

const auctionPresets = computed(() => [
  { label: '25%', value: Math.max(1, Math.floor(auctionBetMax.value * 0.25)) },
  { label: '50%', value: Math.max(1, Math.floor(auctionBetMax.value * 0.5)) },
  { label: '75%', value: Math.max(1, Math.floor(auctionBetMax.value * 0.75)) },
  { label: '🔥 Ва-банк', value: auctionBetMax.value },
])

const pokerPresets = computed(() => {
  const myBet = store.pokerBets[store.user?.id] || 0
  const available = Math.max(1, myBalance.value - myBet)
  const min = Math.max(1, Math.floor((store.currentQuestion?.points || 100) / 5))
  return [
    { label: 'Мин', value: Math.min(available, min) },
    { label: '×2', value: Math.min(available, min * 2) },
    { label: '×5', value: Math.min(available, min * 5) },
    { label: '🔥 Ва-банк', value: available },
  ]
})

function handleRevealAuctionBets() {
  if (revealLoading.value) return
  revealLoading.value = true
  store.revealAuctionBets()
}

function submitMyAuctionBet_safe() {
  if (myAuctionBet.value > auctionBetMax.value) {
    showCustomAlert(`Ставка превышает допустимый баланс! Ваш лимит: ${auctionBetMax.value}`);
    return;
  }
  store.submitAuctionBet(myAuctionBet.value);
}

function pokerRaise_safe() {
  const maxAllowedTotal = Math.max(store.currentQuestion.points, myBalance.value);
  const currentMyBet = store.pokerBets[store.user?.id] || 0;
  const newTotal = store.pokerCurrentBet + pokerRaiseAmount.value;
  
  if (newTotal > maxAllowedTotal) {
    showCustomAlert(`Вашего баланса недостаточно! Макс. ставка: ${maxAllowedTotal}`);
    return;
  }
  if (pokerRaiseAmount.value <= 0) return;
  store.pokerAction('raise', pokerRaiseAmount.value)
}

function awardManual(isCorrect) {
  if (!manualPlayerId.value) return;
  const pts = store.activeBet !== null ? store.activeBet : store.currentQuestion.points;
  store.adjustScore(manualPlayerId.value, isCorrect ? pts : -pts);
  manualPlayerId.value = '';
}

watch(() => store.currentQuestion, (newQuestion) => {
  if (newQuestion) {
    pokerRaiseAmount.value = Math.max(1, Math.floor(newQuestion.points / 5))
  }
}, { immediate: true })

watch(() => store.questionStatus, (newStatus, oldStatus) => {
  // Сбрасываем лоадер вскрытия аукциона
  if (newStatus !== 'auction_bidding') {
    revealLoading.value = false
  }
  // Сбрасываем мою ставку при новом аукционе — половина номинала (не совпадает с пресетами)
  if (newStatus === 'auction_bidding' && oldStatus !== 'auction_bidding') {
    const mid = Math.max(1, Math.floor((store.currentQuestion?.points ?? 100) / 2))
    myAuctionBet.value = mid
  }
})

const submitMyAuctionBet = () => {
    if (myAuctionBet.value > 0) store.submitAuctionBet(myAuctionBet.value)
}

const rouletteItems = ref([])
const rouletteOffset = ref(0)
const targetRouletteIdx = ref(0)
const showCatWinner = ref(false)

watch(() => [store.questionStatus, store.catTargetId], ([newStatus, targetId]) => {
  if (newStatus === 'cat_roulette' && targetId) {
    const targetPlayer = store.players.find(p => p.id === targetId);
    if (!targetPlayer) return;
    
    const validPlayers = store.players.filter(p => p && p.name);
    let items = [];
    for(let i=0; i<40; i++) {
        items.push(validPlayers[i % validPlayers.length]);
    }
    items[32] = targetPlayer;
    rouletteItems.value = items;
    targetRouletteIdx.value = 32;
    
    showCatWinner.value = false;
    rouletteOffset.value = 300; 
    
    setTimeout(() => {
        const randomShift = Math.floor(Math.random() * 100) - 50;
        rouletteOffset.value = -5192 + randomShift;
        
        setTimeout(() => {
            showCatWinner.value = true;
        }, 3800);
    }, 50);
  }
}, { immediate: true })

const activePlayerName = computed(() => {
  if (!store.answeringPlayerId) return ''
  return store.players.find(p => p.id === store.answeringPlayerId)?.name || ''
})

const localBuzzerActiveTime = ref(0)
const countdownNumber = ref(3)
let countdownInterval = null

watch(() => store.questionStatus, (newStatus) => {
  if (newStatus === 'buzzer_active') {
    localBuzzerActiveTime.value = Date.now()
  }
  
  if (newStatus === 'buzzer_countdown') {
    countdownNumber.value = 3;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      countdownNumber.value--;
      if (countdownNumber.value <= 0) clearInterval(countdownInterval);
    }, 1000);
  } else {
    if (countdownInterval) clearInterval(countdownInterval);
  }
})

const myBuzzerResult = computed(() => {
  return store.buzzerResults?.find(r => r.playerId === store.user?.id)
})

const handleKeydown = (e) => {
  if (!isHost.value && e.code === 'Space' && store.questionStatus === 'buzzer_active' && !myBuzzerResult.value) {
    e.preventDefault();
    handleScreenClick();
  }
}

const handleScreenClick = () => {
  if (store.questionStatus === 'buzzer_active' && !isHost.value && !myBuzzerResult.value) {
    const reactionTime = Date.now() - localBuzzerActiveTime.value;
    store.pressBuzzer(reactionTime);
  }
}

const canIAnswer = computed(() => {
  if (isHost.value) return false;
  if (store.answeringPlayerId && store.answeringPlayerId !== store.user?.id) return false;
  
  // Для шпиона Амогуса (когда идет text_inputting)
  if (store.currentQuestion?.type === 'among_us' && store.questionStatus === 'text_inputting') return true;
  
  // Ограничение для покера и аукциона (отвечают только живые/победители)
  if (store.currentQuestion?.type === 'poker' && store.questionStatus === 'text_inputting' && !store.pokerActivePlayers.includes(store.user?.id)) return false;
  if (store.questionStatus === 'text_inputting' && store.auctionTiePlayers?.length > 0 && !store.auctionTiePlayers.includes(store.user?.id)) return false;
  
  return true;
})

const myTextAnswer = ref('')

const submitMyAnswer = () => {
  const text = myTextAnswer.value.trim()
  if (text) {
    store.submitTextAnswer(text)
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
// Локальная переменная для таймера Амогуса
const amongUsTimeLeft = ref(120);
let localTimerInterval = null;

watch(() => store.amongUsTimerState, (newState) => {
  if (localTimerInterval) clearInterval(localTimerInterval);
  if (!newState) {
    amongUsTimeLeft.value = 120;
    return;
  }

  if (newState.status === 'paused') {
    amongUsTimeLeft.value = newState.timeLeft;
  } else if (newState.status === 'running') {
    const update = () => {
      const msLeft = newState.endsAt - Date.now();
      if (msLeft <= 0) {
        amongUsTimeLeft.value = 0;
        clearInterval(localTimerInterval);
      } else {
        amongUsTimeLeft.value = Math.ceil(msLeft / 1000);
      }
    };
    update();
    localTimerInterval = setInterval(update, 200);
  }
}, { immediate: true, deep: true })

onUnmounted(() => {
  if (localTimerInterval) clearInterval(localTimerInterval);
  window.removeEventListener('keydown', handleKeydown);
})

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const pauseTimer = () => store.pauseAmongUsTimer(amongUsTimeLeft.value);
const resumeTimer = () => store.resumeAmongUsTimer(amongUsTimeLeft.value);
</script>

<style scoped>
/* Прячем стрелочки в input type="number" */
input[type=number]::-webkit-inner-spin-button, 
input[type=number]::-webkit-outer-spin-button { 
  -webkit-appearance: none; 
  margin: 0; 
}
input[type=number] {
  -moz-appearance: textfield;
  appearance: textfield;
}
</style>