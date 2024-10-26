const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const brushSizeInput = document.getElementById('brushSize') as HTMLInputElement;
const imageInput = document.getElementById('imageInput') as HTMLInputElement;
const imageVisualization = document.getElementById('imageVisualization') as HTMLCanvasElement;
const brushTypeSelect = document.getElementById('brushType') as HTMLSelectElement;
const effectSelect = document.getElementById('effectSelect') as HTMLSelectElement;
const effectStrengthInput = document.getElementById('effectStrength') as HTMLInputElement;
const samplingMethodSelect = document.getElementById('samplingMethod') as HTMLSelectElement;
const samplingDirectionSelect = document.getElementById('samplingDirection') as HTMLSelectElement;
const undoButton = document.getElementById('undoButton') as HTMLButtonElement;
const forwardButton = document.getElementById('forwardButton') as HTMLButtonElement;
const resetButton = document.getElementById('resetButton') as HTMLButtonElement;
const saveDrawingButton = document.getElementById('saveDrawingButton') as HTMLButtonElement;

let brushBorderCanvas: HTMLCanvasElement;
let brushBorderCtx: CanvasRenderingContext2D;
let currentColumn: number = 0;
let currentRow: number = 0;
let columnDirection: 'down' | 'up' = 'down';
let stateHistory: ImageData[] = [];
let currentStateIndex: number = -1;

const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
const visualizationCtx = imageVisualization.getContext('2d')!;
const MAX_HISTORY_STATES: number = 50; // Limit the number of stored states to prevent memory issues
const MAX_PAGE_WIDTH = 0.95; // 95% of viewport width to leave some margin
const LEFT_PANEL_WIDTH = 300; // Adjust this to match your actual left panel width
const CANVAS_GAP = 20; // Gap between canvases

brushBorderCanvas = document.createElement('canvas');
brushBorderCanvas.width = canvas.width;
brushBorderCanvas.height = canvas.height;
brushBorderCanvas.style.position = 'absolute';
brushBorderCanvas.style.pointerEvents = 'none';  // Make sure it doesn't interfere with mouse events
brushBorderCanvas.style.left = canvas.offsetLeft + 'px';
brushBorderCanvas.style.top = canvas.offsetTop + 'px';
brushBorderCtx = brushBorderCanvas.getContext('2d')!;
canvas.parentElement?.appendChild(brushBorderCanvas);

let drawing = false;
let lastX = 0;
let lastY = 0;
let brushSize: number = 50;
let brushType: 'circle' | 'square' | 'continuous' = 'continuous';
let currentEffect: 'none' | 'blur' | 'sharpen' | 'edgeDetection' = 'none';
let effectStrength: number = 5;
let samplingMethod: 'normal' | 'vertical' | 'horizontal' | 'random' = 'normal';
let samplingDirection: 'forward' | 'backward' = 'forward';
let samplingOffset: number = 0;
let lastSamplingTime: number = 0;
let originalImage: HTMLImageElement;
let drawingLayer: ImageData;

// Initialize drawing layer
function initDrawingLayer() {
    drawingLayer = ctx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < drawingLayer.data.length; i += 4) {
        drawingLayer.data[i + 3] = 0; // Set alpha to 0 (transparent)
    }
    // Save initial state
    saveState();
}

initDrawingLayer();

// Update brush size when slider changes
brushSizeInput.addEventListener('input', () => {
    brushSize = parseInt(brushSizeInput.value, 10);
});

// Update brush type when select changes
brushTypeSelect.addEventListener('change', () => {
    brushType = brushTypeSelect.value as 'circle' | 'square' | 'continuous';
});

// Update effect type when select changes
effectSelect.addEventListener('change', () => {
    currentEffect = effectSelect.value as 'none' | 'blur' | 'sharpen' | 'edgeDetection';
});

// Update effect strength when slider changes
effectStrengthInput.addEventListener('input', () => {
    effectStrength = parseInt(effectStrengthInput.value, 10);
});

// Update sampling method when select changes
samplingMethodSelect.addEventListener('change', () => {
    samplingMethod = samplingMethodSelect.value as 'normal' | 'vertical' | 'horizontal' | 'random';
    samplingOffset = 0; // Reset offset when changing method
    updateDirectionSelectVisibility(); // Add this line
});

samplingDirectionSelect.addEventListener('change', () => {
    samplingDirection = samplingDirectionSelect.value as 'forward' | 'backward';
    samplingOffset = 0;
});

// Start drawing when mouse is down
canvas.addEventListener('mousedown', (e) => {
    drawing = true;
    [lastX, lastY] = [e.offsetX, e.offsetY];
    lastSamplingTime = Date.now();

    // If this is the first draw action, save the initial state
    if (stateHistory.length === 0) {
        saveState();
    }

    if (brushType !== 'continuous') {
        drawShape(e.offsetX, e.offsetY, 0);
    }
});

// Stop drawing when mouse is up or leaves the canvas
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseleave', stopDrawing);

// Draw on canvas
canvas.addEventListener('mousemove', (e) => {
    if (drawing) {
        const currentTime = Date.now();
        const timeDiff = currentTime - lastSamplingTime;
        const speed = Math.sqrt((e.offsetX - lastX) ** 2 + (e.offsetY - lastY) ** 2) / timeDiff;
        
        if (brushType === 'continuous') {
            drawLine(lastX, lastY, e.offsetX, e.offsetY, speed);
        } else {
            drawShape(e.offsetX, e.offsetY, speed);
        }
        [lastX, lastY] = [e.offsetX, e.offsetY];
        lastSamplingTime = currentTime;
    }
    updateVisualization(e.offsetX, e.offsetY);
    updateBrushBorder(e.offsetX, e.offsetY);
});

