# Publication security and legal checklist

This is a practical checklist, not legal advice or a statement that the site is compliant. Ask a qualified lawyer/privacy professional to review the final site and data flows for the countries where it will be offered.

## Before public launch

- [ ] Fill in the real operator name, contact address, privacy contact, age policy, retention/deletion schedule, and governing-law/jurisdiction terms in `privacy.html` and `terms.html`. Remove every bracketed draft placeholder.
- [ ] Review Turkish KVKK obligations and, if serving people in the EEA/UK, GDPR/UK GDPR requirements (lawful basis, notices, rights, processor agreements, transfers, and any required representative/impact assessment). Set an age policy appropriate to your audience and applicable consent rules; add parental consent or an age gate if counsel says it is needed.
- [ ] Publish working privacy, terms, and support/contact pages. Explain local storage, Supabase authentication/cloud save, player photos/club badges (including Transfermarkt, EA, and ESPN image/CDN requests), Google Fonts, retention, deletion, and any cross-border processing truthfully. Add a cookie/consent banner if you later add non-essential analytics, advertising, or tracking.
- [ ] Confirm you have permission or a suitable license for every player portrait, club crest/logo, font, and other third-party asset. Linking to a publicly reachable image does not grant reuse rights. Get legal advice on names, likeness/publicity rights, trademark use, and takedown requests.
- [ ] Make the game's independent/unofficial status clear. Do not imply sponsorship, endorsement, or affiliation with EA, FC, UEFA, ESPN, TFF, Süper Lig, clubs, or Transfermarkt. Distinguish ratings copied from EA's FC 27 ratings page from estimated gameplay ratings, and disclose the EA portrait-version mismatch and simulated European fixtures.
- [ ] Keep Supabase RLS enabled on every user-data table. Never deploy a service-role/secret key to the browser. Restrict Auth redirect origins, enable email confirmation, configure rate limits and password policy, and review database backups/region/access controls.
- [ ] Test account isolation, sign-up/confirmation, sign-in/out, cloud/local save conflicts, data export/deletion handling, and restore/backups. Add monitoring and an incident/breach response plan before collecting real user accounts.
- [ ] Use HTTPS only; check the deployed `_headers` response, CSP, service-worker behavior, dependency/CDN versions, and accessible/mobile auth flows. Keep dependencies and the roster/portrait sources reviewed and updated.
- [ ] Decide whether underage users can register and how support, moderation, account deletion, and legal requests are handled. Publish a real contact channel.

No analytics or ads are included by default. If added later, reassess consent, privacy disclosures, retention, vendor contracts, and the Content Security Policy.
