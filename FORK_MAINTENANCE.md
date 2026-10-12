# Personal Fork Maintenance Guide

This document explains why this fork exists, how it is installed, how releases
work, and how to incorporate future changes from the upstream project. Read it
before changing, releasing, or updating this fork.

## Purpose of this fork

The upstream project is **Simple Anki Sync** by Lukas Mayr:

- Upstream repository: `lukmay/simple-anki-sync`
- Personal fork: `russluber/simple-anki-sync`

Simple Anki Sync selects an Anki deck from an Obsidian tag such as:

```text
#anki/Books/Statistics
```

Obsidian tags cannot contain spaces. Upstream preserves hyphens, so a tag such
as `#anki/Causal-Inference` normally creates the Anki deck
`Causal-Inference`.

This fork adds one intentionally small convention:

```text
--  becomes a space
/   becomes ::
-   remains a literal hyphen
_   becomes a colon
```

Examples:

```text
#anki/Books/Causal--Inference
-> Books::Causal Inference

#anki/Books/Pre-Post--Analysis
-> Books::Pre-Post Analysis

#anki/Active--Recall/Games_--Agency--as--Art
-> Active Recall::Games: Agency as Art
```

The underscore is a reserved encoding character in this fork. Existing tags
that previously produced literal underscores will instead produce colons, and
there is currently no separate encoding for a literal underscore in an Anki
deck name.

The implementation is deliberately isolated:

- `src/deck-name.ts` contains the deck-tag decoder.
- `src/main.ts` calls the decoder while parsing a note's `#anki/...` tag.
- `tests/deck-name.test.ts` covers spaces, colons, nesting, literal hyphens, and
  backward compatibility for tags that do not use the reserved encodings.
- `README.md` documents the syntax.

The goal is to keep this a small personal patch that is easy to retain while
merging future upstream updates. It is not intended to become a rewrite or a
separate public Community Plugins submission.

## Repository and remote layout

The local repository has two remotes:

```text
origin    https://github.com/russluber/simple-anki-sync.git
upstream  https://github.com/lukmay/simple-anki-sync.git
```

- Pull personal branches and releases from `origin`.
- Fetch original-author updates from `upstream`.
- Push personal work and release tags explicitly to `origin`.
- Do not push to `upstream` unless intentionally contributing a change to the
  original project.

Useful checks:

```powershell
git remote -v
git branch --show-current
git status --short --branch
```

## Installation model

Install only this fork through **BRAT** using:

```text
russluber/simple-anki-sync
```

Do not also install upstream Simple Anki Sync. Both repositories use the same
Obsidian plugin ID, `simple-anki-sync`, so Obsidian treats them as the same
plugin and they cannot coexist independently.

BRAT monitors releases from the personal fork. It does not automatically merge
or install releases from `lukmay/simple-anki-sync`.

Because the fork retains the official plugin ID, also pay attention to version
ordering. If upstream eventually publishes a version higher than the installed
fork version, Obsidian's normal Community Plugins updater may regard that
official build as an available update. Keep BRAT registered for the fork, do not
accept an official update blindly, and publish a tested fork release with a
higher version after incorporating the desired upstream changes.

This fork is not published to Obsidian's Community Plugins directory. Creating
a GitHub release does not submit it there. Community publication would require
a separate, deliberate submission to Obsidian.

## Current rollout status

As of 2026-08-13:

- Upstream and the fork's `main` started at upstream version `1.7.0`.
- Feature branch: `feat/deck-name-spaces`.
- The feature and tests are committed.
- Current development version: `1.8.0-beta.2`.
- GitHub prerelease `1.8.0-beta.1` is published with `main.js` and
  `manifest.json`.
- The beta installs successfully through BRAT and the space-decoding behavior
  has been manually verified.
- The underscore-to-colon rule was added after `beta.1` was published and must
  be released as `1.8.0-beta.2`; published tags and release assets are not
  rewritten.
- A draft pull request targets `russluber/simple-anki-sync:main` from
  `feat/deck-name-spaces`.

Update this section after completing the stable release so it does not become
misleading.

## Finish the current beta and make it stable

After the full manual test checklist passes:

1. After testing the latest beta, change the version in both `manifest.json`
   and `package.json` from `1.8.0-beta.2` to `1.8.0`.
2. Run:

   ```powershell
   npm test
   npm run build
   git diff --check
   ```

3. Commit and push the final version change to the feature branch:

   ```powershell
   git add manifest.json package.json
   git commit -m "chore: prepare 1.8.0 release"
   git push origin feat/deck-name-spaces
   ```

4. Update the pull-request description with the manual test results, mark the
   PR ready, and merge it into the fork's `main`.
5. Update the local `main` after the merge:

   ```powershell
   git switch main
   git pull --ff-only origin main
   ```

