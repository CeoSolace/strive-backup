const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("massrole")
    .setDescription("Bulk add or remove a role from members")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(sub =>
      sub
        .setName("add")
        .setDescription("Add a role to multiple members")
        .addRoleOption(option =>
          option.setName("role").setDescription("Role to add").setRequired(true)
        )
        .addRoleOption(option =>
          option.setName("filter")
            .setDescription("Only target members with this role")
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("remove")
        .setDescription("Remove a role from multiple members")
        .addRoleOption(option =>
          option.setName("role").setDescription("Role to remove").setRequired(true)
        )
        .addRoleOption(option =>
          option.setName("filter")
            .setDescription("Only target members with this role")
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const role = interaction.options.getRole("role");
    const filter = interaction.options.getRole("filter");

    const guild = interaction.guild;

    if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.editReply("❌ I do not have permission to manage roles.");
    }

    if (role.position >= guild.members.me.roles.highest.position) {
      return interaction.editReply("❌ That role is higher than my highest role.");
    }

    const members = await guild.members.fetch();

    let targets = members.filter(m => !m.user.bot);

    if (filter) {
      targets = targets.filter(m => m.roles.cache.has(filter.id));
    }

    let count = 0;

    for (const member of targets.values()) {
      try {
        if (sub === "add" && !member.roles.cache.has(role.id)) {
          await member.roles.add(role);
          count++;
        }

        if (sub === "remove" && member.roles.cache.has(role.id)) {
          await member.roles.remove(role);
          count++;
        }
      } catch {
        continue;
      }
    }

    const embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle("Mass Role Complete")
      .setDescription(
        `**Action:** ${sub}\n` +
        `**Role:** ${role}\n` +
        `**Affected Members:** ${count}`
      )
      .setTimestamp();

    interaction.editReply({ embeds: [embed] });
  }
};
