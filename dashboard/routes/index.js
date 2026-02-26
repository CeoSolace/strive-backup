const express = require("express");
const CheckAuth = require("../auth/CheckAuth");

const router = express.Router();

// Home: send authenticated users into the app
router.get("/", async (req, res) => {
  if (req.session.user) return res.redirect("/app/overview");
  return res.redirect("/api/login?state=no");
});

// Selector (legacy; keep it working)
router.get("/selector", CheckAuth, async (req, res) => {
  res.redirect("/app/servers");
});

// Terms of Service
router.get("/tos", CheckAuth, async (req, res) => {
  const content = `
Welcome to Bright.

By accessing or using the Bright dashboard (the “Service”), you agree to these Terms of Service (“Terms”).
If you do not agree, do not use the Service.

1) Service Description
Bright is a Discord bot and dashboard that helps manage and configure bot features for Discord servers (“Guilds”).
The dashboard allows you to authenticate with Discord, view eligible servers, and store configuration in MongoDB.

2) Eligibility & Account
You must have a valid Discord account to use the Service.
You are responsible for maintaining the security of your Discord account and any sessions on this dashboard.

3) Server Access & Permissions
You may only manage Guilds where you have “Manage Guild” or “Administrator” permissions.
The Service enforces permission checks to prevent unauthorized access.

4) Acceptable Use
You agree not to:
- attempt to bypass authentication/authorization checks
- probe, scan, or test vulnerabilities without permission
- use the Service for unlawful, abusive, or harmful activity

5) Data Storage
Configuration and preferences are stored in MongoDB.
Consent preferences are stored in MongoDB and may also be stored in a browser cookie for convenience.

6) Third-Party Services
The Service uses Discord OAuth2 to authenticate and retrieve the list of Guilds you can manage.
Discord is a third-party service and is governed by Discord’s terms and policies.

7) Availability & Changes
We may update, modify, or discontinue parts of the Service at any time.
We do not guarantee uninterrupted availability.

8) Disclaimer
The Service is provided “as is” and “as available” without warranties of any kind.
To the maximum extent permitted by law, we disclaim all warranties, express or implied.

9) Limitation of Liability
To the maximum extent permitted by law, we are not liable for indirect, incidental, special, consequential, or punitive damages,
or any loss of data, profits, or goodwill.

10) Termination
We may suspend or terminate access to the Service if you violate these Terms or if required for security reasons.
You may stop using the Service at any time.

11) Contact
For support or questions, contact the project maintainers via the repository issue tracker.
  `.trim();

  res.render("legal", {
    user: req.userInfos,
    pageTitle: "Terms of Service",
    heading: "Terms of Service",
    updatedAt: "January 5, 2026",
    content,
  });
});

// Privacy Policy
router.get("/privacy", CheckAuth, async (req, res) => {
  const content = `
This Privacy Policy explains how Bright collects, uses, stores, and protects information when you use the Service.

1) What We Collect
When you log in with Discord, we may process:
- Discord user ID, username, discriminator, avatar (as provided by Discord)
- The list of Guilds you are in (as provided by Discord), including permission flags needed for access checks

Dashboard data stored in MongoDB may include:
- User preferences (e.g., default guild preference, email export toggle)
- Guild settings you configure (modules/commands toggles, automation definitions)
- Audit logs of dashboard actions (e.g., settings updates)

Consent data:
- Your consent choices for analytics/diagnostics/training/marketing
- Consent history (audit events) including timestamps and what changed
- Optional hashed IP (only if CONSENT_IP_SALT is configured)

2) Cookies
We use cookies for:
- Session management (to keep you logged in)
- CSRF protection for state-changing requests
- Consent preference cookie (“bright_consent”) that stores only:
  - consent version and boolean preferences (analytics/diagnostics/training/marketing)
  - timestamp of last update
This cookie does not contain your Discord ID or any direct personal identifier.

3) How We Use Data
We use data to:
- authenticate you and maintain secure sessions
- show you eligible Guilds you can manage
- persist configuration changes you make in the dashboard
- maintain audit logs to improve security and accountability
- apply your consent preferences

4) Data Sharing
We do not sell your data.
We share data only as required to operate the Service:
- Discord OAuth to authenticate and fetch Guild lists
- Hosting/database providers as needed to run the Service

5) Data Retention
We retain stored configuration and logs until:
- you delete your dashboard data using the Account deletion feature, or
- the service operator removes stored data for operational reasons

6) Your Choices & Rights
You can:
- update consent choices at any time in Privacy & Consent
- export dashboard-related data
- delete your dashboard-related data (this also clears the consent cookie)

7) Security
We use standard security measures such as:
- secure session cookies (httpOnly, sameSite; secure in production)
- CSRF protections for state-changing requests
- rate limiting on API routes
- authorization checks to prevent unauthorized access (IDOR)

No system is perfectly secure; if you suspect an issue, report it via the repository issue tracker.

8) Changes
We may update this Privacy Policy from time to time. The “Updated” date will reflect the latest revision.

9) Contact
For privacy questions, contact the project maintainers via the repository issue tracker.
  `.trim();

  res.render("legal", {
    user: req.userInfos,
    pageTitle: "Privacy Policy",
    heading: "Privacy Policy",
    updatedAt: "January 5, 2026",
    content,
  });
});

module.exports = router;
