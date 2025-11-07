figma.showUI(__html__, { width: 600, height: 800 });

// Store SVG data for drag and drop
let pendingDropSvg: string | null = null;

// Handle drop events from the UI to canvas
figma.on("drop", (event) => {
  if (pendingDropSvg) {
    const svgNode = figma.createNodeFromSvg(pendingDropSvg);
    
    // Check if dropped on a frame
    if (event.node && event.node.type === "FRAME") {
      event.node.appendChild(svgNode);
      // Center the logo in the frame
      svgNode.x = (event.node.width - svgNode.width) / 2;
      svgNode.y = (event.node.height - svgNode.height) / 2;
    } else {
      // Drop on canvas - position at drop location
      svgNode.x = event.absoluteX - svgNode.width / 2;
      svgNode.y = event.absoluteY - svgNode.height / 2;
      figma.currentPage.appendChild(svgNode);
    }
    
    figma.viewport.scrollAndZoomIntoView([svgNode]);
    pendingDropSvg = null;
    return true;
  }
  
  return false;
});

figma.ui.onmessage = async (msg) => {
  if (msg.type === "insert-svg") {
    const selection = figma.currentPage.selection;
    console.log("Selection:", selection.length, selection.map(n => n.type));
    
    // Check if a single node is selected
    if (selection.length === 1) {
      const selectedNode = selection[0];
      console.log("Selected node type:", selectedNode.type);
      
      // Check if it's a frame, component, or instance
      if (selectedNode.type === "FRAME" || 
          selectedNode.type === "COMPONENT" || 
          selectedNode.type === "INSTANCE") {
        
        console.log("Frame/Component/Instance detected...");
        
        // For components and instances, try to replace image fills first
        if (selectedNode.type === "COMPONENT" || selectedNode.type === "INSTANCE") {
          // Check if it has image fills that can be replaced
          if (selectedNode.fills && Array.isArray(selectedNode.fills) && selectedNode.fills.length > 0) {
            const hasImageFill = selectedNode.fills.some(fill => fill.type === "IMAGE");
            
            if (hasImageFill) {
              console.log("Component/Instance has image fill, replacing it...");
              try {
                // Store original position to prevent movement
                const originalX = selectedNode.x;
                const originalY = selectedNode.y;
                
                // For fills, we need to convert SVG to a raster image
                const tempSvgNode = figma.createNodeFromSvg(msg.svg);
                figma.currentPage.appendChild(tempSvgNode);
                // Export at high resolution to avoid pixelation (4096px max dimension)
                const imageBytes = await tempSvgNode.exportAsync({ 
                  format: "PNG",
                  constraint: { type: "SCALE", value: 4 } // 4x scale for high resolution
                });
                tempSvgNode.remove();
                
                const imageHash = figma.createImage(imageBytes).hash;
                
                // Replace image fills
                const currentFills = selectedNode.fills;
                const newFills: Paint[] = [];
                
                for (const fill of currentFills) {
                  if (fill.type === "IMAGE") {
                    newFills.push({
                      type: "IMAGE",
                      imageHash: imageHash,
                      scaleMode: fill.scaleMode || "FILL",
                      imageTransform: fill.imageTransform,
                      scalingFactor: fill.scalingFactor,
                      rotation: fill.rotation,
                      opacity: fill.opacity !== undefined ? fill.opacity : 1,
                      visible: fill.visible !== undefined ? fill.visible : true,
                      blendMode: fill.blendMode || "NORMAL"
                    });
                  } else {
                    newFills.push(fill);
                  }
                }
                
                // Apply fills and restore position to prevent movement
                selectedNode.fills = newFills;
                selectedNode.x = originalX;
                selectedNode.y = originalY;
                
                console.log("Image fill replaced successfully");
                // Don't scroll - keeps viewport stable and prevents movement
                return;
              } catch (error) {
                console.error("Error replacing image fill in component:", error);
                // Fall through to try inserting as child
              }
            }
          }
        }
        
        // For frames, or if component/instance doesn't have image fills, insert as child
        console.log("Inserting logo as child node...");
        try {
          // Check if the node is locked
          if (selectedNode.locked) {
            console.log("Node is locked, trying to unlock...");
            selectedNode.locked = false;
          }
          
          // Clear existing children in the frame/component
          const children = selectedNode.children.slice();
          console.log("Clearing", children.length, "existing children");
          for (const child of children) {
            try {
              child.remove();
            } catch (err) {
              console.warn("Could not remove child:", err);
            }
          }
          
          // Create the SVG node
          const node = figma.createNodeFromSvg(msg.svg);
          console.log("SVG node created, size:", node.width, "x", node.height);
          
          // Calculate scaling to fill the frame while maintaining aspect ratio
          const frameWidth = selectedNode.width;
          const frameHeight = selectedNode.height;
          const logoWidth = node.width;
          const logoHeight = node.height;
          
          console.log("Frame size:", frameWidth, "x", frameHeight);
          
          // Calculate scale to fill frame with some padding
          const padding = 16; // 8px padding on each side
          const maxWidth = frameWidth - padding;
          const maxHeight = frameHeight - padding;
          
          const scaleX = maxWidth / logoWidth;
          const scaleY = maxHeight / logoHeight;
          // Use the smaller scale to ensure logo fits within frame (maintains aspect ratio)
          const scale = Math.min(scaleX, scaleY);
          
          console.log("Calculated scale:", scale);
          
          // Apply scaling
          node.resize(logoWidth * scale, logoHeight * scale);
          
          // Center the logo in the frame
          node.x = (frameWidth - node.width) / 2;
          node.y = (frameHeight - node.height) / 2;
          
          console.log("Positioning logo at:", node.x, node.y);
          
          // Insert into the frame/component
          selectedNode.appendChild(node);
          console.log("Logo inserted into frame/component successfully");
          
          // Select the frame/component again
          figma.currentPage.selection = [selectedNode];
          figma.viewport.scrollAndZoomIntoView([selectedNode]);
          return;
        } catch (error) {
          console.error("Error inserting into frame/component:", error);
          // Fall through to default behavior
        }
      }
      
      // Check if it's a node that can have fills (but not frames/components/instances - those are handled above)
      // This handles shapes that can have fills (color, image, gradient, etc.)
      if (selectedNode.type === "RECTANGLE" || 
          selectedNode.type === "ELLIPSE" || 
          selectedNode.type === "POLYGON" ||
          selectedNode.type === "STAR" ||
          selectedNode.type === "VECTOR" ||
          selectedNode.type === "TEXT" ||
          selectedNode.type === "LINE") {
        
        try {
          console.log("Attempting to replace shape with SVG. SVG length:", msg.svg.length);
          
          // Replace the shape with the SVG node to keep it as a vector (no PNG conversion!)
          const svgNode = figma.createNodeFromSvg(msg.svg);
          console.log("SVG node created successfully, size:", svgNode.width, "x", svgNode.height);
          
          // Get the parent and position of the selected node BEFORE removing it
          const parent = selectedNode.parent;
          const x = selectedNode.x;
          const y = selectedNode.y;
          const width = selectedNode.width;
          const height = selectedNode.height;
          
          console.log("Original shape dimensions:", width, "x", height, "at", x, ",", y);
          
          // Scale the SVG to fit the original shape's dimensions (maintaining aspect ratio)
          const scaleX = width / svgNode.width;
          const scaleY = height / svgNode.height;
          const scale = Math.min(scaleX, scaleY);
          
          console.log("Calculated scale:", scale);
          
          svgNode.resize(svgNode.width * scale, svgNode.height * scale);
          
          // Insert the SVG node into the parent FIRST (so coordinates are relative to parent)
          // Check if parent can accept children (frames, components, instances, groups, pages)
          if (parent && "appendChild" in parent && 
              (parent.type === "FRAME" || parent.type === "COMPONENT" || 
               parent.type === "INSTANCE" || parent.type === "GROUP" || 
               parent.type === "PAGE")) {
            try {
              parent.appendChild(svgNode);
              console.log("Appended to parent:", parent.type);
            } catch (appendError) {
              console.warn("Failed to append to parent, appending to page instead:", appendError);
              figma.currentPage.appendChild(svgNode);
            }
          } else {
            figma.currentPage.appendChild(svgNode);
            console.log("Appended to page (no valid parent)");
          }
          
          // Set position AFTER appending (ensures correct coordinate system)
          // Center the SVG within the original shape's bounds
          svgNode.x = x + (width - svgNode.width) / 2;
          svgNode.y = y + (height - svgNode.height) / 2;
          
          console.log("Positioned SVG at:", svgNode.x, ",", svgNode.y);
          
          // Remove the original shape AFTER positioning the new one
          selectedNode.remove();
          console.log("Original shape removed");
          
          // Select the new SVG node (but don't scroll - keeps viewport stable)
          figma.currentPage.selection = [svgNode];
          console.log("Shape replacement completed successfully");
          return;
        } catch (error) {
          console.error("Error replacing shape with SVG:", error);
          console.error("Error details:", error instanceof Error ? error.message : String(error));
          console.error("SVG preview (first 200 chars):", msg.svg.substring(0, 200));
          // Fall through to default behavior
        }
      }
    }
    
    // Default behavior: insert at a fixed, always-visible position
    const node = figma.createNodeFromSvg(msg.svg);
    
    // Use viewport center but offset significantly to the right to avoid plugin window
    // Plugin is 600px wide, so offset by at least 400px to the right
    const viewportCenter = figma.viewport.center;
    const offsetX = 450; // Large offset to the right (past plugin window)
    const offsetY = -100; // Slight offset upward for better visibility
    
    // Place logo at a consistent position: right of center, slightly above center
    node.x = viewportCenter.x + offsetX - node.width / 2;
    node.y = viewportCenter.y + offsetY - node.height / 2;
    
    figma.currentPage.appendChild(node);
    // Scroll to ensure it's visible
    figma.viewport.scrollAndZoomIntoView([node]);
  } else if (msg.type === "prepare-drop") {
    // Store SVG for drag and drop
    pendingDropSvg = msg.svg;
  }
};
