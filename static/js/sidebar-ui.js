import { appLayers, activeNode, setActiveNode, activeLayerId, setActiveLayerId } from './state-manager.js'
import { transformer, confirmSelection, removeObject, removeLayer, letterboxLayer, forceSystemOverlaysToTop, applyCrop, activeCropLeftPct, activeCropTopPct, toggleCanvasGrid } from './canvas-engine.js'
import { renderMultiTrackTimeline, renderTimelineIntervals, initTimelineBindings } from './timeline-ui.js'
import { trackingState, resetTrackingUI, initTrackingBindings, bindFollowModule } from './tracking-modules.js'

export { resetTrackingUI }

// svg string for visibility eye icon
const eyeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`

// svg string for lock icon
const lockIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`

// svg string for trash can icon
const trashIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`

// svg string for grip drag handle
const gripIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>`

let draggedLayerId = null
let draggedObjectId = null
let draggedObjectLayerId = null

export function initMarqueeSystem() {
    window.applyMarquee = (el) => {
        if (!el || !el.isConnected) return
        
        // Safely aborts animation rendering if the user is actively typing in an input field
        if (el.tagName === 'INPUT' && document.activeElement === el) {
            el.getAnimations().forEach(a => a.cancel())
            el.style.textIndent = '0px'
            el.style.textOverflow = 'clip'
            return
        }

        const cWidth = el.clientWidth
        if (cWidth === 0) {
            el.getAnimations().forEach(a => a.cancel())
            el._lastCWidth = 0
            return
        }

        // 1. Instantly halt any active animation
        el.getAnimations().forEach(a => a.cancel())
        el.style.textIndent = '0px'
        el.style.textOverflow = 'clip'
        
        // 2. Measure TRUE text width using an isolated clone to bypass all flex/layout rendering bugs
        const span = document.createElement('span')
        span.style.cssText = 'position:absolute; visibility:hidden; white-space:nowrap; left:-9999px;'
        const computedStyle = window.getComputedStyle(el)
        span.style.font = computedStyle.font
        span.style.letterSpacing = computedStyle.letterSpacing
        
        // Evaluates strict value property for inputs vs inner string for standard elements
        span.innerText = el.tagName === 'INPUT' ? el.value : el.innerText
        
        document.body.appendChild(span)
        const textWidth = span.clientWidth
        span.remove()
        
        // 3. Evaluate and apply physics based purely on explicit string width
        if (textWidth > cWidth + 2) {
            el.animate([
                { textIndent: `${cWidth}px` },
                { textIndent: `-${textWidth}px` }
            ], {
                duration: (textWidth + cWidth) * 20,
                iterations: Infinity,
                easing: 'linear'
            })
        } else {
            el.style.textOverflow = 'ellipsis'
        }
        
        el._lastCWidth = cWidth
    }

    // Global observer that strictly watches for container resizes
    if (!window.marqueeObserver) {
        window.marqueeObserver = new ResizeObserver((entries) => {
            requestAnimationFrame(() => {
                entries.forEach(entry => {
                    const el = entry.target
                    if (el.clientWidth !== el._lastCWidth) {
                        window.applyMarquee(el)
                    }
                })
            })
        })
    }

    // Global observer that catches ALL text updates instantly across the entire UI
    if (!window.marqueeMutationObserver) {
        window.marqueeMutationObserver = new MutationObserver((mutations) => {
            const targets = new Set()
            mutations.forEach(m => {
                if (m.type === 'characterData') {
                    const parent = m.target.parentElement
                    const el = parent && parent.closest ? parent.closest('.layer-name, #transform-group-name-display, #captions-group-name-display') : null
                    if (el) targets.add(el)
                } else if (m.type === 'childList') {
                    m.addedNodes.forEach(n => {
                        if (n.nodeType === 1) { // Element Node
                            if (n.classList && n.classList.contains('layer-name')) targets.add(n)
                            if (n.id === 'transform-group-name-display' || n.id === 'captions-group-name-display') targets.add(n)
                            if (n.querySelectorAll) {
                                n.querySelectorAll('.layer-name').forEach(child => targets.add(child))
                            }
                        } else if (n.nodeType === 3) { // Text Node
                            const parent = n.parentElement
                            const el = parent && parent.closest ? parent.closest('.layer-name, #transform-group-name-display, #captions-group-name-display') : null
                            if (el) targets.add(el)
                        }
                    })
                }
            })
            targets.forEach(el => requestAnimationFrame(() => window.applyMarquee(el)))
        })
        window.marqueeMutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true })
    }
}

// centralizes the logic for greying out tabs and creation buttons based on edit modes
export function updateUILockState() {
    const isEditMode = (typeof activeNode !== 'undefined' && activeNode !== null)
    
    let isActiveNodeTracking = false
    let activeLayerType = null
    if (isEditMode && typeof appLayers !== 'undefined') {
        appLayers.forEach(l => {
            if (l.objects.some(o => o.node === activeNode)) {
                activeLayerType = l.type
                if (l.type === 'tracking') isActiveNodeTracking = true
            }
        })
    }

    const confirmNameBtn = document.getElementById('confirm-name-btn')
    const isNameConfirmed = confirmNameBtn && confirmNameBtn.innerText === '✖'
    
    const isTrackingConfirmed = trackingState === 'confirmed' && isActiveNodeTracking
    const isTrackingNamePending = ['drawing', 'editing'].includes(trackingState) && !isNameConfirmed
    let shouldLockTabs = (isEditMode && !isTrackingConfirmed) || isTrackingNamePending
    
    // Unlocks tabs if the active object was removed from the layer tree
    if (isEditMode && activeLayerType === null) {
        shouldLockTabs = false
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (shouldLockTabs && !btn.classList.contains('active')) {
            btn.style.opacity = '0.4'
            btn.style.pointerEvents = 'none'
        } else {
            btn.style.opacity = '1'
            btn.style.pointerEvents = 'auto'
        }
    })

    // locks creation buttons
    const objectBtnsContainer = document.getElementById('add-object-btns')
    const creationButtons = objectBtnsContainer ? Array.from(objectBtnsContainer.querySelectorAll('button')) : ['add-text-btn', 'add-shape-btn', 'add-image-btn', 'add-filter-btn'].map(id => document.getElementById(id))
    
    creationButtons.forEach(btn => {
        if (btn) {
            const id = btn.id
            let lockThisBtn = false
            if (isEditMode && !isActiveNodeTracking) {
                lockThisBtn = true // default lock all
                // selectively unlocks the button matching the currently active object type
                if (id === 'add-text-btn' && activeLayerType === 'text') lockThisBtn = false
                if (id === 'add-filter-btn' && activeLayerType === 'filter') lockThisBtn = false
                if (id === 'add-image-btn' && activeLayerType === 'image' && activeNode && activeNode.getClassName() === 'Image') lockThisBtn = false
                if (id === 'add-shape-btn' && activeLayerType === 'image' && activeNode && ['Rect', 'Circle', 'Oval', 'Triangle', 'Shape'].includes(activeNode.getClassName())) lockThisBtn = false
            }
            
            // Unlocks buttons if the active object was removed from the layer tree
            if (isEditMode && activeLayerType === null) {
                lockThisBtn = false
            }
            
            if (lockThisBtn) {
                btn.disabled = true
                btn.style.opacity = '0.4'
                btn.style.cursor = 'not-allowed'
                btn.style.pointerEvents = 'none'
            } else {
                btn.disabled = false
                btn.style.opacity = '1'
                btn.style.cursor = 'pointer'
                btn.style.pointerEvents = 'auto'
            }
        }
    })

    // specifically manages the add target button which relies on backend connection state
    const addTrackBtn = document.getElementById('add-track-target-btn')
    const connectBtn = document.getElementById('backend-connect-btn')
    const isBackendConnected = connectBtn && connectBtn.dataset && connectBtn.dataset.activeUrl
    
    if (addTrackBtn) {
        const lockTrackBtn = !isBackendConnected || isEditMode || trackingState === 'initialized'
        if (lockTrackBtn) {
            addTrackBtn.style.opacity = '0.3'
            addTrackBtn.style.pointerEvents = 'none'
        } else {
            addTrackBtn.style.opacity = '1'
            addTrackBtn.style.pointerEvents = 'auto'
        }
    }
}

export function getTimeParts(totalSeconds) {
    const totalMs = Math.round(totalSeconds * 1000)
    const h = Math.floor(totalMs / 3600000)
    const m = Math.floor((totalMs % 3600000) / 60000)
    const s = Math.floor((totalMs % 60000) / 1000)
    const ms = totalMs % 1000
    return {
        h: String(h).padStart(2, '0'),
        m: String(m).padStart(2, '0'),
        s: String(s).padStart(2, '0'),
        ms: String(ms).padStart(3, '0')
    }
}

export function formatTime(totalSeconds) {
    const parts = getTimeParts(totalSeconds)
    return `${parts.h}:${parts.m}:${parts.s}:${parts.ms}`
}

export function parseTime(timeStr) {
    const parts = timeStr.split(':')
    if (parts.length !== 4) return 0
    const h = parseInt(parts[0], 10) || 0
    const m = parseInt(parts[1], 10) || 0
    const s = parseInt(parts[2], 10) || 0
    const ms = parseInt(parts[3], 10) || 0
    return (h * 3600) + (m * 60) + s + (ms / 1000)
}

export function getActiveObj() {
    let found = null
    appLayers.forEach(layer => {
        const obj = layer.objects.find(o => o.node === activeNode)
        if (obj) found = obj
    })
    return found
}