undoButton.addEventListener('click', handleUndo);
forwardButton.addEventListener('click', handleForward);

resetButton.addEventListener('click', function(e: MouseEvent) {
    e.preventDefault();
    if (confirm("Are you sure you want to clear your drawing? This action cannot be undone.")) {
        resetCanvas();
    }
});

function saveState() {
    const currentState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Remove any states after the current index
    stateHistory = stateHistory.slice(0, currentStateIndex + 1);
    
    // Add new state
    stateHistory.push(currentState);
    currentStateIndex++;
    
    // Remove oldest states if we exceed the maximum
    if (stateHistory.length > MAX_HISTORY_STATES) {
        stateHistory.shift();
        currentStateIndex--;
    }
    
    // Update buttons state
    updateHistoryButtons();
}

function handleUndo() {
    if (currentStateIndex > 0) {
        currentStateIndex--;
        const previousState = stateHistory[currentStateIndex];
        
        // Restore the previous state
        ctx.putImageData(previousState, 0, 0);
        
        // Update the drawing layer to match the canvas state
        drawingLayer = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Update buttons state
        updateHistoryButtons();
    }
}

function handleForward() {
    if (currentStateIndex < stateHistory.length - 1) {
        currentStateIndex++;
        const nextState = stateHistory[currentStateIndex];
        
        // Restore the next state
        ctx.putImageData(nextState, 0, 0);
        
        // Update the drawing layer to match the canvas state
        drawingLayer = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Update buttons state
        updateHistoryButtons();
    }
}

function updateHistoryButtons() {
    // Disable both buttons if there's no history
    if (stateHistory.length === 0) {
        undoButton.disabled = true;
        forwardButton.disabled = true;
        return;
    }

    // Otherwise, check positions in history
    undoButton.disabled = currentStateIndex <= 0;
    forwardButton.disabled = currentStateIndex >= stateHistory.length - 1;
}

function updateBrushBorder(x: number, y: number) {
    // Clear previous brush border
    brushBorderCtx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Only draw brush border if an image is loaded
    if (!originalImage) {
        return;
    }
    
    brushBorderCtx.strokeStyle = 'red';
    brushBorderCtx.lineWidth = 2;

    if (brushType === 'circle' || brushType === 'continuous') {
        brushBorderCtx.beginPath();
        brushBorderCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        brushBorderCtx.stroke();
    } else if (brushType === 'square') {
        brushBorderCtx.strokeRect(
            x - brushSize / 2,
            y - brushSize / 2,
            brushSize,
            brushSize
        );
    }
}

function stopDrawing() {
    if (drawing) {
        saveState();
    }
    drawing = false;
    brushBorderCtx.clearRect(0, 0, canvas.width, canvas.height);
}

function calculateCanvasDimensions(imageWidth: number, imageHeight: number): { width: number; height: number } {
    // Get viewport width
    const viewportWidth = window.innerWidth;
    
    // Calculate maximum available width for both canvases
    const maxAvailableWidth = (viewportWidth * MAX_PAGE_WIDTH) - LEFT_PANEL_WIDTH - CANVAS_GAP;
    
    // Each canvas can take up half of the available width
    const maxCanvasWidth = (maxAvailableWidth / 2);
    
    // Calculate the dimensions while maintaining aspect ratio
    const imageAspectRatio = imageWidth / imageHeight;
    
    let finalWidth: number;
    let finalHeight: number;
    
    if (imageWidth > maxCanvasWidth) {
        // If image is wider than available space, scale down
        finalWidth = maxCanvasWidth;
        finalHeight = finalWidth / imageAspectRatio;
    } else {
        // If image is smaller than available space, use original dimensions
        finalWidth = imageWidth;
        finalHeight = imageHeight;
    }
    
    return { width: Math.floor(finalWidth), height: Math.floor(finalHeight) };
}

function resizeCanvases(width: number, height: number) {
    // Resize main canvas and visualization canvas to exactly the same dimensions
    canvas.width = width;
    canvas.height = height;
    imageVisualization.width = width;
    imageVisualization.height = height;
    
    // Resize brush border canvas
    brushBorderCanvas.width = width;
    brushBorderCanvas.height = height;
    
    // Update brush border canvas position to match main canvas
    brushBorderCanvas.style.left = canvas.offsetLeft + 'px';
    brushBorderCanvas.style.top = canvas.offsetTop + 'px';
    
    // Initialize drawing layer with new dimensions
    drawingLayer = ctx.createImageData(width, height);
    for (let i = 0; i < drawingLayer.data.length; i += 4) {
        drawingLayer.data[i + 3] = 0; // Set alpha to 0 (transparent)
    }
}

