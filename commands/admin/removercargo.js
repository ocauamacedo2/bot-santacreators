import { PermissionsBitField } from 'discord.js';

// Helper local para editar mensagem com segurança
const safeEdit = async (msg, content) => {
    try {
        if (msg && msg.editable) return await msg.edit(content);
    } catch { }
    return null;
};

export default {
    name: 'removercargo',
    description: 'Remove um cargo de quem tem outro específico.',
    execute: async (message, args, client) => {
        // Deleta o comando imediatamente
        await message.delete().catch(() => {});

        // Cargos autorizados
        const cargosPermitidos = ['660311795327828008', '1262262852949905408'];
        const temPermissao = message.member.roles.cache.some(role => cargosPermitidos.includes(role.id));

        if (!temPermissao) {
            const msg = await globalThis.safeSend(message.channel, '❌ Você não tem permissão para usar esse comando.');
            setTimeout(() => msg?.delete().catch(() => {}), 5000);
            return;
        }

        const roles = message.mentions.roles;
        if (roles.size < 2) {
            const msg = await globalThis.safeSend(
                message.channel,
                '❌ Você precisa mencionar dois cargos na **ordem correta**:\n\n' +
                '📤 **Primeiro**: cargo que será removido\n' +
                '📥 **Segundo**: cargo que será mantido e usado para listar os membros\n\n' +
                'Exemplo: `!removercargo @Cidadão @Inscritos`'
            );
            setTimeout(() => msg?.delete().catch(() => {}), 10000);
            return;
        }

        // Nota: A ordem das menções no Discord.js nem sempre é garantida pela ordem de digitação,
        // mas usamos a lógica solicitada: first() e o próximo.
        const cargoRemover = roles.first(); // @Cidadão (a ser removido)
        const cargoManter = [...roles.values()][1]; // @Inscritos (de referência)

        const aviso = await globalThis.safeSend(
            message.channel,
            `🔍 Iniciando...\nVerificando todos que têm **${cargoManter.name}** e também possuem **${cargoRemover.name}**...`
        );

        let contador = 0;
        let verificados = 0;

        try {
            // Force: true para garantir que pegamos todos os membros atualizados
            const membros = await message.guild.members.fetch({ force: true });
            const membrosFiltrados = membros.filter(m => m.roles.cache.has(cargoManter.id));
            const total = membrosFiltrados.size;

            for (const membro of membrosFiltrados.values()) {
                if (membro.roles.cache.has(cargoRemover.id)) {
                    try {
                        await membro.roles.remove(cargoRemover);
                        contador++;
                    } catch (err) {
                        console.warn(`❌ Falha ao remover de ${membro.user.tag}`);
                    }
                }

                verificados++;

                // Atualiza status a cada 10 processados ou no fim
                if (verificados % 10 === 0 || verificados === total) {
                    await safeEdit(
                        aviso,
                        `⏳ Processando...\nTotal com **${cargoManter.name}**: ${total}\nVerificados: ${verificados}\nRemovidos: ${contador}`
                    );
                }
            }

            await safeEdit(
                aviso,
                `✅ Finalizado!\nTotal com **${cargoManter.name}**: ${total}\nMembros que perderam **${cargoRemover.name}**: ${contador}`
            );
            setTimeout(() => aviso?.delete().catch(() => {}), 30000);

        } catch (err) {
            console.error('❌ Erro geral:', err);
            await safeEdit(
                aviso,
                '❌ Ocorreu um erro durante a execução. Verifique as permissões do bot.'
            );
            setTimeout(() => aviso?.delete().catch(() => {}), 30000);
        }
    }
};
