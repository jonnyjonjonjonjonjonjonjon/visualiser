# Tasks to complete

## MCP Fix Applied (2025-12-27)
The Playwright MCP was crashing because it tried to download Chrome in WSL2 with only 3.7GB RAM.
**Fixed by:** Configuring Playwright to use Windows Chrome at `/mnt/c/Program Files/Google/Chrome/Application/chrome.exe`

### Update (2025-12-27 evening)
**Issue:** MCP was launching 5 blank Chrome tabs and not connecting properly.
**Cause:** Profile/user-data-dir conflict with existing Chrome sessions.
**Fix:** Added `--user-data-dir /tmp/playwright-chrome` to isolate the MCP browser instance.

Current config in `.claude.json`:
```json
"playwright": {
  "command": "npx",
  "args": ["-y", "@playwright/mcp@latest",
           "--executable-path", "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
           "--user-data-dir", "/tmp/playwright-chrome"]
}
```

**Status:** Restart Claude Code and test with `browser_navigate` to example.com

---

## 1. Verify CSS slider fixes with Playwright MCP
- Open http://localhost:5173 in browser
- Check that slider controls are clickable and draggable
- Verify thumb size is larger (18px) with box shadow
- Confirm pointer-events work correctly (canvas has pointer-events: none)

## 2. Create laser show shader visualization
- Reference images in `Lasers/` folder (jd3.lasers Instagram screenshots)
- Key effects to recreate:
  - Crossing laser beams converging to a point (pink/blue)
  - Geometric patterns (hexagonal/star shapes made of laser lines)
  - Symmetrical X-patterns with warm copper/cool blue colors
- Add to shaders/index.js as a new visualization
