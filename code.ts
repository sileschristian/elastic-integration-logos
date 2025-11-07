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
                // For fills, we need to convert SVG to a raster image
                const tempSvgNode = figma.createNodeFromSvg(msg.svg);
                figma.currentPage.appendChild(tempSvgNode);
                const imageBytes = await tempSvgNode.exportAsync({ format: "PNG" });
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
                
                selectedNode.fills = newFills;
                console.log("Image fill replaced successfully");
                figma.viewport.scrollAndZoomIntoView([selectedNode]);
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
          // Check if the node supports fills
          if (!("fills" in selectedNode)) {
            // Fall through to default behavior
            throw new Error("Node does not support fills");
          }
          
          // For fills, we need to convert SVG to a raster image
          // First, create a temporary SVG node to get the image
          const tempSvgNode = figma.createNodeFromSvg(msg.svg);
          
          // Add to page temporarily (required for export)
          figma.currentPage.appendChild(tempSvgNode);
          
          // Export the SVG node as PNG bytes
          const imageBytes = await tempSvgNode.exportAsync({ format: "PNG" });
          
          // Remove the temporary node
          tempSvgNode.remove();
          
          // Create image from PNG bytes
          const imageHash = figma.createImage(imageBytes).hash;
          
          // Get current fills or initialize empty array
          const currentFills = selectedNode.fills && Array.isArray(selectedNode.fills) 
            ? selectedNode.fills 
            : [];
          
          // Create the new image fill
          const newImageFill: ImagePaint = {
            type: "IMAGE",
            imageHash: imageHash,
            scaleMode: "FILL",
            opacity: 1,
            visible: true,
            blendMode: "NORMAL"
          };
          
          // If there are existing fills, replace the first one (typically the active one in inspector)
          // If no fills exist, add the logo as the first fill
          if (currentFills.length > 0) {
            // Replace first fill, preserve its properties if possible
            const firstFill = currentFills[0];
            const newFills: Paint[] = [
              {
                type: "IMAGE",
                imageHash: imageHash,
                scaleMode: "FILL",
                opacity: firstFill.opacity !== undefined ? firstFill.opacity : 1,
                visible: firstFill.visible !== undefined ? firstFill.visible : true,
                blendMode: firstFill.blendMode || "NORMAL"
              },
              ...currentFills.slice(1) // Keep other fills
            ];
            selectedNode.fills = newFills;
          } else {
            // No fills exist, add the logo as the first fill
            selectedNode.fills = [newImageFill];
          }
          
          figma.viewport.scrollAndZoomIntoView([selectedNode]);
          return;
        } catch (error) {
          console.error("Error replacing fill:", error);
          // Fall through to default behavior
        }
      }
    }
    
    // Default behavior: insert at the center of the viewport
    const node = figma.createNodeFromSvg(msg.svg);
    const viewportCenter = figma.viewport.center;
    node.x = viewportCenter.x - node.width / 2;
    node.y = viewportCenter.y - node.height / 2;
    figma.currentPage.appendChild(node);
    figma.viewport.scrollAndZoomIntoView([node]);
  } else if (msg.type === "prepare-drop") {
    // Store SVG for drag and drop
    pendingDropSvg = msg.svg;
  }
};
