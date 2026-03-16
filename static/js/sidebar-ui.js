import { appLayers, activeNode, setActiveNode, activeLayerId, setActiveLayerId } from './state-manager.js'
import { transformer, confirmSelection, removeObject, removeLayer } from './canvas-engine.js'

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
let isMultiTrackOpen = false

function getTimeParts(totalSeconds) {
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

function formatTime(totalSeconds) {
    const parts = getTimeParts(totalSeconds)
    return `${parts.h}:${parts.m}:${parts.s}:${parts.ms}`
}

function parseTime(timeStr) {
    const parts = timeStr.split(':')
    if (parts.length !== 4) return 0
    const h = parseInt(parts[0], 10) || 0
    const m = parseInt(parts[1], 10) || 0
    const s = parseInt(parts[2], 10) || 0
    const ms = parseInt(parts[3], 10) || 0
    return (h * 3600) + (m * 60) + s + (ms / 1000)
}

function getActiveObj() {
    let found = null
    appLayers.forEach(layer => {
        const obj = layer.objects.find(o => o.node === activeNode)
        if (obj) found = obj
    })
    return found
}

function updateTimePanelUI(activeObj) {
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
        
        if (activeObj.timeLocked) {
            lockIconNode.classList.add('active')
            lockIconNode.title = 'Locked'
            startGroup.classList.add('disabled')
            endGroup.classList.add('disabled')
        } else {
            lockIconNode.classList.remove('active')
            lockIconNode.title = 'Lock Interval'
            startGroup.classList.remove('disabled')
            endGroup.classList.remove('disabled')
        }
    }
}

function updateKonvaZIndex() {
    appLayers.forEach((layer, index) => {
        if (layer.konvaLayer) layer.konvaLayer.setZIndex(index)
    })
}

function updateObjectZIndex(layer) {
    if (!layer || !layer.objects) return
    layer.objects.forEach((obj, index) => {
        if (obj.node) obj.node.setZIndex(index)
    })
}

export function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'))
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'))
    const event = window.event
    if (event && event.target) event.target.classList.add('active')
    document.getElementById(tabId).classList.add('active')
}

export function openTextEditor(node) {
    confirmSelection()
    setActiveNode(node)
    node.draggable(true)
    transformer.nodes([node])
    document.getElementById('edit-text-value').value = node.text()
    document.getElementById('edit-font-size').value = node.fontSize()
    document.getElementById('edit-font-color').value = node.fill()
    renderLayersUI()
}

export function openShapeEditor(node) {
    confirmSelection()
    setActiveNode(node)
    node.draggable(true)
    transformer.nodes([node])
    renderLayersUI()
}

export function openImageEditor(node) {
    confirmSelection()
    setActiveNode(node)
    node.draggable(true)
    transformer.nodes([node])
    renderLayersUI()
}

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

export function renderMultiTrackTimeline() {
    const container = document.getElementById('multi-track-container')
    if (!container || !isMultiTrackOpen) return
    
    container.innerHTML = ''
    const video = document.getElementById('main-video')
    if (!video || !video.duration) return

    appLayers.forEach(layer => {
        if (layer.type === 'base') return
        
        layer.objects.forEach((obj, index) => {
            const lane = document.createElement('div')
            lane.className = 'multi-track-lane'
            
            const startPct = (obj.startTime / video.duration) * 100
            const widthPct = ((obj.endTime - obj.startTime) / video.duration) * 100
            
            const block = document.createElement('div')
            block.className = 'multi-track-block'
            block.style.left = startPct + '%'
            block.style.width = widthPct + '%'
            
            let bgColor = '#00a8ff'
            if (layer.type === 'image') bgColor = '#e1b12c'
            if (layer.type === 'tracking') bgColor = '#9b59b6'
            block.style.backgroundColor = obj.timeLocked ? '#555' : bgColor
            
            const label = document.createElement('div')
            label.className = 'multi-track-label'
            label.innerText = index + 1
            
            block.appendChild(label)
            
            block.onclick = () => {
                if (layer.type === 'text') {
                    switchTab('layers-tab')
                    openTextEditor(obj.node)
                } else if (layer.type === 'tracking') {
                    switchTab('shapes-tab')
                    openShapeEditor(obj.node)
                } else if (layer.type === 'image') {
                    switchTab('layers-tab')
                    openImageEditor(obj.node)
                }
            }
            
            lane.appendChild(block)
            container.appendChild(lane)
        })
    })
}

