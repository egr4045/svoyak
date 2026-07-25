// Постоянный слой миграции паков: старые id типов (19 шт.) → новая модель из 8 типов
// с модификаторами. Слой НЕ переходный: экспортированные ZIP со старыми id живут у
// пользователей вечно, поэтому маппинг применяется на каждом входе данных
// (создание комнаты, GET/PUT пака, импорт ZIP, бут-свип БД).
//
// Инварианты:
//  - идемпотентность: migrate(migrate(x)) ≅ migrate(x);
//  - незнакомые поля вопроса сохраняются (spread, никакой пересборки);
//  - легаси-поле image нормализуется в mediaType:'image' + mediaSrc.

const LEGACY_TYPE_MAP = {
  text:       q => ({ ...q, type: 'quiz' }),
  media:      q => ({ ...q, type: 'quiz' }),
  text_input: q => ({ ...q, type: 'quiz', answerMode: 'written' }),
  glitch:     q => ({ ...q, type: 'quiz', glitch: true }),
  snippet:    q => ({ ...q, type: 'quiz', snippet: true }),
  auction:    q => ({ ...q, type: 'quiz', stake: 'auction' }),
  cat:        q => ({ ...q, type: 'quiz', stake: 'cat' }),
  // Покер удалён как механика; ближайший эквивалент прежнего накала — ставка «аукцион»
  poker:      q => ({ ...q, type: 'quiz', stake: 'auction' }),
  charades:   q => ({ ...q, type: 'show', showMode: 'charades' }),
  karaoke:    q => ({ ...q, type: 'show', showMode: 'karaoke' }),
  alias:      q => ({ ...q, type: 'show', showMode: 'alias' }),
  number:     q => ({ ...q, type: 'everyone', everyoneMode: 'number' }),
  tierlist:   q => ({ ...q, type: 'everyone', everyoneMode: 'tierlist' }),
  whosaid:    q => ({ ...q, type: 'everyone', everyoneMode: 'whosaid' }),
};

function migrateQuestion(q) {
  if (!q || typeof q !== 'object') return q;
  let out = LEGACY_TYPE_MAP[q.type] ? LEGACY_TYPE_MAP[q.type](q) : { ...q };
  if (out.image) {
    out = { ...out, mediaType: out.mediaType || 'image', mediaSrc: out.mediaSrc || out.image };
    delete out.image;
  }
  return out;
}

function migrateRound(r) {
  if (!r || !Array.isArray(r.categories)) return r;
  return {
    ...r,
    categories: r.categories.map(c =>
      (!c || !Array.isArray(c.questions)) ? c : { ...c, questions: c.questions.map(migrateQuestion) }
    )
  };
}

// Принимает {rounds:[...]} или голый массив раундов — возвращает ту же форму.
function migratePack(data) {
  if (Array.isArray(data)) return data.map(migrateRound);
  if (data && Array.isArray(data.rounds)) return { ...data, rounds: data.rounds.map(migrateRound) };
  return data;
}

module.exports = { migratePack, migrateQuestion, LEGACY_TYPE_MAP };
