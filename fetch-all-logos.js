const fs = require('fs');
const https = require('https');
const path = require('path');

/**
 * This script fetches all Elastic integrations from GitHub and generates a static logos.ts file.
 * Run this periodically (e.g., monthly) to update the logos list with new integrations.
 * 
 * Usage:
 *   npm run fetch-logos
 * 
 * Or with GitHub token for higher rate limits:
 *   GITHUB_TOKEN=your_token npm run fetch-logos
 */

// Fetch all packages from GitHub and find their logos
async function fetchAllLogos() {
  try {
    console.log('Fetching all packages from GitHub using Tree API...');
    
    // Use GitHub Tree API to get the entire packages directory structure in one call
    // This is much more efficient than paginating through contents
    const treeUrl = 'https://api.github.com/repos/elastic/integrations/git/trees/main?recursive=1';
    console.log('Fetching repository tree (this may take a moment)...');
    
    const treeData = await fetchJSON(treeUrl);
    
    if (!treeData || !treeData.tree || !Array.isArray(treeData.tree)) {
      throw new Error('Failed to fetch repository tree');
    }
    
    // Check if tree was truncated (GitHub limits tree size to ~100k entries)
    if (treeData.truncated) {
      console.warn('⚠️  WARNING: Repository tree was truncated. Some packages may be missing.');
      console.warn('   Consider using the paginated Contents API approach instead.');
    }
    
    console.log(`Fetched ${treeData.tree.length} files from repository`);
    
    // Extract all package directories and their logo files
    // Also extract policy_templates (child cards) for packages like AWS, Azure, connectors
    // Also extract service_type logos (e.g., elastic_connectors/img/service_type/*.svg)
    const packageMap = new Map(); // packageName -> { allImageFiles: [] }
    const policyTemplateMap = new Map(); // policyTemplateSlug -> { allImageFiles: [], parentPackage: packageName }
    const serviceTypeMap = new Map(); // serviceTypeSlug -> { logo: url, parentPackage: packageName }
    
    for (const item of treeData.tree) {
      const pathMatch = item.path.match(/^packages\/([^\/]+)\/(.+)$/);
      if (!pathMatch) continue;
      
      const packageName = pathMatch[1];
      const filePath = pathMatch[2];
      
      // Only process files (not directories)
      if (item.type !== 'blob') continue;
      
      // Check if it's an image file
      if (!/\.(svg|png|jpg|jpeg|gif|webp)$/i.test(filePath)) continue;
      
      // Check if this is a service type logo (e.g., img/service_type/amazon_s3.svg)
      // These should be separate entries, one per service type
      const serviceTypeMatch = filePath.match(/^img\/service_type\/([^\/]+)\.(svg|png|jpg|jpeg|gif|webp)$/i);
      if (serviceTypeMatch) {
        const serviceTypeName = serviceTypeMatch[1];
        const serviceTypeSlug = serviceTypeName; // Use filename (without extension) as slug
        const fileExtension = serviceTypeMatch[2];
        
        // Build the logo URL
        const logoUrl = buildLogoUrl(packageName, 'img/service_type', `${serviceTypeName}.${fileExtension}`, false);
        
        serviceTypeMap.set(`${packageName}_${serviceTypeSlug}`, {
          slug: serviceTypeSlug,
          logo: logoUrl,
          parentPackage: packageName
        });
        continue; // Skip adding to packageMap
      }
      
      // Check if this is a policy template (child card)
      const policyTemplateMatch = filePath.match(/^policy_templates\/([^\/]+)\/(.+)$/);
      
      if (policyTemplateMatch) {
        // This is a policy template (child card)
        const policyTemplateName = policyTemplateMatch[1];
        const policyTemplatePath = policyTemplateMatch[2];
        const policyTemplateSlug = policyTemplateName; // Use the policy template name as slug
        
        if (!policyTemplateMap.has(policyTemplateSlug)) {
          policyTemplateMap.set(policyTemplateSlug, { 
            allImageFiles: [],
            parentPackage: packageName
          });
        }
        
        const policyTemplate = policyTemplateMap.get(policyTemplateSlug);
        const fileName = policyTemplatePath.split('/').pop();
        const directory = policyTemplatePath.includes('/') 
          ? policyTemplatePath.substring(0, policyTemplatePath.lastIndexOf('/'))
          : '';
        
        policyTemplate.allImageFiles.push({
          name: fileName,
          path: `policy_templates/${policyTemplateName}/${policyTemplatePath}`,
          directory: directory
        });
      } else {
        // This is a regular package file
        if (!packageMap.has(packageName)) {
          packageMap.set(packageName, { allImageFiles: [] });
        }
        
        const pkg = packageMap.get(packageName);
        const fileName = filePath.split('/').pop();
        const directory = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
        
        pkg.allImageFiles.push({ 
          name: fileName, 
          path: filePath,
          directory: directory
        });
      }
    }
    
    const allPackages = Array.from(packageMap.keys());
    const allPolicyTemplates = Array.from(policyTemplateMap.keys());
    const allServiceTypes = Array.from(serviceTypeMap.values());
    console.log(`\nFound ${allPackages.length} packages, ${allPolicyTemplates.length} policy templates, and ${allServiceTypes.length} service type logos`);
    console.log('Finding logos for each package, policy template, and service type...\n');
    
    // Find logos for each package using the tree data
    const logos = [];
    let foundCount = 0;
    
    // Process regular packages
    for (let i = 0; i < allPackages.length; i++) {
      const packageName = allPackages[i];
      const pkg = packageMap.get(packageName);
      
      if ((i + 1) % 50 === 0 || i === allPackages.length - 1) {
        console.log(`Processing packages ${i + 1}/${allPackages.length}... (found ${foundCount} logos so far)`);
      }
      
      const logo = findLogoFromTreeData(packageName, pkg);
      if (logo) {
        logos.push(logo);
        foundCount++;
      }
    }
    
    // Process policy templates (child cards)
    for (let i = 0; i < allPolicyTemplates.length; i++) {
      const policyTemplateSlug = allPolicyTemplates[i];
      const policyTemplate = policyTemplateMap.get(policyTemplateSlug);
      const parentPackage = policyTemplate.parentPackage;
      
      if ((i + 1) % 50 === 0 || i === allPolicyTemplates.length - 1) {
        console.log(`Processing policy templates ${i + 1}/${allPolicyTemplates.length}... (found ${foundCount} logos so far)`);
      }
      
      const logo = findLogoFromTreeData(policyTemplateSlug, policyTemplate, parentPackage);
      if (logo) {
        logos.push(logo);
        foundCount++;
      }
    }
    
    // Process service type logos (e.g., elastic_connectors service types)
    for (let i = 0; i < allServiceTypes.length; i++) {
      const serviceType = allServiceTypes[i];
      logos.push({
        slug: serviceType.slug,
        logo: serviceType.logo
      });
      foundCount++;
    }
    
    // Sort by slug
    logos.sort((a, b) => a.slug.localeCompare(b.slug));
    
    console.log(`\nFound ${logos.length} logos:`);
    console.log(`  - ${allPackages.length} package logos`);
    console.log(`  - ${allPolicyTemplates.length} policy template logos (child cards)`);
    console.log(`  - ${allServiceTypes.length} service type logos`);
    
    // Generate the logos.ts file
    const fileContent = `// This file is auto-generated by fetch-all-logos.js
// Run 'npm run fetch-logos' periodically to update this list with new integrations
// Last updated: ${new Date().toISOString()}

export const logos = [\n${logos.map(logo => 
      `    {\n        "slug": "${logo.slug}",\n        "logo": "${logo.logo}"\n    }`
    ).join(',\n')}\n  ];\n  \n  export default logos;\n`;
    
    const logosPath = path.join(__dirname, 'logos.ts');
    fs.writeFileSync(logosPath, fileContent);
    console.log(`\n✅ Successfully generated logos.ts with ${logos.length} logos!`);
    console.log(`   File saved to: ${logosPath}`);
    console.log(`\n   Next steps:`);
    console.log(`   1. Review the generated logos.ts file`);
    console.log(`   2. Run 'npm run build' to rebuild the plugin`);
    console.log(`   3. Reload the plugin in Figma to see the updated integrations`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Helper function to build properly encoded GitHub raw URL
function buildLogoUrl(packageName, directory, fileName, isPolicyTemplate = false) {
  const baseUrl = 'https://raw.githubusercontent.com/elastic/integrations/main/packages';
  const encodedPackage = encodeURIComponent(packageName);
  const encodedFile = encodeURIComponent(fileName);
  
  if (isPolicyTemplate) {
    // For policy templates, the directory already includes "policy_templates/..."
    // We need to encode each path segment separately, not the whole path
    if (directory) {
      const pathSegments = directory.split('/');
      const encodedSegments = pathSegments.map(seg => encodeURIComponent(seg));
      const encodedPath = encodedSegments.join('/');
      return `${baseUrl}/${encodedPackage}/${encodedPath}/${encodedFile}`;
    } else {
      return `${baseUrl}/${encodedPackage}/${encodedFile}`;
    }
  } else if (directory) {
    // For regular directories (including service_type), encode each segment separately
    // This ensures slashes remain as slashes in the URL
    const pathSegments = directory.split('/');
    const encodedSegments = pathSegments.map(seg => encodeURIComponent(seg));
    const encodedPath = encodedSegments.join('/');
    return `${baseUrl}/${encodedPackage}/${encodedPath}/${encodedFile}`;
  } else {
    return `${baseUrl}/${encodedPackage}/${encodedFile}`;
  }
}

function findLogoFromTreeData(slug, pkg, parentPackage = null) {
  if (!pkg.allImageFiles || pkg.allImageFiles.length === 0) {
    return null;
  }
  
  const isPolicyTemplate = parentPackage !== null;
  
  // Prioritize directories: img > assets > images > logo > root
  const preferredDirs = ['img', 'assets', 'images', 'logo', 'logos'];
  
  // Group files by directory
  const filesByDir = new Map();
  for (const file of pkg.allImageFiles) {
    const dir = file.directory || 'root';
    if (!filesByDir.has(dir)) {
      filesByDir.set(dir, []);
    }
    filesByDir.get(dir).push(file);
  }
  
  // Look for common logo file patterns (prioritized)
  const logoPatterns = [
    /^.*logo.*\.svg$/i,           // Any SVG with "logo" in name
    /^.*-logo.*\.svg$/i,          // SVG with "-logo-" in name
    /^logo.*\.svg$/i,             // SVG starting with "logo"
    /^icon.*\.svg$/i,             // SVG starting with "icon"
    /^.*\.svg$/i,                 // Any SVG file
    /^.*logo.*\.(png|jpg|jpeg)$/i, // Any PNG/JPG with "logo"
    /^icon.*\.(png|jpg|jpeg)$/i,  // PNG/JPG starting with "icon"
    /^.*\.(png|jpg|jpeg)$/i,      // Any PNG/JPG
  ];
  
  // Search in preferred directory order
  for (const preferredDir of preferredDirs) {
    const files = filesByDir.get(preferredDir);
    if (!files || files.length === 0) continue;
    
    for (const pattern of logoPatterns) {
      const logoFile = files.find(file => pattern.test(file.name));
      if (logoFile) {
        const packageName = isPolicyTemplate ? parentPackage : slug;
        return {
          slug: slug,
          logo: buildLogoUrl(packageName, logoFile.directory, logoFile.name, isPolicyTemplate)
        };
      }
    }
  }
  
  // If nothing found in preferred dirs, search root files
  const rootFiles = filesByDir.get('root');
  if (rootFiles && rootFiles.length > 0) {
    for (const pattern of logoPatterns) {
      const logoFile = rootFiles.find(file => pattern.test(file.name));
      if (logoFile) {
        const packageName = isPolicyTemplate ? parentPackage : slug;
        return {
          slug: slug,
          logo: buildLogoUrl(packageName, logoFile.directory || null, logoFile.name, isPolicyTemplate)
        };
      }
    }
  }
  
  // Last resort: search all directories (any image file)
  for (const [dir, files] of filesByDir.entries()) {
    // Skip if we already checked this directory
    if (preferredDirs.includes(dir) || dir === 'root') continue;
    
    // Prefer SVG files
    const svgFile = files.find(file => /\.svg$/i.test(file.name));
    if (svgFile) {
      const packageName = isPolicyTemplate ? parentPackage : slug;
      return {
        slug: slug,
        logo: buildLogoUrl(packageName, svgFile.directory, svgFile.name, isPolicyTemplate)
      };
    }
  }
  
  // Final fallback: any image file from any directory
  const anyFile = pkg.allImageFiles[0];
  if (anyFile) {
    const packageName = isPolicyTemplate ? parentPackage : slug;
    return {
      slug: slug,
      logo: buildLogoUrl(packageName, anyFile.directory, anyFile.name, isPolicyTemplate)
    };
  }
  
  return null;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'Elastic-Integration-Logos-Fetcher',
      'Accept': 'application/vnd.github.v3+json'
    };
    
    // Add GitHub token if provided as environment variable
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }
    
    https.get(url, { headers }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error('Failed to parse JSON'));
          }
        } else if (res.statusCode === 404) {
          reject(new Error('Not found'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

fetchAllLogos();