function drawShape(x: number, y: number, speed: number) {
    // Calculate source coordinates with proper scaling
    const scaleX = originalImage.width / canvas.width;
    const scaleY = originalImage.height / canvas.height;
    
    const sourceX = Math.floor(x * scaleX);
    const sourceY = Math.floor(y * scaleY);
    const sourceWidth = Math.ceil(brushSize * scaleX);
    const sourceHeight = Math.ceil(brushSize * scaleY);

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCanvas.width = brushSize;
    tempCanvas.height = brushSize;

    sampleImage(tempCtx, sourceX, sourceY, sourceWidth, sourceHeight, speed);

    if (currentEffect !== 'none') {
        const imageData = tempCtx.getImageData(0, 0, brushSize, brushSize);
        const processedImageData = applyEffect(imageData, currentEffect, effectStrength);
        tempCtx.putImageData(processedImageData, 0, 0);
    }

    tempCtx.globalCompositeOperation = 'destination-in';
    tempCtx.fillStyle = 'black';
    if (brushType === 'circle') {
        tempCtx.beginPath();
        tempCtx.arc(brushSize / 2, brushSize / 2, brushSize / 2, 0, Math.PI * 2);
        tempCtx.fill();
    } else if (brushType === 'square') {
        tempCtx.fillRect(0, 0, brushSize, brushSize);
    }

    // Calculate the position where we want to draw
    const drawX = x - brushSize / 2;
    const drawY = y - brushSize / 2;

    // Calculate how much of the brush should be drawn (for edge cases)
    const sourceStartX = Math.max(0, -drawX);
    const sourceStartY = Math.max(0, -drawY);
    const sourceEndX = Math.min(brushSize, canvas.width - drawX);
    const sourceEndY = Math.min(brushSize, canvas.height - drawY);
    
    // Calculate where on the canvas to draw
    const targetX = Math.max(0, drawX);
    const targetY = Math.max(0, drawY);
    
    // Calculate the width and height of the area to draw
    const drawWidth = sourceEndX - sourceStartX;
    const drawHeight = sourceEndY - sourceStartY;

    // Only draw if we have a valid area
    if (drawWidth > 0 && drawHeight > 0) {
        ctx.drawImage(
            tempCanvas,
            sourceStartX,
            sourceStartY,
            drawWidth,
            drawHeight,
            targetX,
            targetY,
            drawWidth,
            drawHeight
        );
        updateDrawingLayer(targetX, targetY, drawWidth, drawHeight);
    }
}


function drawLine(fromX: number, fromY: number, toX: number, toY: number, speed: number) {
    // Ensure coordinates are finite numbers
    if (!Number.isFinite(fromX) || !Number.isFinite(fromY) || 
        !Number.isFinite(toX) || !Number.isFinite(toY)) {
        return;
    }

    const distance = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
    const steps = Math.ceil(distance);

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = fromX + (toX - fromX) * t;
        const y = fromY + (toY - fromY) * t;
        drawPoint(Math.round(x), Math.round(y), speed);
    }
}

function drawPoint(x: number, y: number, speed: number) {
    // Validate coordinates
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
    }

    // Calculate scaling factors for visualization to drawing alignment
    const scaleX = originalImage.width / imageVisualization.width;
    const scaleY = originalImage.height / imageVisualization.height;

    // Calculate source coordinates from visualization space
    const sourceX = Math.floor(x * scaleX);
    const sourceY = Math.floor(y * scaleY);
    const sourceWidth = Math.ceil(brushSize * scaleX);
    const sourceHeight = Math.ceil(brushSize * scaleY);

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCanvas.width = brushSize;
    tempCanvas.height = brushSize;

    // Calculate draw coordinates
    const drawX = x - brushSize / 2;
    const drawY = y - brushSize / 2;

    // Use sampleImage for all sampling methods
    sampleImage(tempCtx, sourceX, sourceY, sourceWidth, sourceHeight, speed);

    if (currentEffect !== 'none') {
        const imageData = tempCtx.getImageData(0, 0, brushSize, brushSize);
        const processedImageData = applyEffect(imageData, currentEffect, effectStrength);
        tempCtx.putImageData(processedImageData, 0, 0);
    }

    // Apply brush shape mask
    tempCtx.globalCompositeOperation = 'destination-in';
    tempCtx.fillStyle = 'black';
    tempCtx.beginPath();
    tempCtx.arc(brushSize / 2, brushSize / 2, brushSize / 2, 0, Math.PI * 2);
    tempCtx.fill();

    // Calculate the visible portion of the brush
    const sourceStartX = Math.max(0, -drawX);
    const sourceStartY = Math.max(0, -drawY);
    const sourceEndX = Math.min(brushSize, canvas.width - drawX);
    const sourceEndY = Math.min(brushSize, canvas.height - drawY);
    
    // Calculate where on the canvas to draw
    const targetX = Math.max(0, drawX);
    const targetY = Math.max(0, drawY);
    
    // Calculate the width and height of the area to draw
    const drawWidth = sourceEndX - sourceStartX;
    const drawHeight = sourceEndY - sourceStartY;

    // Only draw if we have a valid area
    if (drawWidth > 0 && drawHeight > 0) {
        ctx.drawImage(
            tempCanvas,
            sourceStartX,
            sourceStartY,
            drawWidth,
            drawHeight,
            targetX,
            targetY,
            drawWidth,
            drawHeight
        );
        
        // Update drawing layer with the actual drawn area
        updateDrawingLayer(targetX, targetY, drawWidth, drawHeight);
    }
}

function updateDrawingLayerPrecise(
    drawnContent: ImageData,
    x: number,
    y: number,
    width: number,
    height: number
) {
    // Ensure we're within canvas bounds
    const startX = Math.max(0, Math.min(x, canvas.width));
    const startY = Math.max(0, Math.min(y, canvas.height));
    const endX = Math.min(startX + width, canvas.width);
    const endY = Math.min(startY + height, canvas.height);

    for (let py = startY; py < endY; py++) {
        for (let px = startX; px < endX; px++) {
            const sourceIndex = ((py - startY) * width + (px - startX)) * 4;
            const targetIndex = (py * canvas.width + px) * 4;

            // Only update if the pixel has some opacity
            if (drawnContent.data[sourceIndex + 3] > 0) {
                // Copy all channels including alpha
                drawingLayer.data[targetIndex] = drawnContent.data[sourceIndex];
                drawingLayer.data[targetIndex + 1] = drawnContent.data[sourceIndex + 1];
                drawingLayer.data[targetIndex + 2] = drawnContent.data[sourceIndex + 2];
                drawingLayer.data[targetIndex + 3] = drawnContent.data[sourceIndex + 3];
            }
        }
    }
}

