import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {challengeCode, normalizeChallenge, findChallenge, formatGuesses, Round} from '../game/js/engine.js';
import {validateContent} from '../game/js/content.js';
const raw=JSON.parse(await readFile(new URL('../game/data/words.json',import.meta.url),'utf8'));
const content=validateContent(raw);

test('код однозначно выбирает ту же карточку независимо от порядка и новых слов',()=>{
  const codes=new Set();
  for(const entry of content.words){
    const code=challengeCode(entry.id);
    assert.match(code,/^BB1-[0-9A-F]{8}$/);
    assert.ok(!code.includes(entry.word));
    codes.add(code);
    assert.equal(findChallenge([...content.words].reverse(),code).id,entry.id);
    assert.equal(findChallenge(content.words,`bukvazabukvoy://challenge/${code}`).word,entry.word);
    const round=new Round(findChallenge(content.words,code),content.accepted);
    for(const letter of entry.word) round.insert(letter);
    assert.equal(round.submit().status,'won');
  }
  assert.equal(codes.size,content.words.length);
  assert.equal(challengeCode('word-001'), 'BB1-6520ECE2');
});

test('неизвестные версии и опасные адреса не превращаются в приглашение',()=>{
  for(const value of ['',null,{},'BB2-12345678','BB1-12345678?x=1','https://example.com/BB1-12345678',
    'bukvazabukvoy://challenge@evil/BB1-12345678','bukvazabukvoy://challenge:42/BB1-12345678',
    'bukvazabukvoy://challenge/../BB1-12345678','BB1-12345678\n<script>','x'.repeat(129)]){
    assert.equal(normalizeChallenge(value),null,String(value));
  }
  assert.equal(normalizeChallenge(' bb1-1234abcd '),'BB1-1234ABCD');
  assert.equal(findChallenge(content.words,'BB1-00000000'),null);
});

test('число догадок в приглашении правильно склоняется и не обещает победу',()=>{
  for(const [n,expected] of [[1,'за 1 догадку'],[2,'за 2 догадки'],[5,'за 5 догадок'],[11,'за 11 догадок'],[21,'за 21 догадку'],[24,'за 24 догадки']]) assert.equal(formatGuesses(n),expected);
});
