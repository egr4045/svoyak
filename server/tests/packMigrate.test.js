const { migratePack, migrateQuestion, LEGACY_TYPE_MAP } = require('../game/packMigrate');

describe('packMigrate', () => {
  describe('migrateQuestion: все 15 легаси-типов', () => {
    const cases = [
      ['text',       { type: 'quiz' }],
      ['media',      { type: 'quiz' }],
      ['text_input', { type: 'quiz', answerMode: 'written' }],
      ['glitch',     { type: 'quiz', glitch: true }],
      ['snippet',    { type: 'quiz', snippet: true }],
      ['auction',    { type: 'quiz', stake: 'auction' }],
      ['cat',        { type: 'quiz', stake: 'cat' }],
      ['poker',      { type: 'quiz', stake: 'auction' }], // покер удалён → ближайший аналог
      ['charades',   { type: 'show', showMode: 'charades' }],
      ['karaoke',    { type: 'show', showMode: 'karaoke' }],
      ['alias',      { type: 'show', showMode: 'alias' }],
      ['number',     { type: 'everyone', everyoneMode: 'number' }],
      ['tierlist',   { type: 'everyone', everyoneMode: 'tierlist' }],
      ['whosaid',    { type: 'everyone', everyoneMode: 'whosaid' }],
    ];

    test.each(cases)('%s → новый формат', (legacyType, expected) => {
      const q = { points: 100, type: legacyType, q: 'В?', a: 'О' };
      const out = migrateQuestion(q);
      expect(out).toMatchObject(expected);
      expect(out.points).toBe(100);
      expect(out.q).toBe('В?');
      expect(out.a).toBe('О');
    });

    test('карта покрывает ровно 14 легаси-id', () => {
      expect(Object.keys(LEGACY_TYPE_MAP)).toHaveLength(14);
    });

    test('исходный объект не мутируется', () => {
      const q = { points: 100, type: 'cat', q: 'В?', a: 'О' };
      migrateQuestion(q);
      expect(q.type).toBe('cat');
    });

    test('незнакомые поля сохраняются', () => {
      const q = { points: 100, type: 'auction', q: 'В?', a: 'О', customField: { deep: true }, answered: false };
      const out = migrateQuestion(q);
      expect(out.customField).toEqual({ deep: true });
      expect(out.answered).toBe(false);
    });

    test('легаси image нормализуется в mediaType/mediaSrc', () => {
      const out = migrateQuestion({ points: 100, type: 'media', q: 'Что на фото?', a: 'Пёс', image: '/assets/media/dog.jpg' });
      expect(out.mediaType).toBe('image');
      expect(out.mediaSrc).toBe('/assets/media/dog.jpg');
      expect(out.image).toBeUndefined();
    });

    test('image не перетирает уже заданные mediaType/mediaSrc', () => {
      const out = migrateQuestion({ type: 'media', image: '/old.jpg', mediaType: 'audio', mediaSrc: '/x.mp3' });
      expect(out.mediaType).toBe('audio');
      expect(out.mediaSrc).toBe('/x.mp3');
      expect(out.image).toBeUndefined();
    });

    test('новый формат проходит насквозь (passthrough)', () => {
      const q = { points: 200, type: 'quiz', stake: 'cat', q: 'В?', a: 'О' };
      expect(migrateQuestion(q)).toEqual(q);
      const s = { points: 200, type: 'show', showMode: 'alias', words: ['а'] };
      expect(migrateQuestion(s)).toEqual(s);
    });

    test('идемпотентность: migrate(migrate(x)) ≅ migrate(x)', () => {
      for (const legacyType of Object.keys(LEGACY_TYPE_MAP)) {
        const once = migrateQuestion({ points: 100, type: legacyType, q: 'В?', a: 'О', image: '/i.png' });
        expect(migrateQuestion(once)).toEqual(once);
      }
    });
  });

  describe('migratePack: формы данных', () => {
    const legacyRounds = [{
      name: 'Р1',
      categories: [{
        category: 'К',
        questions: [
          { points: 100, type: 'text', q: 'a', a: 'b' },
          { points: 200, type: 'poker', q: 'c', a: 'd' }
        ]
      }]
    }];

    test('голый массив раундов → массив, типы мигрированы', () => {
      const out = migratePack(legacyRounds);
      expect(Array.isArray(out)).toBe(true);
      expect(out[0].categories[0].questions[0].type).toBe('quiz');
      expect(out[0].categories[0].questions[1]).toMatchObject({ type: 'quiz', stake: 'auction' });
    });

    test('объект {rounds} → объект той же формы', () => {
      const out = migratePack({ rounds: legacyRounds, extra: 'x' });
      expect(out.extra).toBe('x');
      expect(out.rounds[0].categories[0].questions[0].type).toBe('quiz');
    });

    test('битые/пустые данные не роняют миграцию', () => {
      expect(migratePack(null)).toBeNull();
      expect(migratePack({})).toEqual({});
      expect(migratePack({ rounds: [null, { name: 'x' }, { categories: [null, { questions: null }] }] }).rounds).toHaveLength(3);
    });
  });
});
