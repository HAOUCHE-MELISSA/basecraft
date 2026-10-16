# BASECRAFT – Number Base Converter
Open `index.html` in any modern browser (no build, server or network needed).

## Engine
- Input is parsed digit-by-digit into an exact rational `num/den` with `BigInt` (den = base^fraction digits). No `parseInt`/`Number`/floats.
- Integer part: repeated division by the target base; remainders reversed.
- Fraction: repeated multiplication of the exact remainder; stops at 0 (exact) or at the precision limit (marked ≈ truncated).
- Negatives: sign preserved, |value| converted (not two's complement).
- A self-test of known cases runs on load and logs to the console.

Files: `index.html`, `style.css`, `script.js` (engine at top, UI below).
