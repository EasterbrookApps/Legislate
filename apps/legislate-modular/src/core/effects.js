// Supported effect handlers.
// Signature: (state, player, params) => { state, events: [] }
export function registerDefaultEffects(registry) {
  registry.set('move', (ctx, player, n) => {
    const delta = Number(n || 0);
    let idx = player.position + delta;
    if (idx < 0) idx = 0;
    if (idx > ctx.endIndex) idx = ctx.endIndex;
    player.position = idx;
    return { events: [{ type: 'MOVE_APPLIED', data: { playerId: player.id, to: idx } }] };
  });

  registry.set('miss_turn', (ctx, player) => {
    player.skip = (player.skip || 0) + 1;
    return { events: [{ type: 'MISS_TURN', data: { playerId: player.id } }] };
  });

  registry.set('extra_roll', (ctx, player) => {
    player.extraRoll = true;
    return { events: [{ type: 'EXTRA_ROLL', data: { playerId: player.id } }] };
  });

  // "pingpong" in current deck: go straight to end (Royal Assent)
  registry.set('pingpong', (ctx, player) => {
    player.position = ctx.endIndex;
    return { events: [{ type: 'GOTO_END', data: { playerId: player.id } }] };
  });

  // Special-cased blank effects by card id:
  registry.set('__special__', (ctx, player, card) => {
    const id = card?.id || '';
    if (id in { 'Early04':1, 'Early09':1 }) {
      player.position = 0; // back to start
      return { events: [{ type: 'GOTO_START', data: { playerId: player.id } }] };
    }
    if (id === 'Implementation01') {
      player.position = ctx.endIndex;
      return { events: [{ type: 'GOTO_END', data: { playerId: player.id } }] };
    }
    return { events: [] };
  });
}
