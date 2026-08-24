// utils/discordHealthDebug.js

export function installDiscordHealthDebug(client) {
    if (!client) {
        console.error(
            "[DISCORD_HEALTH] ❌ Client não informado ao instalar diagnóstico."
        );
        return;
    }

    if (globalThis.__discordHealthDebugInstalled) {
        console.log(
            "[DISCORD_HEALTH] ⚠️ Diagnóstico já instalado. Ignorando instalação duplicada."
        );
        return;
    }

    globalThis.__discordHealthDebugInstalled = true;

    console.log("[DISCORD_HEALTH] ✅ Diagnóstico instalado.");

    // ============================================================
    // READY
    // ============================================================

    client.on("ready", () => {
        console.log(
            `[DISCORD_HEALTH] 🟢 READY | ${client.user?.tag || client.user?.id || "desconhecido"}`
        );
    });

    // ============================================================
    // INTERAÇÕES
    // Serve apenas para diagnóstico.
    // NÃO responde a interação.
    // NÃO interfere nos handlers existentes.
    // ============================================================

    client.on("interactionCreate", (interaction) => {
        try {
            const commandName =
                interaction.isChatInputCommand?.()
                    ? interaction.commandName
                    : null;

            console.log("[DISCORD_HEALTH] 📥 INTERAÇÃO RECEBIDA", {
                id: interaction.id,
                type: interaction.type,
                commandName,
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                userId: interaction.user?.id,
                createdTimestamp: interaction.createdTimestamp,
                receivedAt: Date.now(),
                gatewayPing: client.ws?.ping
            });
        } catch (error) {
            console.error(
                "[DISCORD_HEALTH] Erro ao registrar interactionCreate:",
                error
            );
        }
    });

    // ============================================================
    // GATEWAY
    // ============================================================

    client.on("shardDisconnect", (event, shardId) => {
        console.error("[DISCORD_HEALTH] 🔴 SHARD DESCONECTOU", {
            shardId,
            code: event?.code,
            reason: event?.reason
        });
    });

    client.on("shardReconnecting", (shardId) => {
        console.warn("[DISCORD_HEALTH] 🟡 SHARD RECONECTANDO", {
            shardId
        });
    });

    client.on("shardResume", (shardId, replayedEvents) => {
        console.log("[DISCORD_HEALTH] 🟢 SHARD RETOMADO", {
            shardId,
            replayedEvents
        });
    });

    client.on("shardError", (error, shardId) => {
        console.error("[DISCORD_HEALTH] 🔴 SHARD ERROR", {
            shardId,
            name: error?.name,
            code: error?.code,
            message: error?.message,
            stack: error?.stack
        });
    });

    client.on("error", (error) => {
        console.error("[DISCORD_HEALTH] 🔴 CLIENT ERROR", {
            name: error?.name,
            code: error?.code,
            message: error?.message,
            stack: error?.stack
        });
    });

    client.on("warn", (warning) => {
        console.warn("[DISCORD_HEALTH] ⚠️ CLIENT WARNING", warning);
    });

    // ============================================================
    // REST / RATE LIMIT
    // ============================================================

    if (client.rest?.on) {
        client.rest.on("rateLimited", (info) => {
            console.warn("[DISCORD_HEALTH] 🟠 RATE LIMIT", {
                timeToReset: info?.timeToReset,
                limit: info?.limit,
                method: info?.method,
                hash: info?.hash,
                url: info?.url,
                route: info?.route,
                global: info?.global
            });
        });
    }

    // ============================================================
    // EVENT LOOP
    // Detecta quando algum código está bloqueando o Node.
    // ============================================================

    let expected = Date.now() + 1000;

    setInterval(() => {
        const now = Date.now();

        const lag = Math.max(
            0,
            now - expected
        );

        expected = now + 1000;

        if (lag >= 1000) {
            console.warn(
                `[DISCORD_HEALTH] ⚠️ EVENT LOOP ATRASADO: ${lag}ms`
            );
        }

        if (lag >= 5000) {
            console.error(
                `[DISCORD_HEALTH] 🔴 EVENT LOOP MUITO TRAVADO: ${lag}ms`
            );
        }
    }, 1000).unref?.();

    // ============================================================
    // TESTE HTTPS DIRETO COM DISCORD
    // Apenas a cada 5 minutos para não gerar carga desnecessária.
    // ============================================================

    async function testDiscordConnection() {
        const startedAt = Date.now();

        try {
            const controller = new AbortController();

            const timeout = setTimeout(() => {
                controller.abort();
            }, 10000);

            try {
                const response = await fetch(
                    "https://discord.com/api/v10/gateway",
                    {
                        method: "GET",
                        signal: controller.signal,
                        headers: {
                            "User-Agent": "SantaCreators-HealthCheck/1.0"
                        }
                    }
                );

                const durationMs = Date.now() - startedAt;

                console.log("[DISCORD_HEALTH] 🌐 DISCORD API OK", {
                    status: response.status,
                    durationMs,
                    gatewayPing: client.ws?.ping,
                    ready: client.isReady?.() ?? false
                });
            } finally {
                clearTimeout(timeout);
            }
        } catch (error) {
            console.error("[DISCORD_HEALTH] 🔴 DISCORD API INACESSÍVEL", {
                durationMs: Date.now() - startedAt,
                name: error?.name,
                code: error?.code,
                causeCode: error?.cause?.code,
                message: error?.message,
                causeMessage: error?.cause?.message,
                gatewayPing: client.ws?.ping,
                ready: client.isReady?.() ?? false
            });
        }
    }

    setTimeout(() => {
        testDiscordConnection().catch((error) => {
            console.error(
                "[DISCORD_HEALTH] Erro inesperado no primeiro teste:",
                error
            );
        });
    }, 15000).unref?.();

    setInterval(() => {
        testDiscordConnection().catch((error) => {
            console.error(
                "[DISCORD_HEALTH] Erro inesperado no teste periódico:",
                error
            );
        });
    }, 5 * 60 * 1000).unref?.();

    // ============================================================
    // STATUS GERAL
    // ============================================================

    setInterval(() => {
        const memory = process.memoryUsage();

        console.log("[DISCORD_HEALTH] 💓 STATUS", {
            ready: client.isReady?.() ?? false,
            gatewayPing: client.ws?.ping,
            guilds: client.guilds?.cache?.size,
            usersCached: client.users?.cache?.size,
            rssMB: Math.round(memory.rss / 1024 / 1024),
            heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
            uptimeSeconds: Math.round(process.uptime())
        });
    }, 5 * 60 * 1000).unref?.();
}