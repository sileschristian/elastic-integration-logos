const fs = require('fs');
const { execSync } = require('child_process');

// Read the built UI JavaScript file
const uiJsContent = fs.readFileSync('dist/ui.js', 'utf8');

// Read the HTML file
let htmlContent = fs.readFileSync('ui.html', 'utf8');

// Use a unique placeholder to avoid escaping issues
const PLACEHOLDER = '___UI_JS_PLACEHOLDER___';

// Replace script tag with placeholder first
const scriptTagRegex = /<script[^>]*src=["'][^"']*ui\.js["'][^>]*><\/script>/i;
if (!scriptTagRegex.test(htmlContent)) {
  console.error('ERROR: Script tag with ui.js not found in HTML');
  process.exit(1);
}
htmlContent = htmlContent.replace(scriptTagRegex, '<script>' + PLACEHOLDER + '</script>');

// Read the TypeScript code
let codeContent = fs.readFileSync('code.ts', 'utf8');

// Replace __html__ with the HTML content
// Escape for template literal
let escapedHtml = htmlContent
  .replace(/\\/g, '\\\\')  // Escape backslashes
  .replace(/`/g, '\\`')    // Escape backticks
  .replace(/\${/g, '\\${'); // Escape template expressions

// Now replace the placeholder with the actual JavaScript
// Escape </script> tags in the JavaScript
let escapedJs = uiJsContent.replace(/<\/script>/gi, '<\\/script>');
// Escape the JavaScript for the template literal context
escapedJs = escapedJs
  .replace(/\\/g, '\\\\')  // Escape backslashes
  .replace(/`/g, '\\`')    // Escape backticks
  .replace(/\${/g, '\\${'); // Escape template expressions

// Replace placeholder with escaped JavaScript
escapedHtml = escapedHtml.replace(PLACEHOLDER, escapedJs);

if (!codeContent.includes('__html__')) {
  console.error('ERROR: __html__ not found in code.ts');
  process.exit(1);
}

codeContent = codeContent.replace('__html__', '`' + escapedHtml + '`');
console.log('HTML content with inlined JavaScript injected successfully');

// Write to a temporary file
fs.writeFileSync('code.temp.ts', codeContent);

// Build with esbuild
try {
  execSync('npx esbuild code.temp.ts --bundle --outfile=dist/code.js --loader:.ts=ts --minify', { stdio: 'inherit' });
  // Clean up
  fs.unlinkSync('code.temp.ts');
} catch (error) {
  // Clean up on error
  if (fs.existsSync('code.temp.ts')) {
    fs.unlinkSync('code.temp.ts');
  }
  process.exit(1);
}

