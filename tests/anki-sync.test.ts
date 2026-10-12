import assert from 'node:assert/strict';
import test, { TestContext } from 'node:test';
import type { App, PluginManifest, TFile } from 'obsidian';

// Obsidian supplies runtime classes in the app; its npm package only supplies types.
const notices: string[] = [];
class StubPlugin {
  constructor(public app: App) {}
}
class StubNotice {
  constructor(message: string) {
    notices.push(message);
  }
}
const obsidian = {
  Plugin: StubPlugin,
  Notice: StubNotice,
  AbstractInputSuggest: class {},
  PluginSettingTab: class {},
};
const nodeModule = require('node:module');
const originalLoad = nodeModule._load;
let AnkiService: typeof import('../src/anki-service').AnkiService;
let SimpleAnkiSyncPlugin: typeof import('../src/main').default;
try {
  nodeModule._load = function (id: string, ...args: unknown[]) {
    return id === 'obsidian' ? obsidian : originalLoad.call(this, id, ...args);
  };
  AnkiService = require('../src/anki-service').AnkiService;
  SimpleAnkiSyncPlugin = require('../src/main').default;
} finally {
  nodeModule._load = originalLoad;
}

interface Request {
  action: string;
  version: number;
  params: any;
}
const NETWORK_ERROR = Symbol('network error');
const INVALID_JSON = Symbol('invalid JSON');

function mockAnkiConnect(t: TestContext, respond: (request: Request) => unknown): Request[] {
  const requests: Request[] = [];
  notices.length = 0;
  t.mock.method(console, 'error', () => {});
  const previousXHR = globalThis.XMLHttpRequest;
  class MockXMLHttpRequest {
    responseText = '';
    private listeners: Record<string, () => void> = {};
    addEventListener(event: string, callback: () => void) {
      this.listeners[event] = callback;
    }
    open(method: string, url: string) {
      assert.equal(method, 'POST');
      assert.equal(url, 'http://127.0.0.1:8765');
    }
    send(body: string) {
      const request: Request = JSON.parse(body);
      assert.equal(request.version, 6);
      requests.push(request);
      const response = respond(request);
      if (response === NETWORK_ERROR) {
        this.listeners.error();
        return;
      }
      this.responseText = response === INVALID_JSON ? 'invalid JSON' : JSON.stringify(response);
      this.listeners.load();
    }
  }
  globalThis.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
  t.after(() => { globalThis.XMLHttpRequest = previousXHR; });
  return requests;
}

const NOTE_ID = 1788234234068;
const CARD_ID = 1788234234069;
const DECK_TAG = 'Active--Recall/Games_--Agency--as--Art';
const DECK_NAME = 'Active Recall::Games: Agency as Art';
const MANAGED_TAG = 'obsidian_simple_anki_sync_created';

