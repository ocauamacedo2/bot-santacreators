// d:\santacreators-main\events\antiFloodProtector.js
import { EmbedBuilder, PermissionsBitField, Events, MessageFlags } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// =====================================================
// CONFIGURAÇÃO DO PROTECTOR
// =====================================================
const CONFIG = {
    enabled: true,
    logChannelId: '1507676677927338107',
    
    // =====================================================
    // USUÁRIOS ISENTOS DE PUNIÇÃO
    // =====================================================
    bypassUserIds: [
        '660311795327828008', // Rodney
    ],

    // =====================================================
    // CARGOS ISENTOS DE PUNIÇÃO
    // =====================================================
    ignoredRoles: [
        '1262262852949905408', // Owner
        '1352408327983861844', // Resp Creators
    ],

    // =====================================================
    // DOMÍNIOS SEGUROS
    // =====================================================
    //
    // Estes links não serão considerados links externos
    // maliciosos apenas pelo domínio.
    //
    // Discord continua tendo a regra própria de convites.
    // =====================================================
    allowedDomains: [
        'youtube.com',
        'youtu.be',
        'medal.tv',
        'tenor.com',
        'giphy.com',
        'media.tenor.com',
        'cdn.discordapp.com',
        'media.discordapp.net',
    ],

    // Limites de Detecção
    flood: {
        limit: 5,            // 5 mensagens
        windowMs: 5000,      // em 5 segundos
    },
    repetition: {
        limit: 3,            // 3 mensagens idênticas
    },
    textAbuse: {
        enabled: true,
        strictChannelIds: [
            '1381597720007151698', // Chat Creators
        ],
        blockedAutomationUserIds: [
            '1537993019976843264', // Legião Bot
            '1542295918395793438', // Origem do spam Demons
        ],
        blockUntrustedAutomations: true,
        trustedBotUserIds: [
            '1380989431011610634', // Amigo dos Creators
        ],
        minimumLength: 40,
        longBlockLength: 500,
        suspiciousUnicodeRatio: 0.22,
        combiningMarkRatio: 0.10,
        repeatedLineLimit: 3,
        repeatedSequenceLimit: 8,
        invisibleCharacterLimit: 3,
        excessiveLineLimit: 18,
        fragmentedWindowMs: 12 * 1000,
        fragmentedMessageLimit: 3,
        fragmentedTotalLength: 100,
    },
    raidSpam: {
        enabled: true,
        massMentionLimit: 6,
        linkLimit: 2,
        historyWindowMs: 30 * 1000,
        firstTimeoutMs: 50 * 60 * 1000,
        repeatedTimeoutMs: 28 * 24 * 60 * 60 * 1000,
    },
    startupCleanup: {
        enabled: true,
        maxMessagesPerChannel: 500,
        pageSize: 100,
    },
    mentions: {
        limit: 8,            // máximo de menções por msg
    },
       links: {
        limit: 4,            // máximo de links por msg
    },

    // =====================================================
    // ATAQUE DE MÍDIA / SCAM EM MASSA
    // =====================================================
    //
    // Esta proteção NÃO pune alguém simplesmente por usar
    // @everyone ou @here.
    //
    // Ela procura combinações muito mais suspeitas:
    //
    // • 4 ou mais imagens na mesma mensagem
    // • 2 ou mais imagens + @everyone/@here
    // • mídia enviada rapidamente em vários canais
    //
    // Quando confirmado:
    //
    // • mensagens recentes do ataque são apagadas
    // • usuário recebe timeout fixo de 5 horas
    // • ação é registrada no canal de segurança
    //
    // =====================================================

    mediaAttack: {
        enabled: true,

        // 4 imagens numa única mensagem.
        //
        // IMPORTANTE:
        // atingir este número sozinho NÃO confirma mais ataque.
        // O sistema usa isso como um forte sinal e procura
        // outros indícios antes de aplicar 5 horas.
        imagesInSingleMessage: 4,

        // 2 imagens + @everyone/@here.
        imagesWithMassMention: 2,

        // Janela usada para identificar ataque em vários canais.
        windowMs: 20 * 1000,

        // Quantidade mínima de mensagens com mídia.
        messagesInWindow: 3,

        // Quantidade mínima de canais diferentes.
        channelsInWindow: 3,

        // Quantidade de mensagens com mídia em sequência
        // que transforma o envio de 4 imagens em comportamento
        // mais suspeito, mesmo dentro do mesmo canal.
        repeatedMediaMessages: 2,

        // Timeout fixo de 5 horas.
        timeoutMs: 5 * 60 * 60 * 1000,
    },

    // Domínios Permitidos (Whitelist)
    pornWords: [
        /porn/i,
        /porno/i,
        /pornografia/i,
        /sexcam/i,
        /webcam\s*sex/i,
        /nude/i,
        /nudes/i,
        /onlyfans/i,
        /privacy/i,
        /xxx/i,
        /redtube/i,
        /xvideos/i,
        /sexo/i,
        /conteudo\s*adulto/i,
    ],
    // Duração dos Castigos (Timeout)
    punishments: {
        level1: 60 * 1000,           // 1 minuto
        level2: 10 * 60 * 1000,      // 10 minutos
        level3: 60 * 60 * 1000,      // 1 hora
        level4: 24 * 60 * 60 * 1000, // 1 dia
        critical: 7 * 24 * 60 * 60 * 1000 // 1 semana
    },

    // Listas Negras (Regex/Strings)
pornWords: [
    /porn/i,
    /porno/i,
    /pornografia/i,
    /sexcam/i,
    /webcam\s*sex/i,
    /nude/i,
    /nudes/i,
    /onlyfans/i,
    /privacy/i,
    /xxx/i,
    /redtube/i,
    /xvideos/i,
    /sexo/i,
    /conteudo\s*adulto/i,
],

scamWords: [
    /free\s*nitro/i,
    /nitro\s*gratis/i,
    /steam\s*gift/i,
    /crypto\s*bonus/i,
    /casino/i,
    /withdrawal/i,
    /claim\s*bonus/i,
    /airdrop/i,
    /bet365/i,
    /ganhe\s*dinheiro/i,
    /pix\s*gratis/i,
    /resgate\s*premio/i,
    /clique\s*aqui/i,
],
};

// =====================================================
// PERSISTÊNCIA DE DADOS
// =====================================================
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.resolve(__dirname, '../data/anti_flood_protector_state.json');

function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) return { users: {}, enabled: true };
        const data = fs.readFileSync(STATE_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return { users: {}, enabled: true };
    }
}