function getSourceSamplingRect(x: number, y: number, brushSize: number, originalImage: HTMLImageElement) {
    const scaleX = originalImage.width / canvas.width;
    const scaleY = originalImage.height / canvas.height;
    
    const sourceX = x * scaleX;
    const sourceY = y * scaleY;
    const sourceWidth = brushSize * scaleX;
    const sourceHeight = brushSize * scaleY;
    
    return {
        x: Math.max(0, Math.min(sourceX - sourceWidth / 2, originalImage.width - sourceWidth)),
        y: Math.max(0, Math.min(sourceY - sourceHeight / 2, originalImage.height - sourceHeight)),
        width: sourceWidth,
        height: sourceHeight
    };
}

function sampleImage(ctx: CanvasRenderingContext2D, sourceX: number, sourceY: number, sourceWidth: number, sourceHeight: number, speed: number) {
    const offsetSpeed = Math.ceil(speed * 50);
    let directionX: number = 1;
    let directionY: number = 1;

    // Set directions based on sampling direction only for vertical and horizontal methods
    if (samplingMethod === 'vertical' || samplingMethod === 'horizontal') {
        if (samplingDirection === 'backward') {
            directionX = -1;
            directionY = -1;
        }
    }

    // Ensure we stay within image bounds
    const clamp = (value: number, min: number, max: number): number => {
        return Math.min(Math.max(value, min), max);
    };

    switch (samplingMethod) {
        case 'normal':
            // Ensure sampling coordinates are within bounds
            const adjustedX = clamp(sourceX - (sourceWidth / 2), 0, originalImage.width - sourceWidth);
            const adjustedY = clamp(sourceY - (sourceHeight / 2), 0, originalImage.height - sourceHeight);
            ctx.drawImage(originalImage, adjustedX, adjustedY, sourceWidth, sourceHeight, 0, 0, brushSize, brushSize);
            break;
            
        case 'vertical':
            samplingOffset += offsetSpeed * directionY;
            if (samplingOffset >= originalImage.height || samplingOffset < 0) {
                currentColumn += directionX;
                if (currentColumn >= Math.floor(originalImage.width / sourceWidth) || currentColumn < 0) {
                    currentColumn = directionX > 0 ? 0 : Math.floor(originalImage.width / sourceWidth) - 1;
                }
                samplingOffset = directionY > 0 ? 0 : originalImage.height - sourceHeight;
            }
            const startX = clamp(currentColumn * sourceWidth, 0, originalImage.width - sourceWidth);
            const verticalY = clamp(samplingOffset, 0, originalImage.height - sourceHeight);
            ctx.drawImage(originalImage, startX, verticalY, sourceWidth, sourceHeight, 0, 0, brushSize, brushSize);
            break;
            
        case 'horizontal':
            samplingOffset += offsetSpeed * directionX;
            if (samplingOffset >= originalImage.width || samplingOffset < 0) {
                currentRow += directionY;
                if (currentRow >= Math.floor(originalImage.height / sourceHeight) || currentRow < 0) {
                    currentRow = directionY > 0 ? 0 : Math.floor(originalImage.height / sourceHeight) - 1;
                }
                samplingOffset = directionX > 0 ? 0 : originalImage.width - sourceWidth;
            }
            const startY = clamp(currentRow * sourceHeight, 0, originalImage.height - sourceHeight);
            const horizontalX = clamp(samplingOffset, 0, originalImage.width - sourceWidth);
            ctx.drawImage(originalImage, horizontalX, startY, sourceWidth, sourceHeight, 0, 0, brushSize, brushSize);
            break;
            
        case 'random':
            const randomX = clamp(Math.random() * (originalImage.width - sourceWidth), 0, originalImage.width - sourceWidth);
            const randomY = clamp(Math.random() * (originalImage.height - sourceHeight), 0, originalImage.height - sourceHeight);
            ctx.drawImage(originalImage, randomX, randomY, sourceWidth, sourceHeight, 0, 0, brushSize, brushSize);
            break;
    }
}

function applyEffect(imageData: ImageData, effect: 'blur' | 'sharpen' | 'edgeDetection', strength: number): ImageData {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const outputData = new Uint8ClampedArray(data);

    switch (effect) {
        case 'blur':
            boxBlur(data, outputData, width, height, strength);
            break;
        case 'sharpen':
            sharpen(data, outputData, width, height, strength);
            break;
        case 'edgeDetection':
            edgeDetection(data, outputData, width, height, strength);
            break;
    }

    return new ImageData(outputData, width, height);
}

