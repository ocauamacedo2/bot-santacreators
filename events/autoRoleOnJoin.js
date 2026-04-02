const AUTO_ROLE_ID = "1430984036972494908";

export async function autoRoleOnJoin(member) {
  try {
    if (!member || !member.guild) return;

    const botMember = member.guild.members.me ?? await member.guild.members.fetchMe().catch(() => null);
    if (!botMember) {
      console.warn("[AUTO_ROLE_ON_JOIN] Não consegui obter o membro do bot na guild.");
      return;
    }

    const role =
      member.guild.roles.cache.get(AUTO_ROLE_ID) ||
      await member.guild.roles.fetch(AUTO_ROLE_ID).catch(() => null);

    if (!role) {
      console.warn(`[AUTO_ROLE_ON_JOIN] Cargo não encontrado: ${AUTO_ROLE_ID}`);
      return;
    }

    if (member.roles.cache.has(AUTO_ROLE_ID)) {
      return;
    }

    if (!botMember.permissions.has("ManageRoles")) {
      console.warn("[AUTO_ROLE_ON_JOIN] O bot não tem permissão de Gerenciar Cargos.");
      return;
    }

    if (botMember.roles.highest.position <= role.position) {
      console.warn(
        `[AUTO_ROLE_ON_JOIN] O cargo do bot está abaixo ou no mesmo nível do cargo ${AUTO_ROLE_ID}.`
      );
      return;
    }

    await member.roles.add(AUTO_ROLE_ID, "Cargo automático ao entrar no servidor");
    console.log(
      `[AUTO_ROLE_ON_JOIN] Cargo ${AUTO_ROLE_ID} adicionado para ${member.user?.tag || member.id}`
    );
  } catch (error) {
    console.error(
      `[AUTO_ROLE_ON_JOIN] Erro ao adicionar cargo ${AUTO_ROLE_ID} para ${member?.user?.tag || member?.id}:`,
      error
    );
  }
}