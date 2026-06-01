import { appLayers, activeNode, setActiveNode } from './state-manager.js'
import { transformer, confirmSelection, removeObject, removeLayer, toggleCanvasGrid } from './canvas-engine.js'
import { switchTab, updateUILockState, renderLayersUI, getActiveObj, updateTimePanelUI, openTextEditor, openShapeEditor, openImageEditor, openFilterEditor, getTimeParts } from './sidebar-ui.js'
import { renderMultiTrackTimeline, renderTimelineIntervals } from './timeline-ui.js'

export let trackingState = 'idle'
window.getTrackingState = () => trackingState

// resets tracking ui state elements for global access
export const resetTrackingUI = () => {
    trackingState = 'idle'

    const trackEditPanel = document.getElementById('track-edit-panel')
    if (trackEditPanel) trackEditPanel.style.display = 'none'

    const trackBox = document.getElementById('tracking-target-box')
    if (trackBox) {
        trackBox.style.display = 'none'
        trackBox.removeAttribute('data-init-box')
    }

    const labelTab = document.getElementById('track-box-label')
    if (labelTab) labelTab.style.display = 'none'

    // explicitly hides the hardcoded cancel button instead of destroying the wrapper
    const cancelBtn = document.getElementById('cancel-draw-btn')
    if (cancelBtn) cancelBtn.style.display = 'none'

    const drawBtn = document.getElementById('add-track-target-btn')
    if (drawBtn) {
        drawBtn.innerText = 'Draw Target Box'
        drawBtn.style.opacity = '1'
        drawBtn.style.pointerEvents = 'auto'
        drawBtn.style.backgroundColor = '#00a8ff'
    }

    const processBtn = document.getElementById('process-tracking-btn')
    if (processBtn) {
        processBtn.style.display = 'none'
        processBtn.style.opacity = '0.3'
        processBtn.style.pointerEvents = 'none'
    }

    const confirmBtn = document.getElementById('confirm-track-box-btn')
    if (confirmBtn) confirmBtn.style.display = 'none'
    
    const editBtn = document.getElementById('edit-track-box-btn')
    if (editBtn) editBtn.style.display = 'none'
    
    const reinitBtn = document.getElementById('reinit-track-box-btn')
    if (reinitBtn) reinitBtn.style.display = 'none'
    
    const initBtn = document.getElementById('init-target-btn')
    if (initBtn) {
        initBtn.style.display = 'block'
        initBtn.style.opacity = '0.3'
        initBtn.style.pointerEvents = 'none'
    }

    const previewImg = document.getElementById('track-target-preview')
    if (previewImg) previewImg.src = ''
    
    // resets and enables the target name input field
    const nameInput = document.getElementById('track-target-name')
    if (nameInput) {
        nameInput.value = ''
        nameInput.disabled = false
    }

    const props = ['x', 'y', 'w', 'h', 'cx', 'cy']
    props.forEach(p => {
        const el = document.getElementById(`track-prop-${p}`)
        if (el) el.value = ''
    })

    // restores default states for time panel and accuracy selector when canceled
    const timePanel = document.getElementById('time-edit-panel')
    if (timePanel) {
        timePanel.style.opacity = '1'
        timePanel.style.pointerEvents = 'auto'
    }
    
    const accBlock = document.getElementById('tracking-accuracy-block')
    if (accBlock) {
        accBlock.style.opacity = '1'
        accBlock.style.pointerEvents = 'auto'
    }
    const alphaInput = document.getElementById('track-prop-alpha')
    if (alphaInput) alphaInput.disabled = false

    // restores default cursors when canceled
    const videoWrapper = document.getElementById('video-wrapper')
    const canvasCont = document.getElementById('canvas-container')
    if (videoWrapper) videoWrapper.style.cursor = 'default'
    if (canvasCont) canvasCont.style.cursor = 'default'

    // instantly unlocks tabs and buttons when tracking is canceled
    if (typeof updateUILockState === 'function') updateUILockState()
}