function boxBlur(input: Uint8ClampedArray, output: Uint8ClampedArray, width: number, height: number, radius: number) {
    const size = width * height;
    const kernelSize = (2 * radius + 1) ** 2;

    for (let i = 0; i < size; i++) {
        let r = 0, g = 0, b = 0, a = 0;
        const x = i % width;
        const y = Math.floor(i / width);

        for (let ky = -radius; ky <= radius; ky++) {
            for (let kx = -radius; kx <= radius; kx++) {
                const px = Math.min(width - 1, Math.max(0, x + kx));
                const py = Math.min(height - 1, Math.max(0, y + ky));
                const j = (py * width + px) * 4;
                r += input[j];
                g += input[j + 1];
                b += input[j + 2];
                a += input[j + 3];
            }
        }

        const pixelIndex = i * 4;
        output[pixelIndex] = r / kernelSize;
        output[pixelIndex + 1] = g / kernelSize;
        output[pixelIndex + 2] = b / kernelSize;
        output[pixelIndex + 3] = a / kernelSize;
    }
}

function sharpen(input: Uint8ClampedArray, output: Uint8ClampedArray, width: number, height: number, strength: number) {
    const kernel = [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
    ];

    applyConvolution(input, output, width, height, kernel, strength);
}

function edgeDetection(input: Uint8ClampedArray, output: Uint8ClampedArray, width: number, height: number, strength: number) {
    const kernel = [
        -1, -1, -1,
        -1, 8, -1,
        -1, -1, -1
    ];

    applyConvolution(input, output, width, height, kernel, strength);
}

function applyConvolution(input: Uint8ClampedArray, output: Uint8ClampedArray, width: number, height: number, kernel: number[], strength: number) {
    const size = width * height;
    const kernelSize = Math.sqrt(kernel.length);
    const halfKernel = Math.floor(kernelSize / 2);

    for (let i = 0; i < size; i++) {
        let r = 0, g = 0, b = 0;
        const x = i % width;
        const y = Math.floor(i / width);

        for (let ky = 0; ky < kernelSize; ky++) {
            for (let kx = 0; kx < kernelSize; kx++) {
                const px = Math.min(width - 1, Math.max(0, x + kx - halfKernel));
                const py = Math.min(height - 1, Math.max(0, y + ky - halfKernel));
                const j = (py * width + px) * 4;
                const kernelValue = kernel[ky * kernelSize + kx];
                r += input[j] * kernelValue;
                g += input[j + 1] * kernelValue;
                b += input[j + 2] * kernelValue;
            }
        }

        const pixelIndex = i * 4;
        output[pixelIndex] = Math.min(255, Math.max(0, input[pixelIndex] + (r - input[pixelIndex]) * (strength / 10)));
        output[pixelIndex + 1] = Math.min(255, Math.max(0, input[pixelIndex + 1] + (g - input[pixelIndex + 1]) * (strength / 10)));
        output[pixelIndex + 2] = Math.min(255, Math.max(0, input[pixelIndex + 2] + (b - input[pixelIndex + 2]) * (strength / 10)));
        output[pixelIndex + 3] = input[pixelIndex + 3];
    }
}

function updateVisualization(x: number, y: number) {
    if (!originalImage) {
        drawPromptText(visualizationCtx, imageVisualization);
        return;
    }
    
    visualizationCtx.clearRect(0, 0, imageVisualization.width, imageVisualization.height);
    
    if (originalImage) {
        visualizationCtx.drawImage(originalImage, 0, 0, imageVisualization.width, imageVisualization.height);
    }

    const sourceWidth = Math.ceil(brushSize * (originalImage.width / canvas.width));
    const sourceHeight = Math.ceil(brushSize * (originalImage.height / canvas.height));

    let startX: number, startY: number;

    [startX, startY] = [0, 0];

    // Calculate current sampling position based on offset
    let currentX = 0;
    let currentY = 0;
    switch (samplingMethod) {
        case 'vertical':
            currentY = (startY + samplingOffset) % originalImage.height;
            break;
        case 'horizontal':
            currentX = (startX + samplingOffset) % originalImage.width;
            break;
        case 'random':
            currentX = Math.random() * (originalImage.width - sourceWidth);
            currentY = Math.random() * (originalImage.height - sourceHeight);
            break;
    }

    visualizationCtx.lineWidth = 2;

    if (samplingMethod !== 'normal') {
        visualizationCtx.strokeStyle = 'blue';
        visualizationCtx.fillStyle = 'rgba(0, 0, 255, 0.3)';

        let scaledX: number, scaledY: number;
        
        switch (samplingMethod) {
            case 'vertical':
                scaledX = currentColumn * sourceWidth * (imageVisualization.width / originalImage.width);
                scaledY = samplingOffset * (imageVisualization.height / originalImage.height);
                break;
            case 'horizontal':
                scaledX = samplingOffset * (imageVisualization.width / originalImage.width);
                scaledY = currentRow * sourceHeight * (imageVisualization.height / originalImage.height);
                break;
            default:
                scaledX = currentX * (imageVisualization.width / originalImage.width);
                scaledY = currentY * (imageVisualization.height / originalImage.height);
        }

        const scaledWidth = sourceWidth * (imageVisualization.width / originalImage.width);
        const scaledHeight = sourceHeight * (imageVisualization.height / originalImage.height);

        // Draw the sampling area based on brush type
        if (brushType === 'circle' || brushType === 'continuous') {
            visualizationCtx.beginPath();
            visualizationCtx.arc(scaledX + scaledWidth / 2, scaledY + scaledHeight / 2, scaledWidth / 2, 0, Math.PI * 2);
            visualizationCtx.fill();
            visualizationCtx.stroke();
        } else if (brushType === 'square') {
            visualizationCtx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);
            visualizationCtx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);
        }

        // Draw arrow to indicate sampling direction
        const arrowSize = 10;
        visualizationCtx.beginPath();
        visualizationCtx.moveTo(scaledX + scaledWidth / 2, scaledY + scaledHeight / 2);

        let endX = scaledX + scaledWidth / 2;
        let endY = scaledY + scaledHeight / 2;

        switch (samplingMethod) {
            case 'vertical':
                endY += samplingDirection === 'forward' ? arrowSize : -arrowSize;
                break;
            case 'horizontal':
                endX += samplingDirection === 'forward' ? arrowSize : -arrowSize;
                break;
        }

        visualizationCtx.lineTo(endX, endY);
        visualizationCtx.stroke();

        // Draw arrowhead
        visualizationCtx.beginPath();
        if (samplingMethod === 'vertical') {
            visualizationCtx.moveTo(endX - 5, endY - (samplingDirection === 'forward' ? 5 : -5));
            visualizationCtx.lineTo(endX, endY);
            visualizationCtx.lineTo(endX + 5, endY - (samplingDirection === 'forward' ? 5 : -5));
        } else if (samplingMethod === 'horizontal') {
            if (samplingDirection === 'forward') {
                visualizationCtx.moveTo(endX - 5, endY - 5);  // Upper point
                visualizationCtx.lineTo(endX, endY);          // Tip of arrow
                visualizationCtx.lineTo(endX - 5, endY + 5);  // Lower point
            } else {
                visualizationCtx.moveTo(endX + 5, endY - 5);  // Upper point
                visualizationCtx.lineTo(endX, endY);          // Tip of arrow
                visualizationCtx.lineTo(endX + 5, endY + 5);  // Lower point
            }
        }
        
        visualizationCtx.fill();
    }

    // Always show brush visualization based on mouse movement
    visualizationCtx.strokeStyle = 'red';
    const scaledX = x * (imageVisualization.width / canvas.width);
    const scaledY = y * (imageVisualization.height / canvas.height);
    const scaledBrushSize = brushSize * (imageVisualization.width / canvas.width);

    if (brushType === 'circle' || brushType === 'continuous') {
        visualizationCtx.beginPath();
        visualizationCtx.arc(scaledX, scaledY, scaledBrushSize / 2, 0, Math.PI * 2);
        visualizationCtx.stroke();
    } else if (brushType === 'square') {
        visualizationCtx.strokeRect(
            scaledX - scaledBrushSize / 2,
            scaledY - scaledBrushSize / 2,
            scaledBrushSize,
            scaledBrushSize
        );
    }
}