export function updateTimePanelUI(activeObj) {
    if (activeObj && activeObj.linkedTrackingId) {
        let trackObj = null
        if (typeof appLayers !== 'undefined') {
            appLayers.forEach(l => {
                if (l.type === 'tracking') {
                    const found = l.objects.find(o => o.id === activeObj.linkedTrackingId || (o.node && o.node.name() === activeObj.linkedTrackingId))
                    if (found) trackObj = found
                }
            })
        }
        if (trackObj) {
            activeObj.startTime = trackObj.startTime
            activeObj.endTime = trackObj.endTime
        }
    }

    // strictly enforces the 3s baseline for new objects to eradicate the 250ms default behavior globally
    if (activeObj && Math.abs(activeObj.endTime - activeObj.startTime - 0.25) < 0.001) {
        activeObj.endTime = activeObj.startTime + 3.0
        const video = document.getElementById('main-video')
        if (video && activeObj.endTime > video.duration) activeObj.endTime = video.duration
    }

    const startGroup = document.getElementById('edit-start-time-group')
    const endGroup = document.getElementById('edit-end-time-group')
    const lockIconNode = document.getElementById('edit-time-lock')

    if (startGroup && endGroup && lockIconNode && activeObj) {
        const startParts = getTimeParts(activeObj.startTime)
        startGroup.querySelector('[data-type="h"]').innerText = startParts.h
        startGroup.querySelector('[data-type="m"]').innerText = startParts.m
        startGroup.querySelector('[data-type="s"]').innerText = startParts.s
        startGroup.querySelector('[data-type="ms"]').innerText = startParts.ms

        const endParts = getTimeParts(activeObj.endTime)
        endGroup.querySelector('[data-type="h"]').innerText = endParts.h
        endGroup.querySelector('[data-type="m"]').innerText = endParts.m
        endGroup.querySelector('[data-type="s"]').innerText = endParts.s
        endGroup.querySelector('[data-type="ms"]').innerText = endParts.ms
        
        if (activeObj.timeLocked || activeObj.linkedTrackingId) {
            lockIconNode.classList.add('active')
            lockIconNode.title = activeObj.linkedTrackingId ? 'Linked to Tracking Target' : 'Locked'
            startGroup.classList.add('disabled')
            endGroup.classList.add('disabled')
            startGroup.style.pointerEvents = 'none'
            endGroup.style.pointerEvents = 'none'
            startGroup.style.opacity = '0.4'
            endGroup.style.opacity = '0.4'
            if (activeObj.linkedTrackingId) {
                lockIconNode.style.pointerEvents = 'none'
                lockIconNode.style.opacity = '0.4'
            } else {
                lockIconNode.style.pointerEvents = 'auto'
                lockIconNode.style.opacity = '1'
            }
        } else {
            lockIconNode.classList.remove('active')
            lockIconNode.title = 'Lock Interval'
            startGroup.classList.remove('disabled')
            endGroup.classList.remove('disabled')
            startGroup.style.pointerEvents = 'auto'
            endGroup.style.pointerEvents = 'auto'
            startGroup.style.opacity = '1'
            endGroup.style.opacity = '1'
            lockIconNode.style.pointerEvents = 'auto'
            lockIconNode.style.opacity = '1'
        }
    }

    // Dynamically mounts synchronization link UI to the time edit panel
    let syncWrap = document.getElementById('sync-track-time-wrap')
    if (!syncWrap) {
        const timePanel = document.getElementById('time-edit-panel')
        if (timePanel) {
            syncWrap = document.createElement('div')
            syncWrap.id = 'sync-track-time-wrap'
            syncWrap.style.cssText = 'display:flex; gap:8px; align-items:center; margin-top:12px; padding-top:12px; border-top:1px solid #34495e;'
            
            const select = document.createElement('select')
            select.id = 'sync-track-select'
            select.className = 'panel-input'
            select.style.width = '110px'
            select.style.flex = 'none'
            select.style.minWidth = '0'
            select.style.cursor = 'pointer'
            select.style.margin = '0'
            
            // Link icon button styled to match the edit-time-lock icon
            const btn = document.createElement('button')
            btn.id = 'sync-track-btn'
            // Updated to linked-chain symbol
            btn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`
            btn.title = 'Match interval with selected tracking target'
            
            // Square dimensions, slightly larger (32px) to match dropdown height, styled like time-lock
            btn.style.cssText = `
                width: 32px; height: 32px; padding: 0; display: flex; 
                align-items: center; justify-content: center; 
                background: #34495e; border: 1px solid #555; border-radius: 2px; 
                color: #aaa; cursor: pointer; transition: all 0.2s; margin: 0;
            `
            
            syncWrap.appendChild(select)
            syncWrap.appendChild(btn)
            timePanel.appendChild(syncWrap)
            
            btn.addEventListener('click', (e) => {
                e.preventDefault()
                const trackId = select.value
                if (!trackId || trackId === 'None') return
                
                const isCurrentlyOn = btn.classList.contains('shadow-active')
                const newState = !isCurrentlyOn
                btn.classList.toggle('shadow-active', newState)
                btn.style.backgroundColor = newState ? '#00a8ff' : '#34495e'
                btn.style.color = newState ? '#000000' : '#aaa'
                
                let trackObj = null
                if (typeof appLayers !== 'undefined') {
                    appLayers.forEach(l => {
                        if (l.type === 'tracking') {
                            const found = l.objects.find(o => o.id === trackId || (o.node && o.node.name() === trackId))
                            if (found) trackObj = found
                        }
                    })
                }
                
                if (trackObj && activeNode) {
                    const currentActive = getActiveObj()
                    if (currentActive) {
                        if (newState) {
                            currentActive.linkedTrackingId = trackId
                            currentActive.timeLocked = true
                            currentActive.startTime = trackObj.startTime
                            currentActive.endTime = trackObj.endTime
                        } else {
                            currentActive.linkedTrackingId = null
                            currentActive.timeLocked = false
                        }
                        
                        updateTimePanelUI(currentActive)
                        
                        if (typeof renderTimelineIntervals === 'function') renderTimelineIntervals()
                        if (typeof renderMultiTrackTimeline === 'function') renderMultiTrackTimeline()
                        
                        const video = document.getElementById('main-video')
                        if (video) {
                            video.currentTime = currentActive.startTime
                            const scrubber = document.getElementById('timeline-scrubber')
                            const progress = document.getElementById('scrubber-progress')
                            if (scrubber && progress && video.duration) {
                                scrubber.value = currentActive.startTime
                                progress.style.width = (currentActive.startTime / video.duration) * 100 + '%'
                            }
                        }
                    }
                }
            })
        }
    }

    // Populates tracking targets dropdown safely to avoid layout restamps
    if (syncWrap) {
        let hasTargets = false
        let currentTargetHTML = '<option value="None">None</option>'
        if (typeof appLayers !== 'undefined') {
            appLayers.forEach(l => {
                if (l.type === 'tracking') {
                    l.objects.forEach(o => {
                        // explicitly ignores targeting itself to prevent infinite loop errors
                        if (activeObj && o.id === activeObj.id) return
                        currentTargetHTML += `<option value="${o.id}">${o.name}</option>`
                        hasTargets = true
                    })
                } 
            })
        }
        
        const select = document.getElementById('sync-track-select')
        if (select) {
            const xpathResult = document.evaluate('/html/body/div[3]/div[5]/div[6]/div[5]/div[2]/div[2]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
            const targetDiv = xpathResult.singleNodeValue || document.getElementById('edit-end-time-group') || document.getElementById('edit-start-time-group')
            if (targetDiv) {
                const computedWidth = window.getComputedStyle(targetDiv).width
                if (computedWidth && computedWidth !== 'auto' && computedWidth !== '0px') {
                    select.style.width = computedWidth
                } 
            }
            if (select.innerHTML !== currentTargetHTML) {
                const prevVal = select.value
                select.innerHTML = currentTargetHTML
                if (prevVal && Array.from(select.options).some(opt => opt.value === prevVal)) {
                    select.value = prevVal
                } else {
                    select.value = 'None'
                }
                
                select.disabled = !hasTargets
                select.style.opacity = hasTargets ? '1' : '0.4'
                select.style.cursor = hasTargets ? 'pointer' : 'not-allowed'
                const btn = document.getElementById('sync-track-btn')
                if (btn) {
                    btn.disabled = !hasTargets
                    btn.style.opacity = hasTargets ? '1' : '0.4'
                    btn.style.cursor = hasTargets ? 'pointer' : 'not-allowed'
                    if (!hasTargets) {
                        btn.classList.remove('shadow-active')
                        btn.style.backgroundColor = '#34495e'
                        btn.style.color = '#aaa'
                    }
                }
            }
        }

        const btn = document.getElementById('sync-track-btn')
        if (select && btn && activeObj) {
            if (activeObj.linkedTrackingId) {
                select.value = activeObj.linkedTrackingId
                btn.classList.add('shadow-active')
                btn.style.backgroundColor = '#00a8ff'
                btn.style.color = '#000000'
            } else {
                btn.classList.remove('shadow-active')
                btn.style.backgroundColor = '#34495e'
                btn.style.color = '#aaa'
            }
        }
    }

    // Dynamically mounts synchronization note UI to the time edit panel
    let syncNote = document.getElementById('sync-track-time-note')
    if (!syncNote) {
        const timePanel = document.getElementById('time-edit-panel')
        if (timePanel) {
            syncNote = document.createElement('div')
            syncNote.id = 'sync-track-time-note'
            syncNote.style.cssText = 'margin-top:12px; font-size:11px; color:#aaa; line-height:1.4; border-top:1px dashed #34495e; padding-top:8px; display:none;'
            timePanel.appendChild(syncNote)
        }
    }

    if (syncNote && activeObj) {
        if (activeObj.linkedTrackingId) {
            let trackObj = null
            if (typeof appLayers !== 'undefined') {
                appLayers.forEach(l => {
                    if (l.type === 'tracking') {
                        const found = l.objects.find(o => o.id === activeObj.linkedTrackingId || (o.node && o.node.name() === activeObj.linkedTrackingId))
                        if (found) trackObj = found
                    }
                })
            }
            if (trackObj) {
                syncNote.style.display = 'block'
                syncNote.innerHTML = `Linking interval timing values with: <a href="#" id="jump-to-track-link" style="color:#00a8ff; text-decoration:underline; cursor:pointer;">${trackObj.name}</a>`
                
                const link = syncNote.querySelector('#jump-to-track-link')
                if (link) {
                    link.onclick = (e) => {
                        e.preventDefault()
                        switchTab('shapes-tab')
                        openShapeEditor(trackObj.node)
                        setTimeout(() => {
                            const timePanel = document.getElementById('time-edit-panel')
                            if (timePanel) {
                                timePanel.scrollIntoView({ block: 'start' })
                            }
                        }, 100)
                    }
                }
            } else {
                syncNote.style.display = 'none'
            }
        } else {
            syncNote.style.display = 'none'
        }
    }
}

export function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'))
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'))
    
    document.getElementById(tabId).classList.add('active')

    // activates target tab button regardless of trigger source 
    const targetBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabId))
    if (targetBtn) targetBtn.classList.add('active')

    // dynamically route time panel based on active tab view
    const timePanel = document.getElementById('time-edit-panel')
    if (timePanel && typeof activeNode !== 'undefined' && activeNode) {
        if (tabId === 'shapes-tab') {
            const trackPanel = document.getElementById('track-edit-panel')
            const accBlock = document.getElementById('tracking-accuracy-block')
            if (trackPanel && accBlock) {
                timePanel.style.display = 'block' // guarantees visibility when routed here
                trackPanel.insertBefore(timePanel, accBlock)
            }
        } else if (tabId === 'layers-tab') {
            if (typeof renderLayersUI === 'function') renderLayersUI()
        }
    }

    // Protects the unconfirmed target box from disappearing during tab switches
    const trackBox = document.getElementById('tracking-target-box')
    
    // Uses the module-level trackingState variable directly
    if (trackBox && trackBox.dataset.initBox && trackingState !== 'confirmed') {
        const videoWrapper = document.getElementById('video-wrapper')
        if (videoWrapper && trackBox.parentNode !== videoWrapper) {
            videoWrapper.appendChild(trackBox)
        }
        
        // Show box on shapes tab if we are actively drawing/editing
        if (tabId === 'shapes-tab' && (trackingState === 'drawing' || trackingState === 'editing' || trackingState === 'initialized')) {
            trackBox.style.display = 'block'
            const labelTab = document.getElementById('track-box-label')
            if (labelTab) labelTab.style.display = 'block'
        } else {
            trackBox.style.display = 'none'
            const labelTab = document.getElementById('track-box-label')
            if (labelTab) labelTab.style.display = 'none'
        }
    }

    // validates tab locks immediately upon switching views
    if (typeof updateUILockState === 'function') updateUILockState()
}

// exposes switchTab globally to resolve inline html onClick reference errors
window.switchTab = switchTab

// converts rgba string to hex string and transparency percentage
const rgbaToHex = (rgbaStr) => {
    if (!rgbaStr || rgbaStr === 'transparent') return { hex: '#000000', a: 100 }
    if (rgbaStr.startsWith('#')) return { hex: rgbaStr.slice(0, 7), a: rgbaStr.length === 9 ? Math.round(100 - (parseInt(rgbaStr.slice(7, 9), 16) / 255) * 100) : 0 }
    const m = rgbaStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
    if (!m) return { hex: '#ffffff', a: 0 }
    const r = parseInt(m[1]).toString(16).padStart(2, '0')
    const g = parseInt(m[2]).toString(16).padStart(2, '0')
    const b = parseInt(m[3]).toString(16).padStart(2, '0')
    const a = m[4] !== undefined ? parseFloat(m[4]) : 1
    return { hex: `#${r}${g}${b}`, a: Math.round((1 - a) * 100) }
}

export function openTextEditor(node) {
    confirmSelection()
    setActiveNode(node)
    
    // Ensure transform panel is in text-edit-panel and has correct text IDs
    const textPanel = document.getElementById('text-edit-panel')
    const transformPanelDiv = document.getElementById('object-transform-panel')
    if (transformPanelDiv && textPanel && transformPanelDiv.parentNode !== textPanel) {
        textPanel.appendChild(transformPanelDiv)
        // Move it just before the confirm button
        const confirmBtn = document.getElementById('confirm-text-btn')
        if (confirmBtn) textPanel.insertBefore(transformPanelDiv, confirmBtn)
    }
    // Set IDs for text
    if (transformPanelDiv) {
        const toggleBtn = transformPanelDiv.querySelector('#image-transform-toggle')
        if (toggleBtn) toggleBtn.id = 'transform-controls-toggle'
        const flipH = transformPanelDiv.querySelector('#image-flip-h')
        if (flipH) flipH.id = 'text-flip-h'
        const flipV = transformPanelDiv.querySelector('#image-flip-v')
        if (flipV) flipV.id = 'text-flip-v'
        const rot90 = transformPanelDiv.querySelector('#image-rot-90')
        if (rot90) rot90.id = 'text-rot-90'
        const center = transformPanelDiv.querySelector('#image-center')
        if (center) center.id = 'text-center'
        const wInput = transformPanelDiv.querySelector('#image-width')
        if (wInput) wInput.id = 'edit-text-width'
        const hInput = transformPanelDiv.querySelector('#image-height')
        if (hInput) hInput.id = 'edit-text-height'
        const ratioLock = transformPanelDiv.querySelector('#image-ratio-lock') || transformPanelDiv.querySelector('#text-ratio-lock')
        if (ratioLock) {
            ratioLock.id = 'text-ratio-lock'
            ratioLock.onclick = () => {
                const isLocked = !(node.getAttr('keepRatio') || false)
                node.setAttr('keepRatio', isLocked)
                ratioLock.style.opacity = isLocked ? '1' : ''
                ratioLock.style.color = isLocked ? '#00a8ff' : ''
                if (typeof transformer !== 'undefined' && transformer) {
                    transformer.keepRatio(isLocked)
                    transformer.forceUpdate()
                }
            }
            const isLocked = node.getAttr('keepRatio') || false
            ratioLock.style.opacity = isLocked ? '1' : ''
            ratioLock.style.color = isLocked ? '#00a8ff' : ''
            if (typeof transformer !== 'undefined' && transformer) transformer.keepRatio(isLocked)
        }
    }
    
    const transformToggle = document.getElementById('transform-controls-toggle')
    if (transformToggle) {
        const updateTransformState = (isChecked) => {
            node.draggable(isChecked)
            if (isChecked) transformer.nodes([node])
            else transformer.nodes([])
            transformToggle.classList.toggle('transform-active', isChecked)
            transformToggle.style.backgroundColor = isChecked ? '#00a8ff' : '#34495e'
        }
        Object.defineProperty(transformToggle, 'checked', {
            get: function() { return this.classList.contains('transform-active') },
            set: function(val) { updateTransformState(val) },
            configurable: true
        })
        updateTransformState(node.draggable() || false)
        transformToggle.onclick = () => { transformToggle.checked = !transformToggle.checked }
    } else {
        node.draggable(false)
        transformer.nodes([])
    }
    
    const bindTransformButtons = (activeNode, prefix) => {
        const flipH = document.getElementById(`${prefix}-flip-h`)
        const flipV = document.getElementById(`${prefix}-flip-v`)
        const rot90 = document.getElementById(`${prefix}-rot-90`)
        const center = document.getElementById(`${prefix}-center`)
        
        const centerOrigin = (n) => {
            if (n.getClassName() !== 'Circle' && n.offsetX() === 0) {
                const ox = n.width() / 2
                const oy = n.height() / 2
                n.offsetX(ox)
                n.offsetY(oy)
                n.x(n.x() + (ox * n.scaleX()))
                n.y(n.y() + (oy * n.scaleY()))
            }
        }
        
        if (flipH) flipH.onclick = () => { centerOrigin(activeNode); activeNode.scaleX(activeNode.scaleX() * -1); activeNode.getLayer()?.batchDraw() }
        if (flipV) flipV.onclick = () => { centerOrigin(activeNode); activeNode.scaleY(activeNode.scaleY() * -1); activeNode.getLayer()?.batchDraw() }
        if (rot90) rot90.onclick = () => { centerOrigin(activeNode); activeNode.rotation(activeNode.rotation() + 90); activeNode.getLayer()?.batchDraw() }
        if (center) center.onclick = () => {
            centerOrigin(activeNode);
            const stage = activeNode.getStage()
            if (stage) {
                const fMode = activeNode.getAttr('followMode') || 'static'
                if (fMode !== 'tracked') {
                    activeNode.x(stage.width() / 2)
                    activeNode.y(stage.height() / 2)
                }
                activeNode.getLayer()?.batchDraw()
                activeNode.fire('dragmove.follow')
            }
        }
    }
    
    bindTransformButtons(node, 'text')
    
    // Width/Height inputs for text
    const wInput = document.getElementById('edit-text-width')
    const hInput = document.getElementById('edit-text-height')
    if (wInput && hInput) {
        wInput.value = Math.round(node.width())
        hInput.value = Math.round(node.height())
        wInput.oninput = () => {
            let newW = parseInt(wInput.value, 10) || 20
            const isLocked = node.getAttr('keepRatio') || false
            if (isLocked) {
                const ratio = node.width() / node.height()
                const newH = Math.round(newW / ratio)
                if (hInput) hInput.value = newH
                node.height(newH)
                node.offsetY(newH / 2)
            }
            node.width(newW)
            node.offsetX(newW / 2)
            if (node.getLayer()) node.getLayer().batchDraw()
            if (typeof transformer !== 'undefined' && transformer) transformer.forceUpdate()
        }
        hInput.oninput = () => {
            let newH = parseInt(hInput.value, 10) || 20
            const isLocked = node.getAttr('keepRatio') || false
            if (isLocked) {
                const ratio = node.width() / node.height()
                const newW = Math.round(newH * ratio)
                if (wInput) wInput.value = newW
                node.width(newW)
                node.offsetX(newW / 2)
            }
            node.height(newH)
            node.offsetY(newH / 2)
            if (node.getLayer()) node.getLayer().batchDraw()
            if (typeof transformer !== 'undefined' && transformer) transformer.forceUpdate()
        }
        node.off('transform.textSync')
        node.on('transform.textSync', () => {
            wInput.value = Math.round(node.width())
            hInput.value = Math.round(node.height())
        })
    }
    
    // rest of openTextEditor (color picker, shadow, captions) remains unchanged...
    const innerText = node.findOne('.inner-text') || node
    const textBg = node.findOne('.text-bg')
    
    // dynamically syncs unified object name input, prioritizing the active timeline row if grouped
    const objectNameInput = document.getElementById('edit-object-name')
    if (objectNameInput) {
        if (node.getAttr('captionsGroupName')) {
            const capList = node.getAttr('captionsList') || []
            const activeIdx = node.getAttr('activeCaptionEditIndex') || 0
            objectNameInput.value = capList.length > activeIdx ? capList[activeIdx] : innerText.text()
            
            if (node.getAttr('transformGroupName')) {
                const rowsContainer = document.getElementById('transforms-rows')
                if (rowsContainer) {
                    let activeRow = Array.from(rowsContainer.children).find(r => r.style.borderLeftColor === 'rgb(0, 168, 255)' || r.style.borderLeftColor === '#00a8ff')
                    if (!activeRow) {
                        activeRow = Array.from(rowsContainer.children).find(r => {
                            try { return JSON.parse(r.dataset.transformConfig || '{}').id === node.id() } catch(e){}
                            return false
                        }) || Array.from(rowsContainer.children).find(r => r.dataset.transformKey === node.name())
                        if (activeRow) {
                            Array.from(rowsContainer.children).forEach(r => r.style.borderLeftColor = 'transparent')
                            activeRow.style.borderLeftColor = '#00a8ff'
                        }
                    }
                    if (activeRow) {
                        const idx = Array.from(rowsContainer.children).indexOf(activeRow)
                        node.setAttr('activeTransformEditIndex', idx)
                    }
                }
            }
        } else if (node.getAttr('transformGroupName')) {
            const rowsContainer = document.getElementById('transforms-rows')
            let foundRowVal = null
            if (rowsContainer) {
                let activeRow = Array.from(rowsContainer.children).find(r => r.style.borderLeftColor === 'rgb(0, 168, 255)' || r.style.borderLeftColor === '#00a8ff')
                if (!activeRow) {
                    activeRow = Array.from(rowsContainer.children).find(r => {
                        try { return JSON.parse(r.dataset.transformConfig || '{}').id === node.id() } catch(e){}
                        return false
                    }) || Array.from(rowsContainer.children).find(r => r.dataset.transformKey === node.name())
                    if (activeRow) {
                        Array.from(rowsContainer.children).forEach(r => r.style.borderLeftColor = 'transparent')
                        activeRow.style.borderLeftColor = '#00a8ff'
                    }
                }
                if (activeRow) {
                    const rowInput = activeRow.querySelector('.panel-input input[type="text"]') || activeRow.querySelector('input[type="text"]')
                    if (rowInput) foundRowVal = rowInput.value
                    
                    const idx = Array.from(rowsContainer.children).indexOf(activeRow)
                    node.setAttr('activeTransformEditIndex', idx)

                    if (!window._preventMatrixReset) {
                        try {
                            let cfg = JSON.parse(activeRow.dataset.transformConfig)
                            cfg.activeTransformEditIndex = 0
                            activeRow.dataset.transformConfig = JSON.stringify(cfg)
                            if (typeof activeRow.renderMatrixGrid === 'function') activeRow.renderMatrixGrid()
                            
                            let tData = node.getAttr('transformGroupData')
                            if (tData && tData[activeRow.dataset.transformKey]) {
                                tData[activeRow.dataset.transformKey].activeTransformEditIndex = 0
                                node.setAttr('transformGroupData', tData)
                            }
                        } catch(err) {}
                    }
                }
            }
            objectNameInput.value = foundRowVal || innerText.text()
        } else {
            objectNameInput.value = innerText.text()
        }
    }
    
    document.getElementById('edit-font-size').value = innerText.fontSize()
    document.getElementById('edit-font-family').value = innerText.fontFamily() || 'sans-serif'
    document.getElementById('edit-font-style').value = innerText.fontStyle() || 'normal'
    document.getElementById('edit-text-align').value = innerText.align() || 'left'
    
    const updateSharedColorPicker = () => {
        const target = document.getElementById('edit-color-target').value
        const colorInput = document.getElementById('edit-shared-color')
        const widthInput = document.getElementById('edit-stroke-width')
        const widthInputWrap = document.getElementById('edit-stroke-width-wrap')
        const transpWrap = document.getElementById('transp-wrap')
        const transpInput = document.getElementById('edit-text-transparency')
        const noneWrap = document.getElementById('none-wrap')
        const noneCheck = document.getElementById('edit-color-none')
        
        if (target === 'textFill') {
            transpWrap.style.display = 'flex'
            noneWrap.style.display = 'none'
            widthInputWrap.style.display = 'none'
            colorInput.disabled = false
            colorInput.style.opacity = '1'
            const fillVal = innerText.fill() || '#ffffff'
            const parsed = rgbaToHex(fillVal)
            colorInput.value = parsed.hex
            transpInput.value = parsed.a
        } else {
            transpWrap.style.display = 'none'
            noneWrap.style.display = 'flex'
            widthInputWrap.style.display = (target.includes('Stroke')) ? 'flex' : 'none'
            let targetVal = 'transparent'
            let targetWidth = 0
            if (target === 'textStroke') { targetVal = innerText.stroke(); targetWidth = innerText.strokeWidth() }
            if (target === 'bgFill' && textBg) { targetVal = textBg.fill() }
            if (target === 'bgStroke' && textBg) { targetVal = textBg.stroke(); targetWidth = textBg.strokeWidth() }
            if (!targetVal || targetVal === 'transparent') {
                noneCheck.checked = true
                colorInput.disabled = true
                colorInput.style.opacity = '0.5'
                if (target.includes('Stroke')) widthInput.value = targetWidth || 1
            } else {
                noneCheck.checked = false
                colorInput.disabled = false
                colorInput.style.opacity = '1'
                colorInput.value = rgbaToHex(targetVal).hex
                if (target.includes('Stroke')) widthInput.value = targetWidth === 0 ? 1 : targetWidth
            }
        }
    }
    updateSharedColorPicker()
    document.getElementById('edit-color-target').onchange = updateSharedColorPicker
    window.refreshColorPickerUI = updateSharedColorPicker
    
    node.off('transform.styleSync transformend.styleSync dragend.styleSync')
    node.on('transform.styleSync', () => {
        const w = document.getElementById('edit-text-width')
        const h = document.getElementById('edit-text-height')
        if (w) w.value = Math.round(node.width() * node.scaleX())
        if (h) h.value = Math.round(node.height() * node.scaleY())
    })
    node.on('transformend.styleSync dragend.styleSync', () => {
        document.dispatchEvent(new Event('textStyleChanged'))
    })
    
    // Shadow Controls (as before)
    const shadowToggle = document.getElementById('edit-shadow-toggle')
    const shadowColor = document.getElementById('edit-shadow-color')
    const shadowBlur = document.getElementById('edit-shadow-blur')
    const shadowThickness = document.getElementById('edit-shadow-thickness')
    const shadowWheel = document.getElementById('shadow-wheel')
    const shadowHandle = document.getElementById('shadow-wheel-handle')
    const shadowSlidersWrap = document.getElementById('shadow-sliders-wrap')
    const shadowAngleWrap = document.getElementById('shadow-angle-wrap')
    const shadowAngle = document.getElementById('edit-shadow-angle')
    const isShadowOn = innerText.shadowOpacity() > 0
    shadowToggle.classList.toggle('shadow-active', isShadowOn)
    shadowToggle.style.backgroundColor = isShadowOn ? '#1a252f' : '#34495e'
    shadowColor.value = innerText.shadowColor() || '#000000'
    shadowBlur.value = innerText.getAttr('rawShadowBlur') ?? (innerText.shadowBlur() || 0)
    shadowThickness.value = isShadowOn ? Math.round(innerText.shadowOpacity() * 100) : 100
    const maxRadius = 20
    const maxShadowDist = 15
    const sOffsetX = innerText.shadowOffsetX() || 0
    const sOffsetY = innerText.shadowOffsetY() || 0
    if (shadowAngle) {
        let currentAngle = 0
        if (sOffsetX !== 0 || sOffsetY !== 0) currentAngle = Math.round(Math.atan2(sOffsetX, sOffsetY) * 180 / Math.PI)
        shadowAngle.value = currentAngle
    }
    const shadowUIElements = [shadowColor, shadowWheel, shadowAngleWrap]
    shadowUIElements.forEach(el => { el.style.opacity = isShadowOn ? '1' : '0.5'; el.style.pointerEvents = isShadowOn ? 'auto' : 'none' })
    shadowSlidersWrap.style.opacity = isShadowOn ? '1' : '0.5'
    shadowSlidersWrap.style.pointerEvents = isShadowOn ? 'auto' : 'none'
    let handleX = sOffsetX * (maxRadius / maxShadowDist)
    let handleY = sOffsetY * (maxRadius / maxShadowDist)
    const dist = Math.sqrt(handleX * handleX + handleY * handleY)
    if (dist > maxRadius) { handleX = (handleX / dist) * maxRadius; handleY = (handleY / dist) * maxRadius }
    shadowHandle.style.left = `${maxRadius + handleX - 4}px`
    shadowHandle.style.top = `${maxRadius + handleY - 4}px`
    
    if (typeof bindFollowModule === 'function') bindFollowModule(node, false)
    initCaptionsPanel(node)
    if (typeof initTransformsPanel === 'function') initTransformsPanel(node)
    renderLayersUI()
}

export function initTextEditorBindings() {
    const getActiveNodes = () => {
        if (!activeNode) return null
        const isGroup = activeNode.getClassName() === 'Group'
        const innerText = isGroup ? activeNode.findOne('.inner-text') : (activeNode.getClassName() === 'Text' ? activeNode : null)
        const textBg = isGroup ? activeNode.findOne('.text-bg') : null
        return { group: activeNode, text: innerText, bg: textBg }
    }

    const updateDimensions = (nodes) => {
        if (!nodes || !nodes.text || !nodes.group) return
        
        const customW = nodes.text.width() // Caches custom width before measurement
        
        // Clears fixed bounds to let Konva natively measure the physical string width/height
        nodes.text.width(null)
        nodes.text.height(null)
        
        const tightW = nodes.text.width()
        const newH = nodes.text.height()
        
        const newW = customW > tightW ? customW : tightW // PRESERVES custom width so alignment boundaries work!
        
        // Locks the measured bounds back onto the text node so manual scaling handles work cleanly
        nodes.text.width(newW)
        // Height deliberately left unassigned so text always hugs the top edge correctly
        
        // applies updated dimensions and centering offsets to parent group
        nodes.group.setAttrs({
            width: newW,
            height: newH,
            offsetX: newW / 2,
            offsetY: newH / 2
        })
        
        // syncs background rectangle to new dimensions
        if (nodes.bg) {
            nodes.bg.setAttrs({
                width: newW,
                height: newH
            })
        }
        
        if (typeof transformer !== 'undefined' && transformer) {
            transformer.forceUpdate()
        }
        
        // forces layer redraw
        if (nodes.group.getLayer()) {
            nodes.group.getLayer().batchDraw()
        }
    }

    // auto-selects input values when focused
    const autoSelectInputs = ['edit-font-size', 'edit-text-transparency', 'edit-shadow-blur', 'edit-shadow-thickness', 'edit-text-width', 'edit-text-height', 'edit-shadow-angle']
    autoSelectInputs.forEach(id => {
        const el = document.getElementById(id)
        if (el) el.addEventListener('focus', () => el.select())
    })

    const wInput = document.getElementById('edit-text-width')
    const hInput = document.getElementById('edit-text-height')
    
    if (wInput) {
        wInput.addEventListener('input', (e) => {
            const nodes = getActiveNodes()
            if (nodes && nodes.group) {
                let newW = parseInt(e.target.value, 10) || 20
                const isLocked = nodes.group.getAttr('keepRatio') || false
                if (isLocked) {
                    const ratio = nodes.group.width() / nodes.group.height()
                    const newH = Math.round(newW / ratio)
                    if (hInput) hInput.value = newH
                    nodes.group.height(newH)
                    nodes.group.offsetY(newH / 2)
                    if (nodes.bg) nodes.bg.height(newH)
                }
                nodes.group.width(newW)
                nodes.group.offsetX(newW / 2)
                if (nodes.bg) nodes.bg.width(newW)
                if (nodes.text) nodes.text.width(newW)
                if (typeof transformer !== 'undefined' && transformer) transformer.forceUpdate()
                if (nodes.group.getLayer()) nodes.group.getLayer().batchDraw()
            }
        })
    }
    
    if (hInput) {
        hInput.addEventListener('input', (e) => {
            const nodes = getActiveNodes()
            if (nodes && nodes.group) {
                let newH = parseInt(e.target.value, 10) || 20
                const isLocked = nodes.group.getAttr('keepRatio') || false
                if (isLocked) {
                    const ratio = nodes.group.width() / nodes.group.height()
                    const newW = Math.round(newH * ratio)
                    if (wInput) wInput.value = newW
                    nodes.group.width(newW)
                    nodes.group.offsetX(newW / 2)
                    if (nodes.bg) nodes.bg.width(newW)
                    if (nodes.text) nodes.text.width(newW)
                }
                nodes.group.height(newH)
                nodes.group.offsetY(newH / 2)
                if (nodes.bg) nodes.bg.height(newH)
                if (typeof transformer !== 'undefined' && transformer) transformer.forceUpdate()
                if (nodes.group.getLayer()) nodes.group.getLayer().batchDraw()
            }
        })
    }

    // binds global unified object name input to text node updates
    const textInput = document.getElementById('edit-object-name')
    if (textInput) {
        let prevTextValue = ''
        // Instantly highlights the existing text when the user clicks into the field
        textInput.addEventListener('focus', () => {
            prevTextValue = textInput.value
            textInput.select()
        })
        textInput.addEventListener('blur', () => {
            if (textInput.value.trim() === '') {
                textInput.value = prevTextValue
                textInput.dispatchEvent(new Event('input'))
            }
        })
        textInput.addEventListener('dblclick', () => {
            textInput.select()
        })
        textInput.addEventListener('input', (e) => {
            const node = activeNode
            if (node) {
                const newVal = e.target.value
                const oldName = node.name()
                
                node.name(newVal)
                
                // dynamically syncs the physical canvas text to match the properties input
                const nodes = getActiveNodes()
                if (nodes && nodes.text) {
                    nodes.text.text(newVal)
                    updateDimensions(nodes)
                }
                
                if (typeof appLayers !== 'undefined') {
                    appLayers.forEach(l => {
                        l.objects.forEach(o => {
                            if (o.node === node) o.name = newVal
                        })
                    })
                }
                
                // strictly bypasses layer list text update if the object belongs to a group
                if (!node.getAttr('transformGroupName') && !node.getAttr('captionsGroupName')) {
                    const activeSpan = document.querySelector('.list-item.active-item .layer-name') || document.querySelector('.list-item.active-item > span')
                    if (activeSpan) {
                        activeSpan.innerText = newVal
                        
                        // perfectly applies marquee effect to long text layer names while typing
                        requestAnimationFrame(() => requestAnimationFrame(() => window.applyMarquee(activeSpan)))
                    }
                }
            }
        })
    }
    
    document.getElementById('edit-font-size').addEventListener('input', (e) => {
        const nodes = getActiveNodes()
        if (nodes && nodes.text) {
            nodes.text.fontSize(parseInt(e.target.value, 10))
            updateDimensions(nodes)
        }
    })

    // generic ui spinner binding helper
    const bindTextSpinner = (inputId, upId, downId, min, max, step) => {
        const input = document.getElementById(inputId)
        const upBtn = document.getElementById(upId)
        const downBtn = document.getElementById(downId)
        
        if (!input || !upBtn || !downBtn) return
        
        const changeVal = (delta) => {
            let val = parseFloat(input.value) || 0
            val = Math.min(max, Math.max(min, val + delta))
            input.value = val
            input.dispatchEvent(new Event('input'))
        }
        
        upBtn.onclick = () => changeVal(step)
        downBtn.onclick = () => changeVal(-step)
    }

    bindTextSpinner('edit-font-size', 'font-size-up', 'font-size-down', 1, 500, 1)
    bindTextSpinner('edit-text-transparency', 'transp-up', 'transp-down', 0, 100, 1)
    bindTextSpinner('edit-stroke-width', 'stroke-up', 'stroke-down', 0, 20, 1)

    const parseRgba = (hex, transpPct) => {
        let r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16)
        return `rgba(${r}, ${g}, ${b}, ${1 - (transpPct/100)})`
    }

    const applyColor = () => {
        const nodes = getActiveNodes()
        if (!nodes) return
        const target = document.getElementById('edit-color-target').value
        const hexVal = document.getElementById('edit-shared-color').value
        const widthVal = parseInt(document.getElementById('edit-stroke-width').value, 10) || 1
        const transpVal = parseInt(document.getElementById('edit-text-transparency').value, 10) || 0
        const isNone = document.getElementById('edit-color-none').checked
        
        if (target === 'textFill' && nodes.text) {
            nodes.text.fill(parseRgba(hexVal, transpVal))
        } else if (target === 'textStroke' && nodes.text) {
            if (isNone) {
                nodes.text.stroke('transparent')
            } else {
                nodes.text.stroke(hexVal)
                if (nodes.text.strokeWidth() === 0) nodes.text.strokeWidth(widthVal)
            }
        } else if (target === 'bgFill' && nodes.bg) {
            nodes.bg.fill(isNone ? 'transparent' : hexVal)
        } else if (target === 'bgStroke' && nodes.bg) {
            if (isNone) {
                nodes.bg.stroke('transparent')
            } else {
                nodes.bg.stroke(hexVal)
                if (nodes.bg.strokeWidth() === 0) nodes.bg.strokeWidth(widthVal)
            }
        }
    }

    document.getElementById('edit-shared-color').addEventListener('input', applyColor)
    document.getElementById('edit-text-transparency').addEventListener('input', applyColor)
    
    document.getElementById('edit-color-none').addEventListener('change', (e) => {
        const colorInput = document.getElementById('edit-shared-color')
        colorInput.disabled = e.target.checked
        colorInput.style.opacity = e.target.checked ? '0.5' : '1'
        applyColor()
    })
    
    document.getElementById('edit-stroke-width').addEventListener('input', (e) => {
        const nodes = getActiveNodes()
        if (!nodes) return
        const target = document.getElementById('edit-color-target').value
        const val = parseInt(e.target.value, 10) || 0
        const hexVal = document.getElementById('edit-shared-color').value
        const isNone = document.getElementById('edit-color-none').checked
        
        if (target === 'bgStroke' && nodes.bg) {
            nodes.bg.strokeWidth(val)
            if (!isNone && nodes.bg.stroke() === 'transparent') nodes.bg.stroke(hexVal)
        } else if (target === 'textStroke' && nodes.text) {
            nodes.text.strokeWidth(val)
            if (!isNone && nodes.text.stroke() === 'transparent') nodes.text.stroke(hexVal)
        }
    })
    
    document.getElementById('edit-font-family').addEventListener('change', (e) => {
        const nodes = getActiveNodes()
        if (nodes && nodes.text) {
            nodes.text.fontFamily(e.target.value)
            updateDimensions(nodes)
        }
    })
    
    document.getElementById('edit-font-style').addEventListener('change', (e) => {
        const nodes = getActiveNodes()
        if (nodes && nodes.text) {
            nodes.text.fontStyle(e.target.value)
            updateDimensions(nodes)
        }
    })
    
    document.getElementById('edit-text-align').addEventListener('change', (e) => {
        const nodes = getActiveNodes()
        if (nodes && nodes.text) {
            nodes.text.align(e.target.value)
            updateDimensions(nodes) // Forces boundary box to digest the alignment
        }
    })

    initShadowControls(getActiveNodes)

    // Globally captures any text property edits and fires a custom sync event
    const textPanel = document.getElementById('text-edit-panel')
    if (textPanel && !window._panelStyleBound) {
        window._panelStyleBound = true
        
        const fireSync = () => document.dispatchEvent(new Event('textStyleChanged'))
        
        textPanel.addEventListener('input', fireSync)
        textPanel.addEventListener('change', fireSync)
        textPanel.addEventListener('click', fireSync)
        
        // Failsafe intercept for floating color pickers or inputs placed outside the core panel container
        document.body.addEventListener('input', (e) => {
            if (e.target && e.target.type === 'color') fireSync()
        })
        document.body.addEventListener('change', (e) => {
            if (e.target && e.target.type === 'color') fireSync()
        })
        
        document.addEventListener('mouseup', fireSync)
    }
}

export function initImageEditorBindings() {
    const getActiveImageNode = () => {
        if (!activeNode || !['Circle', 'Rect', 'Image', 'Shape'].includes(activeNode.getClassName())) return null
        return activeNode
    }

    // securely transitions shape layout variables to the new unified ID structure
    const shapeType = document.getElementById('edit-shape-type')
    const shapeWrap = document.getElementById('shape-properties-container')
    const imagePanel = document.getElementById('image-edit-panel')
    
    const updateName = (e) => {
        const node = getActiveImageNode()
        if (node) {
            const newVal = e.target.value
            const oldName = node.name()
            
            node.name(newVal)
            if (typeof appLayers !== 'undefined') {
                appLayers.forEach(l => {
                    l.objects.forEach(o => {
                        if (o.node === node) o.name = newVal
                    })
                })
            }
            
            // strictly bypasses layer list text update if the object belongs to a group
            if (!node.getAttr('transformGroupName') && !node.getAttr('captionsGroupName')) {
                const activeSpan = document.querySelector('.list-item.active-item .layer-name') || document.querySelector('.list-item.active-item > span')
                if (activeSpan) {
                    activeSpan.innerText = newVal
                    
                    // perfectly applies marquee effect to long layer names while typing
                    requestAnimationFrame(() => requestAnimationFrame(() => window.applyMarquee(activeSpan)))
                }
            }
        }
    }

    // directly binds universal object name field for images and shapes
    const objectNameInput = document.getElementById('edit-object-name')
    if (objectNameInput) {
        objectNameInput.addEventListener('focus', () => objectNameInput.select())
        objectNameInput.addEventListener('input', updateName)
        objectNameInput.addEventListener('blur', () => {
            if (objectNameInput.value.trim() === '') {
                const node = getActiveImageNode()
                if (node) {
                    objectNameInput.value = node.name()
                    objectNameInput.dispatchEvent(new Event('input'))
                }
            }
        })
    }

    if (shapeType) {
        shapeType.addEventListener('change', (e) => {
            const node = getActiveImageNode()
            if (node) {
                node.setAttr('shapeClassType', e.target.value)
                
                // Resets shape to the universal default border box size so dimensions align inside it
                const defaultDim = 120
                node.width(defaultDim)
                node.height(defaultDim)
                node.scaleX(1)
                node.scaleY(1)
                node.offsetX(defaultDim / 2)
                node.offsetY(defaultDim / 2)
                
                const wInput = document.getElementById('image-width')
                const hInput = document.getElementById('image-height')
                if (wInput) wInput.value = defaultDim
                if (hInput) hInput.value = defaultDim
                
                if (typeof transformer !== 'undefined' && transformer) transformer.forceUpdate()
                if (node.getLayer()) node.getLayer().batchDraw()
            }
        })
    }

    // Automatically toggles field visibility based on the active object type
    if (imagePanel) {
                const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    if (imagePanel.style.display !== 'none') {
                        const node = getActiveImageNode()
                        if (node && typeof node.getClassName === 'function') {
                            const isImage = node.getClassName() === 'Image'
                            
                            const objectNameInput = document.getElementById('edit-object-name')
                            if (objectNameInput) {
                                objectNameInput.value = node.name()
                            }
                            
                            const shapeColorWrap = document.getElementById('object-border-panel')
                            if (shapeWrap) {
                                shapeWrap.style.display = isImage ? 'none' : 'flex'
                            }
                            if (shapeColorWrap) {
                                // displays border panel for both images and shapes
                                shapeColorWrap.style.display = 'flex'
                            }

                            if (!isImage) {
                                if (shapeType) shapeType.value = node.getAttr('shapeClassType') || 'Rectangle'
                                const shapeFill = document.getElementById('edit-shape-fill')
                                if (shapeFill && node.fill) shapeFill.value = node.fill() || '#ffffff'
                            }

                            // processes border properties for both images and shapes
                            const shapeStroke = document.getElementById('edit-shape-stroke')
                            const shapeBorderToggle = document.getElementById('shape-border-toggle')
                            const shapeStrokeWidth = document.getElementById('edit-shape-stroke-width')
                            const shapeStrokeStyle = document.getElementById('edit-shape-stroke-style')
                            const shapeBorderProps = document.getElementById('shape-border-props')
                            
                            const strokeVal = node.stroke ? node.stroke() : null
                            if (!strokeVal || strokeVal === 'transparent') {
                                if (shapeBorderToggle) shapeBorderToggle.style.backgroundColor = '#34495e'
                                if (shapeStroke) {
                                    shapeStroke.disabled = true
                                    shapeStroke.style.opacity = '0.5'
                                }
                                if (shapeStrokeStyle) {
                                    shapeStrokeStyle.disabled = true
                                    shapeStrokeStyle.style.opacity = '0.5'
                                }
                                if (shapeBorderProps) {
                                    shapeBorderProps.style.opacity = '0.5'
                                    shapeBorderProps.style.pointerEvents = 'none'
                                }
                            } else {
                                if (shapeBorderToggle) shapeBorderToggle.style.backgroundColor = '#00a8ff'
                                if (shapeStroke) {
                                    shapeStroke.disabled = false
                                    shapeStroke.style.opacity = '1'
                                    shapeStroke.value = strokeVal
                                }
                                if (shapeStrokeStyle) {
                                    shapeStrokeStyle.disabled = false
                                    shapeStrokeStyle.style.opacity = '1'
                                }
                                if (shapeBorderProps) {
                                    shapeBorderProps.style.opacity = '1'
                                    shapeBorderProps.style.pointerEvents = 'auto'
                                }
                            }
                            if (shapeStrokeWidth && node.strokeWidth) shapeStrokeWidth.value = node.strokeWidth() || 2
                            
                            const dashArray = node.dash ? node.dash() : null
                            if (!dashArray || dashArray.length === 0) {
                                if (shapeStrokeStyle) shapeStrokeStyle.value = 'solid'
                            } else if (dashArray[0] === dashArray[1]) {
                                if (shapeStrokeStyle) shapeStrokeStyle.value = 'dotted'
                            } else {
                                if (shapeStrokeStyle) shapeStrokeStyle.value = 'dashed'
                            }

                            const setSideBtn = (id, isOn) => {
                                const btn = document.getElementById(id)
                                if (btn) {
                                    btn.style.backgroundColor = isOn ? '#00a8ff' : '#34495e'
                                    btn.style.color = isOn ? '#ffffff' : '#aaa'
                                }
                            }
                            setSideBtn('border-side-top', node.getAttr('strokeTop') ?? true)
                            setSideBtn('border-side-right', node.getAttr('strokeRight') ?? true)
                            setSideBtn('border-side-bottom', node.getAttr('strokeBottom') ?? true)
                            setSideBtn('border-side-left', node.getAttr('strokeLeft') ?? true)

                            const shapeTypeVal = node.getAttr('shapeClassType') || 'Rectangle'
                            const isRect = shapeTypeVal === 'Rectangle' || shapeTypeVal === 'Square'
                            const sideBtnsWrap = document.getElementById('border-sides-wrap')
                            if (sideBtnsWrap) {
                                sideBtnsWrap.style.opacity = (isRect || isImage) ? '1' : '0.2'
                                sideBtnsWrap.style.pointerEvents = (isRect || isImage) ? 'auto' : 'none'
                            }

                            const title = document.getElementById('image-panel-title')
                            if (title) title.innerText = isImage ? 'Image Properties' : 'Shape Properties'
                            
                            const nameInput = document.getElementById('edit-object-name')
                            if (nameInput) {
                                if (node.getAttr('transformGroupName')) {
                                    const rowsContainer = document.getElementById('transforms-rows')
                                    let foundRowVal = null
                                    if (rowsContainer) {
                                        let activeRow = Array.from(rowsContainer.children).find(r => r.style.borderLeftColor === 'rgb(0, 168, 255)' || r.style.borderLeftColor === '#00a8ff')
                                        if (!activeRow) {
                                            activeRow = Array.from(rowsContainer.children).find(r => r.dataset.transformKey === node.name())
                                            if (activeRow) {
                                                Array.from(rowsContainer.children).forEach(r => r.style.borderLeftColor = 'transparent')
                                                activeRow.style.borderLeftColor = '#00a8ff'
                                            }
                                        }
                                        if (activeRow) {
                                            const rowInput = activeRow.querySelector('.panel-input input[type="text"]') || activeRow.querySelector('input[type="text"]')
                                            if (rowInput) foundRowVal = rowInput.value
                                            
                                            const idx = Array.from(rowsContainer.children).indexOf(activeRow)
                                            node.setAttr('activeTransformEditIndex', idx)

                                            if (!window._preventMatrixReset) {
                                                try {
                                                    let cfg = JSON.parse(activeRow.dataset.transformConfig)
                                                    cfg.activeTransformEditIndex = 0
                                                    activeRow.dataset.transformConfig = JSON.stringify(cfg)
                                                    if (typeof activeRow.renderMatrixGrid === 'function') activeRow.renderMatrixGrid()
                                                    
                                                    let tData = node.getAttr('transformGroupData')
                                                    if (tData && tData[activeRow.dataset.transformKey]) {
                                                        tData[activeRow.dataset.transformKey].activeTransformEditIndex = 0
                                                        node.setAttr('transformGroupData', tData)
                                                    }
                                                } catch(err) {}
                                            }
                                        }
                                    }
                                    nameInput.value = foundRowVal || node.name() || ''
                                } else {
                                    nameInput.value = node.name() || ''
                                }
                            }

                            // sets insertion point to dynamically render structural panel hierarchy
                            const editObjectNameField = document.getElementById('edit-object-name')
                            
                            // maps the newly encapsulated UI containers
                            const shadowPanel = document.getElementById('object-shadow-panel')
                            const transformPanel = document.getElementById('object-transform-panel')
                            const borderPanel = document.getElementById('object-border-panel')
                            
                            // 1. shapewrap securely docks underneath unified name field
                            if (shapeWrap && editObjectNameField && editObjectNameField.parentNode === imagePanel) {
                                if (shapeWrap.previousSibling !== editObjectNameField) {
                                    editObjectNameField.insertAdjacentElement('afterend', shapeWrap)
                                }
                            }

                            // 2. transform panel cascades naturally
                            if (transformPanel && editObjectNameField && editObjectNameField.parentNode === imagePanel) {
                                const insertAfterEl = shapeWrap && shapeWrap.parentNode === imagePanel ? shapeWrap : editObjectNameField
                                if (transformPanel.previousSibling !== insertAfterEl) {
                                    insertAfterEl.insertAdjacentElement('afterend', transformPanel)
                                }
                            }
                            
                            // 3. shadowpanel comes after transformpanel
                            if (shadowPanel && transformPanel && transformPanel.parentNode === imagePanel) {
                                if (shadowPanel.previousSibling !== transformPanel) {
                                    transformPanel.insertAdjacentElement('afterend', shadowPanel)
                                }
                            }

                            // 4. borderpanel comes after shadowpanel
                            if (borderPanel && shadowPanel && shadowPanel.parentNode === imagePanel) {
                                if (borderPanel.previousSibling !== shadowPanel) {
                                    shadowPanel.insertAdjacentElement('afterend', borderPanel)
                                }
                            }
                            
                            // Ensure transform panel uses correct IDs for image/shape objects
                            const transformPanelDiv = document.getElementById('object-transform-panel');
                            if (transformPanelDiv) {
                                const flipH = transformPanelDiv.querySelector('#text-flip-h');
                                if (flipH) flipH.id = 'image-flip-h';
                                const flipV = transformPanelDiv.querySelector('#text-flip-v');
                                if (flipV) flipV.id = 'image-flip-v';
                                const rot90 = transformPanelDiv.querySelector('#text-rot-90');
                                if (rot90) rot90.id = 'image-rot-90';
                                const center = transformPanelDiv.querySelector('#text-center');
                                if (center) center.id = 'image-center';
                                const wInput = transformPanelDiv.querySelector('#edit-text-width');
                                if (wInput) wInput.id = 'image-width';
                                const hInput = transformPanelDiv.querySelector('#edit-text-height');
                                if (hInput) hInput.id = 'image-height';
                                const ratioLock = transformPanelDiv.querySelector('#text-ratio-lock');
                                if (ratioLock) ratioLock.id = 'image-ratio-lock';
                                const toggleBtn = transformPanelDiv.querySelector('#transform-controls-toggle');
                                if (toggleBtn) toggleBtn.id = 'image-transform-toggle';
                            }
                            
                            // Bind shadow controls for image/shape using the correct object-shadow-panel IDs
                            const shadowToggle = document.getElementById('edit-shadow-toggle')
                            const shadowColor = document.getElementById('edit-shadow-color')
                            const shadowBlur = document.getElementById('edit-shadow-blur')
                            const shadowThickness = document.getElementById('edit-shadow-thickness')
                            const shadowWheel = document.getElementById('shadow-wheel')
                            const shadowHandle = document.getElementById('shadow-wheel-handle')
                            const shadowAngle = document.getElementById('edit-shadow-angle')
                            const shadowAngleWrap = document.getElementById('shadow-angle-wrap')
                            const shadowSlidersWrap = document.getElementById('shadow-sliders-wrap')

                            if (shadowToggle && node) {
                                // Set initial UI state based on node's shadow properties
                                const isShadowOn = (node.shadowOpacity && node.shadowOpacity() > 0) || false
                                const currentOpacity = node.shadowOpacity ? node.shadowOpacity() : 0
                                
                                shadowToggle.classList.toggle('shadow-active', isShadowOn)
                                shadowToggle.style.backgroundColor = isShadowOn ? '#00a8ff' : '#34495e'
                                
                                if (shadowColor) {
                                    shadowColor.value = node.shadowColor ? (node.shadowColor() || '#000000') : '#000000'
                                    shadowColor.style.opacity = isShadowOn ? '1' : '0.5'
                                    shadowColor.style.pointerEvents = isShadowOn ? 'auto' : 'none'
                                }
                                
                                if (shadowBlur) {
                                    const rawBlur = node.getAttr ? (node.getAttr('rawShadowBlur') ?? (node.shadowBlur ? node.shadowBlur() : 0)) : 0
                                    shadowBlur.value = rawBlur
                                    shadowBlur.style.opacity = isShadowOn ? '1' : '0.5'
                                    shadowBlur.style.pointerEvents = isShadowOn ? 'auto' : 'none'
                                }
                                
                                if (shadowThickness) {
                                    shadowThickness.value = isShadowOn ? Math.round(currentOpacity * 100) : 100
                                    shadowThickness.style.opacity = isShadowOn ? '1' : '0.5'
                                    shadowThickness.style.pointerEvents = isShadowOn ? 'auto' : 'none'
                                }
                                
                                const maxRadius = 20
                                const maxShadowDist = 15
                                const sOffsetX = node.shadowOffsetX ? (node.shadowOffsetX() || 0) : 0
                                const sOffsetY = node.shadowOffsetY ? (node.shadowOffsetY() || 0) : 0
                                
                                if (shadowAngle) {
                                    let currentAngle = 0
                                    if (sOffsetX !== 0 || sOffsetY !== 0) {
                                        currentAngle = Math.round(Math.atan2(sOffsetX, sOffsetY) * 180 / Math.PI)
                                    }
                                    shadowAngle.value = currentAngle
                                    shadowAngle.style.opacity = isShadowOn ? '1' : '0.5'
                                    shadowAngle.style.pointerEvents = isShadowOn ? 'auto' : 'none'
                                }
                                
                                if (shadowAngleWrap) {
                                    shadowAngleWrap.style.opacity = isShadowOn ? '1' : '0.5'
                                    shadowAngleWrap.style.pointerEvents = isShadowOn ? 'auto' : 'none'
                                }
                                
                                if (shadowSlidersWrap) {
                                    shadowSlidersWrap.style.opacity = isShadowOn ? '1' : '0.5'
                                    shadowSlidersWrap.style.pointerEvents = isShadowOn ? 'auto' : 'none'
                                }
                                
                                if (shadowWheel) {
                                    shadowWheel.style.opacity = isShadowOn ? '1' : '0.5'
                                    shadowWheel.style.pointerEvents = isShadowOn ? 'auto' : 'none'
                                }
                                
                                let handleX = sOffsetX * (maxRadius / maxShadowDist)
                                let handleY = sOffsetY * (maxRadius / maxShadowDist)
                                
                                const dist = Math.sqrt(handleX * handleX + handleY * handleY)
                                if (dist > maxRadius) {
                                    handleX = (handleX / dist) * maxRadius
                                    handleY = (handleY / dist) * maxRadius
                                }
                                
                                if (shadowHandle) {
                                    shadowHandle.style.left = `${maxRadius + handleX - 4}px`
                                    shadowHandle.style.top = `${maxRadius + handleY - 4}px`
                                }
                                
                                // remove existing listeners to avoid duplicates
                                const newToggle = shadowToggle.cloneNode(true)
                                shadowToggle.parentNode.replaceChild(newToggle, shadowToggle)
                                
                                newToggle.onclick = function() {
                                    const isCurrentlyOn = this.classList.contains('shadow-active')
                                    const newState = !isCurrentlyOn
                                    this.classList.toggle('shadow-active', newState)
                                    this.style.backgroundColor = newState ? '#00a8ff' : '#34495e'
                                    
                                    const thicknessVal = parseInt(shadowThickness.value, 10) || 100
                                    if (newState && node.shadowOpacity) {
                                        node.shadowOpacity(thicknessVal / 100)
                                        if (node.shadowColor) node.shadowColor(shadowColor.value)
                                        if (node.shadowBlur) {
                                            const blurVal = parseInt(shadowBlur.value, 10) || 0
                                            node.shadowBlur(Math.max(0, blurVal))
                                        }
                                        if (node.shadowOffsetX) node.shadowOffsetX(-2)
                                        if (node.shadowOffsetY) node.shadowOffsetY(2)
                                    } else if (node.shadowOpacity) {
                                        node.shadowOpacity(0)
                                    }
                                    
                                    // resolves issue where shadow angle remains greyed out 
                                    const elements = [shadowColor, shadowWheel, shadowAngleWrap, shadowAngle, shadowBlur, shadowThickness]
                                    for (let i = 0; i < elements.length; i++) {
                                        const el = elements[i]
                                        if (el) {
                                            el.style.opacity = newState ? '1' : '0.5'
                                            el.style.pointerEvents = newState ? 'auto' : 'none'
                                        }
                                    }
                                    if (shadowSlidersWrap) {
                                        shadowSlidersWrap.style.opacity = newState ? '1' : '0.5'
                                        shadowSlidersWrap.style.pointerEvents = newState ? 'auto' : 'none'
                                    }
                                    
                                    if (node.getLayer()) node.getLayer().batchDraw()
                                }
                                
                                if (shadowColor) {
                                    shadowColor.oninput = function(e) {
                                        if (node.shadowColor) {
                                            node.shadowColor(e.target.value)
                                            if (node.getLayer()) node.getLayer().batchDraw()
                                        }
                                    }
                                }
                                
                                if (shadowBlur) {
                                    shadowBlur.oninput = function(e) {
                                        if (node.setAttr) {
                                            const rawVal = parseInt(e.target.value, 10) || 0
                                            node.setAttr('rawShadowBlur', rawVal)
                                            if (node.shadowBlur) {
                                                node.shadowBlur(Math.max(0, rawVal))
                                                if (node.getLayer()) node.getLayer().batchDraw()
                                            }
                                        }
                                    }
                                }
                                
                                if (shadowThickness) {
                                    shadowThickness.oninput = function(e) {
                                        const isOn = newToggle.classList.contains('shadow-active')
                                        if (isOn && node.shadowOpacity) {
                                            node.shadowOpacity((parseInt(e.target.value, 10) || 0) / 100)
                                            if (node.getLayer()) node.getLayer().batchDraw()
                                        }
                                    }
                                }
                                
                                if (shadowAngle) {
                                    shadowAngle.oninput = function(e) {
                                        if (node.shadowOffsetX && node.shadowOffsetY) {
                                            let angleDeg = parseInt(e.target.value, 10) || 0
                                            let angleRad = angleDeg * Math.PI / 180
                                            let currentX = node.shadowOffsetX() || 0
                                            let currentY = node.shadowOffsetY() || 0
                                            let distVal = Math.sqrt(currentX * currentX + currentY * currentY)
                                            if (distVal === 0) distVal = 15
                                            const newX = Math.sin(angleRad) * distVal
                                            const newY = Math.cos(angleRad) * distVal
                                            node.shadowOffsetX(newX)
                                            node.shadowOffsetY(newY)
                                            if (shadowHandle && shadowWheel) {
                                                const maxRad = shadowWheel.getBoundingClientRect().width / 2 || 20
                                                let hX = newX * (maxRad / maxShadowDist)
                                                let hY = newY * (maxRad / maxShadowDist)
                                                const hDist = Math.sqrt(hX * hX + hY * hY)
                                                if (hDist > maxRad) {
                                                    hX = (hX / hDist) * maxRad
                                                    hY = (hY / hDist) * maxRad
                                                }
                                                shadowHandle.style.left = `${maxRad + hX - 4}px`
                                                shadowHandle.style.top = `${maxRad + hY - 4}px`
                                            }
                                            if (node.getLayer()) node.getLayer().batchDraw()
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            })
        })
        observer.observe(imagePanel, { attributes: true })
        
        // sets up mirrored observer for text panel to safely claim the shared panels back
        const textPanel = document.getElementById('text-edit-panel')
        if (textPanel) {
            const textObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.attributeName === 'style' && textPanel.style.display !== 'none') {
                        const shadowPanel = document.getElementById('object-shadow-panel')
                        const transformPanel = document.getElementById('object-transform-panel')
                        
                        // Safely targets the new unified properties container instead of the deeply nested textAlign
                        const textPropsContainer = document.getElementById('text-properties-container')
                        if (textPropsContainer && textPropsContainer.parentNode === textPanel) {
                            if (transformPanel) textPanel.insertBefore(transformPanel, textPropsContainer.nextSibling)
                            if (shadowPanel && transformPanel) textPanel.insertBefore(shadowPanel, transformPanel.nextSibling)
                        }
                    }
                })
            })
            textObserver.observe(textPanel, { attributes: true })
        }
    }

    const editImageName = document.getElementById('edit-object-name')
    if (editImageName) {
        // selects entire text string automatically on click for rapid renaming
        editImageName.addEventListener('focus', (e) => e.target.select())
        
        editImageName.addEventListener('input', (e) => {
            const node = getActiveImageNode()
            if (node) {
                node.name(e.target.value)
                
                // updates background data model with new string
                appLayers.forEach(layer => {
                    const obj = layer.objects.find(o => o.node === node)
                    if (obj) obj.name = e.target.value
                })
                
                // strictly bypasses layer list text update if the object belongs to a group
                if (!node.getAttr('transformGroupName') && !node.getAttr('captionsGroupName')) {
                    const activeSpan = document.querySelector('.list-item.active-item .layer-name') || document.querySelector('.list-item.active-item > span')
                    if (activeSpan) {
                        activeSpan.innerText = e.target.value
                        requestAnimationFrame(() => requestAnimationFrame(() => window.applyMarquee(activeSpan)))
                    }
                }
            }
        })
    }

    const shapeFill = document.getElementById('edit-shape-fill')
    const shapeStroke = document.getElementById('edit-shape-stroke')
    const shapeBorderToggle = document.getElementById('shape-border-toggle')
    const shapeStrokeWidth = document.getElementById('edit-shape-stroke-width')
    const shapeStrokeStyle = document.getElementById('edit-shape-stroke-style')
    const shapeBorderProps = document.getElementById('shape-border-props')
    
    if (shapeFill) {
        shapeFill.addEventListener('input', (e) => {
            const node = getActiveImageNode()
            if (node && node.getClassName() !== 'Image') {
                node.fill(e.target.value)
                if (node.getLayer()) node.getLayer().batchDraw()
            }
        })
    }
    
    const updateShapeBorder = () => {
        const node = getActiveImageNode()
        // allows border updates for image nodes
        if (!node) return
        
        // prevents updating if border is currently toggled off
        const isOff = !node.stroke() || node.stroke() === 'transparent'
        if (isOff) return
        
        const color = shapeStroke ? shapeStroke.value : '#000000'
        const width = shapeStrokeWidth ? (parseInt(shapeStrokeWidth.value, 10) || 2) : 2
        const style = shapeStrokeStyle ? shapeStrokeStyle.value : 'solid'
        
        node.stroke(color)
        node.strokeWidth(width)
        
        if (style === 'dashed') {
            node.dash([width * 3, width * 2])
        } else if (style === 'dotted') {
            node.dash([width, width])
        } else {
            node.dash([]) 
        }
        
        if (node.getLayer()) node.getLayer().batchDraw()
    }

    if (shapeBorderToggle) {
        shapeBorderToggle.onclick = () => {
            const node = getActiveImageNode()
            // allows border toggle for image nodes
            if (!node) return
            
            const isCurrentlyOff = !node.stroke() || node.stroke() === 'transparent'
            
            if (isCurrentlyOff) {
                // activates border and updates visual state
                const color = shapeStroke ? shapeStroke.value : '#000000'
                const width = shapeStrokeWidth ? (parseInt(shapeStrokeWidth.value, 10) || 2) : 2
                node.stroke(color)
                node.strokeWidth(width)
                
                shapeBorderToggle.style.backgroundColor = '#00a8ff'
                if (shapeStroke) {
                    shapeStroke.disabled = false
                    shapeStroke.style.opacity = '1'
                }
                if (shapeStrokeStyle) {
                    shapeStrokeStyle.disabled = false
                    shapeStrokeStyle.style.opacity = '1'
                }
                if (shapeBorderProps) {
                    shapeBorderProps.style.opacity = '1'
                    shapeBorderProps.style.pointerEvents = 'auto'
                }
                updateShapeBorder()
            } else {
                // deactivates border and greys out properties
                node.stroke('transparent')
                shapeBorderToggle.style.backgroundColor = '#34495e'
                if (shapeStroke) {
                    shapeStroke.disabled = true
                    shapeStroke.style.opacity = '0.5'
                }
                if (shapeStrokeStyle) {
                    shapeStrokeStyle.disabled = true
                    shapeStrokeStyle.style.opacity = '0.5'
                }
                if (shapeBorderProps) {
                    shapeBorderProps.style.opacity = '0.5'
                    shapeBorderProps.style.pointerEvents = 'none'
                }
            }
            if (node.getLayer()) node.getLayer().batchDraw()
        }
    }
    
    if (shapeStroke) shapeStroke.addEventListener('input', updateShapeBorder)
    if (shapeStrokeWidth) shapeStrokeWidth.addEventListener('input', updateShapeBorder)
    if (shapeStrokeStyle) shapeStrokeStyle.addEventListener('change', updateShapeBorder)
    
    const setupSideBtn = (btnId, attrName) => {
        const btn = document.getElementById(btnId)
        if (btn) {
            btn.onclick = () => {
                const node = getActiveImageNode()
                // allows side border toggles for image nodes
                if (!node) return
                const current = node.getAttr(attrName) ?? true
                node.setAttr(attrName, !current)

                const isOn = !current
                btn.style.backgroundColor = isOn ? '#00a8ff' : '#34495e'
                btn.style.color = isOn ? '#ffffff' : '#aaa'

                if (node.getLayer()) node.getLayer().batchDraw()
            }
        }
    }
    setupSideBtn('border-side-top', 'strokeTop')
    setupSideBtn('border-side-right', 'strokeRight')
    setupSideBtn('border-side-bottom', 'strokeBottom')
    setupSideBtn('border-side-left', 'strokeLeft')
    
    const shapeStrokeUp = document.getElementById('shape-stroke-up')
    const shapeStrokeDown = document.getElementById('shape-stroke-down')
    if (shapeStrokeWidth && shapeStrokeUp && shapeStrokeDown) {
        const changeVal = (delta) => {
            let val = parseInt(shapeStrokeWidth.value, 10) || 2
            val = Math.min(50, Math.max(1, val + delta))
            shapeStrokeWidth.value = val
            shapeStrokeWidth.dispatchEvent(new Event('input'))
        }
        shapeStrokeUp.onclick = () => changeVal(1)
        shapeStrokeDown.onclick = () => changeVal(-1)
    }

    const wInput = document.getElementById('image-width') || document.getElementById('edit-text-width')
    const hInput = document.getElementById('image-height') || document.getElementById('edit-text-height')
    const ratioLockBtn = document.getElementById('image-ratio-lock') || document.getElementById('text-ratio-lock')
    
    if (ratioLockBtn) {
        ratioLockBtn.onclick = () => {
            const node = getActiveImageNode()
            if (!node) return
            
            // toggles ratio lock state and updates transformer properties
            const isLocked = !(node.getAttr('keepRatio') || false)
            node.setAttr('keepRatio', isLocked)
            
            ratioLockBtn.style.opacity = isLocked ? '1' : ''
            ratioLockBtn.style.color = isLocked ? '#00a8ff' : ''
            
            if (typeof transformer !== 'undefined' && transformer) {
                transformer.keepRatio(isLocked)
                transformer.forceUpdate()
            }
        }
    }

    const updateImageDimensions = (source) => {
        const node = getActiveImageNode()
        if (node) {
            let newW = parseInt(wInput.value, 10) || 1
            let newH = parseInt(hInput.value, 10) || 1
            const isLocked = node.getAttr('keepRatio') || false

            // calculates locked dimension mathematically based on modified axis
            if (isLocked) {
                const ratio = node.width() / node.height()
                if (source === 'w') {
                    newH = Math.round(newW / ratio)
                    if (hInput) hInput.value = newH
                } else if (source === 'h') {
                    newW = Math.round(newH * ratio)
                    if (wInput) wInput.value = newW
                }
            }

            // applies dimensions and re-centers origin point safely
            node.width(newW)
            node.height(newH)
            node.scaleX(1)
            node.scaleY(1)
            node.offsetX(newW / 2)
            node.offsetY(newH / 2)

            if (typeof transformer !== 'undefined' && transformer) transformer.forceUpdate()
            if (node.getLayer()) node.getLayer().batchDraw()
        }
    }

    if (wInput) wInput.oninput = () => updateImageDimensions('w')
    if (hInput) hInput.oninput = () => updateImageDimensions('h')

    const autoSelectInputs = ['image-shadow-blur', 'image-shadow-thickness', 'image-width', 'image-height', 'image-shadow-angle']
    autoSelectInputs.forEach(id => {
        const el = document.getElementById(id)
        if (el) el.addEventListener('focus', () => el.select())
    })
    
    initImageShadowControls(getActiveImageNode)
}

