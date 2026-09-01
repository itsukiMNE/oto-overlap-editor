# UTAU OTO Overlap Editor

A small browser-based tool for batch-adjusting the **Overlap** value in UTAU `oto.ini` files.

**by itsukiMNE**

Current version: **v0.12**

## Features

- Runs entirely in the browser.
- Reads `oto.ini` and changes **Overlap only**.
- Keeps Offset, Consonant, Cutoff, and Preutterance unchanged.
- Automatically classifies aliases and calculates Overlap according to preset rules.
- Rounds calculated values to **1 decimal place**.
- Shows a preview before copying the result.
- Supports copying the full edited result instead of exporting a new `oto.ini`.
- Supports Japanese ANSI / CP932 / Shift_JIS input and a mojibake-copy option for use in Chinese ANSI environments.
- Ignores trailing pitch labels such as `C4`, `D#4`, and `Eb3` when classifying aliases.

## Overlap Rules

| Alias type | Overlap |
| --- | --- |
| K / T / P rows and related contracted/extended sounds | `-5` |
| W / Y rows | `Preutterance / 2 - 1` |
| Vowels, `を`, and `ん` | `Preutterance × 2` |
| Ending forms such as `a R`, `i Rh`, `u E`, `a -` | `Preutterance / 2 - 1` |
| Other aliases | `Preutterance / 3` |

Additional priority rules:

- `- X` is always treated as **Other**, regardless of `X`.
- `a / i / u / e / o / n + kana` is always treated as **Other**.
- `- / a / i / u / e / o / n + E + kana`, such as `a Eん`, is always treated as **Other**.
- If an alias begins with `ん`, it is treated as `ん` even when letters or other suffixes follow it.
- Vowel aliases with numeric suffixes, such as `あ2`, `い03`, and `を1`, are still treated as vowels.

## Usage

1. Open the HTML file in a modern browser.
2. Select an `oto.ini` file.
3. Generate the preview.
4. Check the calculated Overlap values.
5. Copy the full result.
6. Paste it back into your original `oto.ini` and save it with the encoding you normally use.

For Japanese ANSI / CP932 files used in a Chinese ANSI environment, use the mojibake-copy option when needed.

## Notes

This tool is intended for `oto.ini` files following standard UTAU formatting. The original alias text itself is not rewritten; normalization such as pitch-label removal is used only for classification.
