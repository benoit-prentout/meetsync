# GitHub Star & Credit Links

## Purpose

Add a GitHub "Star on GitHub" link across all extension pages, plus an "open source / MIT / built by" credit line with a LinkedIn link on the Dashboard sidebar only.

## Placement

| Page | Location | Content |
|---|---|---|
| Popup (`Popup.tsx`) | Footer (bottom, below Sign out) | `[GitHub icon] Star` — compact inline link |
| Dashboard sidebar (`Dashboard.tsx`) | Bottom of nav, below Settings | `[GitHub icon] Star on GitHub` link + credit line: "Built by Benoît Prentout · Open source · MIT" with LinkedIn link |
| SetupWizard (`SetupWizard.tsx`) | Below the card, centered | `[GitHub icon] Star on GitHub` — small centered |

## Implementation

- Use Lucide `Github` icon (already in the project)
- All links open via `chrome.tabs.create()` to avoid `chrome-extension://` restrictions
- GitHub URL: `https://github.com/benoit-prentout/meetsync`
- LinkedIn URL: `https://www.linkedin.com/in/prentout-benoit/`
- Style follows existing UI patterns (text-xs, text-slate-400 hover states, etc.)
