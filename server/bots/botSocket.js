// Фейковый сокет для бота.
//
// Зачем так, а не «драйвер зовёт GameState напрямую»: логика баззера живёт не в GameState,
// а инлайном в roomHandlers (отсчёт 3с, анти-чит-кламп, окно сбора 5с, buzzer_results 3.5с).
// Прогоняя ботов через настоящий handleRoomEvents, мы (а) не трогаем прод-хендлеры вообще,
// (б) заставляем бота проходить ровно тот же путь и те же гварды, что живого игрока — для
// ТЕСТОВОГО режима это и есть весь смысл. Поверхность сокета, которую использует
// roomHandlers, крошечная: id / on / join / emit / to.
function makeBotSocket(io, id) {
  const handlers = Object.create(null);
  return {
    id,
    handlers,
    on(ev, fn) { (handlers[ev] || (handlers[ev] = [])).push(fn); },
    // В настоящую io-комнату не вступаем: broadcast должен уходить только живым сокетам
    join() {},
    leave() {},
    // Боту нечего показывать — его «экран» это состояние комнаты, которое драйвер читает сам
    emit() {},
    // socket.to(room) в roomHandlers:31 рассылает всем КРОМЕ отправителя. Наш сокет в io-комнате
    // не состоит, поэтому io.to(room) даёт ровно то же множество получателей.
    to(room) { return io.to(room); },
    // Дёрнуть зарегистрированный обработчик так, будто событие пришло по сети
    fire(ev, ...args) {
      const list = handlers[ev];
      if (!list) return false;
      for (const fn of list) fn(...args);
      return true;
    }
  };
}

module.exports = { makeBotSocket };
