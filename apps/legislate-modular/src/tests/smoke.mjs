import { createEngine } from '../core/engine.js';
import { mulberry32 } from '../core/rng.js';

// Minimal board and decks for headless test
const board = {
  packId: 'test',
  spaces: Array.from({length: 10}, (_,i)=>({ index: i, x: i*5, y: i*5, stage: i===0?'start':(i===9?'end':'early'), deck: 'none' }))
};
const decks = { commons: [], early: [], implementation: [], lords: [], pingpong: [] };

const rng = mulberry32(123);
const engine = createEngine({ board, decks, rng });

let safety = 20;
while (safety-- > 0) {
  const roll = 1 + Math.floor((rng()) * 6);
  engine.takeTurn(roll);
  if (engine.state.players.some(p => p.position === 9)) {
    console.log('WIN_OK');
    process.exit(0);
  }
}
console.error('TEST_FAIL');
process.exit(1);