export function renderTimelineIntervals() {
    const lane = document.getElementById('active-obj-lane')
    if (!lane) return
    
    lane.innerHTML = ''

    const video = document.getElementById('main-video')
    if (!activeNode || !video || !video.duration) return

    const activeObj = getActiveObj()
    if (!activeObj) return

    const startPct = (activeObj.startTime / video.duration) * 100
    const widthPct = ((activeObj.endTime - activeObj.startTime) / video.duration) * 100

    const durationLine = document.createElement('div')
    durationLine.style.position = 'absolute'
    durationLine.style.left = startPct + '%'
    durationLine.style.width = widthPct + '%'
    durationLine.style.height = '6px'
    durationLine.style.top = '50%'
    durationLine.style.transform = 'translateY(-50%)'
    durationLine.style.backgroundColor = activeObj.timeLocked ? '#555' : '#2ecc71'
    durationLine.style.cursor = activeObj.timeLocked ? 'default' : 'grab'
    if (activeObj.timeLocked) durationLine.title = 'Locked'
    
    const startCursor = document.createElement('div')
    startCursor.style.position = 'absolute'
    startCursor.style.left = startPct + '%'
    startCursor.style.width = '4px'
    startCursor.style.height = '100%'
    startCursor.style.top = '0'
    startCursor.style.backgroundColor = activeObj.timeLocked ? '#aaa' : '#fff'
    startCursor.style.cursor = activeObj.timeLocked ? 'default' : 'ew-resize'
    startCursor.style.zIndex = '2'
    startCursor.title = activeObj.timeLocked ? 'Locked' : formatTime(activeObj.startTime)

    const endCursor = document.createElement('div')
    endCursor.style.position = 'absolute'
    endCursor.style.left = (startPct + widthPct) + '%'
    endCursor.style.width = '4px'
    endCursor.style.height = '100%'
    endCursor.style.top = '0'
    endCursor.style.transform = 'translateX(-100%)'
    endCursor.style.backgroundColor = activeObj.timeLocked ? '#aaa' : '#fff'
    endCursor.style.cursor = activeObj.timeLocked ? 'default' : 'ew-resize'
    endCursor.style.zIndex = '2'
    endCursor.title = activeObj.timeLocked ? 'Locked' : formatTime(activeObj.endTime)

    lane.appendChild(durationLine)
    lane.appendChild(startCursor)
    lane.appendChild(endCursor)

    if (activeObj.timeLocked) return

    let isDraggingBlock = false
    let dragMode = null
    let dragStartX = 0
    let initialStart = 0
    let initialEnd = 0
    let duration = 0

    const onMouseDown = (mode) => (e) => {
        e.stopPropagation()
        isDraggingBlock = true
        dragMode = mode
        dragStartX = e.clientX
        initialStart = activeObj.startTime
        initialEnd = activeObj.endTime
        duration = activeObj.endTime - activeObj.startTime
        
        if (mode === 'move') durationLine.style.cursor = 'grabbing'
        
        if (mode === 'start' || mode === 'end') {
            const jumpTime = mode === 'start' ? activeObj.startTime : activeObj.endTime
            video.currentTime = jumpTime
            
            const scrubber = document.getElementById('timeline-scrubber')
            const progress = document.getElementById('scrubber-progress')
            if (scrubber && progress && video.duration) {
                scrubber.value = jumpTime
                progress.style.width = (jumpTime / video.duration) * 100 + '%'
            }
        }
        
        document.addEventListener('mousemove', onCursorDrag)
        document.addEventListener('mouseup', onCursorDrop)
    }

    durationLine.addEventListener('mousedown', onMouseDown('move'))
    startCursor.addEventListener('mousedown', onMouseDown('start'))
    endCursor.addEventListener('mousedown', onMouseDown('end'))

    const onCursorDrag = (e) => {
        if (!isDraggingBlock) return
        
        const rect = lane.getBoundingClientRect()
        const deltaX = e.clientX - dragStartX
        const deltaTime = (deltaX / rect.width) * video.duration

        let newStart = initialStart
        let newEnd = initialEnd

        if (dragMode === 'move') {
            newStart = initialStart + deltaTime
            newEnd = newStart + duration
            if (newStart < 0) {
                newStart = 0
                newEnd = duration
            }
            if (newEnd > video.duration) {
                newEnd = video.duration
                newStart = video.duration - duration
            }
        } else if (dragMode === 'start') {
            newStart = initialStart + deltaTime
            if (newStart < 0) newStart = 0
            if (newStart > activeObj.endTime - 0.25) newStart = activeObj.endTime - 0.25
        } else if (dragMode === 'end') {
            newEnd = initialEnd + deltaTime
            if (newEnd > video.duration) newEnd = video.duration
            if (newEnd < activeObj.startTime + 0.25) newEnd = activeObj.startTime + 0.25
        }

        activeObj.startTime = newStart
        activeObj.endTime = newEnd
        
        const startPct = (newStart / video.duration) * 100
        const widthPct = ((newEnd - newStart) / video.duration) * 100
        
        durationLine.style.left = startPct + '%'
        durationLine.style.width = widthPct + '%'
        startCursor.style.left = startPct + '%'
        endCursor.style.left = (startPct + widthPct) + '%'
        
        startCursor.title = formatTime(newStart)
        endCursor.title = formatTime(newEnd)

        if (dragMode === 'start' || dragMode === 'move') {
            video.currentTime = newStart
        } else if (dragMode === 'end') {
            video.currentTime = newEnd
        }
        
        const scrubber = document.getElementById('timeline-scrubber')
        const progress = document.getElementById('scrubber-progress')
        if (scrubber && progress && video.duration) {
            scrubber.value = video.currentTime
            progress.style.width = (video.currentTime / video.duration) * 100 + '%'
        }
        
        updateTimePanelUI(activeObj)
        
        const isVisible = video.currentTime >= activeObj.startTime && video.currentTime <= activeObj.endTime
        activeObj.node.opacity(isVisible ? 1 : 0)
        renderMultiTrackTimeline()
    }

    const onCursorDrop = () => {
        isDraggingBlock = false
        dragMode = null
        durationLine.style.cursor = 'grab'
        document.removeEventListener('mousemove', onCursorDrag)
        document.removeEventListener('mouseup', onCursorDrop)
        renderTimelineIntervals()
        renderMultiTrackTimeline()
    }
}

