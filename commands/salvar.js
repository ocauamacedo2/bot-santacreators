import dotenv from 'dotenv';
dotenv.config();
import { resolveLogChannel } from '../events/channelResolver.js';

// ✅ Canais de log por categoria
const salvarCategorias = {
    salvarform: {
        canalId: process.env.LOG_SALVAR_FORM,
        titulo: '📝 Formulário Registrado'
    },
    salvaralerta: {
        canalId: process.env.LOG_SALVAR_ALERTA,
        titulo: '🚨 Alerta Registrado'
    },
    salvardoc: {
        canalId: process.env.LOG_SALVAR_DOC,
        titulo: '📄 Documento Registrado'
    },
    salvarideia: {
        canalId: process.env.LOG_SALVAR_IDEIA,
        titulo: '💡 Ideia Registrada'
    }
};

// ✅ Função para dividir mensagens
const dividirMensagem = (texto, limite = 2000) => {
    const partes = [];
    while (texto.length > 0) {
        let parte = texto.slice(0, limite);
        const ultimaNovaLinha = parte.lastIndexOf('\n');
        if (ultimaNovaLinha > 0) parte = parte.slice(0, ultimaNovaLinha);
        partes.push(parte.trim());
        texto = texto.slice(parte.length).trim();
    }
    return partes;
};

export default {
    name: 'salvar',
    description: 'Registra logs gerais (form, alerta, doc, ideia)',
    execute: async (message, args, client) => {
        if (!message.guild || message.author.bot) return;

        // Identifica qual comando foi usado (ex: !salvarform -> salvarform)
        const parts = message.content.split(' ');
        const commandName = parts[0].toLowerCase().replace('!', '');
        
        const categoria = salvarCategorias[commandName];
        if (!categoria || !categoria.canalId) return;

        // Pega o conteúdo após o comando
        const conteudo = message.content.slice(parts[0].length).trim();
        
        const canalLog = await resolveLogChannel(client, categoria.canalId);

        if (!canalLog) {
            return message.reply(`⚠️ Canal de log da categoria \`${commandName}\` não encontrado.`);
        }

        if (!conteudo && message.attachments.size === 0) {
            return message.reply('⚠️ Escreva algo ou envie um anexo para registrar.');
        }

        const anexosLinks = message.attachments.map(att => `${att.name}`).join('\n');
        const header = `**${categoria.titulo}**\n👤 **${message.author}** registrou:\n\n`;
        const rodape = `\n\n🕓 <t:${Math.floor(Date.now() / 1000)}:F> | Canal: <#${message.channel.id}>`;
        const mensagemCompleta = `${header}${conteudo}\n${anexosLinks ? '\n📎 **Anexos:**\n' + anexosLinks : ''}${rodape}`;

        const partes = dividirMensagem(mensagemCompleta);

        for (const parte of partes) {
            // Envia no canal atual (feedback) e no log
            await message.channel.send(parte);
            await canalLog.send(parte);
        }
    }
};
