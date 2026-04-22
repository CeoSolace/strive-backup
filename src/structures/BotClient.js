const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  WebhookClient,
  ApplicationCommandType,
} = require("discord.js");
const path = require("path");
const { table } = require("table");
const Logger = require("../helpers/Logger");
const { validateCommand, validateContext } = require("../helpers/Validator");
const { schemas } = require("@src/database/mongoose");
const CommandCategory = require("./CommandCategory");
const lavaclient = require("../handlers/lavaclient");
const giveawaysHandler = require("../handlers/giveaway");
const { DiscordTogether } = require("discord-together");

module.exports = class BotClient extends Client {
  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
      ],
      partials: [Partials.User, Partials.Message, Partials.Reaction],
      allowedMentions: {
        repliedUser: false,
      },
      restRequestTimeout: 20000,
    });

    this.wait = require("util").promisify(setTimeout);
    this.config = require("@root/config");

    /** @type {import('@structures/Command')[]} */
    this.commands = [];
    this.commandIndex = new Collection();

    /** @type {Collection<string, import('@structures/Command')>} */
    this.slashCommands = new Collection();

    /** @type {Collection<string, import('@structures/BaseContext')>} */
    this.contextMenus = new Collection();

    this.counterUpdateQueue = [];

    // Webhook
    this.joinLeaveWebhook = process.env.JOIN_LEAVE_LOGS
      ? new WebhookClient({ url: process.env.JOIN_LEAVE_LOGS })
      : undefined;

    // Music
    if (this.config.MUSIC.ENABLED) this.musicManager = lavaclient(this);

    // Giveaways
    if (this.config.GIVEAWAYS.ENABLED) this.giveawaysManager = giveawaysHandler(this);

    // Logger
    this.logger = Logger;

    // Database
    this.database = schemas;

    // Discord Together
    this.discordTogether = new DiscordTogether(this);
  }

  /**
   * Load events
   */
  loadEvents(directory) {
    this.logger.log(`Loading events...`);
    let success = 0;
    let failed = 0;
    const clientEvents = [];

    const recursiveReadDirSync = require("../helpers/Utils").recursiveReadDirSync;

    recursiveReadDirSync(directory).forEach((filePath) => {
      const file = path.basename(filePath);
      try {
        const eventName = path.basename(file, ".js");
        const event = require(filePath);

        this.on(eventName, event.bind(null, this));
        clientEvents.push([file, "✓"]);

        delete require.cache[require.resolve(filePath)];
        success++;
      } catch (ex) {
        failed++;
        this.logger.error(`loadEvent - ${file}`, ex);
      }
    });

    console.log(
      table(clientEvents, {
        header: { alignment: "center", content: "Client Events" },
        singleLine: true,
        columns: [{ width: 25 }, { width: 5, alignment: "center" }],
      })
    );

    this.logger.log(`Loaded ${success + failed} events. Success (${success}) Failed (${failed})`);
  }

  /**
   * Get command by invoke/alias
   */
  getCommand(invoke) {
    const index = this.commandIndex.get(invoke.toLowerCase());
    return index !== undefined ? this.commands[index] : undefined;
  }

  /**
   * Load a single command
   */
  loadCommand(cmd) {
    if (cmd.category && CommandCategory[cmd.category]?.enabled === false) {
      this.logger.debug(`Skipping Command ${cmd.name}. Category ${cmd.category} is disabled`);
      return;
    }

    if (cmd.command?.enabled) {
      const index = this.commands.length;

      if (this.commandIndex.has(cmd.name)) {
        throw new Error(`Command ${cmd.name} already registered`);
      }

      if (Array.isArray(cmd.command.aliases)) {
        cmd.command.aliases.forEach((alias) => {
          if (this.commandIndex.has(alias)) throw new Error(`Alias ${alias} already registered`);
          this.commandIndex.set(alias.toLowerCase(), index);
        });
      }

      this.commandIndex.set(cmd.name.toLowerCase(), index);
      this.commands.push(cmd);
    } else {
      this.logger.debug(`Skipping prefix command ${cmd.name}. Disabled!`);
    }

    if (cmd.slashCommand?.enabled) {
      if (this.slashCommands.has(cmd.name)) throw new Error(`Slash Command ${cmd.name} already registered`);
      this.slashCommands.set(cmd.name, cmd);
    } else {
      this.logger.debug(`Skipping slash command ${cmd.name}. Disabled!`);
    }
  }

  /**
   * Load all commands recursively
   */
  loadCommands(directory) {
    this.logger.log(`Loading commands from ${directory} (deep recursive scan)...`);

    const fs = require("fs");
    const pathMod = require("path");

    const walk = (dir) => {
      let results = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const filePath = pathMod.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          results = results.concat(walk(filePath));
        } else if (file.endsWith(".js") && file !== "index.js") {
          results.push(filePath);
        }
      }
      return results;
    };

    const absoluteDir = pathMod.resolve(directory);
    if (!fs.existsSync(absoluteDir)) {
      this.logger.warn(`Commands directory does not exist: ${absoluteDir}`);
      return;
    }

    const files = walk(absoluteDir);
    let prefixCount = 0;
    let slashCount = 0;

    for (const file of files) {
      try {
        delete require.cache[require.resolve(file)];
        const cmd = require(file);

        if (typeof cmd !== "object" || !cmd.name) {
          this.logger.debug(`Skipped non-command file: ${file}`);
          continue;
        }

        validateCommand(cmd);
        this.loadCommand(cmd);

        if (cmd.command?.enabled) prefixCount++;
        if (cmd.slashCommand?.enabled) slashCount++;

      } catch (ex) {
        this.logger.error(`Failed to load command ${file}: ${ex.message}`);
        continue;
      }
    }

    this.logger.success(`Loaded ${prefixCount} prefix commands`);
    this.logger.success(`Loaded ${slashCount} slash commands`);

    if (slashCount > 100) {
      throw new Error("Discord allows a maximum of 100 global slash commands. Please disable some.");
    }
  }

  /**
   * Load security modules from src/security
   */
  loadSecurityModules(directory) {
    this.logger.log("Loading security modules...");
    const fs = require("fs");
    const path = require("path");

    const absoluteDir = path.resolve(directory);
    if (!fs.existsSync(absoluteDir)) {
      this.logger.warn(`Security modules directory not found: ${absoluteDir}`);
      return;
    }

    const files = fs.readdirSync(absoluteDir).filter(file => file.endsWith(".js"));
    let loaded = 0;

    for (const file of files) {
      try {
        const modulePath = path.join(absoluteDir, file);
        delete require.cache[require.resolve(modulePath)];

        const securityModule = require(modulePath);

        if (typeof securityModule === "function") {
          securityModule(this);
          this.logger.log(`Intialized security module: ${file}`);
          loaded++;
        } else {
          this.logger.warn(`Skipped ${file}: must export a function (client) => { ... }`);
        }
      } catch (ex) {
        this.logger.error(`Failed to load security module ${file}: ${ex.message}`);
      }
    }

    this.logger.success(`Loaded ${loaded} security modules`);
  }

  /**
   * Load contexts
   */
  loadContexts(directory) {
    this.logger.log(`Loading contexts...`);
    const { recursiveReadDirSync } = require("../helpers/Utils");
    const files = recursiveReadDirSync(directory);

    for (const file of files) {
      try {
        delete require.cache[require.resolve(file)];
        const ctx = require(file);
        if (typeof ctx !== "object") continue;
        validateContext(ctx);

        if (!ctx.enabled) return this.logger.debug(`Skipping context ${ctx.name}. Disabled!`);
        if (this.contextMenus.has(ctx.name)) throw new Error(`Context already exists with that name`);

        this.contextMenus.set(ctx.name, ctx);
      } catch (ex) {
        this.logger.error(`Failed to load ${file} Reason: ${ex.message}`);
      }
    }

    const userContexts = this.contextMenus.filter((ctx) => ctx.type === ApplicationCommandType.User).size;
    const messageContexts = this.contextMenus.filter((ctx) => ctx.type === ApplicationCommandType.Message).size;

    if (userContexts > 3) throw new Error("A maximum of 3 USER contexts can be enabled");
    if (messageContexts > 3) throw new Error("A maximum of 3 MESSAGE contexts can be enabled");

    this.logger.success(`Loaded ${userContexts} USER contexts`);
    this.logger.success(`Loaded ${messageContexts} MESSAGE contexts`);
  }

  /**
   * Register interactions
   */
  async registerInteractions(guildId) {
    const toRegister = [];

    if (this.config.INTERACTIONS.SLASH) {
      this.slashCommands
        .map((cmd) => ({
          name: cmd.name,
          description: cmd.description,
          type: ApplicationCommandType.ChatInput,
          options: cmd.slashCommand.options,
        }))
        .forEach((s) => toRegister.push(s));
    }

    if (this.config.INTERACTIONS.CONTEXT) {
      this.contextMenus
        .map((ctx) => ({ name: ctx.name, type: ctx.type }))
        .forEach((c) => toRegister.push(c));
    }

    if (!guildId) {
      await this.application.commands.set(toRegister);
    } else if (guildId && typeof guildId === "string") {
      const guild = this.guilds.cache.get(guildId);
      if (!guild) {
        this.logger.error(`Failed to register interactions in guild ${guildId}`, new Error("No matching guild"));
        return;
      }
      await guild.commands.set(toRegister);
    } else {
      throw new Error("Invalid guildId provided");
    }

    this.logger.success("Successfully registered interactions");
  }

  /**
   * Resolve users
   */
  async resolveUsers(search, exact = false) {
    if (!search || typeof search !== "string") return [];
    const users = [];

    const patternMatch = search.match(/(\d{17,20})/);
    if (patternMatch) {
      const id = patternMatch[1];
      const fetched = await this.users.fetch(id, { cache: true }).catch(() => {});
      if (fetched) {
        users.push(fetched);
        return users;
      }
    }

    const matchingTags = this.users.cache.filter((user) => user.tag === search);
    if (exact && matchingTags.size === 1) users.push(matchingTags.first());
    else matchingTags.forEach((match) => users.push(match));

    if (!exact) {
      this.users.cache
        .filter(
          (x) =>
            x.username === search ||
            x.username.toLowerCase().includes(search.toLowerCase()) ||
            x.tag.toLowerCase().includes(search.toLowerCase())
        )
        .forEach((user) => users.push(user));
    }

    return users;
  }

  /**
   * Generate invite
   */
  getInvite() {
    return this.generateInvite({
      scopes: ["bot", "applications.commands"],
      permissions: ["Administrator"],
    });
  }
};