export function initImageShadowControls(getActiveNodes) {
    const shadowToggle = document.getElementById('image-shadow-toggle')
    const shadowColor = document.getElementById('image-shadow-color')
    const shadowBlur = document.getElementById('image-shadow-blur')
    const shadowThickness = document.getElementById('image-shadow-thickness')
    const shadowWheel = document.getElementById('image-shadow-wheel')
    const shadowHandle = document.getElementById('image-shadow-wheel-handle')
    const shadowSlidersWrap = document.getElementById('image-shadow-sliders-wrap')
    const shadowAngleWrap = document.getElementById('image-shadow-angle-wrap')
    const shadowAngle = document.getElementById('image-shadow-angle')

    let isDraggingWheel = false

    const bindSpinner = (inputId, upId, downId, min, max, step) => {
        const input = document.getElementById(inputId)
        const upBtn = document.getElementById(upId)
        const downBtn = document.getElementById(downId)
        
        if (!input || !upBtn || !downBtn) return
        
        const changeVal = (delta) => {
            let val = parseFloat(input.value) || 0
            val = Math.min(max, Math.max(min, val + delta))
            input.value = val
            input.dispatchEvent(new Event('input')) 
        }
        
        upBtn.onclick = () => changeVal(step)
        downBtn.onclick = () => changeVal(-step)
    }

    bindSpinner('image-shadow-blur', 'image-shadow-blur-up', 'image-shadow-blur-down', -50, 50, 1)
    bindSpinner('image-shadow-thickness', 'image-shadow-thickness-up', 'image-shadow-thickness-down', 0, 100, 1)

    if (shadowToggle) {
        shadowToggle.addEventListener('click', () => {
            const node = getActiveNodes()
            if (!node) return

            const isOn = !shadowToggle.classList.contains('shadow-active')
            shadowToggle.classList.toggle('shadow-active', isOn)
            shadowToggle.style.backgroundColor = isOn ? '#1a252f' : '#34495e'

            // resolves NaN returns from parseInt using logical OR operator 
            const thicknessVal = parseInt(shadowThickness.value, 10) || 100
            node.shadowOpacity(isOn ? thicknessVal / 100 : 0)

            const shadowUIElements = [shadowColor, shadowWheel, shadowAngleWrap]
            shadowUIElements.forEach(el => {
                if (el) {
                    el.style.opacity = isOn ? '1' : '0.5'
                    el.style.pointerEvents = isOn ? 'auto' : 'none'
                }
            })
            if (shadowSlidersWrap) {
                shadowSlidersWrap.style.opacity = isOn ? '1' : '0.5'
                shadowSlidersWrap.style.pointerEvents = isOn ? 'auto' : 'none'
            }
        })
    }

    if (shadowColor) {
        shadowColor.addEventListener('input', (e) => {
            const node = getActiveNodes()
            if (node) node.shadowColor(e.target.value)
        })
    }

    if (shadowBlur) {
        shadowBlur.addEventListener('input', (e) => {
            const node = getActiveNodes()
            if (node) {
                const rawVal = parseInt(e.target.value, 10) || 0
                node.setAttr('rawShadowBlur', rawVal)
                node.shadowBlur(Math.max(0, rawVal))
            }
        })
    }

    if (shadowThickness) {
        shadowThickness.addEventListener('input', (e) => {
            const node = getActiveNodes()
            const isOn = shadowToggle && shadowToggle.classList.contains('shadow-active')
            if (node && isOn) {
                node.shadowOpacity((parseInt(e.target.value, 10) || 0) / 100)
            }
        })
    }

    if (shadowAngle) {
        shadowAngle.addEventListener('input', (e) => {
            const node = getActiveNodes()
            if (node && node.shadowOffsetX) {
                let angleDeg = parseInt(e.target.value, 10) || 0
                let angleRad = angleDeg * Math.PI / 180
                
                let currentX = node.shadowOffsetX() || 0
                let currentY = node.shadowOffsetY() || 0
                let dist = Math.sqrt(currentX * currentX + currentY * currentY)
                if (dist === 0) dist = 15 
                
                const newX = Math.sin(angleRad) * dist
                const newY = Math.cos(angleRad) * dist
                
                node.shadowOffsetX(newX)
                node.shadowOffsetY(newY)
                
                const maxRadius = shadowWheel ? shadowWheel.getBoundingClientRect().width / 2 : 20
                const maxShadowDist = 15
                
                let handleX = newX * (maxRadius / maxShadowDist)
                let handleY = newY * (maxRadius / maxShadowDist)
                
                const hDist = Math.sqrt(handleX * handleX + handleY * handleY)
                if (hDist > maxRadius) {
                    handleX = (handleX / hDist) * maxRadius
                    handleY = (handleY / hDist) * maxRadius
                }
                
                if (shadowHandle) {
                    shadowHandle.style.left = `${maxRadius + handleX - 4}px`
                    shadowHandle.style.top = `${maxRadius + handleY - 4}px`
                }
            }
        })
    }

    const updateShadowFromWheel = (e) => {
        if (!shadowWheel || !shadowHandle) return
        const rect = shadowWheel.getBoundingClientRect()
        const centerX = rect.width / 2
        const centerY = rect.height / 2

        let dx = e.clientX - rect.left - centerX
        let dy = e.clientY - rect.top - centerY

        const maxRadius = rect.width / 2
        const maxShadowDist = 15

        let distance = Math.sqrt(dx * dx + dy * dy)
        if (distance > maxRadius) {
            dx = (dx / distance) * maxRadius
            dy = (dy / distance) * maxRadius
        }

        shadowHandle.style.left = `${centerX + dx - 4}px`
        shadowHandle.style.top = `${centerY + dy - 4}px`

        const node = getActiveNodes()
        if (node && node.shadowOffsetX) {
            const scale = maxShadowDist / maxRadius
            node.shadowOffsetX(dx * scale)
            node.shadowOffsetY(dy * scale)
            if (shadowAngle) shadowAngle.value = (dx === 0 && dy === 0) ? 0 : Math.round(Math.atan2(dx, dy) * 180 / Math.PI)
        }
    }

    if (shadowWheel) {
        shadowWheel.addEventListener('mousedown', (e) => {
            e.preventDefault()
            e.stopPropagation()
            isDraggingWheel = true
            updateShadowFromWheel(e)
        })
    }

    document.addEventListener('mousemove', (e) => {
        if (isDraggingWheel) updateShadowFromWheel(e)
    })

    document.addEventListener('mouseup', () => {
        isDraggingWheel = false
    })
}

export function openShapeEditor(node) {
    confirmSelection()
    setActiveNode(node)
    
    const trackEditPanel = document.getElementById('track-edit-panel')
    if (trackEditPanel) {
        trackEditPanel.style.display = 'block'
        
        const nameInput = document.getElementById('track-target-name')
        if (nameInput) {
            nameInput.value = node.name()
            if (node.getAttr('trackingId')) nameInput.disabled = true
        }
        
        // perfectly syncs the html box memory and visual label to the active konva object to prevent stale default overwrites
        const trackBox = document.getElementById('tracking-target-box')
        if (trackBox) trackBox.dataset.targetName = node.name()
        
        const labelTab = document.getElementById('track-box-label')
        if (labelTab) labelTab.innerText = node.name()
        
        if (node.getAttr('trackingId')) {
            const identId = document.getElementById('ident-id')
            if (identId) identId.innerText = node.getAttr('trackingId')
            
            // Populates the readouts for existing targets
            const identInterval = document.getElementById('ident-interval')
            const identFrames = document.getElementById('ident-frames')
            const identModel = document.getElementById('ident-model')
            
            const trackLayer = appLayers.find(l => l.type === 'tracking')
            const activeObj = trackLayer ? trackLayer.objects.find(o => o.node === node) : null
            
            if (activeObj) {
                const sTime = Number(activeObj.startTime) || 0
                const eTime = Number(activeObj.endTime) || 0
                const fps = node.getAttr('trackingFps') || 30
                const frames = Math.floor((eTime - sTime) * fps) + 1

                if (identInterval) identInterval.innerText = `${sTime.toFixed(2)}s - ${eTime.toFixed(2)}s`
                if (identFrames) identFrames.innerText = frames
                if (identModel) identModel.innerText = node.getAttr('trackingModel') || 'YOLOv8-Seg (ONNX)'
            }

            const identifiers = document.getElementById('track-identifiers')
            if (identifiers) identifiers.style.display = 'flex'
            
            document.getElementById('init-target-btn').style.display = 'none'
            document.getElementById('confirm-track-box-btn').style.display = 'none'
            
            const editBtn = document.getElementById('edit-track-box-btn')
            if (editBtn) editBtn.style.display = 'none'
            
            const reinitBtn = document.getElementById('reinit-track-box-btn')
            if (reinitBtn) {
                reinitBtn.style.display = 'block'
                reinitBtn.disabled = false
                reinitBtn.style.opacity = '1'
                reinitBtn.style.pointerEvents = 'auto'
            }
            
            const processBtn = document.getElementById('process-tracking-btn')
            if (processBtn) {
                processBtn.style.display = 'block'
                processBtn.disabled = false
                processBtn.style.opacity = '1'
                processBtn.style.pointerEvents = 'auto'
                processBtn.style.cursor = 'pointer'
                processBtn.style.backgroundColor = '#00a8ff'
                processBtn.style.color = '#fff'
            }

            const accBlock = document.getElementById('tracking-accuracy-block')
            if (accBlock) {
                accBlock.style.opacity = '1'
                accBlock.style.pointerEvents = 'auto'
            }
            const alphaInput = document.getElementById('track-prop-alpha')
            if (alphaInput) alphaInput.disabled = false
        }
    }
    
    renderLayersUI()
}

export function openImageEditor(node) {
    confirmSelection()
    setActiveNode(node)
    
    // Helper to center origin for any node (image, shape, etc.)
    const ensureCenteredOrigin = (n) => {
        if (!n || !n.width || !n.height) return
        const w = n.width()
        const h = n.height()
        // Only set offset if it's not already centered
        if (n.offsetX && Math.abs(n.offsetX() - w/2) > 0.1) {
            n.offsetX(w / 2)
        }
        if (n.offsetY && Math.abs(n.offsetY() - h/2) > 0.1) {
            n.offsetY(h / 2)
        }
        // If offset was zero, adjust x,y to keep position
        if (n.x && n.offsetX && n.offsetX() === w/2 && n.offsetX() !== 0) {
            // Already centered – no position change needed because we set offset after creation
        }
    }
    ensureCenteredOrigin(node)
    
    // --- Transform Toggle (Draggable) ---
    // Try to find the toggle button – could be image-transform-toggle or transform-controls-toggle
    let transformToggle = document.getElementById('image-transform-toggle')
    if (!transformToggle) transformToggle = document.getElementById('transform-controls-toggle')
    if (transformToggle) {
        // Remove any existing onclick to avoid duplicates
        const newToggle = transformToggle.cloneNode(true)
        transformToggle.parentNode.replaceChild(newToggle, transformToggle)
        
        const updateTransformState = (isChecked) => {
            node.draggable(isChecked)
            if (isChecked && transformer) transformer.nodes([node])
            else if (transformer) transformer.nodes([])
            newToggle.classList.toggle('transform-active', isChecked)
            newToggle.style.backgroundColor = isChecked ? '#00a8ff' : '#34495e'
        }
        if (!newToggle.hasOwnProperty('checked')) {
            Object.defineProperty(newToggle, 'checked', {
                get: function() { return this.classList.contains('transform-active') },
                set: function(val) { updateTransformState(val) },
                configurable: true
            })
        }
        updateTransformState(node.draggable() || false)
        newToggle.onclick = () => { newToggle.checked = !newToggle.checked }
    } else {
        node.draggable(false)
        if (transformer) transformer.nodes([])
    }
    
    // --- Width / Height inputs ---
    let wInput = document.getElementById('image-width')
    let hInput = document.getElementById('image-height')
    // Fallback to text width/height if not found (should not happen)
    if (!wInput) wInput = document.getElementById('edit-text-width')
    if (!hInput) hInput = document.getElementById('edit-text-height')
    const ratioLockBtn = document.getElementById('image-ratio-lock') || document.getElementById('text-ratio-lock')
    
    const syncDimensionsFromNode = () => {
        // dynamically calculates current scaled dimensions
        if (wInput && node.width) wInput.value = Math.round(node.width() * Math.abs(node.scaleX()))
        if (hInput && node.height) hInput.value = Math.round(node.height() * Math.abs(node.scaleY()))
    }
    
    const updateDimensionsFromInputs = () => {
        if (!node || !node.width || !node.height) return
        let newW = parseInt(wInput.value, 10) || 20
        let newH = parseInt(hInput.value, 10) || 20
        const isLocked = node.getAttr('keepRatio') || false
        if (isLocked) {
            const ratio = node.width() / node.height()
            newH = Math.round(newW / ratio)
            if (hInput) hInput.value = newH
        }
        node.width(newW)
        node.height(newH)
        node.offsetX(newW / 2)
        node.offsetY(newH / 2)
        if (transformer) transformer.forceUpdate()
        if (node.getLayer()) node.getLayer().batchDraw()
    }
    
    if (wInput && hInput && node.width && node.height) {
        syncDimensionsFromNode()
        wInput.oninput = updateDimensionsFromInputs
        hInput.oninput = () => {
            let newH = parseInt(hInput.value, 10) || 20
            let newW = parseInt(wInput.value, 10) || 20
            const isLocked = node.getAttr('keepRatio') || false
            if (isLocked) {
                const ratio = node.width() / node.height()
                newW = Math.round(newH * ratio)
                wInput.value = newW
            }
            node.width(newW)
            node.height(newH)
            node.offsetX(newW / 2)
            node.offsetY(newH / 2)
            if (transformer) transformer.forceUpdate()
            if (node.getLayer()) node.getLayer().batchDraw()
        }
        node.off('transform.imgSync')
        node.on('transform.imgSync', syncDimensionsFromNode)
    }
    
    // --- Ratio Lock Button ---
    if (ratioLockBtn) {
        ratioLockBtn.onclick = () => {
            const isLocked = !(node.getAttr('keepRatio') || false)
            node.setAttr('keepRatio', isLocked)
            ratioLockBtn.style.opacity = isLocked ? '1' : ''
            ratioLockBtn.style.color = isLocked ? '#00a8ff' : ''
            if (transformer) {
                transformer.keepRatio(isLocked)
                transformer.forceUpdate()
            }
        }
        const isLocked = node.getAttr('keepRatio') || false
        ratioLockBtn.style.opacity = isLocked ? '1' : ''
        ratioLockBtn.style.color = isLocked ? '#00a8ff' : ''
        if (transformer) transformer.keepRatio(isLocked)
    }
    
    // --- Action Buttons (Flip, Rotate, Center) ---
    let flipH = document.getElementById('image-flip-h')
    let flipV = document.getElementById('image-flip-v')
    let rot90 = document.getElementById('image-rot-90')
    let center = document.getElementById('image-center')
    // Fallback to text buttons if image ones not found
    if (!flipH) flipH = document.getElementById('text-flip-h')
    if (!flipV) flipV = document.getElementById('text-flip-v')
    if (!rot90) rot90 = document.getElementById('text-rot-90')
    if (!center) center = document.getElementById('text-center')
    
    const centerObject = () => {
        const stage = node.getStage()
        if (stage) {
            const fMode = node.getAttr('followMode') || 'static'
            if (fMode !== 'tracked') {
                node.x(stage.width() / 2)
                node.y(stage.height() / 2)
                node.getLayer()?.batchDraw()
                node.fire('dragmove.follow')
            }
        }
    }
    
    if (flipH) {
        flipH.onclick = () => {
            ensureCenteredOrigin(node)
            node.scaleX(node.scaleX() * -1)
            node.getLayer()?.batchDraw()
            if (transformer) transformer.forceUpdate()
        }
    }
    if (flipV) {
        flipV.onclick = () => {
            ensureCenteredOrigin(node)
            node.scaleY(node.scaleY() * -1)
            node.getLayer()?.batchDraw()
            if (transformer) transformer.forceUpdate()
        }
    }
    if (rot90) {
        rot90.onclick = () => {
            ensureCenteredOrigin(node)
            node.rotation((node.rotation() + 90) % 360)
            node.getLayer()?.batchDraw()
            if (transformer) transformer.forceUpdate()
        }
    }
    if (center) {
        center.onclick = centerObject
    }
    
    // --- Shadow Controls (using shared object-shadow-panel) ---
    const shadowToggle = document.getElementById('edit-shadow-toggle')
    const shadowColor = document.getElementById('edit-shadow-color')
    const shadowBlur = document.getElementById('edit-shadow-blur')
    const shadowThickness = document.getElementById('edit-shadow-thickness')
    const shadowWheel = document.getElementById('shadow-wheel')
    const shadowHandle = document.getElementById('shadow-wheel-handle')
    const shadowSlidersWrap = document.getElementById('shadow-sliders-wrap')
    const shadowAngleWrap = document.getElementById('shadow-angle-wrap')
    const shadowAngle = document.getElementById('edit-shadow-angle')
    
    if (shadowToggle && node.shadowOpacity) {
        const isShadowOn = node.shadowOpacity() > 0
        shadowToggle.classList.toggle('shadow-active', isShadowOn)
        shadowToggle.style.backgroundColor = isShadowOn ? '#00a8ff' : '#34495e'
        if (shadowColor) shadowColor.value = node.shadowColor() || '#000000'
        if (shadowBlur) shadowBlur.value = node.getAttr('rawShadowBlur') ?? (node.shadowBlur() || 0)
        if (shadowThickness) shadowThickness.value = isShadowOn ? Math.round(node.shadowOpacity() * 100) : 100
        
        const maxRadius = 20
        const maxShadowDist = 15
        const sOffsetX = node.shadowOffsetX() || 0
        const sOffsetY = node.shadowOffsetY() || 0
        if (shadowAngle) {
            let currentAngle = 0
            if (sOffsetX !== 0 || sOffsetY !== 0) {
                currentAngle = Math.round(Math.atan2(sOffsetX, sOffsetY) * 180 / Math.PI)
            }
            shadowAngle.value = currentAngle
        }
        const shadowUIElements = [shadowColor, shadowWheel, shadowAngleWrap]
        shadowUIElements.forEach(el => {
            if (el) {
                el.style.opacity = isShadowOn ? '1' : '0.5'
                el.style.pointerEvents = isShadowOn ? 'auto' : 'none'
            }
        })
        if (shadowSlidersWrap) {
            shadowSlidersWrap.style.opacity = isShadowOn ? '1' : '0.5'
            shadowSlidersWrap.style.pointerEvents = isShadowOn ? 'auto' : 'none'
        }
        let handleX = sOffsetX * (maxRadius / maxShadowDist)
        let handleY = sOffsetY * (maxRadius / maxShadowDist)
        const dist = Math.sqrt(handleX * handleX + handleY * handleY)
        if (dist > maxRadius) {
            handleX = (handleX / dist) * maxRadius
            handleY = (handleY / dist) * maxRadius
        }
        if (shadowHandle) {
            shadowHandle.style.left = `${maxRadius + handleX - 4}px`
            shadowHandle.style.top = `${maxRadius + handleY - 4}px`
        }
        
        // Remove existing listeners to avoid duplicates
        const newShadowToggle = shadowToggle.cloneNode(true)
        shadowToggle.parentNode.replaceChild(newShadowToggle, shadowToggle)
        newShadowToggle.onclick = () => {
            const newState = !newShadowToggle.classList.contains('shadow-active')
            newShadowToggle.classList.toggle('shadow-active', newState)
            newShadowToggle.style.backgroundColor = newState ? '#00a8ff' : '#34495e'
            const thicknessVal = parseInt(shadowThickness.value, 10) || 100
            if (newState) {
                node.shadowOpacity(thicknessVal / 100)
                if (shadowColor) node.shadowColor(shadowColor.value)
                if (shadowBlur) node.shadowBlur(Math.max(0, parseInt(shadowBlur.value, 10) || 0))
                if (node.shadowOffsetX) node.shadowOffsetX(-2)
                if (node.shadowOffsetY) node.shadowOffsetY(2)
            } else {
                node.shadowOpacity(0)
            }
            const els = [shadowColor, shadowWheel, shadowAngleWrap, shadowAngle, shadowBlur, shadowThickness]
            els.forEach(el => {
                if (el) {
                    el.style.opacity = newState ? '1' : '0.5'
                    el.style.pointerEvents = newState ? 'auto' : 'none'
                }
            })
            if (shadowSlidersWrap) {
                shadowSlidersWrap.style.opacity = newState ? '1' : '0.5'
                shadowSlidersWrap.style.pointerEvents = newState ? 'auto' : 'none'
            }
            node.getLayer()?.batchDraw()
        }
        if (shadowColor) shadowColor.oninput = (e) => { node.shadowColor(e.target.value); node.getLayer()?.batchDraw() }
        if (shadowBlur) shadowBlur.oninput = (e) => {
            const rawVal = parseInt(e.target.value, 10) || 0
            node.setAttr('rawShadowBlur', rawVal)
            node.shadowBlur(Math.max(0, rawVal))
            node.getLayer()?.batchDraw()
        }
        if (shadowThickness) shadowThickness.oninput = (e) => {
            if (newShadowToggle.classList.contains('shadow-active')) {
                node.shadowOpacity((parseInt(e.target.value, 10) || 0) / 100)
                node.getLayer()?.batchDraw()
            }
        }
        if (shadowAngle) shadowAngle.oninput = (e) => {
            let angleDeg = parseInt(e.target.value, 10) || 0
            let angleRad = angleDeg * Math.PI / 180
            let currentX = node.shadowOffsetX() || 0
            let currentY = node.shadowOffsetY() || 0
            let distVal = Math.sqrt(currentX * currentX + currentY * currentY) || 15
            const newX = Math.sin(angleRad) * distVal
            const newY = Math.cos(angleRad) * distVal
            node.shadowOffsetX(newX)
            node.shadowOffsetY(newY)
            if (shadowHandle && shadowWheel) {
                const maxRad = shadowWheel.getBoundingClientRect().width / 2 || 20
                let hx = newX * (maxRad / maxShadowDist)
                let hy = newY * (maxRad / maxShadowDist)
                const hd = Math.sqrt(hx * hx + hy * hy)
                if (hd > maxRad) {
                    hx = (hx / hd) * maxRad
                    hy = (hy / hd) * maxRad
                }
                shadowHandle.style.left = `${maxRad + hx - 4}px`
                shadowHandle.style.top = `${maxRad + hy - 4}px`
            }
            node.getLayer()?.batchDraw()
        }
    }
    
    // --- Follow module ---
    if (typeof bindFollowModule === 'function') bindFollowModule(node, false)
    if (typeof initTransformsPanel === 'function') initTransformsPanel(node)
    
    renderLayersUI()
}

