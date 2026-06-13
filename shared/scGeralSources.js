import fs from "node:fs";
import path from "node:path";

export const GERAL_CHANNELS = {
    PODERES: ["1374066813171929218"],
    EVENTOS: ["1515128485331468318"],
    EVENTOS_PODER: ["1392618646630568076"],
    PAGAMENTOS: ["1387922662134775818"],
    MANAGER: ["1486084441762693291", "1392680204517769277"],
    ALINHAMENTOS: ["1425256185707233301", "1515132246728638574"],
    DOACOES: ["1486009647923200120"],
    CONVITES: ["1486009598237212793", "1415102820826349648"],
    PERGUNTAS: ["1486084249755979950", "1486084237772718120"], 
    VENDAS: ["1486084262867370105"],
    CRONOGRAMA: ["1486009619846529075", "1387864036259004436"],
    PRESENCA: ["1486006866046615682"],
    CORRECAO: ["1486006908056899748", "1486084249755979950"],
    VIP: ["1414718336826081330"],
    HALL: ["1386503496353976470"]
};

export const GERAL_PARSERS = {
    norm: (s) => String(s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase(),
    
    getFields: (emb) => emb?.fields || emb?.data?.fields || [],

    getEmbedText: (emb) => {
        const data = emb?.data || emb || {};
        const parts = [data.title, data.description, data.footer?.text];
        for (const f of data.fields || []) { parts.push(f.name, f.value); }
        return parts.filter(Boolean).join("\n").toLowerCase();
    },

    extractId: (raw) => {
        let m = /<@!?(\d{17,22})>/.exec(String(raw || ""));
        if (m) return m[1];
        m = /`(\d{17,22})`/.exec(String(raw || ""));
        if (m) return m[1];
        m = /\b(\d{17,22})\b/.exec(String(raw || ""));
        return m ? m[1] : null;
    },

    // --- PODERES ---
    isPoderes: (emb) => {
        const title = GERAL_PARSERS.norm(emb?.title || emb?.data?.title || "");
        const text = GERAL_PARSERS.getEmbedText(emb);

        return (
            title.includes("registro") &&
            title.includes("poderes") &&
            title.includes("utilizados")
        ) || (
            text.includes("registro") &&
            text.includes("poderes") &&
            text.includes("utilizados")
        );
    },

    getPoderesUserId: (emb) => {
        const fields = GERAL_PARSERS.getFields(emb);

        const f =
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("id")) ||
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("usuario")) ||
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("usuário"));

        return f
            ? GERAL_PARSERS.extractId(String(f.value || ""))
            : GERAL_PARSERS.extractId(GERAL_PARSERS.getEmbedText(emb));
    },

    // --- EVENTOS ---
    isEvento: (emb) => {
        const title = GERAL_PARSERS.norm(emb?.title || emb?.data?.title || "");
        const text = GERAL_PARSERS.getEmbedText(emb);

        const isPoderEvento =
            title.includes("uso de poderes") ||
            text.includes("uso de poderes") ||
            (text.includes("poderes") && text.includes("evento"));

        return (
            title.includes("registro") &&
            title.includes("evento") &&
            !isPoderEvento
        );
    },

    isEventoPoder: (emb) => {
        const title = GERAL_PARSERS.norm(emb?.title || emb?.data?.title || "");
        const text = GERAL_PARSERS.getEmbedText(emb);

        return (
            title.includes("uso de poderes") ||
            text.includes("uso de poderes") ||
            (text.includes("registro") && text.includes("poderes") && text.includes("evento"))
        );
    },

    getEventoRegistrarId: (emb) => {
        const fields = GERAL_PARSERS.getFields(emb);

        const f =
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("registrado por")) ||
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("registrador")) ||
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("autor"));

        return f
            ? GERAL_PARSERS.extractId(String(f.value || ""))
            : GERAL_PARSERS.extractId(GERAL_PARSERS.getEmbedText(emb));
    },

    // --- ALINHAMENTOS ---
    isAlinhamento: (emb) => {
        const text = GERAL_PARSERS.getEmbedText(emb);
        const title = GERAL_PARSERS.norm(emb?.title || emb?.data?.title || "");
        return text.includes("alinhamento") || text.includes("alinv1") || (title.includes("registro") && title.includes("alinhamento"));
    },
    getAlinhadorId: (emb) => {
        const fields = GERAL_PARSERS.getFields(emb);
        const f = fields.find(x => {
            const n = GERAL_PARSERS.norm(x.name);
            return n.includes("quem alinhou") || n.includes("alinhou") || n.includes("registrado por") || n.includes("autor") || n.includes("registrador");
        });
        return f ? GERAL_PARSERS.extractId(f.value) : GERAL_PARSERS.extractId(GERAL_PARSERS.getEmbedText(emb));
    },
    isAlinhamentoValido: (emb) => {
        const fields = GERAL_PARSERS.getFields(emb);
        const f = fields.find(x => GERAL_PARSERS.norm(x.name).includes("status"));
        const val = GERAL_PARSERS.norm(f?.value || "");
        // ✅ Garante que "não válido", "reprovado", "pendente" ou "aguardando" seja ignorado
        return (val.includes("valido") || val.includes("aprovado")) && !val.includes("nao") && !val.includes("pendente") && !val.includes("aguardando");
    },

    // --- PAGAMENTOS ---
    isPagamento: (emb) => {
        const text = GERAL_PARSERS.getEmbedText(emb);
        return (
            text.includes("registro de pagamento de evento") ||
            text.includes("pagamento de evento") ||
            text.includes("pagamento social") ||
            text.includes("santacreators")
        );
    },

    getPagamentoRegistrarId: (emb) => {
        const fields = GERAL_PARSERS.getFields(emb);

        const f =
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("criador do registro")) ||
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("registrado por")) ||
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("registro")) ||
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("autor"));

        return f
            ? GERAL_PARSERS.extractId(String(f.value || ""))
            : GERAL_PARSERS.extractId(GERAL_PARSERS.getEmbedText(emb));
    },

    getPagamentoStatus: (emb) => {
        const fields = GERAL_PARSERS.getFields(emb);

        const statusField = fields.find((f) =>
            GERAL_PARSERS.norm(f?.name).includes("status")
        );

        const raw = String(statusField?.value || "");
        const n = GERAL_PARSERS.norm(raw);

        const isPago =
            /✅\s*\*{0,2}PAGO\*{0,2}/i.test(raw) ||
            /^pago\b/i.test(n) ||
            n.includes(" pago");

        const isReprovado =
            /❌\s*\*{0,2}REPROVADO\*{0,2}/i.test(raw) ||
            n.includes("reprovado");

        const isSolicitado =
            n.includes("solicitado") ||
            n.includes("ja foi solicitado") ||
            n.includes("já foi solicitado");

        return {
            isPago,
            isReprovado,
            isSolicitado,
        };
    },

    // --- MANAGER ---
    isManager: (emb) => {
        const text = GERAL_PARSERS.getEmbedText(emb);
        return (
            text.includes("registro de evento - manager") ||
            text.includes("registro manager") ||
            text.includes("log") && text.includes("manager")
        );
    },

    getManagerId: (emb) => {
        const fields = GERAL_PARSERS.getFields(emb);

        const f =
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("manager responsavel")) ||
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("manager responsável")) ||
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("registrado por"));

        return f
            ? GERAL_PARSERS.extractId(String(f.value || ""))
            : GERAL_PARSERS.extractId(GERAL_PARSERS.getEmbedText(emb));
    },

    isManagerApproved: (emb) => {
        const text = GERAL_PARSERS.getEmbedText(emb);
        const fields = GERAL_PARSERS.getFields(emb);

        return (
            fields.some((f) => GERAL_PARSERS.norm(f?.name).includes("aprovado por")) ||
            text.includes("aprovado por") ||
            text.includes("aprovado")
        );
    },

    isManagerRejected: (emb) => {
        const text = GERAL_PARSERS.getEmbedText(emb);
        const fields = GERAL_PARSERS.getFields(emb);

        return (
            fields.some((f) => GERAL_PARSERS.norm(f?.name).includes("reprovado por")) ||
            text.includes("reprovado por") ||
            text.includes("reprovado") ||
            text.includes("recusado") ||
            text.includes("negado")
        );
    },

    getEventoPoderRegistrarId: (emb) => {
        return GERAL_PARSERS.getEventoRegistrarId(emb);
    },

    isConvite: (emb) => {
        const text = GERAL_PARSERS.getEmbedText(emb);
        const title = GERAL_PARSERS.norm(emb?.title || emb?.data?.title || "");

        return (
            title.includes("convite enviado") ||
            text.includes("convite enviado") ||
            text.includes("convites")
        );
    },

    getConviteSenderId: (emb) => {
        const fields = GERAL_PARSERS.getFields(emb);

        const f =
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("quem convidou")) ||
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("enviado por")) ||
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("registrado por")) ||
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("autor"));

        return f
            ? GERAL_PARSERS.extractId(String(f.value || ""))
            : GERAL_PARSERS.extractId(GERAL_PARSERS.getEmbedText(emb));
    },

    isPresenca: (emb) => {
        const text = GERAL_PARSERS.getEmbedText(emb);
        return (
            text.includes("presenca") ||
            text.includes("presença") ||
            text.includes("confirmacao de presenca") ||
            text.includes("confirmação de presença")
        );
    },

    isPresencaConfirmed: (emb) => {
        const text = GERAL_PARSERS.getEmbedText(emb);

        if (
            text.includes("cancelado") ||
            text.includes("reprovado") ||
            text.includes("nao confirmado") ||
            text.includes("não confirmado")
        ) {
            return false;
        }

        return (
            text.includes("confirmado") ||
            text.includes("confirmada") ||
            text.includes("presenca confirmada") ||
            text.includes("presença confirmada")
        );
    },

    isCronogramaApproved: (emb) => {
        const text = GERAL_PARSERS.getEmbedText(emb);
        const color = emb?.color || emb?.data?.color;

        if (
            text.includes("recusado") ||
            text.includes("reprovado") ||
            text.includes("negado")
        ) {
            return false;
        }

        return (
            color === 3066993 ||
            text.includes("aprovado por") ||
            text.includes("aprovado") ||
            text.includes("cronograma aprovado") ||
            text.includes("ponto computado") ||
            text.includes("hall da fama aprovado") ||
            text.includes("evento diario aprovado") ||
            text.includes("evento diário aprovado")
        );
    },

    isEntrevistaConcluida: (emb) => {
        const text = GERAL_PARSERS.getEmbedText(emb);
        const title = GERAL_PARSERS.norm(emb?.title || emb?.data?.title || "");

        return (
            title.includes("entrevista") ||
            text.includes("entrevista concluida") ||
            text.includes("entrevista concluída") ||
            text.includes("entrevista iniciada") ||
            text.includes("!perguntas usado")
        );
    },

    getEntrevistaConcluidaUserId: (emb) => {
        const fields = GERAL_PARSERS.getFields(emb);

        const f =
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("responsavel")) ||
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("responsável")) ||
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("registrado por")) ||
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("autor")) ||
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("staff"));

        return f
            ? GERAL_PARSERS.extractId(String(f.value || ""))
            : GERAL_PARSERS.extractId(GERAL_PARSERS.getEmbedText(emb));
    },

    // --- DOACOES ---
    isDoacao: (emb) => {
        const text = GERAL_PARSERS.getEmbedText(emb);
        return text.includes("doacao") || text.includes("scdoa") || text.includes("doacao registrada") || text.includes("nova doacao registrada");
    },
    getDoacaoRegistradorId: (emb) => {
        const fields = GERAL_PARSERS.getFields(emb);
        const f = fields.find(x => {
            const n = GERAL_PARSERS.norm(x.name);
            return (
                n.includes("registrador") ||
                n.includes("registrado por") ||
                n.includes("registrante") ||
                n.includes("quem registrou") ||
                n.includes("autor") ||
                n.includes("usuario") ||
                n.includes("usuário") ||
                n.includes("doador") ||
                n.includes("doado por") ||
                n.includes("quem doou")
            );
        });
        return f ? GERAL_PARSERS.extractId(f.value) : GERAL_PARSERS.extractId(GERAL_PARSERS.getEmbedText(emb)) || GERAL_PARSERS.extractId(emb?.description || "");
    },

    // --- DOAÇÕES (Regras de contagem) ---
    getDoacaoScanTimestamp: (m) => Number(m?.createdTimestamp || m?.editedTimestamp || Date.now()),

    doacaoWasScoredFromEmbed: (emb) => {
        try {
            const fields = GERAL_PARSERS.getFields(emb);

            // NOVO: prioridade para a regra específica do Geral/Semanal
            const geral = fields.find((f) => {
                const n = GERAL_PARSERS.norm(f?.name);
                return n.includes("geraldash/semanal") || n.includes("geraldash") || n.includes("semanal");
            });

            const vg = String(geral?.value || "");
            if (vg) {
                if (/nao contou|não contou|cooldown|faltam/i.test(vg)) return false;
                if (/isento/i.test(vg)) return true;
                if (/\+1/.test(vg)) return true;
                if (/✅/.test(vg)) return true;
                return false;
            }

            // fallback para logs antigos
            const anti = fields.find((f) => GERAL_PARSERS.norm(f?.name).includes("anti-farm"));
            const v = String(anti?.value || "");
            if (/nao contou|não contou|faltam/i.test(v)) return false;
            if (/isento/i.test(v)) return true;
            if (/\+1/.test(v)) return true;
            return false;
        } catch {
            return false;
        }
    },

    doacaoIsExemptFromEmbed: (emb) => {
        try {
            const fields = GERAL_PARSERS.getFields(emb);

            const geral = fields.find((f) => {
                const n = GERAL_PARSERS.norm(f?.name);
                return n.includes("geraldash/semanal") || n.includes("geraldash") || n.includes("semanal");
            });

            const anti = fields.find((f) => GERAL_PARSERS.norm(f?.name).includes("anti-farm"));

            return /isento/i.test(String(geral?.value || "")) || /isento/i.test(String(anti?.value || ""));
        } catch {
            return false;
        }
    },

    canCountDoacaoInGeralScan: ({ emb, message, lastDoacaoAtByUser, uid }) => {
        if (!uid) return false;
        if (!GERAL_PARSERS.isDoacao(emb)) return false;
        if (!GERAL_PARSERS.doacaoWasScoredFromEmbed(emb)) return false;
        if (GERAL_PARSERS.doacaoIsExemptFromEmbed(emb)) return true;

        const ts = GERAL_PARSERS.getDoacaoScanTimestamp(message);
        const lastAt = Number(lastDoacaoAtByUser.get(uid) || 0);

        // ✅ Correção Profissional:
        // Se mudou o dia (SP) OU se passou mais de 1 hora, deve contar.
        const dateTs = new Date(ts).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
        const dateLast = new Date(lastAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

        if (lastAt && dateTs === dateLast && Math.abs(ts - lastAt) < (60 * 60 * 1000)) return false;

        lastDoacaoAtByUser.set(uid, ts);
        return true;
    },


        // --- VIP EVENTO ---
    isVip: (emb) => {
        const text = GERAL_PARSERS.getEmbedText(emb);
        return (
            text.includes("registro de vip por evento") ||
            text.includes("vip por evento") ||
            text.includes("vip evento")
        );
    },

    getVipStatus: (emb) => {
        const fields = GERAL_PARSERS.getFields(emb);

        const solValue = String(
            fields.find((f) => GERAL_PARSERS.norm(f?.name).startsWith("solicitacoes"))?.value ||
            fields.find((f) => GERAL_PARSERS.norm(f?.name).startsWith("solicitações"))?.value ||
            ""
        );

        const pagValue = String(
            fields.find((f) => GERAL_PARSERS.norm(f?.name).startsWith("pagamento"))?.value ||
            ""
        );

        const repValue = String(
            fields.find((f) => GERAL_PARSERS.norm(f?.name).startsWith("reprovacao"))?.value ||
            fields.find((f) => GERAL_PARSERS.norm(f?.name).startsWith("reprovação"))?.value ||
            ""
        );

        return {
            isSolicitado: GERAL_PARSERS.norm(solValue).includes("solicitado"),
            isPago: GERAL_PARSERS.norm(pagValue).includes("pago"),
            isReprovado: GERAL_PARSERS.norm(repValue).includes("reprovado"),
        };
    },

    getVipPagoByUserId: (emb) => {
        const fields = GERAL_PARSERS.getFields(emb);

        const f =
            fields.find((x) => GERAL_PARSERS.norm(x?.name).startsWith("pagamento")) ||
            fields.find((x) => GERAL_PARSERS.norm(x?.name).includes("pago por"));

        const raw = String(f?.value || "");
        const byMatch = /por\s+<@!?(\d{17,22})>/i.exec(raw);
        if (byMatch) return byMatch[1];

        return GERAL_PARSERS.extractId(raw);
    },

    // --- CORRECAO ---

    // --- CORRECAO ---
    isCorrecao: (emb) => {
        const text = GERAL_PARSERS.getEmbedText(emb);
        return text.includes("log de correcao de entrevista") || text.includes("correcao de questoes");
    },
    getCorretorId: (emb) => {
        const fields = GERAL_PARSERS.getFields(emb);
        const f = fields.find(x => GERAL_PARSERS.norm(x.name).includes("staff") || GERAL_PARSERS.norm(x.name).includes("corrigiu"));
        return f ? GERAL_PARSERS.extractId(f.value) : null;
    },
    correcaoContou: (emb) => {
        const fields = GERAL_PARSERS.getFields(emb);
        const f = fields.find(x => GERAL_PARSERS.norm(x.name).includes("anti-farm"));
        return f && (f.value.includes("✅") || f.value.includes("+1"));
    }
};

export class GeralAudit {
    constructor() {
        this.verbose = process.env.SC_GERAL_VERBOSE_SCAN === '1';
        this.summaryPath = "./data/sc_geral_scan_debug_summary.json";
        this.data = {};
    }

    log(tag, message) {
        if (this.verbose) console.log(`[${tag}] ${message}`);
    }

    addStats(source, type) {
        if (!this.data[source]) {
            this.data[source] = { scanned: 0, found: 0, uidOk: 0, counted: 0, rejected: 0, reasons: {} };
        }
        this.data[source][type]++;
    }

    reject(source, reason) {
        this.addStats(source, 'rejected');
        this.data[source].reasons[reason] = (this.data[source].reasons[reason] || 0) + 1;
        this.log(source.toUpperCase() + "_REJECT", `Motivo: ${reason}`);
    }

    saveSummary() {
        try {
            const dir = path.dirname(this.summaryPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(this.summaryPath, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error("[GeralAudit] Erro ao salvar sumário:", e.message);
        }
    }
}
