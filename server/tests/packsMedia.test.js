const { toPortable, fromPortable } = require('../routes/packs');

// Пак с медиа на верхнем уровне вопроса И во вложенных объектах тир-листа
function samplePack(packId) {
  return {
    rounds: [{
      name: 'R1',
      categories: [{
        category: 'Cat',
        questions: [
          { type: 'karaoke', points: 200, a: 'Песня', mediaSrc: `/packs-media/${packId}/song.mp3`, mediaType: 'audio' },
          { type: 'tierlist', points: 100, items: [
            { label: 'Пицца', mediaSrc: `/packs-media/${packId}/pizza.png`, mediaType: 'image' },
            { label: 'Суши' } // без медиа
          ] }
        ]
      }]
    }]
  };
}

describe('packs media portability (ZIP export/import)', () => {
  test('toPortable переводит и вопрос-медиа, и items[].mediaSrc в относительные', () => {
    const p = toPortable(samplePack('OLD'), 'OLD');
    const q = p.rounds[0].categories[0].questions;
    expect(q[0].mediaSrc).toBe('media/song.mp3');
    expect(q[1].items[0].mediaSrc).toBe('media/pizza.png'); // раньше оставался абсолютным (баг)
    expect(q[1].items[1].mediaSrc).toBeUndefined();
  });

  test('fromPortable раскрывает относительные в URL нового пака (включая items)', () => {
    const portable = toPortable(samplePack('OLD'), 'OLD');
    const restored = fromPortable(portable, 'NEW');
    const q = restored.rounds[0].categories[0].questions;
    expect(q[0].mediaSrc).toBe('/packs-media/NEW/song.mp3');
    expect(q[1].items[0].mediaSrc).toBe('/packs-media/NEW/pizza.png'); // картинка объекта не сломана
  });

  test('roundtrip export→import переносит все медиа-ссылки на новый id', () => {
    const restored = fromPortable(toPortable(samplePack('OLD'), 'OLD'), 'NEW');
    const json = JSON.stringify(restored);
    expect(json).not.toContain('/packs-media/OLD/'); // ни одной ссылки на старый пак
    expect((json.match(/\/packs-media\/NEW\//g) || []).length).toBe(2); // song + pizza
  });
});