function saveState(state) {
    try {
        const dir = path.dirname(STATE_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
        console.error('[ANTI FLOOD PROTECTOR] Erro ao salvar JSON:', err);
    }
}

// =====================================================
// MOTOR DE DETECÇÃO
// =====================================================

// Cache em memória para detecção rápida de flood (não precisa persistir tudo)
const messageCache = new Map(); // userId -> [{ content, ts }]

// Cache separado para ataques de texto divididos em várias mensagens.
// A chave usa usuário + canal para não misturar conversas diferentes.
const textAbuseCache = new Map(); // "userId:channelId" -> [{ messageId, content, ts }]

// Histórico curto para apagar mensagens relacionadas a uma raid textual.
const raidSpamCache = new Map(); // "guildId:userId" -> [{ channelId, messageId, ts }]

// =====================================================
// MEMÓRIA DE ATAQUES DE MÍDIA
// =====================================================
//
// Separada do flood comum.
//
// Isso é importante porque imagens, vídeos e arquivos
// continuam podendo ser ignorados pelo contador normal
// de flood sem ficarem invisíveis para a proteção
// específica contra ataques de mídia.
//
// Estrutura:
//
// userId -> [
//   {
//     messageId,
//     channelId,
//     ts,
//     imageCount,
//     attachmentCount,
//     massMention
//   }
// ]
//
// =====================================================

const mediaAttackCache = new Map();

function normalizeMessageContent(content) {
    return String(content || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// =====================================================
// DETECÇÃO DE TEXTO UNICODE ABUSIVO / TEXT ART SPAM
// =====================================================

function detectTextAbuse(content, channelId) {
    if (
        !CONFIG.textAbuse.enabled ||
        !CONFIG.textAbuse.strictChannelIds.includes(String(channelId))
    ) {
        return null;
    }

    const original = String(content || '');
    const normalized = original.normalize('NFKC');
    const characters = Array.from(normalized);
    const visibleCharacters = characters.filter(character => !/\s/u.test(character));

    if (visibleCharacters.length < CONFIG.textAbuse.minimumLength) {
        return null;
    }

    const decomposedCharacters = Array.from(original.normalize('NFD'));
    const combiningMarks = decomposedCharacters
        .filter(character => /\p{M}/u.test(character))
        .length;

    const suspiciousUnicode = visibleCharacters.filter(character => {
        if (/\p{Extended_Pictographic}/u.test(character)) return false;
        if (/[\p{Script=Latin}\p{N}\p{P}]/u.test(character)) return false;

        return true;
    }).length;

    const invisibleCharacters =
        Array.from(original)
            .filter(
                character =>
                    /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u.test(character)
            )
            .length;

    const combiningRatio =
        combiningMarks /
        Math.max(decomposedCharacters.length, 1);

    const suspiciousUnicodeRatio =
        suspiciousUnicode /
        Math.max(visibleCharacters.length, 1);

    const lines = normalized
        .split(/\r?\n/u)
        .map(line => line.trim())
        .filter(Boolean);

    const lineFrequency = new Map();

    for (const line of lines) {
        const key = line.replace(/\s+/gu, ' ').toLowerCase();
        lineFrequency.set(key, (lineFrequency.get(key) || 0) + 1);
    }

    const mostRepeatedLine = Math.max(0, ...lineFrequency.values());
    const repeatedSequence = /(\P{White_Space}{1,8})\1{7,}/u.test(normalized);

    const hasExcessiveCombiningMarks =
        combiningRatio >= CONFIG.textAbuse.combiningMarkRatio;

    const hasExcessiveSuspiciousUnicode =
        suspiciousUnicodeRatio >= CONFIG.textAbuse.suspiciousUnicodeRatio;

    const hasRepeatedLines =
        mostRepeatedLine >= CONFIG.textAbuse.repeatedLineLimit;

    const hasInvisibleCharacterAbuse =
        invisibleCharacters >= CONFIG.textAbuse.invisibleCharacterLimit;

    const hasExcessiveLines =
        lines.length >= CONFIG.textAbuse.excessiveLineLimit;

    const isArtificialLongBlock =
        visibleCharacters.length >= CONFIG.textAbuse.longBlockLength &&
        (
            hasExcessiveSuspiciousUnicode ||
            hasExcessiveCombiningMarks ||
            hasRepeatedLines ||
            hasInvisibleCharacterAbuse ||
            hasExcessiveLines ||
            repeatedSequence
        );

    if (
        isArtificialLongBlock ||
        hasExcessiveCombiningMarks ||
        hasInvisibleCharacterAbuse ||
        (
            hasExcessiveSuspiciousUnicode &&
            (hasRepeatedLines || repeatedSequence || lines.length >= 8)
        ) ||
        (
            hasExcessiveLines &&
            (hasExcessiveSuspiciousUnicode || repeatedSequence)
        )
    ) {
        const signals = [];

        if (hasExcessiveSuspiciousUnicode) {
            signals.push(`Unicode incomum: ${Math.round(suspiciousUnicodeRatio * 100)}%`);
        }

        if (hasExcessiveCombiningMarks) {
            signals.push(`marcas combinadas/sobrepostas: ${Math.round(combiningRatio * 100)}%`);
        }

        if (hasRepeatedLines) {
            signals.push(`linha repetida ${mostRepeatedLine} vezes`);
        }

        if (hasInvisibleCharacterAbuse) {
            signals.push(`${invisibleCharacters} caracteres invisíveis/direcionais`);
        }

        if (hasExcessiveLines) {
            signals.push(`excesso de linhas: ${lines.length}`);
        }

        if (repeatedSequence) {
            signals.push('sequências artificiais repetidas');
        }

        if (isArtificialLongBlock) {
            signals.push(`bloco excessivo com ${visibleCharacters.length} caracteres`);
        }

        return `Abuso de texto/Unicode detectado (${signals.join(', ')})`;
    }

    return null;
}

// =====================================================
// ATAQUE DE TEXTO DIVIDIDO EM VÁRIAS MENSAGENS
// =====================================================

function detectFragmentedTextAbuse(message) {
    if (
        !CONFIG.textAbuse.enabled ||
        !CONFIG.textAbuse.strictChannelIds.includes(String(message.channelId))
    ) {
        return null;
    }

    const now = Date.now();
    const key = `${message.author.id}:${message.channelId}`;
    const current = textAbuseCache.get(key) || [];

    current.push({
        messageId: message.id,
        content: String(message.content || ''),
        ts: now,
    });

    const recent = current.filter(
        entry =>
            now - entry.ts <= CONFIG.textAbuse.fragmentedWindowMs
    );

    textAbuseCache.set(key, recent);

    if (recent.length < CONFIG.textAbuse.fragmentedMessageLimit) {
        return null;
    }

    const combinedContent = recent
        .map(entry => entry.content)
        .join('\n');

    const combinedLength =
        Array.from(combinedContent)
            .filter(character => !/\s/u.test(character))
            .length;

    if (combinedLength < CONFIG.textAbuse.fragmentedTotalLength) {
        return null;
    }

    const combinedViolation =
        detectTextAbuse(combinedContent, message.channelId);

    if (!combinedViolation) {
        return null;
    }

    return (
        `Ataque de texto fragmentado detectado em ${recent.length} mensagens. ` +
        combinedViolation
    );
}

async function deleteRecentTextAbuseMessages(message) {
    const key = `${message.author.id}:${message.channelId}`;
    const recent = textAbuseCache.get(key) || [];
    let deleted = 0;

    for (const entry of recent) {
        const target =
            message.channel.messages.cache.get(entry.messageId) ||
            await message.channel.messages
                .fetch(entry.messageId)
                .catch(() => null);

        if (!target?.deletable) {
            continue;
        }

        const success = await target
            .delete()
            .then(() => true)
            .catch(() => false);

        if (success) {
            deleted++;
        }
    }

    textAbuseCache.delete(key);

    return deleted;
}

async function removeAutomatedTextAbuse(message, reason) {
    const content = String(message.content || '');

    if (message.deletable) {
        await message.delete().catch(() => {});
    }

    if (message.member) {
        await logSecurityAction(
            message.client,
            message.guild,
            message.member,
            message.channel,
            `${reason} | Origem automatizada: bot/webhook`,
            content,
            1,
            0,
            {
                type: 'automatedTextAbuse',
                messageId: message.id,
                messageURL: message.url,
            }
        );
    }

    console.warn(
        `[ANTI FLOOD PROTECTOR] Texto abusivo automatizado removido: ` +
        `${message.author.tag} (${message.author.id}) no canal ${message.channelId} | ${reason}`
    );
}

// =====================================================
// CONTEÚDO QUE NÃO CONTA COMO FLOOD
// =====================================================

function shouldIgnoreForFlood(message) {
    if (!message) return false;

    const content = String(message.content || '').trim();

    // =================================================
    // FIGURINHA / STICKER
    // =================================================

    if (message.stickers?.size > 0) {
        return true;
    }

    // =================================================
    // GIF / IMAGEM / VÍDEO / ARQUIVO
    // =================================================

    if (message.attachments?.size > 0) {
        return true;
    }

    // =================================================
    // LINK PURO
    // =================================================

    if (/^https?:\/\/\S+$/i.test(content)) {
        try {
            const url = new URL(content);

            const domain =
                url.hostname
                    .toLowerCase()
                    .replace(/^www\./, '');

            const safeDomains = [
                'youtube.com',
                'youtu.be',
                'medal.tv',
                'tenor.com',
                'giphy.com',
                'media.tenor.com',
                'cdn.discordapp.com',
                'media.discordapp.net',
            ];

            if (safeDomains.includes(domain)) {
                return true;
            }
        } catch {
            // Se não for uma URL válida,
            // continua a análise normal.
        }
    }

    return false;
}

function hasSuspiciousAttachment(message) {
    return message.attachments.some(attachment => {
        const name = attachment.name?.toLowerCase() || '';
        const contentType = attachment.contentType?.toLowerCase() || '';

        return (
            contentType.startsWith('image/') ||
            contentType.startsWith('video/') ||
            /\.(png|jpg|jpeg|gif|webp|mp4|mov|webm)$/i.test(name)
        );
    });
}

// =====================================================
// CONTA IMAGENS DA MENSAGEM
// =====================================================

function countMessageImages(message) {
    if (!message?.attachments?.size) {
        return 0;
    }

    let count = 0;

    for (const attachment of message.attachments.values()) {
        const name =
            String(
                attachment.name || ''
            ).toLowerCase();

        const contentType =
            String(
                attachment.contentType || ''
            ).toLowerCase();

        if (
            contentType.startsWith('image/') ||
            /\.(png|jpg|jpeg|gif|webp)$/i.test(name)
        ) {
            count++;
        }
    }

    return count;
}

// =====================================================
// VERIFICA @EVERYONE / @HERE
// =====================================================
//
// IMPORTANTE:
//
// Isto sozinho NÃO representa infração.
//
// A informação só será usada em conjunto com várias
// imagens ou outro comportamento de ataque.
//
// =====================================================

function hasMassMention(message) {
    const content =
        String(
            message?.content || ''
        ).toLowerCase();

    return (
        message?.mentions?.everyone === true ||
        content.includes('@everyone') ||
        content.includes('@here')
    );
}

// =====================================================
// REGISTRA MÍDIA RECENTE DO USUÁRIO
// =====================================================

function registerMediaAttackActivity(message) {
    const userId =
        message.author.id;

    const now =
        Date.now();

    const imageCount =
        countMessageImages(message);

    const attachmentCount =
        message.attachments?.size || 0;

    // Sem mídia não entra neste histórico.
    if (attachmentCount === 0) {
        return [];
    }

    const current =
        mediaAttackCache.get(userId) || [];

    current.push({
        messageId:
            message.id,

        channelId:
            message.channelId,

        ts:
            now,

        imageCount,

        attachmentCount,

        massMention:
            hasMassMention(message),
    });

    const recent =
        current.filter(
            entry =>
                now - entry.ts <=
                CONFIG.mediaAttack.windowMs
        );

    mediaAttackCache.set(
        userId,
        recent
    );

    return recent;
}

// =====================================================
// DETECTOR DE ATAQUE DE MÍDIA
// =====================================================

function detectMediaAttack(message) {
    if (!CONFIG.mediaAttack.enabled) {
        return {
            detected: false,
            reason: null,
            history: [],
        };
    }

    const imageCount =
        countMessageImages(message);

    const attachmentCount =
        message.attachments?.size || 0;

    if (attachmentCount === 0) {
        return {
            detected: false,
            reason: null,
            history: [],
        };
    }

    const massMention =
        hasMassMention(message);

    const history =
        registerMediaAttackActivity(message);

    // =================================================
    // REGRA 1
    // 4 OU MAIS IMAGENS NA MESMA MENSAGEM
    // =================================================
    //
    // IMPORTANTE:
    //
    // 4 imagens sozinhas NÃO confirmam mais automaticamente
    // um ataque.
    //
    // Isso evita punir situações legítimas como:
    //
    // • envio de portfólio
    // • trabalhos realizados
    // • prints para suporte
    // • comprovações em tickets
    // • várias fotos normais na mesma mensagem
    //
    // As 4 imagens continuam sendo consideradas um sinal
    // forte, porém precisam estar acompanhadas de outro
    // comportamento suspeito.
    //
    // =================================================

    if (
        imageCount >=
        CONFIG.mediaAttack.imagesInSingleMessage
    ) {
        const repeatedMedia =
            history.length >=
            CONFIG.mediaAttack.repeatedMediaMessages;

        const differentChannels =
            new Set(
                history.map(
                    entry =>
                        entry.channelId
                )
            );

        const spreadingAcrossChannels =
            differentChannels.size >= 2;

        if (
            massMention ||
            repeatedMedia ||
            spreadingAcrossChannels
        ) {
            const signals = [];

            if (massMention) {
                signals.push(
                    '@everyone/@here junto das imagens'
                );
            }

            if (repeatedMedia) {
                signals.push(
                    `${history.length} mensagens com mídia em poucos segundos`
                );
            }

            if (spreadingAcrossChannels) {
                signals.push(
                    `mídia espalhada em ${differentChannels.size} canais`
                );
            }

            return {
                detected: true,

                reason:
                    `Ataque de mídia detectado: ` +
                    `${imageCount} imagens na mesma mensagem ` +
                    `com comportamento adicional suspeito: ` +
                    `${signals.join(', ')}.`,

                history,
            };
        }
    }

    // =================================================
    // REGRA 2
    // 2+ IMAGENS + @EVERYONE/@HERE
    // =================================================
    //
    // @everyone sozinho NÃO ativa esta regra.
    //
    // =================================================

    if (
        massMention &&
        imageCount >=
            CONFIG.mediaAttack.imagesWithMassMention
    ) {
        return {
            detected: true,

            reason:
                `Ataque de mídia detectado: ` +
                `${imageCount} imagens acompanhadas ` +
                `de menção em massa.`,

            history,
        };
    }

    // =================================================
    // REGRA 3
    // MÍDIA SENDO ESPALHADA POR VÁRIOS CANAIS
    // =================================================

    const channels =
        new Set(
            history.map(
                entry =>
                    entry.channelId
            )
        );

    if (
        history.length >=
            CONFIG.mediaAttack.messagesInWindow &&
        channels.size >=
            CONFIG.mediaAttack.channelsInWindow
    ) {
        return {
            detected: true,

            reason:
                `Ataque de mídia em massa detectado: ` +
                `${history.length} mensagens com mídia ` +
                `em ${channels.size} canais diferentes ` +
                `em poucos segundos.`,

            history,
        };
    }

    return {
        detected: false,
        reason: null,
        history,
    };
}

// =====================================================
// APAGA MENSAGENS RECENTES DO ATAQUE
// =====================================================

async function deleteMediaAttackMessages(
    message,
    history
) {
    let deleted = 0;

    const uniqueMessages =
        new Map();

    for (const entry of history) {
        uniqueMessages.set(
            `${entry.channelId}:${entry.messageId}`,
            entry
        );
    }

    for (
        const entry of
        uniqueMessages.values()
    ) {
        const channel =
            message.guild.channels.cache.get(
                entry.channelId
            ) ||
            (
                await message.guild.channels
                    .fetch(
                        entry.channelId
                    )
                    .catch(() => null)
            );

        if (
            !channel?.isTextBased() ||
            !channel.messages
        ) {
            continue;
        }

        const target =
            channel.messages.cache.get(
                entry.messageId
            ) ||
            (
                await channel.messages
                    .fetch(
                        entry.messageId
                    )
                    .catch(() => null)
            );

        if (!target) {
            continue;
        }

        if (!target.deletable) {
            continue;
        }

        const success =
            await target
                .delete()
                .then(() => true)
                .catch(() => false);

        if (success) {
            deleted++;
        }
    }

    return deleted;
}

// =====================================================
// CAPTURA EVIDÊNCIAS DO ATAQUE DE MÍDIA
// =====================================================
//
// As imagens precisam ser capturadas ANTES da exclusão
// das mensagens.
//
// Além das URLs originais, tentamos baixar os arquivos
// para reenviá-los diretamente ao canal de logs.
//
// Dessa forma o log não depende somente da mensagem
// original continuar existindo.
//
// =====================================================

async function captureMediaAttackEvidence(
    message,
    history
) {
    const evidence = [];

    const uniqueMessages =
        new Map();

    for (const entry of history) {
        uniqueMessages.set(
            `${entry.channelId}:${entry.messageId}`,
            entry
        );
    }

    for (
        const entry of
        uniqueMessages.values()
    ) {
        const channel =
            message.guild.channels.cache.get(
                entry.channelId
            ) ||
            (
                await message.guild.channels
                    .fetch(
                        entry.channelId
                    )
                    .catch(() => null)
            );

        if (
            !channel?.isTextBased() ||
            !channel.messages
        ) {
            continue;
        }

        const target =
            channel.messages.cache.get(
                entry.messageId
            ) ||
            (
                await channel.messages
                    .fetch(
                        entry.messageId
                    )
                    .catch(() => null)
            );

        if (!target) {
            continue;
        }

        const attachments = [];

        for (
            const attachment of
            target.attachments.values()
        ) {
            const attachmentData = {
                id:
                    attachment.id,

                name:
                    attachment.name ||
                    `arquivo-${attachment.id}`,

                url:
                    attachment.url,

                proxyURL:
                    attachment.proxyURL || null,

                contentType:
                    attachment.contentType || null,

                size:
                    attachment.size || 0,

                buffer:
                    null,
            };

            try {
                const response =
                    await fetch(
                        attachment.url
                    );

                if (response.ok) {
                    const arrayBuffer =
                        await response.arrayBuffer();

                    attachmentData.buffer =
                        Buffer.from(
                            arrayBuffer
                        );
                }
            } catch (err) {
                console.error(
                    '[ANTI FLOOD PROTECTOR] Erro ao preservar anexo para o log:',
                    err
                );
            }

            attachments.push(
                attachmentData
            );
        }

        evidence.push({
            messageId:
                target.id,

            messageURL:
                target.url,

            channelId:
                target.channelId,

            channelName:
                target.channel?.name ||
                'Canal desconhecido',

            content:
                String(
                    target.content || ''
                ),

            createdTimestamp:
                target.createdTimestamp,

            attachments,
        });
    }

    return evidence;
}

// =====================================================
// PUNIÇÃO FIXA PARA ATAQUE DE MÍDIA
// =====================================================

async function punishMediaAttack(
    message,
    detection
) {
    const member =
        message.member;

    if (!member) {
        return;
    }

    // =================================================
    // BYPASS EXISTENTE
    // =================================================
    //
    // Mantém exatamente a mesma proteção atualmente
    // utilizada pelo Anti Flood Protector.
    //
    // =================================================

    if (
        isPunishmentExempt(member)
    ) {
        mediaAttackCache.delete(
            message.author.id
        );

        return;
    }

    // =================================================
    // CAPTURA CONTEÚDO E EVIDÊNCIAS ANTES DE APAGAR
    // =================================================

    const content =
        String(
            message.content || ''
        );

    const mediaEvidence =
        await captureMediaAttackEvidence(
            message,
            detection.history
        );

    const deleted =
        await deleteMediaAttackMessages(
            message,
            detection.history
        );

    // =================================================
    // TIMEOUT FIXO DE 5 HORAS
    // =================================================

    const duration =
        CONFIG.mediaAttack.timeoutMs;

    const canTimeout =
        message.guild.members.me.permissions.has(
            PermissionsBitField.Flags.ModerateMembers
        ) &&
        member.moderatable;

    if (canTimeout) {
        await member
            .timeout(
                duration,
                `[ANTI MEDIA ATTACK] ${detection.reason}`
            )
            .catch(() => {});
    }

    // =================================================
    // LOG
    // =================================================

    await logSecurityAction(
        message.client,
        message.guild,
        member,
        message.channel,
        detection.reason,
        content ||
            `[Ataque contendo mídia. ${deleted} mensagem(ns) removida(s).]`,
        1,
        duration,
        {
            type: 'mediaAttack',
            messageId: message.id,
            messageURL: message.url,
            deletedMessages: deleted,
            evidence: mediaEvidence,
        }
    );

    // =================================================
    // AVISO TEMPORÁRIO
    // =================================================

    const alert =
        `🚨 ${member}, foi detectado um possível ` +
        `ataque de mídia em massa. ` +
        `As mensagens relacionadas foram removidas e ` +
        `foi aplicado um castigo de **5 horas**.`;

    const warning =
        await message.channel
            .send({
                content: alert,

                allowedMentions: {
                    users: [
                        member.id
                    ],

                    parse: [],
                },
            })
            .catch(() => null);

    if (warning) {
        setTimeout(
            () => {
                warning
                    .delete()
                    .catch(() => {});
            },
            10_000
        );
    }

    // Limpa o histórico depois da punição.
    mediaAttackCache.delete(
        message.author.id
    );
}

function isTicketChannel(message) {
    const channelName = message.channel?.name?.toLowerCase() || '';
    const parentName = message.channel?.parent?.name?.toLowerCase() || '';

    return (
        channelName.includes('ticket') ||
        channelName.includes('suporte') ||
        channelName.includes('atendimento') ||
        parentName.includes('ticket') ||
        parentName.includes('suporte') ||
        parentName.includes('atendimento')
    );
}

function isDiscordInviteLink(url) {
    const domain = url.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = url.pathname.toLowerCase();

    return (
        domain === 'discord.gg' ||
        domain === 'discord.me' ||
        domain === 'discord.com' && pathname.startsWith('/invite/') ||
        domain === 'discordapp.com' && pathname.startsWith('/invite/')
    );
}

// =====================================================
// VERIFICA SE O CONVITE É DE UM SERVIDOR CONFIÁVEL
// =====================================================
//
// O Discord fornece os dados do servidor correspondente
// ao convite através de fetchInvite().
//
// Se o convite pertencer a qualquer um dos servidores
// cadastrados em TRUSTED_DISCORD_GUILD_IDS, ele é liberado
// para qualquer usuário.
//
// Convites inválidos, expirados ou impossíveis de verificar
// continuam passando pela proteção normal.
//
// =====================================================

async function isTrustedDiscordInvite(client, inviteLink) {
    if (!client || !inviteLink) {
        return false;
    }

    try {
        const invite =
            await client.fetchInvite(
                inviteLink
            );

        const inviteGuildId =
            invite?.guild?.id;

        if (!inviteGuildId) {
            return false;
        }

        return TRUSTED_DISCORD_GUILD_IDS.has(
            String(inviteGuildId)
        );
    } catch {
        return false;
    }
}

// =====================================================
// LINK INTERNO DO PRÓPRIO SERVIDOR
// =====================================================
//
// Exemplos permitidos:
//
// https://discord.com/channels/SERVIDOR/CANAL
// https://discord.com/channels/SERVIDOR/CANAL/MENSAGEM
//
// IMPORTANTE:
//
// • precisa ser discord.com ou discordapp.com
// • precisa utilizar /channels/
// • o primeiro ID precisa ser exatamente o servidor
//   onde a mensagem foi enviada
//
// Portanto, links de canais/mensagens de OUTROS servidores
// continuam passando pela proteção normal.
// =====================================================

function isInternalDiscordGuildLink(url, guildId) {
    if (!url || !guildId) {
        return false;
    }

    const domain =
        url.hostname
            .toLowerCase()
            .replace(/^www\./, '');

    if (
        domain !== 'discord.com' &&
        domain !== 'discordapp.com'
    ) {
        return false;
    }

    const parts =
        url.pathname
            .split('/')
            .filter(Boolean);

    // Esperado:
    //
    // channels / GUILD_ID / CHANNEL_ID
    // channels / GUILD_ID / CHANNEL_ID / MESSAGE_ID

    if (
        parts.length < 3 ||
        parts[0].toLowerCase() !== 'channels'
    ) {
        return false;
    }

    const linkedGuildId =
        parts[1];

    return (
        linkedGuildId === String(guildId) ||
        TRUSTED_DISCORD_GUILD_IDS.has(linkedGuildId)
    );
}

// =====================================================
// SERVIDORES DO DISCORD CONFIÁVEIS
// =====================================================
//
// Qualquer usuário pode compartilhar links de canais,
// mensagens e convites pertencentes a estes servidores.
//
// Isso NÃO cria bypass para:
//
// • ataque de mídia
// • scam
// • phishing
// • pornografia
// • flood
// • spam
// • menções excessivas
// • links encurtados suspeitos
//
// =====================================================

const TRUSTED_DISCORD_GUILD_IDS = new Set([
    '1262262852782129183', // Santa Creators
    '755203021490749530',  // Nobre
    '690983940567334964',  // Santa
    '788905600699858944',  // Grande
    '798594785896038401',  // Maresia
]);

// =====================================================
// CARGOS AUTORIZADOS A ENVIAR LINKS EXTERNOS
// =====================================================
//
// Estes cargos podem enviar links externos comuns,
// incluindo convites do Discord.
//
// Isso NÃO cria bypass para:
//
// • ataque de mídia
// • scam
// • phishing
// • pornografia
// • flood
// • spam
// • menções excessivas
// • links encurtados suspeitos
//
// A exceção será utilizada SOMENTE na análise de links.
// =====================================================

const EXTERNAL_LINK_ALLOWED_ROLE_IDS = new Set([
    '1352493359897378941', // Senior Creator
    '1352407252216184833', // Resp Líder
    '1262262852949905409', // Resp Influ
    '1352408327983861844', // Resp Creators
]);
function isSeniorCreator(member) {
    if (!member) {
        return false;
    }

    return member.roles?.cache?.some(
        role =>
            EXTERNAL_LINK_ALLOWED_ROLE_IDS.has(
                role.id
            )
    ) === true;
}

function checkBypass(member) {
    if (!member || member.user.bot) return true;

    return false;
}
// =====================================================
// VERIFICA SE O USUÁRIO É ISENTO DE PUNIÇÃO
// =====================================================
//
// Usuários/cargos daqui continuam sujeitos à limpeza
// das mensagens quando houver flood real.
//
// Porém NÃO recebem:
// • timeout
// • castigo progressivo
//
// Também considera automaticamente qualquer cargo
// que possua a permissão Administrator.
// =====================================================

function isPunishmentExempt(member) {
    if (!member) return false;

    // =================================================
    // USUÁRIO AUTORIZADO DIRETAMENTE
    // =================================================

    if (CONFIG.bypassUserIds.includes(member.id)) {
        return true;
    }

    // =================================================
    // CARGO AUTORIZADO DIRETAMENTE
    // =================================================

    if (
        member.roles.cache.some(
            role => CONFIG.ignoredRoles.includes(role.id)
        )
    ) {
        return true;
    }

    // =================================================
    // QUALQUER CARGO COM ADMINISTRATOR
    // =================================================

    if (
        member.roles.cache.some(
            role =>
                role.permissions.has(
                    PermissionsBitField.Flags.Administrator
                )
        )
    ) {
        return true;
    }

    // =================================================
    // PERMISSÃO ADMINISTRATOR EFETIVA
    // =================================================

    if (
        member.permissions.has(
            PermissionsBitField.Flags.Administrator
        )
    ) {
        return true;
    }

    return false;
}

async function logSecurityAction(
    client,
    guild,
    member,
    channel,
    reason,
    content,
    infractionCount,
    duration,
    extra = null
) {
    const logChannel =
        await client.channels
            .fetch(
                CONFIG.logChannelId
            )
            .catch(() => null);

    if (
        !logChannel ||
        !logChannel.isTextBased()
    ) {
        return;
    }

    const now =
        new Date();

    const timestampSP =
        now.toLocaleString(
            'pt-BR',
            {
                timeZone:
                    'America/Sao_Paulo',
            }
        );

    const channelURL =
        `https://discord.com/channels/` +
        `${guild.id}/${channel.id}`;

    const userURL =
        `https://discord.com/users/` +
        `${member.id}`;

    const roles =
        member.roles?.cache
            ?.filter(
                role =>
                    role.id !== guild.id
            )
            ?.sort(
                (a, b) =>
                    b.position -
                    a.position
            )
            ?.map(
                role =>
                    `${role}`
            )
            ?.slice(
                0,
                15
            )
            ?.join(', ') ||
        'Nenhum cargo encontrado.';

    const evidence =
        extra?.evidence || [];

    const totalAttachments =
        evidence.reduce(
            (
                total,
                entry
            ) =>
                total +
                (
                    entry.attachments
                        ?.length ||
                    0
                ),
            0
        );

    const totalEvidenceMessages =
        evidence.length;

    const embed =
        new EmbedBuilder()
            .setTitle(
                '🛡️ Proteção Ativa: Mensagem Removida'
            )
            .setColor(
                infractionCount > 3
                    ? '#FF0000'
                    : '#FFA500'
            )
            .setThumbnail(
                member.user.displayAvatarURL({
                    dynamic: true,
                })
            )
            .addFields(
                {
                    name:
                        '👤 Usuário',

                    value:
                        `${member}\n` +
                        `**Nome:** ${member.user.tag}\n` +
                        `**ID:** \`${member.id}\`\n` +
                        `[Abrir Perfil](${userURL})`,

                    inline:
                        true,
                },

                {
                    name:
                        '📍 Canal',

                    value:
                        `${channel}\n` +
                        `**ID:** \`${channel.id}\`\n` +
                        `[🔗 Ir ao Canal](${channelURL})`,

                    inline:
                        true,
                },

                {
                    name:
                        '⚖️ Punição',

                    value:
                        extra?.type === 'raidSpam' && member.user.bot
                            ? '`Banimento da automação maliciosa`'
                            : (
                                `Timeout: ` +
                                `\`${duration / 60000} min\``
                            ),

                    inline:
                        true,
                },

                {
                    name:
                        '🚩 Reincidência',

                    value:
                        `\`${infractionCount}ª infração\``,

                    inline:
                        true,
                },

                {
                    name:
                        '🏠 Servidor',

                    value:
                        `**Nome:** ${guild.name}\n` +
                        `**ID:** \`${guild.id}\``,

                    inline:
                        true,
                },

                {
                    name:
                        '🆔 Mensagem',

                    value:
                        extra?.messageId
                            ? `\`${extra.messageId}\``
                            : 'Não informado.',

                    inline:
                        true,
                },

                {
                    name:
                        '📝 Motivo Detectado',

                    value:
                        `\`${String(reason).slice(0, 1000)}\``,

                    inline:
                        false,
                },

                {
                    name:
                        '💬 Conteúdo Removido',

                    value:
                        `\`\`\`\n` +
                        `${String(
                            content ||
                            '[Sem Texto/Apenas Mídia]'
                        ).slice(0, 950)}` +
                        `\n\`\`\``,

                    inline:
                        false,
                },

                {
                    name:
                        '🎭 Cargos do Usuário',

                    value:
                        roles.slice(
                            0,
                            1000
                        ),

                    inline:
                        false,
                }
            );

    if (
        extra?.type ===
        'mediaAttack'
    ) {
        embed.addFields(
            {
                name:
                    '🖼️ Evidências de Mídia',

                value:
                    `**Mensagens analisadas:** ` +
                    `\`${totalEvidenceMessages}\`\n` +
                    `**Arquivos encontrados:** ` +
                    `\`${totalAttachments}\`\n` +
                    `**Mensagens removidas:** ` +
                    `\`${extra.deletedMessages || 0}\``,

                inline:
                    false,
            }
        );
    }

    embed.addFields(
        {
            name:
                '🕒 Horário (SP)',

            value:
                `\`${timestampSP}\``,

            inline:
                false,
        },

        {
            name:
                '🔗 Links Úteis',

            value:
                `[👤 Perfil do Usuário](${userURL})\n` +
                `[📍 Ir ao Canal](${channelURL})`,

            inline:
                false,
        }
    );

    embed
        .setFooter({
            text:
                'Sistema de Segurança SantaCreators',
        })
        .setTimestamp();

    await logChannel
        .send({
            embeds: [
                embed,
            ],
        })
        .catch(
            err => {
                console.error(
                    '[ANTI FLOOD PROTECTOR] Erro ao enviar log:',
                    err
                );
            }
        );

    // =================================================
    // EVIDÊNCIAS VISUAIS
    // =================================================
    //
    // Cada mensagem original recebe seu próprio bloco
    // de evidência.
    //
    // As imagens são reenviadas como arquivos para que
    // apareçam diretamente no Discord e possam ser
    // abertas/clicadas pela equipe.
    //
    // =================================================

    if (
        extra?.type ===
            'mediaAttack' &&
        evidence.length > 0
    ) {
        for (
            let index = 0;
            index < evidence.length;
            index++
        ) {
            const entry =
                evidence[index];

            const evidenceChannelURL =
                `https://discord.com/channels/` +
                `${guild.id}/${entry.channelId}`;

            const attachmentLinks =
                (
                    entry.attachments ||
                    []
                )
                    .map(
                        (
                            attachment,
                            attachmentIndex
                        ) =>
                            `**Imagem/arquivo ${attachmentIndex + 1}:** ` +
                            `[Abrir original](${attachment.url})`
                    )
                    .join('\n');

            const evidenceEmbed =
                new EmbedBuilder()
                    .setTitle(
                        `📸 Evidência ${index + 1}/${evidence.length}`
                    )
                    .setColor(
                        '#FFA500'
                    )
                    .setDescription(
                        `Registro preservado antes da exclusão automática.`
                    )
                    .addFields(
                        {
                            name:
                                '👤 Autor',

                            value:
                                `${member}\n` +
                                `\`${member.id}\``,

                            inline:
                                true,
                        },

                        {
                            name:
                                '📍 Origem',

                            value:
                                `<#${entry.channelId}>\n` +
                                `[🔗 Abrir Canal](${evidenceChannelURL})`,

                            inline:
                                true,
                        },

                        {
                            name:
                                '🆔 Mensagem Original',

                            value:
                                `\`${entry.messageId}\``,

                            inline:
                                true,
                        },

                        {
                            name:
                                '💬 Texto Original',

                            value:
                                entry.content
                                    ? (
                                        `\`\`\`\n` +
                                        `${entry.content.slice(0, 950)}` +
                                        `\n\`\`\``
                                    )
                                    : (
                                        '`[Mensagem sem texto / somente mídia]`'
                                    ),

                            inline:
                                false,
                        },

                        {
                            name:
                                '🖼️ Arquivos Originais',

                            value:
                                attachmentLinks
                                    ? attachmentLinks.slice(
                                        0,
                                        1000
                                    )
                                    : 'Nenhum arquivo encontrado.',

                            inline:
                                false,
                        }
                    )
                    .setFooter({
                        text:
                            'Evidência preservada antes da remoção',
                    })
                    .setTimestamp(
                        entry.createdTimestamp
                            ? new Date(
                                entry.createdTimestamp
                            )
                            : new Date()
                    );

            const files =
                (
                    entry.attachments ||
                    []
                )
                    .filter(
                        attachment =>
                            attachment.buffer
                    )
                    .slice(
                        0,
                        10
                    )
                    .map(
                        (
                            attachment,
                            attachmentIndex
                        ) => ({
                            attachment:
                                attachment.buffer,

                            name:
                                attachment.name ||
                                `evidencia-${attachmentIndex + 1}.png`,
                        })
                    );

            await logChannel
                .send({
                    embeds: [
                        evidenceEmbed,
                    ],

                    files,
                })
                .catch(
                    err => {
                        console.error(
                            '[ANTI FLOOD PROTECTOR] Erro ao enviar evidência de mídia:',
                            err
                        );
                    }
                );
        }
    }
}

async function punishRaidSpam(message, detection) {
    const member = message.member;

    if (!member) {
        await deleteRaidSpamMessages(
            message,
            detection.history
        );

        return;
    }

    // Bots/apps maliciosos não aceitam timeout.
    // Quando possível, são banidos diretamente.
    if (message.author.bot || message.webhookId) {
        const deleted = await deleteRaidSpamMessages(
            message,
            detection.history
        );

        const canBan =
            message.guild.members.me.permissions.has(
                PermissionsBitField.Flags.BanMembers
            ) &&
            member.bannable;

        if (canBan) {
            await member.ban({
                reason: `[ANTI RAID] ${detection.reason}`,
            }).catch(() => {});
        }

        await logSecurityAction(
            message.client,
            message.guild,
            member,
            message.channel,
            `${detection.reason} | Automação maliciosa ${canBan ? 'banida' : 'não pôde ser banida'}`,
            message.content || `[Raid automatizada. ${deleted} mensagem(ns) removida(s).]`,
            1,
            0,
            {
                type: 'raidSpam',
                messageId: message.id,
                messageURL: message.url,
                deletedMessages: deleted,
            }
        );

        return;
    }

    if (isPunishmentExempt(member)) {
        return;
    }

    const state = loadState();
    const userId = member.id;

    if (!state.users[userId]) {
        state.users[userId] = {
            infractions: 0,
            lastInfractions: [],
        };
    }

    const previousRaidCount =
        Number(state.users[userId].raidSpamInfractions || 0);

    const raidCount = previousRaidCount + 1;
    const duration =
        raidCount === 1
            ? CONFIG.raidSpam.firstTimeoutMs
            : CONFIG.raidSpam.repeatedTimeoutMs;

    state.users[userId].raidSpamInfractions = raidCount;
    state.users[userId].lastInfractions.push({
        reason: detection.reason,
        ts: Date.now(),
        duration,
    });

    saveState(state);

    const deleted = await deleteRaidSpamMessages(
        message,
        detection.history
    );

    const canTimeout =
        message.guild.members.me.permissions.has(
            PermissionsBitField.Flags.ModerateMembers
        ) &&
        member.moderatable;

    if (canTimeout) {
        await member.timeout(
            duration,
            `[ANTI RAID] ${detection.reason}`
        ).catch(() => {});
    }

    await logSecurityAction(
        message.client,
        message.guild,
        member,
        message.channel,
        detection.reason,
        message.content || `[Raid textual. ${deleted} mensagem(ns) removida(s).]`,
        raidCount,
        duration,
        {
            type: 'raidSpam',
            messageId: message.id,
            messageURL: message.url,
            deletedMessages: deleted,
        }
    );

    const durationText =
        raidCount === 1
            ? '50 minutos'
            : '28 dias';

    const warning = await message.channel.send({
        content:
            `🚨 ${member}, ataque de spam/raid detectado. ` +
            `As mensagens foram removidas e foi aplicado castigo de **${durationText}**.`,
        allowedMentions: {
            users: [member.id],
            parse: [],
        },
    }).catch(() => null);

    if (warning) {
        setTimeout(() => warning.delete().catch(() => {}), 10_000);
    }
}

async function applyPunishment(member, guild, reason, content, channel) {
    // =====================================================
    // USUÁRIO ISENTO DE PUNIÇÃO
    // =====================================================
    //
    // A mensagem já foi removida antes desta função.
    //
    // Portanto, administrador continua tendo o flood
    // limpo, mas NÃO recebe timeout e NÃO acumula
    // infração progressiva.
    // =====================================================

    if (isPunishmentExempt(member)) {
        console.log(
            `[ANTI FLOOD PROTECTOR] Mensagem removida sem punição: ${member.user.tag} (${member.id}) | ${reason}`
        );

        return;
    }

    const state = loadState();
    const userId = member.id;

    if (!state.users[userId]) {
        state.users[userId] = {
            infractions: 0,
            lastInfractions: []
        };
    }

    state.users[userId].infractions++;
    const count = state.users[userId].infractions;

    let duration = CONFIG.punishments.level1;

    if (count === 2) {
        duration = CONFIG.punishments.level2;
    }

    if (count === 3) {
        duration = CONFIG.punishments.level3;
    }

    if (count === 4) {
        duration = CONFIG.punishments.level4;
    }

    if (count >= 5) {
        duration = CONFIG.punishments.critical;
    }

    state.users[userId].lastInfractions.push({
        reason,
        ts: Date.now(),
        duration
    });

    saveState(state);

    // =====================================================
    // PUNIÇÃO
    // =====================================================

    const canTimeout =
        guild.members.me.permissions.has(
            PermissionsBitField.Flags.ModerateMembers
        ) &&
        member.moderatable;

    if (canTimeout) {
        await member
            .timeout(
                duration,
                `[ANTIFLOOD] ${reason}`
            )
            .catch(() => {});
    }

    // =====================================================
    // LOG
    // =====================================================

    await logSecurityAction(
        guild.client,
        guild,
        member,
        channel,
        reason,
        content,
        count,
        duration
    );

    // =====================================================
    // AVISO
    // =====================================================

    const alert =
        `⚠️ ${member}, sua mensagem foi removida e você ` +
        `recebeu um castigo de **${duration / 60000}min** ` +
        `por: **${reason}**.`;

    const msg =
        await channel
            .send(alert)
            .catch(() => null);

    if (msg) {
        setTimeout(
            () =>
                msg
                    .delete()
                    .catch(() => {}),
            10000
        );
    }
}

export function setupAntiFloodProtector(client) {
    if (globalThis.__SC_ANTI_FLOOD_PROTECTOR__) return;
    globalThis.__SC_ANTI_FLOOD_PROTECTOR__ = true;

    const startStartupCleanup = () => {
        setTimeout(
            () => {
                runStartupRaidCleanup(client).catch(
                    err => {
                        console.error(
                            '[ANTI FLOOD PROTECTOR] Erro na limpeza inicial:',
                            err
                        );
                    }
                );
            },
            3000
        );
    };

    if (client.isReady()) {
        startStartupCleanup();
    } else {
        client.once(
            Events.ClientReady,
            startStartupCleanup
        );
    }

    client.on(Events.MessageCreate, async (message) => {
        if (!message.guild) return;
        
        const state = loadState();
        if (state.enabled === false) return;

        // O próprio bot precisa ser ignorado para não analisar
        // os avisos enviados pelo sistema de proteção.
        if (message.author.id === client.user?.id) return;

        // Bots e webhooks não podem ignorar a proteção de texto.
        // No canal reforçado, conteúdo Unicode/text art abusivo
        // é removido antes do retorno reservado às automações.
        if (message.author.bot || message.webhookId) {
            const isStrictChannel =
                CONFIG.textAbuse.strictChannelIds.includes(
                    String(message.channelId)
                );

            const isExplicitlyBlockedAutomation =
                CONFIG.textAbuse.blockedAutomationUserIds.includes(
                    String(message.author.id)
                );

            const isTrustedAutomation =
                CONFIG.textAbuse.trustedBotUserIds.includes(
                    String(message.author.id)
                );

            // Bot confiável recebe bypass completo.
            // A lista de bloqueados continua tendo prioridade
            // caso um mesmo ID seja colocado nas duas listas.
            if (
                isTrustedAutomation &&
                !isExplicitlyBlockedAutomation
            ) {
                return;
            }

            const automatedRaidSpam =
                detectRaidSpam(message);

            if (automatedRaidSpam) {
                await punishRaidSpam(
                    message,
                    automatedRaidSpam
                );

                return;
            }

            const automatedTextViolation =
                detectTextAbuse(message.content, message.channelId);

            const automatedViolation =
                (
                    isExplicitlyBlockedAutomation
                        ? `Bot bloqueado diretamente pelo ID ${message.author.id}`
                        : null
                ) ||
                automatedTextViolation ||
                (
                    CONFIG.textAbuse.blockUntrustedAutomations &&
                    isStrictChannel &&
                    !isTrustedAutomation
                        ? 'Mensagem de bot/webhook não autorizado no canal protegido'
                        : null
                );

            if (automatedViolation) {
                await removeAutomatedTextAbuse(
                    message,
                    automatedViolation
                );
            }

            return;
        }

        // Comandos Administrativos do Protector
        if (message.content.startsWith('!protector')) {
            await handleCommands(message, state);
            return;
        }

        if (checkBypass(message.member)) return;

        const content = message.content;
        const userId = message.author.id;
        const now = Date.now();

        // =================================================
        // PROTEÇÃO CRÍTICA CONTRA RAID TEXTUAL
        // =================================================

        const raidSpam =
            detectRaidSpam(message);

        if (raidSpam) {
            await punishRaidSpam(
                message,
                raidSpam
            );

            return;
        }

        // =================================================
        // PROTEÇÃO CONTRA ATAQUE DE MÍDIA
        // =================================================
        //
        // Esta análise acontece ANTES de imagens serem
        // ignoradas pelo contador normal de flood.
        //
        // Isso permite manter imagens normais fora do flood
        // sem deixar ataques de mídia invisíveis.
        //
        // IMPORTANTE:
        //
        // @everyone/@here sozinho NÃO gera punição.
        //
        // =================================================

        const mediaAttack =
            detectMediaAttack(message);

        if (
            mediaAttack.detected
        ) {
            await punishMediaAttack(
                message,
                mediaAttack
            );

            return;
        }

        // =================================================
        // CONTEÚDOS QUE NÃO CONTAM COMO FLOOD
        // =================================================
        //
        // Esses conteúdos continuam podendo passar pelas
        // demais verificações de segurança quando aplicável,
        // mas não alimentam o contador de flood/repetição.
        // =================================================

        const ignoreForFlood =
            shouldIgnoreForFlood(message);

        // Inicializa cache do usuário
        if (!messageCache.has(userId)) {
            messageCache.set(userId, []);
        }

        const userMsgs =
            messageCache.get(userId);

        if (!ignoreForFlood) {
            userMsgs.push({
                content,
                ts: now
            });
        }

        // Limpa cache antigo (mais que 10s)
        const filteredCache = userMsgs.filter(m => now - m.ts < 10000);
        messageCache.set(userId, filteredCache);

        let violation = null;

        // =================================================
        // 0. ABUSO DE TEXTO / UNICODE NO CANAL REFORÇADO
        // =================================================

        const textAbuseViolation =
            detectTextAbuse(content, message.channelId);

        const fragmentedTextViolation =
            detectFragmentedTextAbuse(message);

        if (textAbuseViolation || fragmentedTextViolation) {
            violation =
                fragmentedTextViolation ||
                textAbuseViolation;
        }

        // =================================================
        // 1. DETECÇÃO DE FLOOD
        // =================================================

        if (!ignoreForFlood) {
            const rapidMsgs =
                filteredCache.filter(
                    m =>
                        now - m.ts <
                        CONFIG.flood.windowMs
                );

            if (
                rapidMsgs.length >
                CONFIG.flood.limit
            ) {
                violation =
                    "Flood de mensagens (Envio muito rápido)";
            }
        }

        // =================================================
        // 2. DETECÇÃO DE MENSAGENS REPETIDAS
        // =================================================

        if (!ignoreForFlood) {
            const recentDuplicates =
                filteredCache.filter(
                    m =>
                        m.content === content
                );

            if (
                recentDuplicates.length >=
                    CONFIG.repetition.limit &&
                content.length > 3
            ) {
                violation =
                    "Spam de mensagens repetidas";
            }
        }

        // 3. Detecção de Menções Excessivas
        const mentionCount = message.mentions.users.size + message.mentions.roles.size;
        if (mentionCount > CONFIG.mentions.limit) {
            violation = "Excesso de menções na mensagem";
        }

// 4. Detecção de Links e Scams
const links = content.match(/https?:\/\/[^\s]+/gi) || [];

const seniorCreator =
    isSeniorCreator(
        message.member
    );

if (
    links.length > CONFIG.links.limit &&
    !seniorCreator
) {
    violation = "Excesso de links na mensagem";
}

if (links.length > 0) {
    for (const link of links) {
        try {
            const url =
                new URL(link);

            const domain =
                url.hostname
                    .toLowerCase()
                    .replace(/^www\./, '');

            // =============================================
            // LINK INTERNO DO PRÓPRIO SERVIDOR
            // =============================================
            //
            // Links de canais e mensagens do servidor atual
            // são completamente legítimos.
            //
            // Exemplo:
            //
            // discord.com/channels/GUILD/CANAL/MENSAGEM
            //
            // =============================================

            if (
                isInternalDiscordGuildLink(
                    url,
                    message.guildId
                )
            ) {
                continue;
            }

            // =============================================
            // CONVITES DO DISCORD
            // =============================================
            //
            // Convite continua protegido.
            //
            // Senior Creator NÃO ganha bypass automático
            // para convite de servidor externo.
            //
            // =============================================

            if (isDiscordInviteLink(url)) {
    const trustedDiscordInvite =
        await isTrustedDiscordInvite(
            message.client,
            link
        );

    if (trustedDiscordInvite) {
        continue;
    }

    if (seniorCreator) {
        continue;
    }

    if (isTicketChannel(message)) {
        continue;
    }

    violation =
        "Divulgação de convite/link de Discord não autorizado";

    break;
}

            const shorteners = [
                'bit.ly',
                't.co',
                'tinyurl.com',
                'goo.gl',
                'cutt.ly',
                'is.gd',
                'shre.ink',
                'rebrand.ly'
            ];

            // =============================================
            // ENCURTADORES
            // =============================================
            //
            // Mesmo Senior Creator continua sendo analisado
            // aqui porque encurtador esconde o destino real.
            //
            // =============================================

            if (shorteners.includes(domain)) {
                violation =
                    "Link encurtado suspeito detectado";

                break;
            }

            // =============================================
            // SENIOR CREATOR
            // =============================================
            //
            // Senior Creator pode compartilhar links
            // externos comuns.
            //
            // Isso NÃO interfere nas verificações posteriores
            // de scam, phishing, pornografia ou mídia.
            //
            // =============================================

            if (seniorCreator) {
                continue;
            }

            // =============================================
            // WHITELIST NORMAL
            // =============================================

            if (!CONFIG.allowedDomains.includes(domain)) {
                violation =
                    "Link externo não autorizado detectado";

                break;
            }
        } catch {
            violation =
                "Link com formato malicioso detectado";

            break;
        }
    }
}

        // 5. Palavras Proibidas (Porn/Scam)
        const normalizedContent = normalizeMessageContent(content);

        for (const regex of CONFIG.pornWords) {
            if (regex.test(normalizedContent)) {
                violation = "Conteúdo pornográfico detectado";
                break;
            }
        }

        if (!violation) {
            for (const regex of CONFIG.scamWords) {
                if (regex.test(normalizedContent)) {
                    violation = "Tentativa de golpe (Scam/Phishing) detectada";
                    break;
                }
            }
        }

        // 6. Mídia com legenda suspeita
if (!violation && hasSuspiciousAttachment(message)) {
    const suspiciousMediaText = [
        /onlyfans/i,
        /privacy/i,
        /nudes?/i,
        /porno/i,
        /porn/i,
        /xxx/i,
        /conteudo\s*adulto/i,
        /nitro\s*gratis/i,
        /free\s*nitro/i,
        /pix\s*gratis/i,
        /clique\s*aqui/i,
    ];

    if (suspiciousMediaText.some(regex => regex.test(normalizedContent))) {
        violation = "Mídia suspeita com conteúdo proibido";
    }
}

// =====================================================
// EXECUÇÃO DA PUNIÇÃO
// =====================================================

if (violation) {
    try {
        // =============================================
        // BYPASS COMPLETO
        // =============================================
        //
        // Rodney, Owner, Resp. Creators e qualquer
        // membro com Administrator não têm suas
        // mensagens removidas e não recebem punição.
        // =============================================

        if (isPunishmentExempt(message.member)) {
            return;
        }

        if (textAbuseViolation || fragmentedTextViolation) {
            await deleteRecentTextAbuseMessages(message);
        }

        if (message.deletable) {
            await message
                .delete()
                .catch(() => {});
        }

        await applyPunishment(
            message.member,
            message.guild,
            violation,
            content,
            message.channel
        );
    } catch (err) {
        console.error(
            '[ANTI FLOOD PROTECTOR] Erro ao punir:',
            err
        );
    }
}
    });

    console.log('[ANTI FLOOD PROTECTOR] Sistema inicializado com sucesso.');
}

/**
 * Handler de comandos administrativos
 */
async function handleCommands(message, state) {
    const args = message.content.split(/\s+/);
    const subCommand = args[1]?.toLowerCase();

    // Verifica se tem cargo autorizado para usar comandos do protector
    const isAuth = message.author.id === '660311795327828008' || 
                   message.member.roles.cache.some(r => CONFIG.ignoredRoles.includes(r.id));

    if (!isAuth) return;

    if (subCommand === 'status') {
        const embed = new EmbedBuilder()
            .setTitle('🛡️ Status do Protector')
            .setColor(state.enabled ? 'Green' : 'Red')
            .addFields(
                { name: 'Estado', value: state.enabled ? '🟢 Ligado' : '🔴 Desligado', inline: true },
                { name: 'Canais Protegidos', value: 'Todos (exceto bypass)', inline: true },
                { name: 'Usuários com Infrações', value: `${Object.keys(state.users).length}`, inline: true }
            );
        return message.reply({ embeds: [embed] });
    }

    if (subCommand === 'on') {
        state.enabled = true;
        saveState(state);
        return message.reply('✅ O sistema de proteção automática foi **ativado**.');
    }

    if (subCommand === 'off') {
        state.enabled = false;
        saveState(state);
        return message.reply('⚠️ O sistema de proteção automática foi **desativado**.');
    }

    if (subCommand === 'user') {
        const target = message.mentions.users.first() || (args[2] ? await message.client.users.fetch(args[2]).catch(() => null) : null);
        if (!target) return message.reply('❌ Mencione um usuário ou forneça um ID.');

        const userData = state.users[target.id];
        if (!userData) return message.reply(`👤 **${target.tag}** não possui histórico de infrações.`);

        const embed = new EmbedBuilder()
            .setTitle(`Histórico: ${target.tag}`)
            .setColor('Blue')
            .addFields(
                { name: 'Total de Infrações', value: `\`${userData.infractions}\``, inline: true },
                { name: 'Última Atividade', value: userData.lastInfractions.length > 0 ? `<t:${Math.floor(userData.lastInfractions[userData.lastInfractions.length - 1].ts / 1000)}:R>` : 'Nenhuma', inline: true }
            );
        
        if (userData.lastInfractions.length > 0) {
            const list = userData.lastInfractions.slice(-5).map(i => `• **${i.reason}** (<t:${Math.floor(i.ts/1000)}:d>)`).join('\n');
            embed.addFields({ name: 'Últimas 5 Infrações', value: list });
        }

        return message.reply({ embeds: [embed] });
    }

    if (subCommand === 'limpar') {
        const target = message.mentions.users.first() || (args[2] ? { id: args[2] } : null);
        if (!target) return message.reply('❌ Mencione um usuário para limpar o histórico.');

        if (state.users[target.id]) {
            delete state.users[target.id];
            saveState(state);
            return message.reply(`✅ Histórico de infrações de <@${target.id}> foi resetado.`);
        } else {
            return message.reply('❌ Este usuário não possui histórico.');
        }
    }
    
    return message.reply('❓ Comandos: `status`, `on`, `off`, `user @user`, `limpar @user`');
}

// =====================================================
// DETECÇÃO DE RAID TEXTUAL / MASS MENTION / LINKS
// =====================================================

function detectRaidSpam(message) {
    if (!CONFIG.raidSpam.enabled) {
        return null;
    }

    const content = String(message.content || '');
    const normalized = normalizeMessageContent(content);
    const massMentions = content.match(/@(everyone|here)/gi) || [];
    const links = content.match(/https?:\/\/[^\s<>()]+/gi) || [];
    const discordInvites =
        content.match(/(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[^\s<>()]+/gi) || [];

    const lines = content
        .split(/\r?\n/u)
        .map(line => line.trim().toLowerCase())
        .filter(Boolean);

    const lineFrequency = new Map();

    for (const line of lines) {
        lineFrequency.set(line, (lineFrequency.get(line) || 0) + 1);
    }

    const mostRepeatedLine = Math.max(0, ...lineFrequency.values());
    const attackLanguage =
        /\b(spamado|spammed|pwned|hacked|hackeado|owned|raid(?:ado)?|invadido)\b/i.test(normalized) ||
        /seguranca\s+do\s+servidor|spamados?\s+(?:de\s+)?novo/i.test(normalized);

    const longMessage = Array.from(content).length >= 300;
    const excessiveMassMentions =
        massMentions.length >= CONFIG.raidSpam.massMentionLimit;
    const excessiveLinks =
        links.length >= CONFIG.raidSpam.linkLimit;

    const detected =
        (
            excessiveMassMentions &&
            (links.length >= 1 || longMessage)
        ) ||
        (
            discordInvites.length >= 1 &&
            massMentions.length >= 3
        ) ||
        (
            attackLanguage &&
            massMentions.length >= 3 &&
            links.length >= 1
        ) ||
        (
            excessiveLinks &&
            mostRepeatedLine >= 2 &&
            longMessage
        );

    const now = message.createdTimestamp || Date.now();
    const cacheKey = `${message.guildId}:${message.author.id}`;
    const current = raidSpamCache.get(cacheKey) || [];

    current.push({
        channelId: message.channelId,
        messageId: message.id,
        ts: now,
    });

    const recent = current.filter(
        entry => Math.abs(now - entry.ts) <= CONFIG.raidSpam.historyWindowMs
    );

    raidSpamCache.set(cacheKey, recent);

    if (!detected) {
        return null;
    }

    const signals = [
        `${massMentions.length} ocorrências de @everyone/@here`,
        `${links.length} links`,
        `${discordInvites.length} convites do Discord`,
    ];

    if (attackLanguage) {
        signals.push('linguagem de invasão/raid');
    }

    if (mostRepeatedLine >= 2) {
        signals.push(`linha repetida ${mostRepeatedLine} vezes`);
    }

    return {
        reason: `Raid textual crítica detectada (${signals.join(', ')})`,
        history: recent,
    };
}

async function deleteRaidSpamMessages(message, history) {
    let deleted = 0;

    for (const entry of history) {
        const channel =
            message.guild.channels.cache.get(entry.channelId) ||
            await message.guild.channels.fetch(entry.channelId).catch(() => null);

        if (!channel?.isTextBased() || !channel.messages) {
            continue;
        }

        const target =
            channel.messages.cache.get(entry.messageId) ||
            await channel.messages.fetch(entry.messageId).catch(() => null);

        if (!target?.deletable) {
            continue;
        }

        const success = await target
            .delete()
            .then(() => true)
            .catch(() => false);

        if (success) {
            deleted++;
        }
    }

    raidSpamCache.delete(`${message.guildId}:${message.author.id}`);

    return deleted;
}

// =====================================================
// LIMPEZA AUTOMÁTICA QUANDO O BOT É INICIADO
// =====================================================

async function runStartupRaidCleanup(client) {
    if (!CONFIG.startupCleanup.enabled) {
        return;
    }

    const handledAuthors = new Set();
    let analyzed = 0;
    let removed = 0;

    for (const channelId of CONFIG.textAbuse.strictChannelIds) {
        const channel =
            client.channels.cache.get(channelId) ||
            await client.channels.fetch(channelId).catch(() => null);

        if (!channel?.isTextBased() || !channel.messages) {
            continue;
        }

        const collected = [];
        let before;

        while (collected.length < CONFIG.startupCleanup.maxMessagesPerChannel) {
            const remaining =
                CONFIG.startupCleanup.maxMessagesPerChannel - collected.length;

            const limit = Math.min(
                CONFIG.startupCleanup.pageSize,
                remaining
            );

            const page = await channel.messages.fetch({
                limit,
                ...(before ? { before } : {}),
            }).catch(() => null);

            if (!page?.size) {
                break;
            }

            collected.push(...page.values());
            before = page.last()?.id;

            if (page.size < limit) {
                break;
            }
        }

        collected.sort(
            (a, b) => a.createdTimestamp - b.createdTimestamp
        );

        for (const message of collected) {
            analyzed++;

            if (!message.guild || message.author.id === client.user?.id) {
                continue;
            }

            const isTrustedAutomation =
                CONFIG.textAbuse.trustedBotUserIds.includes(
                    String(message.author.id)
                );

            const isExplicitlyBlockedAutomation =
                CONFIG.textAbuse.blockedAutomationUserIds.includes(
                    String(message.author.id)
                );

            if (isTrustedAutomation && !isExplicitlyBlockedAutomation) {
                continue;
            }

            const detectedRaid = detectRaidSpam(message);

            const detection =
                detectedRaid ||
                (
                    isExplicitlyBlockedAutomation
                        ? {
                            reason: `Automação bloqueada diretamente pelo ID ${message.author.id}`,
                            history: [{
                                channelId: message.channelId,
                                messageId: message.id,
                                ts: message.createdTimestamp,
                            }],
                        }
                        : null
                );

            if (!detection) {
                continue;
            }

            const authorKey = `${message.guildId}:${message.author.id}`;

            if (handledAuthors.has(authorKey)) {
                if (message.deletable) {
                    const success = await message
                        .delete()
                        .then(() => true)
                        .catch(() => false);

                    if (success) {
                        removed++;
                    }
                }

                continue;
            }

            handledAuthors.add(authorKey);

            await punishRaidSpam(
                message,
                {
                    ...detection,
                    history: [{
                        channelId: message.channelId,
                        messageId: message.id,
                        ts: message.createdTimestamp,
                    }],
                }
            );

            removed++;
        }
    }

    console.log(
        `[ANTI FLOOD PROTECTOR] Limpeza inicial concluída: ` +
        `${analyzed} mensagens analisadas e ${removed} ataque(s) removido(s).`
    );
}