import { PermissionsBitField, EmbedBuilder } from 'discord.js';

// Helpers locais para lidar com mensagens com segurança
const safeSend = async (channel, content) => {
    try {
        return await channel.send(content);
    } catch (err) {
        console.error('❌ Erro ao enviar mensagem:', err);
        return null;
    }
};

const safeEdit = async (msg, content) => {
    try {
        if (msg && msg.editable) {
            return await msg.edit(content);
        }
    } catch (err) {
        console.error('❌ Erro ao editar mensagem:', err);
    }

    return null;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const criarEmbedStatus = ({
    titulo,
    descricao,
    cargo,
    autor,
    total = 0,
    verificados = 0,
    removidos = 0,
    falhas = 0,
    cor = 0x8b00ff
}) => {
    return new EmbedBuilder()
        .setColor(cor)
        .setTitle(titulo)
        .setDescription(descricao)
        .addFields(
            {
                name: '🎯 Cargo alvo',
                value: cargo ? `${cargo}` : 'Não identificado',
                inline: true
            },
            {
                name: '👤 Solicitado por',
                value: autor ? `${autor}` : 'Não identificado',
                inline: true
            },
            {
                name: '👥 Encontrados',
                value: `${total}`,
                inline: true
            },
            {
                name: '📊 Verificados',
                value: `${verificados}/${total}`,
                inline: true
            },
            {
                name: '✅ Removidos',
                value: `${removidos}`,
                inline: true
            },
            {
                name: '❌ Falhas',
                value: `${falhas}`,
                inline: true
            }
        )
        .setFooter({ text: 'SantaCreators • Remoção em massa de cargos' })
        .setTimestamp();
};

export default {
    name: 'removercargo',
    aliases: ['remover', 'remcargo'],
    description: 'Remove um cargo de todos os membros do servidor.',
    execute: async (message, args, client) => {
        await message.delete().catch(() => {});

        const idsPermitidos = [
            '660311795327828008',
            '1262262852949905408'
        ];

        const temPermissao =
            idsPermitidos.includes(message.author.id) ||
            message.member.roles.cache.some(role => idsPermitidos.includes(role.id));

        if (!temPermissao) {
            const msg = await safeSend(message.channel, {
                content: '❌ Você não tem permissão para usar esse comando.'
            });

            setTimeout(() => msg?.delete().catch(() => {}), 5000);
            return;
        }

        const guild = message.guild;

        if (!guild) {
            await safeSend(message.channel, {
                content: '❌ Esse comando só pode ser usado dentro de um servidor.'
            });
            return;
        }

        const cargoInput = args[0]?.replace(/[<@&>]/g, '');

        if (!cargoInput) {
            const msg = await safeSend(message.channel, {
                content:
                    '❌ Você precisa informar o cargo que será removido.\n\n' +
                    '✅ Exemplos:\n' +
                    '`!remover @Cargo`\n' +
                    '`!removercargo @Cargo`\n' +
                    '`!remcargo ID_DO_CARGO`'
            });

            setTimeout(() => msg?.delete().catch(() => {}), 15000);
            return;
        }

        const cargoRemover =
            message.mentions.roles.first() ||
            guild.roles.cache.get(cargoInput);

        if (!cargoRemover) {
            const msg = await safeSend(message.channel, {
                content: '❌ Cargo não encontrado. Use a menção do cargo ou um ID válido.'
            });

            setTimeout(() => msg?.delete().catch(() => {}), 15000);
            return;
        }

        const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);

        if (!botMember) {
            const msg = await safeSend(message.channel, {
                content: '❌ Não consegui identificar o bot dentro do servidor.'
            });

            setTimeout(() => msg?.delete().catch(() => {}), 15000);
            return;
        }

        if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            const msg = await safeSend(message.channel, {
                content: '❌ O bot não possui a permissão **Gerenciar Cargos**.'
            });

            setTimeout(() => msg?.delete().catch(() => {}), 20000);
            return;
        }

        if (cargoRemover.managed) {
            const msg = await safeSend(message.channel, {
                content: `❌ O cargo **${cargoRemover.name}** é gerenciado por integração/bot e não pode ser removido manualmente.`
            });

            setTimeout(() => msg?.delete().catch(() => {}), 20000);
            return;
        }

        if (cargoRemover.position >= botMember.roles.highest.position) {
            const msg = await safeSend(message.channel, {
                content:
                    `❌ Não consigo remover o cargo **${cargoRemover.name}**.\n\n` +
                    `O cargo está acima ou no mesmo nível do cargo mais alto do bot.\n` +
                    `Coloque o cargo do bot acima de **${cargoRemover.name}** na hierarquia.`
            });

            setTimeout(() => msg?.delete().catch(() => {}), 30000);
            return;
        }

        const aviso = await safeSend(message.channel, {
            embeds: [
                criarEmbedStatus({
                    titulo: '🔧 Remoção em massa iniciada',
                    descricao: 'Buscando membros que possuem o cargo informado...',
                    cargo: cargoRemover,
                    autor: message.author,
                    cor: 0xf1c40f
                })
            ]
        });

        let membrosComCargo;

        try {
            membrosComCargo = await guild.members.fetch({ role: cargoRemover.id });
        } catch (err) {
            console.error('❌ Erro ao buscar membros pelo cargo:', err);

            await safeEdit(aviso, {
                embeds: [
                    criarEmbedStatus({
                        titulo: '❌ Erro ao buscar membros',
                        descricao:
                            'Não consegui buscar os membros com esse cargo.\n\n' +
                            'Verifique se o bot tem a intent **Guild Members** ativada no portal do Discord e no código principal.',
                        cargo: cargoRemover,
                        autor: message.author,
                        cor: 0xff0000
                    })
                ]
            });

            return;
        }

        const membros = [...membrosComCargo.values()];
        const total = membros.length;

        if (total === 0) {
            await safeEdit(aviso, {
                embeds: [
                    criarEmbedStatus({
                        titulo: '✅ Finalizado',
                        descricao: `Nenhum membro possui o cargo **${cargoRemover.name}**.`,
                        cargo: cargoRemover,
                        autor: message.author,
                        total,
                        cor: 0x2ecc71
                    })
                ]
            });

            return;
        }

        let removidos = 0;
        let falhas = 0;
        let verificados = 0;
        const erros = [];

        await safeEdit(aviso, {
            embeds: [
                criarEmbedStatus({
                    titulo: '⏳ Remoção em andamento',
                    descricao: 'O bot começou a remover o cargo dos membros encontrados.',
                    cargo: cargoRemover,
                    autor: message.author,
                    total,
                    verificados,
                    removidos,
                    falhas,
                    cor: 0x3498db
                })
            ]
        });

        for (const membro of membros) {
            verificados++;

            try {
                const membroAtualizado = await guild.members.fetch(membro.id).catch(() => membro);

                if (!membroAtualizado.roles.cache.has(cargoRemover.id)) {
                    continue;
                }

                if (membroAtualizado.id === guild.ownerId) {
                    falhas++;
                    erros.push(`${membroAtualizado.user.tag} — Dono do servidor`);
                    continue;
                }

                if (membroAtualizado.roles.highest.position >= botMember.roles.highest.position) {
                    falhas++;
                    erros.push(`${membroAtualizado.user.tag} — Cargo igual/acima do bot`);
                    continue;
                }

                if (!globalThis.__SC_ROLE_BYPASS__) {
                    globalThis.__SC_ROLE_BYPASS__ = new Map();
                }

                globalThis.__SC_ROLE_BYPASS__.set(membroAtualizado.id, Date.now() + 60000);

                await membroAtualizado.roles.remove(
                    cargoRemover.id,
                    `Remoção em massa solicitada por ${message.author.tag}`
                );

                removidos++;

                await sleep(500);
            } catch (err) {
                falhas++;

                const erroTexto = err?.message || 'Erro desconhecido';
                erros.push(`${membro.user?.tag || membro.id} — ${erroTexto}`);

                console.warn(
                    `❌ Falha ao remover ${cargoRemover.name} de ${membro.user?.tag || membro.id}:`,
                    err
                );
            }

            if (verificados % 1 === 0 || verificados === total) {
                await safeEdit(aviso, {
                    embeds: [
                        criarEmbedStatus({
                            titulo: '⏳ Remoção em andamento',
                            descricao: 'Removendo o cargo dos membros encontrados...',
                            cargo: cargoRemover,
                            autor: message.author,
                            total,
                            verificados,
                            removidos,
                            falhas,
                            cor: 0x3498db
                        })
                    ]
                });
            }
        }

        const errosTexto = erros.length > 0
            ? erros.slice(0, 8).map(e => `• ${e}`).join('\n')
            : 'Nenhuma falha registrada.';

        await safeEdit(aviso, {
            embeds: [
                new EmbedBuilder()
                    .setColor(falhas > 0 ? 0xf1c40f : 0x2ecc71)
                    .setTitle('✅ Remoção em massa finalizada')
                    .setDescription(
                        `O processo de remoção do cargo **${cargoRemover.name}** foi concluído.`
                    )
                    .addFields(
                        {
                            name: '🎯 Cargo removido',
                            value: `${cargoRemover}`,
                            inline: true
                        },
                        {
                            name: '👥 Membros encontrados',
                            value: `${total}`,
                            inline: true
                        },
                        {
                            name: '✅ Removidos com sucesso',
                            value: `${removidos}`,
                            inline: true
                        },
                        {
                            name: '❌ Falhas',
                            value: `${falhas}`,
                            inline: true
                        },
                        {
                            name: '📋 Detalhes das falhas',
                            value: errosTexto.length > 1024 ? errosTexto.slice(0, 1000) + '...' : errosTexto,
                            inline: false
                        }
                    )
                    .setFooter({ text: 'SantaCreators • Remoção concluída' })
                    .setTimestamp()
            ]
        });
    }
};