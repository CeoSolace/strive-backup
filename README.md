# Strive Discord Bot

A modular, production-ready Discord bot built with **discord.js**, designed for extensibility, security, and large-scale server management.

> ⚠️ **Notice:** The `/annouce` slash command is currently **broken** and does not function as intended.  
> It is documented for transparency but should not be relied upon until fixed.

---

## ✨ Features

- 🔌 Modular auto-loading system (commands, events, contexts)
- 🛡️ Dedicated security module loader
- 🧠 Discord.js structure extenders (Message, Guild, Channel)
- 📊 Optional web dashboard
- 🗃️ MongoDB (Mongoose) integration
- 🧾 Centralized logging system
- 🔄 Startup update checks
- 🌍 Global slash command registration

---

## 🧱 Architecture Overview

```text
src/
├── commands/        # Slash & message commands
├── contexts/        # Context menu interactions
├── events/          # Discord event handlers
├── security/        # Security & protection modules
├── database/
│   └── mongoose.js
├── structures/
│   └── BotClient
helpers/
├── extenders/       # Discord.js class extensions
├── Validator.js
├── BotUtils.js
dashboard/
└── app.js
logging/
└── OmniDiscordLogger
````

---

## 🚀 Getting Started

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file:

```env
BOT_TOKEN=your_discord_bot_token
```

Configuration is validated at startup. The bot will refuse to launch if required values are missing or invalid.

---

## ▶️ Running the Bot

```bash
node bot.js
```

Startup flow:

1. Validate configuration
2. Load commands, contexts, events, and security modules
3. Check for updates
4. Launch dashboard **or** connect to MongoDB
5. Log in to Discord
6. Register global slash commands

---

## 📢 `/annouce` Slash Command (Broken)

```text
/annouce message:<string>
```

**Intended Purpose:**
Send a global announcement message to all servers the bot is in.

**Current Status:** ❌ **Broken**

**Notes:**

* Command registers successfully
* Execution logic is incomplete or faulty
* Kept in the codebase for future repair
* Should not be enabled in production environments

---

## 🛡️ Security System

Security logic is loaded independently from commands:

```js
client.loadSecurityModules("src/security");
```

This allows:

* Abuse prevention
* Rate limiting
* Server protection logic
* Future moderation automation

---

## 🧠 Extenders

The bot extends Discord.js core classes to provide shared helper methods and cleaner syntax:

* `Message`
* `Guild`
* `GuildChannel`

---

## 🧾 Logging & Stability

* Centralized logging via `Strive/OmniDiscordLogger`
* Global handling of unhandled promise rejections
* Errors are logged instead of silently crashing the bot

---

## 🛠️ Tech Stack

* **Node.js**
* **discord.js**
* **MongoDB / Mongoose**
* **dotenv**
* **module-alias**

---

## 📄 License

This project is licensed under the **MIT License**.
See the `LICENSE` file for details and credits.

---

## ⚠️ Disclaimer

This bot is provided **as-is**.
Security-sensitive features (such as global announcements) must be properly permission-guarded before production use.

---

## 🤝 Contributing

Pull requests are welcome.

* Follow the existing modular structure
* Keep security-related logic isolated
* Document breaking changes clearly

````
