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
        imagesInSingleMessage: 4,

        // 2 imagens + @everyone/@here.
        imagesWithMassMention: 2,

        // Janela usada para identificar ataque em vários canais.
        windowMs: 20 * 1000,

        // Quantidade mínima de mensagens com mídia.
        messagesInWindow: 3,

        // Quantidade mínima de canais diferentes.
        channelsInWindow: 3,

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

    if (
        imageCount >=
        CONFIG.mediaAttack.imagesInSingleMessage
    ) {
        return {
            detected: true,

            reason:
                `Ataque de mídia detectado: ` +
                `${imageCount} imagens enviadas ` +
                `na mesma mensagem.`,

            history,
        };
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

    // Captura dados antes de apagar.
    const content =
        String(
            message.content || ''
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
        duration
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

async function logSecurityAction(client, guild, member, channel, reason, content, infractionCount, duration) {
    const logChannel = await client.channels.fetch(CONFIG.logChannelId).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    const now = new Date();
    const timestampSP = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const embed = new EmbedBuilder()
        .setTitle('🛡️ Proteção Ativa: Mensagem Removida')
        .setColor(infractionCount > 3 ? '#FF0000' : '#FFA500')
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: '👤 Usuário', value: `${member} (\`${member.id}\`)`, inline: true },
            { name: '📍 Canal', value: `${channel} (Ir ao Canal)`, inline: true },
            { name: '⚖️ Punição', value: `Timeout: \`${duration / 60000} min\``, inline: true },
            { name: '🚩 Reincidência', value: `\`${infractionCount}ª infração\``, inline: true },
            { name: '📝 Motivo Detectado', value: `\`${reason}\``, inline: false },
            { name: '💬 Conteúdo Removido', value: `\`\`\`${content.slice(0, 1000) || '[Sem Texto/Apenas Mídia]'}\`\`\``, inline: false },
            { name: '🕒 Horário (SP)', value: `\`${timestampSP}\``, inline: false },
            { name: '🔗 Links Úteis', value: `Perfil do Usuário`, inline: false }
        )
        .setFooter({ text: 'Sistema de Segurança SantaCreators' })
        .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(() => {});
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

    client.on(Events.MessageCreate, async (message) => {
        if (!message.guild || message.author.bot) return;
        
        const state = loadState();
        if (state.enabled === false) return;

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
        if (links.length > CONFIG.links.limit) {
            violation = "Excesso de links na mensagem";
        }

       if (links.length > 0) {
    for (const link of links) {
        try {
            const url = new URL(link);
            const domain = url.hostname.toLowerCase().replace(/^www\./, '');

            if (isDiscordInviteLink(url)) {
                if (!isTicketChannel(message)) {
                    violation = "Divulgação de convite/link de Discord não autorizado";
                    break;
                }

                continue;
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

            if (shorteners.includes(domain)) {
                violation = "Link encurtado suspeito detectado";
                break;
            }

            if (!CONFIG.allowedDomains.includes(domain)) {
                violation = "Link externo não autorizado detectado";
                break;
            }
        } catch {
            violation = "Link com formato malicioso detectado";
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