function syncFixture(
  t: TestContext,
  deckNames = [DECK_NAME],
  override?: (request: Request) => unknown,
  inlineComment = true
) {
  const cards = deckNames.map((deckName, index) => ({
    cardId: CARD_ID + index,
    deckName,
    interval: 27,
    due: 100 + index,
    reps: 12,
    lapses: 2,
  }));
  let fields = { Front: 'Original front', Back: 'Original back' };
  let tags = ['personal'];
  const marker = `<!--ANKI_NOTE_ID:${NOTE_ID}-->`;
  const fixture = {
    content: `#anki/${DECK_TAG}\n\n| Original front |\n| --- |\n` +
      (inlineComment ? `| Original back<br><br>${marker} |` : `| Original back |\n${marker}`),
    modifications: 0,
    cards,
    get fields() { return fields; },
    get tags() { return tags; },
    plugin: undefined as unknown as InstanceType<typeof SimpleAnkiSyncPlugin>,
    requests: [] as Request[],
    file: { path: 'Cards/My note.md', basename: 'My note' } as TFile,
  };
  fixture.requests = mockAnkiConnect(t, request => {
    const overridden = override?.(request);
    if (overridden !== undefined) return overridden;
    const { action, params } = request;
    switch (action) {
      case 'requestPermission': return { result: { permission: 'granted' }, error: null };
      case 'deckNames': return { result: [DECK_NAME, 'Old deck'], error: null };
      case 'createDeck':
        assert.equal(params.deck, DECK_NAME);
        return { result: 42, error: null };
      case 'updateNoteFields':
        assert.equal(params.note.id, NOTE_ID, 'fields must be updated using the note ID');
        fields = { ...fields, ...params.note.fields };
        return { result: null, error: null };
      case 'notesInfo':
        assert.deepEqual(params.notes, [NOTE_ID]);
        return {
          result: [{ noteId: NOTE_ID, modelName: 'Basic', fields, tags, cards: cards.map(c => c.cardId) }],
          error: null,
        };
      case 'updateNoteTags':
        assert.equal(params.note, NOTE_ID);
        tags = params.tags;
        return { result: null, error: null };
      case 'cardsInfo': {
        const result = params.cards.map((id: number) => cards.find(card => card.cardId === id));
        if (result.some((card: unknown) => !card)) {
          return { result: null, error: `No such card: '${params.cards[0]}'` };
        }
        // Return a different order so moving cards cannot rely on positional note/card matching.
        return { result: [...result].reverse(), error: null };
      }
      case 'changeDeck':
        for (const id of params.cards) {
          const card = cards.find(card => card.cardId === id);
          if (!card) return { result: null, error: `No such card: '${id}'` };
          card.deckName = params.deck;
        }
        return { result: null, error: null };
      default: throw new Error(`Unexpected AnkiConnect action: ${action}`);
    }
  });
  const app = {
    vault: {
      read: async () => fixture.content,
      getName: () => 'Test vault',
      modify: async (_file: TFile, content: string) => {
        fixture.modifications++;
        fixture.content = content;
      },
    },
  } as unknown as App;
  fixture.plugin = new SimpleAnkiSyncPlugin(app, {} as PluginManifest);
  fixture.plugin.anki = new AnkiService();
  return fixture;
}

function calls(fixture: ReturnType<typeof syncFixture>, action: string): Request[] {
  return fixture.requests.filter(request => request.action === action);
}

function assertIdentityPreserved(fixture: ReturnType<typeof syncFixture>, expectedContent: string) {
  assert.equal(fixture.content, expectedContent, 'Markdown and note ID comments must stay unchanged');
  assert.equal(fixture.modifications, 0);
  assert.equal(calls(fixture, 'addNote').length, 0, 'existing notes must not be recreated');
  assert.equal(calls(fixture, 'deleteNotes').length, 0, 'existing notes must not be deleted');
}

for (const field of ['Front', 'Back'] as const) {
  test(`sync updates an existing ${field} with distinct note/card IDs and skips a deck move`, async t => {
    const fixture = syncFixture(t);
    const oldText = field === 'Front' ? 'Original front' : 'Original back';
    const newText = `Updated ${field}`;
    fixture.content = fixture.content.replace(oldText, newText);
    const content = fixture.content;
    const history = fixture.cards.map(card => ({ ...card }));

    assert.deepEqual(await fixture.plugin.syncFile(fixture.file), [NOTE_ID]);
    assert.deepEqual(await fixture.plugin.syncFile(fixture.file), [NOTE_ID]);

    assert.ok(fixture.fields[field].startsWith(newText));
    assert.ok(fixture.fields.Back.includes(`noteId=${NOTE_ID}`));
    assert.ok(fixture.tags.includes(MANAGED_TAG));
    assert.equal(calls(fixture, 'updateNoteFields').length, 2);
    assert.equal(calls(fixture, 'changeDeck').length, 0);
    for (const request of calls(fixture, 'cardsInfo')) {
      assert.deepEqual(request.params.cards, [CARD_ID]);
    }
    assert.deepEqual(fixture.cards, history);
    assertIdentityPreserved(fixture, content);
    assert.ok(notices.includes('My note synced.'));
    assert.ok(!notices.some(message => message.includes('No such card')));
  });
}

