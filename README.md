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

## Use your existing Google Voice number

Google Voice can forward incoming texts to Gmail. This option uses Apps Script to pass text from one exact Google Voice sender address into your hosted board.

1. In Google Voice, open **Settings → Messages** and enable **Forward messages to email**. Text your Google Voice number from your regular cell.
2. On your HTTPS Node host, set `GOOGLE_VOICE_SECRET` to a random secret of at least 32 characters (for example, generate one with `openssl rand -hex 32`). Set `PUBLIC_URL`, `APP_PASSWORD`, and `DATA_DIR` as above. Twilio settings are optional for Google Voice.
3. While signed into the Gmail account receiving the forwards, create a private [Google Apps Script](https://script.google.com/) project and paste in `google-voice-importer.gs`.
4. In **Project Settings → Script Properties**, add `VOICE_SENDER` (the full From address of your forwarded text), `BRAIN_DUMP_URL` (the HTTPS origin of your hosted board), and `BRAIN_DUMP_SECRET` (the same random secret as on the host). Keep these values out of GitHub.
5. Run `importGoogleVoice` once, review and approve Google's Gmail access and external-request permissions, and check that the test card appears. Add a **Time-driven** trigger for `importGoogleVoice` every five minutes.

Google's built-in Gmail service requests mailbox access. The script searches for the exact configured sender, does not change mailbox state, and sends only the matching text and Gmail message ID to your host. The first run can import up to seven days of matching forwards. The host prevents duplicate cards even if a run is retried. Use a different exact sender setting if Google Voice changes the From address for your conversation.
