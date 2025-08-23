# Changelog

## Initial Release

### Added
- Modular architecture with ES modules and Vite build (evergreen browsers).
- Content pack system with default **UK Parliament** pack.
- Deterministic RNG (seeded) and dice roll flow.
- Event-driven engine (turns, moves, card draws, game end).
- Autosave to `localStorage` with resume prompt; export/import hooks ready.
- Endgame winners dialog with one-click Restart; persistent header Restart with confirmation.
- Automatic token sizing and overlap handling (no zoom required).
- Accessibility improvements: focus-trapped modals, `aria-live` for turns, semantic landmarks.
- Error overlay for content load/validation issues.
- Polished README and this changelog.

### Future-proofing
- Effects registry pattern; easy to add new effect types without core rewrites.
- Pack-aware loader; supports future legislatures without touching engine code.
- Restart pipeline is idempotent; content contracts versioned (`board.json@v1`).

