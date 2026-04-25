# Strive / Bright Bot Systems Documentation

This document explains the main systems inside this repository, how they connect, and what each part is responsible for.

## 1. Core Startup System

### Main file

`bot.js`

This is the main entry point for the bot.

It does the following:

- Loads environment variables with `dotenv`
- Registers module aliases
- Loads Discord.js extenders
- Validates configuration
- Creates the custom `BotClient`
- Loads commands, context menus, events, and security modules
- Starts the dashboard if enabled
- Connects to MongoDB
- Logs into Discord
- Registers slash commands globally

This file controls the startup order of the entire project.

## 2. Configuration System

### Main file

`config.js`

This file controls global bot settings.

It includes:

- Owner IDs
- Default prefix
- Slash command settings
- Embed colours
- Cache limits
- Dashboard settings
- Plugin toggles
- Music settings
- Economy settings
- Moderation settings
- Ticket settings
- Giveaway settings
- Stats settings

Most major systems can be enabled or disabled from here.

## 3. Custom Client System

### Main file

`src/structures/BotClient.js`

This extends the Discord.js `Client` class and acts as the bot’s internal engine.

It manages:

- Discord intents and partials
- Command loading
- Slash command loading
- Context menu loading
- Event loading
- Security module loading
- Music manager setup
- Giveaway manager setup
- Database schema access
- Invite generation
- User resolution

This is one of the most important files in the repo.

## 4. Command System

### Main areas

`src/commands/`

`src/structures/Command.js`

`src/handlers/command.js`

The bot uses a structured command system.

Each command can support:

- Prefix commands
- Slash commands
- Cooldowns
- Aliases
- Permissions
- Validations
- Subcommands

Commands are loaded recursively from `src/commands`, so new commands can be added inside category folders.

### Command categories

Command categories are defined in:

`src/structures/CommandCategory.js`

Existing categories include:

- Admin
- AutoMod
- Economy
- Fun
- Giveaways
- Image
- Information
- Invites
- Moderation
- Music
- Owner
- Social
- Statistics
- Suggestions
- Tickets
- Utility
- Premium

## 5. Slash Command System

Slash commands are registered by the custom client after the bot logs in.

Each command can define:

```js
slashCommand: {
  enabled: true,
  options: []
}
```

The bot then collects enabled slash commands and registers them with Discord.

Important note: Discord has a global slash command limit, so commands should be grouped carefully with subcommands where possible.

## 6. Prefix Command System

Prefix commands are controlled by:

`PREFIX_COMMANDS` in `config.js`

Default prefix:

`,`

Prefix commands are handled by the command handler and support aliases, permissions, cooldowns, and validations.

## 7. Event System

### Main area

`src/events/`

Events are loaded automatically by `BotClient.loadEvents()`.

Each event file is named after the Discord event it handles.

Example:

`messageDelete.js` handles deleted messages.

This system allows new event logic to be added without editing the main bot file.

## 8. Security Module System

### Main area

`src/security/`

Security modules are loaded by:

```js
client.loadSecurityModules("src/security")
```

Each security file must export a function:

```js
module.exports = function securityModule(client) {
  // security logic here
};
```

This makes security modular and expandable.

## 9. PermissionGuard System

### Main file

`src/security/permissionGuard.js`

PermissionGuard is the first real prevention-focused security system.

It watches role permission updates and blocks dangerous permission escalation.

It protects against permissions such as:

- Administrator
- Manage Guild
- Manage Roles
- Manage Channels
- Ban Members
- Kick Members
- Manage Webhooks
- Mention Everyone
- Moderate Members

When a protected permission is added, PermissionGuard:

- Detects the role update
- Checks audit logs to find the executor
- Reverts the role permissions back to the previous safe state
- Stores a rollback record
- Logs the action in private security channels

### Private channels

PermissionGuard creates private admin-only channels:

- `security-permission-blocks`
- `security-permission-actions`

These are used for blocked changes and admin-approved actions.

## 10. PermissionGuard Revert System

### Main command

`src/commands/automod/permissionguard.js`

This command allows administrators to approve a blocked permission change if it was legitimate.

Commands:

```txt
/permissionguard revert
,permissionguard revert <roleId>
```

This restores the blocked permission state from the stored rollback record.

## 11. Per-Server Security Mode System

### Main command

`src/commands/automod/securitymode.js`

### State file

`src/security/guardState.js`

### Bridge file

`src/security/00GuardPauseBridge.js`

This system allows admins to pause security enforcement for their server only.

Commands:

```txt
/securitymode pause
/securitymode resume
/securitymode status
```

Prefix versions:

```txt
,securitymode pause
,securitymode resume
,securitymode status
```

Purpose:

- Temporarily pause security if admins need to make changes the bot would block
- Keep security active in every other server
- Resume protection when finished

Pause state is stored locally in:

`logs/server-guard-state.json`

## 12. Snipe System

### Event file

`src/events/messageDelete.js`

### Command file

`src/commands/utility/snipe.js`

The snipe system stores the most recent deleted message per channel.

The command:

```txt
/snipe
,snipe
```

shows:

- Deleted message content
- Author tag
- Author avatar
- Attachments if present
- How long ago it was deleted

Snipes automatically clear after two minutes.

## 13. Database System

### Main file

`src/database/mongoose.js`

The bot uses MongoDB through Mongoose.

It connects using:

`process.env.MONGO_CONNECTION`

Schemas are exposed through:

```js
client.database
```

Main schema areas include:

