// handles konvajs rendering and object placement
import { video } from './dom-elements.js'
import { appLayers, activeNode, setActiveNode, clearActiveNode } from './state-manager.js'
import { openTextEditor, openShapeEditor, openImageEditor, openFilterEditor, renderLayersUI, switchTab } from './sidebar-ui.js'

export let stage = null
export let transformer = null

// global state variables for letterboxing overlay
export let letterboxLayer = null
let bar1 = null
let bar2 = null
export let currentLetterbox = { type: 'none', thickness: 10, color: '#000000' }

// distinct states for previewing vs applying a crop
export let previewCropRatio = null
export let activeCropRatio = null

// updates preview crop state and forces a stage recalculation
export function setCropRatio(ratio) {
    previewCropRatio = ratio
    syncCanvasToVideo()
}

// locks in the previewed aspect ratio to the canvas
export function applyCrop() {
    activeCropRatio = previewCropRatio
    syncCanvasToVideo()
}

// initializes konva stage and attaches transformer
export function initCanvas() {
    const container = document.getElementById('canvas-container')
    container.style.width = video.clientWidth + 'px'
    container.style.height = video.clientHeight + 'px'

    stage = new Konva.Stage({
        container: 'canvas-container',
        width: video.clientWidth,
        height: video.clientHeight
    })

    const mainLayer = new Konva.Layer()
    stage.add(mainLayer)

    transformer = new Konva.Transformer({
        nodes: [],
        keepRatio: false,
        enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
        borderStroke: 'red',
        borderDash: [5, 5]
    })
    mainLayer.add(transformer)
    // snap dimensions immediately on load
    syncCanvasToVideo()
}

// drops transformer and disables dragging to lock object
export function confirmSelection() {
    if (activeNode) {
        activeNode.draggable(false)
    }
    if (transformer) {
        transformer.nodes([])
    }
    
    // Safely moves panels back to the root tab to prevent destruction during UI redraws
    const layersTab = document.getElementById('layers-tab')
    const panels = ['text-edit-panel', 'shape-edit-panel', 'image-edit-panel', 'filter-edit-panel']
    
    panels.forEach(id => {
        const panel = document.getElementById(id)
        if (panel) {
            panel.style.display = 'none'
            if (layersTab) layersTab.appendChild(panel)
        }
    })

    clearActiveNode()
    if (typeof renderLayersUI === 'function') renderLayersUI()
}

// spawns text object in editable state and updates layer state
export function addTextObject() {
    if (activeNode) return
    
    const video = document.getElementById('main-video')
    video.pause()
    document.getElementById('play-pause-btn').innerText = 'Play'
    
    let txtLayerData = appLayers.find(l => l.name === 'Text Layer')
    if (!txtLayerData) {
        const newKonvaLayer = new Konva.Layer()
        stage.add(newKonvaLayer)
        txtLayerData = { id: 'layer_text', name: 'Text Layer', type: 'text', visible: true, locked: false, objects: [], konvaLayer: newKonvaLayer }
        appLayers.push(txtLayerData)
    }

    const newNum = txtLayerData.objects.length + 1
    const defaultName = `Text Object ${newNum}`
    const defaultText = `New Text ${newNum}`

    const textNode = new Konva.Text({
        text: defaultText,
        fontSize: 48,
        fontFamily: 'sans-serif',
        fill: '#ffffff',
        draggable: true,
        name: defaultName
    })
    
    textNode.x((stage.width() / 2) - (textNode.width() / 2))
    textNode.y((stage.height() / 2) - (textNode.height() / 2))

    // changes cursor to indicate node is draggable
    textNode.on('mouseenter', () => {
        stage.container().style.cursor = 'move'
    })
    
    // restores default cursor when pointer leaves node area
    textNode.on('mouseleave', () => {
        stage.container().style.cursor = 'default'
    })

    txtLayerData.konvaLayer.add(textNode)
    const objId = 'text_' + Date.now()

    // locks default start time to exact playhead millisecond
    const currentT = video.currentTime || 0
    
    txtLayerData.objects.push({ 
        id: objId, 
        name: defaultName, 
        node: textNode, 
        visible: true, 
        locked: false,
        startTime: currentT,
        endTime: currentT + 0.25,
        timeLocked: false
    })
    
    switchTab('layers-tab')
    openTextEditor(textNode)
}