6. Tag the commit that is now on `main`, then push the tag to the fork:

   ```powershell
   git tag 1.8.0
   git show --no-patch --decorate 1.8.0
   git push origin 1.8.0
   ```

7. The tag triggers `.github/workflows/relese.yml`. Wait for the workflow to
   create a draft GitHub release containing `main.js` and `manifest.json`.
8. Open the draft release, add release notes, leave **Set as a pre-release**
   unchecked, and publish it.
9. In Obsidian, ask BRAT to update the plugin. BRAT may require a manual update
   when moving from a prerelease to the stable release with the same core
   version.
10. Once everything is confirmed, delete the merged feature branch if desired:

    ```powershell
    git branch -d feat/deck-name-spaces
    git push origin --delete feat/deck-name-spaces
    ```

Never move or reuse an already-published tag. If a released artifact is wrong,
fix it in a new commit and publish a new version.

## Routine release workflow

For any future change:

1. Start from an up-to-date personal `main`.
2. Create a focused feature or maintenance branch.
3. Make and test the change.
4. Bump `manifest.json` and `package.json` to the same new version.
5. Commit and push the branch to `origin`.
6. Open a pull request against the fork's `main`.
7. For a beta, tag the beta commit and publish the generated draft release as a
   prerelease.
8. Test the prerelease through BRAT.
9. Prepare the stable version, merge the PR, tag the resulting `main` commit,
   and publish the generated stable release.

The release tag must exactly match the version inside `manifest.json`:

```text
manifest version: 1.8.0-beta.2
release tag:      1.8.0-beta.2
```

The existing GitHub Actions workflow runs for every pushed tag, builds the
plugin, and creates a **draft** release. Publishing that draft is a separate
manual action.

## Versioning policy for the personal fork

Use Semantic Versioning with exactly three numeric components:

```text
MAJOR.MINOR.PATCH
```

Use prerelease suffixes for testing:

```text
1.8.0-beta.1
1.8.0-beta.2
1.8.0
```

Do not use a four-part version such as `1.7.0.1`.

Every fork release must have a unique version greater than the previous fork
release. When upstream later publishes a version number already used by this
fork, there is no repository-level collision, but choose a higher version in
the fork to keep BRAT ordering and the history clear. For example:

```text
upstream 1.8.0 + retained fork customization -> fork 1.8.1
upstream 1.9.0 + retained fork customization -> fork 1.9.1
```

The exact next number should also account for every version already published
in the fork. Never lower the fork's version merely to match upstream.

Git tags from `origin` and `upstream` share a single tag namespace in the local
clone. If both repositories independently use the same tag name for different
commits, Git will retain the existing local tag rather than treating them as two
separate tags. The upstream branch is what matters for merging; avoid
`git fetch upstream --tags`, never overwrite a published fork tag, and inspect
the upstream release on GitHub if its tag is needed for reference.

## When upstream is updated

An upstream release does nothing automatically to the installed fork. Continue
using the current fork until there is a reason to incorporate the upstream
fixes or features.

When an upstream update is wanted, merge it through a temporary branch rather
than directly into the fork's `main`:

```powershell
git switch main
git pull --ff-only origin main
git fetch upstream
git log --oneline main..upstream/main
git switch -c chore/merge-upstream-1.8.0
git merge upstream/main
```

If Git reports conflicts:

1. Resolve them without discarding the deck-name decoder.
2. Confirm `src/main.ts` still imports and calls `decodeDeckTag`.
3. Confirm `src/deck-name.ts`, its tests, and README documentation remain.
4. Check whether upstream changed deck parsing or implemented an equivalent
   feature. Do not blindly preserve two competing decoders.

Then validate:

```powershell
npm install
npm test
npm run build
git diff --check
```

Also repeat the manual Obsidian/AnkiConnect checklist below. Bump the fork to a
new version, commit, push the branch to `origin`, and open a pull request against
the fork's `main`. Use the normal beta/stable release workflow.

If upstream eventually provides equivalent space support with acceptable
syntax and compatibility, consider removing the personal decoder and returning
to upstream behavior. At that point this fork may no longer need a custom
release line.

## Manual test checklist

Keep Anki open with AnkiConnect installed and active. Use a test vault or
disposable test notes where practical.

- New card: `#anki/Books/Causal--Inference` creates a card in
  `Books::Causal Inference`.
- Nested decks: multiple `/` components become multiple `::` components.
- Literal punctuation: `Pre-Post--Analysis` becomes `Pre-Post Analysis`.
- Colon encoding: `Games_--Agency--as--Art` becomes
  `Games: Agency as Art`.
- Existing legacy tags containing only single hyphens remain unchanged.
- Existing synced card: changing the deck tag updates or moves the existing
  card rather than creating a duplicate.
