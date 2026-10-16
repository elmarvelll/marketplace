// src/app/_components/marketplace-features.ts
//
// Feature switches for the standalone Marketplace's UI.
//
// SKILLS_ENABLED — the Skills side of the marketplace (Popular Skills, the Skills filter side, Skills in My Trade,
// side=skills searches, the admin "Skill Owners" card). Hidden in the standalone app by owner decision: it has no
// backend here (no Skill API, service or listing flow — the Skill tables are AkadVerse's and untouched). Every
// Skills entry point checks this one flag, so turning it back on is a one-line change. UI only: no data, model or
// route was removed.
export const SKILLS_ENABLED = false;
