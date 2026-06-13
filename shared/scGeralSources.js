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
        let m = /<@!?(\d{17,22})>/.exec(raw);
        if (m) return m[1];
        m = /`(\d{17,22})`/.exec(raw);
        if (m) return m[1];
        m = /\b(\d{17,22})\b/.exec(raw);
        return m ? m[1] : null;
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
        return val.includes("valido") || val.includes("aprovado");
    },

    // --- DOACOES ---
    isDoacao: (emb) => {
        const text = GERAL_PARSERS.getEmbedText(emb);
        return text.includes("doacao") || text.includes("scdoa") || text.includes("nova doacao registrada");
    },
    getDoacaoRegistradorId: (emb) => {
        const fields = GERAL_PARSERS.getFields(emb);
        const f = fields.find(x => {
            const n = GERAL_PARSERS.norm(x.name);
            return n.includes("registrador") || n.includes("registrado por") || n.includes("autor") || n.includes("usuario");
        });
        return f ? GERAL_PARSERS.extractId(f.value) : GERAL_PARSERS.extractId(GERAL_PARSERS.getEmbedText(emb));
    },

    // --- CORRECAO ---
    isCorrecao: (emb) => GERAL_PARSERS.getEmbedText(emb).includes("log de correcao de entrevista"),
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
