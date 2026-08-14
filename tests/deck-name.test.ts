import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeDeckTag } from '../src/deck-name';

test('decodes double hyphens as spaces', () => {
  assert.equal(
    decodeDeckTag('Books/Causal--Inference--in--Statistics'),
    'Books::Causal Inference in Statistics'
  );
});

test('preserves nested deck hierarchy', () => {
  assert.equal(
    decodeDeckTag('Books/Statistics/Causal--Inference'),
    'Books::Statistics::Causal Inference'
  );
});

test('decodes underscores as colons while preserving single hyphens', () => {
  assert.equal(
    decodeDeckTag('Active--Recall/Games_--Agency--as--Art'),
    'Active Recall::Games: Agency as Art'
  );
});

test('preserves existing deck tags without encoded punctuation', () => {
  assert.equal(
    decodeDeckTag('My-Existing-Deck/Subdeck'),
    'My-Existing-Deck::Subdeck'
  );
});