export function renderLayersUI() {
    const container = document.getElementById('layers-container')
    
    const textPanel = document.getElementById('text-edit-panel')
    const shapePanel = document.getElementById('shape-edit-panel')
    const imagePanel = document.getElementById('image-edit-panel')
    const timePanel = document.getElementById('time-edit-panel')
    
    if (textPanel) {
        textPanel.style.display = 'none'
        document.getElementById('layers-tab').appendChild(textPanel)
    }
    if (shapePanel) {
        shapePanel.style.display = 'none'
        document.getElementById('shapes-tab').appendChild(shapePanel)
    }
    if (imagePanel) {
        imagePanel.style.display = 'none'
        document.getElementById('layers-tab').appendChild(imagePanel)
    }
    if (timePanel) {
        timePanel.style.display = 'none'
        document.getElementById('layers-tab').appendChild(timePanel)
    }
    
    container.innerHTML = ''

    const reversedLayers = [...appLayers].reverse()

    reversedLayers.forEach(layer => {
        const groupDiv = document.createElement('div')
        groupDiv.className = 'layer-group'
        
        const hasActiveChild = activeNode && layer.objects.some(o => o.node === activeNode)
        const canDragLayer = layer.type !== 'base' && !layer.locked && (!activeNode || hasActiveChild)

        if (canDragLayer) {
            groupDiv.draggable = true
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
            if (layer.type !== 'base') groupDiv.classList.add('drag-over')
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
                    updateKonvaZIndex()
                    renderLayersUI()
                }
            }
        })
        
        const layerHeader = document.createElement('div')
        layerHeader.className = `layer-item ${activeLayerId === layer.id ? 'active' : ''} ${hasActiveChild ? 'active-parent' : ''}`
        layerHeader.onclick = () => selectLayer(layer.id)
        
        const eyeDiv = document.createElement('div')
        eyeDiv.className = `layer-icon ${layer.visible ? 'active' : ''}`
        eyeDiv.innerHTML = eyeIcon
        eyeDiv.onclick = (e) => toggleVisibility(layer.id, e)
        
        const nameSpan = document.createElement('span')
        nameSpan.className = 'layer-name'
        nameSpan.innerText = layer.name

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
                if (input.value.trim() !== '') layer.name = input.value.trim()
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
                }
            }
            layerHeader.appendChild(trashDiv)
        }

        groupDiv.appendChild(layerHeader)

        const reversedObjects = [...layer.objects].reverse()

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
                    itemDiv.draggable = true
                    
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
                    itemDiv.classList.add('drag-over')
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
                                
                                updateObjectZIndex(layer)
                                renderLayersUI()
                            }
                        }
                    }
                })
            }

            const objEye = document.createElement('div')
            objEye.className = `layer-icon small ${obj.visible ? 'active' : ''}`
            objEye.innerHTML = eyeIcon
            objEye.style.marginRight = '5px'
            objEye.style.display = 'inline-flex'
            objEye.onclick = (e) => toggleObjectVisibility(layer.id, obj.id, e)
            itemDiv.appendChild(objEye)

            const label = document.createElement('span')
            label.innerText = obj.name
            label.style.flex = '1'

            label.addEventListener('dblclick', (e) => {
                e.stopPropagation()
                if (layer.type === 'base') return
                
                const input = document.createElement('input')
                input.type = 'text'
                input.value = obj.name
                input.className = 'panel-input'
                input.style.margin = '0 10px'
                input.style.padding = '2px 5px'
                input.style.height = '24px'
                input.style.flex = '1'
                
                itemDiv.replaceChild(input, label)
                input.focus()
                input.select()
                
                const saveName = () => {
                    if (input.value.trim() !== '') obj.name = input.value.trim()
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
                const isEditDisabled = isLocked || activeNode
                const isRemoveDisabled = isLocked
                
                const selectBtn = document.createElement('button')
                selectBtn.innerText = 'Edit'
                selectBtn.className = 'action-btn small-btn'
                
                if (isActiveObj) {
                    selectBtn.disabled = true
                    selectBtn.style.opacity = '0.4'
                    selectBtn.style.cursor = 'default'
                } else if (isEditDisabled) {
                    selectBtn.disabled = true
                    selectBtn.style.opacity = '0.4'
                    selectBtn.style.cursor = 'not-allowed'
                } else {
                    selectBtn.onclick = (e) => {
                        e.stopPropagation()
                        if (layer.type === 'text') {
                            switchTab('layers-tab')
                            openTextEditor(obj.node)
                        } else if (layer.type === 'tracking') {
                            switchTab('shapes-tab')
                            openShapeEditor(obj.node)
                        } else if (layer.type === 'image') {
                            switchTab('layers-tab')
                            openImageEditor(obj.node)
                        }
                    }
                }

                const rmBtn = document.createElement('button')
                rmBtn.innerText = 'X'
                rmBtn.className = 'action-btn small-btn remove-btn'
                
                if (isRemoveDisabled) {
                    rmBtn.disabled = true
                    rmBtn.style.opacity = '0.4'
                    rmBtn.style.cursor = 'not-allowed'
                } else {
                    rmBtn.onclick = (e) => {
                        e.stopPropagation()
                        removeObject(layer.name, obj.id)
                    }
                }
                
                controls.appendChild(selectBtn)
                controls.appendChild(rmBtn)
                itemDiv.appendChild(controls)
            }
            groupDiv.appendChild(itemDiv)

            if (activeNode && activeNode === obj.node) {
                if (layer.type === 'text' && textPanel) {
                    textPanel.style.display = 'block'
                    groupDiv.appendChild(textPanel)
                } else if (layer.type === 'tracking' && shapePanel) {
                    shapePanel.style.display = 'block'
                    groupDiv.appendChild(shapePanel)
                } else if (layer.type === 'image' && imagePanel) {
                    imagePanel.style.display = 'block'
                    groupDiv.appendChild(imagePanel)
                }
                
                if (timePanel) {
                    timePanel.style.display = 'block'
                    groupDiv.appendChild(timePanel)
                }
            }
        })
        
        container.appendChild(groupDiv)
    })

    const creationButtons = ['add-text-btn', 'add-image-btn', 'add-box-btn']
    creationButtons.forEach(id => {
        const btn = document.getElementById(id)
        if (btn) {
            if (activeNode) {
                btn.disabled = true
                btn.style.opacity = '0.4'
                btn.style.cursor = 'not-allowed'
            } else {
                btn.disabled = false
                btn.style.opacity = '1'
                btn.style.cursor = 'pointer'
            }
        }
    })

    const activeObj = getActiveObj()
    if (activeObj) updateTimePanelUI(activeObj)
    renderTimelineIntervals()
    renderMultiTrackTimeline()
}

