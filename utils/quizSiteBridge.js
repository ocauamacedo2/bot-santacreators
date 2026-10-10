import { createServer } from 'node:http';

import {
  timingSafeEqual,
  createHash,
  randomUUID,
} from 'node:crypto';

import {
  mkdir,
  readFile,
  writeFile,
  rename,
} from 'node:fs/promises';

import {
  resolve,
  join,
} from 'node:path';

const fail = (status, message) =>
  Object.assign(
    new Error(message),
    {
      status,
    }
  );

const clone = value =>
  JSON.parse(
    JSON.stringify(value)
  );

function equalSecret(received, secret) {
  const actual = Buffer.from(
    String(received || '')
  );

  const expected = Buffer.from(
    'Bearer ' + secret
  );

  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  );
}

function weekKey(at = Date.now()) {
  const parts = new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }
  ).formatToParts(
    new Date(at)
  );

  const part = type =>
    parts.find(
      item => item.type === type
    ).value;

  const date = new Date(
    Date.UTC(
      Number(part('year')),
      Number(part('month')) - 1,
      Number(part('day'))
    )
  );

  date.setUTCDate(
    date.getUTCDate() -
      (
        (date.getUTCDay() + 6) % 7
      )
  );

  return date
    .toISOString()
    .slice(0, 10);
}

export function createQuizWeeklyArchive(directory) {
  const folder = resolve(directory);

  let writes = Promise.resolve();

  return {
    save(snapshot) {
      const value = clone(snapshot);

      writes = writes
        .catch(() => {})
        .then(async () => {
          const ranking = Array.isArray(
            value.ranking
          )
            ? value.ranking
            : [];

          const key = weekKey(
            value.receivedAt || Date.now()
          );

          const file = join(
            folder,
            'week-' + key + '.json'
          );

          await mkdir(
            folder,
            {
              recursive: true,
              mode: 0o700,
            }
          );

          let week = {
            weekStart: key,
            versions: [],
          };

          try {
            week = JSON.parse(
              await readFile(
                file,
                'utf8'
              )
            );
          } catch (error) {
            if (
              error.code !== 'ENOENT'
            ) {
              throw error;
            }
          }

          const hash = createHash(
            'sha256'
          )
            .update(
              JSON.stringify(ranking)
            )
            .digest('hex');

          if (
            week.versions.at(-1)?.hash ===
            hash
          ) {
            return;
          }

          week.versions.push({
            hash,

            capturedAt:
              Date.now(),

            source:
              value.source || 'quiz',

            ranking,
          });

          const temporary =
            file + '.' +
            randomUUID() +
            '.tmp';

          await writeFile(
            temporary,
            JSON.stringify(week),
            {
              mode: 0o600,
            }
          );

          await rename(
            temporary,
            file
          );
        });

      return writes;
    },

    flush() {
      return writes;
    },
  };
}

export function installQuizBridgeServer({
  client,
  getApi,
}) {
  if (
    client.__SC_QUIZ_BRIDGE_SERVER__
  ) {
    return client
      .__SC_QUIZ_BRIDGE_SERVER__;
  }

  const secret = String(
    process.env
      .SANTA_QUIZ_BRIDGE_SECRET || ''
  ).trim();

  if (
    secret.length < 64
  ) {
    throw fail(
      503,
      'Configure SANTA_QUIZ_BRIDGE_SECRET com pelo menos 64 caracteres.'
    );
  }

  const port = Number(
    process.env.PORT ||
    process.env
      .SANTA_QUIZ_BRIDGE_PORT ||
    8080
  );

  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw fail(
      503,
      'Porta da ponte do quiz inválida.'
    );
  }

  const guildId = String(
    process.env.DISCORD_GUILD_ID ||
    '1262262852782129183'
  );

  const server = createServer(
    async (
      req,
      res
    ) => {
      const send = (
        status,
        value
      ) => {
        res.writeHead(
          status,
          {
            'Content-Type':
              'application/json; charset=utf-8',

            'Cache-Control':
              'no-store',
          }
        );

        res.end(
          JSON.stringify(value)
        );
      };

      try {
        if (
          req.method !== 'POST' ||
          req.url !==
            '/quiz-site-bridge'
        ) {
          return send(
            404,
            {
              error:
                'Rota não encontrada.',
            }
          );
        }

        if (
          !equalSecret(
            req.headers.authorization,
            secret
          )
        ) {
          return send(
            401,
            {
              error:
                'Ponte do quiz não autorizada.',
            }
          );
        }

        let bytes = 0;
        const chunks = [];

        for await (
          const chunk of req
        ) {
          bytes += chunk.length;

          if (
            bytes > 16384
          ) {
            throw fail(
              413,
              'Pedido muito grande.'
            );
          }

          chunks.push(chunk);
        }

        let body;

        try {
          body = JSON.parse(
            Buffer
              .concat(chunks)
              .toString('utf8')
          );
        } catch {
          throw fail(
            400,
            'JSON inválido.'
          );
        }

        if (
          !body ||
          body.guildId !== guildId
        ) {
          throw fail(
            400,
            'Servidor inválido.'
          );
        }

        if (
          !client.isReady() ||
          !getApi()
        ) {
          throw fail(
            503,
            'O quiz ainda está conectando.'
          );
        }

        if (
          ![
            'snapshot',
            'reset',
          ].includes(
            body.action
          )
        ) {
          throw fail(
            400,
            'Operação inválida.'
          );
        }

        const actorId = String(
          body.actorId || ''
        );

        if (
          body.action === 'reset' &&
          !/^\d{17,20}$/.test(
            actorId
          )
        ) {
          throw fail(
            400,
            'Usuário inválido.'
          );
        }

        const api = getApi();

        if (
          body.action === 'reset'
        ) {
          const guild =
            client.guilds.cache.get(
              guildId
            ) ||
            await client.guilds.fetch(
              guildId
            );

          const member =
            await guild.members
              .fetch({
                user:
                  actorId,

                force:
                  true,
              })
              .catch(
                () => null
              );

          if (
            !member
          ) {
            throw fail(
              403,
              'Você não está no servidor do quiz.'
            );
          }

          const permission =
            await api.snapshot({
              actorId,
            });

          if (
            !permission.rights?.reset
          ) {
            throw fail(
              403,
              'Você não possui permissão para resetar o quiz.'
            );
          }

          return send(
            200,
            await api.reset({
              actorId,
            })
          );
        }

        const result =
          await api.snapshot({
            actorId,
          });

        return send(
          200,
          {
            ...result,

            source:
              'quiz-original',

            receivedAt:
              Date.now(),
          }
        );
      } catch (error) {
        console.error(
          '[QUIZ BRIDGE]',
          error.status || 500,
          error.name
        );

        send(
          error.status || 500,
          {
            error:
              error.status
                ? error.message
                : 'Falha ao consultar o quiz.',
          }
        );
      }
    }
  );

  server.requestTimeout =
    20000;

  server.headersTimeout =
    15000;

  server.on(
    'error',
    error => {
      console.error(
        '[QUIZ BRIDGE SERVER]',
        error.code || error.name
      );
    }
  );

  server.listen(
    port,
    '0.0.0.0'
  );

  client
    .__SC_QUIZ_BRIDGE_SERVER__ =
    server;

  return server;
}