export function openFilterEditor(node) {
    const panel = document.getElementById('filter-edit-panel')
    const layersTab = document.getElementById('layers-tab')

    // globally defines video reference for all filter UI events
    const video = document.getElementById('main-video')

    if (typeof activeNode !== 'undefined' && activeNode && activeNode.id() === node.id() && panel.style.display === 'block') {
        panel.style.display = 'none'
        if (layersTab) layersTab.appendChild(panel)
        if (typeof clearActiveNode === 'function') clearActiveNode()
        if (typeof renderLayersUI === 'function') renderLayersUI()
        return
    }

    if (typeof activeNode !== 'undefined' && activeNode && activeNode.id() !== node.id()) {
        if (typeof confirmSelection === 'function') confirmSelection()
    }

    if (typeof setActiveNode === 'function') setActiveNode(node)
    
    if (panel && layersTab) layersTab.appendChild(panel)

    if (typeof renderLayersUI === 'function') renderLayersUI()
    
    const textPanel = document.getElementById('text-edit-panel')
    const imagePanel = document.getElementById('image-edit-panel')
    const shapePanel = document.getElementById('shape-edit-panel')
    if (textPanel) textPanel.style.display = 'none'
    if (imagePanel) imagePanel.style.display = 'none'
    if (shapePanel) shapePanel.style.display = 'none'
    
    panel.style.display = 'block'
    
    const dropdown = document.getElementById('edit-filter-type')
    const dofBlock = document.getElementById('dof-properties-block')
    const followPanel = document.getElementById('follow-edit-panel')

    const dofBlurInput = document.getElementById('dof-blur-input')
    const dofCoreInput = document.getElementById('dof-core-input')
    const dofFeatherInput = document.getElementById('dof-feather-input')

    const updateFilterUI = (type) => {
        if (dofBlock) dofBlock.style.display = (type === 'depth-of-field') ? 'block' : 'none'
        if (followPanel) followPanel.style.display = (type === 'depth-of-field') ? 'block' : 'none'

        if (type === 'depth-of-field') {
            // Injects the universal follow module
            if (typeof bindFollowModule === 'function') bindFollowModule(node, true)
            
            // DOF-specific physical attributes
            if (dofBlurInput) dofBlurInput.value = (node.getAttr('dofBlur') ?? 8.0).toFixed(1)
            if (dofCoreInput) dofCoreInput.value = (node.getAttr('dofCore') ?? 2.5).toFixed(1)
            if (dofFeatherInput) dofFeatherInput.value = (node.getAttr('dofFeather') ?? 23.0).toFixed(1)
        }
    }

    if (dropdown) {
        dropdown.value = node.getAttr('filterType') || 'none'
        dropdown.onchange = (e) => {
            node.setAttr('filterType', e.target.value)
            updateFilterUI(e.target.value)
            
            // INSTANTLY forces the DOM to perfectly stack the Filter, Follow, and Time panels!
            if (typeof renderLayersUI === 'function') renderLayersUI()
            
            video.dispatchEvent(new Event('timeupdate'))
        }
    }

    updateFilterUI(node.getAttr('filterType') || 'none')

    // Maintains specific Filter Input logic for spinners
    if (dofBlurInput && dofCoreInput && dofFeatherInput) {
        const updateNodeAttrs = () => {
            node.setAttr('dofBlur', parseFloat(dofBlurInput.value) || 0)
            node.setAttr('dofCore', parseFloat(dofCoreInput.value) || 0)
            node.setAttr('dofFeather', parseFloat(dofFeatherInput.value) || 0)
            video.dispatchEvent(new Event('timeupdate'))
        }

        const bindDofSpinner = (inputId, upId, downId, min, max, step) => {
            const input = document.getElementById(inputId)
            const upBtn = document.getElementById(upId)
            const downBtn = document.getElementById(downId)
            
            if (!input || !upBtn || !downBtn) return
            
            const changeVal = (delta) => {
                let val = parseFloat(input.value) || 0
                val = Math.min(max, Math.max(min, val + delta))
                input.value = val.toFixed(1)
                updateNodeAttrs()
            }
            
            upBtn.onclick = () => changeVal(step)
            downBtn.onclick = () => changeVal(-step)
            input.oninput = updateNodeAttrs
        }

        bindDofSpinner('dof-blur-input', 'dof-blur-up', 'dof-blur-down', 0, 50, 0.5)
        bindDofSpinner('dof-core-input', 'dof-core-up', 'dof-core-down', 0, 100, 0.5)
        bindDofSpinner('dof-feather-input', 'dof-feather-up', 'dof-feather-down', 0, 100, 0.5)
    }
}

window.openFilterEditor = openFilterEditor

function toggleVisibility(layerId, e) {
    e.stopPropagation()
    const layer = appLayers.find(l => l.id === layerId)
    if (layer) {
        layer.visible = !layer.visible
        if (layer.konvaLayer) layer.konvaLayer.opacity(layer.visible ? 1 : 0)
        
        if (layer.type === 'base') {
            const vid = document.getElementById('main-video')
            if (vid) vid.style.visibility = layer.visible ? 'visible' : 'hidden'
        }
        renderLayersUI()
        
        // Forces the video to instantly recalculate active filters
        const vid = document.getElementById('main-video')
        if (vid) vid.dispatchEvent(new Event('timeupdate'))
    }
}

function toggleObjectVisibility(layerId, objId, e) {
    e.stopPropagation()
    const layer = appLayers.find(l => l.id === layerId)
    if (layer) {
        const obj = layer.objects.find(o => o.id === objId)
        if (obj) {
            obj.visible = !obj.visible
            if (obj.node) obj.node.opacity(obj.visible ? 1 : 0)
            
            if (layer.type === 'base') {
                const vid = document.getElementById('main-video')
                if (vid) vid.style.visibility = obj.visible ? 'visible' : 'hidden'
            }
            renderLayersUI()
            
            // NEW: Forces the video to instantly recalculate active filters
            const vid = document.getElementById('main-video')
            if (vid) vid.dispatchEvent(new Event('timeupdate'))
        }
    }
}

function toggleLock(layerId, e) {
    e.stopPropagation()
    if (activeNode) return
    
    const layer = appLayers.find(l => l.id === layerId)
    if (layer) {
        layer.locked = !layer.locked
        if (layer.konvaLayer) layer.konvaLayer.listening(!layer.locked)
        renderLayersUI()
    }
}

function toggleObjectLock(layerId, objId, e) {
    e.stopPropagation()
    if (activeNode) return
    
    const layer = appLayers.find(l => l.id === layerId)
    if (layer) {
        const obj = layer.objects.find(o => o.id === objId)
        if (obj) {
            obj.locked = !obj.locked
            if (obj.node) obj.node.listening(!obj.locked)
            renderLayersUI()
        }
    }
}

function selectLayer(layerId) {
    setActiveLayerId(layerId)
    renderLayersUI()
}

export function renderLayersUI() {
    const container = document.getElementById('layers-container')
    
    // 1. SAFELY RESCUE ALL PANELS
    const textPanel = document.getElementById('text-edit-panel')
    const shapePanel = document.getElementById('shape-edit-panel')
    const imagePanel = document.getElementById('image-edit-panel')
    const filterPanel = document.getElementById('filter-edit-panel')
    const timePanel = document.getElementById('time-edit-panel')
    const followPanel = document.getElementById('follow-edit-panel') 

    // check if the currently active node is a tracking target
    let isActiveTracking = false
    if (typeof activeNode !== 'undefined' && activeNode) {
        appLayers.forEach(l => {
            if (l.type === 'tracking' && l.objects.some(o => o.node === activeNode)) {
                isActiveTracking = true
            }
        })
    }
    
    // Extends tracking protection to include any active tracking phase
    const isTrackingActive = isActiveTracking || trackingState !== 'idle'
    
    if (textPanel) { textPanel.style.display = 'none'; document.getElementById('layers-tab').appendChild(textPanel) }
    if (shapePanel) { shapePanel.style.display = 'none'; document.getElementById('shapes-tab').appendChild(shapePanel) }
    if (imagePanel) { imagePanel.style.display = 'none'; document.getElementById('layers-tab').appendChild(imagePanel) }
    if (filterPanel) { filterPanel.style.display = 'none'; document.getElementById('layers-tab').appendChild(filterPanel) }
    if (followPanel) { followPanel.style.display = 'none'; document.getElementById('layers-tab').appendChild(followPanel) } 
    
    // ONLY rescue the Time Panel to the layers-tab if we are NOT actively tracking
    if (timePanel && !isTrackingActive) { 
        timePanel.style.display = 'none'
        document.getElementById('layers-tab').appendChild(timePanel) 
    }

    // 2. ENFORCE MASTER Z-INDEX STACKING
    // Loops sequentially through the arrays and moves elements to the top one by one, 
    // guaranteeing the physical canvas perfectly aligns with the data structure.
    appLayers.forEach(layer => {
        if (layer.konvaLayer) layer.konvaLayer.moveToTop()
        
        if (layer.objects) {
            layer.objects.forEach(obj => {
                if (obj.node) obj.node.moveToTop()
            })
        }
    })
    
    // 3. LOCK SYSTEM OVERLAYS (Natively executes inside canvas-engine)
    // Ensures the UI transformer and visual letterbox mask sit completely above the user layers
    if (typeof forceSystemOverlaysToTop === 'function') {
        forceSystemOverlaysToTop()
    }

    container.innerHTML = ''

    const reversedLayers = [...appLayers].reverse()

    reversedLayers.forEach(layer => {
        // completely hides the layer group from the ui if it contains no objects
        if (layer.type !== 'base' && (!layer.objects || layer.objects.length === 0)) {
            return
        }

        const groupDiv = document.createElement('div')
        groupDiv.className = 'layer-group'
        
        const hasActiveChild = activeNode && layer.objects.some(o => o.node === activeNode)
        const canDragLayer = layer.type !== 'base' && !layer.locked && (!activeNode || hasActiveChild)

        if (canDragLayer) {
            // restricts drag initiation specifically to the handle to prevent text selection from bubbling
            groupDiv.onmouseup = () => groupDiv.draggable = false
            
            groupDiv.addEventListener('dragstart', (e) => {
                draggedLayerId = layer.id
                e.dataTransfer.effectAllowed = 'move'
                setTimeout(() => groupDiv.style.opacity = '0.5', 0)
            })
            groupDiv.addEventListener('dragend', () => {
                groupDiv.style.opacity = '1'
                draggedLayerId = null
            })
        }

        groupDiv.addEventListener('dragover', (e) => {
            e.preventDefault()
            // restricts layer group drop highlights strictly to layer drag events
            if (layer.type !== 'base' && draggedLayerId !== null) groupDiv.classList.add('drag-over')
        })
        groupDiv.addEventListener('dragleave', () => {
            groupDiv.classList.remove('drag-over')
        })
        groupDiv.addEventListener('drop', (e) => {
            e.preventDefault()
            groupDiv.classList.remove('drag-over')
            
            if (draggedLayerId !== null && draggedLayerId !== layer.id && layer.type !== 'base') {
                const fromIdx = appLayers.findIndex(l => l.id === draggedLayerId)
                const toIdx = appLayers.findIndex(l => l.id === layer.id)
                if (fromIdx > -1 && toIdx > -1) {
                    const [movedLayer] = appLayers.splice(fromIdx, 1)
                    appLayers.splice(toIdx, 0, movedLayer)
                    renderLayersUI()

                    // Syncs filters if a whole filter layer changes position
                    const video = document.getElementById('main-video')
                    if (video) video.dispatchEvent(new Event('timeupdate'))
                }
            }
        })
        
        const layerHeader = document.createElement('div')
        layerHeader.className = `layer-item ${activeLayerId === layer.id ? 'active' : ''} ${hasActiveChild ? 'active-parent' : ''}`
        layerHeader.onclick = () => selectLayer(layer.id)
        
        // Adds drag handle to layer groups for consistency 
        const groupGrip = document.createElement('div')
        groupGrip.className = `drag-handle ${!canDragLayer ? 'disabled' : ''}`
        groupGrip.innerHTML = gripIcon
        
        if (canDragLayer) {
            groupGrip.onmousedown = () => groupDiv.draggable = true
            groupGrip.onmouseup = () => groupDiv.draggable = false
        }
        
        layerHeader.appendChild(groupGrip)
        
        const eyeDiv = document.createElement('div')
        eyeDiv.className = `layer-icon ${layer.visible ? 'active' : ''}`
        eyeDiv.innerHTML = eyeIcon
        eyeDiv.onclick = (e) => toggleVisibility(layer.id, e)
        
        const nameSpan = document.createElement('div')
        nameSpan.className = 'layer-name'
        nameSpan.innerText = layer.name
        nameSpan.style.flexGrow = '1'
        nameSpan.style.marginLeft = '8px' 
        nameSpan.style.display = 'block'
        nameSpan.style.whiteSpace = 'nowrap'
        nameSpan.style.overflow = 'hidden'
        nameSpan.style.textOverflow = 'ellipsis'
        nameSpan.style.minWidth = '0'

        // observes element and strictly applies marquee physics once it becomes fully visible
        window.marqueeObserver.observe(nameSpan)

        nameSpan.addEventListener('dblclick', (e) => {
            e.stopPropagation()
            if (layer.type === 'base') return
            
            const input = document.createElement('input')
            input.type = 'text'
            input.value = layer.name
            input.className = 'panel-input'
            input.style.margin = '0 10px'
            input.style.padding = '2px 5px'
            input.style.height = '24px'
            input.style.flex = '1'
            
            layerHeader.replaceChild(input, nameSpan)
            input.focus()
            input.select()
            
            const saveName = () => {
                if (input.value.trim() !== '') {
                    layer.name = input.value.trim()
                }
                renderLayersUI()
            }
            
            input.addEventListener('blur', saveName)
            input.addEventListener('keydown', (evt) => {
                if (evt.key === 'Enter') saveName()
                if (evt.key === 'Escape') renderLayersUI()
            })
        })
        
        const lockDiv = document.createElement('div')
        lockDiv.className = `layer-icon layer-lock ${layer.locked ? 'active' : ''}`
        lockDiv.innerHTML = lockIcon
        lockDiv.title = layer.locked ? 'Locked' : 'Lock Layer'
        
        if (activeNode && !hasActiveChild) {
            lockDiv.style.opacity = '0.2'
            lockDiv.style.cursor = 'not-allowed'
            lockDiv.onclick = (e) => e.stopPropagation()
        } else {
            lockDiv.onclick = (e) => {
                e.stopPropagation()
                if (hasActiveChild) confirmSelection()
                toggleLock(layer.id, e)
            }
        }

        layerHeader.appendChild(eyeDiv)
        layerHeader.appendChild(nameSpan)
        layerHeader.appendChild(lockDiv)

        if (layer.type !== 'base') {
            const trashDiv = document.createElement('div')
            trashDiv.className = 'layer-icon'
            trashDiv.innerHTML = trashIcon
            trashDiv.style.marginLeft = '10px'
            
            if (activeNode) {
                trashDiv.style.opacity = '0.2'
                trashDiv.style.cursor = 'not-allowed'
                trashDiv.onclick = (e) => e.stopPropagation()
            } else {
                trashDiv.onclick = (e) => {
                    e.stopPropagation()
                    removeLayer(layer.id)
                    // explicitly resets tracking tab if layer type matches
                    if (layer.type === 'tracking') resetTrackingUI()
                }
            }
            layerHeader.appendChild(trashDiv)
        }

        groupDiv.appendChild(layerHeader)

        let reversedObjects = [...layer.objects].reverse()
        const collapsedObjects = []
        const seenGroups = new Set()

        // dynamically collapses grouped objects into a single list item
        reversedObjects.forEach(obj => {
            const tGroupName = obj.node ? obj.node.getAttr('transformGroupName') : null
            if (tGroupName) {
                if (!seenGroups.has(tGroupName)) {
                    seenGroups.add(tGroupName)
                    const activeObjInGroup = reversedObjects.find(o => o.node && o.node.getAttr('transformGroupName') === tGroupName && o.node === activeNode)
                    collapsedObjects.push(activeObjInGroup || obj)
                }
            } else {
                collapsedObjects.push(obj)
            }
        })
        reversedObjects = collapsedObjects

        reversedObjects.forEach(obj => {
            const itemDiv = document.createElement('div')
            itemDiv.className = `list-item ${activeNode && activeNode === obj.node ? 'active-item' : ''}`
            
            const isLocked = layer.locked || obj.locked
            let canDragObj = false
            
            if (layer.type !== 'base' && !isLocked) {
                if (!activeNode) canDragObj = true
                else if (activeNode === obj.node) canDragObj = true
            }
            
            if (layer.type !== 'base') {
                const gripDiv = document.createElement('div')
                gripDiv.className = `drag-handle ${!canDragObj ? 'disabled' : ''}`
                gripDiv.innerHTML = gripIcon
                itemDiv.appendChild(gripDiv)
                
                if (canDragObj) {
                    // restricts drag initiation specifically to the handle to prevent text selection from bubbling
                    gripDiv.onmousedown = () => itemDiv.draggable = true
                    gripDiv.onmouseup = () => itemDiv.draggable = false
                    itemDiv.onmouseup = () => itemDiv.draggable = false
                    
                    itemDiv.addEventListener('dragstart', (e) => {
                        e.stopPropagation()
                        draggedObjectId = obj.id
                        draggedObjectLayerId = layer.id
                        e.dataTransfer.effectAllowed = 'move'
                        setTimeout(() => itemDiv.style.opacity = '0.5', 0)
                    })
                    
                    itemDiv.addEventListener('dragend', (e) => {
                        e.stopPropagation()
                        itemDiv.style.opacity = '1'
                        draggedObjectId = null
                        draggedObjectLayerId = null
                    })
                }
                
                itemDiv.addEventListener('dragover', (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    // prevents drop highlights on list items when a layer group is being dragged
                    if (draggedObjectId !== null) itemDiv.classList.add('drag-over')
                })
                
                itemDiv.addEventListener('dragleave', (e) => {
                    e.stopPropagation()
                    itemDiv.classList.remove('drag-over')
                })
                
                itemDiv.addEventListener('drop', (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    itemDiv.classList.remove('drag-over')
                    
                    if (draggedObjectId !== null && draggedObjectLayerId === layer.id && draggedObjectId !== obj.id) {
                        const isObjLocked = (o) => layer.locked || o.locked
                        const fullDragIdx = layer.objects.findIndex(o => o.id === draggedObjectId)
                        const fullDropIdx = layer.objects.findIndex(o => o.id === obj.id)
                        
                        if (fullDragIdx > -1 && fullDropIdx > -1) {
                            const unlockedItems = layer.objects.filter(o => !isObjLocked(o))
                            const uFrom = unlockedItems.findIndex(o => o.id === draggedObjectId)
                            let uTo = unlockedItems.findIndex(o => o.id === obj.id)
                            
                            if (uTo === -1) {
                                uTo = layer.objects.slice(0, fullDropIdx).filter(o => !isObjLocked(o)).length
                            }
                            
                            if (uFrom > -1) {
                                const [movedObj] = unlockedItems.splice(uFrom, 1)
                                unlockedItems.splice(uTo, 0, movedObj)
                                
                                let unlockedCounter = 0
                                for (let i = 0; i < layer.objects.length; i++) {
                                    if (!isObjLocked(layer.objects[i])) {
                                        layer.objects[i] = unlockedItems[unlockedCounter]
                                        unlockedCounter++
                                    }
                                }
                                
                                renderLayersUI()
                                // Re-evaluates CSS string order instantly upon drop
                                const video = document.getElementById('main-video')
                                if (video) video.dispatchEvent(new Event('timeupdate'))
                            }
                        }
                    }
                })
            }

            const objEye = document.createElement('div')
            objEye.className = `layer-icon small layer-visibility-toggle ${obj.visible ? 'active' : ''}`
            objEye.innerHTML = eyeIcon
            objEye.style.marginRight = '5px'
            objEye.style.display = 'inline-flex'
            objEye.onclick = (e) => toggleObjectVisibility(layer.id, obj.id, e)
            itemDiv.appendChild(objEye)

            const tGroupName = obj.node ? obj.node.getAttr('transformGroupName') : null
            const cGroupName = obj.node ? obj.node.getAttr('captionsGroupName') : null
            const displayName = tGroupName || cGroupName || obj.name

            const label = document.createElement('div')
            label.className = 'layer-name'
            label.innerText = displayName
            label.style.flexGrow = '1'
            label.style.marginLeft = '8px' 
            label.style.display = 'block'
            label.style.whiteSpace = 'nowrap'
            label.style.overflow = 'hidden'
            label.style.textOverflow = 'ellipsis'
            label.style.minWidth = '0' // Guarantees flex children can successfully truncate

            // observes element and strictly applies marquee physics once it becomes fully visible
            window.marqueeObserver.observe(label)

            label.addEventListener('dblclick', (e) => {
                e.stopPropagation()
                if (layer.type === 'base') return
                
                const input = document.createElement('input')
                input.type = 'text'
                input.value = displayName
                input.className = 'panel-input'
                input.style.margin = '0 10px'
                input.style.padding = '2px 5px'
                input.style.height = '24px'
                input.style.flex = '1'
                
                itemDiv.replaceChild(input, label)
                input.focus()
                input.select()
                
                // Live syncs the properties panel object name while typing in the layers list
                input.addEventListener('input', (evt) => {
                    if (activeNode === obj.node) {
                        const editObjName = document.getElementById('edit-object-name')
                        if (editObjName && editObjName.value !== evt.target.value) {
                            editObjName.value = evt.target.value
                            // Dispatches event to ensure canvas text naturally syncs when inline renaming
                            editObjName.dispatchEvent(new Event('input'))
                        }
                    }
                })
                
                const saveName = () => {
                    if (input.value.trim() !== '') {
                        const newVal = input.value.trim()
                        const tGroup = obj.node ? obj.node.getAttr('transformGroupName') : null
                        const cGroup = obj.node ? obj.node.getAttr('captionsGroupName') : null
                        
                        if (tGroup) {
                            layer.objects.forEach(o => {
                                if (o.node && o.node.getAttr('transformGroupName') === tGroup) {
                                    o.node.setAttr('transformGroupName', newVal)
                                    if (o.name === tGroup) o.name = newVal
                                }
                            })
                        } else if (cGroup) {
                            layer.objects.forEach(o => {
                                if (o.node && o.node.getAttr('captionsGroupName') === cGroup) {
                                    o.node.setAttr('captionsGroupName', newVal)
                                    o.name = newVal
                                }
                            })
                        } else {
                            obj.name = newVal
                        }

                        if (obj.node) {
                            obj.node.name(newVal)
                            const textNode = obj.node.findOne('.target-text')
                            if (textNode) textNode.text(newVal)
                        }
                        if (activeNode === obj.node) {
                            const editObjName = document.getElementById('edit-object-name')
                            if (editObjName && !tGroup && !cGroup) editObjName.value = newVal
                        }
                    }
                    renderLayersUI()
                }
                
                input.addEventListener('blur', saveName)
                input.addEventListener('keydown', (evt) => {
                    if (evt.key === 'Enter') saveName()
                    if (evt.key === 'Escape') renderLayersUI()
                })
            })

            itemDiv.appendChild(label)

            const objLock = document.createElement('div')
            objLock.className = `layer-icon layer-lock small ${obj.locked || layer.locked ? 'active' : ''}`
            objLock.innerHTML = lockIcon
            objLock.title = (obj.locked || layer.locked) ? 'Locked' : 'Lock Object'
            objLock.style.marginLeft = '10px'
            objLock.style.marginRight = '10px'
            objLock.style.display = 'inline-flex'
            
            if (layer.type !== 'base') {
                if (activeNode && activeNode !== obj.node) {
                    objLock.style.opacity = '0.2'
                    objLock.style.cursor = 'not-allowed'
                    objLock.onclick = (e) => e.stopPropagation()
                } else {
                    objLock.onclick = (e) => {
                        e.stopPropagation()
                        if (activeNode === obj.node) confirmSelection()
                        toggleObjectLock(layer.id, obj.id, e)
                    }
                }
            }
            itemDiv.appendChild(objLock)

            if (layer.type !== 'base') {
                const controls = document.createElement('div')
                controls.style.display = 'flex'
                controls.style.gap = '5px'
                
                const isActiveObj = activeNode && activeNode === obj.node
                const isEditDisabled = isLocked 
                const isRemoveDisabled = isLocked
                
                const selectBtn = document.createElement('button')
                selectBtn.innerText = 'Edit'
                selectBtn.className = 'action-btn small-btn'
                
                if (isActiveObj) {
                    if (layer.type === 'tracking') {
                        // preserves active button state for tracking layer to act as shortcut jump link
                        selectBtn.disabled = false
                        selectBtn.style.opacity = '1'
                        selectBtn.style.cursor = 'pointer'
                        selectBtn.onclick = (e) => {
                            e.stopPropagation()
                            switchTab('shapes-tab')
                            const header = document.getElementById('target-tracking-header')
                            const tabContent = document.getElementById('shapes-tab')
                            if (header && tabContent) {
                                tabContent.scrollTop = header.offsetTop - 20
                            }
                        }
                    } else {
                        // disables active button state for standard layers
                        selectBtn.disabled = true
                        selectBtn.style.opacity = '0.4'
                        selectBtn.style.cursor = 'default'
                    }
                } else if (isEditDisabled) {
                    // disables button state for locked objects
                    selectBtn.disabled = true
                    selectBtn.style.opacity = '0.4'
                    selectBtn.style.cursor = 'not-allowed'
                } else {
                    // binds default edit selection handlers based on layer type
                    selectBtn.onclick = (e) => {
                        e.stopPropagation()
                        if (layer.type === 'text') {
                            switchTab('layers-tab')
                            openTextEditor(obj.node)
                        } else if (layer.type === 'tracking') {
                            switchTab('shapes-tab')
                            openShapeEditor(obj.node)
                            
                            // defers scroll execution to allow tab rendering cycle to complete
                            setTimeout(() => {
                                const header = document.getElementById('target-tracking-header')
                                const tabContent = document.getElementById('shapes-tab')
                                if (header && tabContent) {
                                    tabContent.scrollTop = header.offsetTop - 20
                                }
                            }, 50)
                        } else if (layer.type === 'image') {
                            switchTab('layers-tab')
                            openImageEditor(obj.node)
                        } else if (layer.type === 'filter') {
                            openFilterEditor(obj.node)
                        }
                    }
                }

                const rmBtn = document.createElement('button')
                rmBtn.innerText = 'X'
                rmBtn.className = 'action-btn small-btn remove-btn'
                
                if (isRemoveDisabled) {
                    // disables remove button for locked objects
                    rmBtn.disabled = true
                    rmBtn.style.opacity = '0.4'
                    rmBtn.style.cursor = 'not-allowed'
                } else {
                    // binds deletion handler
                    rmBtn.onclick = (e) => {
                        e.stopPropagation()
                        const tGroup = obj.node ? obj.node.getAttr('transformGroupName') : null
                        const cGroup = obj.node ? obj.node.getAttr('captionsGroupName') : null
                        
                        if (tGroup || cGroup) {
                            let isActiveNodeInGroup = false
                            
                            // strictly strips group attributes to dissolve the group, keeping individual objects on the canvas
                            appLayers.forEach(l => {
                                if (l.objects) {
                                    l.objects.forEach(sibling => {
                                        if (sibling.node) {
                                            if (tGroup && sibling.node.getAttr('transformGroupName') === tGroup) {
                                                if (sibling.node === activeNode) isActiveNodeInGroup = true
                                                
                                                let tData = sibling.node.getAttr('transformGroupData')
                                                if (tData) {
                                                    const origName = Object.keys(tData).find(k => tData[k].id === sibling.node.id())
                                                    
                                                    let baseType = sibling.node.getClassName()
                                                    if (baseType === 'Group' && typeof sibling.node.findOne === 'function' && sibling.node.findOne('.inner-text')) {
                                                        baseType = 'Text'
                                                    }
                                                    
                                                    let finalName = origName || sibling.node.getAttr('originalName') || `New_${baseType}_1`
                                                    
                                                    // prevents object from inheriting the group's generic ID name if it was synced
                                                    if (finalName === tGroup) {
                                                        finalName = sibling.node.getAttr('originalName') || `New_${baseType}_1`
                                                    }
                                                    
                                                    if (finalName) {
                                                        let uniqueName = finalName
                                                        let counter = 1
                                                        let match = uniqueName.match(/^(.*?)_(\d+)$/)
                                                        let prefix = uniqueName
                                                        if (match) {
                                                            prefix = match[1]
                                                            counter = parseInt(match[2], 10)
                                                        }
                                                        let isUnique = false
                                                        while (!isUnique) {
                                                            isUnique = true
                                                            appLayers.forEach(layer => layer.objects.forEach(obj => {
                                                                if (obj.node !== sibling.node && (obj.name === uniqueName || (obj.node && obj.node.name() === uniqueName))) {
                                                                    isUnique = false
                                                                }
                                                            }))
                                                            if (!isUnique) {
                                                                counter++
                                                                uniqueName = `${prefix}_${counter}`
                                                            }
                                                        }

                                                        sibling.node.name(uniqueName)
                                                        sibling.name = uniqueName
                                                    }
                                                }
                                                sibling.node.setAttr('transformGroupName', null)
                                                sibling.node.setAttr('transformGroupData', null)
                                            }
                                            if (cGroup && sibling.node.getAttr('captionsGroupName') === cGroup) {
                                                if (sibling.node === activeNode) isActiveNodeInGroup = true
                                                
                                                const capList = sibling.node.getAttr('captionsList') || []
                                                const firstRowName = capList.length > 0 ? capList[0] : sibling.node.getAttr('originalName')
                                                
                                                if (firstRowName) {
                                                    let uniqueName = firstRowName
                                                    let counter = 1
                                                    let match = uniqueName.match(/^(.*?)_(\d+)$/)
                                                    let prefix = uniqueName
                                                    if (match) {
                                                        prefix = match[1]
                                                        counter = parseInt(match[2], 10)
                                                    }
                                                    let isUnique = false
                                                    while (!isUnique) {
                                                        isUnique = true
                                                        appLayers.forEach(layer => layer.objects.forEach(obj => {
                                                            if (obj.node !== sibling.node && (obj.name === uniqueName || (obj.node && obj.node.name() === uniqueName))) {
                                                                isUnique = false
                                                            }
                                                        }))
                                                        if (!isUnique) {
                                                            counter++
                                                            uniqueName = `${prefix}_${counter}`
                                                        }
                                                    }

                                                    sibling.node.name(uniqueName)
                                                    sibling.name = uniqueName
                                                    const innerText = typeof sibling.node.findOne === 'function' ? sibling.node.findOne('.inner-text') : null
                                                    if (innerText) innerText.text(uniqueName)
                                                }
                                                
                                                sibling.node.setAttr('originalName', null)
                                                sibling.node.setAttr('captionsGroupName', null)
                                                sibling.node.setAttr('captionsList', null)
                                                sibling.node.setAttr('captionStyles', null)
                                                sibling.node.setAttr('captionTimings', null)
                                                sibling.node.setAttr('activeCaptionEditIndex', null)
                                            }
                                        }
                                    })
                                }
                            })
                            
                            if (isActiveNodeInGroup && typeof activeNode !== 'undefined' && activeNode) {
                                const nClass = activeNode.getClassName()
                                const innerText = typeof activeNode.findOne === 'function' ? activeNode.findOne('.inner-text') : null
                                
                                // opens corresponding editing panel to visually populate properties container with default values
                                if ((nClass === 'Group' && innerText) || nClass === 'Text') {
                                    openTextEditor(activeNode)
                                } else if (nClass === 'Filter') {
                                    openFilterEditor(activeNode)
                                } else {
                                    openImageEditor(activeNode)
                                }
                                
                                const editObjName = document.getElementById('edit-object-name')
                                if (editObjName) editObjName.value = activeNode.name()
                            }
                            
                            renderLayersUI()
                            if (typeof renderMultiTrackTimeline === 'function') renderMultiTrackTimeline()
                        } else {
                            removeObject(layer.name, obj.id)
                            // explicitly resets tracking tab if layer type matches
                            if (layer.type === 'tracking') resetTrackingUI()
                        }
                    }
                }
                
                controls.appendChild(selectBtn)
                controls.appendChild(rmBtn)
                itemDiv.appendChild(controls)
            }
            groupDiv.appendChild(itemDiv)
        })

        if (activeNode && layer.objects.some(o => o.node === activeNode)) {
            
            // 1. Appends specific property panels first
            if (layer.type === 'text' && textPanel) {
                textPanel.style.display = 'block'
                groupDiv.appendChild(textPanel)
                
                // Always append follow capabilities INSIDE Text Properties
                if (followPanel) {
                    followPanel.style.display = 'block'
                    textPanel.appendChild(followPanel) 
                }
            } else if (layer.type === 'tracking' && shapePanel) {
                shapePanel.style.display = 'block'
            } else if (layer.type === 'image' && imagePanel) {
                imagePanel.style.display = 'block'
                groupDiv.appendChild(imagePanel)
                
                // Always append follow capabilities INSIDE Image/Shape Properties
                if (followPanel) {
                    followPanel.style.display = 'block'
                    imagePanel.appendChild(followPanel) 
                }
            } else if (layer.type === 'filter' && filterPanel) {
                filterPanel.style.display = 'block'
                groupDiv.appendChild(filterPanel)
                
                // Only appends follow capabilities INSIDE Depth of Field filters
                if (followPanel && activeNode && activeNode.getAttr('filterType') === 'depth-of-field') {
                    followPanel.style.display = 'block'
                    filterPanel.appendChild(followPanel) 
                }
            }

            // 2. Appends global Time Panel strictly at the bottom of the stack!
            const timePanel = document.getElementById('time-edit-panel')
            if (layer.type !== 'tracking') {
                if (timePanel) {
                    // EXPLICIT FILTER CHECK: Hides the Time Panel if the active filter is "None"
                    const currentFilterType = activeNode ? (activeNode.getAttr('filterType') || 'none') : 'none'
                    
                    if (layer.type === 'filter' && currentFilterType === 'none') {
                        timePanel.style.display = 'none'
                        // securely parks it back in the hidden root so it isn't lost
                        const layersTab = document.getElementById('layers-tab')
                        if (layersTab) layersTab.appendChild(timePanel)
                    } else {
                        timePanel.style.display = 'block'
                        timePanel.style.opacity = '1'
                        timePanel.style.pointerEvents = 'auto'
                        
                        // Nests the Time Panel physically INSIDE the specific property blocks, BEFORE the confirm buttons
                        if (layer.type === 'text' && textPanel) {
                            const btn = document.getElementById('confirm-text-btn')
                            if (btn) textPanel.insertBefore(timePanel, btn)
                            else textPanel.appendChild(timePanel)
                        }
                        else if (layer.type === 'image' && imagePanel) {
                            const btn = document.getElementById('confirm-image-btn')
                            if (btn) imagePanel.insertBefore(timePanel, btn)
                            else imagePanel.appendChild(timePanel)
                        }
                        else if (layer.type === 'filter' && filterPanel) {
                            const btn = document.getElementById('confirm-filter-btn')
                            if (btn) filterPanel.insertBefore(timePanel, btn)
                            else filterPanel.appendChild(timePanel)
                        }
                        else groupDiv.appendChild(timePanel) // Safe fallback
                    }
                }
            } else {
                // Actively routes the Time Panel into the Target Properties for Tracking Objects
                const trackPanel = document.getElementById('track-edit-panel')
                const accBlock = document.getElementById('tracking-accuracy-block')
                if (timePanel && trackPanel && accBlock) {
                    timePanel.style.display = 'block'
                    
                    // Enforces phase-based visibility rules for the Time Panel
                    if (trackingState === 'idle' || trackingState === 'drawing' || trackingState === 'editing') {
                        timePanel.style.opacity = '0.3'
                        timePanel.style.pointerEvents = 'none'
                    } else {
                        timePanel.style.opacity = '1'
                        timePanel.style.pointerEvents = 'auto'
                    }
                    
                    trackPanel.insertBefore(timePanel, accBlock)
                }
            }
        }
        
        container.appendChild(groupDiv)
    })

    if (typeof updateUILockState === 'function') updateUILockState()

    const activeObj = getActiveObj()
    if (activeObj) updateTimePanelUI(activeObj)
    renderTimelineIntervals()
    renderMultiTrackTimeline()

    const pBtn = document.getElementById('process-tracking-btn')
    if (pBtn) {
        if (trackingState === 'confirmed') {
            pBtn.disabled = false
            pBtn.style.opacity = '1'
            pBtn.style.pointerEvents = 'auto'
            pBtn.style.cursor = 'pointer'
            pBtn.style.backgroundColor = '#00a8ff'
            pBtn.style.color = '#fff'
        } else {
            pBtn.disabled = true
            pBtn.style.opacity = '0.3'
            pBtn.style.pointerEvents = 'none'
        }
    }
}

