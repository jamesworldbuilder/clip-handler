// imports core dependencies and initialization functions
import { video } from './dom-elements.js'
import { initTransport } from './transport-controls.js'
import { initCanvas, addTextObject, addShapeObject, addImageObject, confirmSelection, syncCanvasToVideo, applyLetterbox, setCropRatio, applyCrop } from './canvas-engine.js'
import { initSidebarBindings, switchTab } from './sidebar-ui.js'
import { activeNode, appLayers } from './state-manager.js'

// pings backend continuously to maintain server process
setInterval(() => {
    fetch('/heartbeat', { method: 'POST' }).catch(() => {})
}, 2000)

document.getElementById('add-text-btn').addEventListener('click', addTextObject)
document.getElementById('add-image-btn').addEventListener('click', addImageObject)
document.getElementById('add-box-btn').addEventListener('click', addShapeObject)
document.getElementById('confirm-text-btn').addEventListener('click', confirmSelection)
document.getElementById('confirm-shape-btn').addEventListener('click', confirmSelection)
document.getElementById('confirm-image-btn').addEventListener('click', confirmSelection)

document.getElementById('process-tracking-btn').addEventListener('click', () => {
    if (!activeNode) return
    
    fetch('/process-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            name: activeNode.name(),
            x: activeNode.x(),
            y: activeNode.y(),
            width: activeNode.width() * activeNode.scaleX(),
            height: activeNode.height() * activeNode.scaleY()
        })
    })
    .then(res => res.json())
    .then(data => alert(`Tracking status: ${data.status}`))
    .catch(err => console.error(err))
})

// handles local video file loading
const loadVideoBtn = document.getElementById('load-video-btn')
const localFileInput = document.getElementById('local-file-input')

if (loadVideoBtn && localFileInput) {
    loadVideoBtn.addEventListener('click', () => {
        localFileInput.click()
    })

    localFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0]
        if (!file) return

        const fileURL = URL.createObjectURL(file)
        video.src = fileURL
        video.load()

        video.currentTime = 0
        document.getElementById('play-pause-btn').innerText = 'Play'

        video.addEventListener('loadedmetadata', () => {
            if (typeof syncCanvasToVideo === 'function') {
                syncCanvasToVideo()
            }
        }, { once: true })
    })
}

// manages letterboxing ui controls and canvas rendering updates
const btnHorizontal = document.getElementById('add-horizontal-bars')
const btnVertical = document.getElementById('add-vertical-bars')
const sliderThickness = document.getElementById('letterbox-thickness')
const thicknessVal = document.getElementById('letterbox-thickness-val')
const inputColor = document.getElementById('letterbox-color')
const controlsWrap = document.getElementById('letterbox-controls')
const btnClear = document.getElementById('clear-letterbox-btn')
const btnApplyLetterbox = document.getElementById('apply-letterbox-btn')
const btnEditLetterbox = document.getElementById('edit-letterbox-btn')

let activeLetterboxType = 'none'

// UI Lock State Management (Mutual Exclusivity)
function toggleCropUI(enabled) {
    const ratioBtns = document.querySelectorAll('.ratio-btn')
    ratioBtns.forEach(btn => {
        btn.style.opacity = enabled ? '1' : '0.3'
        btn.style.pointerEvents = enabled ? 'auto' : 'none'
    })
}

function toggleLetterboxUI(enabled) {
    const elements = [btnHorizontal, btnVertical, btnEditLetterbox, btnClear, inputColor]
    elements.forEach(el => {
        if(el) {
            el.style.opacity = enabled ? '1' : '0.3'
            el.style.pointerEvents = enabled ? 'auto' : 'none'
        }
    })
}

// resets letterboxing state and hides ui controls
function resetLetterboxing() {
    activeLetterboxType = 'none'
    if (btnHorizontal) btnHorizontal.style.backgroundColor = '#34495e'
    if (btnVertical) btnVertical.style.backgroundColor = '#34495e'
    if (controlsWrap) controlsWrap.style.display = 'none'
    if (btnClear) btnClear.style.display = 'none'
    if (btnApplyLetterbox) btnApplyLetterbox.style.display = 'none'
    if (btnEditLetterbox) btnEditLetterbox.style.display = 'none'
    if (typeof applyLetterbox === 'function') applyLetterbox('none', 10, '#000000')
    
    // unlocks crop buttons
    toggleCropUI(true)
}

// applies current values to canvas rendering engine
function triggerLetterboxUpdate() {
    if (activeLetterboxType === 'none') return
    applyLetterbox(activeLetterboxType, sliderThickness.value, inputColor.value)
}

