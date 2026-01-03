const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const generateBtn = document.getElementById('generateBtn');
const info = document.getElementById('info');
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const preview = document.getElementById('preview');
const resultImage = document.getElementById('resultImage');
const downloadBtn = document.getElementById('downloadBtn');

let gifData = null;

uploadArea.onclick = () => fileInput.click();

uploadArea.ondragover = (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
};

uploadArea.ondragleave = () => uploadArea.classList.remove('dragover');

uploadArea.ondrop = (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
    }
};

fileInput.onchange = (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
};

async function handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.gif')) {
        showError('Please upload a GIF file');
        return;
    }

    try {
        const buffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(buffer);
        gifData = new GifReader(uint8Array);
        
        info.style.display = 'block';
        info.textContent = `✓ Loaded: ${file.name} (${gifData.numFrames()} frames)`;
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate Sprite Sheet';
        error.style.display = 'none';
        preview.style.display = 'none';
    } catch (e) {
        showError('Failed to parse GIF: ' + e.message);
    }
}

generateBtn.onclick = generateSpriteSheet;

function showError(msg) {
    error.textContent = msg;
    error.style.display = 'block';
    info.style.display = 'none';
    loading.style.display = 'none';
}

function findOptimalLayout(numFrames, frameAspect) {
    let bestCols = 1;
    let minDiff = Infinity;
    
    for (let cols = 1; cols <= numFrames; cols++) {
        const rows = Math.ceil(numFrames / cols);
        const cellAspect = rows / cols;
        const diff = Math.abs(cellAspect - frameAspect);
        
        if (diff < minDiff) {
            minDiff = diff;
            bestCols = cols;
        }
    }
    
    return { cols: bestCols, rows: Math.ceil(numFrames / bestCols) };
}