test('sync moves the existing card using its card ID and preserves its review state', async t => {
  const fixture = syncFixture(t, ['Old deck']);
  const content = fixture.content;
  const history = fixture.cards.map(({ deckName, ...card }) => card);

  assert.deepEqual(await fixture.plugin.syncFile(fixture.file), [NOTE_ID]);
  assert.deepEqual(await fixture.plugin.syncFile(fixture.file), [NOTE_ID]);

  assert.deepEqual(calls(fixture, 'changeDeck').map(request => request.params), [
    { cards: [CARD_ID], deck: DECK_NAME },
  ]);
  assert.equal(fixture.cards[0].deckName, DECK_NAME);
  assert.deepEqual(fixture.cards.map(({ deckName, ...card }) => card), history);
  assertIdentityPreserved(fixture, content);
});

test('sync moves every out-of-deck sibling and skips siblings already in the target deck', async t => {
  const fixture = syncFixture(t, ['Old deck', DECK_NAME, 'Another deck']);
  const content = fixture.content;
  assert.deepEqual(await fixture.plugin.syncFile(fixture.file), [NOTE_ID]);

  assert.deepEqual(calls(fixture, 'cardsInfo')[0].params.cards, [CARD_ID, CARD_ID + 1, CARD_ID + 2]);
  assert.deepEqual(calls(fixture, 'changeDeck')[0].params, {
    cards: [CARD_ID + 2, CARD_ID], deck: DECK_NAME,
  });
  assert.ok(fixture.cards.every(card => card.deckName === DECK_NAME));
  assertIdentityPreserved(fixture, content);
});

test('sync does not move a multi-card note when all siblings are already in the target deck', async t => {
  const fixture = syncFixture(t, [DECK_NAME, DECK_NAME]);
  await fixture.plugin.syncFile(fixture.file);
  assert.equal(calls(fixture, 'changeDeck').length, 0);
});

test('sync preserves legacy standalone note ID comments', async t => {
  const fixture = syncFixture(t, ['Old deck'], undefined, false);
  const content = fixture.content;
  assert.deepEqual(await fixture.plugin.syncFile(fixture.file), [NOTE_ID]);
  assert.deepEqual(calls(fixture, 'changeDeck')[0].params.cards, [CARD_ID]);
  assertIdentityPreserved(fixture, content);
});

test('a note with no generated cards updates fields without any card-level requests', async t => {
  const fixture = syncFixture(t, []);
  const content = fixture.content;
  assert.deepEqual(await fixture.plugin.syncFile(fixture.file), [NOTE_ID]);
  assert.equal(calls(fixture, 'cardsInfo').length, 0);
  assert.equal(calls(fixture, 'changeDeck').length, 0);
  assertIdentityPreserved(fixture, content);
});

for (const { failedAction, failNewNote } of [
  { failedAction: 'cardsInfo', failNewNote: false },
  { failedAction: 'updateNoteFields', failNewNote: false },
  { failedAction: 'updateNoteFields', failNewNote: true },
]) {
  test(`sync saves a new note ID despite a ${failNewNote ? 'new' : 'later existing'} note ${failedAction} error, preventing duplicates on retry`, async t => {
    const newId = NOTE_ID + 100;
    const newCardId = CARD_ID + 100;
    let fail = true;
    let createdFields: Record<string, string> = {};
    const fixture = syncFixture(t, [DECK_NAME], request => {
      const { action, params } = request;
      if (action === 'addNote') {
        createdFields = params.note.fields;
        return { result: newId, error: null };
      }
      if (action === 'updateNoteFields' && params.note.id === newId) {
        if (fail && failNewNote) return { result: null, error: 'temporary error' };
        createdFields = params.note.fields;
        return { result: null, error: null };
      }
      if (action === 'notesInfo' && params.notes[0] === newId) {
        return { result: [{ noteId: newId, fields: createdFields, tags: [MANAGED_TAG], cards: [newCardId] }], error: null };
      }
      if (action === 'cardsInfo' && params.cards[0] === newCardId) {
        return { result: [{ cardId: newCardId, deckName: DECK_NAME }], error: null };
      }
      if (fail && !failNewNote && action === failedAction) return { result: null, error: 'temporary error' };
      return undefined;
    });
    fixture.content = `#anki/${DECK_TAG}\n\n| New front |\n| --- |\n| New back |\n\n` +
      fixture.content.slice(fixture.content.indexOf('| Original front'));

    await assert.rejects(fixture.plugin.syncFile(fixture.file), /temporary error/);
    assert.ok(fixture.content.includes(`<!--ANKI_NOTE_ID:${newId}-->`));
    assert.ok(fixture.content.includes(`<!--ANKI_NOTE_ID:${NOTE_ID}-->`));
    assert.ok(!notices.includes('My note synced.'));
    fail = false;
    assert.deepEqual(await fixture.plugin.syncFile(fixture.file), [newId, NOTE_ID]);
    assert.equal(calls(fixture, 'addNote').length, 1);
    assert.equal(calls(fixture, 'deleteNotes').length, 0);
    assert.equal(calls(fixture, 'changeDeck').length, 0);
  });
}

