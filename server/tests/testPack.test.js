const GameState = require('../game/GameState');
const { getBuiltinPack, isBuiltinPackId, listBuiltinPacks } = require('../game/builtinPacks');

// «Тестовый» пак — витрина всех типов и вариантов. Он же ручной смоук, поэтому тут проверяем,
// что витрина не протухла: каждый вариант реально открывается движком и ни один не залипает
// на стартовом статусе. Если в тип добавили модификатор — тест напомнит внести его в пак.
describe('встроенный пак «Тестовый»', () => {
  const pack = getBuiltinPack('builtin:test');
  const rounds = pack.rounds;
  const allQuestions = rounds.flatMap(r => r.categories.flatMap(c => c.questions));

  const newGame = () => new GameState('TEST', { id: 'host', username: 'Host' }, { pack });
  const withPlayers = () => {
    const g = newGame();
    g.addPlayer({ id: 'p1', username: 'P1' });
    g.addPlayer({ id: 'p2', username: 'P2' });
    g.addPlayer({ id: 'p3', username: 'P3' });
    g.startGame();
    return g;
  };

  test('реестр отдаёт пак по builtin-id и не отдаёт по обычному', () => {
    expect(isBuiltinPackId('builtin:test')).toBe(true);
    expect(isBuiltinPackId('7dcfad4fe793f5d3')).toBe(false);
    expect(getBuiltinPack('builtin:нет-такого')).toBeNull();
    expect(getBuiltinPack('7dcfad4fe793f5d3')).toBeNull();
    expect(listBuiltinPacks()).toEqual([{ id: 'builtin:test', name: expect.stringContaining('Тестовый') }]);
  });

  test('покрыты все 8 типов', () => {
    const types = new Set(allQuestions.map(q => q.type));
    expect([...types].sort()).toEqual(
      ['among_us', 'everyone', 'potato', 'quiz', 'reaction', 'rps', 'show', 'sketch']
    );
  });

  test('покрыты все варианты каждого типа', () => {
    const has = (fn) => allQuestions.some(fn);
    // quiz: чистый, три вида медиа, письменный, глитч, два вида ставки, три вида фрагмента
    expect(has(q => q.type === 'quiz' && !q.mediaSrc && !q.glitch && !q.snippet && q.stake == null && q.answerMode == null)).toBe(true);
    ['image', 'audio', 'video'].forEach(m => {
      expect(has(q => q.type === 'quiz' && !q.snippet && q.mediaType === m)).toBe(true);
      expect(has(q => q.type === 'quiz' && q.snippet && q.mediaType === m)).toBe(true);
    });
    expect(has(q => q.type === 'quiz' && q.answerMode === 'written')).toBe(true);
    expect(has(q => q.type === 'quiz' && q.glitch === true)).toBe(true);
    ['auction', 'cat'].forEach(s => expect(has(q => q.type === 'quiz' && q.stake === s)).toBe(true));
    // show: три режима + караоке в обоих видах (с референсом и без)
    ['charades', 'karaoke', 'alias'].forEach(m => expect(has(q => q.type === 'show' && q.showMode === m)).toBe(true));
    expect(has(q => q.showMode === 'karaoke' && q.mediaSrc)).toBe(true);
    expect(has(q => q.showMode === 'karaoke' && !q.mediaSrc)).toBe(true);
    // everyone: три режима, все виды numberKind, тир-лист с картинками и без
    ['number', 'tierlist', 'whosaid'].forEach(m => expect(has(q => q.everyoneMode === m)).toBe(true));
    ['number', 'year', 'date'].forEach(k => expect(has(q => q.everyoneMode === 'number' && q.numberKind === k)).toBe(true));
    expect(has(q => q.everyoneMode === 'tierlist' && q.items.every(i => !i.mediaSrc))).toBe(true);
    expect(has(q => q.everyoneMode === 'tierlist' && q.items.every(i => i.mediaSrc))).toBe(true);
  });

  test('нет комбинаций, которые движок молча проглотит', () => {
    // Приоритетная цепочка QuizHandler.onSelect: младший модификатор просто не сработал бы
    allQuestions.forEach(q => {
      const at = `${q.type}/${q.points}`;
      if (q.stake && q.stake !== 'none') {
        expect(`${at}: stake+snippet`).toBe(q.snippet ? 'нельзя' : `${at}: stake+snippet`);
        expect(q.answerMode === 'written').toBe(false);
      }
      if (q.answerMode === 'written') expect(!!q.glitch).toBe(false);
      if (q.snippet) expect(!!q.mediaSrc).toBe(true); // без файла фрагмент проваливается в обычный вопрос
    });
  });

  test('обязательные поля на месте, номиналы в категории уникальны и растут', () => {
    rounds.forEach(r => r.categories.forEach(c => {
      const pts = c.questions.map(q => q.points);
      expect(new Set(pts).size).toBe(pts.length);
      expect([...pts].sort((a, b) => a - b)).toEqual(pts);
      c.questions.forEach(q => {
        if (['quiz', 'among_us'].includes(q.type)) { expect(q.a).toBeTruthy(); expect(q.q || q.mediaSrc).toBeTruthy(); }
        if (['sketch', 'potato'].includes(q.type)) expect(q.q).toBeTruthy();
        if (q.type === 'show' && q.showMode !== 'alias') expect(q.a).toBeTruthy();
        if (q.showMode === 'alias') {
          expect(q.words.filter(w => w && w.trim()).length).toBeGreaterThanOrEqual(3);
          expect(q.points % q.words.length).toBe(0); // очки делятся между словами без остатка
        }
        if (q.everyoneMode === 'tierlist') {
          expect(q.items.length).toBeGreaterThanOrEqual(2);
          expect(q.points % q.items.length).toBe(0);
          q.items.forEach(i => expect(i.label || i.mediaSrc).toBeTruthy());
        }
        if (q.everyoneMode === 'number') expect(q.a).toBeTruthy();
        if (q.numberKind === 'date') expect(/^\d{4}-\d{2}-\d{2}$/.test(q.a) && !Number.isNaN(Date.parse(q.a))).toBe(true);
        if (q.everyoneMode === 'whosaid') expect(q.q).toBeTruthy();
      });
    }));
  });

  test('каждый вопрос реально открывается и уходит со стартового статуса', () => {
    rounds.forEach((r, ri) => {
      const game = withPlayers();
      game.state.currentRoundIndex = ri;
      game.state.board = game.state.roundsData[ri].categories;
      game.state.board.forEach((cat, ci) => cat.questions.forEach((q, qi) => {
        const where = `${r.name} / ${cat.category} / ${q.points} (${q.type})`;
        expect(() => game.selectQuestion(ci, qi)).not.toThrow();
        expect(`${where}: ${game.state.questionStatus}`).not.toBe(`${where}: idle`);
        game.closeQuestion();
      }));
    });
  });

  test('встроенный пак не портится между комнатами', () => {
    // Он лежит в памяти процесса один на всех, в отличие от паков из БД. Если игра начнёт
    // мутировать его напрямую (а не свою копию roundsData), все следующие комнаты получат
    // доску с уже отвеченными вопросами — и это не воспроизведётся до рестарта сервера.
    const a = withPlayers();
    a.selectQuestion(0, 0);
    a.closeQuestion();
    expect(a.state.board[0].questions[0].answered).toBe(true);

    const b = withPlayers();
    expect(b.state.board[0].questions[0].answered).toBeFalsy();
    expect(getBuiltinPack('builtin:test').rounds[0].categories[0].questions[0].answered).toBeFalsy();

    // и после resetGame в первой комнате доска снова чистая
    a.resetGame();
    expect(a.state.roundsData[0].categories[0].questions[0].answered).toBeFalsy();
  });

  test('тексты полей описывают сами себя — иначе пак теряет смысл', () => {
    // Витрина обязана объяснять, какое поле куда попадает: у вопросов с текстом
    // в «q» должно упоминаться имя поля
    const withText = allQuestions.filter(q => typeof q.q === 'string' && q.q);
    expect(withText.length).toBeGreaterThan(15);
    withText.forEach(q => expect(q.q).toMatch(/«[a-zA-Z]|items\[|words\[/));
  });
});
