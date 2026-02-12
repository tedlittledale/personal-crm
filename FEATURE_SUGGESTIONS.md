# Feature Suggestions

Prioritized feature ideas for People Notes, based on analysis of the existing codebase and common CRM patterns.

---

## High Impact

### 1. Interaction Log / Timeline

**Problem:** The app captures *who* someone is but not *when* you last interacted or *what* you discussed over time. The `notes` field is a single blob — older context gets overwritten or buried.

**Suggestion:** Add an `interactions` table (`id`, `personId`, `userId`, `date`, `channel`, `summary`, `createdAt`). Each voice note, manual entry, or Telegram exchange becomes a timestamped event. The person detail page gets a chronological timeline view.

This also enables "when did I last talk to X?" queries through the existing NL search system — `nl-query.ts` just needs the new table as a join target.

**Schema addition:**
```
interactions: id, personId, userId, date, channel (voice_note | manual | telegram | email), summary, createdAt
```

---

### 2. Tags and Groups

**Problem:** No way to categorize contacts. Users can't ask "show me all investors" or "people from the conference" without hoping that info ended up in the `source` or `notes` field.

**Suggestion:** Add a `tags` table and a `peopleTags` join table. Tags are user-scoped. The voice extraction prompt in `extract.ts` can be extended to suggest tags from existing ones. The NL query system already supports filtering — adding tag-based filters would be straightforward.

The home page gets a tag filter sidebar or chips. Bulk tagging via multi-select would pair well with this.

---

### 3. Follow-up Reminders

**Problem:** A CRM that doesn't nudge you to follow up is just an address book. Currently the only proactive outreach is the weekly summary (new contacts + birthdays).

**Suggestion:** Add a `reminders` table (`id`, `userId`, `personId`, `dueDate`, `note`, `status`). Reminders can be created manually or extracted from voice notes ("I should follow up with Sarah next week about the proposal"). The weekly summary cron already runs hourly — extend it to check for due reminders and send them via Telegram.

The voice extraction prompt can detect follow-up intent and auto-create reminders during the review flow.

---

### 4. Contact Staleness / "Reach Out" Suggestions

**Problem:** Contacts decay. You add someone, then forget about them for months. There's no signal for who's been neglected.

**Suggestion:** Use the `updatedAt` timestamp (and the interaction log from suggestion #1 if implemented) to compute a "last touched" metric. The weekly summary can include a "You haven't updated these contacts in 90+ days" section. The home page could sort by staleness as an option.

This requires no schema changes if based on `updatedAt` alone — just a query and a tweak to `weekly-summary.ts`.

---

## Medium Impact

### 5. Relationship Mapping Between Contacts

**Problem:** People know each other. "Sarah introduced me to James" or "Alex and Pat work together at Stripe" — this context currently lives only in free-text notes, invisible to queries.

**Suggestion:** Add a `relationships` table (`id`, `personAId`, `personBId`, `userId`, `type`, `note`). Types could be: `introduced_by`, `works_with`, `family`, `mutual_friend`, etc. The person detail page shows a "Connections" section. Voice extraction can detect relationship mentions.

NL queries like "who did Sarah introduce me to?" become possible.

---

### 6. Voice Note Archive

**Problem:** Voice transcripts are stored in `pendingReviews` with a 7-day expiry. Once confirmed, the original transcript is discarded. Users lose the raw context of what they said.

**Suggestion:** When a review is confirmed, copy the `originalTranscript` and `tidiedTranscript` to the interaction log (or a dedicated `voiceNotes` table linked to the person). This preserves full context and makes transcripts searchable later.

Minimal change: just persist the transcript fields during the confirm action in the review route.

---

### 7. Bulk Operations

**Problem:** No way to delete, tag, or edit multiple contacts at once. The import flow handles bulk *creation* well, but ongoing management is one-at-a-time.

**Suggestion:** Add multi-select checkboxes to the people list. Support bulk delete, bulk tag, and bulk export (selected subset). The API already has `/api/people/bulk` for creation — extend the pattern to bulk update/delete.

---

### 8. WhatsApp / SMS Channel

**Problem:** The `MessagingProvider` abstraction in `src/lib/messaging/` is explicitly designed for multiple channels, but only Telegram is implemented.

**Suggestion:** Add a Twilio-backed provider for WhatsApp and SMS. This would let users who don't use Telegram still get weekly summaries and ask questions about their contacts via text. The provider interface is already defined — this is mostly integration work.

---

## Lower Priority (Nice-to-Have)

### 9. Contact Photos

Link a photo URL to each contact. Could pull from Gravatar by email, or allow manual upload. The people list and detail page would show avatars, making the UI more scannable.

### 10. Calendar View for Birthdays

A monthly calendar view showing upcoming birthdays. The data already exists (`birthdayMonth`, `birthdayDay`) — this is a pure frontend feature.

### 11. Duplicate Merge UI

Fuzzy matching already exists in `fuzzy-search.ts` and is used during voice note review. Expose a standalone "Find Duplicates" tool that scans all contacts, shows potential matches with similarity scores, and lets users merge them (picking which fields to keep from each).

### 12. LinkedIn / Social Profile Fields

Add `linkedinUrl`, `twitterHandle`, `websiteUrl` fields to the `people` schema. Voice extraction can capture these ("his LinkedIn is..."). Makes contacts more actionable.

### 13. Shared Contacts

Allow two users to share a contact (or a group of contacts) with each other. Useful for couples, co-founders, or teams who share a professional network.

---

## Implementation Notes

- Suggestions #1-3 are the highest leverage because they transform the app from a static directory into an active relationship management tool.
- Suggestion #4 requires almost no code — it's a query + a tweak to the weekly summary.
- The existing Claude integration patterns (`extract.ts`, `nl-query.ts`) make AI-powered extraction of tags, reminders, and relationships natural extensions rather than new systems.
- The `MessagingProvider` abstraction means channel expansion (#8) is already architecturally supported.