function generateSpriteSheet() {
    if (!gifData) return;

    loading.style.display = 'block';
    error.style.display = 'none';
    preview.style.display = 'none';

    // Use setTimeout to allow UI to update before heavy processing
    setTimeout(() => {
        try {
            const canvasSize = parseInt(document.getElementById('canvasSize').value);
            const columnsInput = document.getElementById('columns').value;
            const skipFrames = parseInt(document.getElementById('skipFrames').value);
            const keepAspect = document.getElementById('keepAspect').checked;
            const pixelPerfect = document.getElementById('pixelPerfect').checked;
            const bgColor = document.getElementById('background').value;

            const totalFrames = gifData.numFrames();
            const frameWidth = gifData.width;
            const frameHeight = gifData.height;
            
            // Extract frames with proper accumulation for transparency
            const frames = [];
            const accumCanvas = document.createElement('canvas');
            accumCanvas.width = frameWidth;
            accumCanvas.height = frameHeight;
            const accumCtx = accumCanvas.getContext('2d');
            
            // Set background based on global color table or transparent
            const globalColorTable = gifData.globalColorTable;
            const bgColorIndex = gifData.bgColor;
            if (globalColorTable && bgColorIndex !== undefined) {
                const r = globalColorTable[bgColorIndex * 3];
                const g = globalColorTable[bgColorIndex * 3 + 1];
                const b = globalColorTable[bgColorIndex * 3 + 2];
                accumCtx.fillStyle = `rgb(${r},${g},${b})`;
                accumCtx.fillRect(0, 0, frameWidth, frameHeight);
            }
            
            let previousImageData = null;
            
            for (let i = 0; i < totalFrames; i++) {
                const frameInfo = gifData.frameInfo(i);
                
                // Handle disposal method BEFORE drawing new frame
                if (i > 0 && previousImageData) {
                    if (frameInfo.disposal === 2) {
                        // Restore to background color
                        accumCtx.clearRect(0, 0, frameWidth, frameHeight);
                        if (globalColorTable && bgColorIndex !== undefined) {
                            const r = globalColorTable[bgColorIndex * 3];
                            const g = globalColorTable[bgColorIndex * 3 + 1];
                            const b = globalColorTable[bgColorIndex * 3 + 2];
                            accumCtx.fillStyle = `rgb(${r},${g},${b})`;
                            accumCtx.fillRect(0, 0, frameWidth, frameHeight);
                        }
                    } else if (frameInfo.disposal === 3) {
                        // Restore to previous
                        accumCtx.putImageData(previousImageData, 0, 0);
                    }
                    // disposal 0 or 1: leave as is (do nothing)
                }
                
                // Save state before drawing (for disposal method 3)
                if (frameInfo.disposal === 3) {
                    previousImageData = accumCtx.getImageData(0, 0, frameWidth, frameHeight);
                }
                
                // Decode current frame
                const pixels = new Uint8Array(frameWidth * frameHeight * 4);
                gifData.decodeAndBlitFrameRGBA(i, pixels);
                
                // Create image data for this frame
                const frameImageData = accumCtx.createImageData(frameWidth, frameHeight);
                frameImageData.data.set(pixels);
                
                // Composite frame over accumulation canvas
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = frameWidth;
                tempCanvas.height = frameHeight;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.putImageData(frameImageData, 0, 0);
                
                // Draw with proper compositing
                accumCtx.drawImage(tempCanvas, 0, 0);
                
                if (i % (skipFrames + 1) === 0) {
                    // Save accumulated frame
                    const finalPixels = accumCtx.getImageData(0, 0, frameWidth, frameHeight).data;
                    frames.push({ pixels: new Uint8Array(finalPixels), info: frameInfo });
                }
            }

            const numFrames = frames.length;
            if (numFrames === 0) {
                showError('No frames after filtering!');
                return;
            }

            const frameAspect = frameWidth / frameHeight;

            // Determine grid layout
            let cols, rows;
            if (columnsInput) {
                cols = parseInt(columnsInput);
                rows = Math.ceil(numFrames / cols);
            } else if (keepAspect) {
                ({ cols, rows } = findOptimalLayout(numFrames, frameAspect));
            } else {
                cols = Math.ceil(Math.sqrt(numFrames));
                rows = Math.ceil(numFrames / cols);
            }

            const mode = keepAspect ? "Option 2 (Keep Aspect / Fill & Crop)" : "Option 1 (Default / Full Stretch)";
            info.textContent = `${mode} | Grid: ${cols} cols × ${rows} rows | Frames: ${numFrames}`;
            info.style.display = 'block';

            // Create output canvas
            const canvas = document.createElement('canvas');
            canvas.width = canvasSize;
            canvas.height = canvasSize;
            const ctx = canvas.getContext('2d');

            // Set background
            if (bgColor !== 'transparent') {
                ctx.fillStyle = bgColor;
                ctx.fillRect(0, 0, canvasSize, canvasSize);
            }

            const stepW = canvasSize / cols;
            const stepH = canvasSize / rows;

            // Create temporary canvas for frame rendering
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = frameWidth;
            tempCanvas.height = frameHeight;
            const tempCtx = tempCanvas.getContext('2d');
            
            // Set image smoothing based on user preference
            if (pixelPerfect) {
                ctx.imageSmoothingEnabled = false;
            } else {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
            }

            // Draw each frame
            frames.forEach((frame, idx) => {
                const row = Math.floor(idx / cols);
                const col = idx % cols;

                const xStart = Math.round(col * stepW);
                const yStart = Math.round(row * stepH);
                const xEnd = Math.round((col + 1) * stepW);
                const yEnd = Math.round((row + 1) * stepH);

                const cellW = xEnd - xStart;
                const cellH = yEnd - yStart;

                // Render frame to temp canvas
                const imageData = tempCtx.createImageData(frameWidth, frameHeight);
                imageData.data.set(frame.pixels);
                tempCtx.putImageData(imageData, 0, 0);

                if (keepAspect) {
                    const fRatio = frameWidth / frameHeight;
                    const cRatio = cellW / cellH;

                    let newW, newH;
                    if (fRatio > cRatio) {
                        newH = cellH;
                        newW = Math.round(newH * fRatio);
                    } else {
                        newW = cellW;
                        newH = Math.round(newW / fRatio);
                    }

                    const offsetX = Math.floor((newW - cellW) / 2);
                    const offsetY = Math.floor((newH - cellH) / 2);

                    // Draw scaled and clipped to cell
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(xStart, yStart, cellW, cellH);
                    ctx.clip();
                    ctx.drawImage(tempCanvas, xStart - offsetX, yStart - offsetY, newW, newH);
                    ctx.restore();
                } else {
                    // Stretch to fill cell
                    ctx.drawImage(tempCanvas, xStart, yStart, cellW, cellH);
                }
            });

            // Display result
            resultImage.src = canvas.toDataURL('image/png');
            preview.style.display = 'block';
            loading.style.display = 'none';
            
            downloadBtn.onclick = () => {
                const link = document.createElement('a');
                link.download = 'sprite-sheet.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            };

        } catch (e) {
            showError('Failed to process GIF: ' + e.message);
            console.error(e);
        }
    }, 100);
}
