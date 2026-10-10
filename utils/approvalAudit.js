import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EmbedBuilder } from 'discord.js';

const file = path.resolve('data/site-approval-workflows.json');

let store = {
  receipts: {},
  outbox: [],
};

if (fs.existsSync(file)) {
  store = JSON.parse(fs.readFileSync(file, 'utf8'));

  if (!store.receipts || !Array.isArray(store.outbox)) {
    throw new Error('Arquivo de auditoria de aprovações inválido.');
  }
}

function save() {
  fs.mkdirSync(path.dirname(file), {
    recursive: true,
  });

  const temporary = `${file}.${randomUUID()}.tmp`;

  fs.writeFileSync(
    temporary,
    JSON.stringify(store, null, 2),
    {
      mode: 0o600,
    }
  );

  fs.renameSync(temporary, file);
}

export function approvalReceipts(guildId, workflow) {
  return Object.values(store.receipts)
    .filter(
      item =>
        item.guildId === guildId &&
        item.workflow === workflow
    )
    .sort(
      (a, b) =>
        b.decidedAt - a.decidedAt
    )
    .slice(0, 100);
}

export function recordApprovalReceipt(receipt) {
  const id =
    `${receipt.guildId}:${receipt.workflow}:${receipt.msgId}`;

  if (store.receipts[id]) {
    return store.receipts[id];
  }

  store.receipts[id] = receipt;

  store.outbox.push({
    id,
    receipt,
  });

  save();

  return receipt;
}

const installed = new WeakSet();

export function installApprovalAudit(client) {
  if (installed.has(client)) {
    return;
  }

  installed.add(client);

  let running = false;

  async function flush() {
    if (running || !client.isReady()) {
      return;
    }

    running = true;

    try {
      for (const item of [...store.outbox]) {
        const r = item.receipt;

        const channel =
          await client.channels.fetch(r.auditChannelId);

        if (
          channel?.guildId !== r.guildId ||
          !channel.isTextBased()
        ) {
          throw new Error(
            'Canal de auditoria indisponível ou de outro servidor.'
          );
        }

        const seconds =
          Math.floor(r.decidedAt / 1000);

        const embed = new EmbedBuilder()
          .setTitle(
            `${r.status === 'aprovado' ? '✅ Aprovado' : '❌ Recusado'} • ${r.label}`
          )
          .setColor(
            r.status === 'aprovado'
              ? 0x2ecc71
              : 0xe74c3c
          )
          .setAuthor({
            name: r.actorName,
            iconURL: r.actorAvatar,
            url: `https://discord.com/users/${r.actorId}`,
          })
          .addFields(
            {
              name: 'Responsável',
              value:
                `<@${r.actorId}> • ${r.actorId}`,
            },
            {
              name: 'Data e hora',
              value:
                `<t:${seconds}:F> • <t:${seconds}:R>`,
            },
            {
              name: 'Origem',
              value: r.origin,
            },
            {
              name: 'Pedido',
              value:
                `[Abrir no Discord](${r.url})`,
            },
            {
              name: 'Motivo',
              value:
                r.reason || 'Não informado.',
            }
          )
          .setTimestamp(r.decidedAt);

        await channel.send({
          embeds: [embed],

          allowedMentions: {
            parse: [],
          },

          files: [
            {
              attachment: Buffer.from(
                JSON.stringify(r, null, 2)
              ),

              name:
                `antes-depois-${r.workflow}-${r.msgId}.json`,
            },
          ],
        });

        store.outbox =
          store.outbox.filter(
            pending =>
              pending.id !== item.id
          );

        save();
      }
    } catch (error) {
      console.error(
        '[ApprovalAudit] Entrega pendente:',
        error.message
      );
    } finally {
      running = false;
    }
  }

  const timer = setInterval(
    () => {
      void flush();
    },
    60000
  );

  timer.unref?.();

  client.on(
    'clientReady',
    () => {
      void flush();
    }
  );

  void flush();
}