export function initTrackingBindings() {
    const connectBtn = document.getElementById('backend-connect-btn')
    const addTargetBtn = document.getElementById('add-track-target-btn')
    const cancelDrawBtn = document.getElementById('cancel-draw-btn') 
    const trackBox = document.getElementById('tracking-target-box')
    const backendStatus = document.getElementById('backend-status')   
    const authErrorDisplay = document.getElementById('auth-error-message')    
    const devToggleBtn = document.getElementById('dev-toggle-btn')
    const devPanel = document.getElementById('dev-connection-panel')
    const renderUrlInput = document.getElementById('render-url-input')
    const ngrokUrlInput = document.getElementById('ngrok-url-input')
    const tokenInput = document.getElementById('backend-auth-token')    
    const propsPanel = document.getElementById('track-edit-panel')
    const editBtn = document.getElementById('edit-track-box-btn')
    const confirmBtn = document.getElementById('confirm-track-box-btn')
    const processBtn = document.getElementById('process-tracking-btn')    
    const previewContainer = document.getElementById('track-preview-container')
    const previewImg = document.getElementById('track-target-preview')
    const videoWrapper = document.getElementById('video-wrapper')
    const video = document.getElementById('main-video')
    const nameInput = document.getElementById('track-target-name')
    const confirmNameBtn = document.getElementById('confirm-name-btn')
    const initTargetBtn = document.getElementById('init-target-btn')
    const trackIdentifiers = document.getElementById('track-identifiers')
    const identName = document.getElementById('ident-name')
    const identId = document.getElementById('ident-id')
    const identStatus = document.getElementById('ident-status')
    const identCenter = document.getElementById('ident-center')
    const identSize = document.getElementById('ident-size')
    const identInterval = document.getElementById('ident-interval') 
    const identFrames = document.getElementById('ident-frames')     
    const identModel = document.getElementById('ident-model')       
    const alphaInput = document.getElementById('track-prop-alpha')
    const alphaUp = document.getElementById('alpha-up')
    const alphaDown = document.getElementById('alpha-down')
    const timePanel = document.getElementById('time-edit-panel')

    // Helpers to manage phase-based UI states
    const setAlphaEnabled = (enabled) => {
        const accBlock = document.getElementById('tracking-accuracy-block')
        if (accBlock) {
            accBlock.style.opacity = enabled ? '1' : '0.3'
            accBlock.style.pointerEvents = enabled ? 'auto' : 'none'
        }
        const aInput = document.getElementById('track-prop-alpha')
        if (aInput) aInput.disabled = !enabled
    }

    const setTimePanelEnabled = (enabled) => {
        if (timePanel) {
            timePanel.style.opacity = enabled ? '1' : '0.3'
            timePanel.style.pointerEvents = enabled ? 'auto' : 'none'
        }
    }

    if (alphaInput && alphaUp && alphaDown) {
        const updateAlpha = (delta) => {
            if (alphaInput.disabled) return
            let val = parseFloat(alphaInput.value) || 0.31
            val += delta
            if (val < 0.01) val = 0.01
            if (val > 1.00) val = 1.00
            alphaInput.value = val.toFixed(2)
        }
        alphaUp.addEventListener('click', () => updateAlpha(0.01))
        alphaDown.addEventListener('click', () => updateAlpha(-0.01))
    }

    trackingState = 'idle'
    let isDrawing = false
    let isDraggingTrack = false
    let startX = 0, startY = 0
    let trackStartX = 0, trackStartY = 0
    let initialTrackLeft = 0, initialTrackTop = 0

    let isPanningPreview = false
    let panStartX = 0, panStartY = 0
    let imgStartLeft = 0, imgStartTop = 0

    let isDevMode = false

    // Tracks if user is actively dragging CSS resize handle
    window.isNativeResizing = false

    // binds the cancel event directly to the hardcoded UI button
    if (cancelDrawBtn) {
        cancelDrawBtn.addEventListener('click', () => {
            if (typeof resetTrackingUI === 'function') resetTrackingUI()
        })
    }

    if (trackBox) {
        trackBox.style.resize = 'both'
        trackBox.style.overflow = 'hidden'

        // Triggers UI updates dynamically when trackBox is natively resized via CSS handle
        const resizeObserver = new ResizeObserver(() => {
            if (trackingState === 'editing' && window.isNativeResizing) {
                updateTargetPreview(true)
            }
        })
        resizeObserver.observe(trackBox)
    }

    if (devToggleBtn) {
        devToggleBtn.addEventListener('click', () => {
            isDevMode = !isDevMode
            devPanel.style.display = isDevMode ? 'block' : 'none'

            devToggleBtn.style.color = isDevMode ? '#fff' : '#f39c12'
            
            backendStatus.innerText = 'Status: Disconnected'
            backendStatus.style.color = '#aaa'
            if (authErrorDisplay) {
                authErrorDisplay.style.display = 'none'
                authErrorDisplay.innerText = ''
            }
            addTargetBtn.style.opacity = '0.3'
            addTargetBtn.style.pointerEvents = 'none'
            
            // clear the dataset so it registers as disconnected globally across the UI
            const cBtn = document.getElementById('backend-connect-btn')
            if (cBtn) {
                delete cBtn.dataset.activeUrl
                delete cBtn.dataset.activeToken
            }
        })
    }

    if (connectBtn) {
        connectBtn.addEventListener('click', async () => {
            const url = isDevMode ? ngrokUrlInput.value.trim() : 'https://james3895-comp-vision.hf.space'
            const token = isDevMode ? tokenInput.value.trim() : 'TOKEN_DB'

            if (authErrorDisplay) authErrorDisplay.style.display = 'none'

            if (!url || !token) {
                backendStatus.innerText = 'Status: Valid URL Required'
                backendStatus.style.color = '#e74c3c'
                return
            }

            backendStatus.innerText = 'Status: Pinging Server...'
            backendStatus.style.color = '#f39c12'
            addTargetBtn.style.opacity = '0.3'
            addTargetBtn.style.pointerEvents = 'none'

            try {
                const baseUrl = url.replace(/\/$/, '')
                
                const response = await fetch(`${baseUrl}/`, {
                    method: 'GET',
                    headers: {
                        'ngrok-skip-browser-warning': 'true',
                        'Authorization': `Bearer ${token}`
                    }
                })

                if (response.ok) {
                    backendStatus.innerText = 'Status: Ready (' + (isDevMode ? 'GPU Mode' : 'CPU Mode') + ')'
                    backendStatus.style.color = '#4cd137'
                    addTargetBtn.style.opacity = '1'
                    addTargetBtn.style.pointerEvents = 'auto'
                    
                    connectBtn.dataset.activeUrl = baseUrl
                    connectBtn.dataset.activeToken = token
                } else {
                    const errorData = await response.json().catch(() => ({}))
                    const errorMsg = errorData.error || 'Server Error'
                    
                    if (authErrorDisplay) {
                        authErrorDisplay.innerText = `Error: ${errorMsg}`
                        authErrorDisplay.style.display = 'block'
                    }
                    throw new Error(errorMsg)
                }
            } catch (err) {
                console.error('Connection test failed:', err)
                backendStatus.innerText = 'Status: Connection Failed'
                backendStatus.style.color = '#e74c3c'
            }
        })
    }

    // adds parameter to bypass heavy canvas render during rapid mouse events
    const updateTargetPreview = (skipImage = false) => {
        if (!trackBox || trackBox.style.display === 'none') return

        const targetRect = trackBox.getBoundingClientRect()
        const videoRect = video.getBoundingClientRect()
        
        const videoRatio = video.videoWidth / video.videoHeight
        const elementRatio = videoRect.width / videoRect.height

        let renderedWidth = videoRect.width
        let renderedHeight = videoRect.height
        let offsetX = 0
        let offsetY = 0

        if (videoRatio > elementRatio) {
            renderedHeight = videoRect.width / videoRatio
            offsetY = (videoRect.height - renderedHeight) / 2
        } else {
            renderedWidth = videoRect.height * videoRatio
            offsetX = (videoRect.width - renderedWidth) / 2
        }

        const scaleX = video.videoWidth / renderedWidth
        const scaleY = video.videoHeight / renderedHeight

        const box = {
            x: (targetRect.left - videoRect.left - offsetX) * scaleX,
            y: (targetRect.top - videoRect.top - offsetY) * scaleY,
            w: targetRect.width * scaleX,
            h: targetRect.height * scaleY
        }

        // Center-Point Math & Dynamic Values
        document.getElementById('track-prop-x').value = Math.round(box.x)
        document.getElementById('track-prop-y').value = Math.round(box.y)
        document.getElementById('track-prop-w').value = Math.round(box.w)
        document.getElementById('track-prop-h').value = Math.round(box.h)
        
        const editTrackW = document.getElementById('edit-track-width')
        const editTrackH = document.getElementById('edit-track-height')
        if (editTrackW) editTrackW.value = Math.round(targetRect.width)
        if (editTrackH) editTrackH.value = Math.round(targetRect.height)

        // Maps center point to native video coordinates so they don't drift on window resize
        const cx = box.x + (box.w / 2)
        const cy = box.y + (box.h / 2)

        const propCx = document.getElementById('track-prop-cx')
        const propCy = document.getElementById('track-prop-cy')
        if (propCx) propCx.value = Math.round(cx)
        if (propCy) propCy.value = Math.round(cy)

        // syncs live svg values to exact mathematical coordinates in properties panel
        const liveX = document.getElementById('live-val-x')
        const liveY = document.getElementById('live-val-y')
        const liveCx = document.getElementById('live-val-cx')
        const liveCy = document.getElementById('live-val-cy')
        
        if (liveX) liveX.innerText = Math.round(box.x)
        if (liveY) liveY.innerText = Math.round(box.y)
        if (liveCx) liveCx.innerText = Math.round(cx)
        if (liveCy) liveCy.innerText = Math.round(cy)

        // halts execution here if skip flag is active
        if (!skipImage && box.w > 0 && box.h > 0) {
            const canvas = document.createElement('canvas')
            canvas.width = Math.round(box.w)
            canvas.height = Math.round(box.h)
            const ctx = canvas.getContext('2d')
            ctx.drawImage(video, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height)
            
            previewImg.src = canvas.toDataURL('image/jpeg', 0.9)

            const containerSize = 80
            const scale = Math.max(containerSize / canvas.width, containerSize / canvas.height)
            const scaledW = canvas.width * scale
            const scaledH = canvas.height * scale

            previewImg.style.width = scaledW + 'px'
            previewImg.style.height = scaledH + 'px'

            const currentLeft = (containerSize - scaledW) / 2
            const currentTop = (containerSize - scaledH) / 2
            previewImg.style.left = currentLeft + 'px'
            previewImg.style.top = currentTop + 'px'

            previewImg.dataset.minLeft = containerSize - scaledW
            previewImg.dataset.minTop = containerSize - scaledH
        }

        trackBox.dataset.initBox = JSON.stringify(box)
    }

    if (previewContainer) {
        previewContainer.addEventListener('mousedown', (e) => {
            if (previewImg.src) {
                isPanningPreview = true
                previewContainer.style.cursor = 'grabbing'
                panStartX = e.clientX
                panStartY = e.clientY
                imgStartLeft = parseFloat(previewImg.style.left) || 0
                imgStartTop = parseFloat(previewImg.style.top) || 0
            }
        })
    }

    if (addTargetBtn) {
        addTargetBtn.addEventListener('click', () => {
            // dynamically builds flex wrapper and injects cancel button
            let wrapper = document.getElementById('draw-target-wrapper')
            if (!wrapper) {
                if (!addTargetBtn.dataset.originalStyle) {
                    addTargetBtn.dataset.originalStyle = addTargetBtn.style.cssText
                }

                wrapper = document.createElement('div')
                wrapper.id = 'draw-target-wrapper'
                wrapper.style.display = 'flex'
                wrapper.style.gap = '8px'
                wrapper.style.alignItems = 'stretch'
                wrapper.style.marginTop = '10px' // Matches the default .action-btn spacing
                
                addTargetBtn.parentNode.insertBefore(wrapper, addTargetBtn)
                wrapper.appendChild(addTargetBtn)
                
                addTargetBtn.style.flex = '1'
                addTargetBtn.style.width = 'auto'
                addTargetBtn.style.margin = '0'

                const cancelBtn = document.createElement('button')
                cancelBtn.id = 'cancel-draw-btn'
                cancelBtn.innerText = '✖'
                cancelBtn.className = 'action-btn remove-btn'
                cancelBtn.style.flex = '0 0 40px'
                cancelBtn.style.margin = '0'
                cancelBtn.style.padding = '0'
                cancelBtn.style.display = 'flex'
                cancelBtn.style.justifyContent = 'center'
                cancelBtn.style.alignItems = 'center'
                
                cancelBtn.onclick = () => {
                    // executes module level reset to aggressively clear drawing state
                    if (typeof resetTrackingUI === 'function') resetTrackingUI()
                }
                
                wrapper.appendChild(cancelBtn)
            }

            // guarantees the button displays regardless of the wrapper creation logic
            const existingCancelBtn = document.getElementById('cancel-draw-btn')
            if (existingCancelBtn) existingCancelBtn.style.display = 'flex'

            // enforces absolute parent constraint so drawn coordinates strictly match mouse pointer
            const videoWrapper = document.getElementById('video-wrapper')
            if (videoWrapper && trackBox.parentNode !== videoWrapper) {
                videoWrapper.appendChild(trackBox)
            }

            trackingState = 'drawing'
            trackBox.style.display = 'none'
            trackBox.style.width = '0px'
            trackBox.style.height = '0px'
            
            // visually locks cursor to reticle state across both canvas and video wrappers
            const canvasCont = document.getElementById('canvas-container')
            if (videoWrapper) videoWrapper.style.cursor = 'crosshair'
            if (canvasCont) canvasCont.style.cursor = 'crosshair'
            
            addTargetBtn.innerText = 'Click & Drag on Video'
            addTargetBtn.style.backgroundColor = '#f39c12'
            propsPanel.style.display = 'none'

            // injects x, y, and center indicators into target box innerHTML
            trackBox.innerHTML = `
                <div style="position:absolute; top:2px; left:0; width:100%; display:flex; align-items:center; justify-content:center; gap:6px; pointer-events:none; opacity:0.7;">
                    <span style="color:#ff4757; font-family:monospace; font-size:10px; text-shadow:1px 1px 2px rgba(0,0,0,0.8);">X: <span id="live-val-x">0</span></span>
                    <svg width="24" height="6" viewBox="0 0 24 6"><path d="M0 3H24M20 0L24 3L20 6" stroke="#ff4757" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <div style="position:absolute; top:0; left:2px; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; pointer-events:none; opacity:0.7;">
                    <span style="color:#2ed573; font-family:monospace; font-size:10px; text-shadow:1px 1px 2px rgba(0,0,0,0.8);">Y:<br><span id="live-val-y">0</span></span>
                    <svg width="6" height="24" viewBox="0 0 6 24"><path d="M3 0V24M0 20L3 24L6 20" stroke="#2ed573" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; pointer-events:none; opacity:0.7;">
                    <svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 0V10M0 5H10" stroke="#00a8ff" stroke-width="1.5" fill="none"/></svg>
                    <span style="color:#00a8ff; font-family:monospace; font-size:9px; text-shadow:1px 1px 2px rgba(0,0,0,0.8);">C:<span id="live-val-cx">0</span>,<span id="live-val-cy">0</span></span>
                </div>
            `
            trackBox.style.border = '2px dashed #9b59b6'
            trackBox.style.outline = '2px solid rgba(155, 89, 182, 0.4)'
            trackBox.style.outlineOffset = '2px'
            trackBox.style.backgroundColor = 'rgba(155, 89, 182, 0.2)'
            trackBox.style.border = '2px dashed #9b59b6'
            trackBox.style.backgroundColor = 'rgba(155, 89, 182, 0.2)'

            // greys out the tabs while user is preparing to draw
            if (typeof updateUILockState === 'function') updateUILockState()
        })
    }

    videoWrapper.addEventListener('mousedown', (e) => {
        if (trackingState === 'drawing') {
            isDrawing = true
            const rect = videoWrapper.getBoundingClientRect()
            startX = e.clientX - rect.left
            startY = e.clientY - rect.top
            
            trackBox.style.left = startX + 'px'
            trackBox.style.top = startY + 'px'
            trackBox.style.width = '0px'
            trackBox.style.height = '0px'
            trackBox.style.display = 'block'
            trackBox.style.pointerEvents = 'none'

            // cleans up old label when drawing a new box
            const labelTab = document.getElementById('track-box-label')
            if (labelTab) labelTab.remove()
        }
    })

    if (trackBox) {
        trackBox.addEventListener('mousedown', (e) => {
            if (trackingState !== 'editing') return
            
            const rect = trackBox.getBoundingClientRect()
            if (e.clientX > rect.right - 15 && e.clientY > rect.bottom - 15) {
                window.isNativeResizing = true
                return
            }

            isDraggingTrack = true
            trackStartX = e.clientX
            trackStartY = e.clientY
            const parentRect = trackBox.parentNode.getBoundingClientRect()
            initialTrackLeft = rect.left - parentRect.left
            initialTrackTop = rect.top - parentRect.top
        })

        trackBox.addEventListener('mouseup', () => {
            if (trackingState === 'editing') updateTargetPreview()
        })
    }

    document.addEventListener('mousemove', (e) => {
        if (isPanningPreview) {
            let newLeft = imgStartLeft + (e.clientX - panStartX)
            let newTop = imgStartTop + (e.clientY - panStartY)

            const minLeft = parseFloat(previewImg.dataset.minLeft) || 0
            const minTop = parseFloat(previewImg.dataset.minTop) || 0

            if (newLeft > 0) newLeft = 0
            if (newLeft < minLeft) newLeft = minLeft
            if (newTop > 0) newTop = 0
            if (newTop < minTop) newTop = minTop

            previewImg.style.left = newLeft + 'px'
            previewImg.style.top = newTop + 'px'
        }

        if (isDrawing && trackingState === 'drawing') {
            const rect = videoWrapper.getBoundingClientRect()
            const currentX = e.clientX - rect.left
            const currentY = e.clientY - rect.top

            const width = Math.abs(currentX - startX)
            const height = Math.abs(currentY - startY)
            const left = Math.min(startX, currentX)
            const top = Math.min(startY, currentY)

            trackBox.style.width = width + 'px'
            trackBox.style.height = height + 'px'
            trackBox.style.left = left + 'px'
            trackBox.style.top = top + 'px'

            // dynamically updates values while drawing without triggering canvas render
            updateTargetPreview(true)
        }

        if (isDraggingTrack && trackingState === 'editing') {
            const newLeft = initialTrackLeft + (e.clientX - trackStartX)
            const newTop = initialTrackTop + (e.clientY - trackStartY)
            trackBox.style.left = newLeft + 'px'
            trackBox.style.top = newTop + 'px'
            
            const labelTab = document.getElementById('track-box-label')
            if (labelTab) {
                labelTab.style.left = (newLeft - 2) + 'px'
                labelTab.style.top = (newTop - 18) + 'px'
            }

            // Updates X/Y while dragging
            const liveX = document.getElementById('live-val-x')
            const liveY = document.getElementById('live-val-y')
            if (liveX) liveX.innerText = Math.round(newLeft)
            if (liveY) liveY.innerText = Math.round(newTop)
            
            updateTargetPreview()
        }
    })

    document.addEventListener('mouseup', () => {
        window.isNativeResizing = false

        if (isPanningPreview) {
            isPanningPreview = false
            if (previewContainer) previewContainer.style.cursor = 'grab'
        }

        if (isDraggingTrack) {
            isDraggingTrack = false
            updateTargetPreview()
        }

        if (isDrawing && trackingState === 'drawing') {
            isDrawing = false
            trackingState = 'editing'
            // restores default pointers for both canvas layers
            const canvasCont = document.getElementById('canvas-container')
            if (videoWrapper) videoWrapper.style.cursor = 'default'
            if (canvasCont) canvasCont.style.cursor = 'default'
            
            trackBox.style.pointerEvents = 'auto'
            addTargetBtn.innerText = 'Redraw Target Box'
            addTargetBtn.style.backgroundColor = '#00a8ff'
            
            // calculates default name based on active layer objects length
            const trackLayer = appLayers.find(l => l.type === 'tracking')
            const newNum = trackLayer ? trackLayer.objects.length + 1 : 1
            const defaultName = `Target_${newNum}`
            
            trackBox.dataset.targetName = defaultName
            if (nameInput) {
                nameInput.value = defaultName
                setTimeout(() => {
                    nameInput.focus()
                    nameInput.select()
                }, 10)
            }

            let labelTab = document.getElementById('track-box-label')
            if (!labelTab && trackBox.parentNode) {
                labelTab = document.createElement('div')
                labelTab.id = 'track-box-label'
                labelTab.style.position = 'absolute'
                labelTab.style.backgroundColor = '#9b59b6'
                labelTab.style.color = '#fff'
                labelTab.style.fontSize = '10px'
                labelTab.style.fontFamily = 'sans-serif'
                labelTab.style.fontWeight = 'bold'
                labelTab.style.padding = '2px 6px'
                labelTab.style.borderTopLeftRadius = '4px'
                labelTab.style.borderTopRightRadius = '4px'
                labelTab.style.pointerEvents = 'none'
                labelTab.style.whiteSpace = 'nowrap'
                labelTab.style.zIndex = '11'
                trackBox.parentNode.appendChild(labelTab)
            }
            if (labelTab) {
                labelTab.innerText = defaultName
                labelTab.style.display = 'block'
                const currentTop = parseFloat(trackBox.style.top) || 0
                const currentLeft = parseFloat(trackBox.style.left) || 0
                labelTab.style.top = (currentTop - 18) + 'px'
                labelTab.style.left = (currentLeft - 2) + 'px'
            }

            propsPanel.style.display = 'block'
            editBtn.style.display = 'none'
            
            if (initTargetBtn) {
                initTargetBtn.style.display = 'block'
                initTargetBtn.style.opacity = '0.3'
                initTargetBtn.style.pointerEvents = 'none'
            }
            
            if (confirmBtn) confirmBtn.style.display = 'none'
            if (trackIdentifiers) trackIdentifiers.style.display = 'none'
            
            processBtn.style.opacity = '0.3'
            processBtn.style.pointerEvents = 'none'
            
            // executes UI lock state after drawing is completed
            if (typeof updateUILockState === 'function') updateUILockState()
            
            updateTargetPreview()
        }
    })

    if (nameInput) {
        // dynamically syncs text string to active layer object and timeline block
        nameInput.addEventListener('input', (e) => {
            const trackLayer = appLayers.find(l => l.type === 'tracking')
            const newVal = e.target.value
            
            // pushes live updates to the html tracking box and visual label
            const trackBox = document.getElementById('tracking-target-box')
            if (trackBox) trackBox.dataset.targetName = newVal
            
            let labelTab = document.getElementById('track-box-label')
            if (!labelTab && trackBox && trackBox.parentNode) {
                labelTab = document.createElement('div')
                labelTab.id = 'track-box-label'
                labelTab.style.position = 'absolute'
                labelTab.style.backgroundColor = '#9b59b6'
                labelTab.style.color = '#fff'
                labelTab.style.fontSize = '10px'
                labelTab.style.fontFamily = 'sans-serif'
                labelTab.style.fontWeight = 'bold'
                labelTab.style.padding = '2px 6px'
                labelTab.style.borderTopLeftRadius = '4px'
                labelTab.style.borderTopRightRadius = '4px'
                labelTab.style.pointerEvents = 'none'
                labelTab.style.whiteSpace = 'nowrap'
                labelTab.style.zIndex = '11'
                trackBox.parentNode.appendChild(labelTab)
                
                const currentTop = parseFloat(trackBox.style.top) || 0
                const currentLeft = parseFloat(trackBox.style.left) || 0
                labelTab.style.top = (currentTop - 18) + 'px'
                labelTab.style.left = (currentLeft - 2) + 'px'
            }
            if (labelTab) {
                labelTab.innerText = newVal
                labelTab.style.display = 'block'
            }

            if (trackLayer && typeof activeNode !== 'undefined' && activeNode) {
                const existingObj = trackLayer.objects.find(o => o.node === activeNode)
                if (existingObj) {
                    existingObj.name = newVal
                    if (existingObj.node) {
                        existingObj.node.name(newVal)
                        const textNode = existingObj.node.findOne('.target-text')
                        if (textNode) textNode.text(newVal)
                    }
                    if (typeof renderMultiTrackTimeline === 'function') renderMultiTrackTimeline()
                    
                    const activeSpan = document.querySelector('.list-item.active-item > span')
                    if (activeSpan) {
                        activeSpan.innerText = newVal
                    }
                }
            }
        })

        // reverts button to Confirm if the user clicks the input to rename
        nameInput.addEventListener('focus', () => {
            nameInput.select()
            if (confirmNameBtn) {
                confirmNameBtn.innerText = '✔'
                confirmNameBtn.style.backgroundColor = '#4cd137'
                confirmNameBtn.title = "Confirm Name"
            }
        })
    }

    const editTrackW = document.getElementById('edit-track-width')
    const editTrackH = document.getElementById('edit-track-height')
    if (editTrackW) {
        editTrackW.addEventListener('input', (e) => {
            if (!trackBox) return
            const val = parseInt(e.target.value, 10) || 0
            trackBox.style.width = val + 'px'
            updateTargetPreview()
        })
    }
    if (editTrackH) {
        editTrackH.addEventListener('input', (e) => {
            if (!trackBox) return
            const val = parseInt(e.target.value, 10) || 0
            trackBox.style.height = val + 'px'
            updateTargetPreview()
        })
    }

    if (confirmNameBtn) {
        confirmNameBtn.addEventListener('click', () => {
            // --- CANCEL / DELETE ACTION ---
            if (confirmNameBtn.innerText === '✖') {
                const trackLayer = appLayers.find(l => l.type === 'tracking')
                if (trackLayer && trackLayer.objects) {
                    const targetName = trackBox.dataset.targetName
                    const obj = trackLayer.objects.find(o => o.name === targetName)
                    if (obj) removeObject('Tracking Layer', obj.id) 
                }

                trackBox.style.display = 'none'
                propsPanel.style.display = 'none'
                trackingState = 'idle'
                
                // unwraps button group
                const wrapper = document.getElementById('draw-target-wrapper')
                if (wrapper) {
                    addTargetBtn.style.cssText = addTargetBtn.dataset.originalStyle || ''
                    wrapper.parentNode.insertBefore(addTargetBtn, wrapper)
                    wrapper.remove()
                }
                
                addTargetBtn.innerText = 'Draw Target Box'
                addTargetBtn.style.backgroundColor = '#00a8ff'
                
                nameInput.value = ''
                nameInput.disabled = false // ensures input is editable if confirmed name is canceled
                confirmNameBtn.innerText = '✔'
                confirmNameBtn.style.backgroundColor = '#4cd137'
                confirmNameBtn.title = "Confirm Name"

                const labelTab = document.getElementById('track-box-label')
                if (labelTab) labelTab.remove()

                // Re-lock the initialization button
                if (initTargetBtn) {
                    initTargetBtn.style.opacity = '0.3'
                    initTargetBtn.style.pointerEvents = 'none'
                }

                setTimePanelEnabled(true)
                setAlphaEnabled(true)

                // unlocks tabs when canceling the new target
                if (typeof updateUILockState === 'function') updateUILockState()
                return
            }

            // --- CONFIRM NAME ACTION ---
            // calculates default fallback name based on active layer objects length
            const trackLayerFind = appLayers.find(l => l.type === 'tracking')
            const nextNum = trackLayerFind ? trackLayerFind.objects.length + 1 : 1
            const targetName = nameInput.value.trim() || `Target_${nextNum}`
            
            trackBox.dataset.targetName = targetName
            
            let labelTab = document.getElementById('track-box-label')
            if (!labelTab) {
                labelTab = document.createElement('div')
                labelTab.id = 'track-box-label'
                labelTab.style.position = 'absolute'
                labelTab.style.backgroundColor = '#9b59b6'
                labelTab.style.color = '#fff'
                labelTab.style.fontSize = '10px'
                labelTab.style.fontFamily = 'sans-serif'
                labelTab.style.fontWeight = 'bold'
                labelTab.style.padding = '2px 6px'
                labelTab.style.borderTopLeftRadius = '4px'
                labelTab.style.borderTopRightRadius = '4px'
                labelTab.style.pointerEvents = 'none'
                labelTab.style.whiteSpace = 'nowrap'
                labelTab.style.zIndex = '11'
                trackBox.parentNode.appendChild(labelTab)
            }
            labelTab.innerText = targetName

            const currentTop = parseFloat(trackBox.style.top) || 0
            const currentLeft = parseFloat(trackBox.style.left) || 0
            labelTab.style.top = (currentTop - 18) + 'px'
            labelTab.style.left = (currentLeft - 2) + 'px'

            confirmNameBtn.innerText = '✖'
            confirmNameBtn.style.backgroundColor = '#e84118'
            confirmNameBtn.title = "Remove Target Box"
            
            nameInput.blur()
            nameInput.disabled = true // explicitly locks field when confirm is clicked

            const cancelDrawBtn = document.getElementById('cancel-draw-btn')
            if (cancelDrawBtn) cancelDrawBtn.style.display = 'none'

            if (initTargetBtn) {
                initTargetBtn.style.opacity = '1'
                initTargetBtn.style.pointerEvents = 'auto'
            }

            const identName = document.getElementById('ident-name')
            if (identName) identName.innerText = targetName
            if (nameInput) nameInput.value = targetName
            
            // updates existing tracking box and label references without triggering a redeclaration error
            if (trackBox) trackBox.dataset.targetName = targetName
            if (labelTab) labelTab.innerText = targetName

            // Enters Initialization Phase
            const accBlock = document.getElementById('tracking-accuracy-block')
            if (timePanel && propsPanel && accBlock) {
                timePanel.style.display = 'block'
                propsPanel.insertBefore(timePanel, accBlock)
            }
            setTimePanelEnabled(false)
            setAlphaEnabled(false)

            if (typeof updateUILockState === 'function') updateUILockState()
        })
    }

    if (initTargetBtn) {
        initTargetBtn.addEventListener('click', async () => {
            if (initTargetBtn) initTargetBtn.blur()

            // locks in the current input value and disables the field during initialization
            if (nameInput) {
                const currentName = nameInput.value.trim()
                if (currentName) {
                    trackBox.dataset.targetName = currentName
                    const label = document.getElementById('track-box-label')
                    if (label) label.innerText = currentName
                }
                nameInput.disabled = true
            }            

            const shapesTab = document.getElementById('shapes-tab')

            const activeUrl = connectBtn.dataset.activeUrl
            const activeToken = connectBtn.dataset.activeToken

            if (!activeUrl) {
                if (backendStatus) {
                    backendStatus.innerText = 'Status: Server Not Connected'
                    backendStatus.style.color = '#e74c3c'
                }
                return
            }

            // Spawns the Konva object in the background if it doesn't already exist
            const targetName = trackBox.dataset.targetName || 'Target'
            const trackLayer = appLayers.find(l => l.type === 'tracking')
            
            // strictly binds logic to the active node memory to prevent duplicating objects during edit cycles
            let existingObj = null
            if (trackLayer && typeof activeNode !== 'undefined' && activeNode) {
                existingObj = trackLayer.objects.find(o => o.node === activeNode)
            }
            if (!existingObj && trackLayer) {
                existingObj = trackLayer.objects.find(o => o.name === targetName)
            }
            
            if (!existingObj) {
                const addBoxBtn = document.getElementById('add-box-btn')
                if (addBoxBtn) {
                    addBoxBtn.disabled = false
                    addBoxBtn.click()

                    const updatedTrackLayer = appLayers.find(l => l.type === 'tracking')
                    if (updatedTrackLayer && updatedTrackLayer.objects.length > 0) {
                        const latestObj = updatedTrackLayer.objects[updatedTrackLayer.objects.length - 1]
                        latestObj.name = targetName
                        
                        if (latestObj.node) {
                            latestObj.node.name(targetName)
                            latestObj.node.opacity(0) 
                            latestObj.node.listening(false)
                            
                            const textNode = latestObj.node.findOne('.target-text')
                            if (textNode) textNode.text(targetName)
                            
                            if (latestObj.node.getLayer()) latestObj.node.getLayer().batchDraw()
                            
                            if (typeof transformer !== 'undefined') transformer.nodes([])
                        }
                    }
                }
                
                // Restores and locks the target name that was overwritten by the Konva object spawn trigger
                if (nameInput) {
                    nameInput.value = targetName
                    nameInput.disabled = true
                }
                const identNameElem = document.getElementById('ident-name')
                if (identNameElem) identNameElem.innerText = targetName
                
                // restores html tracking box dataset and visual label that were overwritten by openShapeEditor during spawn
                if (trackBox) trackBox.dataset.targetName = targetName
                const labelTab = document.getElementById('track-box-label')
                if (labelTab) labelTab.innerText = targetName

                if (typeof renderLayersUI === 'function') renderLayersUI()
            } else {
                existingObj.name = targetName
                if (existingObj.node) {
                    existingObj.node.name(targetName)
                    const textNode = existingObj.node.findOne('.target-text')
                    if (textNode) textNode.text(targetName)
                }
                if (typeof setActiveNode === 'function') setActiveNode(existingObj.node)
                if (typeof renderMultiTrackTimeline === 'function') renderMultiTrackTimeline()
                if (typeof renderLayersUI === 'function') renderLayersUI()
            }

            initTargetBtn.innerText = 'Initializing...'
            initTargetBtn.style.opacity = '0.5'

            try {
                const b64Image = previewImg.src
                const baseUrl = activeUrl.replace(/\/$/, '')

                const response = await fetch(`${baseUrl}/init_target`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${activeToken}`
                    },
                    body: JSON.stringify({ image: b64Image })
                })

                if (!response.ok) throw new Error('Failed to initialize target')
                const data = await response.json()

                if (data.status === 'success') {
                    if (identId) identId.innerText = data.identifiers.id
                    if (identStatus) identStatus.innerText = data.identifiers.status
                    
                    if (identName) identName.innerText = trackBox.dataset.targetName || 'Unknown'
                    
                    const cx = document.getElementById('track-prop-cx').value || 0
                    const cy = document.getElementById('track-prop-cy').value || 0
                    if (identCenter) identCenter.innerText = `${cx}, ${cy}`
                    
                    const w = document.getElementById('track-prop-w').value || 0
                    const h = document.getElementById('track-prop-h').value || 0
                    if (identSize) identSize.innerText = `${w}x${h}`

                    // Dynamically calculate interval and frames based on the active Time Panel status
                    const trackLayer = appLayers.find(l => l.type === 'tracking')
                    if (trackLayer && typeof activeNode !== 'undefined' && activeNode) {
                        const activeObj = trackLayer.objects.find(o => o.node === activeNode)
                        if (activeObj) {
                            const sTime = Number(activeObj.startTime) || 0
                            const eTime = Number(activeObj.endTime) || 0
                            const fps = 30 // standard tracking extraction rate
                            const frames = Math.floor((eTime - sTime) * fps) + 1

                            if (identInterval) identInterval.innerText = `${sTime.toFixed(2)}s - ${eTime.toFixed(2)}s`
                            if (identFrames) identFrames.innerText = frames
                            
                            // Sets model using response data, falling back to known ONNX architecture
                            const modelStr = (data.identifiers && data.identifiers.model) ? data.identifiers.model : 'YOLOv8-Seg (ONNX)'
                            activeObj.node.setAttr('trackingModel', modelStr)
                            if (identModel) identModel.innerText = modelStr
                        }
                    }

                    trackIdentifiers.style.display = 'flex'
                    initTargetBtn.style.display = 'none'
                    
                    if (confirmBtn) {
                        confirmBtn.style.display = 'block'
                        confirmBtn.disabled = false
                        confirmBtn.style.opacity = '1'
                        confirmBtn.style.pointerEvents = 'auto'
                    }
                    
                    if (editBtn) {
                        editBtn.style.display = 'block'
                        editBtn.disabled = false
                        editBtn.style.opacity = '1'
                        editBtn.style.pointerEvents = 'auto'
                    }
                    
                    const processBtn = document.getElementById('process-tracking-btn')
                    if (processBtn) processBtn.style.display = 'none'
                    
                    // locks the tracking box so it cannot be dragged or natively resized during initialized status
                    trackBox.style.pointerEvents = 'none'
                    trackingState = 'initialized'

                    // Enters Tracking Confirmation Phase
                    setTimePanelEnabled(true)
                    setAlphaEnabled(true)
                    
                    // Jumps timeline scrubber and video back to the start of the interval block
                    if (trackLayer && typeof activeNode !== 'undefined' && activeNode) {
                        const activeObj = trackLayer.objects.find(o => o.node === activeNode)
                        if (activeObj && video) {
                            video.currentTime = activeObj.startTime
                            
                            const scrubber = document.getElementById('timeline-scrubber')
                            const progress = document.getElementById('scrubber-progress')
                            if (scrubber && progress && video.duration) {
                                scrubber.value = activeObj.startTime
                                progress.style.width = (activeObj.startTime / video.duration) * 100 + '%'
                            }
                        }
                    }

                    // syncs UI lock to initialized state
                    if (typeof updateUILockState === 'function') updateUILockState()
                    
                    if (shapesTab) {
                        requestAnimationFrame(() => {
                            shapesTab.scrollTop = shapesTab.scrollHeight
                        })
                    }
                }
            } catch (err) {
                console.error('Target initialization error:', err)
                if (authErrorDisplay) {
                    authErrorDisplay.innerText = `Error: ${err.message}`
                    authErrorDisplay.style.display = 'block'
                }
            } finally {
                initTargetBtn.innerText = 'Initialize Target'
                initTargetBtn.style.opacity = '1'
            }
        })
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            if (confirmBtn) confirmBtn.blur()
            const shapesTab = document.getElementById('shapes-tab')
            const savedScroll = shapesTab ? shapesTab.scrollTop : 0

            // handles ui switch
            confirmBtn.style.display = 'none'
            editBtn.style.display = 'none'
            
            const reinitBtn = document.getElementById('reinit-track-box-btn')
            if (reinitBtn) {
                reinitBtn.style.display = 'block'
                reinitBtn.style.opacity = '1'
                reinitBtn.style.pointerEvents = 'auto'
            }

            // state lock
            trackingState = 'confirmed'
            trackBox.style.pointerEvents = 'none'
            trackBox.style.border = '2px solid #f1c40f'
            trackBox.style.outline = 'none'

            const labelTab = document.getElementById('track-box-label')
            if (labelTab) {
                labelTab.style.backgroundColor = '#f1c40f'
                labelTab.style.color = '#000000'
            }

            // Hides HTML elements instantly to prevent double-rendering
            trackBox.style.display = 'none'
            if (labelTab) labelTab.style.display = 'none'

            // We no longer create the Konva object here, we format the existing invisible one!
            const trackLayer = appLayers.find(l => l.type === 'tracking')
            if (trackLayer && typeof activeNode !== 'undefined' && activeNode) {
                const latestObj = trackLayer.objects.find(o => o.node === activeNode)
                if (latestObj) {
                    latestObj.node.setAttr('trackingId', identId.innerText) 

                    const boxData = JSON.parse(trackBox.dataset.initBox)
                    if (boxData) {
                        latestObj.node.setAttr('nativeBox', boxData)
                    }

                    const canvasCont = document.getElementById('canvas-container')
                    const canvasLeft = parseFloat(canvasCont.style.left) || 0
                    const canvasTop = parseFloat(canvasCont.style.top) || 0
                    
                    const boxLeft = parseFloat(trackBox.style.left) || 0
                    const boxTop = parseFloat(trackBox.style.top) || 0
                    const boxWidth = parseFloat(trackBox.style.width) || 150
                    const boxHeight = parseFloat(trackBox.style.height) || 150

                    // updates konva group properties to match drawn html dimensions and origins
                    latestObj.node.width(boxWidth)
                    latestObj.node.height(boxHeight)
                    latestObj.node.offsetX(boxWidth / 2)
                    latestObj.node.offsetY(boxHeight / 2)

                    latestObj.node.x((boxLeft - canvasLeft) + (boxWidth / 2))
                    latestObj.node.y((boxTop - canvasTop) + (boxHeight / 2))
                    
                    latestObj.node.draggable(false)
                    latestObj.node.listening(true)
                    latestObj.node.opacity(1) // Show the Konva node!
                    
                    // Strips the dashed transformer instantly
                    if (typeof transformer !== 'undefined') transformer.nodes([])

                    const rect = latestObj.node.findOne('.target-rect')
                    if (rect) {
                        rect.width(boxWidth)
                        rect.height(boxHeight)
                        rect.stroke('#f1c40f')
                        rect.strokeWidth(2)
                        rect.dash([])
                    }

                    // instantly aligns reticle to the center of the confirmed box dimensions
                    const reticle = latestObj.node.findOne('.target-reticle')
                    if (reticle) {
                        reticle.x(boxWidth / 2)
                        reticle.y(boxHeight / 2)
                    }

                    const label = latestObj.node.findOne('.target-label')
                    if (label) label.visible(true)
                    
                    const tag = latestObj.node.findOne('Tag')
                    if (tag) tag.fill('#f1c40f')
                    
                    const text = latestObj.node.findOne('.target-text')
                    if (text) {
                        text.text(trackBox.dataset.targetName)
                        text.fill('#000000')
                    }
                }
                
                if (typeof renderLayersUI === 'function') renderLayersUI()

                if (processBtn) {
                    processBtn.style.display = 'block'
                    processBtn.disabled = false
                    processBtn.removeAttribute('disabled')
                    processBtn.classList.remove('disabled')
                    processBtn.style.opacity = '1'
                    processBtn.style.pointerEvents = 'auto'
                    processBtn.style.cursor = 'pointer'
                    processBtn.style.backgroundColor = '#00a8ff'
                    processBtn.style.color = '#fff'
                }
            }
            
            // Enters Processing Phase
            setTimePanelEnabled(true)
            setAlphaEnabled(false)

            if (shapesTab) {
                requestAnimationFrame(() => {
                    shapesTab.scrollTop = savedScroll
                })
            }
        })
    }

    const revertToEditPhase = () => {
        trackingState = 'editing'
        trackBox.style.pointerEvents = 'auto'
        
        // Reveals html box
        trackBox.style.display = 'block'
        trackBox.style.border = '2px dashed #9b59b6'
        trackBox.style.outline = '2px solid rgba(155, 89, 182, 0.4)'
        
        // Reveals html label
        const labelTab = document.getElementById('track-box-label')
        if (labelTab) {
            labelTab.style.display = 'block'
            labelTab.style.backgroundColor = '#9b59b6'
            labelTab.style.color = '#ffffff'
        }

        // Unlocks the name input so the user can edit it again
        const nameInput = document.getElementById('track-target-name')
        if (nameInput) nameInput.disabled = false

        // Hides Konva node to prevent duplication during edit cycle, but preserves object for time panel!
        const trackLayer = appLayers.find(l => l.type === 'tracking')
        if (trackLayer && typeof activeNode !== 'undefined' && activeNode) {
            const latestObj = trackLayer.objects.find(o => o.node === activeNode)
            if (latestObj) {
                latestObj.node.opacity(0)
                latestObj.node.listening(false)
                latestObj.node.setAttr('trackingId', null)
            }
        }
        
        if (editBtn) editBtn.style.display = 'none'
        
        const reinitBtn = document.getElementById('reinit-track-box-btn')
        if (reinitBtn) reinitBtn.style.display = 'none'
        
        if (confirmBtn) {
            confirmBtn.style.display = 'block'
            confirmBtn.disabled = true
            confirmBtn.style.opacity = '0.3'
            confirmBtn.style.pointerEvents = 'none'
        }
        
        initTargetBtn.style.display = 'block'
        trackIdentifiers.style.display = 'none'
        
        processBtn.style.display = 'none'
        processBtn.style.opacity = '0.3'
        processBtn.style.pointerEvents = 'none'
        
        // Re-enters Initialization Phase
        setTimePanelEnabled(false)
        setAlphaEnabled(true)
        
        if (typeof updateUILockState === 'function') updateUILockState()
    }

    if (editBtn) editBtn.addEventListener('click', revertToEditPhase)
    
    const reinitTrackBoxBtn = document.getElementById('reinit-track-box-btn')
    if (reinitTrackBoxBtn) reinitTrackBoxBtn.addEventListener('click', revertToEditPhase)

    if (processBtn) {
        processBtn.onclick = async () => {
            const video = document.getElementById('main-video')
            const backendStatus = document.getElementById('backend-status')
            const connectBtn = document.getElementById('backend-connect-btn')
            const propsPanel = document.getElementById('track-edit-panel')
            
            // builds dynamic log terminal if it does not exist
            let logBox = document.getElementById('tracking-logs')
            if (!logBox && propsPanel) {
                const wrapper = document.createElement('div')
                wrapper.style.cssText = 'margin-top: 15px; background: #1e272e; border: 1px solid #485460; border-radius: 4px; padding: 8px; height: 160px; overflow-y: auto; font-family: monospace; font-size: 10px;'
                
                const title = document.createElement('div')
                title.innerText = 'SYSTEM LOGS'
                title.style.cssText = 'color: #00a8ff; font-weight: bold; margin-bottom: 5px; letter-spacing: 1px;'
                
                logBox = document.createElement('div')
                logBox.id = 'tracking-logs'
                
                wrapper.appendChild(title)
                wrapper.appendChild(logBox)
                propsPanel.appendChild(wrapper)
            }

            if (logBox) logBox.innerHTML = ''

            const appendLog = (msg, type = 'info') => {
                if (!logBox) return null
                const entry = document.createElement('div')
                entry.style.marginBottom = '3px'
                const time = new Date().toISOString().substring(11, 23)
                let color = '#d2dae2'
                if (type === 'success') color = '#0be881'
                if (type === 'error') color = '#ff3f34'
                if (type === 'warn') color = '#ffa801'
                
                entry.style.color = color
                entry.innerText = `[${time}] ${msg}`
                logBox.appendChild(entry)
                
                // targets the wrapper element containing the overflow property to execute scroll update
                if (logBox.parentNode) {
                    logBox.parentNode.scrollTop = logBox.parentNode.scrollHeight
                }
                
                return entry
            }

            appendLog('Process button engaged', 'info')
            
            const activeUrl = connectBtn ? connectBtn.dataset.activeUrl : null
            const activeToken = connectBtn ? connectBtn.dataset.activeToken : null

            // validates active backend connection parameters
            if (!activeUrl || !activeToken) {
                appendLog('Connection failed: Server URL or token missing', 'error')
                alert("Communication Failure: You must hit the 'Connect' button to link to Hugging Face before tracking")
                if (backendStatus) backendStatus.innerText = 'Status: Connection Required'
                return
            }

            let obj = null
            const identIdNode = document.getElementById('ident-id')
            const currentIdentId = identIdNode ? identIdNode.innerText : null

            // strictly locates the tracking object linked to the target ID currently displayed in the panel
            appLayers.forEach(layer => {
                if (layer.type === 'tracking') {
                    const found = layer.objects.find(o => o.node && o.node.getAttr('trackingId') === currentIdentId)
                    if (found) obj = found
                }
            })

            // fallbacks to active node if it belongs to the tracking layer
            if (!obj) {
                appLayers.forEach(layer => {
                    if (layer.type === 'tracking') {
                        const found = layer.objects.find(o => o.node === activeNode)
                        if (found) obj = found
                    }
                })
            }

            if (!obj) {
                appendLog('Validation failed: No active tracking object selected', 'error')
                alert("Selection Error: Please select a valid tracking target before processing")
                return
            }

            // synchronizes the global active node state with the auto selected object
            if (activeNode !== obj.node && typeof setActiveNode === 'function') {
                setActiveNode(obj.node)
                if (typeof renderLayersUI === 'function') renderLayersUI()
            }

            // locks specific ui areas during processing
            const bottomControls = document.getElementById('bottom-controls')
            const tabHeader = document.querySelector('.tab-header')
            if (bottomControls) {
                bottomControls.style.pointerEvents = 'none'
                bottomControls.style.opacity = '0.3'
            }
            if (tabHeader) {
                tabHeader.style.pointerEvents = 'none'
                tabHeader.style.opacity = '0.3'
            }

            appendLog(`Target object located: ${obj.name}`, 'success')
            if (backendStatus) {
                backendStatus.innerText = 'Status: Extracting Frames...'
                backendStatus.style.color = '#f39c12'
            }

            const boxDataStr = document.getElementById('tracking-target-box').dataset.initBox || "{}"
            
            const startTime = Number(obj.startTime) || 0
            const endTime = Number(obj.endTime) || (startTime + 0.3)
            const fps = 30
            const interval = 1 / fps
            const originalTime = video.currentTime
            const frames = []
            
            appendLog(`Initializing extraction: ${startTime.toFixed(2)}s to ${endTime.toFixed(2)}s at ${fps} FPS`, 'info')

            // Pings backend to start the console spinner while the UI does the heavy lifting
            fetch(`${activeUrl}/notify_extraction`, { method: 'POST', headers: { 'Authorization': `Bearer ${activeToken}` } }).catch(() => {})

            const canvas = document.createElement('canvas')
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const ctx = canvas.getContext('2d')

            const scrubber = document.getElementById('timeline-scrubber')
            const progress = document.getElementById('scrubber-progress')
            const scrubberWrap = document.getElementById('scrubber-wrap')
            const objLane = document.getElementById('active-obj-lane')
            
            let spinnerOverlay = null

            try {
                // disables process button instantly upon click to prevent duplicate submissions
                if (processBtn) {
                    processBtn.style.opacity = '0.3'
                    processBtn.style.pointerEvents = 'none'
                }
                
                const reinitBtn = document.getElementById('reinit-track-box-btn')
                if (reinitBtn) {
                    reinitBtn.disabled = true
                    reinitBtn.style.opacity = '0.3'
                    reinitBtn.style.pointerEvents = 'none'
                }
                
                const shapesTab = document.getElementById('shapes-tab')
                if (shapesTab) {
                    requestAnimationFrame(() => {
                        shapesTab.scrollTop = shapesTab.scrollHeight
                    })
                }

                // suspends heavy CSS rendering during rapid frame extraction to prevent browser lockups
                window.isProcessingTracking = true
                video.style.filter = 'none'
                const maskLayer = document.getElementById('filter-mask-layer')
                if (maskLayer) maskLayer.style.display = 'none'

                // explicitly hides any static filter reticles that may be stuck on screen due to render loop suspension
                appLayers.forEach(l => {
                    if (l.type === 'filter') {
                        l.objects.forEach(o => {
                            if (o.node) {
                                const reticle = o.node.findOne('.dof-static-reticle')
                                if (reticle) {
                                    reticle.visible(false)
                                    if (o.node.getLayer()) o.node.getLayer().batchDraw()
                                }
                            }
                        })
                    }
                })

                // locks the accuracy block during processing
                setAlphaEnabled(false)

                // disables and greys out timeline controls during processing
                if (scrubberWrap) {
                    scrubberWrap.style.opacity = '0.3'
                    scrubberWrap.style.pointerEvents = 'none'
                }
                if (objLane) {
                    objLane.style.opacity = '0.3'
                    objLane.style.pointerEvents = 'none'
                }

                // hides Konva node and injects animated HTML spinner overlay
                if (obj && obj.node) {
                    obj.node.opacity(0)
                    const canvasCont = document.getElementById('canvas-container')
                    const canvasLeft = parseFloat(canvasCont.style.left) || 0
                    const canvasTop = parseFloat(canvasCont.style.top) || 0
                    
                    const nodeX = obj.node.x() + canvasLeft
                    const nodeY = obj.node.y() + canvasTop
                    const rect = obj.node.findOne('.target-rect')
                    const nodeW = rect ? rect.width() : 150
                    const nodeH = rect ? rect.height() : 150

                    spinnerOverlay = document.createElement('div')
                    spinnerOverlay.id = 'tracking-spinner-overlay'
                    spinnerOverlay.style.cssText = `position:absolute; left:${nodeX}px; top:${nodeY}px; width:${nodeW}px; height:${nodeH}px; display:flex; justify-content:center; align-items:center; background:rgba(0,0,0,0.5); border:2px dashed #9b59b6; border-radius:4px; z-index:9999; backdrop-filter:blur(2px);`
                    
                    // uses inline SVG for a lightweight guaranteed-to-load spinner
                    spinnerOverlay.innerHTML = `
                        <svg width="40" height="40" viewBox="0 0 50 50" style="animation: spin 1s linear infinite;">
                            <circle cx="25" cy="25" r="20" fill="none" stroke="#9b59b6" stroke-width="4" stroke-dasharray="31.4 31.4" stroke-linecap="round"></circle>
                        </svg>
                        <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
                    `
                    document.getElementById('video-wrapper').appendChild(spinnerOverlay)
                }

                let frameCount = 0
                for (let t = startTime; t <= endTime; t += interval) {
                    video.currentTime = t
                    
                    // updates UI scrubber position to match extraction frame
                    if (scrubber && progress && video.duration) {
                        scrubber.value = t
                        progress.style.width = (t / video.duration) * 100 + '%'
                    }

                    await new Promise(resolve => {
                        video.addEventListener('seeked', resolve, { once: true })
                    })

                    // Dynamically updates spinner boundary box during extraction
                    const trackData = obj.node.getAttr('trackingData')
                    if (trackData && spinnerOverlay) {
                        const tFps = obj.node.getAttr('trackingFps') || 30
                        const tStart = obj.node.getAttr('trackingStartTime') || obj.startTime
                        const frameIdx = Math.max(0, Math.floor((t - tStart) * tFps))
                        const frameData = trackData[frameIdx] || trackData[trackData.length - 1]
                        
                        if (frameData && !frameData.lost) {
                            const vRatio = video.videoWidth / video.videoHeight
                            const eRatio = video.clientWidth / video.clientHeight
                            let bW = video.clientWidth, bH = video.clientHeight
                            
                            if (eRatio > vRatio) {
                                bH = video.clientHeight
                                bW = bH * vRatio
                            } else {
                                bW = video.clientWidth
                                bH = bW / vRatio
                            }

                            const vOffsetX = (video.clientWidth - bW) / 2
                            const vOffsetY = (video.clientHeight - bH) / 2
                            const vScaleX = bW / video.videoWidth
                            const vScaleY = bH / video.videoHeight
                            
                            spinnerOverlay.style.left = ((frameData.x * vScaleX) + vOffsetX) + 'px'
                            spinnerOverlay.style.top = ((frameData.y * vScaleY) + vOffsetY) + 'px'
                            spinnerOverlay.style.width = (frameData.w * vScaleX) + 'px'
                            spinnerOverlay.style.height = (frameData.h * vScaleY) + 'px'
                        }
                    }

                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                    frames.push(canvas.toDataURL('image/jpeg', 0.5))
                    
                    frameCount++
                    if (frameCount % 5 === 0 || t >= endTime - interval) {
                        appendLog(`Extracted frame ${frameCount} at timestamp ${t.toFixed(3)}s`, 'info')
                    }
                }

                const payloadSize = Math.round(JSON.stringify(frames).length / 1024 / 1024)
                appendLog(`Extraction complete Total frames: ${frames.length}`, 'success')
                appendLog(`Constructing payload Estimated size: ${payloadSize} MB`, 'info')
                
                if (backendStatus) backendStatus.innerText = 'Status: Sending to Server...'
                appendLog(`Transmitting data to ${activeUrl}... awaiting server computation`, 'warn')
                
                const t0 = performance.now()
                
                const workspace = document.getElementById('workspace')
                if (workspace) workspace.style.cursor = 'wait'
                
                const spinnerEntry = appendLog('Server computing... |', 'warn')
                const spinnerChars = ['|', '/', '-', '\\']
                let spinIdx = 0
                const spinInterval = setInterval(() => {
                    if (spinnerEntry) {
                        const timeStr = spinnerEntry.innerText.substring(0, 15) 
                        spinnerEntry.innerText = `${timeStr}Server computing... ${spinnerChars[spinIdx++ % 4]}`
                    }
                }, 100)
                
                const response = await fetch(`${activeUrl}/track_frames`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${activeToken}`
                    },
                    body: JSON.stringify({
                        box: JSON.parse(boxDataStr),
                        frames: frames
                    })
                })
                
                const t1 = performance.now()
                const computeTime = ((t1 - t0) / 1000).toFixed(2)

                clearInterval(spinInterval)
                if (spinnerEntry) {
                    const timeStr = spinnerEntry.innerText.substring(0, 15)
                    spinnerEntry.innerText = `${timeStr}Server computing... DONE`
                }
                if (workspace) workspace.style.cursor = 'default'

                if (!response.ok) throw new Error(`Server responded with ${response.status}`)

                const trackingData = await response.json()
                
                if (trackingData.status === 'success') {
                    appendLog(`Server response received in ${computeTime}s`, 'success')

                    // expands bounding box dimensions by 15 percent to prevent edge clipping
                    const paddingPct = 0.15 
                    const paddedData = trackingData.data.map(frame => {
                        if (frame.lost) return frame
                        const padX = frame.w * paddingPct
                        const padY = frame.h * paddingPct
                        return {
                            ...frame,
                            x: frame.x - (padX / 2),
                            y: frame.y - (padY / 2),
                            w: frame.w + padX,
                            h: frame.h + padY
                        }
                    })
                    
                    // calculates exponential moving average for fluidity
                    // sets alpha parameter to reduce coordinate lag during fast motion
                    const smoothData = (frames, alpha = 0.31) => {
                        if (!frames || frames.length === 0) return frames
                        
                        const smoothed = []
                        let lastValid = null

                        for (let frame of frames) {
                            if (!frame.lost) {
                                lastValid = { x: frame.x, y: frame.y, w: frame.w, h: frame.h }
                                break
                            }
                        }

                        if (!lastValid) return frames

                        for (let i = 0; i < frames.length; i++) {
                            const current = frames[i]
                            
                            if (current.lost) {
                                smoothed.push(current)
                                continue
                            }
                            
                            const smoothedFrame = {
                                ...current,
                                x: (current.x * alpha) + (lastValid.x * (1 - alpha)),
                                y: (current.y * alpha) + (lastValid.y * (1 - alpha)),
                                w: (current.w * alpha) + (lastValid.w * (1 - alpha)),
                                h: (current.h * alpha) + (lastValid.h * (1 - alpha))
                            }
                            
                            smoothed.push(smoothedFrame)
                            lastValid = smoothedFrame
                        }
                        
                        return smoothed
                    }
                    
                    // fetches dynamic alpha value from the UI
                    const uiAlphaInput = document.getElementById('track-prop-alpha')
                    const userAlpha = uiAlphaInput ? parseFloat(uiAlphaInput.value) : 0.31
                    const finalAlpha = (isNaN(userAlpha) || userAlpha <= 0) ? 0.31 : userAlpha

                    const smoothedTrackingData = smoothData(trackingData.data, finalAlpha)

                    appendLog(`Calculating center coordinates for ${smoothedTrackingData.length} smoothed frames`, 'info')
                    
                    // calculates center points for each frame and handles obscured targets
                    const centerPoints = smoothedTrackingData.map((frame, idx) => {
                        if (frame.lost) return { frame: idx, cx: null, cy: null, lost: true }
                        return {
                            frame: idx,
                            cx: Math.round(frame.x + (frame.w / 2)),
                            cy: Math.round(frame.y + (frame.h / 2)),
                            lost: false
                        }
                    })
                    
                    appendLog(`Writing tracking data and center points to node attributes`, 'info')
                    
                    // saves smoothed coordinates to konva node attributes safely
                    if (obj && obj.node) {
                        obj.node.setAttr('trackingData', smoothedTrackingData)
                        obj.node.setAttr('centerPoints', centerPoints)
                        
                        obj.node.setAttr('trackingFps', fps)
                        obj.node.setAttr('trackingStartTime', startTime)
                    } else {
                        appendLog('Warning: Target node focus was lost during processing Data may not have saved', 'warn')
                    }
                    
                    if (backendStatus) {
                        backendStatus.innerText = 'Status: Tracking Complete'
                        backendStatus.style.color = '#4cd137'
                    }
                    appendLog('Process completed successfully', 'success')
                }
            } catch (err) {
                appendLog(`Fatal error: ${err.message}`, 'error')
                if (backendStatus) {
                    backendStatus.innerText = 'Status: Tracking Failed'
                    backendStatus.style.color = '#e74c3c'
                }
            } finally {
                // restores specific ui areas
                const bottomControls = document.getElementById('bottom-controls')
                const tabHeader = document.querySelector('.tab-header')
                if (bottomControls) {
                    bottomControls.style.pointerEvents = 'auto'
                    bottomControls.style.opacity = '1'
                }
                if (tabHeader) {
                    tabHeader.style.pointerEvents = 'auto'
                    tabHeader.style.opacity = '1'
                }

                if (typeof spinInterval !== 'undefined') clearInterval(spinInterval)
                
                const workspace = document.getElementById('workspace')
                if (workspace) workspace.style.cursor = 'default'
                
                // restores rendering state flag so main js redraws the filters instantly
                window.isProcessingTracking = false
                
                // restores timeline UI styles
                if (scrubberWrap) {
                    scrubberWrap.style.opacity = '1'
                    scrubberWrap.style.pointerEvents = 'auto'
                }
                if (objLane) {
                    objLane.style.opacity = '1'
                    objLane.style.pointerEvents = 'auto'
                }

                // cleans up spinner and restores Konva node visibility
                if (spinnerOverlay) spinnerOverlay.remove()
                if (obj && obj.node) {
                    obj.node.opacity(1)
                    // forces konva to immediately push updated opacity to canvas
                    if (obj.node.getLayer()) obj.node.getLayer().batchDraw()
                }
                
                // restores scrubber interactions and sets position to START time
                if (scrubber) {
                    scrubber.disabled = false
                    scrubber.style.pointerEvents = 'auto'
                    if (progress && video.duration) {
                        scrubber.value = startTime
                        progress.style.width = (startTime / video.duration) * 100 + '%'
                    }
                }
                
                video.currentTime = startTime
                appendLog(`Video timeline restored to start time ${startTime.toFixed(2)}s`, 'info')

                // Greys out and locks the process button again
                const processBtn = document.getElementById('process-tracking-btn')
                if (processBtn) {
                    processBtn.style.opacity = '0.3'
                    processBtn.style.pointerEvents = 'none'
                }

                // keeps the accuracy block locked after processing
                setAlphaEnabled(false)

                // Forces the shapes tab to scroll to the bottom to reveal the final logs
                const shapesTab = document.getElementById('shapes-tab')
                if (shapesTab) shapesTab.scrollTop = shapesTab.scrollHeight
            }
        }
    }
}

// universal module to bind position tracking UI to any konva node
export function bindFollowModule(node, isFilterType = false) {
    const followPanel = document.getElementById('follow-edit-panel')
    const followModeSelect = document.getElementById('follow-mode-select')
    const followTrackedOption = document.getElementById('follow-tracked-option')
    const followTargetSelect = document.getElementById('follow-target-select')
    const followStaticWrapper = document.getElementById('follow-static-wrapper')
    const followTrackedWrapper = document.getElementById('follow-tracked-wrapper')
    const followTrackAnchorBtn = document.getElementById('follow-track-anchor-btn')
    const followAnchorX = document.getElementById('follow-anchor-x') 
    const followAnchorY = document.getElementById('follow-anchor-y')    
    const followStaticBtn = document.getElementById('follow-set-static-btn')
    const cancelStaticBtn = document.getElementById('cancel-static-btn')
    const followEditAnchorBtn = document.getElementById('follow-edit-anchor-btn')
    const cancelAnchorBtn = document.getElementById('cancel-anchor-btn')

    const followValX = document.getElementById('follow-val-x')
    const followValY = document.getElementById('follow-val-y')
    const video = document.getElementById('main-video')

    const smoothInput = document.getElementById('follow-smooth-input')
    const smoothUp = document.getElementById('smooth-up')
    const smoothDown = document.getElementById('smooth-down')

    const radiusInput = document.getElementById('follow-radius-input')
    const radiusSlider = document.getElementById('follow-radius-slider')
    const radiusUp = document.getElementById('radius-up')
    const radiusDown = document.getElementById('radius-down')
    const sampleAreaToggle = document.getElementById('show-sample-area-toggle')
    const canvasGridToggle = document.getElementById('show-canvas-grid-toggle')

    const updateSampleCircle = (val) => {
        const targetId = node.getAttr('followTargetId')
        if (!targetId || targetId === 'none') return
        let trackObj = null
        appLayers.forEach(l => {
            if (l.type === 'tracking') {
                const found = l.objects.find(o => o.id == targetId)
                if (found) trackObj = found
            }
        })
        if (trackObj && trackObj.node) {
            const circle = trackObj.node.findOne('.sample-area-circle')
            if (circle) {
                circle.radius(val)
                if (trackObj.node.getLayer()) trackObj.node.getLayer().batchDraw()
            }
        }
    }

    // toggles visibility of sample area circle based on edit state and manual toggle
    const updateSampleCircleVisibility = () => {
        const forceShow = sampleAreaToggle ? sampleAreaToggle.checked : false
        let shouldReorderLayers = false

        if (activeNode && !window.isEditingAnchor) {
            activeNode.opacity(forceShow ? 0.5 : 1)
        }

        appLayers.forEach(l => {
            if (l.type === 'tracking') {
                l.objects.forEach(o => {
                    if (o.node) {
                        const circle = o.node.findOne('.sample-area-circle')
                        if (circle) {
                            const isEditingTarget = window.isEditingAnchor && activeNode && activeNode.getAttr('followTargetId') == o.id
                            circle.visible(isEditingTarget || forceShow)
                            
                            if (isEditingTarget || forceShow) {
                                if (o.node.getLayer()) o.node.getLayer().moveToTop()
                            } else if (!forceShow && !window.isEditingAnchor) {
                                shouldReorderLayers = true
                            }
                            
                            // implements clockwise rotation animation while actively editing the anchor
                            if (isEditingTarget) {
                                if (!circle.anim) {
                                    circle.anim = new Konva.Animation((frame) => {
                                        circle.rotate((frame.timeDiff * 90) / 1000)
                                    }, circle.getLayer())
                                }
                                if (!circle.anim.isRunning()) circle.anim.start()
                            } else {
                                if (circle.anim && circle.anim.isRunning()) {
                                    circle.anim.stop()
                                }
                            }
                        }
                        if (o.node.getLayer()) o.node.getLayer().batchDraw()
                    }
                })
            }
        })
        
        if (activeNode && activeNode.getLayer()) activeNode.getLayer().batchDraw()
        if (shouldReorderLayers && typeof renderLayersUI === 'function') renderLayersUI()
    }

    if (sampleAreaToggle) {
        sampleAreaToggle.onchange = updateSampleCircleVisibility
    }

    const gridDensityInput = document.getElementById('canvas-grid-density')
    const gridDensityWrap = document.getElementById('grid-density-wrap')
    const gridDensityUp = document.getElementById('grid-density-up')
    const gridDensityDown = document.getElementById('grid-density-down')

    if (canvasGridToggle) {
        canvasGridToggle.onchange = (e) => {
            if (gridDensityWrap) gridDensityWrap.style.display = e.target.checked ? 'flex' : 'none'
            const density = gridDensityInput ? (parseInt(gridDensityInput.value, 10) || 20) : 20
            if (typeof toggleCanvasGrid === 'function') toggleCanvasGrid(e.target.checked, density)
        }
    }

    if (gridDensityInput) {
        gridDensityInput.onchange = () => {
            let val = parseInt(gridDensityInput.value, 10)
            if (isNaN(val) || val < 10) val = 10
            if (val > 200) val = 200
            gridDensityInput.value = val
            if (canvasGridToggle && canvasGridToggle.checked) {
                if (typeof toggleCanvasGrid === 'function') toggleCanvasGrid(true, val)
            }
        }
    }

    if (gridDensityUp && gridDensityInput) {
        gridDensityUp.onclick = () => {
            let val = parseInt(gridDensityInput.value, 10) + 10
            if (val > 200) val = 200
            gridDensityInput.value = val
            gridDensityInput.dispatchEvent(new Event('change'))
        }
    }

    if (gridDensityDown && gridDensityInput) {
        gridDensityDown.onclick = () => {
            let val = parseInt(gridDensityInput.value, 10) - 10
            if (val < 10) val = 10
            gridDensityInput.value = val
            gridDensityInput.dispatchEvent(new Event('change'))
        }
    }

    // calculates and applies moving average to cached optical flow dataset
    const applyAnchorSmoothing = () => {
        if (!activeNode) return
        const rawData = activeNode.getAttr('rawAnchorFlowData')
        if (!rawData || rawData.length === 0) return

        const smoothFactor = activeNode.getAttr('anchorSmoothFactor') || 5
        const halfWindow = Math.floor(smoothFactor / 2)

        const smoothedData = rawData.map((frame, i, arr) => {
            let sumX = 0, sumY = 0, count = 0
            
            // dynamically calculates a symmetrical window for zero-phase smoothing to eliminate tracking lag while locking the starting coordinate
            const maxSafeOffset = Math.min(i, arr.length - 1 - i, halfWindow)
            
            for (let j = i - maxSafeOffset; j <= i + maxSafeOffset; j++) {
                sumX += arr[j].x
                sumY += arr[j].y
                count++
            }
            return { ...frame, x: sumX / count, y: sumY / count }
        })

        activeNode.setAttr('anchorFlowData', smoothedData)
        
        const video = document.getElementById('main-video')
        if (video) video.dispatchEvent(new Event('timeupdate'))
    }

    // unlocks follow track button and clears optical flow data memory
    const unlockFollowTrackBtn = () => {
        if (followTrackAnchorBtn && followTrackAnchorBtn.style.opacity === '0.3') {
            if (window.isEditingAnchor) return // strictly prevents unlocking while actively editing the anchor position
            
            followTrackAnchorBtn.style.opacity = '1'
            followTrackAnchorBtn.style.pointerEvents = 'auto'
            followTrackAnchorBtn.innerText = 'Track Anchor Feature'
            followTrackAnchorBtn.style.backgroundColor = '#9b59b6'
            
            const dragNote = document.getElementById('follow-drag-note')
            if (dragNote) dragNote.style.display = 'block'
            
            if (activeNode) {
                activeNode.setAttr('anchorFlowData', null)
                activeNode.setAttr('rawAnchorFlowData', null)
            }
        }
    }

    if (smoothInput) {
        smoothInput.onchange = () => {
            if (activeNode) {
                activeNode.setAttr('anchorSmoothFactor', parseInt(smoothInput.value) || 5)
                applyAnchorSmoothing()
                unlockFollowTrackBtn()
            }
        }
    }
    
    if (smoothUp && smoothInput) {
        smoothUp.onclick = () => {
            let val = parseInt(smoothInput.value) || 1
            if (val < 31) smoothInput.value = val + 2
            if (activeNode) {
                activeNode.setAttr('anchorSmoothFactor', parseInt(smoothInput.value))
                applyAnchorSmoothing()
                unlockFollowTrackBtn()
            }
        }
    }
    
    if (smoothDown && smoothInput) {
        smoothDown.onclick = () => {
            let val = parseInt(smoothInput.value) || 1
            if (val > 1) smoothInput.value = val - 2
            if (activeNode) {
                activeNode.setAttr('anchorSmoothFactor', parseInt(smoothInput.value))
                applyAnchorSmoothing()
                unlockFollowTrackBtn()
            }
        }
    }

    if (radiusSlider) {
        radiusSlider.oninput = (e) => {
            let val = parseInt(e.target.value) || 1
            if (val < 1) val = 1
            if (activeNode) activeNode.setAttr('anchorSampleRadius', val)
            updateSampleCircle(val)
            if (radiusInput) radiusInput.value = val
            unlockFollowTrackBtn()
        }
    }

    if (radiusInput) {
        radiusInput.onchange = () => {
            let val = parseInt(radiusInput.value) || 1
            if (val < 1) val = 1
            if (activeNode) activeNode.setAttr('anchorSampleRadius', val)
            updateSampleCircle(val)
            if (radiusSlider) radiusSlider.value = val
            unlockFollowTrackBtn()
        }
    }
    
    if (radiusUp && radiusInput) {
        radiusUp.onclick = () => {
            let val = parseInt(radiusInput.value) || 1
            if (val < 100) radiusInput.value = val + 2
            val = parseInt(radiusInput.value)
            if (activeNode) activeNode.setAttr('anchorSampleRadius', val)
            updateSampleCircle(val)
            if (radiusSlider) radiusSlider.value = val
            unlockFollowTrackBtn()
        }
    }
    
    if (radiusDown && radiusInput) {
        radiusDown.onclick = () => {
            let val = parseInt(radiusInput.value) || 1
            if (val > 2) {
                radiusInput.value = val - 2
            } else {
                radiusInput.value = 1
            }
            val = parseInt(radiusInput.value)
            if (activeNode) activeNode.setAttr('anchorSampleRadius', val)
            updateSampleCircle(val)
            if (radiusSlider) radiusSlider.value = val
            unlockFollowTrackBtn()
        }
    }

    // resets anchor editing state to prevent overlapping events across node switches
    if (followEditAnchorBtn && followEditAnchorBtn.innerText === 'Lock Anchor Position') {
        window.isEditingAnchor = false
        followEditAnchorBtn.innerText = 'Edit Anchor Position'
        followEditAnchorBtn.style.backgroundColor = '#f39c12'
        
        if (followTrackAnchorBtn) {
            followTrackAnchorBtn.style.opacity = '1'
            followTrackAnchorBtn.style.pointerEvents = 'auto'
        }
        if (followModeSelect) {
            followModeSelect.style.opacity = '1'
            followModeSelect.style.pointerEvents = 'auto'
        }
        if (followTargetSelect) {
            followTargetSelect.style.opacity = '1'
            followTargetSelect.style.pointerEvents = 'auto'
        }
        const timePanel = document.getElementById('time-edit-panel')
        if (timePanel) {
            timePanel.style.opacity = '1'
            timePanel.style.pointerEvents = 'auto'
        }
        const filterTypeSelect = document.getElementById('edit-filter-type')
        if (filterTypeSelect) {
            filterTypeSelect.style.opacity = '1'
            filterTypeSelect.style.pointerEvents = 'auto'
        }
        const dofPropsBlock = document.getElementById('dof-properties-block')
        if (dofPropsBlock) {
            dofPropsBlock.style.opacity = '1'
            dofPropsBlock.style.pointerEvents = 'auto'
        }
        if (smoothInput && smoothInput.parentNode && smoothInput.parentNode.parentNode) {
            smoothInput.parentNode.parentNode.style.opacity = '1'
            smoothInput.parentNode.parentNode.style.pointerEvents = 'auto'
        }
        
        window.isEditingStatic = false
        window.isEditingAnchor = false
        if (cancelStaticBtn) cancelStaticBtn.style.display = 'none'
        if (cancelAnchorBtn) cancelAnchorBtn.style.display = 'none'
        
        const dragNote = document.getElementById('follow-drag-note')
        if (dragNote) dragNote.style.display = 'none'

        appLayers.forEach(l => {
            if (l.type === 'tracking') {
                l.objects.forEach(o => {
                    if (o.node) {
                        const r = o.node.findOne('.target-reticle')
                        if (r) {
                            r.draggable(false)
                            r.off('dragmove.anchor mouseenter.anchor mouseleave.anchor mousedown.anchor mouseup.anchor dragstart.anchor dragend.anchor')
                            r.dragBoundFunc(null)
                        }
                    }
                })
            }
        })
        
        // restores rendering stack order dynamically on abort
        if (typeof renderLayersUI === 'function') renderLayersUI()
        
        const canvasCont = document.getElementById('canvas-container') || document.getElementById('video-wrapper')
        if (canvasCont) canvasCont.style.cursor = 'default'
    }

    const updateFollowUI = () => {
        let validTargets = []
        appLayers.forEach(l => {
            if (l.type === 'tracking') {
                l.objects.forEach(o => {
                    if (o.node && o.node.getAttr('trackingId')) {
                        validTargets.push({ id: o.id, name: o.name })
                    }
                })
            }
        })

        if (validTargets.length === 0) {
            if (followTrackedOption) followTrackedOption.disabled = true
            node.setAttr('followMode', 'static')
            node.setAttr('followTargetId', 'none')
        } else {
            if (followTrackedOption) followTrackedOption.disabled = false
            if (followTargetSelect) {
                followTargetSelect.innerHTML = '<option value="none">None</option>'
                validTargets.forEach(t => {
                    const opt = document.createElement('option')
                    opt.value = t.id
                    opt.innerText = t.name
                    followTargetSelect.appendChild(opt)
                })
            }
        }

        const currentMode = node.getAttr('followMode') || 'static'
        if (followModeSelect) followModeSelect.value = currentMode
        
        // Toggles the canvas crosshair visibility based on tracking mode safely for flat shapes
        const staticReticle = typeof node.findOne === 'function' ? node.findOne('.dof-static-reticle') : null
        if (staticReticle) {
            staticReticle.visible(currentMode === 'static')
            if (node.getLayer()) node.getLayer().batchDraw()
        }
        
        if (currentMode === 'static') {
            node.setAttr('followTargetId', 'none')
            if (followTargetSelect) followTargetSelect.value = 'none'
        } else if (followTargetSelect) {
            const savedId = node.getAttr('followTargetId') || 'none'
            const targetExists = validTargets.some(t => t.id === savedId)
            if (targetExists) {
                followTargetSelect.value = savedId
            } else {
                followTargetSelect.value = 'none'
                node.setAttr('followTargetId', 'none')
            }
        }
        
        const followStaticBtn = document.getElementById('follow-set-static-btn')
        if (followStaticBtn) {
            followStaticBtn.style.display = (currentMode === 'static') ? 'block' : 'none'
        }

        if (followStaticWrapper) {
            // Keeps the wrapper visible so the Active Center readout can always be seen regardless of mode
            followStaticWrapper.style.display = 'block'
        }
        
        if (followTrackedWrapper) followTrackedWrapper.style.display = (currentMode === 'tracked') ? 'block' : 'none'
        
        if (currentMode === 'tracked' && followEditAnchorBtn) {
            const hasTarget = node.getAttr('followTargetId') && node.getAttr('followTargetId') !== 'none'
            followEditAnchorBtn.style.display = hasTarget ? 'block' : 'none'
            if (followTrackAnchorBtn) followTrackAnchorBtn.style.display = hasTarget ? 'block' : 'none'
            
            if (hasTarget) {
                let trackObj = null
                appLayers.forEach(l => {
                    if (l.type === 'tracking') {
                        const found = l.objects.find(o => o.id == node.getAttr('followTargetId'))
                        if (found) trackObj = found
                    }
                })
                if (trackObj && trackObj.node) {
                    const aX = node.getAttr('targetAnchorX') ?? 0.5
                    const aY = node.getAttr('targetAnchorY') ?? 0.5
                    const rect = trackObj.node.findOne('.target-rect')
                    if (rect) {
                        const anchorPxX = trackObj.node.x() + (rect.width() * aX)
                        const anchorPxY = trackObj.node.y() + (rect.height() * aY)
                        if (followAnchorX) followAnchorX.innerText = Math.round(anchorPxX)
                        if (followAnchorY) followAnchorY.innerText = Math.round(anchorPxY)
                    }
                    
                    if (smoothInput) {
                        smoothInput.value = node.getAttr('anchorSmoothFactor') ?? 5
                    }
                    if (radiusInput) {
                        radiusInput.value = node.getAttr('anchorSampleRadius') ?? 20
                        updateSampleCircle(parseInt(radiusInput.value))
                        const radSlider = document.getElementById('follow-radius-slider')
                        if (radSlider) radSlider.value = radiusInput.value
                    }

                    // Reads active target tracking status to lock/unlock the track button
                    if (followTrackAnchorBtn) {
                        if (node.getAttr('anchorFlowData') || window.isEditingAnchor) {
                            followTrackAnchorBtn.style.opacity = '0.3'
                            followTrackAnchorBtn.style.pointerEvents = 'none'
                            followTrackAnchorBtn.innerText = 'Track Anchor Feature'
                        } else {
                            followTrackAnchorBtn.style.opacity = '1'
                            followTrackAnchorBtn.style.pointerEvents = 'auto'
                            followTrackAnchorBtn.innerText = 'Track Anchor Feature'
                        }
                    }
                }
            }
        }

        updateCenterReadout()
    }

    // Natively calculates the true center of draggable objects relative to the stage dimensions
    const updateCenterReadout = () => {
        const stageNode = node.getStage()
        if (!stageNode) return
        
        const sxUI = document.getElementById('static-anchor-x')
        const syUI = document.getElementById('static-anchor-y')

        if (isFilterType) {
            const pxX = (node.getAttr('followX') ?? 50) / 100 * stageNode.width()
            const pxY = (node.getAttr('followY') ?? 50) / 100 * stageNode.height()
            if (sxUI) sxUI.innerText = Math.round(pxX - (stageNode.width() / 2))
            if (syUI) syUI.innerText = Math.round((stageNode.height() / 2) - pxY)
        } else {
            const centerX = node.x() + ((node.width() * node.scaleX()) / 2)
            const centerY = node.y() + ((node.height() * node.scaleY()) / 2)
            if (sxUI) sxUI.innerText = Math.round(centerX - (stageNode.width() / 2))
            if (syUI) syUI.innerText = Math.round((stageNode.height() / 2) - centerY)
        }
    }

    // Binds the live readout update to native Konva drag events so the UI animates while dragging text
    if (!isFilterType) {
        node.off('dragmove.follow')
        node.on('dragmove.follow', () => {
            const fMode = node.getAttr('followMode') || 'static'
            if (fMode === 'static') {
                updateCenterReadout()
            } else if (fMode === 'tracked') {
                const targetId = node.getAttr('followTargetId')
                if (!targetId || targetId === 'none') return
                
                let trackObj = null
                appLayers.forEach(l => {
                    if (l.type === 'tracking') {
                        const found = l.objects.find(o => o.id == targetId)
                        if (found) trackObj = found
                    }
                })
                
                if (trackObj && trackObj.node) {
                    const rect = trackObj.node.findOne('.target-rect') || trackObj.node
                    
                    let dx = ((node.width() / 2) - node.offsetX()) * node.scaleX()
                    let dy = ((node.height() / 2) - node.offsetY()) * node.scaleY()
                    if (node.getClassName() === 'Circle') {
                        dx = -node.offsetX() * node.scaleX()
                        dy = -node.offsetY() * node.scaleY()
                    }
                    
                    const textCenterX = node.x() + dx
                    const textCenterY = node.y() + dy
                    
                    // maps physical drag instantly back to target anchor percentages
                    const targetTopLeftX = trackObj.node.x() - trackObj.node.offsetX()
                    const targetTopLeftY = trackObj.node.y() - trackObj.node.offsetY()
                    
                    const aX = (textCenterX - targetTopLeftX) / rect.width()
                    const aY = (textCenterY - targetTopLeftY) / rect.height()
                    
                    node.setAttr('targetAnchorX', aX)
                    node.setAttr('targetAnchorY', aY)
                    node.setAttr('anchorFlowData', null)
                    node.setAttr('rawAnchorFlowData', null)
                    
                    // syncs the hidden target reticle visually if it exists
                    const reticle = trackObj.node.findOne('.target-reticle')
                    if (reticle && !reticle.isDragging()) {
                        reticle.x(rect.width() * aX)
                        reticle.y(rect.height() * aY)
                    }
                    
                    // Unlocks the track button when text is manually dragged
                    const followTrackAnchorBtn = document.getElementById('follow-track-anchor-btn')
                    if (followTrackAnchorBtn && !window.isEditingAnchor) {
                        followTrackAnchorBtn.style.opacity = '1'
                        followTrackAnchorBtn.style.pointerEvents = 'auto'
                        followTrackAnchorBtn.innerText = 'Track Anchor Feature'
                    }

                    updateCenterReadout()
                }
            }
        })
    }

    if (followModeSelect) {
        followModeSelect.onchange = (e) => {
            const newMode = e.target.value
            node.setAttr('followMode', newMode)
            
            if (newMode === 'static') {
                const targetId = node.getAttr('followTargetId')
                if (targetId && targetId !== 'none') {
                    let trackObj = null
                    appLayers.forEach(l => {
                        if (l.type === 'tracking') {
                            const found = l.objects.find(o => o.id == targetId)
                            if (found) trackObj = found
                        }
                    })
                    
                    if (trackObj && trackObj.node) {
                        node.setAttr('targetAnchorX', 0.5)
                        node.setAttr('targetAnchorY', 0.5)
                        node.setAttr('anchorFlowData', null)
                        node.setAttr('rawAnchorFlowData', null)
                        
                        const rect = trackObj.node.findOne('.target-rect')
                        const reticle = trackObj.node.findOne('.target-reticle')
                        
                        if (rect && reticle) {
                            reticle.x(rect.width() / 2)
                            reticle.y(rect.height() / 2)
                            if (trackObj.node.getLayer()) trackObj.node.getLayer().batchDraw()
                        }
                    }
                }
            }
            updateFollowUI()
            if (video) video.dispatchEvent(new Event('timeupdate'))
        }
    }

    if (followTargetSelect) {
        followTargetSelect.onchange = (e) => {
            const prevTargetId = node.getAttr('followTargetId')
            
            // If switched to None, instantly resets the previous target's anchor back to 0.5, 0.5
            if (e.target.value === 'none' && prevTargetId && prevTargetId !== 'none') {
                let trackObj = null
                appLayers.forEach(l => {
                    if (l.type === 'tracking') {
                        const found = l.objects.find(o => o.id == prevTargetId)
                        if (found) trackObj = found
                    }
                })
                
                if (trackObj && trackObj.node) {
                    node.setAttr('targetAnchorX', 0.5)
                    node.setAttr('targetAnchorY', 0.5)
                    node.setAttr('anchorFlowData', null)
                    node.setAttr('rawAnchorFlowData', null)
                    
                    const rect = trackObj.node.findOne('.target-rect')
                    const reticle = trackObj.node.findOne('.target-reticle')
                    
                    if (rect && reticle) {
                        reticle.x(rect.width() / 2)
                        reticle.y(rect.height() / 2)
                        if (trackObj.node.getLayer()) trackObj.node.getLayer().batchDraw()
                    }
                }
            }

            node.setAttr('followTargetId', e.target.value)
            
            if (followEditAnchorBtn && followEditAnchorBtn.innerText === 'Lock Anchor Position') {
                followEditAnchorBtn.click()
            }
            updateFollowUI()
            if (video) video.dispatchEvent(new Event('timeupdate'))
        }
    }

    updateFollowUI()

    // Shared logic for both Reticle Edit Buttons (Static & Anchor)
    const setupReticleEditor = (btn, cancelBtn, mode) => {
        if (!btn) return
        
        let origState = { x: 50, y: 50, opacity: 1 }
        
        btn.onclick = () => {
            let reticle = null
            let dragEvent = `dragmove.${mode}`
            const stateKey = mode === 'static' ? 'isEditingStatic' : 'isEditingAnchor'
            const willEdit = window[stateKey] !== true
            
            if (mode === 'static') {
                reticle = (typeof node.findOne === 'function' ? node.findOne('.dof-static-reticle') : null) || (isFilterType ? null : node)
            } else {
                const targetId = node.getAttr('followTargetId')
                if (!targetId || targetId === 'none') return
                let trackObj = null
                appLayers.forEach(l => {
                    if (l.type === 'tracking') {
                        const found = l.objects.find(o => o.id == targetId)
                        if (found) trackObj = found
                    }
                })
                if (!trackObj || !trackObj.node) return
                reticle = trackObj.node.findOne('.target-reticle')
            }
            if (!reticle) return

            let dragNote = document.getElementById('follow-drag-note')
            
            const toggleUILocks = (isLocked) => {
                const opacity = isLocked ? '0.3' : '1'
                const ptrEvents = isLocked ? 'none' : 'auto'
                
                const elementsToLock = [
                    document.getElementById('follow-mode-select'),
                    document.getElementById('time-edit-panel'),
                    document.getElementById('bottom-controls'),
                    document.getElementById('edit-filter-type'),
                    document.getElementById('dof-properties-block'),
                    document.getElementById('follow-target-select')
                ]
                
                elementsToLock.forEach(el => {
                    if (el) {
                        el.style.opacity = opacity
                        el.style.pointerEvents = ptrEvents
                    }
                })

                // Custom lock logic for the track button
                const trackBtn = document.getElementById('follow-track-anchor-btn')
                if (trackBtn) {
                    if (isLocked) {
                        trackBtn.style.opacity = '0.3'
                        trackBtn.style.pointerEvents = 'none'
                    } else {
                        // Only unlocks if the anchor hasn't been tracked yet
                        if (node.getAttr('anchorFlowData')) {
                            trackBtn.style.opacity = '0.3'
                            trackBtn.style.pointerEvents = 'none'
                        } else {
                            trackBtn.style.opacity = '1'
                            trackBtn.style.pointerEvents = 'auto'
                        }
                    }
                }
                
                const smoothInp = document.getElementById('follow-smooth-input')
                if (smoothInp && smoothInp.parentNode && smoothInp.parentNode.parentNode) {
                    smoothInp.parentNode.parentNode.style.opacity = opacity
                    smoothInp.parentNode.parentNode.style.pointerEvents = ptrEvents
                }
            }

            if (willEdit) {
                window[stateKey] = true
                
                // Caches the original attributes before editing begins to allow for reverting
                if (mode === 'static') {
                    origState.x = node.getAttr('followX') ?? 50
                    origState.y = node.getAttr('followY') ?? 50
                } else {
                    origState.x = node.getAttr('targetAnchorX') ?? 0.5
                    origState.y = node.getAttr('targetAnchorY') ?? 0.5
                    origState.opacity = node.opacity() ?? 1
                }
                
                btn.innerText = mode === 'static' ? 'Lock Static Position' : 'Lock Anchor Position'
                btn.style.backgroundColor = '#00a8ff' 
                
                btn.style.fontSize = '10px'
                btn.style.whiteSpace = 'nowrap'
                
                if (mode === 'static') {
                    if (node.getAttr('filterType') === undefined) {
                        const tToggle = document.getElementById('transform-controls-toggle')
                        const iToggle = document.getElementById('image-transform-toggle')
                        let toggleToUse = null
                        if (node.getClassName() === 'Group' && tToggle) toggleToUse = tToggle
                        else if (node.getClassName() === 'Circle' && iToggle) toggleToUse = iToggle
                        
                        // forces transform toggle on when entering Edit Static Position phase
                        if (toggleToUse && !toggleToUse.checked) {
                            toggleToUse.checked = true
                            node.draggable(true)
                            if (typeof transformer !== 'undefined' && transformer) transformer.nodes([node])
                        } else if (toggleToUse && toggleToUse.checked) {
                            if (typeof transformer !== 'undefined' && transformer) transformer.nodes([node])
                        } else {
                            if (typeof transformer !== 'undefined' && transformer) transformer.nodes([])
                        }
                    } else {
                        if (typeof transformer !== 'undefined' && transformer) transformer.nodes([])
                    }
                } else if (mode === 'anchor') {
                    node.opacity(0.5) 
                    if (node.getLayer()) node.getLayer().batchDraw()
                    
                    if (typeof updateSampleCircleVisibility === 'function') updateSampleCircleVisibility()
                    
                    if (node.getAttr('filterType') === undefined) {
                        const tToggle = document.getElementById('transform-controls-toggle')
                        const iToggle = document.getElementById('image-transform-toggle')
                        let toggleToUse = null
                        if (node.getClassName() === 'Group' && tToggle) toggleToUse = tToggle
                        else if (node.getClassName() === 'Circle' && iToggle) toggleToUse = iToggle
                        
                        // forces transform toggle on when entering Edit Anchor Position phase
                        if (toggleToUse && !toggleToUse.checked) {
                            toggleToUse.checked = true
                            node.draggable(true)
                            if (typeof transformer !== 'undefined' && transformer) transformer.nodes([node])
                        } else if (toggleToUse && toggleToUse.checked) {
                            if (typeof transformer !== 'undefined' && transformer) transformer.nodes([node])
                        } else {
                            if (typeof transformer !== 'undefined' && transformer) transformer.nodes([])
                        }
                    } else {
                        if (typeof transformer !== 'undefined' && transformer) transformer.nodes([])
                    }
                } else {
                    if (typeof transformer !== 'undefined' && transformer) transformer.nodes([])
                }
                
                reticle.draggable(true)

                // dynamically forces the "move" cursor whenever hovering the active reticle
                reticle.on('mouseenter.cursor', () => {
                    const canvasCont = document.getElementById('canvas-container')
                    if (canvasCont) canvasCont.style.cursor = 'move'
                })
                reticle.on('mouseleave.cursor', () => {
                    if (!reticle.isDragging()) {
                        const canvasCont = document.getElementById('canvas-container')
                        if (canvasCont) canvasCont.style.cursor = 'default'
                    }
                })
                
                if (mode === 'anchor') {
                    reticle.moveToTop()
                    const trackId = node.getAttr('followTargetId')
                    const trackObj = appLayers.find(l => l.id === trackId || (l.objects && l.objects.some(o => o.id === trackId)))
                    let tNode = null;
                    if (trackObj && trackObj.objects) {
                         const found = trackObj.objects.find(o => o.id === trackId);
                         if (found) tNode = found.node;
                    }
                    if (tNode && tNode.getLayer()) tNode.getLayer().moveToTop()
                    
                    // removes bounding constraints to allow free placement outside the target box
                    reticle.dragBoundFunc(null)
                }
                
                if (dragNote) dragNote.style.display = 'block'
                if (cancelBtn) cancelBtn.style.display = 'flex'
                
                reticle.on(dragEvent, () => {
                    const stageNode = node.getStage()
                    if (!stageNode) return
                    const cx = stageNode.width() / 2
                    const cy = stageNode.height() / 2

                    if (mode === 'static') {
                        const pctX = (reticle.x() / stageNode.width()) * 100
                        const pctY = (reticle.y() / stageNode.height()) * 100
                        node.setAttr('followX', pctX)
                        node.setAttr('followY', pctY)
                        
                        const sxUI = document.getElementById('static-anchor-x')
                        const syUI = document.getElementById('static-anchor-y')
                        if (sxUI) sxUI.innerText = Math.round(reticle.x() - cx)
                        if (syUI) syUI.innerText = Math.round(cy - reticle.y())
                    } else {
                        const trackId = node.getAttr('followTargetId')
                        const trackObj = appLayers.find(l => l.id === trackId || (l.objects && l.objects.some(o => o.id === trackId)))
                        let tNode = null;
                        if (trackObj && trackObj.objects) {
                             const found = trackObj.objects.find(o => o.id === trackId);
                             if (found) tNode = found.node;
                        }
                        if (!tNode) return
                        const rect = tNode.findOne('.target-rect') || tNode

                        // Drag physics are handled naturally by dragBoundFunc, we only read the data.
                        const aX = reticle.x() / rect.width()
                        const aY = reticle.y() / rect.height()
                        
                        node.setAttr('targetAnchorX', aX)
                        node.setAttr('targetAnchorY', aY)
                        
                        // explicitly clears optical flow memory
                        node.setAttr('anchorFlowData', null)
                        node.setAttr('rawAnchorFlowData', null)
                        
                        const axUI = document.getElementById('follow-anchor-x')
                        const ayUI = document.getElementById('follow-anchor-y')
                        
                        // aligns absolute stage coordinates to local reticle origin offsets
                        const absX = tNode.x() - (rect.width() / 2) + reticle.x()
                        const absY = tNode.y() - (rect.height() / 2) + reticle.y()
                        if (axUI) axUI.innerText = Math.round(absX - cx)
                        if (ayUI) ayUI.innerText = Math.round(cy - absY)
                    }
                    
                    const vid = document.getElementById('main-video')
                    if (vid) vid.dispatchEvent(new Event('timeupdate'))
                })
                
                toggleUILocks(true)

            } else {
                window[stateKey] = false
                btn.innerText = mode === 'static' ? 'Edit Static Position' : 'Edit Anchor Position'
                btn.style.backgroundColor = '#f39c12' 
                
                btn.style.fontSize = ''
                btn.style.whiteSpace = ''
                
                if (mode === 'static') {
                    if (node.getAttr('filterType') === undefined) {
                        const tToggle = document.getElementById('transform-controls-toggle')
                        const iToggle = document.getElementById('image-transform-toggle')
                        let toggleToUse = null
                        if (node.getClassName() === 'Group' && tToggle) toggleToUse = tToggle
                        else if (node.getClassName() === 'Circle' && iToggle) toggleToUse = iToggle
                        
                        // forces transform toggle off when exiting Edit Static Position phase
                        if (toggleToUse && toggleToUse.checked) {
                            toggleToUse.checked = false
                            node.draggable(false)
                            if (typeof transformer !== 'undefined' && transformer) transformer.nodes([])
                        } else if (typeof transformer !== 'undefined' && transformer) {
                            transformer.nodes([])
                        }
                    } else {
                        if (typeof transformer !== 'undefined' && transformer) transformer.nodes([])
                    }
                } else if (mode === 'anchor') {
                    node.opacity(origState.opacity) 
                    if (node.getLayer()) node.getLayer().batchDraw()
                    
                    if (typeof updateSampleCircleVisibility === 'function') updateSampleCircleVisibility()
                    
                    if (node.getAttr('filterType') === undefined) {
                        const tToggle = document.getElementById('transform-controls-toggle')
                        const iToggle = document.getElementById('image-transform-toggle')
                        let toggleToUse = null
                        if (node.getClassName() === 'Group' && tToggle) toggleToUse = tToggle
                        else if (node.getClassName() === 'Circle' && iToggle) toggleToUse = iToggle
                        
                        // forces transform toggle off when exiting Edit Anchor Position phase
                        if (toggleToUse && toggleToUse.checked) {
                            toggleToUse.checked = false
                            node.draggable(false)
                            if (typeof transformer !== 'undefined' && transformer) transformer.nodes([])
                        } else if (typeof transformer !== 'undefined' && transformer) {
                            transformer.nodes([])
                        }
                    } else {
                        if (typeof transformer !== 'undefined' && transformer) transformer.nodes([])
                    }
                } else {
                    if (typeof transformer !== 'undefined' && transformer) transformer.nodes([])
                }
                
                reticle.draggable(false)
                reticle.off(dragEvent)
                
                // Strips cursor listeners and resets to default pointer
                reticle.off('mouseenter.cursor mouseleave.cursor')
                const canvasCont = document.getElementById('canvas-container')
                if (canvasCont) canvasCont.style.cursor = 'default'

                if (mode === 'anchor') reticle.dragBoundFunc(null)
                
                if (dragNote) dragNote.style.display = 'none'
                if (cancelBtn) cancelBtn.style.display = 'none'
                
                toggleUILocks(false)
                
                if (typeof renderLayersUI === 'function') renderLayersUI()
            }
        }
        
        if (cancelBtn) {
            cancelBtn.onclick = (e) => {
                e.stopPropagation()
                const stateKey = mode === 'static' ? 'isEditingStatic' : 'isEditingAnchor'
                if (window[stateKey] && btn) {
                    // Reverts to original cached state
                    if (mode === 'static') {
                        node.setAttr('followX', origState.x)
                        node.setAttr('followY', origState.y)
                        
                        const reticle = (typeof node.findOne === 'function' ? node.findOne('.dof-static-reticle') : null) || (isFilterType ? null : node)
                        const stageNode = node.getStage()
                        if (reticle && stageNode) {
                            const pxX = (origState.x / 100) * stageNode.width()
                            const pxY = (origState.y / 100) * stageNode.height()
                            reticle.x(pxX)
                            reticle.y(pxY)
                            
                            const sxUI = document.getElementById('static-anchor-x')
                            const syUI = document.getElementById('static-anchor-y')
                            const cx = stageNode.width() / 2
                            const cy = stageNode.height() / 2
                            if (sxUI) sxUI.innerText = Math.round(pxX - cx)
                            if (syUI) syUI.innerText = Math.round(cy - pxY)
                        }
                    } else {
                        node.setAttr('targetAnchorX', origState.x)
                        node.setAttr('targetAnchorY', origState.y)
                        
                        const targetId = node.getAttr('followTargetId')
                        let trackObj = null
                        appLayers.forEach(l => {
                            if (l.type === 'tracking') {
                                const found = l.objects.find(o => o.id == targetId)
                                if (found) trackObj = found
                            }
                        })
                        if (trackObj && trackObj.node) {
                            const reticle = trackObj.node.findOne('.target-reticle')
                            const rect = trackObj.node.findOne('.target-rect') || trackObj.node
                            const stageNode = trackObj.node.getStage()
                            
                            if (reticle && rect && stageNode) {
                                const pxX = rect.width() * origState.x
                                const pxY = rect.height() * origState.y
                                reticle.x(pxX)
                                reticle.y(pxY)
                                
                                const axUI = document.getElementById('follow-anchor-x')
                                const ayUI = document.getElementById('follow-anchor-y')
                                const cx = stageNode.width() / 2
                                const cy = stageNode.height() / 2
                                
                                // aligns absolute stage coordinates to local reticle origin offsets
                                const absX = trackObj.node.x() - (rect.width() / 2) + pxX
                                const absY = trackObj.node.y() - (rect.height() / 2) + pxY
                                if (axUI) axUI.innerText = Math.round(absX - cx)
                                if (ayUI) ayUI.innerText = Math.round(cy - absY)
                            }
                        }
                    }
                    
                    const vid = document.getElementById('main-video')
                    if (vid) vid.dispatchEvent(new Event('timeupdate'))
                    
                    btn.click() 
                }
            }
        }
    }

    setupReticleEditor(followStaticBtn, cancelStaticBtn, 'static')
    setupReticleEditor(followEditAnchorBtn, cancelAnchorBtn, 'anchor')

    if (followTrackAnchorBtn) {
        followTrackAnchorBtn.onclick = async () => {
            const targetId = node.getAttr('followTargetId')
            if (!targetId || targetId === 'none') return
            let trackObj = null
            appLayers.forEach(l => {
                if (l.type === 'tracking') {
                    const found = l.objects.find(o => o.id == targetId)
                    if (found) trackObj = found
                }
            })
            if (!trackObj) return
            
            const connectBtn = document.getElementById('backend-connect-btn')
            const activeUrl = connectBtn ? connectBtn.dataset.activeUrl : null
            const activeToken = connectBtn ? connectBtn.dataset.activeToken : null
            if (!activeUrl || !activeToken) {
                alert("Communication Failure: Connect to the backend before tracking features")
                return
            }

            // selectively locks top-level creation buttons instead of stripping state from all UI action buttons
            const creationBtns = ['add-text-btn', 'add-shape-btn', 'add-image-btn', 'add-filter-btn', 'submit-queue-btn']
            creationBtns.forEach(id => {
                const btn = document.getElementById(id)
                if (btn) {
                    btn.style.opacity = '0.3'
                    btn.style.pointerEvents = 'none'
                }
            })
            
            followTrackAnchorBtn.style.opacity = '1'
            followTrackAnchorBtn.style.pointerEvents = 'none'
            
            // locks timeline transport and time panels
            const bottomControls = document.getElementById('bottom-controls')
            if (bottomControls) {
                bottomControls.style.opacity = '0.3'
                bottomControls.style.pointerEvents = 'none'
            }
            
            const timePanel = document.getElementById('time-edit-panel')
            if (timePanel) {
                timePanel.style.opacity = '0.3'
                timePanel.style.pointerEvents = 'none'
            }

            // locks follow panel options
            if (followModeSelect) {
                followModeSelect.style.opacity = '0.3'
                followModeSelect.style.pointerEvents = 'none'
            }
            if (followTargetSelect) {
                followTargetSelect.style.opacity = '0.3'
                followTargetSelect.style.pointerEvents = 'none'
            }
            if (smoothInput && smoothInput.parentNode && smoothInput.parentNode.parentNode) {
                smoothInput.parentNode.parentNode.style.opacity = '0.3'
                smoothInput.parentNode.parentNode.style.pointerEvents = 'none'
            }
            const filterTypeSelect = document.getElementById('edit-filter-type')
            if (filterTypeSelect) {
                filterTypeSelect.style.opacity = '0.3'
                filterTypeSelect.style.pointerEvents = 'none'
            }
            const dofPropsBlock = document.getElementById('dof-properties-block')
            if (dofPropsBlock) {
                dofPropsBlock.style.opacity = '0.3'
                dofPropsBlock.style.pointerEvents = 'none'
            }
            
            const trackBoxToggleWrap = document.getElementById('show-track-box-toggle')
            if (trackBoxToggleWrap && trackBoxToggleWrap.parentElement) {
                trackBoxToggleWrap.parentElement.style.opacity = '0.3'
                trackBoxToggleWrap.parentElement.style.pointerEvents = 'none'
            }
            
            followTrackAnchorBtn.innerText = 'Extracting & Tracking...'
            
            await new Promise(resolve => setTimeout(resolve, 50))

            // Forces video to pause to prevent extraction conflicts with the active playhead
            video.pause()
            const playBtn = document.getElementById('play-pause-btn')
            if (playBtn) playBtn.innerText = 'Play'
            
            // Suspends render loop safely during rapid time-scrubbing
            window.isProcessingTracking = true
            
            const startTime = Number(trackObj.startTime) || 0
            const endTime = Number(trackObj.endTime) || (startTime + 0.3)
            const fps = 30
            const interval = 1 / fps
            const frames = []
            let spinnerOverlay = null

            try {
                if (trackObj && trackObj.node) {
                    trackObj.node.opacity(0)
                    const canvasCont = document.getElementById('canvas-container')
                    const canvasLeft = parseFloat(canvasCont.style.left) || 0
                    const canvasTop = parseFloat(canvasCont.style.top) || 0
                    const nodeX = trackObj.node.x() + canvasLeft
                    const nodeY = trackObj.node.y() + canvasTop
                    const rect = trackObj.node.findOne('.target-rect')
                    const nodeW = rect ? rect.width() : 150
                    const nodeH = rect ? rect.height() : 150

                    spinnerOverlay = document.createElement('div')
                    spinnerOverlay.id = 'anchor-spinner-overlay'
                    spinnerOverlay.style.cssText = `position:absolute; left:${nodeX}px; top:${nodeY}px; width:${nodeW}px; height:${nodeH}px; display:flex; justify-content:center; align-items:center; background:rgba(0,0,0,0.5); border:2px dashed #9b59b6; border-radius:4px; z-index:9999; backdrop-filter:blur(2px);`
                    spinnerOverlay.innerHTML = `<svg width="40" height="40" viewBox="0 0 50 50" style="animation: spin 1s linear infinite;"><circle cx="25" cy="25" r="20" fill="none" stroke="#9b59b6" stroke-width="4" stroke-dasharray="31.4 31.4" stroke-linecap="round"></circle></svg><style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>`
                    document.getElementById('video-wrapper').appendChild(spinnerOverlay)
                }

                const canvas = document.createElement('canvas')
                canvas.width = video.videoWidth
                canvas.height = video.videoHeight
                const ctx = canvas.getContext('2d')
                
                for (let t = startTime; t <= endTime; t += interval) {
                    video.currentTime = t
                    await new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }))

                    const trackData = trackObj.node.getAttr('trackingData')
                    if (trackData && spinnerOverlay) {
                        const tFps = trackObj.node.getAttr('trackingFps') || 30
                        const tStart = trackObj.node.getAttr('trackingStartTime') || trackObj.startTime
                        const frameIdx = Math.max(0, Math.floor((t - tStart) * tFps))
                        const frameData = trackData[frameIdx] || trackData[trackData.length - 1]
                        
                        if (frameData && !frameData.lost) {
                            const vRatio = video.videoWidth / video.videoHeight
                            const eRatio = video.clientWidth / video.clientHeight
                            let bW = video.clientWidth, bH = video.clientHeight
                            if (eRatio > vRatio) { bH = video.clientHeight; bW = bH * vRatio } 
                            else { bW = video.clientWidth; bH = bW / vRatio }

                            const vOffsetX = (video.clientWidth - bW) / 2
                            const vOffsetY = (video.clientHeight - bH) / 2
                            const vScaleX = bW / video.videoWidth
                            const vScaleY = bH / video.videoHeight
                            
                            spinnerOverlay.style.left = ((frameData.x * vScaleX) + vOffsetX) + 'px'
                            spinnerOverlay.style.top = ((frameData.y * vScaleY) + vOffsetY) + 'px'
                            spinnerOverlay.style.width = (frameData.w * vScaleX) + 'px'
                            spinnerOverlay.style.height = (frameData.h * vScaleY) + 'px'
                        }
                    }

                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                    frames.push(canvas.toDataURL('image/jpeg', 0.5))
                }
                
                const trackData = trackObj.node.getAttr('trackingData')
                const firstFrameData = trackData ? trackData[0] : null
                if (!firstFrameData) return
                
                const aX = node.getAttr('targetAnchorX') ?? 0.5
                const aY = node.getAttr('targetAnchorY') ?? 0.5
                
                // calculates start coordinates using padded frame data to perfectly match the visual dimensions of the reticle bounding box
                const startX = firstFrameData.x + (firstFrameData.w * aX)
                const startY = firstFrameData.y + (firstFrameData.h * aY)
                
                const radiusInputElem = document.getElementById('follow-radius-input')
                const sampleRadius = radiusInputElem ? (parseInt(radiusInputElem.value) || 20) : 20
                
                const response = await fetch(`${activeUrl}/track_anchor`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeToken}` },
                    body: JSON.stringify({ frames: frames, start_x: startX, start_y: startY, sample_radius: sampleRadius })
                })
                const data = await response.json()
                
                if (data.status === 'success') {
                    // applies moving average filter to coordinate dataset based on ui configuration
                    const smoothInputElem = document.getElementById('follow-smooth-input')
                    const smoothFactor = smoothInputElem ? (parseInt(smoothInputElem.value) || 5) : 5
                    node.setAttr('anchorSmoothFactor', smoothFactor)
                    
                    // caches raw optical flow data for dynamic resmoothing
                    node.setAttr('rawAnchorFlowData', data.data)
                    
                    // triggers centralized smoothing function
                    if (typeof applyAnchorSmoothing === 'function') {
                        applyAnchorSmoothing()
                    } else {
                        node.setAttr('anchorFlowData', data.data)
                    }
                    followTrackAnchorBtn.innerText = 'Track Anchor Feature'
                    
                    // Safely leaves the button locked out and greyed until manually moved
                    followTrackAnchorBtn.style.opacity = '0.3'
                    followTrackAnchorBtn.style.pointerEvents = 'none'
                    followTrackAnchorBtn.style.backgroundColor = '#9b59b6'
                }
            } catch (err) {
                console.error(err)
                followTrackAnchorBtn.innerText = 'Tracking Failed'
                followTrackAnchorBtn.style.backgroundColor = '#e74c3c'
                
                // resets button state after failure timeout
                setTimeout(() => {
                    followTrackAnchorBtn.innerText = 'Track Anchor Feature'
                    followTrackAnchorBtn.style.backgroundColor = '#9b59b6'
                    followTrackAnchorBtn.style.opacity = '1'
                    followTrackAnchorBtn.style.pointerEvents = 'auto'
                }, 3000)
            } finally {
                // handles overlay removal if present
                if (typeof spinnerOverlay !== 'undefined' && spinnerOverlay) spinnerOverlay.remove()
                
                if (trackObj && trackObj.node) {
                    trackObj.node.opacity(1)
                    if (trackObj.node.getLayer()) trackObj.node.getLayer().batchDraw()
                }

                const dragNote = document.getElementById('follow-drag-note')
                if (dragNote) dragNote.style.display = 'none'

                // restores UI lock state securely without breaking tracking tab phases
                if (typeof updateUILockState === 'function') updateUILockState()
                
                const submitBtn = document.getElementById('submit-queue-btn')
                if (submitBtn) {
                    submitBtn.style.opacity = '1'
                    submitBtn.style.pointerEvents = 'auto'
                }
                
                const reinitBtn = document.getElementById('reinit-track-box-btn')
                if (reinitBtn) {
                    reinitBtn.disabled = true
                    reinitBtn.style.opacity = '0.3'
                    reinitBtn.style.pointerEvents = 'none'
                }
                
                // unlocks timeline transport and time panels
                const bottomControls = document.getElementById('bottom-controls')
                if (bottomControls) {
                    bottomControls.style.opacity = '1'
                    bottomControls.style.pointerEvents = 'auto'
                }
                
                const timePanel = document.getElementById('time-edit-panel')
                if (timePanel) {
                    timePanel.style.opacity = '1'
                    timePanel.style.pointerEvents = 'auto'
                }

                // unlocks follow panel options
                if (followModeSelect) {
                    followModeSelect.style.opacity = '1'
                    followModeSelect.style.pointerEvents = 'auto'
                }
                if (followTargetSelect) {
                    followTargetSelect.style.opacity = '1'
                    followTargetSelect.style.pointerEvents = 'auto'
                }
                if (smoothInput && smoothInput.parentNode && smoothInput.parentNode.parentNode) {
                    smoothInput.parentNode.parentNode.style.opacity = '1'
                    smoothInput.parentNode.parentNode.style.pointerEvents = 'auto'
                }
                const filterTypeSelect = document.getElementById('edit-filter-type')
                if (filterTypeSelect) {
                    filterTypeSelect.style.opacity = '1'
                    filterTypeSelect.style.pointerEvents = 'auto'
                }
                const dofPropsBlock = document.getElementById('dof-properties-block')
                if (dofPropsBlock) {
                    dofPropsBlock.style.opacity = '1'
                    dofPropsBlock.style.pointerEvents = 'auto'
                }
                
                const trackBoxToggleWrap = document.getElementById('show-track-box-toggle')
                if (trackBoxToggleWrap && trackBoxToggleWrap.parentElement) {
                    trackBoxToggleWrap.parentElement.style.opacity = '1'
                    trackBoxToggleWrap.parentElement.style.pointerEvents = 'auto'
                }
                
                window.isProcessingTracking = false
                
                if (typeof renderLayersUI === 'function') renderLayersUI()

                video.currentTime = startTime
                video.dispatchEvent(new Event('timeupdate'))
            }
        }
    }
}