// Initializes all sidebar UI event listeners
export function initSidebarBindings() {
    initTextEditorBindings()
    initImageEditorBindings()
    initTimelineBindings()
    initCropToolBindings()
    initSidebarToggleBindings()
    initTrackingBindings()
    initAdvancedTransformBindings()
    initLayersPanelObserver()
}

// synchronizes edit object name input dynamically when active layer list item is updated
export function initLayersPanelObserver() {
    const layersContainer = document.getElementById('layers-container')
    if (!layersContainer || layersContainer._nameObserverBound) return
    
    layersContainer._nameObserverBound = true
    
    // --- Global bidirectional sync for Group Rows and Object Name ---
    const editObjName = document.getElementById('edit-object-name')
    
    // 1. Sync Row -> Object Name (Captures typing in the timeline rows)
    document.addEventListener('input', (e) => {
        const rowContainer = e.target.closest('#transforms-rows') || e.target.closest('#captions-rows')
        if (rowContainer) {
            const row = e.target.closest('div[style*="border-left"]')
            if (row && (row.style.borderLeftColor === 'rgb(0, 168, 255)' || row.style.borderLeftColor === '#00a8ff')) {
                if (editObjName && editObjName.value !== e.target.value) {
                    editObjName.value = e.target.value
                    // Dispatches event to ensure canvas text and properties naturally sync when editing rows
                    editObjName.dispatchEvent(new Event('input'))
                }
            }
        }
    })
    
    const textObserver = new MutationObserver(() => {
        // Strictly targets the active list item label
        const activeSpan = document.querySelector('.list-item.active-item .layer-name')
        const editObjName = document.getElementById('edit-object-name')
        
        // safely assigns active layer text to properties input without executing dom insertion
        if (activeSpan && editObjName && activeSpan.innerText) {
            // bypasses sync if node is encapsulated in a group to preserve row-level naming
            if (typeof activeNode !== 'undefined' && activeNode && (activeNode.getAttr('transformGroupName') || activeNode.getAttr('captionsGroupName'))) {
                return
            }
            if (editObjName.value !== activeSpan.innerText) {
                editObjName.value = activeSpan.innerText
            }
        }
    })
    
    textObserver.observe(layersContainer, { characterData: true, childList: true, subtree: true })
}

// encodes dictionary object into a compressed base64 string
const encodeData = (data) => {
    return btoa(encodeURIComponent(JSON.stringify(data)))
}

// decodes base64 string back into a javascript object
const decodeData = (encodedStr) => {
    return JSON.parse(decodeURIComponent(atob(encodedStr)))
}

// natively aggregates and formats active node properties into JSON for external configuration exports
window.updateAdvancedConfigDisplay = () => {
    const configDisplay = document.getElementById('advanced-config-display')
    const blockToggle = document.getElementById('transform-blocking-toggle')
    const styleToggle = document.getElementById('transform-styling-toggle')
    
    if (!configDisplay || typeof activeNode === 'undefined' || !activeNode) return

    // preserves horizontal scrolling structure while isolating vertical overflow boundary limits
    configDisplay.style.whiteSpace = 'pre'
    configDisplay.style.wordWrap = 'normal'
    configDisplay.style.overflowX = 'auto'
    configDisplay.style.overflowY = 'auto'
    configDisplay.style.maxHeight = '784px'
    
    const isBlockOn = blockToggle && (blockToggle.style.backgroundColor === 'rgb(0, 168, 255)' || blockToggle.style.backgroundColor === '#00a8ff')
    const isStyleOn = styleToggle && (styleToggle.style.backgroundColor === 'rgb(0, 168, 255)' || styleToggle.style.backgroundColor === '#00a8ff')
    
    if (!isBlockOn && !isStyleOn) {
        if (configDisplay.style.display !== 'none') configDisplay.style.display = 'none'
        return
    }
    
    if (configDisplay.style.display !== 'block') configDisplay.style.display = 'block'
    
    const baseConfig = buildTransformConfig(activeNode)
    if (!baseConfig) return
    
    // tracks which transform-list-item row is currently clicked/highlighted
    const rowsContainer = document.getElementById('transforms-rows')
    let targetNode = activeNode
    let currentObj = null
    
    if (rowsContainer) {
        const activeRow = Array.from(rowsContainer.children).find(r => r.style.borderLeftColor === 'rgb(0, 168, 255)' || r.style.borderLeftColor === '#00a8ff')
        if (activeRow && activeRow.dataset.transformKey) {
            const rowKey = activeRow.dataset.transformKey
            if (typeof appLayers !== 'undefined') {
                appLayers.forEach(l => {
                    if (l.objects) {
                        l.objects.forEach(o => {
                            if (o.node && o.node.name() === rowKey) {
                                targetNode = o.node
                                currentObj = o
                            }
                        })
                    }
                })
            }
        }
    }
    
    if (!currentObj && typeof appLayers !== 'undefined') {
        appLayers.forEach(l => {
            if (l.objects) {
                l.objects.forEach(o => {
                    if (o.node === targetNode) currentObj = o
                })
            }
        })
    }
    
    const objConfig = buildTransformConfig(targetNode)
    const objId = objConfig.id
    const tGroupName = targetNode.getAttr('transformGroupName') || 'Transform_Grp_0000'
    
    const innerText = typeof targetNode.findOne === 'function' ? targetNode.findOne('.inner-text') : null
    let valStr = targetNode.name() || 'New_Object'
    if (innerText && innerText.text) {
        valStr = innerText.text()
    }
    
    // aggregates dynamic counts from the matching active layer group
    let totalObjectsInGroup = 1
    if (typeof appLayers !== 'undefined') {
        appLayers.forEach(l => {
            if (l.objects) {
                const matches = l.objects.filter(o => o.node && o.node.getAttr('transformGroupName') === tGroupName)
                if (matches.length > 0) totalObjectsInGroup = matches.length
            }
        })
    }
    
    // builds single object snapshot structure
    const targetObjData = {
        value: valStr,
        type: objConfig.type || 'Text',
        Blocking: isBlockOn ? objConfig.Blocking : null,
        Styling: isStyleOn ? objConfig.Styling : null,
        objTransformations: {
            markerColor: targetNode.getAttr('markerColor') || 'hsl(138, 100%, 50%)'
        }
    }
    
    if (!isBlockOn) delete targetObjData.Blocking
    if (!isStyleOn) delete targetObjData.Styling
    
    // tracks which transform-config-element index item is actively highlighted (defaults to the first element)
    const activeMarkerIndex = targetNode.getAttr('activeTransformEditIndex') ?? 0
    
    let transformCoordsDict = {}
    
    // correctly isolates the specific object's transform elements array mapping
    const fullGroupData = targetNode.getAttr('transformGroupData') || {}
    let tData = {}
    if (fullGroupData[valStr] && fullGroupData[valStr].transformGroupData) {
        tData = fullGroupData[valStr].transformGroupData
    }

    let markers = Object.keys(tData)
    
    // auto-generates a default first index element for newly created objects
    if (markers.length === 0) {
        const baseStart = targetNode.getAttr('transformGroupData')?.[valStr]?.interval?.start ?? (currentObj ? currentObj.startTime : 0)
        const sTime = Number((parseFloat(baseStart) + 0.05).toFixed(3))
        const eTime = Number((sTime + 0.15).toFixed(3))
        tData = { "0": { transform_interval: { start: sTime, end: eTime } } }
        markers = Object.keys(tData)
    }
    
    markers.forEach((markerKey, i) => {
        let markerConfig = tData[markerKey]
        
        // generates randomized structural ids for transform mapping
        const generateSplitId = () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
            let result = ''
            for (let i = 0; i < 8; i++) {
                result += chars[Math.floor(Math.random() * chars.length)]
            }
            return result
        }

        // ensures transform ids exist for the selected transform row
        if (!markerConfig.set_id) {
            let setId = `set_${generateSplitId()}`
            let styleId = `style_${generateSplitId()}`

            while (setId === styleId) {
                styleId = `style_${generateSplitId()}`
            }

            markerConfig.set_id = setId
            markerConfig.style_id = styleId
        } else if (!markerConfig.style_id) {
            let styleId = `style_${generateSplitId()}`

            while (markerConfig.set_id === styleId) {
                styleId = `style_${generateSplitId()}`
            }

            markerConfig.style_id = styleId
        }
        
        const setId = markerConfig.set_id
        const styleId = markerConfig.style_id

        // Initialize simplified root coords tracking array if not present
        if (!targetObjData.coords) {
            targetObjData.coords = []
        }

        // Push unique index integers into root coordinate tracking array loop sequence based on layout position
        const numericIdx = i + 1
        if (!targetObjData.coords.includes(numericIdx)) {
            targetObjData.coords.push(numericIdx)
        }
            
        // Rebuilds transform coordinate mapping with embedded temporal interval blocks
        if (!transformCoordsDict[numericIdx]) {
            transformCoordsDict[numericIdx] = {}
        }

        if (isBlockOn) {
            const blockTarget = markerConfig.Blocking || objConfig.Blocking
            transformCoordsDict[numericIdx][setId] = encodeData(blockTarget)
        }

        if (isStyleOn) {
            const styleTarget = markerConfig.Styling || objConfig.Styling
            transformCoordsDict[numericIdx][styleId] = encodeData(styleTarget)
        }

        // Embed interval coordinates directly to index payload layout
        transformCoordsDict[numericIdx].transform_interval = markerConfig.transform_interval || markerConfig.interval || { start: 0.05, end: 0.25 }
    })

    // Remove legacy objTransformations structural object instantiation block entirely
    if (targetObjData.objTransformations) {
        delete targetObjData.objTransformations
    }
    
    // builds clean isolated dictionary map matching your structural blueprint requirement
    const finalConfig = {
        [tGroupName]: {
            objCnt: totalObjectsInGroup,
            [objId]: targetObjData,
            transform_coords: {
                [objId]: transformCoordsDict
            }
        }
    }
    
    // integrates inline JSON syntax highlighting using regex capture groups
    let jsonStr = JSON.stringify(finalConfig, null, 2)
        .replace(/"coords":\s*\[\s*([\s\S]*?)\s*\]/g, (match, inner) => {
            return '"coords": [' + inner.replace(/\s+/g, '').replace(/,/g, ', ') + ']';
        })
        .replace(/"(.*?)":/g, '<span style="color:#00a8ff;">"$1"</span>:')
        .replace(/(: )"(.*?)"/g, '$1<span style="color:#f1c40f;">"$2"</span>')
        .replace(/(: )([0-9.\\-]+)/g, '$1<span style="color:#2ecc71;">$2</span>')
        .replace(/(: )(true|false)/g, '$1<span style="color:#e74c3c;">$2</span>')
        .replace(/(: )(null)/g, '$1<span style="color:#e74c3c;">$2</span>')
        
    // highlights the inline array numbers that missed the colon-space regex
    jsonStr = jsonStr.replace(/"coords": \[(.*?)\]/g, (match, inner) => {
        return '"coords": [' + inner.replace(/([0-9]+)/g, '<span style="color:#2ecc71;">$1</span>') + ']';
    })
        
    // strictly validates string delta to prevent excessive dom restamps during requestAnimationFrame loop
    if (configDisplay.innerHTML !== jsonStr) {
        configDisplay.innerHTML = jsonStr
    }
}

// extracts current node attributes into structured json payload
export const buildTransformConfig = (node) => {
    if (!node) return null
    
    let currentObj = null
    if (typeof appLayers !== 'undefined') {
        appLayers.forEach(l => {
            if (l.objects) {
                l.objects.forEach(o => {
                    if (o.node === node) currentObj = o
                })
            }
        })
    }

    let objType = node.getClassName()
    const nodeName = node.name() || ''
    
    if (nodeName.startsWith('Text_')) objType = 'Text'
    else if (nodeName.startsWith('Image_')) objType = 'Image'
    else if (nodeName.startsWith('Shape_')) objType = 'Shape'
    else if (nodeName.startsWith('Filter_')) objType = 'Filter'
    else if (nodeName.startsWith('Target_')) objType = 'Tracking Target'
    else if (currentObj && currentObj.type) {
        objType = currentObj.type.charAt(0).toUpperCase() + currentObj.type.slice(1)
    } else if (objType === 'Group' && typeof node.findOne === 'function') {
        if (node.findOne('.inner-text')) objType = 'Text'
        else if (node.findOne('Image')) objType = 'Image'
        else objType = 'Shape'
    }
    
    let config = {}
    
    // generates alphanumeric identifier string
    const generateAlphanumeric = (length) => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        let res = ''
        for (let i = 0; i < length; i++) res += chars[Math.floor(Math.random() * chars.length)]
        return res
    }

    const safeType = objType.toLowerCase().replace(/\s+/g, '-')
    let rawId = currentObj && currentObj.id ? currentObj.id : (node.id() || nodeName)
    
    // enforces exact object type prefix on JSON identifier string
    if (!rawId || !rawId.startsWith(safeType + '_')) {
        const uniquePart = rawId && rawId.includes('_') ? rawId.split('_')[1] : generateAlphanumeric(9)
        rawId = safeType + '_' + uniquePart
        node.id(rawId)
        if (currentObj) currentObj.id = rawId
    }
    
    config.id = rawId
    config.type = objType
    
    config.Blocking = {
        x: Math.round(node.x()),
        y: Math.round(node.y()),
        width: Math.round(node.width()),
        height: Math.round(node.height()),
        scaleX: Number(node.scaleX().toFixed(2)),
        scaleY: Number(node.scaleY().toFixed(2)),
        rotation: Math.round(node.rotation()),
        offsetX: Math.round(node.offsetX()),
        offsetY: Math.round(node.offsetY()),
        flipH: node.scaleX() < 0,
        flipV: node.scaleY() < 0
    }
    
    // elevates interval block to sit at root level of the generated transform dictionary and applies default 50ms offsets
    if (currentObj && currentObj.startTime !== undefined) {
        let sTime = Number(currentObj.startTime) + 0.05
        let eTime = Number(currentObj.endTime) - 0.05
        if (sTime >= eTime) {
            sTime = Number(currentObj.startTime)
            eTime = Number(currentObj.endTime)
        }
        config.interval = {
            start: Number(sTime.toFixed(3)),
            end: Number(eTime.toFixed(3))
        }
    }
    
    const isGroup = node.getClassName() === 'Group'
    const innerText = typeof node.findOne === 'function' ? node.findOne('.inner-text') : null
    
    config.Styling = {
        opacity: Number(node.opacity().toFixed(2))
    }
    
    if (innerText) {
        config.Styling.Text = {
            fontFamily: innerText.fontFamily(),
            fontSize: innerText.fontSize(),
            fontStyle: innerText.fontStyle(),
            align: innerText.align(),
            fill: innerText.fill(),
            stroke: innerText.stroke() !== 'transparent' ? innerText.stroke() : null,
            strokeWidth: innerText.strokeWidth()
        }
    } else if (!isGroup && node.getClassName() !== 'Image' && node.getClassName() !== 'Layer') {
        config.Styling.Shape = {
            shapeType: node.getAttr('shapeClassType') || 'Rectangle',
            fill: node.fill && typeof node.fill === 'function' ? node.fill() : null
        }
    }
    
    if (!innerText) {
        const strokeColor = node.stroke && typeof node.stroke === 'function' ? node.stroke() : null
        if (strokeColor && strokeColor !== 'transparent') {
            config.Styling.Border = {
                color: strokeColor,
                thickness: node.strokeWidth ? node.strokeWidth() : 0,
                dash: node.dash ? node.dash() : null,
                top: node.getAttr('strokeTop') ?? true,
                right: node.getAttr('strokeRight') ?? true,
                bottom: node.getAttr('strokeBottom') ?? true,
                left: node.getAttr('strokeLeft') ?? true
            }
        } else {
            config.Styling.Border = null
        }
    }
    
    // evaluates inner text or node for shadow properties and assigns directly to styling dictionary
    const shadowTarget = innerText || node
    if (shadowTarget && shadowTarget.shadowOpacity && shadowTarget.shadowOpacity() > 0) {
        config.Styling.Shadow = {
            color: shadowTarget.shadowColor(),
            blur: shadowTarget.shadowBlur(),
            offsetX: Math.round(shadowTarget.shadowOffsetX()),
            offsetY: Math.round(shadowTarget.shadowOffsetY()),
            opacity: Number(shadowTarget.shadowOpacity().toFixed(2))
        }
    } else {
        config.Styling.Shadow = null
    }
    
    return config
}

