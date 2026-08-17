# Crossword

The shared crossword player lives at `play/index.html`. Puzzle files contain
only the title, answer grid, and clue text, so fixes to the interface and puzzle
logic apply to every week.

## Current weekly crossword

WordPress can permanently embed:

`https://theimsaacronym.github.io/crossword/current`

The page at `current/index.html` uses the visitor's local calendar date to
calculate the number of weeks since Monday, August 17, 2026. It checks for
`puzzles/weekN.json` and redirects to
`play/?puzzle=weekN` when that file exists. If it has not been published, the
page shows a friendly availability message instead of a broken crossword.

Legacy root-level weekly HTML files remain in place for old external links.

Weeks 1-36 have been migrated to JSON. Because the old pages for Weeks 2-36
all repeat the same placeholder heading, their initial titles are simply
`Week 2`, `Week 3`, and so on. Replace a puzzle's `title` value when its final
date or theme title is known. Week 2 was migrated from the otherwise uniquely
named legacy file `week1.2.html` because no `week2.html` exists.

## Publishing a puzzle

Add one file named `puzzles/weekN.json`. No edit to the player, `/current`, or
WordPress is needed.

```json
{
  "title": "August 17: Welcome Back-To-School!",
  "grid": [
    ".IDOL",
    "....E",
    "RELAX",
    "E....",
    "SINE."
  ],
  "clues": {
    "across": [
      "A golden calf, for example",
      "What we will have no time to do now that school has started",
      "Tangent times Cosine"
    ],
    "down": [
      "The abbreviation for part of campus that receives a surge of people at 11:00 AM",
      "1501-1507 are all referred to as ___ halls"
    ]
  }
}
```

Grid rows must be non-empty strings of equal length. Use `.` for a black square
and letters for answer cells. Letters are normalized to uppercase.

Clue arrays must follow the entries' grid order: scan starting squares from top
to bottom and left to right, separately for Across and Down. An entry contains
at least two cells. The player derives coordinates and conventional crossword
numbers, so puzzle files never contain either. Across and Down entries beginning
on the same cell automatically share a number. A puzzle is rejected with a
visible error if its grid or clue counts are invalid.

To preview Week 1 from the repository root, serve the directory over HTTP and
open:

`http://localhost:PORT/play/?puzzle=week1`