// spawns tracking box in editable state and updates layer state
export function addShapeObject() {
    if (activeNode) return

    const video = document.getElementById('main-video')
    video.pause()
    document.getElementById('play-pause-btn').innerText = 'Play'
    
    let trackLayerData = appLayers.find(l => l.name === 'Tracking Layer')
    if (!trackLayerData) {
        const newKonvaLayer = new Konva.Layer()
        stage.add(newKonvaLayer)
        trackLayerData = { id: 'layer_tracking', name: 'Tracking Layer', type: 'tracking', visible: true, locked: false, objects: [], konvaLayer: newKonvaLayer }
        appLayers.push(trackLayerData)
    }

    const newNum = trackLayerData.objects.length + 1
    const defaultName = `Target Box ${newNum}`

    const boxNode = new Konva.Rect({
        width: 150,
        height: 150,
        stroke: 'red',
        strokeWidth: 3,
        draggable: true,
        name: defaultName
    })

    boxNode.x((stage.width() / 2) - (boxNode.width() / 2))
    boxNode.y((stage.height() / 2) - (boxNode.height() / 2))

    // changes cursor to indicate node is draggable
    boxNode.on('mouseenter', () => {
        stage.container().style.cursor = 'move'
    })
    
    // restores default cursor when pointer leaves node area
    boxNode.on('mouseleave', () => {
        stage.container().style.cursor = 'default'
    })

    trackLayerData.konvaLayer.add(boxNode)
    const objId = 'shape_' + Date.now()

    // locks default start time to exact playhead millisecond
    const currentT = video.currentTime || 0

    trackLayerData.objects.push({ 
        id: objId, 
        name: defaultName, 
        node: boxNode, 
        visible: true, 
        locked: false,
        startTime: currentT,
        endTime: currentT + 0.25,
        timeLocked: false 
    })
    
    openShapeEditor(boxNode)
}

// spawns image object in editable state and updates layer state
export function addImageObject() {
    if (activeNode) return

    const video = document.getElementById('main-video')
    video.pause()
    document.getElementById('play-pause-btn').innerText = 'Play'
    
    let imgLayerData = appLayers.find(l => l.name === 'Image Layer')
    if (!imgLayerData) {
        const newKonvaLayer = new Konva.Layer()
        stage.add(newKonvaLayer)
        imgLayerData = { id: 'layer_image', name: 'Image Layer', type: 'image', visible: true, locked: false, objects: [], konvaLayer: newKonvaLayer }
        appLayers.push(imgLayerData)
    }

    const newNum = imgLayerData.objects.length + 1
    const defaultName = `Image Object ${newNum}`

    const colors = ['#ff0055', '#00a8ff', '#f1c40f', '#9b59b6']
    const randColor = colors[Math.floor(Math.random() * colors.length)]

    const imgNode = new Konva.Circle({
        radius: 60,
        fill: randColor,
        draggable: true,
        name: defaultName
    })
    
    imgNode.x(stage.width() / 2)
    imgNode.y(stage.height() / 2)

    // changes cursor to indicate node is draggable
    imgNode.on('mouseenter', () => {
        stage.container().style.cursor = 'move'
    })
    
    // restores default cursor when pointer leaves node area
    imgNode.on('mouseleave', () => {
        stage.container().style.cursor = 'default'
    })

    imgLayerData.konvaLayer.add(imgNode)
    const objId = 'image_' + Date.now()

    // locks default start time to exact playhead millisecond
    const currentT = video.currentTime || 0

    imgLayerData.objects.push({ 
        id: objId, 
        name: defaultName, 
        node: imgNode, 
        visible: true, 
        locked: false,
        startTime: currentT,
        endTime: currentT + 0.25,
        timeLocked: false 
    })
    
    switchTab('layers-tab')
    openImageEditor(imgNode)
}

// spawns full canvas filter object and updates layer state
export function addFilterObject() {
    if (activeNode) return

    const video = document.getElementById('main-video')
    video.pause()
    document.getElementById('play-pause-btn').innerText = 'Play'
    
    let filterLayerData = appLayers.find(l => l.name === 'Filter Layer')
    if (!filterLayerData) {
        const newKonvaLayer = new Konva.Layer()
        stage.add(newKonvaLayer)
        
        // forces letterboxing layer to render above filter layer
        if (letterboxLayer) letterboxLayer.moveToTop()

        filterLayerData = { id: 'layer_filter', name: 'Filter Layer', type: 'filter', visible: true, locked: false, objects: [], konvaLayer: newKonvaLayer }
        appLayers.push(filterLayerData)
    }

    const newNum = filterLayerData.objects.length + 1
    const defaultName = `Filter ${newNum}`

    // configures konva rectangle as a transparent timeline proxy
    const filterNode = new Konva.Rect({
        x: 0,
        y: 0,
        width: stage.width(),
        height: stage.height(),
        fill: 'transparent',
        listening: false,
        draggable: false,
        name: defaultName
    })

    // defaults to none
    filterNode.setAttr('filterType', 'none')
    filterLayerData.konvaLayer.add(filterNode)
    const objId = 'filter_' + Date.now()
    filterNode.id(objId)

    // spans interval from absolute zero to end of video file
    const startT = 0
    const endT = video.duration && !isNaN(video.duration) ? video.duration : 100 

    filterLayerData.objects.push({ 
        id: objId, 
        name: defaultName, 
        node: filterNode, 
        visible: true, 
        locked: false,
        startTime: startT,
        endTime: endT,
        timeLocked: false 
    })
    
    switchTab('layers-tab')
    
    // executes native module function to bypass window binding
    openFilterEditor(filterNode)
}

