import dotenv from 'dotenv';
dotenv.config();

import {
    EmbedBuilder,
    AttachmentBuilder
} from 'discord.js';

import { resolveLogChannel } from '../events/channelResolver.js';

const LOG_SALVAR_CANAL_ID = '1486009544709509120';

// Comandos aceitos
const salvarCategorias = {
    salvarform: {
        titulo: '📝 Formulário Registrado',
        tipo: 'Formulário'
    },
    salvaralerta: {
        titulo: '🚨 Alerta Registrado',
        tipo: 'Alerta'
    },
    salvardoc: {
        titulo: '📄 Documento Registrado',
        tipo: 'Documento'
    },
    salvarideia: {
        titulo: '💡 Ideia Registrada',
        tipo: 'Ideia'
    }
};

const LIMITE_TEXTO = 3900;
const LIMITE_EMBEDS_POR_ENVIO = 10;
const LIMITE_FILES_POR_ENVIO = 10;

function dividirTexto(texto, limite = LIMITE_TEXTO) {
    if (!texto || typeof texto !== 'string') return [];

    const partes = [];
    let restante = texto.trim();

    while (restante.length > limite) {
        let corte = restante.slice(0, limite);
        const ultimaQuebra = corte.lastIndexOf('\n');

        if (ultimaQuebra > 500) {
            corte = corte.slice(0, ultimaQuebra);
        }

        partes.push(corte.trim());
        restante = restante.slice(corte.length).trim();
    }

    if (restante.length) {
        partes.push(restante);
    }

    return partes;
}

function formatBytes(bytes = 0) {
    if (!bytes || Number.isNaN(bytes)) return '0 B';

    const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
    let valor = bytes;
    let indice = 0;

    while (valor >= 1024 && indice < unidades.length - 1) {
        valor /= 1024;
        indice++;
    }

    return `${valor.toFixed(valor >= 10 || indice === 0 ? 0 : 2)} ${unidades[indice]}`;
}

function limitarTexto(texto, limite = 4096) {
    if (!texto) return null;
    return texto.length > limite ? `${texto.slice(0, limite - 3)}...` : texto;
}

function chunkArray(arr = [], size = 10) {
    const resultado = [];
    for (let i = 0; i < arr.length; i += size) {
        resultado.push(arr.slice(i, i + size));
    }
    return resultado;
}

function extensoCategoria(commandName) {
    return salvarCategorias[commandName]?.tipo || 'Registro';
}

function montarLinhasAnexos(message) {
    if (!message.attachments?.size) return 'Nenhum anexo';

    return message.attachments.map((att, index) => {
        const detalhes = [
            `**${index + 1}.** ${att.name || 'arquivo_sem_nome'}`,
            `Tipo: ${att.contentType || 'desconhecido'}`,
            `Tamanho: ${formatBytes(att.size || 0)}`,
            `Spoiler: ${att.spoiler ? 'Sim' : 'Não'}`
        ];

        if (att.width) detalhes.push(`Largura: ${att.width}px`);
        if (att.height) detalhes.push(`Altura: ${att.height}px`);
        if (att.duration) detalhes.push(`Duração: ${att.duration}s`);

        detalhes.push(`URL: ${att.url}`);

        return detalhes.join(' | ');
    }).join('\n');
}

function montarLinhasStickers(message) {
    if (!message.stickers?.size) return 'Nenhum sticker';

    return [...message.stickers.values()].map((sticker, index) => {
        return `**${index + 1}.** ${sticker.name || 'Sticker sem nome'} | ID: ${sticker.id} | URL: ${sticker.url || 'indisponível'}`;
    }).join('\n');
}

