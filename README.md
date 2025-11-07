# elastic-integration-logos
A Figma plugin project providing a structured catalogue of Elastic integration logos for easier design and development.

```markdown
## Build & Run in Figma (step-by-step)

This repository contains the **source** for a Figma plugin.  
The compiled plugin (including `manifest.json`) is generated into the `dist/` folder.

---

### Prerequisites
- [Figma Desktop](https://www.figma.com/downloads/) 
- [Node.js 18+](https://nodejs.org/en/download/)

---

### 1) Install dependencies
Run the following command to install all required packages:

npm install

---

### 2) (Optional) Fetch or refresh the logo catalogue
This generates or updates `logos.ts` by fetching data from Elastic integrations.

# Without token (may hit rate limits)
npm run fetch-logos

# With higher GitHub API limits:
GITHUB_TOKEN=your_token npm run fetch-logos

---

### 3) Build the plugin
This command compiles the TypeScript source files and creates the `dist/manifest.json` required by Figma.

npm run build

---

### 4) Load the plugin in Figma
1. Open **Figma Desktop**
2. Go to **Plugins → Development → Import plugin from manifest...**
3. Select: `dist/manifest.json`

That’s it — the plugin will now appear under **Plugins → Development** inside Figma.

---

### 5) Live development (auto-rebuild)
If you want to keep developing and testing the plugin in real time, run:

npm run dev

Then in Figma, use **Plugins → Development → Reload Plugins** (or restart the plugin) to apply the latest build.


### Notes
- `node_modules/` and `dist/` are intentionally **git-ignored** — anyone cloning this repository can rebuild them with the steps above.  
- If you modify how the logos are discovered, re-run:

npm run fetch-logos

before rebuilding.
```
