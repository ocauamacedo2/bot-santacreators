import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const FILE = path.resolve(
  process.cwd(),
  'data',
  'hall-org-periods.json'
);

const CITY_KEYS = [
  'nobre',
  'santa',
  'grande',
  'maresia',
];

const clock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });

const copy = value =>
  JSON.parse(JSON.stringify(value));

export function parseOrgCutoffDate(value) {
  const text = String(value || '').trim();

  const br = text.match(
    /^(\d{2})\/(\d{2})\/(\d{4})$/
  );

  const iso = text.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!br && !iso) {
    throw fail(
      'Use uma data no formato DD/MM/AAAA ou AAAA-MM-DD.'
    );
  }

  const [year, month, day] = br
    ? [
        Number(br[3]),
        Number(br[2]),
        Number(br[1]),
      ]
    : [
        Number(iso[1]),
        Number(iso[2]),
        Number(iso[3]),
      ];

  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);

  if (
    year < 1970 ||
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw fail(
      'Essa data não existe. Confira o dia, o mês e o ano.'
    );
  }

  let startAt = utc + 3 * 60 * 60 * 1000;
  let firstOnDate = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    const p = Object.fromEntries(
      clock.formatToParts(startAt).map(part => [
        part.type,
        part.value,
      ])
    );

    const local = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second)
    );

    if (
      Number(p.year) === year &&
      Number(p.month) === month &&
      Number(p.day) === day
    ) {
      firstOnDate = firstOnDate === null
        ? startAt
        : Math.min(firstOnDate, startAt);
    }

    if (local === utc) break;

    startAt += utc - local;
  }

  if (firstOnDate === null) {
    throw fail(
      'Não foi possível converter essa data para o horário de São Paulo.'
    );
  }

  return {
    dateKey:
      `${year}-` +
      `${String(month).padStart(2, '0')}-` +
      `${String(day).padStart(2, '0')}`,

    startAt: firstOnDate,
  };
}

