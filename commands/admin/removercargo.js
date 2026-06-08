import { PermissionsBitField } from 'discord.js';

// Helpers locais para lidar com mensagens com segurança
const safeSend = async (channel, content) => {
    try { return await channel.send(content); } catch { return null; }
};

const safeEdit = async (msg, content) => {
    try {
        if (msg && msg.editable) return await msg.edit(content);
    } catch { }
    return null;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default {
    name: 'removercargo',
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
            const msg = await safeSend(message.channel, '❌ Você não tem permissão para usar esse comando.');
            setTimeout(() => msg?.delete().catch(() => {}), 5000);
            return;
        }

        const guild = message.guild;

        const cargoInput = args[0]?.replace(/[<@&>]/g, '');

        if (!cargoInput) {
            const msg = await safeSend(
                message.channel,
                '❌ Você precisa informar o cargo que será removido.\n\n' +
                '✅ Exemplos:\n' +
                '`!removercargo @Cargo`\n' +
                '`!removercargo ID_DO_CARGO`'
            );
            setTimeout(() => msg?.delete().catch(() => {}), 10000);
            return;
        }

        const cargoRemover =
            message.mentions.roles.first() ||
            guild.roles.cache.get(cargoInput);

        if (!cargoRemover) {
            const msg = await safeSend(
                message.channel,
                '❌ Cargo não encontrado. Use menção do cargo ou ID válido.'
            );
            setTimeout(() => msg?.delete().catch(() => {}), 10000);
            return;
        }

        if (cargoRemover.managed) {
            const msg = await safeSend(
                message.channel,
                `❌ Não posso remover o cargo **${cargoRemover.name}** porque ele é gerenciado por integração/bot.`
            );
            setTimeout(() => msg?.delete().catch(() => {}), 15000);
            return;
        }

        const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);

        if (!botMember) {
            const msg = await safeSend(message.channel, '❌ Não consegui identificar o membro do bot no servidor.');
            setTimeout(() => msg?.delete().catch(() => {}), 15000);
            return;
        }

        if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            const msg = await safeSend(
                message.channel,
                '❌ O bot não tem permissão de **Gerenciar Cargos**.'
            );
            setTimeout(() => msg?.delete().catch(() => {}), 15000);
            return;
        }

        if (cargoRemover.position >= botMember.roles.highest.position) {
            const msg = await safeSend(
                message.channel,
                `❌ Não consigo remover o cargo **${cargoRemover.name}** porque ele está acima ou no mesmo nível do cargo mais alto do bot.`
            );
            setTimeout(() => msg?.delete().catch(() => {}), 20000);
            return;
        }

        const aviso = await safeSend(
            message.channel,
            `🔧 **Remoção em massa iniciada**\n\n` +
            `🎯 Cargo alvo: **${cargoRemover.name}**\n` +
            `👤 Solicitado por: ${message.author}\n\n` +
            `🔍 Buscando membros que possuem esse cargo...`
        );

        let membrosComCargo;

        try {
            membrosComCargo = await guild.members.fetch({ role: cargoRemover.id });
        } catch (err) {
            console.error('❌ Erro ao buscar membros pelo cargo:', err);

            await safeEdit(
                aviso,
                `❌ Não consegui buscar os membros com o cargo **${cargoRemover.name}**.\n` +
                `Verifique se o bot tem intents/permissões corretas.`
            );

            setTimeout(() => aviso?.delete().catch(() => {}), 30000);
            return;
        }

        const membros = [...membrosComCargo.values()];
        const total = membros.length;

        if (total === 0) {
            await safeEdit(
                aviso,
                `✅ Finalizado!\n\n` +
                `O cargo **${cargoRemover.name}** não estava em nenhum membro.`
            );

            setTimeout(() => aviso?.delete().catch(() => {}), 30000);
            return;
        }

        let removidos = 0;
        let falhas = 0;
        let verificados = 0;
        const erros = [];

        await safeEdit(
            aviso,
            `⏳ **Processando remoção em massa...**\n\n` +
            `🎯 Cargo alvo: **${cargoRemover.name}**\n` +
            `👥 Membros encontrados: **${total}**\n\n` +
            `✅ Removidos: **0**\n` +
            `❌ Falhas: **0**\n` +
            `📊 Progresso: **0/${total}**`
        );

        for (const membro of membros) {
            verificados++;

            try {
                if (!membro.roles.cache.has(cargoRemover.id)) {
                    continue;
                }

                if (membro.id === guild.ownerId) {
                    falhas++;
                    erros.push(`${membro.user.tag} — Dono do servidor`);
                    continue;
                }

                if (membro.roles.highest.position >= botMember.roles.highest.position) {
                    falhas++;
                    erros.push(`${membro.user.tag} — Cargo igual/acima do bot`);
                    continue;
                }

                if (!globalThis.__SC_ROLE_BYPASS__) {
                    globalThis.__SC_ROLE_BYPASS__ = new Map();
                }

                globalThis.__SC_ROLE_BYPASS__.set(membro.id, Date.now() + 30000);

                await membro.roles.remove(cargoRemover, `Remoção em massa solicitada por ${message.author.tag}`);

                removidos++;

                await sleep(350);
            } catch (err) {
                falhas++;
                erros.push(`${membro.user?.tag || membro.id} — ${err?.message || 'Erro desconhecido'}`);
                console.warn(`❌ Falha ao remover ${cargoRemover.name} de ${membro.user?.tag || membro.id}:`, err);
            }

            if (verificados % 5 === 0 || verificados === total) {
                await safeEdit(
                    aviso,
                    `⏳ **Removendo cargo em massa...**\n\n` +
                    `🎯 Cargo alvo: **${cargoRemover.name}**\n` +
                    `👥 Membros encontrados: **${total}**\n\n` +
                    `✅ Removidos: **${removidos}**\n` +
                    `❌ Falhas: **${falhas}**\n` +
                    `📊 Progresso: **${verificados}/${total}**`
                );
            }
        }

        const errosTexto = erros.length > 0
            ? `\n\n⚠️ **Algumas falhas:**\n${erros.slice(0, 10).map(e => `• ${e}`).join('\n')}${erros.length > 10 ? `\n...e mais ${erros.length - 10} falhas.` : ''}`
            : '';

        await safeEdit(
            aviso,
            `✅ **Remoção em massa finalizada!**\n\n` +
            `🎯 Cargo removido: **${cargoRemover.name}**\n` +
            `👥 Membros encontrados com o cargo: **${total}**\n` +
            `✅ Removidos com sucesso: **${removidos}**\n` +
            `❌ Falhas: **${falhas}**` +
            errosTexto
        );

        setTimeout(() => aviso?.delete().catch(() => {}), 60000);
    }
};