export function createQuizRemoteClient({
  fetcher = fetch,
} = {}) {
  let pending = null;
  let cached = null;
  let cachedAt = 0;
  let resetting = false;

  const archive =
    createQuizWeeklyArchive(
      process.env
        .SANTA_QUIZ_ARCHIVE_DIR ||
      'data/quiz-site-archive'
    );

  async function request(
    action,
    actorId = ''
  ) {
    const secret = String(
      process.env
        .SANTA_QUIZ_BRIDGE_SECRET || ''
    ).trim();

    const address = String(
      process.env
        .SANTA_QUIZ_API_URL || ''
    ).trim();

    let url;

    try {
      url = new URL(
        '/quiz-site-bridge',
        address
      );
    } catch {
      throw fail(
        503,
        'Configure SANTA_QUIZ_API_URL com o domínio HTTPS do bot do quiz.'
      );
    }

    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      secret.length < 64
    ) {
      throw fail(
        503,
        'Configure o domínio HTTPS e o segredo da ponte do quiz.'
      );
    }

    const response =
      await fetcher(
        url,
        {
          method:
            'POST',

          redirect:
            'error',

          headers: {
            Authorization:
              'Bearer ' + secret,

            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            guildId: String(
              process.env
                .DISCORD_GUILD_ID ||
              '1262262852782129183'
            ),

            actorId:
              String(actorId),

            action,
          }),

          signal:
            AbortSignal.timeout(
              15000
            ),
        }
      );

    const value =
      await response.json();

    if (
      !response.ok
    ) {
      throw fail(
        response.status,
        value.error ||
          'O bot do quiz recusou a consulta.'
      );
    }

    if (
      action === 'snapshot' &&
      !Array.isArray(
        value.ranking
      )
    ) {
      throw fail(
        502,
        'Ranking do quiz inválido.'
      );
    }

    return value;
  }

  return {
    async snapshot({
      actorId = '',
      refresh = false,
    } = {}) {
      if (
        actorId
      ) {
        return request(
          'snapshot',
          actorId
        );
      }

      if (
        resetting
      ) {
        throw fail(
          409,
          'O quiz está sendo resetado.'
        );
      }

      if (
        !refresh &&
        cached &&
        Date.now() - cachedAt <
          10000
      ) {
        return clone(cached);
      }

      if (
        !pending
      ) {
        pending = request(
          'snapshot'
        )
          .then(
            async value => {
              await archive.save(
                value
              );

              cached =
                value;

              cachedAt =
                Date.now();

              return value;
            }
          )
          .finally(
            () => {
              pending =
                null;
            }
          );
      }

      return clone(
        await pending
      );
    },

    async reset({
      actorId,
    } = {}) {
      if (
        resetting
      ) {
        throw fail(
          409,
          'Já existe um reset do quiz em andamento.'
        );
      }

      resetting =
        true;

      try {
        if (
          pending
        ) {
          await pending;
        }

        const before =
          await request(
            'snapshot'
          );

        await archive.save(
          before
        );

        const result =
          await request(
            'reset',
            actorId
          );

        cached =
          null;

        cachedAt =
          0;

        await archive.save(
          await request(
            'snapshot'
          )
        );

        return result;
      } finally {
        resetting =
          false;
      }
    },
  };
}