function montarDescricaoPrincipal(message, commandName, conteudo) {
    const timestampUnix = Math.floor(Date.now() / 1000);
    const categoriaNome = extensoCategoria(commandName);
    const jumpUrl = message.url || `https://discord.com/channels/${message.guild?.id}/${message.channel?.id}/${message.id}`;

    const blocos = [
        `**Categoria:** ${categoriaNome}`,
        `**Comando usado:** \`!${commandName}\``,
        `**Autor:** ${message.author}`,
        `**ID do autor:** \`${message.author.id}\``,
        `**Canal:** ${message.channel}`,
        `**ID do canal:** \`${message.channel.id}\``,
        `**Servidor:** ${message.guild?.name || 'DM/Desconhecido'}`,
        `**ID do servidor:** \`${message.guild?.id || 'desconhecido'}\``,
        `**Mensagem original:** [Clique aqui para abrir](${jumpUrl})`,
        `**Data:** <t:${timestampUnix}:F>`,
        `**Criado em:** <t:${Math.floor(message.createdTimestamp / 1000)}:F>`,
        `**Tem anexos:** ${message.attachments?.size ? `Sim (${message.attachments.size})` : 'Não'}`,
        `**Tem stickers:** ${message.stickers?.size ? `Sim (${message.stickers.size})` : 'Não'}`,
        `**Tem embeds na mensagem:** ${message.embeds?.length ? `Sim (${message.embeds.length})` : 'Não'}`,
        '',
        '**Conteúdo registrado:**',
        conteudo?.trim() ? conteudo : '_Sem texto. Apenas anexos, stickers ou embeds._',
        '',
        '**Anexos:**',
        montarLinhasAnexos(message),
        '',
        '**Stickers:**',
        montarLinhasStickers(message)
    ];

    return blocos.join('\n');
}

function criarEmbedPrincipal(message, commandName, conteudo) {
    const categoria = salvarCategorias[commandName];
    const descricaoBase = montarDescricaoPrincipal(message, commandName, conteudo);

    return new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(categoria?.titulo || '📁 Registro Salvo')
        .setDescription(limitarTexto(descricaoBase, 4096))
        .setFooter({
            text: `Mensagem ID: ${message.id}`
        })
        .setTimestamp(new Date(message.createdTimestamp));
}

function criarEmbedsConteudoExtra(textoGrande) {
    const partes = dividirTexto(textoGrande, LIMITE_TEXTO);

    if (!partes.length) return [];

    return partes.map((parte, index) => {
        return new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`📄 Continuação do conteúdo (${index + 1}/${partes.length})`)
            .setDescription(limitarTexto(parte, 4096))
            .setTimestamp();
    });
}

function criarEmbedsParaAnexos(message) {
    if (!message.attachments?.size) return [];

    return message.attachments.map((att, index) => {
        const embed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle(`📎 Anexo ${index + 1}`)
            .setDescription(limitarTexto(
                [
                    `**Nome:** ${att.name || 'arquivo_sem_nome'}`,
                    `**Tipo:** ${att.contentType || 'desconhecido'}`,
                    `**Tamanho:** ${formatBytes(att.size || 0)}`,
                    att.width ? `**Largura:** ${att.width}px` : null,
                    att.height ? `**Altura:** ${att.height}px` : null,
                    att.duration ? `**Duração:** ${att.duration}s` : null,
                    `**Spoiler:** ${att.spoiler ? 'Sim' : 'Não'}`,
                    `**Abrir arquivo:** [Clique aqui](${att.url})`
                ].filter(Boolean).join('\n'),
                4096
            ))
            .setTimestamp();

        if (att.contentType?.startsWith('image/')) {
            embed.setImage(att.url);
        }

        return embed;
    });
}

async function montarArquivosParaReenvio(message) {
    if (!message.attachments?.size) return [];

    const arquivos = [];

    for (const att of message.attachments.values()) {
        try {
            arquivos.push(new AttachmentBuilder(att.url, { name: att.name || `arquivo_${att.id}` }));
        } catch (err) {
            console.error('[salvar] erro ao preparar anexo para reenvio:', err);
        }
    }

    return arquivos;
}

async function enviarComSeguranca(canal, payload) {
    try {
        return await canal.send(payload);
    } catch (error) {
        console.error('[salvar] erro ao enviar log:', error);

        const fallbackTexto = [];
        fallbackTexto.push('⚠️ Não foi possível enviar a estrutura completa do log.');
        fallbackTexto.push(`Erro: \`${error?.message || 'desconhecido'}\``);

        if (payload?.content) {
            fallbackTexto.push('');
            fallbackTexto.push(payload.content);
        }

        return canal.send({
            content: limitarTexto(fallbackTexto.join('\n'), 2000)
        }).catch((fallbackError) => {
            console.error('[salvar] erro também no fallback do log:', fallbackError);
            return null;
        });
    }
}

