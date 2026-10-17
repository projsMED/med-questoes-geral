import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getItemChance,
  pickWeightedVariant,
  parseContent,
  reshuffleVariants,
  reshuffleChVariants
} from '../js/parser.js';

test('getItemChance extrai apenas chance numérica positiva, caindo em 1 por padrão', () => {
  assert.equal(getItemChance(undefined), 1);
  assert.equal(getItemChance(null), 1);
  assert.equal(getItemChance({}), 1);
  assert.equal(getItemChance({ chance: 0 }), 1);
  assert.equal(getItemChance({ chance: -5 }), 1);
  assert.equal(getItemChance({ chance: NaN }), 1);
  assert.equal(getItemChance({ chance: 'invalido' }), 1);
  assert.equal(getItemChance({ peso: 5 }), 1); // Garante que 'peso' não é aceito
  assert.equal(getItemChance({ probabilidade: 3 }), 1); // Garante que apenas 'chance' é aceito

  assert.equal(getItemChance({ chance: 2 }), 2);
  assert.equal(getItemChance({ chance: 3.5 }), 3.5);
  assert.equal(getItemChance({ chance: 0.5 }), 0.5);
  assert.equal(getItemChance({ chance: '4' }), 4);
});

test('pickWeightedVariant sorteia proporcionalmente aos pesos de chance', () => {
  assert.equal(pickWeightedVariant([]), null);

  const single = [{ id: 'x' }];
  assert.equal(pickWeightedVariant(single), single[0]);

  const items = [
    { id: 'v', chance: 2 }, // 50% (0 a 0.5)
    { id: 'f1' },           // 25% (0.5 a 0.75, chance padrão = 1)
    { id: 'f2' }            // 25% (0.75 a 1.0, chance padrão = 1)
  ];

  // Simula valores determinísticos do randomFn
  assert.equal(pickWeightedVariant(items, () => 0.0).id, 'v');
  assert.equal(pickWeightedVariant(items, () => 0.25).id, 'v');
  assert.equal(pickWeightedVariant(items, () => 0.49).id, 'v');
  assert.equal(pickWeightedVariant(items, () => 0.50).id, 'f1');
  assert.equal(pickWeightedVariant(items, () => 0.74).id, 'f1');
  assert.equal(pickWeightedVariant(items, () => 0.75).id, 'f2');
  assert.equal(pickWeightedVariant(items, () => 0.99).id, 'f2');
  assert.equal(pickWeightedVariant(items, () => 1.0).id, 'f2'); // fallback de limite
});

test('pickWeightedVariant apresenta distribuição estatística esperada', () => {
  const items = [
    { id: 'v', chance: 2 },
    { id: 'f1' },
    { id: 'f2' }
  ];

  const counts = { v: 0, f1: 0, f2: 0 };
  const TRIALS = 12000;
  for (let i = 0; i < TRIALS; i++) {
    const chosen = pickWeightedVariant(items);
    counts[chosen.id]++;
  }

  // Esperado: v = ~50% (6000), f1 = ~25% (3000), f2 = ~25% (3000) com margem de tolerância
  assert.ok(counts.v > 5400 && counts.v < 6600, `Esperado ~6000 acertos para 'v', obtido: ${counts.v}`);
  assert.ok(counts.f1 > 2500 && counts.f1 < 3500, `Esperado ~3000 acertos para 'f1', obtido: ${counts.f1}`);
  assert.ok(counts.f2 > 2500 && counts.f2 < 3500, `Esperado ~3000 acertos para 'f2', obtido: ${counts.f2}`);
});

test('parseContent respeita chance em nó VARIANTES e preserva _variantNode', () => {
  const nodeVariantes = {
    tipo: 'VARIANTES',
    questoes: [
      { tipo: 'VF', enunciado: 'Q1 - V', gabarito: 'V', chance: 2 },
      { tipo: 'VF', enunciado: 'Q2 - F1', gabarito: 'F' },
      { tipo: 'VF', enunciado: 'Q3 - F2', gabarito: 'F' }
    ]
  };

  // 0.2 deve sortear o item com chance: 2
  const parsedV = parseContent([nodeVariantes], ['Raiz'], () => 0.2);
  assert.equal(parsedV.length, 1);
  assert.equal(parsedV[0].enunciado, 'Q1 - V');
  assert.ok(parsedV[0]._variantNode);
  assert.equal(parsedV[0]._variantNode.questoes.length, 3);
  assert.equal(parsedV[0]._variantNode.questoes[0].chance, 2);

  // 0.6 deve sortear o item Q2 - F1
  const parsedF1 = parseContent([nodeVariantes], ['Raiz'], () => 0.6);
  assert.equal(parsedF1[0].enunciado, 'Q2 - F1');

  // 0.85 deve sortear o item Q3 - F2
  const parsedF2 = parseContent([nodeVariantes], ['Raiz'], () => 0.85);
  assert.equal(parsedF2[0].enunciado, 'Q3 - F2');
});

test('reshuffleVariants respeita chance ao reembaralhar questões', () => {
  const nodeVariantes = {
    tipo: 'VARIANTES',
    questoes: [
      { tipo: 'VF', enunciado: 'Q1 - V', gabarito: 'V', chance: 2 },
      { tipo: 'VF', enunciado: 'Q2 - F1', gabarito: 'F' },
      { tipo: 'VF', enunciado: 'Q3 - F2', gabarito: 'F' }
    ]
  };

  // Carga inicial com Q3
  const questions = parseContent([nodeVariantes], ['Raiz'], () => 0.85);
  assert.equal(questions[0].enunciado, 'Q3 - F2');

  // Reshuffle sorteando Q1 (chance 2) via random 0.1
  reshuffleVariants(questions, () => 0.1);
  assert.equal(questions[0].enunciado, 'Q1 - V');

  // Reshuffle subsequente sorteando Q2 via random 0.6
  reshuffleVariants(questions, () => 0.6);
  assert.equal(questions[0].enunciado, 'Q2 - F1');
});

test('parseContent e reshuffleChVariants respeitam chance em assertivas de MVF', () => {
  const mvfNode = {
    tipo: 'MVF',
    enunciado: 'Sobre DRGE:',
    assertivas: [
      { id: '1', texto: 'Item 1 - V', is_correct: true, chance: 2 },
      { id: '1', texto: 'Item 1 - F1', is_correct: false },
      { id: '1', texto: 'Item 1 - F2', is_correct: false },
      { id: '2', texto: 'Item 2 Fixo', is_correct: true }
    ]
  };

  // Carga inicial: assertiva 1 sorteada com chance 2 via random 0.2
  const parsedV = parseContent([mvfNode], ['Raiz'], () => 0.2);
  assert.equal(parsedV.length, 1);
  assert.equal(parsedV[0].assertivas.length, 2);
  assert.equal(parsedV[0].assertivas[0].texto, 'Item 1 - V');
  assert.equal(parsedV[0].assertivas[1].texto, 'Item 2 Fixo');
  assert.ok(parsedV[0]._originalAssertivas);
  assert.equal(parsedV[0]._originalAssertivas[0].chance, 2);

  // Reshuffle da assertiva 1 para Item 1 - F1 (random 0.6)
  reshuffleChVariants(parsedV, () => 0.6);
  assert.equal(parsedV[0].assertivas[0].texto, 'Item 1 - F1');
  assert.equal(parsedV[0].assertivas[1].texto, 'Item 2 Fixo');

  // Reshuffle da assertiva 1 para Item 1 - F2 (random 0.85)
  reshuffleChVariants(parsedV, () => 0.85);
  assert.equal(parsedV[0].assertivas[0].texto, 'Item 1 - F2');
});