- Repeated syncs do not create additional cards.
- Unrelated tags such as `#book` do not affect deck selection.
- A filename containing spaces does not affect deck parsing.
- The **Obsidian Note** backlink opens the source vault and note; when possible,
  it jumps to the synced table.
- Unsync behavior still removes only the cards managed by the source file.

Record manual results in the pull-request description before merging a release.

## Anki note IDs and duplicate cards

Do not manually remove comments such as:

```html
<!--ANKI_NOTE_ID:1755123456789-->
```

The plugin writes this marker only after Anki successfully creates a note. On
later syncs it uses the ID to update the existing note instead of creating a new
one.

Anki normally rejects a new note when another note of the same note type has the
same first field (`Front` for `Basic`). The existing note may be in another
deck. In that situation AnkiConnect reports:

```text
cannot create note because it is a duplicate
```

Because creation failed, no `ANKI_NOTE_ID` is returned or written into the
Markdown table. This is expected failure behavior, not evidence that the table
syntax itself is wrong.

Before deleting anything, determine whether the existing Anki note has review
history worth preserving:

- Disposable duplicate: delete the unwanted Anki note and sync again.
- Valuable existing note: preserve it and plan an explicit migration/linking
  procedure.
- Intentionally identical fronts: decide whether the fronts should be made
  distinct or whether duplicate support should be designed deliberately.

Do not enable `allowDuplicate` globally merely to silence this error. A missing
ID marker could otherwise create accidental duplicate notes on every sync.

## AnkiConnect compatibility: note IDs and card IDs

An Anki note and its generated cards have separate IDs. For example, note
`1788234234068` can own card `1788234234069`. The Markdown `ANKI_NOTE_ID`
comment, `updateNoteFields`, and note tags must keep using the note ID.
`cardsInfo` and `changeDeck` require card IDs. Resolve those IDs from the
`cards` array returned by `notesInfo`, then check each card's deck and move
only cards outside the target deck. This also covers notes with multiple cards.

The previous sync path incorrectly supplied the note ID to both card actions.
AnkiConnect's [version 6 API documentation](https://github.com/FooSoft/anki-connect/blob/9f7dccaca071eedb51068bdf6ae5a11ffa60bac7/README.md)
already distinguished these operations and documented successful deck changes
as `{ "result": null, "error": null }`. The
[archived implementation](https://github.com/FooSoft/anki-connect/blob/master/plugin/__init__.py)
used a SQL update for deck moves. The updated add-on installed locally during
this investigation routes deck changes through `cards.move`, which loads each
card before moving it. This is consistent with the update exposing a previous
ID mismatch that could otherwise pass without moving any card. A missing card
at the supplied note ID is not, by itself, evidence of database corruption.

The fix preserves the original notes, card IDs, and review state. Failed
lookups, updates, and deck changes are reported instead of producing a
successful sync notice. If a file contains new and existing notes, successfully
created note IDs are saved before reporting an update/move error so retrying
does not recreate those notes.

Automated checks:

```powershell
npm test
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
npm run build
git diff --check
```

Manual verification after installing the rebuilt `main.js` and reloading the
plugin in Obsidian:

1. Keep Anki open. Record an existing note's ID, its card IDs, and review state
   from Anki's browser/card information or AnkiConnect.
2. Edit Front, sync the current file, then edit Back and sync again. Confirm
   both edits appear, the Markdown note ID is unchanged, and no duplicate or
   `No such card` error appears.
3. Change the file's deck tag and sync. Confirm the same cards move to the
   decoded target deck and retain their review history. Sync again without
   edits; the IDs and card count should remain stable.
4. Repeat with an existing note that generates multiple cards with Front/Back
   fields. All siblings outside the target deck should move; siblings already
   there should be left alone.
5. Confirm spaces (`--`), colons (`_`), hierarchy (`/`), media, and the Obsidian
   backlink still work as before.

## The Obsidian Note backlink

The small **Obsidian Note** link appended to each Anki answer is intentional. It
uses an `obsidian://` URL to launch or focus Obsidian, open the source vault and
file, and locate the table by its Anki note ID. It is useful when a card needs to
be corrected while reviewing in Anki.

The backlink is separate from synchronization identity. The hidden
`ANKI_NOTE_ID` marker in Markdown is what lets the plugin update a previously
created Anki note.

## Maintenance principles

- Keep the fork-specific diff small and localized.
- Prefer TypeScript source changes; never hand-edit generated `main.js`.
- Do not change the Markdown flashcard table syntax for unrelated features.
- Do not commit generated `main.js`; the release workflow builds it.
- Preserve unrelated upstream behavior whenever possible.
- Run automated tests, the production build, and live integration tests before
  every release.
- Use focused commits and pull requests so upstream merges remain understandable.
- Keep BRAT pointed at `russluber/simple-anki-sync`, not the upstream repository.
