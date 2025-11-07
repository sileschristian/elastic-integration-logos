const fs = require('fs');
const https = require('https');
const path = require('path');

// Generate manifest.json with Elastic logo icon
function buildManifest() {
  const manifest = {
    name: "Elastic Integration Logos",
    id: "elastic-integration-logos",
    api: "1.0.0",
    main: "code.js",
    ui: "ui.html",
    editorType: ["figma"]
  };

  // Note: Figma plugin manifest doesn't support the "icon" property
  // Icons are handled differently in Figma - they're set when publishing to the community
  
  const manifestPath = path.join(__dirname, 'dist', 'manifest.json');
  
  // Ensure dist directory exists
  if (!fs.existsSync(path.join(__dirname, 'dist'))) {
    fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
  }
  
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('✅ Manifest generated successfully');
  console.log('   Note: To add an icon, place icon.png (128x128 or 512x512) in the dist folder');
}

buildManifest();

