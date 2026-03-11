// d:\santacreators-main\events\mirrorConfig.js

/**
 * Configuração do sistema de espelhamento de categorias/canais.
 */
export const MIRROR_CONFIG = {
  // ID do servidor principal (de onde as categorias serão copiadas)
  SOURCE_GUILD_ID: "1262262852782129183",

  // ID do servidor de destino (para onde a estrutura será recriada)
  TARGET_GUILD_ID: "ID_DO_SEU_SERVIDOR_DE_LOGS_AQUI", // ⚠️ TROQUE AQUI

  // Cargos que podem usar o comando !criar
  ALLOWED_ROLE_IDS: [
    "1262262852949905408", // Owner
    "1352408327983861844", // Resp Creators
  ],

  // Usuários que podem usar o comando !criar
  ALLOWED_USER_IDS: [
    "660311795327828008", // Você
  ],

  // Se true, o sistema tentará copiar permissões específicas de membros. (Recomendado: false)
  ALLOW_MEMBER_OVERWRITES: false,
};