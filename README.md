# BRAIN DUMP

A single-user capture board for notes, ideas, links, and checklists. Search matches titles, content, types, and hashtags. Type filters are color-coded, and tags such as `#home` or `#groceries` create additional groups.

## Run locally

Install Node.js 24 or newer, run `npm start`, and open http://127.0.0.1:3000. SQLite saves your captures and checklist progress. The default local server listens only on loopback.

Examples to paste or text:

- `Idea: Paint the entryway bright orange #home`
- `https://example.com #reading`
- `List: eggs, oranges, yogurt #groceries`
- Several short items on separate lines, or a title followed by bullet points.

## Host it and connect SMS

Deploy this as a Node service with HTTPS and a persistent disk. Set `DATA_DIR` to a directory on the disk. Use one app instance and back up the SQLite database using SQLite-aware backups. Keep secrets in the host's environment settings.

| Variable | Value |
| --- | --- |
| `PUBLIC_URL` | The HTTPS origin of the service |
| `APP_PASSWORD` | A long random password. Browser username is `brain`. |
| `DATA_DIR` | Persistent directory for the database |
| `PORT` | The port supplied by your host, or 3000 |
| `SMS_FROM` | Your personal phone number in E.164 format, including `+` |
| `TWILIO_AUTH_TOKEN` | The auth token for the Twilio account that owns the receiving number |

In Twilio, configure an SMS-capable number's incoming-message webhook to send HTTP POST requests to `https://your-app.example/sms`. Use the exact public URL, with no trailing slash after `/sms` or query string. Text that number to add cards. The board refreshes every five seconds while visible. The webhook verifies [Twilio's signature](https://www.twilio.com/docs/usage/security#validating-requests), accepts your configured sender, and ignores duplicate deliveries. It captures SMS text and URLs. Multimedia attachments and iMessage forwarding are outside this version.

GitHub holds the source. The separate Node host runs the server and stores the board. GitHub Pages is static and cannot run the SMS webhook or SQLite database.
