# Changelog - Lying Piece of S***

All notable changes to this project will be documented in this file.

---

## [1.1.0] - 2026-07-14

### Added
- **Local Hand Rearrangement (QOL)**: Integrated a dual-mode card reordering mechanic. Users can drag and drop cards on desktop, or use clean left/right arrow buttons on each card to reposition them on mobile and touch devices.
- **Control Center & Navigation Header**: Added a sleek, tabbed navigation menu at the top of the screen that contains Match controls (like Reset Match for the host), sound toggles, and the active Rulebook.
- **Rules Documentation**: Created `/RULES.md` to establish a single source of truth for the game rules and variations.
- **Dynamic Transition Countdown**: Added an automatic 4-second progress ring/bar on the suspicion overlay that auto-closes the overlay and resumes the match fluidly without requiring manual clicks.

### Changed
- **Rank Selector Grid**: Removed any dropdown feel and restored a flat, high-density, scrollbar-free grid of tactical button chips. Ranks are sorted and styled with a pulsing red active theme.
- **Refined the 2 Rule**: Validated that a **2** is legal to play on top of any rank at any time.

### Fixed
- **Match Reset Bug**: Resolved a major issue where clicking "Continue Match" on the suspicion resolution overlay accidentally reset the entire game lobby state instead of resuming the current match.
- **Automatic Suspicion Timer**: Reduced the suspicion overlay timeout from 7 seconds to 4 seconds to maintain a snappy, physical-game pacing.
- **Unplayed Card Preservation**: Confirmed that players retain all cards they did not play, only refilling up to 5 cards from the draw pile.

---

## [1.0.0] - Earlier Iterations
- Initial release with real-time WebSockets, room lobbies, and multiplayer capability.
- Added support for AI bots (CPUs) that make strategic plays and call bluffs mathematically.
- Implemented the 7 Rule restricting high plays below 7.
- Added sound manager for cards sliding, slapping, busted states, and shuffling.