// Image loading functionality
imageInput.addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files![0];
    const reader = new FileReader();

    reader.onload = (e) => {
        // Reset history before loading new image
        stateHistory = [];
        currentStateIndex = -1;
        
        // Explicitly disable both buttons
        undoButton.disabled = true;
        forwardButton.disabled = true;

        originalImage = new Image();
        originalImage.src = e.target!.result as string;

        originalImage.onload = () => {
            // Calculate dimensions that maintain aspect ratio
            const dimensions = calculateCanvasDimensions(originalImage.width, originalImage.height);
            
            // Resize both canvases to exactly the same dimensions
            resizeCanvases(dimensions.width, dimensions.height);
            
            // Clear both canvases
            ctx.clearRect(0, 0, dimensions.width, dimensions.height);
            visualizationCtx.clearRect(0, 0, dimensions.width, dimensions.height);
            
            // Draw the image on visualization canvas
            visualizationCtx.drawImage(originalImage, 0, 0, dimensions.width, dimensions.height);

            // Initialize fresh drawing layer
            initDrawingLayer();
            
            // Don't save initial state here anymore
            updateHistoryButtons();
        };
    };

    reader.readAsDataURL(file);
});

function resizeAndDrawImage(targetCanvas: HTMLCanvasElement, targetCtx: CanvasRenderingContext2D) {
    if (!originalImage) {
        drawPromptText(targetCtx, targetCanvas);
        return;
    }

    // Calculate dimensions that maintain aspect ratio
    const scale = Math.min(
        targetCanvas.width / originalImage.width,
        targetCanvas.height / originalImage.height
    );

    const newWidth = originalImage.width * scale;
    const newHeight = originalImage.height * scale;

    // Center the image
    const offsetX = (targetCanvas.width - newWidth) / 2;
    const offsetY = (targetCanvas.height - newHeight) / 2;

    targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    
    if (targetCanvas === imageVisualization) {
        targetCtx.drawImage(originalImage, offsetX, offsetY, newWidth, newHeight);
    }
}

function updateDrawingLayer(x: number, y: number, width: number, height: number) {
    // Validate all inputs are finite numbers
    if (!Number.isFinite(x) || !Number.isFinite(y) || 
        !Number.isFinite(width) || !Number.isFinite(height)) {
        return;
    }

    // Ensure coordinates and dimensions are valid
    const safeX = Math.max(0, Math.min(Math.floor(x), canvas.width - 1));
    const safeY = Math.max(0, Math.min(Math.floor(y), canvas.height - 1));
    const safeWidth = Math.max(1, Math.min(Math.floor(width), canvas.width - safeX));
    const safeHeight = Math.max(1, Math.min(Math.floor(height), canvas.height - safeY));

    // Return early if dimensions are invalid
    if (safeWidth <= 0 || safeHeight <= 0) {
        return;
    }

    try {
        const drawnContent = ctx.getImageData(safeX, safeY, safeWidth, safeHeight);
        
        for (let row = 0; row < safeHeight; row++) {
            for (let col = 0; col < safeWidth; col++) {
                const sourceIndex = (row * safeWidth + col) * 4;
                const targetX = safeX + col;
                const targetY = safeY + row;
                const targetIndex = (targetY * canvas.width + targetX) * 4;

                // Only update if the pixel is not fully transparent
                if (drawnContent.data[sourceIndex + 3] > 0) {
                    drawingLayer.data[targetIndex] = drawnContent.data[sourceIndex];
                    drawingLayer.data[targetIndex + 1] = drawnContent.data[sourceIndex + 1];
                    drawingLayer.data[targetIndex + 2] = drawnContent.data[sourceIndex + 2];
                    drawingLayer.data[targetIndex + 3] = drawnContent.data[sourceIndex + 3];
                }
            }
        }
    } catch (error) {
        console.error('Error updating drawing layer:', error);
        console.log('Attempted coordinates:', { x, y, width, height });
        console.log('Safe coordinates:', { safeX, safeY, safeWidth, safeHeight });
    }
}

function resetCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    initDrawingLayer();
    
    if (!originalImage) {
        drawPromptText(ctx, canvas);
        drawPromptText(visualizationCtx, imageVisualization);
    }
    
    brushBorderCtx.clearRect(0, 0, canvas.width, canvas.height);
    
    samplingOffset = 0;
    currentColumn = 0;
    currentRow = 0;    
    columnDirection = 'down';    
    
    stateHistory = [];
    currentStateIndex = -1;
    updateHistoryButtons();
    
    drawing = false;
    
    // Clear the saved state in localStorage when canvas is reset
    clearSavedState();
    
    // Save the initial state
    saveState();
}

// Mousemove event listener to canvas to update visualization even when not drawing
canvas.addEventListener('mousemove', (e) => {
    updateVisualization(e.offsetX, e.offsetY);
});

window.addEventListener('resize', () => {
    if (originalImage) {
        const dimensions = calculateCanvasDimensions(originalImage.width, originalImage.height);
        resizeCanvases(dimensions.width, dimensions.height);
        
        // Redraw the image and content
        visualizationCtx.drawImage(originalImage, 0, 0, dimensions.width, dimensions.height);
        
        // Restore drawing layer
        ctx.putImageData(drawingLayer, 0, 0);
    }
});

function saveCanvasToLocalStorage() {
    try {
        // Save the main canvas state
        const canvasDataUrl = canvas.toDataURL('image/png');
        localStorage.setItem('savedCanvasState', canvasDataUrl);
        
        // Save the history states
        const historyDataUrls = stateHistory.map(imageData => {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            const tempCtx = tempCanvas.getContext('2d')!;
            tempCtx.putImageData(imageData, 0, 0);
            return tempCanvas.toDataURL('image/png');
        });
        localStorage.setItem('savedStateHistory', JSON.stringify(historyDataUrls));
        localStorage.setItem('savedStateIndex', currentStateIndex.toString());
        
        // Save other important state variables
        const stateData = {
            brushSize,
            brushType,
            currentEffect,
            effectStrength,
            samplingMethod,
            samplingDirection,
        };
        localStorage.setItem('savedStateData', JSON.stringify(stateData));
        
        // If there's an original image, save it too
        if (originalImage) {
            localStorage.setItem('savedOriginalImage', originalImage.src);
        }
        
        console.log('Canvas state saved successfully');
    } catch (error) {
        console.error('Error saving canvas state:', error);
    }
}

// Function to load canvas state from localStorage
async function loadCanvasFromLocalStorage() {
    try {
        // Load original image first if it exists
        const savedOriginalImage = localStorage.getItem('savedOriginalImage');
        if (savedOriginalImage) {
            originalImage = new Image();
            originalImage.src = savedOriginalImage;
            
            // Wait for image to load and resize canvases properly
            await new Promise<void>((resolve) => {
                originalImage.onload = () => {
                    // Calculate dimensions that maintain aspect ratio
                    const dimensions = calculateCanvasDimensions(originalImage.width, originalImage.height);
                    
                    // Resize both canvases to exactly the same dimensions
                    resizeCanvases(dimensions.width, dimensions.height);
                    
                    // Clear both canvases
                    ctx.clearRect(0, 0, dimensions.width, dimensions.height);
                    visualizationCtx.clearRect(0, 0, dimensions.width, dimensions.height);
                    
                    // Draw the image on visualization canvas
                    visualizationCtx.drawImage(originalImage, 0, 0, dimensions.width, dimensions.height);
                    
                    resolve();
                };
            });
        } else {
            // If no image was saved, initialize with default dimensions
            const initialDimensions = calculateCanvasDimensions(800, 600);
            resizeCanvases(initialDimensions.width, initialDimensions.height);
            drawPromptText(ctx, canvas);
            drawPromptText(visualizationCtx, imageVisualization);

            resetCanvas();
        }

        // Load the history states
        const savedHistoryData = localStorage.getItem('savedStateHistory');
        const savedStateIndex = localStorage.getItem('savedStateIndex');
        
        if (savedHistoryData && savedStateIndex) {
            const historyDataUrls: string[] = JSON.parse(savedHistoryData);
            currentStateIndex = parseInt(savedStateIndex, 10);
            
            // Convert data URLs back to ImageData
            stateHistory = await Promise.all(historyDataUrls.map(async (dataUrl: string) => {
                const img = new Image();
                img.src = dataUrl;
                await new Promise<void>(resolve => { img.onload = () => resolve(); });
                
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvas.width;
                tempCanvas.height = canvas.height;
                const tempCtx = tempCanvas.getContext('2d');
                
                if (!tempCtx) {
                    throw new Error('Failed to get 2D context for temporary canvas');
                }
                
                tempCtx.drawImage(img, 0, 0);
                return tempCtx.getImageData(0, 0, canvas.width, canvas.height);
            }));
            
            // Restore the current state
            if (stateHistory[currentStateIndex]) {
                ctx.putImageData(stateHistory[currentStateIndex], 0, 0);
                drawingLayer = ctx.getImageData(0, 0, canvas.width, canvas.height);
            }
        }
        
        // Load other state variables
        const savedStateData = localStorage.getItem('savedStateData');
        if (savedStateData) {
            const stateData = JSON.parse(savedStateData);
            
            // Restore brush settings
            brushSize = stateData.brushSize;
            brushSizeInput.value = brushSize.toString();
            
            brushType = stateData.brushType;
            brushTypeSelect.value = brushType;
            
            currentEffect = stateData.currentEffect;
            effectSelect.value = currentEffect;
            
            effectStrength = stateData.effectStrength;
            effectStrengthInput.value = effectStrength.toString();
            
            samplingMethod = stateData.samplingMethod;
            samplingMethodSelect.value = samplingMethod;
            
            samplingDirection = stateData.samplingDirection;
            samplingDirectionSelect.value = samplingDirection;
        }
        
        // Update the history buttons
        updateHistoryButtons();
        console.log('Canvas state restored successfully');
    } catch (error) {
        console.error('Error loading canvas state:', error);
        // On error, initialize with default state
        initCanvas();
    }
}