// handles targeted object destruction and layer cleanup
export function removeObject(layerName, objId) {
    const layerIdx = appLayers.findIndex(l => l.name === layerName)
    if (layerIdx > -1) {
        const layer = appLayers[layerIdx]
        const objIdx = layer.objects.findIndex(o => o.id === objId)
        if (objIdx > -1) {
            const obj = layer.objects[objIdx]
            if (obj.node) {
                obj.node.destroy()
                if (layer.konvaLayer) layer.konvaLayer.draw()
            }
            layer.objects.splice(objIdx, 1)
            
            if (layer.objects.length === 0 && layer.type !== 'base') {
                if (layer.konvaLayer) layer.konvaLayer.destroy()
                appLayers.splice(layerIdx, 1)
            }
            
            confirmSelection()
            renderLayersUI()
            
            // Forces video to drop the CSS filter when the object is deleted
            const video = document.getElementById('main-video')
            if (video) video.dispatchEvent(new Event('timeupdate'))
        }
    }
}

// destroys specified layer and all child objects
export function removeLayer(layerId) {
    const layerIdx = appLayers.findIndex(l => l.id === layerId)
    if (layerIdx > -1) {
        const layer = appLayers[layerIdx]
        if (layer.konvaLayer) layer.konvaLayer.destroy()
        appLayers.splice(layerIdx, 1)
        confirmSelection()
        renderLayersUI()
        
        // Forces video to drop the CSS filters when the entire layer is deleted
        const video = document.getElementById('main-video')
        if (video) video.dispatchEvent(new Event('timeupdate'))
    }
}