// reveals active slider controls and hides edit button
function enterLetterboxEditMode(type) {
    activeLetterboxType = type
    if (type === 'horizontal') {
        btnHorizontal.style.backgroundColor = '#00a8ff'
        btnVertical.style.backgroundColor = '#34495e'
    } else {
        btnVertical.style.backgroundColor = '#00a8ff'
        btnHorizontal.style.backgroundColor = '#34495e'
    }
    controlsWrap.style.display = 'flex'
    btnClear.style.display = 'block'
    btnApplyLetterbox.style.display = 'block'
    btnEditLetterbox.style.display = 'none'
    triggerLetterboxUpdate()
    
    // locks out crop buttons
    toggleCropUI(false)
}

if (btnHorizontal && btnVertical) {
    btnHorizontal.addEventListener('click', () => enterLetterboxEditMode('horizontal'))
    btnVertical.addEventListener('click', () => enterLetterboxEditMode('vertical'))

    btnApplyLetterbox.addEventListener('click', () => {
        controlsWrap.style.display = 'none'
        btnClear.style.display = 'none'
        btnApplyLetterbox.style.display = 'none'
        btnEditLetterbox.style.display = 'block'
        
        // unlocks crop buttons once letterboxing is finalized
        toggleCropUI(true)
    })

    btnEditLetterbox.addEventListener('click', () => {
        enterLetterboxEditMode(activeLetterboxType)
    })

    sliderThickness.addEventListener('input', (e) => {
        thicknessVal.innerText = `${e.target.value}%`
        triggerLetterboxUpdate()
    })

    inputColor.addEventListener('input', triggerLetterboxUpdate)

    // binds reset logic to removal button
    btnClear.addEventListener('click', resetLetterboxing)
}

// binds preview logic to aspect ratio buttons
const ratioBtns = document.querySelectorAll('.ratio-btn')
if (ratioBtns.length > 0) {
    ratioBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // locks out letterbox UI during crop edit
            toggleLetterboxUI(false)
            
            // resets ratio button styling
            ratioBtns.forEach(b => b.style.backgroundColor = '#34495e')
            // sets active button color
            e.target.style.backgroundColor = '#00a8ff'
            
            // reveals crop confirmation button
            const confirmCropBtn = document.getElementById('confirm-crop-btn')
            if (confirmCropBtn) confirmCropBtn.style.display = 'block'
            
            // extracts ratio string (e.g., "16/9") and converts it to a decimal
            const ratioStr = e.target.getAttribute('data-ratio')
            const [w, h] = ratioStr.split('/')
            const numRatio = parseInt(w) / parseInt(h)
            
            // updates global crop state and forces a preview recalculation
            if (typeof setCropRatio === 'function') {
                setCropRatio(numRatio)
            }
        })
    })
}

// confirms and applies physical crop dimensions
const confirmCropBtn = document.getElementById('confirm-crop-btn')
if (confirmCropBtn) {
    confirmCropBtn.addEventListener('click', (e) => {
        if (typeof applyCrop === 'function') {
            applyCrop()
        }
        e.target.style.display = 'none'
        
        // unlocks letterbox UI once crop is applied
        toggleLetterboxUI(true)
    })
}

// evaluates object timestamps against current video playback time to adjust visibility
function syncObjectVisibility() {
    const currentTime = video.currentTime
    
    appLayers.forEach(layer => {
        if (layer.type === 'base') return
        
        layer.objects.forEach(obj => {
            const isWithinInterval = currentTime >= obj.startTime && currentTime <= obj.endTime
            
            // overrides playback visibility if manual toggle is disengaged
            if (obj.visible) {
                obj.node.opacity(isWithinInterval ? 1 : 0)
            }
        })
    })
}

// binds synchronization check to native html video time updates
video.addEventListener('timeupdate', syncObjectVisibility)

window.switchTab = switchTab

// cross browser resize observer
// triggers canvas sync on physical dimension changes
const resizeObserver = new ResizeObserver(() => {
    if (typeof syncCanvasToVideo === 'function') {
        syncCanvasToVideo()
    }
})

const vidWrapper = document.getElementById('video-wrapper')
if (vidWrapper) {
    resizeObserver.observe(vidWrapper)
}
video.addEventListener('loadedmetadata', syncCanvasToVideo)

function initApp() {
    if (window.appInitialized) return
    window.appInitialized = true
    
    // defers initialization slightly to ensure css dimensions are rendered
    setTimeout(() => {
        initCanvas()
        initTransport()
        initSidebarBindings()
    }, 100)
}

// guarantees metadata and frame data exist before execution
if (video.readyState >= 3) {
    initApp()
} else {
    video.addEventListener('canplay', initApp)
}
