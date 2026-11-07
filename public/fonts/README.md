# Bundled fonts (roster PDF export)

| File | Source | License |
| --- | --- | --- |
| `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf` | https://github.com/notofonts/notofonts.github.io/tree/main/fonts/NotoSans/hinted/ttf (Noto Project, latin-greek-cyrillic) | SIL Open Font License 1.1 |
| `NotoSansDevanagari-Regular.ttf`, `NotoSansDevanagari-Bold.ttf` | https://github.com/notofonts/notofonts.github.io/tree/main/fonts/NotoSansDevanagari/hinted/ttf (Noto Project, devanagari) | SIL Open Font License 1.1 |

They are loaded lazily by `src/lib/export/roster-pdf.ts` only when a roster PDF is exported, so they never affect page load.
The OFL text is at https://openfontlicense.org. Copyright 2022 The Noto Project Authors.
