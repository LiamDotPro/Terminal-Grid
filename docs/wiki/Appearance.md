# Appearance

Two settings change how Terminal Grid looks: **Theme** and **Compact layout**.
Both are in **Settings** (`<mod>+,`) and apply as soon as you press Save.

## Themes

| Theme | What it does |
|---|---|
| **System** (default) | Follows your operating system's light or dark setting, and switches live when the OS does. |
| **Light** | Frosted white panes on a pale background, with deeper accent colours so text and badges keep their contrast. |
| **Dark** | The original look: frosted dark glass over a violet and teal glow. |
| **Black** | Total darkness: pure black background, no coloured glow, no shadows and near opaque panes. Good for OLED screens and dark rooms. |

The terminals follow the theme too. Light uses a darker ANSI palette so program
output stays readable on white; Dark and Black share the bright palette.

### Dark

![Four agents running in the Dark theme](screenshots/theme-dark.png)

### Light

![Four agents running in the Light theme](screenshots/theme-light.png)

### Black

![Four agents running in the Black theme](screenshots/theme-black.png)

### Notes

The Notes tab follows the theme as well: the editor, the list and the
rendered preview.

![The Notes tab in the Light theme](screenshots/notes-light.png)

![The Notes tab in the Black theme](screenshots/notes-black.png)

## Compact layout

Compact layout fits more terminal into the window:

- panes are square, with no rounded corners
- no pane borders or drop shadows
- 2px between panes and between the panes and the window edge
- slimmer pane headers

The focused pane and a pane whose agent just finished still stand out: they get
a 1px outline drawn inside the pane, so it takes no extra space. The Notes tab
uses the same spacing and square panels.

Compact layout works with every theme.

### Compact, Dark

![Compact layout in the Dark theme](screenshots/compact-dark.png)

### Compact, Light

![Compact layout in the Light theme](screenshots/compact-light.png)

## Where the settings are stored

Both live in `config.json` in the app's config folder, as `theme` (`"system"`,
`"light"`, `"dark"` or `"black"`) and `compactLayout` (`true` or `false`).
Config files from before these settings existed keep all their other values
and start on System with the regular layout.
