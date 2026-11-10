# Clearspace

A personal task and idea companion with a calm interface, Aion Labs text AI, and whisper.cpp speech-to-text.

This public repository stores **source code**. Publishing the repository does not run the app or publish a website. The app can run privately on your own computer. No hosting service is enabled by this repository.

## Features

- Today, Upcoming, and Someday task lists; optional dates/times, priority, notes, daily/weekly recurrence.
- Animated completion and Undo.
- Ideas, favourites, original notes, an editable About me profile, and per-idea AI discussions.
- Aion Labs idea/task clarification and suggested actions you can add as tasks.
- whisper.cpp speech-to-text, with temporary recordings removed after processing.
- Password sign-in, SQLite persistence, search, and JSON export/import.

## Already have the Windows all-in-one package?

Keep using **START_CLEARSPACE.cmd** from that extracted package. It contains Node, the Windows speech engine and model, and a setup wizard. It works independently of this repository; your current password, API key and records remain on your computer.

The large Windows runtimes and model weights are deliberately excluded from Git history. This source repository does not include your `.env`, database, recordings, or real credentials.

## Run from source

Use Node.js 24:

```sh
npm ci
npm run setup
```

Open the generated `.env` locally, set `AION_API_KEY`, and review the generated `APP_PASSWORD`. Keep `SESSION_SECRET` private and stable. Configure the local `WHISPER_EXECUTABLE` and `WHISPER_MODEL` paths if you want voice input.

```sh
npm run dev
```

Open http://localhost:5173 and sign in with your app password. Keep the server running. For a built app: `npm run build`, then `npm start` (http://localhost:3000).

Text AI uses `AI_PROVIDER=aion` and defaults to `AION_TEXT_MODEL=aion-labs/aion-3.5-mini`. No OpenAI key is needed for whisper.cpp speech. Without an Aion key, ordinary tasks and local voice still work; text AI is unavailable until configured. Aion key testing makes a short authenticated, potentially billable text request.

## Local Docker option

The Dockerfile builds Linux whisper.cpp v1.8.5 and downloads the checksum-verified multilingual base model. It does not use the Windows runtime.

```sh
docker build -t clearspace .
docker run --env-file .env -e NODE_ENV=development -p 127.0.0.1:3000:3000 -v clearspace-data:/var/data clearspace
```

Use http://localhost:3000. This command intentionally uses local HTTP and binds the published port to loopback. A persistent volume keeps SQLite records. Do not delete the volume unless you intend to erase those records. Docker is optional for local use and requires its own installation.

## Data and privacy

- Private values belong in `.env` or the runtime environment. Never commit an actual API key, app password, session secret, or database.
- Default database: `data/clearspace.sqlite`. Settings > Export creates a portable JSON copy without credentials. Keep regular backups outside the app folder.
- The browser converts recorded audio to mono, 16 kHz, 16-bit PCM WAV and sends it to the computer running the app server. whisper.cpp transcribes it there. The server deletes temporary audio and output files on success, error, and timeout.
- Audio is not sent to Aion or OpenAI. If you request AI cleanup or discussion, the relevant text, profile, and idea conversation are sent to Aion Labs.
- Captures are limited to three minutes. A forced crash can interrupt temporary-file cleanup. With the app stopped, abandoned captures under `data/temp-audio` can be removed.
- Profile memory is explicitly editable and does not inherit ChatGPT history. Review AI suggestions and important transcripts.

## Validation and limits

```sh
npm test
npm run build
```

The app build and 12 backend tests pass. Tests cover authentication, data persistence, Aion routing, local speech validation and cleanup, concurrency, and speech without an external API key. A public sample was also transcribed using real whisper.cpp and the pinned model on Linux. A live Aion account, microphone on a specific device, and the complete Docker image need their own runtime checks.

Task times organize the list; push reminders and native phone widgets are not implemented. This is a single-user app, not a multi-user account system. Localhost on a phone is a different device from localhost on a PC.

## Optional hosting later

No website hosting is configured or started. Optional deployment examples are under `deployment/`. GitHub Pages cannot run this Node/SQLite/native speech backend. Hosting it later requires a server, persistent storage, appropriate CPU/RAM, HTTPS, private runtime credentials, and a review of any charges.

## Third-party notices

Licenses for redistributed dependencies are in `licenses/`. The model checksum is `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`.

References: https://github.com/ggml-org/whisper.cpp ; https://www.aionlabs.ai/docs/api-reference/ .