export function hallVictoryTimestamp(hall = {}) {
  for (const value of [
    hall.historicalVictoryTimestamp,
    hall.paymentEventTimestamp,
    hall.eventTimestamp,
    hall.at,
  ]) {
    const n = Number(value);

    if (Number.isFinite(n) && n > 0) {
      return n < 100000000000
        ? n * 1000
        : n;
    }

    if (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T/.test(value)
    ) {
      const parsed = Date.parse(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  if (hall.eventDateKey) {
    try {
      return parseOrgCutoffDate(
        hall.eventDateKey
      ).startAt;
    } catch {}
  }

  for (const value of [
    hall.createdTimestamp,
    hall.createdAt,
  ]) {
    const n = Number(value);

    if (Number.isFinite(n) && n > 0) {
      return n < 100000000000
        ? n * 1000
        : n;
    }

    const parsed = typeof value === 'string'
      ? Date.parse(value)
      : NaN;

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export function readOrgPeriods() {
  if (!fs.existsSync(FILE)) {
    return {
      version: 1,
      resets: [],
    };
  }

  const state = JSON.parse(
    fs.readFileSync(FILE, 'utf8')
  );

  if (
    !state ||
    state.version !== 1 ||
    !Array.isArray(state.resets) ||
    state.resets.some(reset =>
      !reset ||
      !CITY_KEYS.includes(reset.cityKey) ||
      !Number.isFinite(reset.cutoffAt) ||
      reset.cutoffAt <= 0
    )
  ) {
    throw fail(
      'O histórico de cortes das ORGs está inválido. Nenhum corte foi aplicado.',
      503
    );
  }

  return state;
}

function cityFor(hall, record) {
  return hall.cityKey ||
    record.cityKey ||
    'nobre';
}

function cutoffs(state) {
  const result = {};

  for (const reset of state.resets) {
    result[reset.cityKey] = Math.max(
      result[reset.cityKey] || 0,
      reset.cutoffAt
    );
  }

  return result;
}

function fromHalls(record, halls, normalizeEvent) {
  const item = {
    ...copy(record),
    halls: copy(halls),
    total: halls.length,
    events: {},
  };

  for (const hall of halls) {
    const name = normalizeEvent(
      hall.eventName || 'Evento',
      cityFor(hall, record)
    );

    item.events[name] =
      (item.events[name] || 0) + 1;
  }

  return item;
}

export function currentOrgItems(
  rankings,
  normalizeEvent,
  state = readOrgPeriods()
) {
  const limits = cutoffs(state);

  return Object.values(rankings.orgs || {})
    .filter(Boolean)
    .map(record => {
      const halls = Array.isArray(record.halls)
        ? record.halls
        : [];

      const removed = halls.filter(hall => {
        const at = hallVictoryTimestamp(hall);

        return at > 0 &&
          at < (
            limits[cityFor(hall, record)] || 0
          );
      });

      if (!removed.length) {
        return copy(record);
      }

      const kept = halls.filter(
        hall => !removed.includes(hall)
      );

      const next = {
        ...copy(record),

        halls: copy(kept),

        total: Math.max(
          0,
          Number(record.total ?? halls.length) -
            removed.length
        ),

        events: {
          ...record.events,
        },
      };

      for (const hall of removed) {
        const name = normalizeEvent(
          hall.eventName || 'Evento',
          cityFor(hall, record)
        );

        if (typeof next.events[name] === 'number') {
          next.events[name] = Math.max(
            0,
            next.events[name] - 1
          );
        }
      }

      return next;
    })
    .filter(
      item => Number(item.total || 0) > 0
    );
}

export function orgSeasonItems(
  rankings,
  normalizeEvent,
  state = readOrgPeriods()
) {
  const result = [];

  for (const cityKey of CITY_KEYS) {
    const changes = state.resets
      .filter(
        reset => reset.cityKey === cityKey
      )
      .sort(
        (a, b) => a.cutoffAt - b.cutoffAt
      );

    const starts = [
      {
        id: `initial:${cityKey}`,
        cutoffAt: 0,
      },
      ...changes,
    ];

    for (
      let index = 0;
      index < starts.length;
      index++
    ) {
      const start = starts[index];

      const endAt =
        starts[index + 1]?.cutoffAt || null;

      const items = Object.values(
        rankings.orgs || {}
      )
        .filter(Boolean)
        .map(record => {
          const halls = (
            Array.isArray(record.halls)
              ? record.halls
              : []
          ).filter(hall => {
            const at = hallVictoryTimestamp(hall);

            return cityFor(hall, record) === cityKey &&
              at > 0 &&
              at >= start.cutoffAt &&
              (!endAt || at < endAt);
          });

          return {
            ...fromHalls(
              record,
              halls,
              normalizeEvent
            ),
            cityKey,
          };
        })
        .filter(
          item => item.total > 0
        );

      result.push({
        id: start.id,
        cityKey,
        number: index + 1,
        startAt: start.cutoffAt || null,
        endAt,
        current: !endAt,
        items,
      });
    }
  }

  return result;
}

function revision(rankings, state) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        orgs: rankings.orgs || {},
        periods: state,
      })
    )
    .digest('hex');
}

export function createOrgResetPreview(
  rankings,
  {
    cityKey,
    date,
    actorId,
    guildId,
  },
  normalizeEvent
) {
  cityKey = String(cityKey || '')
    .trim()
    .toLowerCase()
    .replace(/^cidade\s+/, '');

  if (!CITY_KEYS.includes(cityKey)) {
    throw fail(
      'Cidade inválida. Use Nobre, Santa, Grande ou Maresia.'
    );
  }

  const {
    dateKey,
    startAt,
  } = parseOrgCutoffDate(date);

  if (startAt > Date.now()) {
    throw fail(
      'A data do corte não pode estar no futuro.'
    );
  }

  const state = readOrgPeriods();
  const previous = cutoffs(state)[cityKey] || 0;

  if (startAt <= previous) {
    throw fail(
      'Essa cidade já possui um corte igual ou posterior. Informe uma data posterior ao corte existente.'
    );
  }

  const unknown = [];

  for (
    const record
    of Object.values(rankings.orgs || {})
      .filter(Boolean)
  ) {
    const halls = Array.isArray(record.halls)
      ? record.halls
      : [];

    const related =
      record.cityKey === cityKey ||
      halls.some(
        hall => cityFor(hall, record) === cityKey
      );

    if (
      related &&
      (
        Number(record.total ?? halls.length) !==
          halls.length ||
        halls.some(
          hall =>
            cityFor(hall, record) === cityKey &&
            !hallVictoryTimestamp(hall)
        )
      )
    ) {
      unknown.push(
        record.name ||
        record.key ||
        'ORG sem nome'
      );
    }
  }

  if (unknown.length) {
    throw fail(
      `Não é seguro cortar por data: ${unknown.length} ORG(s) possuem contagem sem histórico completo ou vitória sem data. Confira: ${unknown.slice(0, 5).join(', ')}. O histórico geral foi preservado.`,
      409
    );
  }

  const active = currentOrgItems(
    rankings,
    normalizeEvent,
    state
  );

  const removed = [];
  const kept = [];

  for (const record of active) {
    for (const hall of record.halls || []) {
      if (cityFor(hall, record) !== cityKey) {
        continue;
      }

      const at = hallVictoryTimestamp(hall);

      const sample = {
        org:
          record.name ||
          record.key ||
          'ORG',

        at,

        event:
          hall.eventName ||
          'Evento',

        messageId:
          String(hall.messageId || ''),

        url:
          hall.jumpUrl || '',
      };

      if (
        !sample.url &&
        /^\d{17,20}$/.test(
          String(hall.messageId || '')
        ) &&
        /^\d{17,20}$/.test(
          String(hall.channelId || '')
        )
      ) {
        sample.url =
          `https://discord.com/channels/` +
          `${guildId}/` +
          `${hall.channelId}/` +
          `${hall.messageId}`;
      }

      (
        at < startAt
          ? removed
          : kept
      ).push(sample);
    }
  }

  if (!removed.length) {
    throw fail(
      'Nenhuma vitória ativa anterior a essa data seria retirada do painel. Nenhum corte foi aplicado.'
    );
  }

  const uniqueExamples = (rows, ascending) =>
    [
      ...new Map(
        rows
          .sort(
            (a, b) =>
              ascending
                ? a.at - b.at
                : b.at - a.at
          )
          .map(row => [
            `${row.url || ''}:${row.at}:${row.org}`,
            row,
          ])
      ).values(),
    ].slice(0, 3);

  return {
    id: randomUUID(),
    cityKey,
    dateKey,
    cutoffAt: startAt,
    actorId: String(actorId),
    guildId: String(guildId),
    revision: revision(rankings, state),
    expiresAt: Date.now() + 120000,
    previousCutoffAt: previous || null,
    removedWins: removed.length,
    keptWins: kept.length,
    removedExamples: uniqueExamples(
      removed,
      false
    ),
    keptExamples: uniqueExamples(
      kept,
      true
    ),
  };
}

export function applyOrgResetPreview(
  rankings,
  preview,
  actorId
) {
  if (
    !preview ||
    preview.expiresAt < Date.now()
  ) {
    throw fail(
      'A prévia expirou. Gere outra antes de confirmar.',
      409
    );
  }

  if (String(actorId) !== preview.actorId) {
    throw fail(
      'Somente quem abriu a prévia pode confirmar.',
      403
    );
  }

  const before = readOrgPeriods();

  if (
    revision(rankings, before) !==
      preview.revision
  ) {
    throw fail(
      'O ranking mudou depois da prévia. Gere outra para conferir os dados atuais.',
      409
    );
  }

  const after = copy(before);

  after.resets.push({
    id: preview.id,
    cityKey: preview.cityKey,
    dateKey: preview.dateKey,
    cutoffAt: preview.cutoffAt,
    decidedAt: Date.now(),
    actorId: String(actorId),
    guildId: preview.guildId,
  });

  fs.mkdirSync(
    path.dirname(FILE),
    { recursive: true }
  );

  const temporary =
    `${FILE}.${randomUUID()}.tmp`;

  try {
    fs.writeFileSync(
      temporary,
      JSON.stringify(after, null, 2),
      { flag: 'wx' }
    );

    fs.renameSync(temporary, FILE);
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch {}

    throw error;
  }

  return {
    before,
    after,
    preview: copy(preview),
  };
}