// Function to clear saved state
function clearSavedState() {
    localStorage.removeItem('savedCanvasState');
    localStorage.removeItem('savedStateData');
    localStorage.removeItem('savedOriginalImage');
    localStorage.removeItem('savedStateHistory');
    localStorage.removeItem('savedStateIndex');
}

function saveDrawing() {
    try {
        // Create a temporary canvas to combine background and drawing
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d')!;

        // Fill with background color
        tempCtx.fillStyle = '#ffffff'; // Default white color
        tempCtx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw the current canvas content
        tempCtx.drawImage(canvas, 0, 0);

        // Create a download link
        const link = document.createElement('a');
        
        // Generate timestamp for unique filename
        const date = new Date();
        const timestamp = date.toISOString().replace(/[:.]/g, '-');
        const filename = `drawing-${timestamp}.png`;

        // Convert canvas to blob
        tempCanvas.toBlob((blob) => {
            if (blob) {
                const url = URL.createObjectURL(blob);
                link.href = url;
                link.download = filename;
                
                // Programmatically click the link to trigger download
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                // Clean up the URL object
                setTimeout(() => URL.revokeObjectURL(url), 100);
            }
        }, 'image/png');

    } catch (error) {
        console.error('Error saving drawing:', error);
        alert('Failed to save the drawing. Please try again.');
    }
}

function drawPromptText(targetCtx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    targetCtx.save();
    targetCtx.clearRect(0, 0, canvas.width, canvas.height);
    targetCtx.fillStyle = '#666666';
    targetCtx.font = '24px Arial';
    targetCtx.textAlign = 'center';
    targetCtx.textBaseline = 'middle';
    targetCtx.fillText('Please upload the image first', canvas.width / 2, canvas.height / 2);
    targetCtx.restore();
}

function initCanvas() {
    // Set initial canvas size
    const initialDimensions = calculateCanvasDimensions(800, 600); // Default size
    resizeCanvases(initialDimensions.width, initialDimensions.height);
    
    // Draw prompt text
    drawPromptText(ctx, canvas);
    drawPromptText(visualizationCtx, imageVisualization);
}

saveDrawingButton.addEventListener('click', saveDrawing);

// Event listeners for page unload and load
window.addEventListener('beforeunload', () => {
    saveCanvasToLocalStorage();
});

window.addEventListener('load', async () => {
    initCanvas();
    await loadCanvasFromLocalStorage();
});

interface HelpButtonConfig {
    buttonId: string;
    url: string;
    openInNewTab?: boolean;
}

class HelpButton {
    private button: HTMLElement | null;
    private config: HelpButtonConfig;

    constructor(config: HelpButtonConfig) {
        this.config = {
            openInNewTab: true,
            ...config
        };
        this.button = document.getElementById(this.config.buttonId);
        this.init();
    }

    private init(): void {
        if (!this.button) {
            console.error(`Button with id "${this.config.buttonId}" not found`);
            return;
        }

        this.button.addEventListener('click', this.handleClick.bind(this));
    }

    private handleClick(event: Event): void {
        event.preventDefault();
        
        if (this.config.openInNewTab) {
            window.open(this.config.url, '_blank', 'noopener noreferrer');
        } else {
            window.location.href = this.config.url;
        }
    }

    // Public method to update URL if needed
    public updateUrl(newUrl: string): void {
        this.config.url = newUrl;
    }
}

// Initialize the button
const helpButton = new HelpButton({
    buttonId: 'helpButton',
    url: 'https://github.com/davidchocholaty/Pic2Paint#usage'
});

function updateDirectionSelectVisibility() {
    const method = samplingMethodSelect.value;
    if (method === 'normal' || method === 'random') {
        samplingDirectionSelect.disabled = true;
        samplingDirectionSelect.style.opacity = '0.5';
    } else {
        samplingDirectionSelect.disabled = false;
        samplingDirectionSelect.style.opacity = '1';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateDirectionSelectVisibility();
});