// initializes transforms panel state and applies configuration dictionary
export function initTransformsPanel(node) {
    const panel = document.getElementById('transforms-timeline-panel')
    const initState = document.getElementById('transform-groups-init-state')
    const modeSelect = document.getElementById('transform-mode-select')
    const startBtn = document.getElementById('start-transform-btn')
    const listContainer = document.getElementById('transforms-list-container')
    const rowsContainer = document.getElementById('transforms-rows')
    const activeHeader = document.getElementById('active-transform-group-header')
    const nameDisplay = document.getElementById('transform-group-name-display')
    const cancelBtn = document.getElementById('cancel-transform-group-btn')
    const addTransformBtn = document.getElementById('add-transform-row-btn')
    
    if (!panel || !initState) return

    panel.style.display = 'none'
    initState.style.display = 'flex'
    listContainer.style.display = 'none'
    if (activeHeader) activeHeader.style.display = 'none'
    if (modeSelect) modeSelect.value = 'create'
    if (rowsContainer) rowsContainer.innerHTML = ''

    const updateTransformName = (groupId) => {
        if (nameDisplay) {
            nameDisplay.innerText = groupId
            nameDisplay.style.flex = '1'
            nameDisplay.style.display = 'block'
            nameDisplay.style.whiteSpace = 'nowrap'
            nameDisplay.style.overflow = 'hidden'
            nameDisplay.style.textOverflow = 'clip'
            nameDisplay.style.minWidth = '0'
            
            window.marqueeObserver.observe(nameDisplay)
            
            // Forces manual marquee evaluation because the text change doesn't alter the fixed flex-container width
            setTimeout(() => window.applyMarquee(nameDisplay), 50)
        }
    }

    const editObjNameInput = document.getElementById('edit-object-name')
    if (window._transformSyncListener && editObjNameInput) {
        editObjNameInput.removeEventListener('input', window._transformSyncListener)
    }
    
    if (editObjNameInput) {
        window._transformSyncListener = (e) => {
            const val = e.target.value
            if (typeof activeNode === 'undefined' || !activeNode || !activeNode.getAttr('transformGroupName')) return
            
            const rowsContainer = document.getElementById('transforms-rows')
            if (rowsContainer) {
                const idx = activeNode.getAttr('activeTransformEditIndex')
                if (idx !== undefined && idx !== null && rowsContainer.children.length > idx) {
                    const targetRow = rowsContainer.children[idx]
                    const rowInput = targetRow.querySelector('.panel-input input[type="text"]') || targetRow.querySelector('input[type="text"]')
                    if (rowInput && rowInput.value !== val) {
                        rowInput.value = val
                        rowInput.dispatchEvent(new Event('input'))
                    }
                }
            }
        }
        editObjNameInput.addEventListener('input', window._transformSyncListener)
    }

    const syncTransformsFromDOM = () => {
        if (typeof activeNode === 'undefined' || !activeNode) return
        const rows = Array.from(rowsContainer.children)
        const newData = {}
        let hasItems = false
        
        rows.forEach((r, index) => {
            // dynamically re-indexes row IDs so if a row is removed, the subsequent rows shift up perfectly
            const panelBlock = r.querySelector('.transform-row-container') || r.querySelector('.panel-input')
            if (panelBlock) panelBlock.id = 'transform-row-' + (index + 1)

            const inp = r.querySelector('.transform-row-container input[type="text"]') || r.querySelector('.panel-input input[type="text"]')
            if (inp && r.dataset.transformConfig) {
                const newKey = inp.value || r.dataset.transformKey
                newData[newKey] = JSON.parse(r.dataset.transformConfig)
                r.dataset.transformKey = newKey
                hasItems = true
            }
        })
        
        const tGroup = activeNode.getAttr('transformGroupName')
        if (hasItems) {
            activeNode.setAttr('transformGroupData', newData)
            if (tGroup && typeof appLayers !== 'undefined') {
                appLayers.forEach(l => {
                    if (l.objects) {
                        l.objects.forEach(o => {
                            if (o.node && o.node.getAttr('transformGroupName') === tGroup) {
                                o.node.setAttr('transformGroupData', newData)
                            }
                        })
                    }
                })
            }
        } else {
            activeNode.setAttr('transformGroupName', null)
            activeNode.setAttr('transformGroupData', null)
            if (tGroup && typeof appLayers !== 'undefined') {
                appLayers.forEach(l => {
                    if (l.objects) {
                        l.objects.forEach(o => {
                            if (o.node && o.node.getAttr('transformGroupName') === tGroup) {
                                o.node.setAttr('transformGroupName', null)
                                o.node.setAttr('transformGroupData', null)
                            }
                        })
                    }
                })
            }
            if (cancelBtn) cancelBtn.click()
        }
        if (window.updateAdvancedConfigDisplay) window.updateAdvancedConfigDisplay()
    }

    if (rowsContainer && !rowsContainer._dragBound) {
        rowsContainer._dragBound = true
        
        // strictly implements robust y-axis positional checks for dynamic row arrangement with safe dom limits
        rowsContainer.addEventListener('dragover', (e) => {
            e.preventDefault()
            e.stopPropagation()
            const draggingRow = rowsContainer.querySelector('.dragging-row')
            if (!draggingRow) return
            
            const siblings = [...rowsContainer.querySelectorAll('.transforms-list-item:not(.dragging-row)')]
            const nextSibling = siblings.find(sibling => {
                const box = sibling.getBoundingClientRect()
                return e.clientY <= box.top + box.height / 2
            })
            
            if (nextSibling && nextSibling.parentNode === rowsContainer) {
                rowsContainer.insertBefore(draggingRow, nextSibling)
            } else if (!nextSibling) {
                rowsContainer.appendChild(draggingRow)
            }
        })
        
        // catches drop events to fire sync functions matching timeline structure
        rowsContainer.addEventListener('drop', (e) => {
            e.preventDefault()
            syncTransformsFromDOM()
        })
    }

    const createTransformRow = (transformKey, configData, rowIdx) => {
        if (!configData.markerColor) {
            // Re-indexes hue math so first element strictly generates as standard blue (approx 210 hue)
            const baseHue = 210
            const hue = Math.round((baseHue + ((rowIdx - 1) * 137.5)) % 360)
            configData.markerColor = `hsl(${hue}, 100%, 50%)`
        }
        
        // applies default interval 50ms offsets inside active object boundaries
        if (!configData.interval) {
            let sTime = 0, eTime = 5
            if (typeof activeNode !== 'undefined' && activeNode) {
                let trackObj = null
                if (typeof appLayers !== 'undefined') {
                    appLayers.forEach(l => {
                        if (l.objects) {
                            const found = l.objects.find(o => o.node === activeNode)
                            if (found) trackObj = found
                        }
                    })
                }
                if (trackObj) {
                    sTime = Number(trackObj.startTime || 0) + 0.05
                    eTime = Number(trackObj.endTime || 5) - 0.05
                    if (sTime >= eTime) {
                        sTime = Number(trackObj.startTime || 0)
                        eTime = Number(trackObj.endTime || 5)
                    }
                }
            }
            configData.interval = { start: Number(sTime.toFixed(3)), end: Number(eTime.toFixed(3)) }
        }

        const row = document.createElement('div')
        row.className = 'transforms-list-item'
        row.style.cssText = 'display:flex; flex-direction:column; border-left:2px solid transparent; padding-left:8px; margin-left:-10px; transition:border-color 0.2s; margin-bottom:5px; cursor:pointer;'
        row.dataset.transformKey = transformKey
        row.dataset.transformConfig = JSON.stringify(configData)
        
        // applies stored transform configuration to active node, highlights row, and jumps timeline to start phase
        row.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.tagName === 'INPUT' || e.target.closest('.transform-interval-timing')) return
            
            window._preventMatrixReset = true
            
            // cache both the inner grid matrix and parent panel sidebar scroll heights
            const innerGrid = row.querySelector('.transformations-matrix')
            const cachedOffset = innerGrid ? innerGrid.scrollTop : 0
            
            const layersTab = document.getElementById('layers-tab')
            const cachedParentScroll = layersTab ? layersTab.scrollTop : 0
            
            const rowsContainer = document.getElementById('transforms-rows')
            if (rowsContainer) {
                Array.from(rowsContainer.children).forEach(r => {
                    r.style.borderLeftColor = 'transparent'
                    if (typeof r.renderMatrixGrid === 'function') r.renderMatrixGrid()
                })
            }
            row.style.borderLeftColor = '#00a8ff'
            
            renderMatrixGrid()
            
            const targetId = configData.id
            let targetNode = null
            if (typeof appLayers !== 'undefined') {
                appLayers.forEach(l => {
                    if (l.objects) {
                        l.objects.forEach(o => {
                            if (o.id === targetId || (o.node && o.node.id() === targetId) || (o.node && o.node.name() === transformKey)) {
                                targetNode = o.node
                            }
                        })
                    }
                })
            }
            
            if (targetNode) {
                if (targetNode !== activeNode && typeof setActiveNode === 'function') setActiveNode(targetNode)
                if (typeof transformer !== 'undefined') transformer.nodes([targetNode])
                
                if (rowsContainer) {
                    targetNode.setAttr('activeTransformEditIndex', Array.from(rowsContainer.children).indexOf(row))
                }
                
                if (typeof renderLayersUI === 'function') renderLayersUI()
                
                // Immediately applies the physical styles to the text object before opening the editor if it's a Captions Group
                if (targetNode.getAttr('captionsGroupName')) {
                    const activeIdx = targetNode.getAttr('activeCaptionEditIndex') || 0
                    const styles = targetNode.getAttr('captionStyles') || []
                    if (styles.length > activeIdx) {
                        const st = styles[activeIdx]
                        const tText = targetNode.findOne('.inner-text') || targetNode
                        const tBg = targetNode.findOne('.text-bg')
                        if (st.text && tText) tText.setAttrs(st.text)
                        if (st.bg && tBg) tBg.setAttrs(st.bg)
                        if (st.group) targetNode.setAttrs(st.group)
                    }
                }

                const nClass = targetNode.getClassName()
                const innerText = typeof targetNode.findOne === 'function' ? targetNode.findOne('.inner-text') : null
                
                if ((nClass === 'Group' && innerText) || nClass === 'Text') {
                    openTextEditor(targetNode)
                } else if (nClass === 'Filter') {
                    openFilterEditor(targetNode)
                } else {
                    openImageEditor(targetNode)
                }
                
                const editObjName = document.getElementById('edit-object-name')
                const textInput = row.querySelector('.transform-row-container input[type="text"]') || row.querySelector('.panel-input input[type="text"]')
                if (editObjName && textInput) {
                    if (targetNode.getAttr('captionsGroupName')) {
                        const capList = targetNode.getAttr('captionsList') || []
                        const activeIdx = targetNode.getAttr('activeCaptionEditIndex') || 0
                        editObjName.value = capList.length > activeIdx ? capList[activeIdx] : textInput.value
                    } else {
                        editObjName.value = textInput.value
                    }
                }
            }
            
            // rigidly restore parent viewport and local grid coordinates post-rebuild
            if (layersTab) layersTab.scrollTop = cachedParentScroll
            const freshGrid = row.querySelector('.transformations-matrix')
            if (freshGrid) freshGrid.scrollTop = cachedOffset
            
            if (window.updateAdvancedConfigDisplay) window.updateAdvancedConfigDisplay()
            window._preventMatrixReset = false
        })    
        
        // applies stored transform configuration to active node, highlights row, and jumps timeline to start phase
        row.addEventListener('dblclick', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.tagName === 'INPUT' || e.target.closest('.transform-interval-timing')) return
            
            const rowsContainer = document.getElementById('transforms-rows')
            if (rowsContainer) {
                Array.from(rowsContainer.children).forEach(r => {
                    r.style.borderLeftColor = 'transparent'
                    if (typeof r.renderMatrixGrid === 'function') r.renderMatrixGrid()
                })
            }
            row.style.borderLeftColor = '#00a8ff'
            
            const targetId = configData.id
            let targetNode = null
            if (typeof appLayers !== 'undefined') {
                appLayers.forEach(l => {
                    if (l.objects) {
                        l.objects.forEach(o => {
                            if (o.id === targetId || (o.node && o.node.id() === targetId) || (o.node && o.node.name() === transformKey)) {
                                targetNode = o.node
                            }
                        })
                    }
                })
            }
            
            if (targetNode) {
                // Automatically jumps the video to the specific transform's marker time for previewing
                const video = document.getElementById('main-video')
                if (video) {
                    if (configData.interval && configData.interval.start !== undefined) {
                        video.currentTime = configData.interval.start
                        const scrubber = document.getElementById('timeline-scrubber')
                        const progress = document.getElementById('scrubber-progress')
                        if (scrubber && progress && video.duration) {
                            scrubber.value = configData.interval.start
                            progress.style.width = (configData.interval.start / video.duration) * 100 + '%'
                        }
                    }
                }

                targetNode.x(configData.Blocking.x)
                targetNode.y(configData.Blocking.y)
                targetNode.width(configData.Blocking.width)
                targetNode.height(configData.Blocking.height)
                targetNode.scaleX(configData.Blocking.scaleX)
                targetNode.scaleY(configData.Blocking.scaleY)
                targetNode.rotation(configData.Blocking.rotation)
                targetNode.offsetX(configData.Blocking.offsetX)
                targetNode.offsetY(configData.Blocking.offsetY)
                targetNode.opacity(configData.Styling.opacity)
                
                const innerText = typeof targetNode.findOne === 'function' ? targetNode.findOne('.inner-text') : null
                if (innerText && configData.Styling.Text) {
                    innerText.fontFamily(configData.Styling.Text.fontFamily)
                    innerText.fontSize(configData.Styling.Text.fontSize)
                    innerText.fontStyle(configData.Styling.Text.fontStyle)
                    innerText.align(configData.Styling.Text.align)
                    innerText.fill(configData.Styling.Text.fill)
                    innerText.stroke(configData.Styling.Text.stroke || 'transparent')
                    innerText.strokeWidth(configData.Styling.Text.strokeWidth || 0)
                }
                
                if (targetNode !== activeNode && typeof setActiveNode === 'function') setActiveNode(targetNode)
                if (typeof transformer !== 'undefined') transformer.nodes([targetNode])
                
                if (rowsContainer) {
                    targetNode.setAttr('activeTransformEditIndex', Array.from(rowsContainer.children).indexOf(row))
                }
                
                if (typeof switchTab === 'function') switchTab('layers-tab')
                if (typeof renderLayersUI === 'function') renderLayersUI()
                
                // Immediately applies the physical styles to the text object before opening the editor if it's a Captions Group
                if (targetNode.getAttr('captionsGroupName')) {
                    const activeIdx = targetNode.getAttr('activeCaptionEditIndex') || 0
                    const styles = targetNode.getAttr('captionStyles') || []
                    if (styles.length > activeIdx) {
                        const st = styles[activeIdx]
                        const tText = targetNode.findOne('.inner-text') || targetNode
                        const tBg = targetNode.findOne('.text-bg')
                        if (st.text && tText) tText.setAttrs(st.text)
                        if (st.bg && tBg) tBg.setAttrs(st.bg)
                        if (st.group) targetNode.setAttrs(st.group)
                    }
                }

                const nClass = targetNode.getClassName()
                if ((nClass === 'Group' && innerText) || nClass === 'Text') {
                    openTextEditor(targetNode)
                } else if (nClass === 'Filter') {
                    openFilterEditor(targetNode)
                } else {
                    openImageEditor(targetNode)
                }
                
                if (window.updateAdvancedConfigDisplay) window.updateAdvancedConfigDisplay()

                const editObjName = document.getElementById('edit-object-name')
                if (editObjName) {
                    const textInput = row.querySelector('.transform-row-container input[type="text"]') || row.querySelector('.panel-input input[type="text"]')
                    if (textInput) {
                        if (targetNode.getAttr('captionsGroupName')) {
                            const capList = targetNode.getAttr('captionsList') || []
                            const activeIdx = targetNode.getAttr('activeCaptionEditIndex') || 0
                            editObjName.value = capList.length > activeIdx ? capList[activeIdx] : textInput.value
                        } else {
                            editObjName.value = textInput.value
                        }
                        
                        setTimeout(() => {
                            editObjName.focus()
                            editObjName.select()
                            
                            const tabContent = document.getElementById('layers-tab')
                            if (tabContent) {
                                tabContent.scrollTop = editObjName.offsetTop > 20 ? editObjName.offsetTop - 20 : 0
                            }
                        }, 10)
                    }
                }
            }
        })
        
        const textBlock = document.createElement('div')
        textBlock.id = 'transform-row-' + rowIdx
        textBlock.className = 'transform-row-container'
        textBlock.style.cssText = 'margin-bottom:0; flex:1; min-width:0; width:0; height:32px; box-sizing:border-box; display:flex; align-items:center; justify-content:space-between; padding-right:4px;'
        
        const textInput = document.createElement('input')
        textInput.type = 'text'
        textInput.style.cssText = 'background:transparent; border:none; outline:none; color:inherit; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0; font-size:inherit; font-family:inherit;'
        textInput.value = transformKey
        
        let previousValue = transformKey
        textInput.addEventListener('input', () => syncTransformsFromDOM())
        textInput.addEventListener('focus', () => {
            textInput.getAnimations().forEach(a => a.cancel())
            textInput.style.textIndent = '0px'
            textInput.style.textOverflow = 'clip'
        })
        textInput.addEventListener('blur', () => {
            if (textInput.value.trim() === '') textInput.value = previousValue
            else previousValue = textInput.value
            syncTransformsFromDOM()
            window.applyMarquee(textInput)
        })
        textInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); textInput.blur() } })
        
        window.marqueeObserver.observe(textInput)
        setTimeout(() => window.applyMarquee(textInput), 50)
        
        const timeBtn = document.createElement('button')
        timeBtn.id = 'set-transform-interval-btn'
        timeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l2 2"></path><path d="M12 2v2"></path><path d="M10 2h4"></path></svg>'
        timeBtn.title = 'Toggle Interval Timing'
        // strips asymmetric margins to allow native flex alignment
        timeBtn.style.cssText = 'background:transparent; border:none; color:#aaa; cursor:pointer; width:20px; height:20px; display:flex; align-items:center; justify-content:center; opacity:0.6; padding:0; margin:0;'
        timeBtn.onmouseover = () => timeBtn.style.opacity = '1'
        timeBtn.onmouseout = () => timeBtn.style.opacity = '0.6'

        const clearBtn = document.createElement('button')
        clearBtn.id = 'remove-row-btn'
        clearBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>'
        clearBtn.title = 'Remove Transform'
        // matches styling properties to the interval button for uniform height and bounding box geometry
        clearBtn.style.cssText = 'background:transparent; border:none; color:#aaa; cursor:pointer; width:20px; height:20px; display:flex; align-items:center; justify-content:center; opacity:0.6; padding:0; margin:0;'
        clearBtn.onmouseover = () => clearBtn.style.opacity = '1'
        clearBtn.onmouseout = () => clearBtn.style.opacity = '0.6'
        clearBtn.onclick = (e) => {
            e.preventDefault()
            e.stopPropagation()
            
            const siblingRow = row.nextElementSibling || row.previousElementSibling
            const fallbackGrid = siblingRow ? siblingRow.querySelector('.transformations-matrix') : null
            const cachedOffset = fallbackGrid ? fallbackGrid.scrollTop : 0

            const rowConfigStr = row.dataset.transformConfig
            let targetId = null
            try { targetId = JSON.parse(rowConfigStr).id } catch(err){}
            
            const isActiveRow = row.style.borderLeftColor === 'rgb(0, 168, 255)' || row.style.borderLeftColor === '#00a8ff'
            
            if (targetId) {
                let currentObjLayer = null
                let currentObj = null
                if (typeof appLayers !== 'undefined') {
                    appLayers.forEach(layer => {
                        if(layer.objects) {
                            layer.objects.forEach(obj => {
                                if (obj.id === targetId || (obj.node && obj.node.id() === targetId)) {
                                    currentObj = obj
                                    currentObjLayer = layer
                                }
                            })
                        }
                    })
                }
                
                if (currentObj && currentObjLayer) {
                    // Manually deletes object to bypass aggressive canvas-engine removeObject side-effects (like layer deletion & panel closing)
                    const objIdx = currentObjLayer.objects.findIndex(o => o.id === currentObj.id)
                    if (objIdx > -1) {
                        if (currentObj.node) {
                            // purges object from sibling transform dictionaries to prevent ghost rows
                            const tGroup = currentObj.node.getAttr('transformGroupName')
                            if (tGroup && typeof appLayers !== 'undefined') {
                                appLayers.forEach(l => {
                                    if (l.objects) {
                                        l.objects.forEach(sibling => {
                                            if (sibling.node && sibling.node !== currentObj.node && sibling.node.getAttr('transformGroupName') === tGroup) {
                                                let tData = sibling.node.getAttr('transformGroupData')
                                                if (tData) {
                                                    const nodeKey = Object.keys(tData).find(k => tData[k].id === currentObj.node.id()) || currentObj.node.name()
                                                    if (tData[nodeKey]) {
                                                        delete tData[nodeKey]
                                                        sibling.node.setAttr('transformGroupData', tData)
                                                    }
                                                }
                                            }
                                        })
                                    }
                                })
                            }
                            
                            if (isActiveRow || currentObj.node === activeNode) {
                                let nextActiveNode = null
                                appLayers.forEach(l => {
                                    if (l.objects) {
                                        l.objects.forEach(s => {
                                            if (s.node && s.node !== currentObj.node && s.node.getAttr('transformGroupName') === tGroup) {
                                                nextActiveNode = s.node
                                            }
                                        })
                                    }
                                })
                                if (nextActiveNode && typeof setActiveNode === 'function') {
                                    setActiveNode(nextActiveNode)
                                }
                            }
                            
                            currentObj.node.destroy()
                        }
                        currentObjLayer.objects.splice(objIdx, 1)
                        if (currentObjLayer.konvaLayer) currentObjLayer.konvaLayer.batchDraw()
                    }
                }
            }
            
            row.remove()
            syncTransformsFromDOM()
            
            // Shifts focus to the first remaining sibling row instantly to preserve the properties container UI
            if (isActiveRow) {
                const rowsContainer = document.getElementById('transforms-rows')
                if (rowsContainer && rowsContainer.children.length > 0) {
                    rowsContainer.children[0].click()
                } else {
                    if (typeof renderLayersUI === 'function') renderLayersUI()
                    if (typeof renderMultiTrackTimeline === 'function') renderMultiTrackTimeline()
                }
            } else {
                if (typeof renderLayersUI === 'function') renderLayersUI()
                if (typeof renderMultiTrackTimeline === 'function') renderMultiTrackTimeline()
            }
            
            if (siblingRow) {
                const postRenderGrid = siblingRow.querySelector('.transformations-matrix')
                if (postRenderGrid) postRenderGrid.scrollTop = cachedOffset
            }
        }
        
        // binds both action buttons into a dedicated flex wrapper and narrows the gap to bring them slightly closer together
        const btnGroup = document.createElement('div')
        btnGroup.style.cssText = 'display:flex; flex-direction:row; align-items:center; justify-content:center; gap:2px; height:100%; margin-right:2px;'
        btnGroup.appendChild(timeBtn)
        btnGroup.appendChild(clearBtn)
        
        textBlock.appendChild(textInput)
        textBlock.appendChild(btnGroup)
        
        const handle = document.createElement('div')
        handle.className = 'drag-handle'
        handle.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>'
        handle.style.cssText = 'cursor:grab; width:24px; display:flex; align-items:center; justify-content:center; margin:0; opacity:0.5;'
        
        handle.onmousedown = () => row.draggable = true
        handle.onmouseup = () => row.draggable = false
        row.onmouseup = () => row.draggable = false
        
        const colorDot = document.createElement('div')
        colorDot.style.cssText = `width:10px; height:10px; border-radius:50%; background-color:${configData.markerColor}; flex-shrink:0;`
        
        const rowTop = document.createElement('div')
        rowTop.style.cssText = 'display:flex; gap:12px; align-items:center; width:100%;'
        rowTop.appendChild(colorDot)
        rowTop.appendChild(textBlock)
        rowTop.appendChild(handle)

        const isTimingOpen = configData.isTimingOpen === true
        if (isTimingOpen) {
            timeBtn.style.color = configData.markerColor
            timeBtn.style.opacity = '1'
        }

        const timingDiv = document.createElement('div')
        timingDiv.className = 'transform-interval-timing'
        // removes restrictive right padding so we can rigidly control the right alignment using the wrap
        timingDiv.style.cssText = `display:${isTimingOpen ? 'flex' : 'none'}; flex-direction:column; gap:8px; padding:6px 0 4px 0; align-items:flex-end; justify-content:center; width:100%; box-sizing:border-box;`

        // container for the dynamic configurations matrix tracking layout changes
        const matrixDiv = document.createElement('div')
        matrixDiv.className = 'transform-elements-container'
        // acts as a static outer wrapper for the scrolling grid and absolute action buttons
        matrixDiv.style.cssText = `display:${isTimingOpen ? 'block' : 'none'}; width:100%; padding:6px 38px 4px 22px; box-sizing:border-box; position:relative;`

        // create isolated internal elements container to protect action controls from innerHTML wipes
        const elementsWrapper = document.createElement('div')
        elementsWrapper.className = 'matrix-elements-wrapper'
        matrixDiv.appendChild(elementsWrapper)

        // populates configuration buttons matching timeline state counts
        const renderMatrixGrid = () => {
            // capture existing scroll position before clearing layout to prevent jumping
            const existingGrid = elementsWrapper.querySelector('.transformations-matrix') || matrixDiv.querySelector('.transformations-matrix')
            const currentScroll = existingGrid ? existingGrid.scrollTop : 0

            elementsWrapper.innerHTML = ''
            if (!configData.interval) return
            
            // isolates the scrollable grid area so the scrollbar appears to the left of the static buttons
            const gridScrollArea = document.createElement('div')
            gridScrollArea.className = 'transformations-matrix'
            gridScrollArea.style.cssText = 'display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; width:100%; min-height:60px; max-height:124px; overflow-y:auto; overflow-x:hidden; padding-right:8px; box-sizing:border-box; align-content:start;'
            
            // capture matrix click events to freeze current scroll offset
            gridScrollArea.addEventListener('scroll', () => {
                gridScrollArea.dataset.lastScrollTop = gridScrollArea.scrollTop
            })
            
            // tightly couples the matrix data to the row's configData to prevent sync overwrites
            if (!configData.transformGroupData) {
                let defaultStart = configData.interval && configData.interval.start !== undefined ? Number((parseFloat(configData.interval.start) + 0.05).toFixed(3)) : 0.05
                let defaultEnd = Number((defaultStart + 0.15).toFixed(3))
                configData.transformGroupData = { 0: { transform_interval: { start: defaultStart, end: defaultEnd } } }
            } else if (configData.transformGroupData[0] && !configData.transformGroupData[0].transform_interval) {
                let defaultStart = configData.interval && configData.interval.start !== undefined ? Number((parseFloat(configData.interval.start) + 0.05).toFixed(3)) : 0.05
                let defaultEnd = Number((defaultStart + 0.15).toFixed(3))
                configData.transformGroupData[0].transform_interval = { start: defaultStart, end: defaultEnd }
            }
            let totalMarkers = Object.keys(configData.transformGroupData).length
            if (totalMarkers > 64) totalMarkers = 64 // caps element rendering at absolute maximum of 64 objects
            
            for (let i = 0; i < totalMarkers; i++) { 
                const matrixBtn = document.createElement('button')
                const displayIdx = i + 1
                matrixBtn.className = `transform-element-${displayIdx}`
                const isRowActive = row.style.borderLeftColor === 'rgb(0, 168, 255)' || row.style.borderLeftColor === '#00a8ff'
                const isActiveMarker = isRowActive && (configData.activeTransformEditIndex === i)
                
                // renders incrementing index numbers aligned centrally and dynamically spans columns with 100% width of grid cell
                matrixBtn.innerText = displayIdx
                matrixBtn.style.cssText = `position:relative; width:100%; height:24px; background:#1a252f; border:1px solid #34495e; border-radius:2px; cursor:pointer; padding:0; box-sizing:border-box; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:12px; color:${isActiveMarker ? '#f1c40f' : '#aaa'}; transition:color 0.2s;`
                
                matrixBtn.onclick = (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    
                    const priorScroll = gridScrollArea.scrollTop
                    const layersTab = document.getElementById('layers-tab')
                    const cachedParentScroll = layersTab ? layersTab.scrollTop : 0

                    configData.activeTransformEditIndex = i
                    const tRow = matrixDiv.closest('.transforms-list-item')
                    if (tRow) {
                        tRow.dataset.transformConfig = JSON.stringify(configData)
                        
                        if (typeof syncTransformsFromDOM === 'function') {
                            syncTransformsFromDOM()
                        }
                        
                        const timingDiv = tRow.querySelector('.transform-interval-timing')
                        if (timingDiv) {
                            const activeTConfig = configData.transformGroupData[i] || {}
                            const fallbackStart = configData.interval && configData.interval.start !== undefined ? Number((parseFloat(configData.interval.start) + 0.05).toFixed(3)) : 0.05
                            const fallbackEnd = Number((fallbackStart + 0.15).toFixed(3))
                            const tInterval = activeTConfig.transform_interval || { start: fallbackStart, end: fallbackEnd }
                            
                            const sGroup = timingDiv.querySelector('[data-target="start"]')
                            const eGroup = timingDiv.querySelector('[data-target="end"]')
                            if (sGroup) {
                                const p = getTimeParts(parseFloat(tInterval.start) || 0)
                                sGroup.querySelector('[data-type="h"]').innerText = p.h
                                sGroup.querySelector('[data-type="m"]').innerText = p.m
                                sGroup.querySelector('[data-type="s"]').innerText = p.s
                                sGroup.querySelector('[data-type="ms"]').innerText = p.ms
                            }
                            if (eGroup) {
                                const p = getTimeParts(parseFloat(tInterval.end) || 0)
                                eGroup.querySelector('[data-type="h"]').innerText = p.h
                                eGroup.querySelector('[data-type="m"]').innerText = p.m
                                eGroup.querySelector('[data-type="s"]').innerText = p.s
                                eGroup.querySelector('[data-type="ms"]').innerText = p.ms
                            }
                        }
                    }
                    renderMatrixGrid()
                    const newGrid = matrixDiv.querySelector('.transformations-matrix')
                    if (newGrid) newGrid.scrollTop = priorScroll
                    if (layersTab) layersTab.scrollTop = cachedParentScroll
                    
                    window._forceTimelineAutoSelect = true
                    
                    if (tRow) {
                        window._matrixScrollPreserve = priorScroll
                        tRow.click()
                        delete window._matrixScrollPreserve
                    }
                    if (layersTab) layersTab.scrollTop = cachedParentScroll
                }
                gridScrollArea.appendChild(matrixBtn)
            }
            
            elementsWrapper.appendChild(gridScrollArea)

            // Remove any legacy action groups inside the wiping wrapper zone
            const oldActionGroup = matrixDiv.querySelector('.matrix-action-group')
            if (oldActionGroup) oldActionGroup.remove()

            // wraps absolute action controls to natively align them underneath each other on the right edge
            const actionGroup = document.createElement('div')
            actionGroup.className = 'matrix-action-group'
            actionGroup.style.cssText = 'position:absolute; right:0px; bottom:4px; display:flex; flex-direction:column; gap:6px;'

            // appends configuration generation control matching identical row styling and right side line coordinates
            const addMatrixBtn = document.createElement('button')
            addMatrixBtn.id = 'add-transformation-btn'
            addMatrixBtn.innerText = '+'
            addMatrixBtn.title = 'Add Transform Configuration Element'
            
            // visually overrides color and pointer events if global cap of 64 is reached
            addMatrixBtn.style.cssText = `width:24px; height:24px; background:#1a252f; border:1px solid #34495e; color:${totalMarkers >= 64 ? '#555' : '#00a8ff'}; font-size:16px; font-weight:bold; cursor:${totalMarkers >= 64 ? 'not-allowed' : 'pointer'}; border-radius:2px; display:flex; align-items:center; justify-content:center; padding:0; box-sizing:border-box;`
            
            addMatrixBtn.onclick = (e) => {
                e.preventDefault()
                e.stopPropagation()
                
                // read fresh key lengths directly from the dictionary map target data to prevent layout collapse
                const activeKeys = Object.keys(configData.transformGroupData || {})
                if (activeKeys.length >= 64) return
                
                // generates randomized structural ids for transform mapping
                const generateSplitId = () => {
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
                    let result = ''
                    for (let i = 0; i < 8; i++) {
                        result += chars[Math.floor(Math.random() * chars.length)]
                    }
                    return result
                }

                // computes sequential interval timing based on the previous matrix element with a 5 millisecond gap
                let newStart = 0.05
                let newEnd = 0.25
                if (activeKeys.length > 0) {
                    const lastKey = activeKeys[activeKeys.length - 1]
                    const lastInterval = configData.transformGroupData[lastKey].transform_interval || configData.transformGroupData[lastKey].interval
                    if (lastInterval && lastInterval.end !== undefined) {
                        // explicitly parses end value to float before mathematical addition to prevent string concatenation crashes
                        const parsedEnd = parseFloat(lastInterval.end)
                        newStart = Number((parsedEnd + 0.05).toFixed(3))
                        newEnd = Number((newStart + 0.15).toFixed(3))
                    }
                } else {
                    // fallbacks to root tracking container limits if it is the first index position
                    if (configData.interval && configData.interval.start !== undefined) {
                        newStart = Number((parseFloat(configData.interval.start) + 0.05).toFixed(3))
                        newEnd = Number((newStart + 0.15).toFixed(3))
                    }
                }
                
                // dynamically appends a new unique integer index marker element layout block sequentially
                const nextIdx = activeKeys.length
                configData.transformGroupData[nextIdx] = {
                    set_id: `set_${generateSplitId()}`,
                    style_id: `style_${generateSplitId()}`,
                    transform_interval: { start: newStart, end: newEnd }
                }
                
                configData.activeTransformEditIndex = nextIdx
                
                const tRow = matrixDiv.closest('.transforms-list-item')
                if (tRow) {
                    tRow.dataset.transformConfig = JSON.stringify(configData)
                }
                
                window._forceTimelineAutoSelect = true
                
                // forces element array map interface loop rendering update cycle without jumping
                renderMatrixGrid()
                
                if (typeof syncTransformsFromDOM === 'function') {
                    syncTransformsFromDOM()
                }
                
                if (typeof renderTimelineIntervals === 'function') renderTimelineIntervals()
                if (typeof renderMultiTrackTimeline === 'function') renderMultiTrackTimeline()
                
                // forces the advanced properties terminal to scroll to the absolute bottom bounds natively
                const configDisplay = document.getElementById('advanced-config-display')
                if (configDisplay) {
                    configDisplay.scrollTop = configDisplay.scrollHeight
                }
            }
            
            // appends configuration removal control underneath add button
            const removeMatrixBtn = document.createElement('button')
            removeMatrixBtn.id = 'remove-transformation-btn'
            removeMatrixBtn.innerText = '-'
            removeMatrixBtn.title = 'Remove Selected Transform Configuration Element'
            
            // visually overrides color and pointer events if there is only 1 configuration left
            removeMatrixBtn.style.cssText = `width:24px; height:24px; background:#1a252f; border:1px solid #34495e; color:${totalMarkers <= 1 ? '#555' : '#00a8ff'}; font-size:16px; font-weight:bold; cursor:${totalMarkers <= 1 ? 'not-allowed' : 'pointer'}; border-radius:2px; display:flex; align-items:center; justify-content:center; padding:0; box-sizing:border-box;`
            
            removeMatrixBtn.onclick = (e) => {
                e.preventDefault()
                e.stopPropagation()
                
                if (totalMarkers <= 1) return // preserves at least one configuration state
                
                const activeIdx = configData.activeTransformEditIndex || 0
                const keys = Object.keys(configData.transformGroupData).sort((a,b) => Number(a) - Number(b))
                
                const newTData = {}
                let newIdx = 0
                
                // re-indexes existing configurations contiguous from 0, completely dropping the currently selected element
                for (let i = 0; i < keys.length; i++) {
                    if (Number(keys[i]) === activeIdx) continue
                    newTData[newIdx] = configData.transformGroupData[keys[i]]
                    newIdx++
                }
                
                configData.transformGroupData = newTData
                
                // shifts active selection safely to the prior element or preserves index 0
                if (activeIdx >= newIdx && newIdx > 0) {
                    configData.activeTransformEditIndex = newIdx - 1
                } else if (activeIdx >= newIdx) {
                    configData.activeTransformEditIndex = 0
                }
                
                const tRow = matrixDiv.closest('.transforms-list-item')
                if (tRow) {
                    tRow.dataset.transformConfig = JSON.stringify(configData)
                }
                
                // forces the matrix to visually refresh without jumping
                renderMatrixGrid()
                
                if (typeof syncTransformsFromDOM === 'function') {
                    syncTransformsFromDOM()
                }
                
                if (typeof renderTimelineIntervals === 'function') renderTimelineIntervals()
                if (typeof renderMultiTrackTimeline === 'function') renderMultiTrackTimeline()
            }

            actionGroup.appendChild(addMatrixBtn)
            actionGroup.appendChild(removeMatrixBtn)
            matrixDiv.appendChild(actionGroup)
            
            // rigidly restores exact previous scroll position to prevent jumping
            gridScrollArea.scrollTop = currentScroll
        }

        const createTimeGroup = (labelStr, key) => {
            const wrap = document.createElement('div')
            wrap.className = 'transform-time-group-wrap'
            // increases right padding to shift elements left and align perfectly with the transform row
            wrap.style.cssText = `display:flex; flex-direction:row; gap:6px; font-size:10px; color:${configData.markerColor}; align-items:center; width:100%; justify-content:flex-end; position:relative; box-sizing:border-box; padding-right:38px;`

            const lbl = document.createElement('span')
            lbl.innerText = labelStr
            lbl.style.cssText = 'width:30px; text-align:right;'
            
            const group = document.createElement('div')
            group.className = 'time-spinner-group'
            group.id = key === 'start' ? `start-transform-time-group-${rowIdx}` : `end-transform-time-group-${rowIdx}`
            group.dataset.target = key
            // enforces fixed width so both groups perfectly align their left edges with each other
            group.style.cssText = `display:flex; justify-content:center; width:110px; background:#1a252f; border:1px solid #34495e; color:${configData.markerColor}; font-size:11px; padding:2px 4px; border-radius:2px; align-items:center; cursor:default; user-select:none; box-sizing:border-box; position:relative;`
            
            const activeIdx = configData.activeTransformEditIndex || 0
            const activeTConfig = configData.transformGroupData && configData.transformGroupData[activeIdx] ? configData.transformGroupData[activeIdx] : {}
            const fallbackStart = configData.interval && configData.interval.start !== undefined ? Number((parseFloat(configData.interval.start) + 0.05).toFixed(3)) : 0.05
            const fallbackEnd = Number((fallbackStart + 0.15).toFixed(3))
            const tInterval = activeTConfig.transform_interval || { start: fallbackStart, end: fallbackEnd }
            const p = getTimeParts(parseFloat(tInterval[key]) || 0)
            
            group.innerHTML = `
                <span class="time-segment" data-type="h">${p.h}</span>:
                <span class="time-segment" data-type="m">${p.m}</span>:
                <span class="time-segment" data-type="s">${p.s}</span>:
                <span class="time-segment" data-type="ms">${p.ms}</span>
            `
            
            wrap.appendChild(lbl)
            wrap.appendChild(group)
            return wrap
        }

        timingDiv.appendChild(createTimeGroup('Start', 'start'))
        timingDiv.appendChild(createTimeGroup('End', 'end'))
        
        row.renderMatrixGrid = renderMatrixGrid
        renderMatrixGrid()

        timeBtn.onclick = (e) => {
            e.preventDefault()
            e.stopPropagation()
            
            // cache internal panel and main container scroll metrics to freeze viewport jumping
            const currentGrid = matrixDiv.querySelector('.transformations-matrix')
            const cachedScroll = currentGrid ? currentGrid.scrollTop : 0
            
            const layersTab = document.getElementById('layers-tab')
            const cachedParentScroll = layersTab ? layersTab.scrollTop : 0
            
            const currentKey = row.dataset.transformKey || transformKey
            
            // Automatically select the parent transform-row
            const targetId = configData.id
            let targetNode = null
            if (typeof appLayers !== 'undefined') {
                appLayers.forEach(l => {
                    if (l.objects) {
                        l.objects.forEach(o => {
                            if (o.id === targetId || (o.node && o.node.id() === targetId) || (o.node && o.node.name() === currentKey)) {
                                targetNode = o.node
                            }
                        })
                    }
                })
            }
            
            window._preventMatrixReset = true
            
            if (targetNode) {
                const currentIdx = rowIdx - 1
                
                if (targetNode !== activeNode) {
                    if (typeof setActiveNode === 'function') setActiveNode(targetNode)
                    if (typeof transformer !== 'undefined') transformer.nodes([targetNode])
                    
                    targetNode.setAttr('activeTransformEditIndex', currentIdx)
                    
                    if (typeof renderLayersUI === 'function') renderLayersUI()
                    
                    const nClass = targetNode.getClassName()
                    const innerText = typeof targetNode.findOne === 'function' ? targetNode.findOne('.inner-text') : null
                    
                    if ((nClass === 'Group' && innerText) || nClass === 'Text') {
                        openTextEditor(targetNode)
                    } else if (nClass === 'Filter') {
                        openFilterEditor(targetNode)
                    } else {
                        openImageEditor(targetNode)
                    }
                } else {
                    targetNode.setAttr('activeTransformEditIndex', currentIdx)
                    const editObjName = document.getElementById('edit-object-name')
                    if (editObjName) {
                        const textInput = row.querySelector('.transform-row-container input[type="text"]') || row.querySelector('.panel-input input[type="text"]')
                        if (textInput) {
                            if (targetNode.getAttr('captionsGroupName')) {
                                const capList = targetNode.getAttr('captionsList') || []
                                editObjName.value = capList.length > currentIdx ? capList[currentIdx] : textInput.value
                            } else {
                                editObjName.value = textInput.value
                            }
                        }
                    }
                }
            }
            
            // Find the new row in the DOM after the panel has been rebuilt
            const newRowsContainer = document.getElementById('transforms-rows')
            if (!newRowsContainer) {
                window._preventMatrixReset = false
                return
            }
            
            let newRow = Array.from(newRowsContainer.children).find(r => r.dataset.transformKey === currentKey)
            if (!newRow && newRowsContainer.contains(row)) {
                newRow = row
            }
            if (!newRow) {
                window._preventMatrixReset = false
                return
            }
            
            // Highlight the new row
            Array.from(newRowsContainer.children).forEach(r => {
                r.style.borderLeftColor = 'transparent'
                if (typeof r.renderMatrixGrid === 'function') r.renderMatrixGrid()
            })
            newRow.style.borderLeftColor = '#00a8ff'
            if (typeof newRow.renderMatrixGrid === 'function') newRow.renderMatrixGrid()
            
            // Get the new timing elements from the new row
            const newTimingDiv = newRow.querySelector('.transform-interval-timing')
            const newMatrixDiv = newRow.querySelector('.transform-elements-container')
            const newTimeBtn = newRow.querySelector('#set-transform-interval-btn')
            
            if (!newTimingDiv || !newMatrixDiv || !newTimeBtn) {
                window._preventMatrixReset = false
                return
            }
            
            const isHidden = newTimingDiv.style.display === 'none'
            newTimingDiv.style.display = isHidden ? 'flex' : 'none'
            newMatrixDiv.style.display = isHidden ? 'block' : 'none'
            newTimeBtn.style.color = isHidden ? configData.markerColor : '#aaa'
            newTimeBtn.style.opacity = isHidden ? '1' : '0.6'
            
            const cfg = JSON.parse(newRow.dataset.transformConfig)
            cfg.isTimingOpen = isHidden
            newRow.dataset.transformConfig = JSON.stringify(cfg)
            
            if (typeof activeNode !== 'undefined' && activeNode) {
                let existingData = activeNode.getAttr('transformGroupData')
                if (existingData && existingData[currentKey]) {
                    existingData[currentKey].isTimingOpen = isHidden
                    activeNode.setAttr('transformGroupData', existingData)
                }
            }
            
            if (isHidden) {
                const activeTConfig = cfg.transformGroupData && cfg.transformGroupData[cfg.activeTransformEditIndex || 0] ? cfg.transformGroupData[cfg.activeTransformEditIndex || 0] : {}
                const fallbackStart = cfg.interval && cfg.interval.start !== undefined ? Number((parseFloat(cfg.interval.start) + 0.05).toFixed(3)) : 0.05
                const fallbackEnd = Number((fallbackStart + 0.15).toFixed(3))
                const tInterval = activeTConfig.transform_interval || { start: fallbackStart, end: fallbackEnd }
                
                const sGroup = newTimingDiv.querySelector('[data-target="start"]')
                const eGroup = newTimingDiv.querySelector('[data-target="end"]')
                if (sGroup) {
                    const sParts = getTimeParts(parseFloat(tInterval.start) || 0)
                    sGroup.querySelector('[data-type="h"]').innerText = sParts.h
                    sGroup.querySelector('[data-type="m"]').innerText = sParts.m
                    sGroup.querySelector('[data-type="s"]').innerText = sParts.s
                    sGroup.querySelector('[data-type="ms"]').innerText = sParts.ms
                }
                if (eGroup) {
                    const eParts = getTimeParts(parseFloat(tInterval.end) || 0)
                    eGroup.querySelector('[data-type="h"]').innerText = eParts.h
                    eGroup.querySelector('[data-type="m"]').innerText = eParts.m
                    eGroup.querySelector('[data-type="s"]').innerText = eParts.s
                    eGroup.querySelector('[data-type="ms"]').innerText = eParts.ms
                }
            }
            
            // Reapply scroll metric safely to the freshly rendered layout container and parent tab
            const freshlyRenderedGrid = newRow.querySelector('.transformations-matrix')
            if (freshlyRenderedGrid) freshlyRenderedGrid.scrollTop = cachedScroll
            if (layersTab) layersTab.scrollTop = cachedParentScroll
            
            if (window.updateAdvancedConfigDisplay) window.updateAdvancedConfigDisplay()
            
            window._preventMatrixReset = false
        }
        
        row.appendChild(rowTop)
        row.appendChild(timingDiv)
        row.appendChild(matrixDiv)
        
        row.addEventListener('dragstart', (e) => {
            e.stopPropagation()
            row.classList.add('dragging-row')
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', '')
            setTimeout(() => { row.style.opacity = '0.5' }, 0)
        })
        
        row.addEventListener('dragend', (e) => {
            e.stopPropagation()
            row.classList.remove('dragging-row')
            row.style.opacity = '1'
            row.draggable = false
            syncTransformsFromDOM()
        })
        
        return row
    }

    const existingGroupId = node.getAttr('transformGroupName')
    const existingData = node.getAttr('transformGroupData')
    
    if (existingGroupId) {
        panel.style.display = 'block'
        initState.style.display = 'none'
        listContainer.style.display = 'flex'
        if (activeHeader) activeHeader.style.display = 'flex'
        updateTransformName(existingGroupId)
        
        if (rowsContainer && existingData) {
            let hasHighlighted = false
            Object.keys(existingData).forEach((tId, idx) => {
                const row = createTransformRow(tId, existingData[tId], idx + 1)
                // maps active boundary border to matching object during initialization loop
                let isMatch = false
                const checkNode = node || activeNode
                if (checkNode) {
                    if (checkNode.name() === tId) isMatch = true
                    if (checkNode.getAttr('activeTransformEditIndex') === idx) isMatch = true
                    try {
                        if (existingData[tId].id === checkNode.id()) isMatch = true
                    } catch(e) {}
                }
                
                // guarantees absolutely no two rows will ever be highlighted simultaneously upon load
                if (isMatch && !hasHighlighted) {
                    row.style.borderLeftColor = '#00a8ff'
                    if (checkNode) checkNode.setAttr('activeTransformEditIndex', idx)
                    hasHighlighted = true
                } else {
                    row.style.borderLeftColor = 'transparent'
                }
                if (typeof row.renderMatrixGrid === 'function') row.renderMatrixGrid()
                rowsContainer.appendChild(row)
            })
        }
    }
    
    if (startBtn && !startBtn._transformBound) {
        startBtn._transformBound = true
        startBtn.addEventListener('click', () => {
            if (typeof activeNode === 'undefined' || !activeNode) return
            
            const mode = modeSelect ? modeSelect.value : 'create'
            if (mode === 'create') {
                const generateId = () => {
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
                    let res = ''
                    for (let i = 0; i < 8; i++) res += chars[Math.floor(Math.random() * chars.length)]
                    return 'Transform_Grp_' + res
                }
                
                const groupId = generateId()
                
                // evaluates current name and assigns strict type-1 default if unbound
                let objType = 'shape'
                const nodeClass = activeNode.getClassName()
                if (nodeClass === 'Group' && typeof activeNode.findOne === 'function' && activeNode.findOne('.inner-text')) objType = 'text'
                else if (nodeClass === 'Image') objType = 'image'
                else if (nodeClass === 'Text') objType = 'text'
                else if (nodeClass === 'Filter') objType = 'filter'
                
                let currentName = activeNode.name()
                if (!currentName || currentName.startsWith('group_') || currentName.startsWith('text_') || currentName.startsWith('image_') || currentName.startsWith('shape_') || currentName.startsWith('obj_') || currentName.startsWith('target_')) {
                    currentName = objType + '-1'
                }
                
                // natively updates the list item span in the layers panel to match the group ID
                activeNode.name(groupId)
                const activeSpan = document.querySelector('.list-item.active-item .layer-name') || document.querySelector('.list-item.active-item > span')
                if (activeSpan) {
                    activeSpan.innerText = groupId
                }
                
                if (typeof appLayers !== 'undefined') {
                    appLayers.forEach(l => {
                        if (l.objects) {
                            l.objects.forEach(o => {
                                if (o.node === activeNode) o.name = groupId
                            })
                        }
                    })
                }
                
                const editObjectName = document.getElementById('edit-object-name')
                if (editObjectName) {
                    editObjectName.value = currentName
                    setTimeout(() => {
                        editObjectName.focus()
                        editObjectName.select()
                    }, 10)
                }
                
                const config = buildTransformConfig(activeNode)
                const transformId = currentName
                
                let transformDict = {}
                transformDict[transformId] = config
                
                activeNode.setAttr('transformGroupName', groupId)
                activeNode.setAttr('transformGroupData', transformDict)
                
                panel.style.display = 'block'
                initState.style.display = 'none'
                listContainer.style.display = 'flex'
                if (activeHeader) activeHeader.style.display = 'flex'
                updateTransformName(groupId)
                
                if (rowsContainer) {
                    rowsContainer.innerHTML = ''
                    const row = createTransformRow(transformId, config, 1)
                    row.style.borderLeftColor = '#00a8ff'
                    if (typeof row.renderMatrixGrid === 'function') row.renderMatrixGrid()
                    rowsContainer.appendChild(row)
                    activeNode.setAttr('activeTransformEditIndex', 0)
                }
                
                // instantly opens corresponding editing panel to visibly refresh default properties
                const nClass = activeNode.getClassName()
                const innerText = typeof activeNode.findOne === 'function' ? activeNode.findOne('.inner-text') : null
                
                if (activeNode.getAttr('captionsGroupName')) {
                    const cRows = document.getElementById('captions-rows')
                    if (cRows && cRows.children.length > 0) {
                        const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true })
                        cRows.children[0].dispatchEvent(dblClickEvent)
                    }
                } else if ((nClass === 'Group' && innerText) || nClass === 'Text') {
                    openTextEditor(activeNode)
                } else if (nClass === 'Filter') {
                    openFilterEditor(activeNode)
                } else {
                    openImageEditor(activeNode)
                }
                
                // natively syncs the newly spawned transform row name to the properties input and auto-selects it
                const editObjName = document.getElementById('edit-object-name')
                if (editObjName) {
                    if (activeNode.getAttr('captionsGroupName')) {
                        const capList = activeNode.getAttr('captionsList') || []
                        editObjName.value = capList.length > 0 ? capList[0] : currentName
                    } else {
                        editObjName.value = currentName
                    }
                    setTimeout(() => {
                        editObjName.focus()
                        editObjName.select()
                    }, 10)
                }
                
                if (window.updateAdvancedConfigDisplay) window.updateAdvancedConfigDisplay()
            }
        })
    }

    if (addTransformBtn && !addTransformBtn._transformBound) {
        addTransformBtn._transformBound = true
        
        // binds enter key natively to the input field
        const newTransformInput = document.getElementById('new-transform-input')
        if (newTransformInput && !newTransformInput._enterBound) {
            newTransformInput._enterBound = true
            newTransformInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    addTransformBtn.click()
                }
            })
        }
        
        addTransformBtn.addEventListener('click', () => {
            if (typeof activeNode === 'undefined' || !activeNode) return
            
            const nameInput = document.getElementById('new-transform-input')
            if (!nameInput || !nameInput.value.trim()) return
            
            const newName = nameInput.value.trim()
            const existingData = activeNode.getAttr('transformGroupData') || {}
            const nextIdx = Object.keys(existingData).length + 1
            
            // strictly enforces a 9 character alphanumeric string for unique IDs
            const generateAlphanumeric = (length) => {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
                let res = ''
                for (let i = 0; i < length; i++) res += chars[Math.floor(Math.random() * chars.length)]
                return res
            }
            
            // strictly binds explicit type_alphanumeric format for pristine ids
            const typePrefix = activeNode.getClassName().toLowerCase()
            const newId = typePrefix + '_' + generateAlphanumeric(9)
            
            // perfectly clones active object to canvas with new name input, strict bounds, and explicit visibility
            const newNode = activeNode.clone({
                name: newName,
                id: newId,
                visible: true,
                opacity: activeNode.opacity() || 1
            })
            
            // strictly strips caption group memory from new transform clones to prevent ID collisions and locked states
            newNode.setAttr('captionsGroupName', null)
            newNode.setAttr('captionsList', null)
            newNode.setAttr('captionStyles', null)
            newNode.setAttr('captionTimings', null)
            newNode.setAttr('activeCaptionEditIndex', null)
            newNode.setAttr('originalName', null)
            
            // updates text contents for cloned group layers so the UI editors read the new string
            if (newNode.getClassName() === 'Group') {
                const innerText = newNode.findOne('.inner-text')
                if (innerText) innerText.text(newName)
            } else if (newNode.getClassName() === 'Text') {
                newNode.text(newName)
            }
            
            newNode.x(newNode.x() + 20)
            newNode.y(newNode.y() + 20)
            activeNode.getParent().add(newNode)
            
            const groupId = activeNode.getAttr('transformGroupName')
            newNode.setAttr('transformGroupName', groupId)
            
            // retrieves accurate interval bounds from the active object state memory
            let currentObj = null
            if (typeof appLayers !== 'undefined') {
                appLayers.forEach(l => {
                    if (l.objects) {
                        const found = l.objects.find(o => o.node === activeNode)
                        if (found) currentObj = found
                    }
                })
            }
            
            const sTime = currentObj && currentObj.startTime !== undefined ? currentObj.startTime : 0
            const eTime = currentObj && currentObj.endTime !== undefined ? currentObj.endTime : 5
            
            // strictly maps the newly generated clone back to the master appLayers structure
            if (typeof appLayers !== 'undefined') {
                appLayers.forEach(l => {
                    if (l.objects && l.objects.some(o => o.node === activeNode)) {
                        l.objects.push({
                            id: newId,
                            name: newName,
                            type: l.type,
                            node: newNode,
                            startTime: sTime,
                            endTime: eTime,
                            visible: true,
                            locked: false
                        })
                    }
                })
            }
            
            const config = buildTransformConfig(newNode)
            existingData[newName] = config
            
            newNode.setAttr('transformGroupData', existingData)
            activeNode.setAttr('transformGroupData', existingData)
            
            const tGroup = activeNode.getAttr('transformGroupName')
            if (tGroup && typeof appLayers !== 'undefined') {
                appLayers.forEach(l => {
                    if (l.objects) {
                        l.objects.forEach(o => {
                            if (o.node && o.node.getAttr('transformGroupName') === tGroup) {
                                o.node.setAttr('transformGroupData', existingData)
                            }
                        })
                    }
                })
            }
            
            if (rowsContainer) {
                Array.from(rowsContainer.children).forEach(r => {
                    r.style.borderLeftColor = 'transparent'
                    if (typeof r.renderMatrixGrid === 'function') r.renderMatrixGrid()
                })
                const newRow = createTransformRow(newName, config, nextIdx)
                newRow.style.borderLeftColor = '#00a8ff'
                if (typeof newRow.renderMatrixGrid === 'function') newRow.renderMatrixGrid()
                rowsContainer.appendChild(newRow)
                newNode.setAttr('activeTransformEditIndex', rowsContainer.children.length - 1)
            }
            
            nameInput.value = ''
            
            // applies focus to new object
            if (typeof setActiveNode === 'function') setActiveNode(newNode)
            if (typeof transformer !== 'undefined') transformer.nodes([newNode])
            if (typeof renderLayersUI === 'function') renderLayersUI()
            
            // opens corresponding editing panel to visually refresh default properties for active clone
            const nodeClass = newNode.getClassName()
            const innerText = typeof newNode.findOne === 'function' ? newNode.findOne('.inner-text') : null
            if ((nodeClass === 'Group' && innerText) || nodeClass === 'Text') {
                openTextEditor(newNode)
            } else if (nodeClass === 'Filter') {
                openFilterEditor(newNode)
            } else {
                openImageEditor(newNode)
            }
            
            // perfectly syncs the newly spawned transform row name to the properties input and auto-selects it
            const editObjName = document.getElementById('edit-object-name')
            if (editObjName) {
                editObjName.value = newName
                setTimeout(() => {
                    editObjName.focus()
                    editObjName.select()
                    
                    const tabContent = document.getElementById('layers-tab')
                    if (tabContent) {
                        tabContent.scrollTop = editObjName.offsetTop > 20 ? editObjName.offsetTop - 20 : 0
                    }
                }, 10)
            }
            
            if (window.updateAdvancedConfigDisplay) window.updateAdvancedConfigDisplay()
        })
    }
    
    if (cancelBtn && !cancelBtn._transformBound) {
        cancelBtn._transformBound = true
        cancelBtn.addEventListener('click', () => {
            if (typeof activeNode !== 'undefined' && activeNode) {
                const tGroup = activeNode.getAttr('transformGroupName')
                let originalName = null
                
                if (tGroup && typeof appLayers !== 'undefined') {
                    appLayers.forEach(l => {
                        if (l.objects) {
                            l.objects.forEach(o => {
                                if (o.node && o.node.getAttr('transformGroupName') === tGroup) {
                                    let tData = o.node.getAttr('transformGroupData')
                                    if (tData) {
                                        const origName = Object.keys(tData).find(k => tData[k].id === o.node.id())
                                        
                                        let baseType = o.node.getClassName()
                                        if (baseType === 'Group' && typeof o.node.findOne === 'function' && o.node.findOne('.inner-text')) {
                                            baseType = 'Text'
                                        }
                                        
                                        let finalName = origName || o.node.getAttr('originalName') || `New_${baseType}_1`
                                        
                                        // prevents object from inheriting the group's generic ID name if it was synced
                                        if (finalName === tGroup) {
                                            finalName = o.node.getAttr('originalName') || `New_${baseType}_1`
                                        }
                                        
                                        if (finalName) {
                                            let uniqueName = finalName
                                            let counter = 1
                                            let match = uniqueName.match(/^(.*?)_(\d+)$/)
                                            let prefix = uniqueName
                                            if (match) {
                                                prefix = match[1]
                                                counter = parseInt(match[2], 10)
                                            }
                                            let isUnique = false
                                            while (!isUnique) {
                                                isUnique = true
                                                appLayers.forEach(layer => layer.objects.forEach(obj => {
                                                    if (obj.node !== o.node && (obj.name === uniqueName || (obj.node && obj.node.name() === uniqueName))) {
                                                        isUnique = false
                                                    }
                                                }))
                                                if (!isUnique) {
                                                    counter++
                                                    uniqueName = `${prefix}_${counter}`
                                                }
                                            }

                                            o.node.name(uniqueName)
                                            o.name = uniqueName
                                            if (o.node === activeNode) originalName = uniqueName
                                        }
                                    }
                                    o.node.setAttr('transformGroupName', null)
                                    o.node.setAttr('transformGroupData', null)
                                }
                            })
                        }
                    })
                }
                
                activeNode.setAttr('transformGroupName', null)
                activeNode.setAttr('transformGroupData', null)
                
                // forces fallback to captions row 1 or default standard object properties upon ungrouping
                const cGroup = activeNode.getAttr('captionsGroupName')
                if (cGroup) {
                    const cRows = document.getElementById('captions-rows')
                    if (cRows && cRows.children.length > 0) {
                        const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true })
                        cRows.children[0].dispatchEvent(dblClickEvent)
                    }
                } else {
                    const nClass = activeNode.getClassName()
                    const innerText = typeof activeNode.findOne === 'function' ? activeNode.findOne('.inner-text') : null
                    
                    if ((nClass === 'Group' && innerText) || nClass === 'Text') {
                        openTextEditor(activeNode)
                    } else if (nClass === 'Filter') {
                        openFilterEditor(activeNode)
                    } else {
                        openImageEditor(activeNode)
                    }
                    
                    // Directly resets the UI property field to the extracted default name
                    const editObjName = document.getElementById('edit-object-name')
                    if (editObjName) {
                        editObjName.value = originalName || activeNode.name()
                    }
                }
            }
            
            // explicitly hides the transforms timeline panel, but keeps the object actively editable in the main UI
            panel.style.display = 'none'
            initState.style.display = 'flex'
            listContainer.style.display = 'none'
            if (activeHeader) activeHeader.style.display = 'none'
            if (rowsContainer) rowsContainer.innerHTML = ''
            if (window.updateAdvancedConfigDisplay) window.updateAdvancedConfigDisplay()
            if (typeof renderLayersUI === 'function') renderLayersUI()
        })
    }
}

