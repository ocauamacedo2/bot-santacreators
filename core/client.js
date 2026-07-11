import { Client, GatewayIntentBits, Partials } from "discord.js";

// =====================================================
// Client Singleton (Garante apenas uma instância)
// =====================================================

if (!globalThis.__SC_CLIENT__) {
  globalThis.__SC_CLIENT__ = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildBans,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageTyping,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.DirectMessageReactions,
      GatewayIntentBits.DirectMessageTyping,
    ],
    partials: [
      Partials.GuildMember,
      Partials.User,
      Partials.Message,
      Partials.Channel,
      Partials.Reaction,
    ],
    allowedMentions: {
      parse: [],
      repliedUser: false,
    },
  });
}

export const client = globalThis.__SC_CLIENT__;

// Compatibilidade para módulos que buscam no global
globalThis.client = client;

// =====================================================
// Envio seguro e diagnóstico global de mensagens privadas
// =====================================================

export async function enviarMensagemPrivadaSegura(
  usuarioOuMembro,
  payload,
  contexto = "SEM_CONTEXTO"
) {
  const usuario = usuarioOuMembro?.user || usuarioOuMembro;

  if (!usuario?.id) {
    console.error(`[DM GLOBAL][${contexto}] Usuário inválido recebido.`, {
      usuarioOuMembro,
    });

    return {
      sucesso: false,
      status: "usuario_invalido",
      codigo: null,
      mensagem: "Usuário ou membro inválido.",
    };
  }

  if (usuario.bot) {
    console.warn(
      `[DM GLOBAL][${contexto}] Envio ignorado porque o destinatário é outro bot: ` +
      `${usuario.tag || usuario.username || usuario.id} (${usuario.id}).`
    );

    return {
      sucesso: false,
      status: "destinatario_bot",
      codigo: null,
      mensagem: "O destinatário é um bot.",
    };
  }

  try {
    /*
     * Busca novamente o usuário diretamente pela API.
     *
     * Isso evita depender somente de um User ou GuildMember antigo,
     * parcial ou desatualizado no cache.
     */
    const usuarioAtualizado = await client.users.fetch(usuario.id, {
      force: true,
    });

    /*
     * Abre ou recupera explicitamente o canal privado.
     *
     * user.send() também faz isso internamente, mas separar as etapas
     * permite identificar se o erro ocorreu ao criar a DM ou ao enviar.
     */
    const canalPrivado = await usuarioAtualizado.createDM();

    const mensagemEnviada = await canalPrivado.send(
      typeof payload === "string"
        ? {
            content: payload,
            allowedMentions: {
              parse: [],
            },
          }
        : {
            ...payload,
            allowedMentions: {
              parse: [],
              ...(payload?.allowedMentions || {}),
            },
          }
    );

    console.log(
      `[DM GLOBAL][${contexto}] ✅ Mensagem privada enviada para ` +
      `${usuarioAtualizado.tag || usuarioAtualizado.username} ` +
      `(${usuarioAtualizado.id}). Mensagem: ${mensagemEnviada.id}.`
    );

    return {
      sucesso: true,
      status: "enviado",
      codigo: null,
      mensagem: null,
      messageId: mensagemEnviada.id,
    };
  } catch (erro) {
    const codigo =
      erro?.code ??
      erro?.rawError?.code ??
      erro?.status ??
      null;

    const mensagemErro =
      erro?.rawError?.message ||
      erro?.message ||
      String(erro);

    if (codigo === 50007) {
      console.warn(
        `[DM GLOBAL][${contexto}] ⚠️ Discord recusou a mensagem privada para ` +
        `${usuario.tag || usuario.username || usuario.id} (${usuario.id}).`,
        {
          codigo,
          mensagem: mensagemErro,
          causasProvaveis: [
            "O usuário bloqueou o bot novo.",
            "O usuário desativou mensagens privadas do servidor.",
            "O Discord bloqueou a DM por segurança ou antispam.",
            "O bot e o usuário não compartilham mais um servidor.",
          ],
        }
      );

      return {
        sucesso: false,
        status: "discord_bloqueou_dm",
        codigo,
        mensagem: mensagemErro,
      };
    }

    if (codigo === 50001) {
      console.error(
        `[DM GLOBAL][${contexto}] ❌ O bot não possui acesso ao destinatário.`,
        {
          usuarioId: usuario.id,
          codigo,
          mensagem: mensagemErro,
        }
      );

      return {
        sucesso: false,
        status: "sem_acesso",
        codigo,
        mensagem: mensagemErro,
      };
    }

    if (codigo === 10013) {
      console.error(
        `[DM GLOBAL][${contexto}] ❌ Usuário desconhecido ou ID inválido.`,
        {
          usuarioId: usuario.id,
          codigo,
          mensagem: mensagemErro,
        }
      );

      return {
        sucesso: false,
        status: "usuario_desconhecido",
        codigo,
        mensagem: mensagemErro,
      };
    }

    console.error(
      `[DM GLOBAL][${contexto}] ❌ Erro inesperado ao enviar mensagem privada.`,
      {
        usuarioId: usuario.id,
        usuarioTag: usuario.tag || usuario.username || "DESCONHECIDO",
        codigo: codigo ?? "SEM_CODIGO",
        statusHttp: erro?.status ?? "SEM_STATUS_HTTP",
        metodo: erro?.method ?? "SEM_METODO",
        url: erro?.url ?? "SEM_URL",
        mensagem: mensagemErro,
        stack: erro?.stack,
      }
    );

    return {
      sucesso: false,
      status: "erro_inesperado",
      codigo,
      mensagem: mensagemErro,
    };
  }
}

// Compatibilidade para módulos antigos que utilizam funções globais
globalThis.enviarMensagemPrivadaSegura = enviarMensagemPrivadaSegura;