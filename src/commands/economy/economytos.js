const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { requireEconomyUser } = require("@src/database/economy");

const pages = [
  "This is a simulated economy system.\nAll coins and crypto are fake.",
  "No real-world value exists.\nYou cannot exchange or sell assets.",
  "Attempting to trade externally will result in a permanent blacklist.",
  "This system is for entertainment only.\nBy continuing, you accept all terms.",
];

module.exports = {
  name: "economytos",
  description: "view or accept economy terms",
  category: "ECONOMY",

  command: { enabled: true },
  slashCommand: { enabled: true },

  async interactionRun(interaction) {
    let page = 0;

    const embed = () =>
      new EmbedBuilder()
        .setTitle("Economy Terms")
        .setDescription(pages[page])
        .setFooter({ text: `Page ${page + 1}/${pages.length}` });

    const row = () =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("prev").setLabel("Back").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("accept").setLabel("Accept").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("next").setLabel("Next").setStyle(ButtonStyle.Secondary)
      );

    await interaction.reply({ embeds: [embed()], components: [row()] });

    const collector = interaction.channel.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) return;

      if (i.customId === "next") page = Math.min(page + 1, pages.length - 1);
      if (i.customId === "prev") page = Math.max(page - 1, 0);

      if (i.customId === "accept") {
        const { account } = await requireEconomyUser(interaction.user, { requireTos: false });
        account.acceptedTos = true;
        account.tosAcceptedAt = new Date();
        await account.save();

        return i.update({ content: "Accepted.", embeds: [], components: [] });
      }

      await i.update({ embeds: [embed()], components: [row()] });
    });
  },
};