export function initSidebarBindings() {
    document.getElementById('edit-text-value').addEventListener('input', (e) => {
        if (activeNode && activeNode.getClassName() === 'Text') activeNode.text(e.target.value)
    })
    document.getElementById('edit-font-size').addEventListener('input', (e) => {
        if (activeNode && activeNode.getClassName() === 'Text') activeNode.fontSize(parseInt(e.target.value, 10))
    })
    document.getElementById('edit-font-color').addEventListener('input', (e) => {
        if (activeNode && activeNode.getClassName() === 'Text') activeNode.fill(e.target.value)
    })
    
    document.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('time-segment')) {
            const obj = getActiveObj()
            if (!obj || obj.timeLocked) return

            const video = document.getElementById('main-video')
            if (!video || !video.duration) return

            const segment = e.target
            const group = segment.closest('.time-spinner-group')
            const targetType = group.dataset.target
            const timeType = segment.dataset.type

            const rect = segment.getBoundingClientRect()
            const isIncrement = (e.clientY - rect.top) < (rect.height / 2)

            let delta = 0
            if (timeType === 'h') delta = 3600
            if (timeType === 'm') delta = 60
            if (timeType === 's') delta = 1
            if (timeType === 'ms') delta = 0.05

            if (!isIncrement) delta = -delta

            if (targetType === 'start') {
                let newTime = obj.startTime + delta
                if (newTime < 0) newTime = 0
                
                if (newTime > obj.endTime - 0.25) newTime = obj.endTime - 0.25
                
                obj.startTime = newTime
                
                video.currentTime = newTime
                const scrubber = document.getElementById('timeline-scrubber')
                const progress = document.getElementById('scrubber-progress')
                if (scrubber && progress) {
                    scrubber.value = newTime
                    progress.style.width = (newTime / video.duration) * 100 + '%'
                }
            } else if (targetType === 'end') {
                let newTime = obj.endTime + delta
                if (newTime > video.duration) newTime = video.duration
                
                if (newTime < obj.startTime + 0.25) newTime = obj.startTime + 0.25
                
                obj.endTime = newTime
                
                video.currentTime = newTime
                const scrubber = document.getElementById('timeline-scrubber')
                const progress = document.getElementById('scrubber-progress')
                if (scrubber && progress) {
                    scrubber.value = newTime
                    progress.style.width = (newTime / video.duration) * 100 + '%'
                }
            }

            renderTimelineIntervals()
            updateTimePanelUI(obj)
            renderMultiTrackTimeline()
        }
    })

    document.getElementById('edit-time-lock').addEventListener('click', () => {
        const obj = getActiveObj()
        if (obj) {
            obj.timeLocked = !obj.timeLocked
            updateTimePanelUI(obj)
            renderTimelineIntervals()
        }
    })
    
    const toggleMultiBtn = document.getElementById('toggle-multi-track-btn')
    if (toggleMultiBtn) {
        toggleMultiBtn.addEventListener('click', (e) => {
            isMultiTrackOpen = !isMultiTrackOpen
            e.target.innerText = isMultiTrackOpen ? '▲  Hide All Tracks' : '▼  Show All Tracks'
            document.getElementById('multi-track-container').style.display = isMultiTrackOpen ? 'flex' : 'none'
            if (isMultiTrackOpen) renderMultiTrackTimeline()
        })
    }

    // handles aspect ratio preview overlay, dragging, and visual cropping
    let selectedRatio = null
    let cropBoxW = 0, cropBoxH = 0
    let renderW = 0, renderH = 0
    let offsetX = 0, offsetY = 0
    
    const previewBox = document.getElementById('crop-preview-box')
    const confirmCropBtn = document.getElementById('confirm-crop-btn')
    const videoWrapper = document.getElementById('video-wrapper')
    
    document.querySelectorAll('.ratio-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const video = document.getElementById('main-video')
            if (!video || !video.videoWidth) return
            
            selectedRatio = eval(e.target.dataset.ratio)
            confirmCropBtn.style.display = 'block'
            previewBox.style.display = 'block'
            
            // resets previous clip paths during new preview
            video.style.clipPath = 'none'
            document.getElementById('canvas-container').style.clipPath = 'none'
            
            const vidRect = video.getBoundingClientRect()
            const videoRatio = video.videoWidth / video.videoHeight
            const containerRatio = vidRect.width / vidRect.height
            
            renderW = vidRect.width
            renderH = vidRect.height
            
            if (containerRatio > videoRatio) {
                renderW = renderH * videoRatio
            } else {
                renderH = renderW / videoRatio
            }
            
            offsetX = (vidRect.width - renderW) / 2
            offsetY = (vidRect.height - renderH) / 2
            
            cropBoxW = renderW
            cropBoxH = renderH
            
            if (selectedRatio > videoRatio) {
                cropBoxH = cropBoxW / selectedRatio
            } else {
                cropBoxW = cropBoxH * selectedRatio
            }
            
            previewBox.style.width = cropBoxW + 'px'
            previewBox.style.height = cropBoxH + 'px'
            previewBox.style.left = (offsetX + (renderW - cropBoxW) / 2) + 'px'
            previewBox.style.top = (offsetY + (renderH - cropBoxH) / 2) + 'px'
        })
    })

    // crop box dragging logic
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

            // bounds checking against actual video render dimensions
            if (newLeft < offsetX) newLeft = offsetX
            if (newTop < offsetY) newTop = offsetY
            if (newLeft + cropBoxW > offsetX + renderW) newLeft = offsetX + renderW - cropBoxW
            if (newTop + cropBoxH > offsetY + renderH) newTop = offsetY + renderH - cropBoxH

            previewBox.style.left = newLeft + 'px'
            previewBox.style.top = newTop + 'px'
        })

        document.addEventListener('mouseup', () => {
            isDraggingCrop = false
        })
    }

    // applies visual mask to video and canvas layers
    if (confirmCropBtn) {
        confirmCropBtn.addEventListener('click', () => {
            if (!selectedRatio) return
            
            const video = document.getElementById('main-video')
            const canvasContainer = document.getElementById('canvas-container')
            
            const currentLeft = parseFloat(previewBox.style.left)
            const currentTop = parseFloat(previewBox.style.top)
            
            const topInset = currentTop - offsetY
            const leftInset = currentLeft - offsetX
            const bottomInset = renderH - (topInset + cropBoxH)
            const rightInset = renderW - (leftInset + cropBoxW)

            const topPct = (topInset / renderH) * 100
            const rightPct = (rightInset / renderW) * 100
            const bottomPct = (bottomInset / renderH) * 100
            const leftPct = (leftInset / renderW) * 100
            
            const clipString = `inset(${topPct}% ${rightPct}% ${bottomPct}% ${leftPct}%)`
            video.style.clipPath = clipString
            canvasContainer.style.clipPath = clipString
            
            previewBox.style.display = 'none'
            confirmCropBtn.style.display = 'none'
            selectedRatio = null
        })
    }
}
