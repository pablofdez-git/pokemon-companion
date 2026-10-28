import * as assert from 'assert';
import {
  ENCOUNTER_CHANCE,
  ENCOUNTER_COOLDOWN_MS,
  EncounterGate,
  MAX_COOLDOWN_SECONDS,
  MAX_ENCOUNTER_CHANCE,
  MIN_COOLDOWN_SECONDS,
  MIN_ENCOUNTER_CHANCE,
  catchProbability,
  clampEncounterChance,
  cooldownMsFromSeconds,
  failedShakes,
  rollEncounter,
  rollShiny,
} from '../game/encounter';
import { BALLS, BallType, CatchContext, RETIRED_BALLS, describeMultiplier } from '../game/items';

function ball(id: string): BallType {
  const found = BALLS.find((b) => b.id === id);
  assert.ok(found, `no existe la ball ${id}`);
  return found;
}

function ctx(overrides: Partial<CatchContext> = {}): CatchContext {
  return { throwNumber: 1, hour: 12, ...overrides };
}

suite('balls', () => {
  test('cada ball tiene un id distinto', () => {
    assert.strictEqual(new Set(BALLS.map((b) => b.id)).size, BALLS.length);
  });

  test('Quick Ball solo en el primer lanzamiento', () => {
    assert.strictEqual(ball('quickball').multiplier(ctx({ throwNumber: 1 })), 5);
    assert.strictEqual(ball('quickball').multiplier(ctx({ throwNumber: 2 })), 1);
  });

  test('Dusk Ball de 20:00 a 06:00', () => {
    const dusk = ball('duskball');
    assert.strictEqual(dusk.multiplier(ctx({ hour: 20 })), 3);
    assert.strictEqual(dusk.multiplier(ctx({ hour: 5 })), 3);
    assert.strictEqual(dusk.multiplier(ctx({ hour: 6 })), 1);
    assert.strictEqual(dusk.multiplier(ctx({ hour: 19 })), 1);
  });

  test('Premier Ball entre la Poké Ball y la Super Ball, y no se vende', () => {
    const premier = ball('premierball');
    assert.ok(premier.multiplier(ctx()) > ball('pokeball').multiplier(ctx()));
    assert.ok(premier.multiplier(ctx()) < ball('greatball').multiplier(ctx()));
    assert.strictEqual(premier.price, null);
  });

  test('las balls retiradas ya no están en el catálogo', () => {
    for (const id of Object.keys(RETIRED_BALLS)) {
      assert.ok(!BALLS.some((b) => b.id === id), id);
    }
  });

  test('describeMultiplier', () => {
    assert.strictEqual(describeMultiplier(1), '×1');
    assert.strictEqual(describeMultiplier(1.5), '×1.5');
    assert.strictEqual(describeMultiplier(1.25), '×1.25');
    assert.strictEqual(describeMultiplier(Infinity), 'captura segura');
  });
});

suite('encuentros', () => {
  test('catchProbability nunca pasa de 1 y la Master Ball es segura', () => {
    assert.strictEqual(catchProbability(45, ball('pokeball'), ctx()), 45 / 255);
    assert.strictEqual(catchProbability(255, ball('ultraball'), ctx()), 1);
    assert.strictEqual(catchProbability(3, ball('masterball'), ctx()), 1);
  });

  test('failedShakes está entre 0 y 2', () => {
    for (let i = 0; i < 200; i += 1) {
      const shakes = failedShakes(Math.random());
      assert.ok(shakes >= 0 && shakes <= 2);
    }
  });

  test('sin sprite variocolor no puede salir variocolor', () => {
    for (let i = 0; i < 200; i += 1) {
      assert.strictEqual(rollShiny(false), false);
    }
  });

  test('EncounterGate: un encuentro a la vez y cooldown al terminar', () => {
    const gate = new EncounterGate();
    assert.ok(gate.canStart());

    gate.start();
    assert.ok(!gate.canStart());
    assert.ok(!gate.canStart(true));

    gate.end();
    assert.ok(!gate.canStart());
    assert.ok(gate.canStart(true));
  });

  test('los ajustes de equilibrio se limitan a su rango', () => {
    assert.strictEqual(clampEncounterChance(0), MIN_ENCOUNTER_CHANCE);
    assert.strictEqual(clampEncounterChance(5), MAX_ENCOUNTER_CHANCE);
    assert.strictEqual(clampEncounterChance(0.5), 0.5);
    assert.strictEqual(clampEncounterChance(NaN), ENCOUNTER_CHANCE);
    assert.strictEqual(cooldownMsFromSeconds(1), MIN_COOLDOWN_SECONDS * 1000);
    assert.strictEqual(cooldownMsFromSeconds(99999), MAX_COOLDOWN_SECONDS * 1000);
    assert.strictEqual(cooldownMsFromSeconds(120), 120000);
    assert.strictEqual(cooldownMsFromSeconds(NaN), ENCOUNTER_COOLDOWN_MS);
  });

  test('rollEncounter respeta la probabilidad dada', () => {
    for (let i = 0; i < 100; i += 1) {
      assert.strictEqual(rollEncounter(0), false);
      assert.strictEqual(rollEncounter(1), true);
    }
  });

  test('EncounterGate usa el cooldown configurado', () => {
    const gate = new EncounterGate(() => 0);
    gate.start();
    gate.end();
    assert.ok(gate.canStart());
  });

  test('EncounterGate: cancelar no gasta el cooldown', () => {
    const gate = new EncounterGate();
    gate.start();
    gate.cancel();
    assert.ok(gate.canStart());
  });
});