function adjustScrollIfNeeded(element) {
    if (!element) return
    const rect = element.getBoundingClientRect()
    const elementCenterY = rect.top + rect.height / 2
    const viewportCenterY = window.innerHeight / 2
    if (elementCenterY > viewportCenterY) {
        let parent = element.parentElement
        while (parent && parent !== document.body) {
            const overflowY = window.getComputedStyle(parent).overflowY
            if (overflowY === 'auto' || overflowY === 'scroll') {
                break
            }
            parent = parent.parentElement
        }
        const scrollContainer = parent || window
        const targetViewportY = viewportCenterY - 60
        const diff = elementCenterY - targetViewportY
        if (scrollContainer === window) {
            window.scrollBy({ top: diff, behavior: 'smooth' })
        } else {
            scrollContainer.scrollBy({ top: diff, behavior: 'smooth' })
        }
    }
}

export function initAdvancedTransformBindings() {
    const advancedExpander = document.getElementById('advanced-transform-expander')
    const advancedOptions = document.getElementById('advanced-transform-options')
    if (advancedExpander && advancedOptions) {
        advancedExpander.onclick = () => {
            const isHidden = advancedOptions.style.display === 'none'
            advancedOptions.style.display = isHidden ? 'flex' : 'none'
            advancedExpander.innerText = isHidden ? '▲ Advanced Options' : '▼ Advanced Options'
            advancedExpander.style.color = isHidden ? '#fff' : '#aaa'
            adjustScrollIfNeeded(advancedExpander)
        }
    }

    const blockToggle = document.getElementById('transform-blocking-toggle')
    if (blockToggle) {
        blockToggle.onclick = () => {
            const isOn = blockToggle.style.backgroundColor === 'rgb(0, 168, 255)' || blockToggle.style.backgroundColor === '#00a8ff'
            blockToggle.style.backgroundColor = isOn ? '#34495e' : '#00a8ff'
            if (window.updateAdvancedConfigDisplay) window.updateAdvancedConfigDisplay()
            adjustScrollIfNeeded(blockToggle)
        }
    }
    
    const styleToggle = document.getElementById('transform-styling-toggle')
    if (styleToggle) { 
        styleToggle.onclick = () => {
            const isOn = styleToggle.style.backgroundColor === 'rgb(0, 168, 255)' || styleToggle.style.backgroundColor === '#00a8ff'
            styleToggle.style.backgroundColor = isOn ? '#34495e' : '#00a8ff'
            if (window.updateAdvancedConfigDisplay) window.updateAdvancedConfigDisplay()
            adjustScrollIfNeeded(styleToggle)
        }
    }
}

// Binds crop ratio selection drag interactions and mask rendering
export function initCropToolBindings() {
    // Sets default styling for ratio buttons
    document.querySelectorAll('.ratio-btn').forEach(b => {
        b.style.backgroundColor = '#34495e';
        b.style.color = 'white';
    });

    // Variables scoped for access across crop tool events
    let selectedRatio = null;
    let cropBoxW = 0, cropBoxH = 0;
    let renderW = 0, renderH = 0;
    let offsetX = 0, offsetY = 0;
    let activeRatioNode = null;
    let savedLeft = null;
    let savedTop = null;

    const previewBox = document.getElementById('crop-preview-box');
    const confirmCropBtn = document.getElementById('confirm-crop-btn');
    const editCropBtn = document.getElementById('edit-crop-btn');

    // Updates explicit geometry for mask bars using dynamic coordinates
    function updateLiveLetterboxes(left, top) {
        const tBar = document.getElementById('crop-mask-top')
        const bBar = document.getElementById('crop-mask-bottom')
        const lBar = document.getElementById('crop-mask-left')
        const rBar = document.getElementById('crop-mask-right')
        if (!tBar || !bBar || !lBar || !rBar) return

        tBar.style.left = offsetX + 'px'
        tBar.style.top = offsetY + 'px'
        tBar.style.width = renderW + 'px'
        tBar.style.height = Math.max(0, top - offsetY) + 'px'

        bBar.style.left = offsetX + 'px'
        bBar.style.top = (top + cropBoxH) + 'px'
        bBar.style.width = renderW + 'px'
        bBar.style.height = Math.max(0, renderH - (top - offsetY + cropBoxH)) + 'px'
        
        lBar.style.left = offsetX + 'px'
        lBar.style.top = top + 'px'
        lBar.style.width = Math.max(0, left - offsetX) + 'px'
        lBar.style.height = cropBoxH + 'px'
        
        rBar.style.left = (left + cropBoxW) + 'px'
        rBar.style.top = top + 'px'
        rBar.style.width = Math.max(0, renderW - (left - offsetX + cropBoxW)) + 'px'
        rBar.style.height = cropBoxH + 'px'
    }

    // Binds ratio button selection logic
    document.querySelectorAll('.ratio-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const video = document.getElementById('main-video')
            if (!video || !video.videoWidth) return
            
            const targetBtn = e.currentTarget

            const existingWrapper = document.getElementById('active-ratio-wrapper')
            if (existingWrapper) {
                const parent = existingWrapper.parentNode
                const oldBtn = existingWrapper.querySelector('.ratio-btn')
                if (oldBtn) {
                    oldBtn.style.cssText = oldBtn.dataset.originalStyle || ''
                    oldBtn.style.backgroundColor = '#34495e'
                    oldBtn.style.color = 'white'
                    parent.insertBefore(oldBtn, existingWrapper)
                }
                if (editCropBtn) parent.insertBefore(editCropBtn, existingWrapper)
                if (confirmCropBtn) parent.insertBefore(confirmCropBtn, existingWrapper)
                existingWrapper.remove()
            }

            if (!targetBtn.dataset.originalStyle) {
                targetBtn.dataset.originalStyle = targetBtn.style.cssText
            }

            const originalWidth = targetBtn.getBoundingClientRect().width
            selectedRatio = eval(targetBtn.dataset.ratio)
            activeRatioNode = targetBtn

            document.querySelectorAll('.ratio-btn').forEach(b => {
                if (b !== targetBtn) {
                    b.style.opacity = '0.3'
                    b.style.pointerEvents = 'none'
                    b.style.backgroundColor = '#34495e'
                } else {
                    b.style.opacity = '1'
                    b.style.pointerEvents = 'auto'
                }
            })

            const wrapper = document.createElement('div')
            wrapper.id = 'active-ratio-wrapper'
            wrapper.style.display = 'flex'
            wrapper.style.width = originalWidth + 'px'
            wrapper.style.gap = '8px'
            wrapper.style.alignItems = 'stretch'

            targetBtn.parentNode.insertBefore(wrapper, targetBtn)
            wrapper.appendChild(targetBtn)
            
            targetBtn.style.flex = '1'
            targetBtn.style.width = 'auto'
            targetBtn.style.margin = '0'
            targetBtn.style.backgroundColor = '#00aaff'
            targetBtn.style.color = 'white'

            const actionStyle = 'flex: 0 0 50px; width: 50px; margin: 0; padding: 0; border: none; cursor: pointer; color: white;'

            if (confirmCropBtn) {
                wrapper.appendChild(confirmCropBtn)
                confirmCropBtn.style.cssText = actionStyle + ' display: flex; justify-content: center; align-items: center; background-color: #28a745;'
            }
            if (editCropBtn) {
                wrapper.appendChild(editCropBtn)
                editCropBtn.innerText = 'Edit'
                editCropBtn.style.cssText = actionStyle + ' display: none; justify-content: center; align-items: center; background-color: #ff9800;'
            }
            
            if (previewBox) previewBox.style.display = 'block'
            const maskDiv = document.getElementById('applied-crop-mask')
            if (maskDiv) maskDiv.style.display = 'none'

            const editMask = document.getElementById('edit-crop-mask-container')
            if (editMask) editMask.style.display = 'block'

            if (video) video.style.clipPath = 'none'
            
            const canvasContainer = document.getElementById('canvas-container')
            if (canvasContainer) {
                canvasContainer.style.clipPath = 'none'
                canvasContainer.style.setProperty('clip-path', 'none', 'important')
            }
            
            const vidRect = video.getBoundingClientRect()
            const videoRatio = video.videoWidth / video.videoHeight
            const containerRatio = vidRect.width / vidRect.height
            renderW = vidRect.width
            renderH = vidRect.height
            if (containerRatio > videoRatio) renderW = renderH * videoRatio
            else renderH = renderW / videoRatio
            
            offsetX = (vidRect.width - renderW) / 2
            offsetY = (vidRect.height - renderH) / 2
            cropBoxW = renderW
            cropBoxH = renderH
            if (selectedRatio > videoRatio) cropBoxH = cropBoxW / selectedRatio
            else cropBoxW = cropBoxH * selectedRatio
            
            if (previewBox) {
                previewBox.style.width = cropBoxW + 'px'
                previewBox.style.height = cropBoxH + 'px'
                const L = offsetX + (renderW - cropBoxW) / 2
                const T = offsetY + (renderH - cropBoxH) / 2
                previewBox.style.left = L + 'px'
                previewBox.style.top = T + 'px'
                updateLiveLetterboxes(L, T)

                // Calculates percentages and triggers external crop handler
                const leftPct = ((L - offsetX) / renderW) * 100
                const topPct = ((T - offsetY) / renderH) * 100
                if (typeof applyCrop === 'function') applyCrop(leftPct, topPct)

                // Bypasses render state wipes
                const forceGreenBox = () => {
                    const liveBox = document.getElementById('crop-preview-box')
                    if (liveBox) {
                        // Applies saved coordinates to prevent layout snapping
                        liveBox.style.left = L + 'px'
                        liveBox.style.top = T + 'px'
                        liveBox.style.display = 'block'
                        liveBox.style.zIndex = '99999'
                    }
                    const vid = document.getElementById('main-video')
                    if (vid) vid.style.clipPath = 'none'
                    const canvasCont = document.getElementById('canvas-container')
                    if (canvasCont) {
                        canvasCont.style.clipPath = 'none'
                        canvasCont.style.setProperty('clip-path', 'none', 'important')
                    }
                    const maskD = document.getElementById('applied-crop-mask')
                    if (maskD) maskD.style.display = 'none'
                }
                forceGreenBox()
                requestAnimationFrame(forceGreenBox)
            }
        })
    })

    // Binds drag events to the preview box
    let isDraggingCrop = false
    let cropDragStartX = 0, cropDragStartY = 0
    let initialBoxLeft = 0, initialBoxTop = 0
    if (previewBox) {
        previewBox.addEventListener('mousedown', (e) => {
            isDraggingCrop = true
            cropDragStartX = e.clientX
            cropDragStartY = e.clientY
            initialBoxLeft = parseFloat(previewBox.style.left) || 0
            initialBoxTop = parseFloat(previewBox.style.top) || 0
        })
        document.addEventListener('mousemove', (e) => {
            if (!isDraggingCrop) return
            let newLeft = initialBoxLeft + (e.clientX - cropDragStartX)
            let newTop = initialBoxTop + (e.clientY - cropDragStartY)
            if (newLeft < offsetX) newLeft = offsetX
            if (newTop < offsetY) newTop = offsetY
            if (newLeft + cropBoxW > offsetX + renderW) newLeft = offsetX + renderW - cropBoxW
            if (newTop + cropBoxH > offsetY + renderH) newTop = offsetY + renderH - cropBoxH
            previewBox.style.left = newLeft + 'px'
            previewBox.style.top = newTop + 'px'

            // Calculates percentages and triggers external crop handler
            const dragLeftPct = ((newLeft - offsetX) / renderW) * 100
            const dragTopPct = ((newTop - offsetY) / renderH) * 100
            if (typeof applyCrop === 'function') applyCrop(dragLeftPct, dragTopPct)
            
            // Fetches node directly to bypass render state wipes
            const forceGreenBoxRender = () => {
                const liveBox = document.getElementById('crop-preview-box')
                if (liveBox) {
                    liveBox.style.left = newLeft + 'px'
                    liveBox.style.top = newTop + 'px'
                    liveBox.style.display = 'block'
                    liveBox.style.zIndex = '99999'
                }
                const vid = document.getElementById('main-video')
                if (vid) vid.style.clipPath = 'none'
                const canvasCont = document.getElementById('canvas-container')
                if (canvasCont) {
                    canvasCont.style.clipPath = 'none'
                    canvasCont.style.setProperty('clip-path', 'none', 'important')
                }
                const maskD = document.getElementById('applied-crop-mask')
                if (maskD) maskD.style.display = 'none'
            }
            forceGreenBoxRender()
            requestAnimationFrame(forceGreenBoxRender)

            // Updates dynamic mask bar positions during drag
            updateLiveLetterboxes(newLeft, newTop)
        })
        document.addEventListener('mouseup', () => { isDraggingCrop = false })
    }

    // Binds crop confirmation action
    if (confirmCropBtn) {
        confirmCropBtn.addEventListener('click', () => {
            if (!selectedRatio) return
            const video = document.getElementById('main-video')
            const canvasContainer = document.getElementById('canvas-container')
            
            savedLeft = previewBox.style.left;
            savedTop = previewBox.style.top;

            const currentLeft = parseFloat(previewBox.style.left)
            const currentTop = parseFloat(previewBox.style.top)
            const topPct = ((currentTop - offsetY) / renderH) * 100
            const leftPct = ((currentLeft - offsetX) / renderW) * 100
            const bottomPct = (1 - ((currentTop - offsetY + cropBoxH) / renderH)) * 100
            const rightPct = (1 - ((currentLeft - offsetX + cropBoxW) / renderW)) * 100
            
            if (video) video.style.clipPath = `inset(${topPct}% ${rightPct}% ${bottomPct}% ${leftPct}%)`
            if (canvasContainer) {
                canvasContainer.style.clipPath = 'none'
                canvasContainer.style.setProperty('clip-path', 'none', 'important')
            }
            const maskDiv = document.getElementById('applied-crop-mask')
            if (maskDiv) maskDiv.style.display = 'block'

            const editMask = document.getElementById('edit-crop-mask-container')
            if (editMask) editMask.style.display = 'none'

            if (typeof applyCrop === 'function') applyCrop(leftPct, topPct)
            
            previewBox.style.display = 'none'
            confirmCropBtn.style.display = 'none'
            if (editCropBtn) editCropBtn.style.display = 'flex'

            document.querySelectorAll('.ratio-btn').forEach(b => {
                b.style.opacity = '1'
                b.style.pointerEvents = 'auto'
                if (b === activeRatioNode) {
                    b.style.backgroundColor = '#00aaff'
                } else {
                    b.style.backgroundColor = '#34495e'
                }
                b.style.color = 'white'
            })
        })
    }

    // Binds crop editing action
    if (editCropBtn) {
        editCropBtn.addEventListener('click', () => {
            if (!selectedRatio) return
            
            const video = document.getElementById('main-video')
            const vidRect = video.getBoundingClientRect()
            const videoRatio = video.videoWidth / video.videoHeight
            const containerRatio = vidRect.width / vidRect.height
            
            renderW = vidRect.width
            renderH = vidRect.height
            if (containerRatio > videoRatio) renderW = renderH * videoRatio
            else renderH = renderW / videoRatio
            
            offsetX = (vidRect.width - renderW) / 2
            offsetY = (vidRect.height - renderH) / 2

            cropBoxW = renderW
            cropBoxH = renderH
            if (selectedRatio > videoRatio) cropBoxH = cropBoxW / selectedRatio
            else cropBoxW = cropBoxH * selectedRatio

            editCropBtn.style.display = 'none'
            if (confirmCropBtn) confirmCropBtn.style.display = 'flex'
            
            if (previewBox) {
                if (savedLeft && savedTop) {
                    previewBox.style.left = savedLeft
                    previewBox.style.top = savedTop
                    
                    // Aligns mask bars to saved coordinates
                    updateLiveLetterboxes(parseFloat(savedLeft), parseFloat(savedTop))

                    // Applies external crop using saved coordinates
                    const savedLeftPct = ((parseFloat(savedLeft) - offsetX) / renderW) * 100
                    const savedTopPct = ((parseFloat(savedTop) - offsetY) / renderH) * 100
                    if (typeof applyCrop === 'function') applyCrop(savedLeftPct, savedTopPct)
                }
                
                // Bypasses render state wipes
                const forceGreenBox = () => {
                    const liveBox = document.getElementById('crop-preview-box')
                    if (liveBox) {
                        // Applies saved coordinates to prevent layout snapping
                        if (savedLeft) liveBox.style.left = savedLeft
                        if (savedTop) liveBox.style.top = savedTop
                        liveBox.style.display = 'block'
                        liveBox.style.zIndex = '99999'
                    }
                    const vid = document.getElementById('main-video')
                    if (vid) vid.style.clipPath = 'none'
                    const canvasCont = document.getElementById('canvas-container')
                    if (canvasCont) {
                        canvasCont.style.clipPath = 'none'
                        canvasCont.style.setProperty('clip-path', 'none', 'important')
                    }
                    const maskD = document.getElementById('applied-crop-mask')
                    if (maskD) maskD.style.display = 'none'
                }
                forceGreenBox()
                requestAnimationFrame(forceGreenBox)
            }
            
            const maskDiv = document.getElementById('applied-crop-mask')
            if (maskDiv) maskDiv.style.display = 'none'

            const editMask = document.getElementById('edit-crop-mask-container')
            if (editMask) editMask.style.display = 'block'

            document.querySelectorAll('.ratio-btn').forEach(b => {
                if (b !== activeRatioNode) {
                    b.style.opacity = '0.3'
                    b.style.pointerEvents = 'none'
                    b.style.backgroundColor = '#34495e'
                } else {
                    b.style.backgroundColor = '#00aaff'
                    b.style.color = 'white'
                }
            })
            if (video) video.style.clipPath = 'none'
        })
    }
}

// Binds global document clicks and collapse buttons for sidebar visibility
export function initSidebarToggleBindings() {
    document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('sidebar')
        if (!sidebar) return
        if (sidebar.clientWidth <= 20 && sidebar.contains(e.target)) {
            sidebar.classList.add('force-open')
            return
        }
        if (sidebar.classList.contains('force-open') && !sidebar.contains(e.target)) {
            sidebar.classList.remove('force-open')
        }
    })

    const collapseBar = document.getElementById('collapse-sidebar-bar')
    if (collapseBar) {
        collapseBar.addEventListener('click', (e) => {
            e.stopPropagation() 
            const sidebar = document.getElementById('sidebar')
            if (sidebar) sidebar.classList.remove('force-open')
        })
    }

    const advancedExpander = document.getElementById('advanced-transform-expander')
    const advancedOptions = document.getElementById('advanced-transform-options')
    if (advancedExpander && advancedOptions) {
        advancedExpander.onclick = () => {
            const isHidden = advancedOptions.style.display === 'none'
            advancedOptions.style.display = isHidden ? 'flex' : 'none'
            advancedExpander.innerText = isHidden ? '▲ Advanced Options' : '▼ Advanced Options'
            advancedExpander.style.color = isHidden ? '#fff' : '#aaa'
            adjustScrollIfNeeded(advancedExpander)
        }
    }

    const blockToggle = document.getElementById('transform-blocking-toggle')
    if (blockToggle) {
        blockToggle.onclick = () => {
            const isOn = blockToggle.style.backgroundColor === 'rgb(0, 168, 255)' || blockToggle.style.backgroundColor === '#00a8ff'
            blockToggle.style.backgroundColor = isOn ? '#34495e' : '#00a8ff'
            adjustScrollIfNeeded(blockToggle)
        }
    }
    
    const styleToggle = document.getElementById('transform-styling-toggle')
    if (styleToggle) {
        styleToggle.onclick = () => {
            const isOn = styleToggle.style.backgroundColor === 'rgb(0, 168, 255)' || styleToggle.style.backgroundColor === '#00a8ff'
            styleToggle.style.backgroundColor = isOn ? '#34495e' : '#00a8ff'
            adjustScrollIfNeeded(styleToggle)
        }
    }
}


// handles shadow toggle, color, and coordinate mapping for the orientation wheel
export function initShadowControls(getActiveNodes) {
    const shadowToggle = document.getElementById('edit-shadow-toggle')
    const shadowColor = document.getElementById('edit-shadow-color')
    const shadowBlur = document.getElementById('edit-shadow-blur')
    const shadowThickness = document.getElementById('edit-shadow-thickness')
    const shadowWheel = document.getElementById('shadow-wheel')
    const shadowHandle = document.getElementById('shadow-wheel-handle')
    const shadowSlidersWrap = document.getElementById('shadow-sliders-wrap')
    const shadowAngleWrap = document.getElementById('shadow-angle-wrap')
    const shadowAngle = document.getElementById('edit-shadow-angle')

    let isDraggingWheel = false

    // generic UI spinner binding helper for the new shadow buttons
    const bindSpinner = (inputId, upId, downId, min, max, step) => {
        const input = document.getElementById(inputId)
        const upBtn = document.getElementById(upId)
        const downBtn = document.getElementById(downId)
        
        if (!input || !upBtn || !downBtn) return
        
        const changeVal = (delta) => {
            let val = parseFloat(input.value) || 0
            val = Math.min(max, Math.max(min, val + delta))
            input.value = val
            input.dispatchEvent(new Event('input')) // triggers existing listeners
        }
        
        upBtn.onclick = () => changeVal(step)
        downBtn.onclick = () => changeVal(-step)
    }

    bindSpinner('edit-shadow-blur', 'shadow-blur-up', 'shadow-blur-down', -50, 50, 1)
    bindSpinner('edit-shadow-thickness', 'shadow-thickness-up', 'shadow-thickness-down', 0, 100, 1)

    // toggles shadow active state and syncs ui availability
    shadowToggle.addEventListener('click', () => {
        const nodes = getActiveNodes()
        if (!nodes || !nodes.text) return

        const isOn = !shadowToggle.classList.contains('shadow-active')
        shadowToggle.classList.toggle('shadow-active', isOn)
        shadowToggle.style.backgroundColor = isOn ? '#00a8ff' : '#34495e' // UPDATED to standard colors

        // applies thickness as opacity when enabling, zeros opacity when disabling
        const thicknessVal = parseInt(shadowThickness.value, 10) || 100
        nodes.text.shadowOpacity(isOn ? thicknessVal / 100 : 0)

        const shadowUIElements = [shadowColor, shadowWheel, shadowAngleWrap]
        shadowUIElements.forEach(el => {
            el.style.opacity = isOn ? '1' : '0.5'
            el.style.pointerEvents = isOn ? 'auto' : 'none'
        })
        shadowSlidersWrap.style.opacity = isOn ? '1' : '0.5'
        shadowSlidersWrap.style.pointerEvents = isOn ? 'auto' : 'none'
    })

    shadowColor.addEventListener('input', (e) => {
        const nodes = getActiveNodes()
        if (nodes && nodes.text) nodes.text.shadowColor(e.target.value)
    })

    // negative values clamp to 0 for a hard-edged shadow; positive values increase blur softness
    shadowBlur.addEventListener('input', (e) => {
        const nodes = getActiveNodes()
        if (nodes && nodes.text) {
            const rawVal = parseInt(e.target.value, 10) || 0
            nodes.text.setAttr('rawShadowBlur', rawVal) // stores raw UI state
            nodes.text.shadowBlur(Math.max(0, rawVal))  // applies clamped physical state
        }
    })

    // maps thickness 0-100 to shadowOpacity 0.0-1.0
    shadowThickness.addEventListener('input', (e) => {
        const nodes = getActiveNodes()
        const isOn = shadowToggle.classList.contains('shadow-active')
        if (nodes && nodes.text && isOn) {
            nodes.text.shadowOpacity((parseInt(e.target.value, 10) || 0) / 100)
        }
    })

    if (shadowAngle) {
        shadowAngle.addEventListener('input', (e) => {
            const nodes = getActiveNodes()
            const targetNode = nodes && nodes.text ? nodes.text : nodes && nodes.group ? nodes.group : null
            if (targetNode && targetNode.shadowOffsetX) {
                let angleDeg = parseInt(e.target.value, 10) || 0
                let angleRad = angleDeg * Math.PI / 180
                
                let currentX = targetNode.shadowOffsetX() || 0
                let currentY = targetNode.shadowOffsetY() || 0
                let dist = Math.sqrt(currentX * currentX + currentY * currentY)
                if (dist === 0) dist = 15
                
                const newX = Math.sin(angleRad) * dist
                const newY = Math.cos(angleRad) * dist
                
                targetNode.shadowOffsetX(newX)
                targetNode.shadowOffsetY(newY)
                
                const maxRadius = shadowWheel.getBoundingClientRect().width / 2 || 20
                const maxShadowDist = 15
                
                let handleX = newX * (maxRadius / maxShadowDist)
                let handleY = newY * (maxRadius / maxShadowDist)
                
                const hDist = Math.sqrt(handleX * handleX + handleY * handleY)
                if (hDist > maxRadius) {
                    handleX = (handleX / hDist) * maxRadius
                    handleY = (handleY / hDist) * maxRadius
                }
                
                shadowHandle.style.left = `${maxRadius + handleX - 4}px`
                shadowHandle.style.top = `${maxRadius + handleY - 4}px`
            }
        })
    }

    const updateShadowFromWheel = (e) => {
        const rect = shadowWheel.getBoundingClientRect()
        const centerX = rect.width / 2
        const centerY = rect.height / 2

        let dx = e.clientX - rect.left - centerX
        let dy = e.clientY - rect.top - centerY

        const maxRadius = rect.width / 2
        const maxShadowDist = 15

        let distance = Math.sqrt(dx * dx + dy * dy)
        if (distance > maxRadius) {
            dx = (dx / distance) * maxRadius
            dy = (dy / distance) * maxRadius
        }

        shadowHandle.style.left = `${centerX + dx - 4}px`
        shadowHandle.style.top = `${centerY + dy - 4}px`

        const nodes = getActiveNodes()
        const targetNode = nodes && nodes.text ? nodes.text : nodes && nodes.group ? nodes.group : null
        if (targetNode && targetNode.shadowOffsetX) {
            const scale = maxShadowDist / maxRadius
            targetNode.shadowOffsetX(dx * scale)
            targetNode.shadowOffsetY(dy * scale)
            if (shadowAngle) shadowAngle.value = (dx === 0 && dy === 0) ? 0 : Math.round(Math.atan2(dx, dy) * 180 / Math.PI)
        }
    }

    shadowWheel.addEventListener('mousedown', (e) => {
        // halts event bubbling to prevent container drag
        e.preventDefault()
        e.stopPropagation()
        isDraggingWheel = true
        updateShadowFromWheel(e)
    })

    document.addEventListener('mousemove', (e) => {
        if (isDraggingWheel) updateShadowFromWheel(e)
    })

    document.addEventListener('mouseup', () => {
        isDraggingWheel = false
    })
}



