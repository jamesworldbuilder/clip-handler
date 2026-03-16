// handles konvajs rendering and object placement
import { video } from './dom-elements.js'
import { appLayers, activeNode, setActiveNode, clearActiveNode } from './state-manager.js'
import { openTextEditor, openShapeEditor, openImageEditor, renderLayersUI, switchTab } from './sidebar-ui.js'

export let stage = null
export let transformer = null

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
}

// drops transformer and disables dragging to lock object
export function confirmSelection() {
    if (activeNode) {
        activeNode.draggable(false)
    }
    if (transformer) {
        transformer.nodes([])
    }
    document.getElementById('text-edit-panel').style.display = 'none'
    document.getElementById('shape-edit-panel').style.display = 'none'
    document.getElementById('image-edit-panel').style.display = 'none'
    clearActiveNode()
    renderLayersUI()
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
    }
}