- Guild settings
- Members
- Giveaways
- Reaction roles
- Mod logs
- Translate logs
- Suggestions
- Premium
- Config

## 14. Dashboard System

### Main file

`dashboard/app.js`

The dashboard uses:

- Express
- EJS
- Sessions
- Mongo session store
- CSRF protection
- Rate limiting
- Cookie parser
- Static assets
- Discord OAuth routes
- API routes
- Protected app routes

The dashboard is launched from `bot.js` if enabled in `config.js`.

Dashboard config lives in:

```js
DASHBOARD: {
  enabled: true,
  baseURL: "https://brightbot.online",
  failureURL: "https://brightbot.online",
  port: 8081
}
```

## 15. OAuth and Auth System

### Main areas

`dashboard/auth/`

`dashboard/routes/discord.js`

The dashboard uses Discord authentication to identify users and protect dashboard pages.

Protected dashboard routes use `CheckAuth` middleware.

## 16. API System

### Main area

`dashboard/routes/api`

The API routes are mounted under:

`/api`

API routes are protected by rate limiting and CSRF protection, except OAuth login and callback routes.

## 17. Moderation System

### Main area

`src/commands/moderation/`

Moderation commands include actions such as banning, kicking, muting, and related server management commands.

Moderation behaviour is controlled by:

`MODERATION` in `config.js`

## 18. AutoMod System

### Main area

`src/commands/automod/`

AutoMod-related commands and systems live here.

PermissionGuard and SecurityMode currently connect into this category.

AutoMod can be enabled or disabled from:

`AUTOMOD` in `config.js`

## 19. Ticket System

Ticket settings are controlled through:

`TICKET` in `config.js`

The ticket system is designed for support channels, ticket creation, and ticket closure workflows.

## 20. Giveaway System

Giveaway settings are controlled through:

`GIVEAWAYS` in `config.js`

The bot uses `discord-giveaways` and a giveaway handler.

If enabled, the giveaway manager is initialized in `BotClient`.

## 21. Economy System

Economy settings are controlled through:

`ECONOMY` in `config.js`

It includes:

- Currency symbol
- Daily coin amount
- Beg command ranges

## 22. Stats and Leveling System

Stats settings are controlled through:

`STATS` in `config.js`

It includes:

- XP cooldown
- Default level-up message

This system is used for member activity and progression features.

## 23. Music System

Music settings are controlled through:

`MUSIC` in `config.js`

The bot supports Lavalink configuration, but music is currently disabled in the config.

If enabled, the music manager is initialized inside `BotClient`.

## 24. Invite System

Invite settings are controlled through:

`INVITE` in `config.js`

This system is used for invite tracking and invite-related commands.

## 25. Suggestions System

Suggestion settings are controlled through:

`SUGGESTIONS` in `config.js`

It defines vote emojis and embed colours for suggestion states.

## 26. Premium and Stripe System

The repo includes Stripe as a dependency and has premium-related schemas.

Important areas:

- `src/database/schemas/premium`
- `src/database/schemas/config`
- Stripe dependency in `package.json`

This is the base for paid features, subscriptions, or premium access.

## 27. Logging System

Logging is handled by:

- `src/helpers/Logger`
- `logging`
- `OmniDiscordLogger`

The bot also catches:

- Unhandled promise rejections
- Uncaught exceptions
- Process warnings

This helps keep runtime failures visible.

## 28. Module Alias System

The repo uses `module-alias` to simplify imports.

Aliases are defined in `package.json`:

```json
{
  "@root": ".",
  "@handlers": "src/handlers/",
  "@helpers": "src/helpers/",
  "@schemas": "src/database/schemas/",
  "@src": "src/",
  "@structures": "src/structures/"
}
```

This is why files can import modules like:

```js
require("@root/config")
require("@helpers/Utils")
require("@src/database/mongoose")
```

## 29. Current Custom Additions

The custom systems recently added are:

### PermissionGuard

Prevents dangerous permission escalation.

### PermissionGuard Revert Approval

Allows admins to approve blocked permission changes.

### SecurityMode

Allows admins to pause security for one server only.

### GuardPauseBridge

Adds a per-server pause bridge around security listeners.

### GuardState

Stores paused server state locally.

### Snipe

Lets users view the last deleted message in a channel.

## 30. Recommended Next Systems

The strongest next upgrades would be:

### Role Backup and Restore

Backup role names, positions, colours, permissions, and restore deleted roles.

### Channel Backup and Restore

Backup channel names, categories, permissions, topics, slowmode, and recreate deleted channels.

### Webhook Protection

Detect and remove suspicious webhooks.

### Mass Ban / Mass Kick Protection

Detect rapid member removals and freeze the executor.

### Raid Detection

Detect suspicious join spikes and temporarily lock verification or joins.

### Security Audit Command

A command that checks server weaknesses and gives an actionable report.

## 31. Development Notes

When adding new systems:

- Keep each system modular
- Prefer `src/security/` for security listeners
- Prefer `src/commands/<category>/` for commands
- Use private admin-only channels for sensitive logs
- Avoid hardcoding secrets
- Use subcommands to avoid slash command bloat
- Make features configurable later through MongoDB or dashboard controls

## 32. Important Caution

Security systems must avoid blocking legitimate server owners permanently.

Every prevention feature should eventually include:

- Trusted users
- Trusted roles
- Server-only pause mode
- Admin approval flow
- Audit logs
- Clear recovery commands

This keeps the bot powerful without making it annoying or unsafe for legitimate administrators.
