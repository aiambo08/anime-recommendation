# Skill: Creative Anime UI/UX
**Description:** Implements the ludic experience and fluid animations of the system.

## Gachapon Workflow
1. **Trigger:** User turns the lever (drag event via Framer Motion).
2. **Animation:** Machine vibration + SVG capsule spawn.
3. **Revelation:** Scale transition using `AnimatePresence`.
4. **Rarity:** Assign 'glow-ssr' CSS class if the anime rating in `anime.csv` is > 8.5.

## Cyberpunk Aesthetics
- Use `backdrop-blur-md` for modals.
- Apply subtle "Glitch" animations to technique titles.