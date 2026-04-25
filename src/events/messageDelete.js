module.exports = async (client, message) => {
  if (!message || !message.guild || !message.channel) return;
  if (message.partial) return;
  if (message.author?.bot) return;

  if (!client.snipes) client.snipes = new Map();

  const attachments = [...(message.attachments?.values?.() || [])].map((attachment) => ({
    name: attachment.name,
    url: attachment.url,
    proxyURL: attachment.proxyURL,
    contentType: attachment.contentType,
  }));

  client.snipes.set(message.channel.id, {
    content: message.content || null,
    authorId: message.author?.id || null,
    authorTag: message.author?.tag || "Unknown User",
    authorAvatar: message.author?.displayAvatarURL?.({ dynamic: true }) || null,
    attachments,
    deletedAt: Date.now(),
    messageCreatedAt: message.createdTimestamp || null,
  });

  setTimeout(() => {
    const current = client.snipes?.get(message.channel.id);
    if (current?.deletedAt && Date.now() - current.deletedAt >= 120_000) {
      client.snipes.delete(message.channel.id);
    }
  }, 120_000);
};
