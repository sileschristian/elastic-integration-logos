import { createRoot } from "react-dom/client";
import { useState, useMemo, useEffect } from "react";
import logos from "./logos";

interface Logo {
  slug: string;
  logo: string;
}

function App() {
  const [query, setQuery] = useState("");
  const [logosList, setLogosList] = useState<Logo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDuplicates, setShowDuplicates] = useState(true);

  // Load logos from static file
  useEffect(() => {
    try {
      setLogosList(logos);
      console.log(`Loaded ${logos.length} integrations from static file`);
    } catch (err) {
      console.error("Error loading logos:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Filter by query and optionally remove duplicates
  const filtered = useMemo(() => {
    // First, remove duplicate slugs (same integration name appearing multiple times)
    // Keep only the first occurrence of each slug
    const seenSlugs = new Set<string>();
    const uniqueBySlug = logosList.filter((logo) => {
      if (seenSlugs.has(logo.slug)) {
        return false; // Duplicate slug, skip it
      }
      seenSlugs.add(logo.slug);
      return true; // First occurrence, keep it
    });
    
    // Then filter by search query
    let result = uniqueBySlug.filter((l) => l.slug.toLowerCase().includes(query.toLowerCase()));
    
    // If hide duplicates is enabled, group by logo identifier (normalized filename or brand name)
    // This uses a hybrid approach: tries to match by normalized filename first,
    // but falls back to brand name for cases where filenames differ but logos are the same
    if (!showDuplicates) {
      const normalizeFilename = (filename: string): string => {
        // Remove file extension and normalize
        let normalized = filename.toLowerCase();
        normalized = normalized.replace(/\.(svg|png|jpg|jpeg|gif|webp)$/i, '');
        // Remove common prefixes
        normalized = normalized.replace(/^(logo[-_]?|icon[-_]?|img[-_]?)/, '');
        // Remove common suffixes
        normalized = normalized.replace(/[-_](logo|icon|img)$/, '');
        normalized = normalized.replace(/[-_]logo$/, '');
        // Remove version suffixes
        normalized = normalized.replace(/[-_]v\d*$/, '');
        return normalized;
      };
      
      const getBaseBrand = (slug: string): string => {
        // Extract base brand name from slug (first part before underscore or hyphen)
        const parts = slug.toLowerCase().split(/[_-]/);
        return parts[0];
      };
      
      // Use a Map to track logo identifiers and the first logo URL we saw for that identifier
      // This allows us to use both filename and brand matching
      const logoIdentifierMap = new Map<string, string>();
      
      result = result.filter((logo) => {
        const filename = logo.logo.split('/').pop() || '';
        const normalizedFilename = normalizeFilename(filename);
        const baseBrand = getBaseBrand(logo.slug);
        
        // Determine the logo identifier to use for grouping
        let logoIdentifier: string;
        
        if (normalizedFilename === 'logo' || normalizedFilename === 'icon' || normalizedFilename.length < 3) {
          // Generic filename - use brand name for grouping (e.g., all "logo.svg" from same brand)
          logoIdentifier = `brand:${baseBrand}`;
        } else if (normalizedFilename.includes(baseBrand) || baseBrand.includes(normalizedFilename)) {
          // Filename contains brand name - use brand for grouping (handles variants like mongodb, mongodb_atlas)
          logoIdentifier = `brand:${baseBrand}`;
        } else {
          // Specific filename - use normalized filename for grouping
          logoIdentifier = `file:${normalizedFilename}`;
        }
        
        if (logoIdentifierMap.has(logoIdentifier)) {
          return false; // This logo identifier was already seen, skip it
        }
        logoIdentifierMap.set(logoIdentifier, logo.logo);
        return true; // First occurrence of this logo identifier, keep it
      });
    }
    
    return result;
  }, [logosList, query, showDuplicates]);

  async function insertLogo(url: string) {
    const svg = await fetch(url).then((r) => r.text());
    parent.postMessage({ pluginMessage: { type: "insert-svg", svg } }, "*");
  }

  function handleDragStart(e: React.DragEvent, url: string) {
    // Set drag data for Figma drop
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.dropEffect = "copy";
    
    // Fetch the SVG and prepare it for drop
    fetch(url)
      .then(r => r.text())
      .then(svg => {
        // Notify the plugin code to prepare for drop
        parent.postMessage({ pluginMessage: { type: "prepare-drop", svg } }, "*");
      })
      .catch(err => {
        console.error("Error preparing drag:", err);
      });
    
    // Create a custom drag image
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, 48, 48);
          e.dataTransfer.setDragImage(canvas, 24, 24);
        }
      } catch (err) {
        // If canvas fails, continue without custom drag image
        console.warn("Could not create drag image:", err);
      }
    };
    img.onerror = () => {
      // Continue without custom drag image if image fails to load
    };
  }

  function handleDragEnd(e: React.DragEvent) {
    // Drag ended - nothing special needed
  }

  return (
    <div style={{ padding: "16px 16px 0 16px", fontFamily: "Inter, sans-serif", width: "100%", height: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {loading && (
        <div style={{ padding: 20, textAlign: "center", color: "#666" }}>
          Loading integrations...
        </div>
      )}
      <div style={{ position: "relative", marginBottom: 8, width: "100%", boxSizing: "border-box", minWidth: 0, display: loading ? "none" : "block" }}>
        <input
          placeholder="Search integrations..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%",
            padding: 8,
            paddingRight: query ? 32 : 8,
            borderRadius: 6,
            border: "1px solid #ddd",
            boxSizing: "border-box"
          }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              color: "#999",
              lineHeight: 1
            }}
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>
      {!loading && (
        <div style={{ marginBottom: 12, fontSize: 12, color: "#666", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>
            {query ? (
              <>Showing {filtered.length} of {logosList.length} integrations</>
            ) : (
              <>{filtered.length} integrations</>
            )}
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
            <span style={{ fontSize: 11 }}>Show duplicates</span>
            <div
              onClick={() => setShowDuplicates(!showDuplicates)}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                backgroundColor: showDuplicates ? "#18A0FB" : "#ccc",
                position: "relative",
                cursor: "pointer",
                transition: "background-color 0.2s"
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  backgroundColor: "white",
                  position: "absolute",
                  top: 2,
                  left: showDuplicates ? 18 : 2,
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
                }}
              />
            </div>
          </label>
        </div>
      )}
      <div style={{ 
        display: loading ? "none" : "grid", 
        gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", 
        gap: "8px",
        rowGap: "8px",
        columnGap: "8px",
        overflowY: "auto",
        overflowX: "hidden",
        flex: 1,
        width: "100%",
        minWidth: 0,
        maxWidth: "100%",
        alignContent: "start",
        boxSizing: "border-box",
        paddingBottom: 16
      }}>
        {filtered.map((l) => (
          <div
            key={l.slug}
            onClick={() => insertLogo(l.logo)}
            onDragStart={(e) => handleDragStart(e, l.logo)}
            onDragEnd={handleDragEnd}
            draggable={true}
            style={{
              cursor: "grab",
              border: "1px solid #eee",
              borderRadius: 6,
              textAlign: "center",
              padding: 8,
              fontSize: 10,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: 100,
              boxSizing: "border-box",
              userSelect: "none"
            }}
            title={`${l.slug} - Click to insert or drag to canvas`}
          >
            <img
              src={l.logo}
              height={48}
              style={{ display: "block", margin: "0 auto 6px", maxWidth: "100%" }}
            />
            <span style={{ wordBreak: "break-word", lineHeight: 1.2 }}>{l.slug}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Initialize immediately
(function() {
  console.log("=== UI Script Starting ===");
  console.log("Document ready state:", document.readyState);
  console.log("Root element exists:", !!document.getElementById("root"));
  
  function init() {
    console.log("=== Initializing React ===");
    const rootElement = document.getElementById("root");
    if (!rootElement) {
      console.error("ERROR: Root element not found!");
      document.body.innerHTML = '<div style="padding: 20px; color: red;">ERROR: Root element not found</div>';
      return;
    }
    console.log("Root element found, creating React root...");
    try {
      const root = createRoot(rootElement);
      console.log("React root created, rendering App...");
      root.render(<App />);
      console.log("=== React App Rendered Successfully ===");
    } catch (error) {
      console.error("ERROR rendering React app:", error);
      document.body.innerHTML = `<div style="padding: 20px; color: red;">ERROR: ${error.message}<br>${error.stack}</div>`;
    }
  }
  
  if (document.readyState === 'loading') {
    console.log("Document still loading, waiting for DOMContentLoaded...");
    document.addEventListener('DOMContentLoaded', function() {
      console.log("DOMContentLoaded fired");
      init();
    });
  } else {
    console.log("Document already ready, initializing immediately...");
    // Use setTimeout to ensure DOM is fully ready
    setTimeout(init, 0);
  }
})();