// calculates responsive bounding box and snaps canvas directly to rendered pixels
export function syncCanvasToVideo() {
    const video = document.getElementById('main-video')
    const canvasContainer = document.getElementById('canvas-container')
    const cropBox = document.getElementById('crop-preview-box')

    if (!video || !video.videoWidth) return

    // 1. Calculate native base dimensions (the physical space the video takes up)
    const videoRatio = video.videoWidth / video.videoHeight
    const elementRatio = video.clientWidth / video.clientHeight

    let baseRenderWidth, baseRenderHeight

    if (elementRatio > videoRatio) {
        baseRenderHeight = video.clientHeight
        baseRenderWidth = baseRenderHeight * videoRatio
    } else {
        baseRenderWidth = video.clientWidth
        baseRenderHeight = baseRenderWidth / videoRatio
    }

    // 2. Apply APPLIED crop ratio bounding box limits (for canvas and mask)
    let finalRenderWidth = baseRenderWidth
    let finalRenderHeight = baseRenderHeight

    if (activeCropRatio !== null) {
        const currentRatio = baseRenderWidth / baseRenderHeight

        if (currentRatio > activeCropRatio) {
            // Native video is wider than the crop target -> constrain by height
            finalRenderHeight = baseRenderHeight
            finalRenderWidth = finalRenderHeight * activeCropRatio
        } else {
            // Native video is taller than the crop target -> constrain by width
            finalRenderWidth = baseRenderWidth
            finalRenderHeight = finalRenderWidth / activeCropRatio
        }
    }

    // 3. Center the applied canvas perfectly within the video element
    const offsetX = (video.clientWidth - finalRenderWidth) / 2
    const offsetY = (video.clientHeight - finalRenderHeight) / 2

    if (canvasContainer) {
        canvasContainer.style.width = `${finalRenderWidth}px`
        canvasContainer.style.height = `${finalRenderHeight}px`
        canvasContainer.style.left = `${offsetX}px`
        canvasContainer.style.top = `${offsetY}px`

        // strips dynamic clip-path values via important flag
        canvasContainer.style.setProperty('clip-path', 'none', 'important')
        canvasContainer.style.setProperty('-webkit-clip-path', 'none', 'important')
    }

    // resizes the actual Konva stage instance to match the APPLIED crop
    if (stage) {
        stage.width(finalRenderWidth)
        stage.height(finalRenderHeight)
    }

    // Force all filter nodes to dynamically match the new stage dimensions
    appLayers.forEach(layer => {
        if (layer.type === 'filter') {
            layer.objects.forEach(obj => {
                if (obj.node) {
                    obj.node.width(finalRenderWidth)
                    obj.node.height(finalRenderHeight)
                }
            })
        }
    })

    // 4. MASK THE VIDEO using a robust solid blackout box-shadow
    if (video) {
        video.style.clipPath = 'none' 
    }
    
    let blackoutMask = document.getElementById('applied-crop-mask')
    if (!blackoutMask && canvasContainer) {
        blackoutMask = document.createElement('div')
        blackoutMask.id = 'applied-crop-mask'
        blackoutMask.style.position = 'absolute'
        blackoutMask.style.boxShadow = '0 0 0 9999px #000'
        blackoutMask.style.pointerEvents = 'none'
        blackoutMask.style.zIndex = '1' // places mask above the video, but below the canvas interactions
        canvasContainer.parentNode.insertBefore(blackoutMask, canvasContainer)
    }

    if (blackoutMask) {
        if (activeCropRatio !== null) {
            blackoutMask.style.display = 'block'
            blackoutMask.style.width = `${finalRenderWidth}px`
            blackoutMask.style.height = `${finalRenderHeight}px`
            blackoutMask.style.left = `${offsetX}px`
            blackoutMask.style.top = `${offsetY}px`
        } else {
            blackoutMask.style.display = 'none'
        }
    }

    // 5. Calculate PREVIEW crop boundary box
    let previewWidth = baseRenderWidth
    let previewHeight = baseRenderHeight

    if (previewCropRatio !== null) {
        const currentRatio = baseRenderWidth / baseRenderHeight

        if (currentRatio > previewCropRatio) {
            previewHeight = baseRenderHeight
            previewWidth = previewHeight * previewCropRatio
        } else {
            previewWidth = baseRenderWidth
            previewHeight = previewWidth / previewCropRatio
        }
    }

    // position and size the preview boundary box
    if (cropBox) {
        const previewOffsetX = (video.clientWidth - previewWidth) / 2
        const previewOffsetY = (video.clientHeight - previewHeight) / 2
        
        cropBox.style.width = `${previewWidth}px`
        cropBox.style.height = `${previewHeight}px`
        cropBox.style.left = `${previewOffsetX}px`
        cropBox.style.top = `${previewOffsetY}px`
        
        // hide the preview box if the crop has already been applied
        if (previewCropRatio !== null && previewCropRatio !== activeCropRatio) {
            cropBox.style.display = 'block'
        } else {
            cropBox.style.display = 'none'
        }
    }

    // recalculates overlay bars to match new stage dimensions
    if (currentLetterbox && currentLetterbox.type !== 'none') {
        applyLetterbox(currentLetterbox.type, currentLetterbox.thickness, currentLetterbox.color)
    }
}

// reconstructs letterboxing layer mapped to exact stage dimensions
export function applyLetterbox(type, thicknessPct, color) {
    if (!stage) return

    currentLetterbox = { type, thickness: Number(thicknessPct), color }

    if (letterboxLayer) {
        letterboxLayer.destroy()
        letterboxLayer = null
    }

    if (type === 'none') return

    letterboxLayer = new Konva.Layer()
    stage.add(letterboxLayer)
    letterboxLayer.moveToTop()

    const w = stage.width()
    const h = stage.height()

    const bar1 = new Konva.Rect({ fill: color, listening: false })
    const bar2 = new Konva.Rect({ fill: color, listening: false })

    if (type === 'horizontal') {
        const barHeight = Math.ceil(h * (currentLetterbox.thickness / 100))
        bar1.setAttrs({ x: 0, y: 0, width: w, height: barHeight })
        bar2.setAttrs({ x: 0, y: h - barHeight, width: w, height: barHeight })
    } else if (type === 'vertical') {
        const barWidth = Math.ceil(w * (currentLetterbox.thickness / 100))
        bar1.setAttrs({ x: 0, y: 0, width: barWidth, height: h })
        bar2.setAttrs({ x: w - barWidth, y: 0, width: barWidth, height: h })
    }

    letterboxLayer.add(bar1)
    letterboxLayer.add(bar2)
    letterboxLayer.draw()
}

// natively forces system overlays to absolute top of konva stage to bypass circular import failures
export function forceSystemOverlaysToTop() {
    if (typeof transformer !== 'undefined' && transformer && transformer.getLayer()) {
        transformer.getLayer().moveToTop()
    }
    if (typeof letterboxLayer !== 'undefined' && letterboxLayer) {
        letterboxLayer.moveToTop()
    }
}
