---
title: Guides
description: Task-oriented guides for the things maintainers build with Sponsorkit, in every SDK language.
sidebar_label: Overview
---

Each guide solves one task from start to finish, with complete code for JavaScript/TypeScript, .NET, Python,
Go and Rust. Pick a language once and every code block on the site follows it.

If you haven't installed an SDK yet, start with the [quickstart](../getting-started/quickstart.md). The ideas
behind the API (targets, sessions, statuses, caching) are explained in [Concepts](../concepts/index.md).

## Use the result

- [Gate a feature or show an ad](gate-features.md): turn "what has this person contributed?" into your own rule.
- [Show a sponsor nag in a CLI](nag.md): a polite "please support this project" message every N runs.

## Sign-in and checkout

- [Add a sponsor button to a web app](web-app.md): `<sponsorkit-button>`, `<sponsorkit-badge>` and the popup
  flow, with a redirect fallback when popups are blocked.
- [Use Sponsorkit in a CLI or desktop app](native-apps.md): loopback and paste-back sign-in, timeouts and
  cancellation.
- [Open checkout and detect a new contribution](checkout.md): send supporters to GitHub Sponsors or Open
  Collective and find out when they've contributed.

## Production

- [Verify supporters on your backend](backend-verification.md): a trustworthy answer on your server, with no
  API key.
- [Test your integration](mock-mode.md): mock presets, `SPONSORKIT_MOCK`, `SPONSORKIT_DISABLE` and CI.
- [Handle errors and offline](errors-and-offline.md): what can throw, what never throws, and how stale data
  is reported.
