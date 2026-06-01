import { video } from './dom-elements.js'
import { initTransport } from './transport-controls.js'
import { initCanvas, addTextObject, addShapeObject, addImageObject, addBasicShapeObject, addFilterObject, confirmSelection, syncCanvasToVideo, applyLetterbox, setCropRatio, applyCrop } from './canvas-engine.js'
import { initSidebarBindings, switchTab, initMarqueeSystem } from './sidebar-ui.js'
import { renderMultiTrackTimeline } from './timeline-ui.js'
import { activeNode, appLayers } from './state-manager.js'

// pings backend continuously to maintain server process
setInterval(() => {
    fetch('/heartbeat', { method: 'POST' }).catch(() => {})
}, 2000)

document.getElementById('add-text-btn').addEventListener('click', addTextObject)
document.getElementById('add-shape-btn').addEventListener('click', addBasicShapeObject)

const localImgInput = document.getElementById('local-image-input')

// binds image upload button to hidden file input
document.getElementById('add-image-btn').addEventListener('click', () => {
    if (localImgInput) localImgInput.click()
})

if (localImgInput) {
    localImgInput.addEventListener('change', (e) => {
        const file = e.target.files[0]
        if (!file) return
        addImageObject(URL.createObjectURL(file))
        e.target.value = ''
    })
}

document.getElementById('add-box-btn').addEventListener('click', addShapeObject)
document.getElementById('add-filter-btn').addEventListener('click', addFilterObject)
document.getElementById('confirm-text-btn').addEventListener('click', confirmSelection)
document.getElementById('confirm-image-btn').addEventListener('click', confirmSelection)
document.getElementById('confirm-filter-btn').addEventListener('click', confirmSelection)

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
const editCropBtn = document.getElementById('edit-crop-btn')

if (confirmCropBtn) {
    confirmCropBtn.addEventListener('click', (e) => {
        e.target.style.display = 'none'
        toggleLetterboxUI(true)
    })
}

if (editCropBtn) {
    editCropBtn.addEventListener('click', () => {
        toggleLetterboxUI(false)
    })
}

// helpers for superscript conversion and fetching dynamic track list
function getSuperscript(num) {
    const superscripts = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']
    return num.toString().split('').map(d => superscripts[parseInt(d)]).join('')
}

function getLoopableTracks() {
    let tracks = []
    appLayers.forEach(layer => {
        if (layer.type === 'base') return
        const reversedObjects = [...layer.objects].reverse()
        reversedObjects.forEach(obj => {
            tracks.push(obj)
        })
    })
    return tracks
}

// initializes global state for video looping behavior
window.loopMode = 'none'
window.loopTrackIndex = -1

const loopBtn = document.getElementById('loop-toggle-btn')
if (loopBtn) {
    loopBtn.addEventListener('click', () => {
        const tracks = getLoopableTracks()
        
        if (window.loopMode === 'none') {
            window.loopMode = 'all'
            loopBtn.innerText = 'LOOP'
            loopBtn.title = 'Loop: Entire Video'
            loopBtn.style.opacity = '1'
        } else if (window.loopMode === 'all') {
            if (tracks.length > 0) {
                window.loopMode = 'track'
                window.loopTrackIndex = 0
                const trackNumStr = getSuperscript(1)
                loopBtn.innerText = `LOOP${trackNumStr}`
                loopBtn.title = `Loop: Track Block 1 (${tracks[0].name})`
            } else {
                window.loopMode = 'none'
                loopBtn.innerText = 'LOOP'
                loopBtn.title = 'Loop: OFF'
                loopBtn.style.opacity = '0.5'
            }
        } else if (window.loopMode === 'track') {
            window.loopTrackIndex++
            if (window.loopTrackIndex >= tracks.length) {
                window.loopMode = 'none'
                window.loopTrackIndex = -1
                loopBtn.innerText = 'LOOP'
                loopBtn.title = 'Loop: OFF'
                loopBtn.style.opacity = '0.5'
            } else {
                const trackNumStr = getSuperscript(window.loopTrackIndex + 1)
                loopBtn.innerText = `LOOP${trackNumStr}`
                loopBtn.title = `Loop: Track Block ${window.loopTrackIndex + 1} (${tracks[window.loopTrackIndex].name})`
            }
        }

        // redraws timeline immediately to apply dynamic border highlighting
        if (typeof renderMultiTrackTimeline === 'function') {
            renderMultiTrackTimeline()
        }
    })
}