for (const result of [null, true]) {
  test(`changeDeck recognizes a successful ${result} result`, async t => {
    const requests = mockAnkiConnect(t, () => ({ result, error: null }));
    assert.equal(await new AnkiService().changeDeck([CARD_ID, CARD_ID + 1], DECK_NAME), true);
    assert.deepEqual(requests[0].params, { cards: [CARD_ID, CARD_ID + 1], deck: DECK_NAME });
    assert.deepEqual(notices, []);
  });
}

const failedDeckResponses = [
  { name: 'API error', response: { result: null, error: `No such card: '${CARD_ID}'` }, message: 'No such card' },
  { name: 'API error even with a true result', response: { result: true, error: 'move rejected' }, message: 'move rejected' },
  { name: 'false result', response: { result: false, error: null }, message: 'Unexpected changeDeck result' },
  { name: 'unexpected result', response: { result: 'ok', error: null }, message: 'Unexpected changeDeck result' },
  { name: 'missing result', response: { error: null }, message: 'invalid response' },
  { name: 'missing error', response: { result: null }, message: 'invalid response' },
  { name: 'invalid JSON', response: INVALID_JSON, message: 'Failed to parse' },
  { name: 'network failure', response: NETWORK_ERROR, message: 'Failed to issue request' },
];
for (const { name, response, message } of failedDeckResponses) {
  test(`changeDeck reports ${name} as failure`, async t => {
    mockAnkiConnect(t, () => response);
    assert.equal(await new AnkiService().changeDeck([CARD_ID], DECK_NAME), false);
    assert.ok(notices.some(notice => notice.includes('Failed to move card(s)') && notice.includes(message)));
  });
}

for (const { name, response } of failedDeckResponses) {
  test(`sync cannot report success after a deck-change ${name}`, async t => {
    const fixture = syncFixture(t, ['Old deck'], request => request.action === 'changeDeck' ? response : undefined);
    const content = fixture.content;
    await assert.rejects(fixture.plugin.syncFile(fixture.file), /Failed to move cards for note/);
    assert.ok(!notices.includes('My note synced.'));
    assertIdentityPreserved(fixture, content);
  });
}

for (const action of ['updateNoteFields', 'notesInfo', 'cardsInfo']) {
  test(`sync propagates ${action} errors without moving or recreating the note`, async t => {
    const fixture = syncFixture(t, ['Old deck'], request => request.action === action
      ? { result: null, error: `${action} rejected` } : undefined);
    const content = fixture.content;
    await assert.rejects(fixture.plugin.syncFile(fixture.file), new RegExp(`${action} rejected`));
    assert.equal(calls(fixture, 'changeDeck').length, 0);
    assert.ok(!notices.includes('My note synced.'));
    assert.ok(notices.some(notice => notice.includes(`${action} rejected`)));
    assertIdentityPreserved(fixture, content);
  });
}

for (const action of ['notesInfo', 'cardsInfo']) {
  for (const result of [[], [{}], null]) {
    test(`sync rejects missing ${action} info (${JSON.stringify(result)}) without a deck move`, async t => {
      const fixture = syncFixture(t, ['Old deck'], request => request.action === action ? { result, error: null } : undefined);
      const content = fixture.content;
      await assert.rejects(fixture.plugin.syncFile(fixture.file), /did not return valid info/);
      assert.equal(calls(fixture, 'changeDeck').length, 0);
      assert.ok(!notices.includes('My note synced.'));
      assertIdentityPreserved(fixture, content);
    });
  }
}