export default {
    name: 'salvar',
    description: 'Registra logs gerais (form, alerta, doc, ideia) com preservação máxima de conteúdo.',
    execute: async (message, args, client) => {
        try {
            if (!message.guild || message.author.bot) return;

            const partesComando = message.content.trim().split(/\s+/);
            const commandName = (partesComando[0] || '').toLowerCase().replace('!', '');

            const categoria = salvarCategorias[commandName];
            if (!categoria) return;

            const conteudo = message.content.slice(partesComando[0].length).trim();
            const possuiTexto = !!conteudo;
            const possuiAnexos = message.attachments?.size > 0;
            const possuiStickers = message.stickers?.size > 0;
            const possuiEmbeds = Array.isArray(message.embeds) && message.embeds.length > 0;

            if (!possuiTexto && !possuiAnexos && !possuiStickers && !possuiEmbeds) {
                await message.reply('⚠️ Escreva algo ou envie um anexo, sticker ou embed para registrar.');
                return;
            }

            const canalLog = await resolveLogChannel(client, LOG_SALVAR_CANAL_ID);

            if (!canalLog) {
                await message.reply(`⚠️ Não consegui encontrar o canal de log configurado: \`${LOG_SALVAR_CANAL_ID}\`.`);
                return;
            }

            const embedPrincipal = criarEmbedPrincipal(message, commandName, conteudo);
            const embedsConteudoExtra = possuiTexto ? criarEmbedsConteudoExtra(conteudo) : [];
            const embedsAnexos = criarEmbedsParaAnexos(message);

            const embedsOriginaisValidos = (message.embeds || []).slice(0, 10).map((embed) => {
                try {
                    return EmbedBuilder.from(embed);
                } catch {
                    return null;
                }
            }).filter(Boolean);

            const todosEmbeds = [
                embedPrincipal,
                ...embedsConteudoExtra,
                ...embedsAnexos,
                ...embedsOriginaisValidos
            ];

            const arquivosParaReenvio = await montarArquivosParaReenvio(message);

            const gruposEmbeds = chunkArray(todosEmbeds, LIMITE_EMBEDS_POR_ENVIO);
            const gruposArquivos = chunkArray(arquivosParaReenvio, LIMITE_FILES_POR_ENVIO);

            if (!gruposEmbeds.length && !gruposArquivos.length) {
                await enviarComSeguranca(canalLog, {
                    content: '⚠️ O registro foi recebido, mas não havia nada válido para enviar.'
                });
            } else {
                const maiorTotal = Math.max(gruposEmbeds.length, gruposArquivos.length);

                for (let i = 0; i < maiorTotal; i++) {
                    const embeds = gruposEmbeds[i] || [];
                    const files = gruposArquivos[i] || [];

                    await enviarComSeguranca(canalLog, {
                        embeds,
                        files
                    });
                }
            }

            const resposta = new EmbedBuilder()
                .setColor(0x57f287)
                .setTitle('✅ Registro salvo com sucesso')
                .setDescription(
                    [
                        `**Tipo:** ${categoria.tipo}`,
                        `**Canal de log:** <#${LOG_SALVAR_CANAL_ID}>`,
                        `**Texto:** ${possuiTexto ? 'Sim' : 'Não'}`,
                        `**Anexos:** ${message.attachments?.size || 0}`,
                        `**Stickers:** ${message.stickers?.size || 0}`,
                        `**Embeds:** ${message.embeds?.length || 0}`
                    ].join('\n')
                )
                .setTimestamp();

            await message.reply({ embeds: [resposta] }).catch(() => null);
        } catch (error) {
            console.error('[salvar] erro geral:', error);

            await message.reply(`⚠️ Ocorreu um erro ao registrar a mensagem.\n\`${error?.message || 'Erro desconhecido'}\``).catch(() => null);
        }
    }
};