// initializes caption panel state and event bindings for active node
function initCaptionsPanel(node) {
    const panel = document.getElementById('captions-timeline-panel')
    const initState = document.getElementById('captions-init-state')
    const modeSelect = document.getElementById('captions-mode-select')
    const startBtn = document.getElementById('start-captions-btn')
    const targetSelectWrap = document.getElementById('captions-target-select-wrap')
    const targetSelect = document.getElementById('existing-groups-select')
    const listContainer = document.getElementById('captions-list-container')
    const rowsContainer = document.getElementById('captions-rows')
    const newCaptionInput = document.getElementById('new-caption-input')
    const addCaptionBtn = document.getElementById('add-caption-row-btn')
    const activeHeader = document.getElementById('active-captions-group-header')
    const nameDisplay = document.getElementById('captions-group-name-display')
    const cancelBtn = document.getElementById('cancel-captions-group-btn')
    
    // officially connects captions panel to the unified object name field
    const editTextInput = document.getElementById('edit-object-name')
    const backModeBtn = document.getElementById('back-captions-mode-btn')

    if (!panel || !initState) return

    panel.style.display = 'block'
    initState.style.display = 'flex'
    targetSelectWrap.style.display = 'none'
    listContainer.style.display = 'none'
    if (activeHeader) activeHeader.style.display = 'none'
    rowsContainer.innerHTML = ''
    newCaptionInput.value = ''
    modeSelect.value = 'create'

    // dynamically updates layer name to reflect purely the group ID
    const updateNodeName = () => {
        const groupId = node.getAttr('captionsGroupName')
        if (groupId) {
            node.name(groupId)
            
            // perfectly applies marquee effect to the group name display for long ID strings
            if (nameDisplay) {
                nameDisplay.innerText = groupId
                nameDisplay.style.flex = '1'
                nameDisplay.style.display = 'block' // Required for text-indent to function on spans
                nameDisplay.style.whiteSpace = 'nowrap'
                nameDisplay.style.overflow = 'hidden'
                nameDisplay.style.textOverflow = 'clip'
                nameDisplay.style.minWidth = '0'
                
                window.marqueeObserver.observe(nameDisplay)
                
                // Forces manual marquee evaluation because the text change doesn't alter the fixed flex-container width
                setTimeout(() => window.applyMarquee(nameDisplay), 50)
            }
            
            // dynamically syncs the overlapping transform row name to the newly generated Captions_Grp ID
            if (node.getAttr('transformGroupName')) {
                const tRows = document.getElementById('transforms-rows')
                if (tRows) {
                    Array.from(tRows.children).forEach(r => {
                        let isMatch = false
                        try {
                            const cfg = JSON.parse(r.dataset.transformConfig || '{}')
                            if (cfg.id === node.id()) isMatch = true
                        } catch(err) {}
                        
                        if (isMatch) {
                            const rowInput = r.querySelector('input[type="text"]')
                            if (rowInput && rowInput.value !== groupId) {
                                rowInput.value = groupId
                                rowInput.dispatchEvent(new Event('input'))
                            }
                        }
                    })
                }
            } else if (activeNode === node) {
                const editObjName = document.getElementById('edit-object-name')
                if (editObjName) {
                    const capList = node.getAttr('captionsList') || []
                    const activeIdx = node.getAttr('activeCaptionEditIndex') || 0
                    editObjName.value = capList.length > activeIdx ? capList[activeIdx] : groupId
                }
            }
            
            if (typeof appLayers !== 'undefined') {
                appLayers.forEach(layer => {
                    layer.objects.forEach(obj => {
                        if (obj.node === node) {
                            obj.name = groupId
                        }
                    })
                })
            }
            
            if (typeof renderLayersUI === 'function') renderLayersUI()
            if (typeof renderMultiTrackTimeline === 'function') renderMultiTrackTimeline()
        }
    }

    // Helper to package physical Konva attributes for unique row assignment
    const extractStyles = (groupNode) => {
        const innerText = groupNode.findOne('.inner-text') || groupNode
        const textBg = groupNode.findOne('.text-bg')
        return {
            group: {
                x: groupNode.x(), y: groupNode.y(), 
                offsetX: groupNode.offsetX(), offsetY: groupNode.offsetY(),
                width: groupNode.width(), height: groupNode.height()
            },
            text: {
                fill: innerText.fill(), fontSize: innerText.fontSize(), fontFamily: innerText.fontFamily(),
                fontStyle: innerText.fontStyle(), align: innerText.align(), stroke: innerText.stroke(),
                strokeWidth: innerText.strokeWidth(), shadowColor: innerText.shadowColor(), shadowBlur: innerText.shadowBlur(),
                shadowOpacity: innerText.shadowOpacity(), shadowOffsetX: innerText.shadowOffsetX(),
                shadowOffsetY: innerText.shadowOffsetY(), rawShadowBlur: innerText.getAttr('rawShadowBlur'),
                width: innerText.width() // Captures independent width per row!
            },
            bg: textBg ? { fill: textBg.fill(), stroke: textBg.stroke(), strokeWidth: textBg.strokeWidth() } : null
        }
    }

    let activeCaptionEditIndex = node.getAttr('activeCaptionEditIndex') || 0

    const saveCurrentCaptionStyle = () => {
        // Strictly blocks background property overwrites when the text object is not actively selected
        if (typeof activeNode === 'undefined' || activeNode !== node) return
        if (!node.getAttr('captionsGroupName')) return
        
        const styleObj = extractStyles(node)
        const activeRow = rowsContainer.children[activeCaptionEditIndex]
        if (activeRow) activeRow.dataset.styleData = JSON.stringify(styleObj)
        
        let styles = node.getAttr('captionStyles') || []
        styles[activeCaptionEditIndex] = styleObj
        node.setAttr('captionStyles', styles)
    }

    // Connects our global event listener to the active Captions Editor
    if (window._styleSyncListener) document.removeEventListener('textStyleChanged', window._styleSyncListener)
    window._styleSyncListener = saveCurrentCaptionStyle
    document.addEventListener('textStyleChanged', window._styleSyncListener)

    const updateActiveRowVisuals = () => {
        const children = Array.from(rowsContainer.children)
        children.forEach((c, idx) => {
            c.style.borderLeftColor = (idx === activeCaptionEditIndex) ? '#00a8ff' : 'transparent'
        })
    }

    // syncs node data and active text field to new dom order after drag events
    const syncListFromDOM = () => {
        const rows = Array.from(rowsContainer.children)
        const newList = []
        const newStyles = []
        
        rows.forEach((r, index) => {
            // dynamically re-indexes row IDs so if a row is removed, the subsequent rows shift up perfectly
            const panelBlock = r.querySelector('.panel-input')
            if (panelBlock) panelBlock.id = 'captions-row-' + (index + 1)

            const inp = r.querySelector('.panel-input input[type="text"]')
            if (inp) newList.push(inp.value)
            if (r.dataset.styleData) {
                newStyles.push(JSON.parse(r.dataset.styleData))
            } else {
                newStyles.push(extractStyles(node))
            }
        })
        
        node.setAttr('captionsList', newList)
        node.setAttr('captionStyles', newStyles)
        
        // locks active index within bounds if rows are deleted
        if (activeCaptionEditIndex >= newList.length) activeCaptionEditIndex = Math.max(0, newList.length - 1)
        node.setAttr('activeCaptionEditIndex', activeCaptionEditIndex)
        
        if (editTextInput && newList.length > 0) {
            editTextInput.value = newList[activeCaptionEditIndex]
        }
        
        updateActiveRowVisuals()
        updateNodeName()
        
        // Redraws the visual timeline markers whenever a caption is added, deleted, or reordered
        if (typeof renderMultiTrackTimeline === 'function') renderMultiTrackTimeline()
        if (typeof renderTimelineIntervals === 'function') renderTimelineIntervals()
    }

    // handles live drop placement calculations for smooth reordering
    rowsContainer.addEventListener('dragover', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const draggingRow = rowsContainer.querySelector('.dragging-row')
        if (!draggingRow) return
        
        const siblings = [...rowsContainer.querySelectorAll('.captions-list-item:not(.dragging-row)')]
        const nextSibling = siblings.find(sibling => {
            const box = sibling.getBoundingClientRect()
            return e.clientY <= box.top + box.height / 2
        })
        
        if (nextSibling) {
            rowsContainer.insertBefore(draggingRow, nextSibling)
        } else {
            rowsContainer.appendChild(draggingRow)
        }
    })

    if (window._captionSyncListener && editTextInput) {
        editTextInput.removeEventListener('input', window._captionSyncListener)
    }

    // continuously syncs active input to the targeted row in the DOM
    if (editTextInput) {
        window._captionSyncListener = (e) => {
            const val = e.target.value
            const children = rowsContainer.children
            if (children.length > activeCaptionEditIndex) {
                const targetRow = children[activeCaptionEditIndex]
                const textInput = targetRow.querySelector('.panel-input input[type="text"]')
                if (textInput) {
                    textInput.value = val
                    textInput.title = val
                    
                    let list = node.getAttr('captionsList') || []
                    if (list.length > activeCaptionEditIndex) {
                        list[activeCaptionEditIndex] = val
                        node.setAttr('captionsList', list)
                    }
                }
            }

            // dynamically syncs list-item value and timeline block during text edits
            if (typeof appLayers !== 'undefined') {
                appLayers.forEach(l => {
                    l.objects.forEach(o => {
                        if (o.node === node) o.name = val
                    })
                })
            }
            
            // strictly bypasses layer list text update if the object belongs to a group
            if (!node.getAttr('transformGroupName') && !node.getAttr('captionsGroupName')) {
                const activeSpan = document.querySelector('.list-item.active-item .layer-name') || document.querySelector('.list-item.active-item > span')
                if (activeSpan) {
                    activeSpan.innerText = val
                    requestAnimationFrame(() => requestAnimationFrame(() => window.applyMarquee(activeSpan)))
                }
            }
            
            if (typeof renderMultiTrackTimeline === 'function') renderMultiTrackTimeline()
        }
        editTextInput.addEventListener('input', window._captionSyncListener)
    }

    // generates row node equipped with standard html5 drag and drop bindings and a clear button
    const createRow = (val, index, initialStyleObj) => {
        const row = document.createElement('div')
        row.className = 'captions-list-item'
        // Adds margin/padding offsets so the blue highlight border doesn't shift the text laterally
        row.style.cssText = 'display:flex; gap:12px; align-items:center; border-left:2px solid transparent; padding-left:8px; margin-left:-10px; transition:border-color 0.2s;'
        
        if (initialStyleObj) row.dataset.styleData = JSON.stringify(initialStyleObj)

        // Adds native hover hint explaining the edit action
        row.title = 'Double-click to edit text object'
        
        // focuses the main edit input on the specific row when double-clicked
        row.addEventListener('dblclick', (e) => {
            e.stopPropagation()
            const children = Array.from(rowsContainer.children)
            activeCaptionEditIndex = children.indexOf(row)
            node.setAttr('activeCaptionEditIndex', activeCaptionEditIndex)
            
            if (typeof updateActiveRowVisuals === 'function') updateActiveRowVisuals()

            // Automatically jumps the video to the specific caption's start time for previewing
            const video = document.getElementById('main-video')
            if (video) {
                const timings = node.getAttr('captionTimings')
                let trackObj = null
                if (typeof appLayers !== 'undefined') {
                    appLayers.forEach(l => l.objects.forEach(o => { if(o.node === node) trackObj = o }))
                }
                if (trackObj && timings && timings[activeCaptionEditIndex] !== undefined) {
                    const jumpTime = trackObj.startTime + (timings[activeCaptionEditIndex] * (trackObj.endTime - trackObj.startTime))
                    video.currentTime = jumpTime
                    const scrubber = document.getElementById('timeline-scrubber')
                    const progress = document.getElementById('scrubber-progress')
                    if (scrubber && progress) {
                        scrubber.value = jumpTime
                        progress.style.width = (jumpTime / video.duration) * 100 + '%'
                    }
                }
            }

            // Immediately applies the physical styles to the text object before opening the editor
            const st = JSON.parse(row.dataset.styleData || '{}')
            const innerText = node.findOne('.inner-text') || node
            const textBg = node.findOne('.text-bg')
            if (st.text) innerText.setAttrs(st.text)
            if (st.bg && textBg) textBg.setAttrs(st.bg)
            if (st.group) node.setAttrs(st.group)

            openTextEditor(node) // Opens the panel first so it doesn't interrupt the selection

            if (editTextInput) {
                const textInput = row.querySelector('.panel-input input[type="text"]')
                if (textInput) {
                    editTextInput.value = textInput.value
                    
                    // Tiny timeout ensures the panel is fully rendered before selecting the text
                    setTimeout(() => {
                        editTextInput.focus()
                        editTextInput.select()
                    }, 10)
                }
            }
        })
        
        const textBlock = document.createElement('div')
        textBlock.id = `captions-row-${index}`
        textBlock.className = 'panel-input'
        textBlock.style.marginBottom = '0'
        textBlock.style.flex = '1'
        textBlock.style.minWidth = '0'
        textBlock.style.width = '0'
        textBlock.style.height = '32px'
        textBlock.style.boxSizing = 'border-box'
        textBlock.style.display = 'flex'
        textBlock.style.alignItems = 'center'
        textBlock.style.justifyContent = 'space-between'
        textBlock.style.paddingRight = '4px'
        
        const textInput = document.createElement('input')
        textInput.type = 'text'
        textInput.style.background = 'transparent'
        textInput.style.border = 'none'
        textInput.style.outline = 'none'
        textInput.style.color = 'inherit'
        textInput.style.overflow = 'hidden'
        textInput.style.textOverflow = 'ellipsis'
        textInput.style.whiteSpace = 'nowrap'
        textInput.style.flex = '1'
        textInput.style.minWidth = '0'
        textInput.style.fontSize = 'inherit'
        textInput.style.fontFamily = 'inherit'
        textInput.value = val
        // Locks the instructional hover hint directly to the text field
        textInput.title = 'Double-click to edit text object'

        let previousValue = val

        textInput.addEventListener('input', (e) => {
            const children = Array.from(rowsContainer.children)
            if (children.indexOf(row) === activeCaptionEditIndex && editTextInput) {
                editTextInput.value = e.target.value
                editTextInput.dispatchEvent(new Event('input'))
            } else {
                syncListFromDOM()
            }
        })

        textInput.addEventListener('focus', () => {
            textInput.getAnimations().forEach(a => a.cancel())
            textInput.style.textIndent = '0px'
            textInput.style.textOverflow = 'clip'
        })

        textInput.addEventListener('blur', () => {
            if (textInput.value.trim() === '') {
                textInput.value = previousValue
            } else {
                previousValue = textInput.value
            }
            syncListFromDOM()
            window.applyMarquee(textInput)
        })
        
        window.marqueeObserver.observe(textInput)
        setTimeout(() => window.applyMarquee(textInput), 50)

        textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                textInput.blur()
            }
        })
        
        const clearBtn = document.createElement('button')
        clearBtn.id = 'remove-row-btn'
        clearBtn.innerHTML = '×'
        clearBtn.title = 'Remove Caption'
        clearBtn.style.cssText = 'background:transparent; border:none; color:#aaa; font-size:18px; cursor:pointer; width:20px; height:20px; display:flex; align-items:center; justify-content:center; opacity:0.6; padding:0;'
        clearBtn.onmouseover = () => clearBtn.style.opacity = '1'
        clearBtn.onmouseout = () => clearBtn.style.opacity = '0.6'
        clearBtn.onclick = (e) => {
            e.preventDefault()
            e.stopPropagation()
            
            if (rowsContainer.children.length <= 1) {
                if (cancelBtn) cancelBtn.click()
            } else {
                const isActiveRow = row.style.borderLeftColor === 'rgb(0, 168, 255)' || row.style.borderLeftColor === '#00a8ff'
                row.remove()
                
                // shifts focus to remaining sibling instantly to keep object actively editable
                if (isActiveRow) {
                    const remainingRows = Array.from(rowsContainer.children)
                    if (remainingRows.length > 0) {
                        remainingRows[0].click()
                    }
                }
                syncListFromDOM()
            }
        }
        
        textBlock.appendChild(textInput)
        textBlock.appendChild(clearBtn)

        const handle = document.createElement('div')
        handle.className = 'drag-handle'
        handle.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>'
        handle.style.cursor = 'grab'
        handle.style.width = '24px'
        handle.style.display = 'flex'
        handle.style.alignItems = 'center'
        handle.style.justifyContent = 'center'
        handle.style.marginRight = '0'
        handle.style.marginLeft = '0'
        handle.style.opacity = '0.5'

        // restricts drag initiation specifically to the handle to prevent text selection from bubbling
        handle.onmousedown = () => row.draggable = true
        handle.onmouseup = () => row.draggable = false
        
        // safeguards drag cancellation if user clicks but doesn't move
        row.onmouseup = () => row.draggable = false

        row.appendChild(textBlock)
        row.appendChild(handle)

        row.addEventListener('dragstart', (e) => {
            e.stopPropagation()
            row.classList.add('dragging-row')
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', '') 
            setTimeout(() => { row.style.opacity = '0.5' }, 0)
        })

        row.addEventListener('dragend', (e) => {
            e.stopPropagation()
            row.classList.remove('dragging-row')
            row.style.opacity = '1'
            row.draggable = false
            syncListFromDOM()
        })

        return row
    }

    const populateExistingGroups = () => {
        targetSelect.innerHTML = '<option value="" disabled selected>Select existing group...</option>'
        let hasGroups = false
        
        if (typeof appLayers !== 'undefined') {
            appLayers.forEach(layer => {
                if (layer.type === 'text') {
                    layer.objects.forEach(obj => {
                        if (obj.node && obj.node !== node) {
                            const innerText = obj.node.findOne('.inner-text') || obj.node
                            const txt = innerText.text() || ''
                            
                            const opt = document.createElement('option')
                            opt.value = obj.node.getAttr('captionsGroupName') || obj.id
                            opt.innerText = obj.node.getAttr('captionsGroupName') || obj.name
                            opt.dataset.fullText = txt
                            targetSelect.appendChild(opt)
                            hasGroups = true
                        }
                    })
                }
            })
        }
        return hasGroups
    }

    startBtn.onclick = () => {
        const mode = modeSelect.value
        initState.style.display = 'none'
        
        if (mode === 'create') {
            listContainer.style.display = 'flex'
            if (activeHeader) activeHeader.style.display = 'flex'
            
            const generateUniqueGroupId = () => {
                const generateId = () => {
                    const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
                    const numbers = '0123456789'
                    let chars = []
                    for (let i = 0; i < 4; i++) chars.push(letters[Math.floor(Math.random() * letters.length)])
                    for (let i = 0; i < 4; i++) chars.push(numbers[Math.floor(Math.random() * numbers.length)])
                    chars.sort(() => Math.random() - 0.5)
                    return 'Caption_Grp_' + chars.join('')
                }
                let newId = generateId()
                let isUnique = false
                
                while (!isUnique) {
                    isUnique = true
                    if (typeof appLayers !== 'undefined') {
                        appLayers.forEach(layer => {
                            if (layer.type === 'text') {
                                layer.objects.forEach(obj => {
                                    if (obj.node && obj.node.getAttr('captionsGroupName') === newId) {
                                        isUnique = false
                                    }
                                })
                            }
                        })
                    }
                    if (!isUnique) newId = generateId()
                }
                return newId
            }
            
            const groupId = generateUniqueGroupId()
            if (nameDisplay) nameDisplay.innerText = groupId
            
            // stores pre-group layer name natively so cancel can accurately revert
            if (!node.getAttr('originalName')) {
                node.setAttr('originalName', node.name())
            }
            
            const innerText = node.findOne('.inner-text') || node
            const startVal = innerText.text() ? innerText.text() : ''
            
            const currentStyle = extractStyles(node)
            node.setAttr('captionsGroupName', groupId)
            node.setAttr('captionsList', [startVal])
            node.setAttr('captionStyles', [currentStyle])
            
            updateNodeName()
            
            const firstRow = createRow(startVal, 1, currentStyle)
            rowsContainer.appendChild(firstRow)
            
            newCaptionInput.value = ''
            newCaptionInput.focus()
            
            if (typeof updateActiveRowVisuals === 'function') updateActiveRowVisuals()
            
        } else if (mode === 'add') {
            const hasGroups = populateExistingGroups()
            targetSelectWrap.style.display = 'block'
            if (!hasGroups) {
                targetSelect.innerHTML = '<option disabled selected>No other groups found</option>'
            }
        }
    }

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            initState.style.display = 'flex'
            listContainer.style.display = 'none'
            if (activeHeader) activeHeader.style.display = 'none'
            rowsContainer.innerHTML = ''
            
            const tGroup = node.getAttr('transformGroupName')
            const capList = node.getAttr('captionsList') || []
            const firstRowName = capList.length > 0 ? capList[0] : node.getAttr('originalName')
            
            if (firstRowName) {
                let uniqueName = firstRowName
                let counter = 1
                let match = uniqueName.match(/^(.*?)_(\d+)$/)
                let prefix = uniqueName
                if (match) {
                    prefix = match[1]
                    counter = parseInt(match[2], 10)
                }
                let isUnique = false
                while (!isUnique) {
                    isUnique = true
                    if (typeof appLayers !== 'undefined') {
                        appLayers.forEach(layer => layer.objects.forEach(obj => {
                            if (obj.node !== node && (obj.name === uniqueName || (obj.node && obj.node.name() === uniqueName))) {
                                isUnique = false
                            }
                        }))
                    }
                    if (!isUnique) {
                        counter++
                        uniqueName = `${prefix}_${counter}`
                    }
                }

                node.name(uniqueName)
                const innerText = typeof node.findOne === 'function' ? node.findOne('.inner-text') : null
                if (innerText) innerText.text(uniqueName)

                if (typeof appLayers !== 'undefined') {
                    appLayers.forEach(layer => {
                        layer.objects.forEach(obj => {
                            if (obj.node === node) {
                                obj.name = uniqueName
                            }
                        })
                    })
                }
            }
            
            node.setAttr('captionsGroupName', null)
            node.setAttr('captionsList', [])
            node.setAttr('originalName', null)
            
            // Safely diverts active ui state to transform row 1 if an overlapping group existed
            if (tGroup) {
                const tRows = document.getElementById('transforms-rows')
                if (tRows && tRows.children.length > 0) {
                    tRows.children[0].click()
                }
            } else {
                const nClass = node.getClassName()
                const innerText = typeof node.findOne === 'function' ? node.findOne('.inner-text') : null
                
                // opens corresponding editing panel to populate properties container with default values
                if ((nClass === 'Group' && innerText) || nClass === 'Text') {
                    openTextEditor(node)
                } else if (nClass === 'Filter') {
                    openFilterEditor(node)
                } else {
                    openImageEditor(node)
                }
                
                const editObjName = document.getElementById('edit-object-name')
                if (editObjName) editObjName.value = node.name()
            }
            
            if (typeof renderLayersUI === 'function') renderLayersUI()
            if (typeof renderMultiTrackTimeline === 'function') renderMultiTrackTimeline()
        }
    }

    if (backModeBtn) {
        backModeBtn.onclick = () => {
            targetSelectWrap.style.display = 'none'
            initState.style.display = 'flex'
        }
    }

    targetSelect.onchange = () => {
        const selectedValue = targetSelect.value
        
        // Locate target node
        let targetNode = null
        let targetObj = null
        if (typeof appLayers !== 'undefined') {
            appLayers.forEach(layer => {
                if (layer.type === 'text') {
                    layer.objects.forEach(obj => {
                        if (obj.node && (obj.node.getAttr('captionsGroupName') === selectedValue || obj.id === selectedValue)) {
                            targetNode = obj.node
                            targetObj = obj
                        }
                    })
                }
            })
        }
        
        if (targetNode) {
            // Initializes target node as a group if it wasn't already
            if (!targetNode.getAttr('captionsGroupName')) {
                const generateId = () => 'cg_' + Math.random().toString(36).slice(2, 10).padEnd(8, '0')
                const groupId = generateId()
                targetNode.setAttr('captionsGroupName', groupId)
                targetNode.setAttr('originalName', targetObj.name)
                
                const tInnerText = targetNode.findOne('.inner-text') || targetNode
                targetNode.setAttr('captionsList', [tInnerText.text()])
                targetNode.setAttr('captionStyles', [extractStyles(targetNode)]) // Safely isolates origin style
                
                targetObj.name = groupId
                targetNode.name(groupId)
                
                // dynamically syncs the overlapping transform row name to the newly generated Captions_Grp ID
                if (targetNode.getAttr('transformGroupName')) {
                    const tRows = document.getElementById('transforms-rows')
                    if (tRows) {
                        Array.from(tRows.children).forEach(r => {
                            let isMatch = false
                            try {
                                const cfg = JSON.parse(r.dataset.transformConfig || '{}')
                                if (cfg.id === targetNode.id()) isMatch = true
                            } catch(err) {}
                            
                            if (isMatch) {
                                const rowInput = r.querySelector('input[type="text"]')
                                if (rowInput && rowInput.value !== groupId) {
                                    rowInput.value = groupId
                                    rowInput.dispatchEvent(new Event('input'))
                                }
                            }
                        })
                    }
                } else if (activeNode === targetNode) {
                    const editObjName = document.getElementById('edit-object-name')
                    if (editObjName) {
                        const capList = targetNode.getAttr('captionsList') || []
                        const activeIdx = targetNode.getAttr('activeCaptionEditIndex') || 0
                        editObjName.value = capList.length > activeIdx ? capList[activeIdx] : groupId
                    }
                }
            }
            
            // Append current text to target group
            const innerText = node.findOne('.inner-text') || node
            const valToAdd = innerText.text() || ''
            
            let targetList = targetNode.getAttr('captionsList') || []
            targetList.push(valToAdd)
            targetNode.setAttr('captionsList', targetList)
            
            // Safely migrates the unique style data to the new group
            let targetStyles = targetNode.getAttr('captionStyles') || []
            targetStyles.push(extractStyles(node))
            targetNode.setAttr('captionStyles', targetStyles)
            
            // Auto-select the newly added row
            targetNode.setAttr('activeCaptionEditIndex', targetList.length - 1)
            
            // Handle Transform Group cleanup if both were in the same Transform Group
            const tGroup = targetNode.getAttr('transformGroupName')
            if (tGroup && node.getAttr('transformGroupName') === tGroup) {
                let tData = targetNode.getAttr('transformGroupData')
                if (tData) {
                    const nodeKey = Object.keys(tData).find(k => tData[k].id === node.id()) || node.name()
                    if (tData[nodeKey]) {
                        delete tData[nodeKey]
                        if (typeof appLayers !== 'undefined') {
                            appLayers.forEach(layer => layer.objects.forEach(obj => {
                                if (obj.node && obj.node.getAttr('transformGroupName') === tGroup) {
                                    obj.node.setAttr('transformGroupData', tData)
                                }
                            }))
                        }
                    }
                }
                const tRows = document.getElementById('transforms-rows')
                if (tRows) {
                    const rowToRemove = Array.from(tRows.children).find(r => {
                        try { return JSON.parse(r.dataset.transformConfig || '{}').id === node.id() } catch(e) { return false }
                    })
                    if (rowToRemove) rowToRemove.remove()
                }
            }
            
            // Delete the current node
            let currentObjLayer = null
            let currentObj = null
            appLayers.forEach(layer => {
                if (layer.type === 'text') {
                    layer.objects.forEach(obj => {
                        if (obj.node === node) {
                            currentObj = obj
                            currentObjLayer = layer
                        }
                    })
                }
            })
            
            if (currentObj && currentObjLayer) {
                removeObject(currentObjLayer.name, currentObj.id)
            }
            
            // Switch UI focus to the target node
            switchTab('layers-tab')
            openTextEditor(targetNode)
            
            if (typeof renderLayersUI === 'function') renderLayersUI()
            if (typeof renderMultiTrackTimeline === 'function') renderMultiTrackTimeline()
        }
    }

    addCaptionBtn.onclick = () => {
        const val = newCaptionInput.value
        if (!val.trim()) return
        
        let styles = node.getAttr('captionStyles') || []
        const prevStyle = styles.length > 0 ? styles[styles.length - 1] : extractStyles(node)
        
        const nextIdx = rowsContainer.children.length + 1
        rowsContainer.appendChild(createRow(val, nextIdx, prevStyle))
        
        syncListFromDOM()
        
        activeCaptionEditIndex = rowsContainer.children.length - 1
        node.setAttr('activeCaptionEditIndex', activeCaptionEditIndex)
        if (typeof updateActiveRowVisuals === 'function') updateActiveRowVisuals()
        
        if (editTextInput) {
            editTextInput.value = val
            setTimeout(() => {
                editTextInput.focus()
                editTextInput.select()
            }, 10)
        }
        
        newCaptionInput.value = ''
    }
    
    newCaptionInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            addCaptionBtn.click()
        }
    }

    // Restores the visual UI state for nodes that are already captions groups
    const existingGroupId = node.getAttr('captionsGroupName')
    if (existingGroupId) {
        initState.style.display = 'none'
        targetSelectWrap.style.display = 'none'
        listContainer.style.display = 'flex'
        if (activeHeader) activeHeader.style.display = 'flex'
        
        const capList = node.getAttr('captionsList') || []
        const savedStyles = node.getAttr('captionStyles') || []
        
        capList.forEach((val, idx) => {
            // Deeply injects the isolated style object so syncListFromDOM doesn't overwrite it with the active node's style
            const st = savedStyles[idx] || extractStyles(node)
            rowsContainer.appendChild(createRow(val, idx + 1, st))
        })
        
        updateNodeName()
        if (typeof updateActiveRowVisuals === 'function') updateActiveRowVisuals()
    }

    // LISTENS FOR PLAYBACK CHANGES TO SYNC PROPERTIES LIVE
    if (window._playbackSyncListener) document.removeEventListener('captionPlaybackSync', window._playbackSyncListener)
    window._playbackSyncListener = (e) => {
        if (typeof activeNode !== 'undefined' && activeNode === node) {
            const newIdx = e.detail.capIdx
            if (activeCaptionEditIndex !== newIdx) {
                activeCaptionEditIndex = newIdx
                node.setAttr('activeCaptionEditIndex', newIdx)
                updateActiveRowVisuals()
                
                const list = node.getAttr('captionsList') || []
                if (editTextInput && list.length > newIdx) editTextInput.value = list[newIdx]
                
                // Actively pulls the physical canvas properties backwards into the UI sliders so they stay accurate
                const innerText = node.findOne('.inner-text') || node
                
                const fontSizeSlider = document.getElementById('edit-font-size')
                if (fontSizeSlider) fontSizeSlider.value = innerText.fontSize()
                
                const fontFamily = document.getElementById('edit-font-family')
                if (fontFamily) fontFamily.value = innerText.fontFamily() || 'sans-serif'
                
                const fontStyle = document.getElementById('edit-font-style')
                if (fontStyle) fontStyle.value = innerText.fontStyle() || 'normal'
                
                const textAlign = document.getElementById('edit-text-align')
                if (textAlign) textAlign.value = innerText.align() || 'left'
                
                const isShadowOn = innerText.shadowOpacity() > 0
                const shadowToggle = document.getElementById('edit-shadow-toggle')
                if (shadowToggle) {
                    shadowToggle.classList.toggle('shadow-active', isShadowOn)
                    shadowToggle.style.backgroundColor = isShadowOn ? '#00a8ff' : '#34495e'
                }
                const shadowColor = document.getElementById('edit-shadow-color')
                if (shadowColor) shadowColor.value = innerText.shadowColor() || '#000000'
                
                const shadowBlur = document.getElementById('edit-shadow-blur')
                if (shadowBlur) shadowBlur.value = innerText.getAttr('rawShadowBlur') ?? (innerText.shadowBlur() || 0)
                
                const shadowThickness = document.getElementById('edit-shadow-thickness')
                if (shadowThickness) shadowThickness.value = isShadowOn ? Math.round(innerText.shadowOpacity() * 100) : 100

                // Refreshes color picker visually
                if (typeof window.refreshColorPickerUI === 'function') window.refreshColorPickerUI()
            }
        }
    }
    document.addEventListener('captionPlaybackSync', window._playbackSyncListener)
}

