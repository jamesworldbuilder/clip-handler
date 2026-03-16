// imports core dependencies and initialization functions
import { video } from './dom-elements.js'
import { initTransport } from './transport-controls.js'
import { initCanvas, addTextObject, addShapeObject, addImageObject, confirmSelection } from './canvas-engine.js'
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