// intercepts native video end events to restart playback
video.addEventListener('ended', () => {
    if (window.loopMode === 'all') {
        video.currentTime = 0
        video.play()
    } else if (window.loopMode === 'track') {
        const tracks = getLoopableTracks()
        const activeTrack = tracks[window.loopTrackIndex]
        if (activeTrack) {
            video.currentTime = activeTrack.startTime
            video.play()
        }
    }
})

function syncObjectVisibility() {
    // halts rendering updates during frame extraction to prevent thread lockups
    if (window.isProcessingTracking) return
    const currentTime = video.currentTime
    let activeFilters = [], dofActive = false, dofConfig = null

    appLayers.forEach(layer => {
        layer.objects.forEach(obj => {
            // skips this object if it was just deleted
            if (!obj.node) return 

            const isWithinInterval = currentTime >= obj.startTime && currentTime <= obj.endTime

            if (obj.visible && layer.visible) {
                
                let isNodeVisible = isWithinInterval
                
                // Prevents the render loop from revealing the Konva node before the HTML target is confirmed
                if (layer.type === 'tracking') {
                    if (!obj.node.getAttr('trackingId')) {
                        isNodeVisible = false
                    } else {
                        // Hides the target box outside of the Tracking tab unless explicitly following it
                        const shapesTab = document.getElementById('shapes-tab')
                        const isTrackingTabActive = shapesTab && shapesTab.classList.contains('active')
                        
                        let isFollowModeActive = false
                        if (typeof activeNode !== 'undefined' && activeNode) {
                            if (activeNode.getAttr('followMode') === 'tracked') {
                                isFollowModeActive = true
                            }
                        }
                        
                        const showBoxToggle = document.getElementById('show-track-box-toggle')
                        const forceShowBox = showBoxToggle ? showBoxToggle.checked : true
                        
                        if (!isTrackingTabActive && !isFollowModeActive && !forceShowBox) {
                            isNodeVisible = false
                        } else if (!isTrackingTabActive && !forceShowBox) {
                            isNodeVisible = false
                        }

                        // Ensures the center dot is rendered and matches the border color
                        let centerDot = obj.node.findOne('.target-center-dot')
                        const rect = obj.node.findOne('.target-rect')
                        if (!centerDot && rect) {
                            centerDot = new Konva.Circle({
                                name: 'target-center-dot',
                                radius: 2.5,
                                fill: rect.stroke() || '#f1c40f',
                                listening: false
                            })
                            obj.node.add(centerDot)
                        }
                        if (centerDot && rect) {
                            centerDot.x(rect.width() / 2)
                            centerDot.y(rect.height() / 2)
                            centerDot.fill(rect.stroke() || '#f1c40f')
                        }
                    }
                }
                
                let targetOpacity = isNodeVisible ? 1 : 0
                
                // dims text image and shape objects during anchor editing to provide focus to tracking box
                if (window.isEditingAnchor && isNodeVisible) {
                    if (layer.type === 'text' || layer.type === 'image' || layer.type === 'shape') {
                        targetOpacity = 0.5
                        // strictly disables pointer events on these objects to let reticle drag through
                        if (obj.node.listening()) obj.node.listening(false)
                    }
                } else if (!obj.locked && !layer.locked) {
                    // restores default listening state when not actively editing anchor
                    if (!obj.node.listening()) obj.node.listening(true)
                }
                
                obj.node.opacity(targetOpacity)
                
                // triggers dynamic tracking playback sync
                if (layer.type === 'tracking' && isWithinInterval) {
                    const trackData = obj.node.getAttr('trackingData')
                    const centerDataArray = obj.node.getAttr('centerPoints')
                    
                    if (trackData) {
                        const fps = obj.node.getAttr('trackingFps') || 30
                        const tStart = obj.node.getAttr('trackingStartTime') || obj.startTime
                        
                        // calculates matching frame index for current video timestamp
                        const frameIndex = Math.max(0, Math.floor((currentTime - tStart) * fps))
                        const frameData = trackData[frameIndex] || trackData[trackData.length - 1]
                        
                        // retrieves precalculated center points for the current frame
                        const centerData = centerDataArray ? (centerDataArray[frameIndex] || centerDataArray[centerDataArray.length - 1]) : null
                        
                        if (frameData && !frameData.lost) {
                            // Recalculates scale based on physical video dimensions independent of canvas crop
                            const videoRatio = video.videoWidth / video.videoHeight
                            const elementRatio = video.clientWidth / video.clientHeight
                            
                            let baseRenderWidth = video.clientWidth
                            let baseRenderHeight = video.clientHeight
                            
                            if (elementRatio > videoRatio) {
                                baseRenderHeight = video.clientHeight
                                baseRenderWidth = baseRenderHeight * videoRatio
                            } else {
                                baseRenderWidth = video.clientWidth
                                baseRenderHeight = baseRenderWidth / videoRatio
                            }

                            const vidOffsetX = (video.clientWidth - baseRenderWidth) / 2
                            const vidOffsetY = (video.clientHeight - baseRenderHeight) / 2
                            const vidScaleX = baseRenderWidth / video.videoWidth
                            const vidScaleY = baseRenderHeight / video.videoHeight
                            
                            const canvasCont = document.getElementById('canvas-container')
                            const offsetX = parseFloat(canvasCont.style.left) || 0
                            const offsetY = parseFloat(canvasCont.style.top) || 0

                            // Maps raw AI coordinates relative to the shifted Konva stage offset
                            const scaledX = (frameData.x * vidScaleX) + vidOffsetX - offsetX
                            const scaledY = (frameData.y * vidScaleY) + vidOffsetY - offsetY
                            const scaledW = frameData.w * vidScaleX
                            const scaledH = frameData.h * vidScaleY
                            
                            // updates konva object rendering coordinates (accounts for centered pivot)
                            obj.node.x(scaledX + obj.node.offsetX())
                            obj.node.y(scaledY + obj.node.offsetY())
                            
                            const rect = obj.node.findOne('.target-rect')
                            if (rect) {
                                rect.width(scaledW)
                                rect.height(scaledH)
                            }
                            
                            // explicitly maps reticle to custom anchor or optical flow data
                            const reticle = obj.node.findOne('.target-reticle')
                            // ignores render loop if reticle is dragging
                            if (reticle && !reticle.isDragging()) {
                                let flowData = obj.node.getAttr('anchorFlowData')
                                let aX = obj.node.getAttr('anchorX') ?? 0.5
                                let aY = obj.node.getAttr('anchorY') ?? 0.5
                                
                                if (activeNode && activeNode.getAttr('followMode') === 'tracked' && activeNode.getAttr('followTargetId') === obj.id) {
                                    flowData = activeNode.getAttr('anchorFlowData')
                                    aX = activeNode.getAttr('targetAnchorX') ?? 0.5
                                    aY = activeNode.getAttr('targetAnchorY') ?? 0.5
                                }
                                
                                if (flowData && flowData[frameIndex]) {
                                    aX = (flowData[frameIndex].x - frameData.x) / frameData.w
                                    aY = (flowData[frameIndex].y - frameData.y) / frameData.h
                                }
                                
                                reticle.x(scaledW * aX)
                                reticle.y(scaledH * aY)
                            }
                            
                            // populates tracking properties panel values
                            if (activeNode && activeNode === obj.node) {
                                const propX = document.getElementById('track-prop-x')
                                const propY = document.getElementById('track-prop-y')
                                const propW = document.getElementById('track-prop-w')
                                const propH = document.getElementById('track-prop-h')
                                const propCx = document.getElementById('track-prop-cx')
                                const propCy = document.getElementById('track-prop-cy')
                                const identCenter = document.getElementById('ident-center')
                                
                                if (propX) propX.value = Math.round(scaledX)
                                if (propY) propY.value = Math.round(scaledY)
                                if (propW) propW.value = Math.round(scaledW)
                                if (propH) propH.value = Math.round(scaledH)
                                
                                // calculates UI display coordinates based on canvas scale to prevent drifting
                                const displayCx = Math.round(scaledX + (scaledW / 2))
                                const displayCy = Math.round(scaledY + (scaledH / 2))

                                if (propCx) propCx.value = displayCx
                                if (propCy) propCy.value = displayCy
                                
                                if (identCenter) identCenter.innerText = `${displayCx}, ${displayCy}`
                            }
                        } else {
                            // hides target box if tracker loses object visibility
                            obj.node.opacity(0)
                        }
                    }
                }

                // dynamically maps caption group text array to playback interval segments
                if (layer.type === 'text' && isWithinInterval) {
                    const capList = obj.node.getAttr('captionsList')
                    if (capList && capList.length > 0) {
                        const duration = obj.endTime - obj.startTime
                        let capIdx = 0
                        if (duration > 0) {
                            const elapsed = currentTime - obj.startTime
                            const pct = elapsed / duration
                            
                            // Finds the active caption based on the custom dragged marker percentages
                            let timings = obj.node.getAttr('captionTimings') || capList.map((_, i) => i / capList.length)
                            for (let i = timings.length - 1; i >= 0; i--) {
                                if (pct >= timings[i]) {
                                    capIdx = i
                                    break
                                }
                            }
                        }
                        
                        const innerText = obj.node.findOne('.inner-text')
                        const renderedCapIdx = obj.node.getAttr('renderedCapIdx')
                        
                        // Validates synchronization against index cache AND active string data
                        if (innerText && (renderedCapIdx !== capIdx || innerText.text() !== capList[capIdx])) {
                            
                            obj.node.setAttr('renderedCapIdx', capIdx)
                            const customW = innerText.width() // Save current active width before measuring
                            
                            // Clears fixed boundaries temporarily so Konva can natively measure the true string length
                            innerText.width(null)
                            innerText.height(null)
                            innerText.text(capList[capIdx])
                            
                            const tightW = innerText.width()
                            const tightH = innerText.height()
                            
                            // Dynamically applies the specific row's properties (color, font, stroke, shadow, size, POSITION) to the canvas!
                            const captionStyles = obj.node.getAttr('captionStyles')
                            if (captionStyles && captionStyles[capIdx]) {
                                const st = captionStyles[capIdx]
                                if (st.text) innerText.setAttrs(st.text)
                                if (st.group) obj.node.setAttrs(st.group)
                                const bgRect = obj.node.findOne('.text-bg') || obj.node.findOne('.bg-rect') || obj.node.findOne('Rect')
                                if (st.bg && bgRect) bgRect.setAttrs(st.bg)
                            }
                            
                            // Validates bounds to ensure alignment and wrapping doesn't break
                            let finalW = innerText.width()
                            if (!finalW || finalW < tightW) finalW = tightW
                            
                            // In case group position wasn't saved yet, ensure it has dimensions to prevent invisible hitboxes
                            if (!captionStyles || !captionStyles[capIdx] || !captionStyles[capIdx].group) {
                                obj.node.width(finalW)
                                obj.node.height(tightH)
                                obj.node.offsetX(finalW / 2)
                                obj.node.offsetY(tightH / 2)
                            }
                            
                            // Locks the measured bounds back onto the inner text so scaling works safely
                            innerText.width(finalW)

                            const bgRect = obj.node.findOne('.text-bg') || obj.node.findOne('.bg-rect') || obj.node.findOne('Rect')
                            if (bgRect) {
                                bgRect.width(finalW)
                                bgRect.height(tightH)
                            }

                            // Forces the transformer boundary box to instantly snap to the new size if selected
                            if (typeof transformer !== 'undefined' && transformer.nodes()[0] === obj.node) {
                                transformer.forceUpdate()
                            }
                            
                            const ret = obj.node.findOne('.dof-static-reticle')
                            if (ret) {
                                ret.x(finalW / 2)
                                ret.y(tightH / 2)
                            }
                            
                            // sync UI text box if this is the active node being edited
                            const editTextInput = document.getElementById('edit-text-value')
                            if (editTextInput && typeof activeNode !== 'undefined' && activeNode === obj.node) {
                                editTextInput.value = capList[capIdx]
                                
                                // perfectly syncs the unified object name input to match the active playback caption
                                const editObjName = document.getElementById('edit-object-name')
                                if (editObjName) editObjName.value = capList[capIdx]

                                // Signals the sidebar to instantly pull the new physical properties so user edits hit the right row!
                                document.dispatchEvent(new CustomEvent('captionPlaybackSync', { detail: { capIdx: capIdx } }))
                            }
                        }
                    }
                }

                // syncs text and image objects to tracked target anchor and updates coordinates seamlessly
                if ((layer.type === 'text' || layer.type === 'image') && isWithinInterval) {
                    const fMode = obj.node.getAttr('followMode') || 'static'
                    const tId = obj.node.getAttr('followTargetId')
                    
                    if (tId && tId !== 'none') {
                        let trackObj = null
                        appLayers.forEach(l => { 
                            if (l.type === 'tracking') { 
                                const found = l.objects.find(o => o.id == tId)
                                if (found) trackObj = found 
                            } 
                        })
                        
                        if (trackObj && trackObj.node) {
                            const rect = trackObj.node.findOne('.target-rect')
                            if (rect) {
                                const flowData = obj.node.getAttr('anchorFlowData')
                                let aX = obj.node.getAttr('targetAnchorX') ?? 0.5
                                let aY = obj.node.getAttr('targetAnchorY') ?? 0.5
                                
                                const fps = trackObj.node.getAttr('trackingFps') || 30
                                const tStart = trackObj.node.getAttr('trackingStartTime') || trackObj.startTime
                                const frameIndex = Math.max(0, Math.floor((currentTime - tStart) * fps))
                                
                                if (flowData && flowData[frameIndex]) {
                                    const trackData = trackObj.node.getAttr('trackingData')
                                    const frameData = trackData ? trackData[frameIndex] : null
                                    if (frameData && !frameData.lost) {
                                        aX = (flowData[frameIndex].x - frameData.x) / frameData.w
                                        aY = (flowData[frameIndex].y - frameData.y) / frameData.h
                                    }
                                }
                                
                                // calculates physical anchor point offset by the target's centered origin
                                const anchorPxX = trackObj.node.x() - trackObj.node.offsetX() + (rect.width() * aX)
                                const anchorPxY = trackObj.node.y() - trackObj.node.offsetY() + (rect.height() * aY)

                                // physically snaps object to anchor only if tracked mode is active
                                if (fMode === 'tracked') {
                                    // accurately computes the physical center offset regardless of flips or rotations
                                    let dx = ((obj.node.width() / 2) - obj.node.offsetX()) * obj.node.scaleX()
                                    let dy = ((obj.node.height() / 2) - obj.node.offsetY()) * obj.node.scaleY()
                                    
                                    if (obj.node.getClassName() === 'Circle') {
                                        dx = -obj.node.offsetX() * obj.node.scaleX()
                                        dy = -obj.node.offsetY() * obj.node.scaleY()
                                    }
                                    
                                    if (!obj.node.isDragging()) {
                                        obj.node.x(anchorPxX - dx)
                                        obj.node.y(anchorPxY - dy)
                                    }
                                }
                                
                                // dynamically updates tracked UI coordinates continuously
                                if (typeof activeNode !== 'undefined' && activeNode && activeNode.id() === obj.node.id()) {
                                    const axUI = document.getElementById('follow-anchor-x')
                                    const ayUI = document.getElementById('follow-anchor-y')
                                    const txUI = document.getElementById('follow-val-x')
                                    const tyUI = document.getElementById('follow-val-y')
                                    
                                    const stageNode = obj.node.getStage()
                                    if (stageNode) {
                                        const cx = stageNode.width() / 2
                                        const cy = stageNode.height() / 2

                                        if (axUI) axUI.innerText = Math.round(anchorPxX - cx)
                                        if (ayUI) ayUI.innerText = Math.round(cy - anchorPxY)
                                        
                                        const targetCenterX = trackObj.node.x() - trackObj.node.offsetX() + (rect.width() / 2)
                                        const targetCenterY = trackObj.node.y() - trackObj.node.offsetY() + (rect.height() / 2)
                                        if (txUI) txUI.innerText = Math.round(targetCenterX - cx)
                                        if (tyUI) tyUI.innerText = Math.round(cy - targetCenterY)
                                    }

                                    const reticle = trackObj.node.findOne('.target-reticle')
                                    if (reticle) {
                                        reticle.moveToTop()
                                        if (!reticle.isDragging()) {
                                            reticle.x(rect.width() * aX)
                                            reticle.y(rect.height() * aY)
                                        }
                                        if (trackObj.node.getLayer()) trackObj.node.getLayer().batchDraw()
                                    }
                                }
                            }
                        }
                    }
                }

                // applies active filters
                if (layer.type === 'filter') {
                    const fType = obj.node.getAttr('filterType')
                    const reticle = obj.node.findOne('.dof-static-reticle')
                    
                    // always process reticle visibility independent of interval or drawing state locks
                    if (reticle) {
                        const fMode = obj.node.getAttr('followMode') || 'static'
                        const isActiveObj = (typeof activeNode !== 'undefined' && activeNode === obj.node)
                        
                        // green reticle should only be displayed when Static Position Tracking Mode is selected
                        reticle.visible(fType === 'depth-of-field' && isWithinInterval && isActiveObj && fMode === 'static')

                        if (reticle.visible()) {
                            reticle.moveToTop() // Forces green reticle to the highest Z-index
                            if (fMode === 'static') {
                                // Locks the render loop from resetting position while user is physically dragging
                                if (!reticle.isDragging()) {
                                    const pctX = obj.node.getAttr('followX') ?? 50
                                    const pctY = obj.node.getAttr('followY') ?? 50
                                    const stageNode = obj.node.getStage()
                                    if (stageNode) {
                                        const pxX = (pctX / 100) * stageNode.width()
                                        const pxY = (pctY / 100) * stageNode.height()
                                        reticle.x(pxX)
                                        reticle.y(pxY)
                                        
                                        // dynamically updates static UI coordinates during playback
                                        if (isActiveObj) {
                                            const sxUI = document.getElementById('static-anchor-x')
                                            const syUI = document.getElementById('static-anchor-y')
                                            if (sxUI) sxUI.innerText = Math.round(pxX - (stageNode.width() / 2))
                                            if (syUI) syUI.innerText = Math.round((stageNode.height() / 2) - pxY)
                                        }
                                    }
                                }
                            }
                            // Tracked mode positions are naturally mapped downstream via the Mask Sync block
                        }
                    }

                    if (isWithinInterval) {
                        // bypasses filter application while drawing tracking target box
                        if (typeof window.getTrackingState === 'function' && window.getTrackingState() === 'drawing') return

                        if (fType === 'depth-of-field') {
                            dofActive = true
                            dofConfig = {
                                node: obj.node,
                                mode: obj.node.getAttr('followMode') || 'static',
                                targetId: obj.node.getAttr('followTargetId'),
                                flowData: obj.node.getAttr('anchorFlowData'),
                                anchorX: obj.node.getAttr('targetAnchorX') ?? 0.5,
                                anchorY: obj.node.getAttr('targetAnchorY') ?? 0.5,
                                x: obj.node.getAttr('followX') || 50,
                                y: obj.node.getAttr('followY') || 50,
                                blur: obj.node.getAttr('dofBlur') ?? 8.0,
                                core: obj.node.getAttr('dofCore') ?? 2.5,
                                feather: obj.node.getAttr('dofFeather') ?? 23.0
                            }
                        } else if (fType === 'none') {
                            activeFilters = []
                        } else if (fType) {
                            activeFilters.push(`${fType}(100%)`)
                        }
                    }
                }
            } else {
                obj.node.opacity(0)
            }
        })

        // forces physical render of calculated properties for the layer
        if (layer.konvaLayer) {
            layer.konvaLayer.batchDraw()
        }
    })
    
    // pushes accumulated filters to the video element
    video.style.filter = activeFilters.length > 0 ? activeFilters.join(' ') : 'none'

    // applies dynamic localized blur mask to physical html layer
    const maskLayer = document.getElementById('filter-mask-layer')
    const canvasCont = document.getElementById('canvas-container')
    
    if (maskLayer && canvasCont) {
        if (dofActive && dofConfig) {
            let focalX = dofConfig.x
            let focalY = dofConfig.y

            // strictly blocks tracking coordinate execution if mode is static or target is none
            if (dofConfig.targetId && dofConfig.targetId !== 'none') {
                let trackObj = null
                appLayers.forEach(l => {
                    if (l.type === 'tracking') {
                        const found = l.objects.find(o => o.id == dofConfig.targetId)
                        if (found) trackObj = found
                    }
                })
                
                if (trackObj && trackObj.node) {
                    const rect = trackObj.node.findOne('.target-rect')
                    if (rect) {
                        const flowData = dofConfig.flowData
                        let aX = dofConfig.anchorX
                        let aY = dofConfig.anchorY
                        
                        const fps = trackObj.node.getAttr('trackingFps') || 30
                        const tStart = trackObj.node.getAttr('trackingStartTime') || trackObj.startTime
                        const frameIndex = Math.max(0, Math.floor((video.currentTime - tStart) * fps))
                        
                        if (flowData && flowData[frameIndex]) {
                            const trackData = trackObj.node.getAttr('trackingData')
                            const frameData = trackData ? trackData[frameIndex] : null
                            if (frameData && !frameData.lost) {
                                aX = (flowData[frameIndex].x - frameData.x) / frameData.w
                                aY = (flowData[frameIndex].y - frameData.y) / frameData.h
                            }
                        }
                        
                        const cPxX = trackObj.node.x() - trackObj.node.offsetX() + (rect.width() * aX)
                        const cPxY = trackObj.node.y() - trackObj.node.offsetY() + (rect.height() * aY)
                        
                        if (dofConfig.mode === 'tracked') {
                            focalX = (cPxX / canvasCont.offsetWidth) * 100
                            focalY = (cPxY / canvasCont.offsetHeight) * 100
                        }
                        
                        // dynamically updates tracked UI coordinates and links reticle visually
                        if (typeof activeNode !== 'undefined' && activeNode && activeNode.id() === dofConfig.node.id()) {
                            const axUI = document.getElementById('follow-anchor-x')
                            const ayUI = document.getElementById('follow-anchor-y')
                            const txUI = document.getElementById('follow-val-x')
                            const tyUI = document.getElementById('follow-val-y')
                            
                            const stageNode = dofConfig.node.getStage()
                            if (stageNode) {
                                const cx = stageNode.width() / 2
                                const cy = stageNode.height() / 2

                                if (axUI) axUI.innerText = Math.round(cPxX - cx)
                                if (ayUI) ayUI.innerText = Math.round(cy - cPxY)
                                
                                const targetCenterX = (trackObj.node.x() - trackObj.node.offsetX()) + (rect.width() / 2)
                                const targetCenterY = (trackObj.node.y() - trackObj.node.offsetY()) + (rect.height() / 2)
                                if (txUI) txUI.innerText = Math.round(targetCenterX - cx)
                                if (tyUI) tyUI.innerText = Math.round(cy - targetCenterY)
                            }
                            
                            const reticle = trackObj.node.findOne('.target-reticle')
                            if (reticle) {
                                reticle.moveToTop()
                                if (!reticle.isDragging()) {
                                    reticle.x(rect.width() * aX)
                                    reticle.y(rect.height() * aY)
                                }
                                if (trackObj.node.getLayer()) trackObj.node.getLayer().batchDraw()
                            }
                        }
                    }
                }
            }

            // synchronizes mask boundaries with current canvas container dimensions
            maskLayer.style.left = canvasCont.style.left
            maskLayer.style.top = canvasCont.style.top
            maskLayer.style.width = canvasCont.style.width
            maskLayer.style.height = canvasCont.style.height
            maskLayer.style.display = 'block'
            maskLayer.style.backdropFilter = `blur(${dofConfig.blur}px)`
            maskLayer.style.webkitBackdropFilter = `blur(${dofConfig.blur}px)`
            
            const outerStop = dofConfig.core + dofConfig.feather
            const maskCSS = `radial-gradient(circle at ${focalX}% ${focalY}%, transparent 0%, transparent ${dofConfig.core}%, black ${outerStop}%, black 100%)`
            maskLayer.style.maskImage = maskCSS
            maskLayer.style.webkitMaskImage = maskCSS
        } else {
            // resets mask layer styles when filter is inactive
            maskLayer.style.display = 'none'
            maskLayer.style.backdropFilter = 'none'
            maskLayer.style.webkitBackdropFilter = 'none'
            maskLayer.style.maskImage = 'none'
            maskLayer.style.webkitMaskImage = 'none'
        }
    }
}

// replaces event listener with continuous render loop
function renderLoop() {
    if (typeof syncObjectVisibility === 'function') {
        syncObjectVisibility()
    }

    // enforces interval boundaries dynamically during playback
    if (window.loopMode === 'track' && !video.paused) {
        const tracks = getLoopableTracks()
        const activeTrack = tracks[window.loopTrackIndex]

        if (activeTrack && video.currentTime >= activeTrack.endTime) {
            video.currentTime = activeTrack.startTime
        }
    }

    // dynamically updates advanced JSON properties configuration UI in real-time
    if (typeof window.updateAdvancedConfigDisplay === 'function') {
        window.updateAdvancedConfigDisplay()
    }

    requestAnimationFrame(renderLoop)
}
requestAnimationFrame(renderLoop)

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
        initMarqueeSystem()
    }, 100)
}

// guarantees metadata and frame data exist before execution
if (video.readyState >= 3) {
    initApp()
} else {
    video.addEventListener('canplay', initApp)
}

