// handles konvajs rendering and object placement
import * as DOM from './dom-elements.js'
import { appLayers, activeNode, setActiveNode, clearActiveNode } from './state-manager.js'
import { openTextEditor, openShapeEditor, openImageEditor, openFilterEditor, renderLayersUI, switchTab, resetTrackingUI } from './sidebar-ui.js'

export let stage = null
export let transformer = null

// global state variables for letterboxing overlay
export let letterboxLayer = null
export let gridLayer = null
let bar1 = null
let bar2 = null
export let currentLetterbox = { type: 'none', thickness: 10, color: '#000000' }

// distinct states for previewing vs applying a crop
export let previewCropRatio = null
export let activeCropRatio = null

// state variables to hold the physical location of the crop
export let activeCropLeftPct = null
export let activeCropTopPct = null

// strictly generates 9-digit alphanumeric ids for pristine json formatting
const generateId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let res = ''
    for (let i = 0; i < 9; i++) res += chars[Math.floor(Math.random() * chars.length)]
    return res
}

// updates preview crop state and forces a stage recalculation
export function setCropRatio(ratio) {
    previewCropRatio = ratio
    syncCanvasToVideo()
}

// locks in the previewed aspect ratio and physical coordinates to the canvas
export function applyCrop(leftPct, topPct) {
    activeCropRatio = previewCropRatio
    
    // Saves the dragged position as resize-proof percentages
    if (leftPct !== undefined && topPct !== undefined) {
        activeCropLeftPct = leftPct
        activeCropTopPct = topPct
    }
    
    syncCanvasToVideo()
}

// initializes konva stage and attaches transformer
export function initCanvas() {
    const container = document.getElementById('canvas-container')
    container.style.width = DOM.video.clientWidth + 'px'
    container.style.height = DOM.video.clientHeight + 'px'

    stage = new Konva.Stage({
        container: 'canvas-container',
        width: DOM.video.clientWidth,
        height: DOM.video.clientHeight
    })

    const mainLayer = new Konva.Layer()
    stage.add(mainLayer)
    
    gridLayer = new Konva.Layer({ listening: false })
    stage.add(gridLayer)

    transformer = new Konva.Transformer({
        nodes: [],
        keepRatio: false,
        enabledAnchors: ['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left'],
        borderStroke: 'red',
        borderDash: [5, 5],
        padding: 8, // ensures transformer boundaries comfortably clear the object
        centeredScaling: true, // enforces symmetrical scaling around the center point
        boundBoxFunc: (oldBox, newBox) => {
            const activeNode = transformer.nodes()[0]
            if (!activeNode || !stage) return newBox

            // completely bypasses ALL dimension and boundary checks if the user is actively rotating the object
            if (transformer.getActiveAnchor() === 'rotater') {
                return newBox
            }

            // bypasses dimension checks for rotation operations
            if (oldBox.rotation !== newBox.rotation) {
                return newBox
            }

            const maxW = stage.width()
            const maxH = stage.height()
            let minW = 20
            let minH = 20
            const pad = 16 // offsets boundary calculations to account for konva transformer padding

            // calculates exact unscaled default dimensions dynamically
            if (activeNode.name().startsWith('Target_')) {
                minW = 150 + pad
                minH = 150 + pad
            } else if (activeNode.getClassName() === 'Circle') {
                minW = (activeNode.radius() * 2) + pad
                minH = (activeNode.radius() * 2) + pad
            } else if (typeof activeNode.findOne === 'function' && activeNode.findOne('.inner-text')) {
                // aligns minimum boundaries with default dimensions in transform panel
                minW = 20 + pad
                minH = 20 + pad
            }

            // safely relies on konva boundary logic by rejecting new coordinates instead of migrating origin offsets
            if (newBox.width < minW || newBox.height < minH || newBox.width > maxW || newBox.height > maxH) {
                return oldBox
            }

            // restricts mathematical boundaries of transformer to physical canvas dimensions
            if (
                newBox.x < 0 ||
                newBox.y < 0 ||
                newBox.x + newBox.width > maxW ||
                newBox.y + newBox.height > maxH
            ) {
                return oldBox
            }

            return newBox
        }
    })

    // manually tracks time between mousedown events to bypass konvajs drag suppression of native dblclick
    let lastRotaterClick = 0
    transformer.on('mousedown touchstart', (e) => {
        const targetName = typeof e.target.name === 'function' ? e.target.name() : ''
        if (targetName === 'rotater' || targetName === '_rotater' || targetName.includes('rotater')) {
            const now = Date.now()
            if (now - lastRotaterClick < 350) {
                const activeNode = transformer.nodes()[0]
                if (activeNode) {
                    transformer.stopTransform() // strictly halts the active drag state to prevent boundary conflicts
                    activeNode.rotation(0)
                    transformer.forceUpdate()
                    if (activeNode.getLayer()) {
                        activeNode.getLayer().batchDraw()
                    }
                }
            }
            lastRotaterClick = now
        }
    })

    // perfectly URL encoded SVG string without spaces to prevent browser CSS parsing failures
    const rotateCursor = `url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='18'%20height='18'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='black'%20stroke-width='2'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='M21.5%202v6h-6'%20stroke='white'%20stroke-width='4'/%3E%3Cpath%20d='M21.34%2015.57a10%2010%200%201%201-.92-12.28l-3.16%203.44'%20stroke='white'%20stroke-width='4'/%3E%3Cpath%20d='M21.5%202v6h-6'/%3E%3Cpath%20d='M21.34%2015.57a10%2010%200%201%201-.92-12.28l-3.16%203.44'/%3E%3C/svg%3E") 9 9, auto`

    // Konva applies default cursors to the inner content div so we target that exact element with priority
    transformer.on('mouseover mousemove', (e) => {
        const targetName = typeof e.target.name === 'function' ? e.target.name() : ''
        if (targetName === 'rotater' || targetName === '_rotater' || targetName.includes('rotater')) {
            if (stage && stage.content) {
                stage.content.style.setProperty('cursor', rotateCursor, 'important')
            }
        }
    })

    transformer.on('mouseout', (e) => {
        const targetName = typeof e.target.name === 'function' ? e.target.name() : ''
        if (targetName === 'rotater' || targetName === '_rotater' || targetName.includes('rotater')) {
            if (stage && stage.content) {
                // strips out forced custom cursor so konva regains control of the other drag handles
                stage.content.style.removeProperty('cursor')
            }
        }
    })

    // strictly locks absolute center coordinates during scaling to prevent mathematical drift
    transformer.on('transformstart', () => {
        const node = transformer.nodes()[0]
        if (node) {
            node.setAttr('lockX', node.x())
            node.setAttr('lockY', node.y())
        }
    })

    transformer.on('transform', () => {
        const node = transformer.nodes()[0]
        if (node && node.getAttr('lockX') !== undefined) {
            node.x(node.getAttr('lockX'))
            node.y(node.getAttr('lockY'))
        }
    })

    mainLayer.add(transformer)
    // snaps dimensions immediately on load
    syncCanvasToVideo()
}

// drops transformer and disables dragging to lock object
export function confirmSelection() {
    if (activeNode) {
        activeNode.draggable(false)
        
        // always hides the green static crosshair when an object is deselected
        if (typeof activeNode.findOne === 'function') {
            const reticle = activeNode.findOne('.dof-static-reticle')
            if (reticle) {
                reticle.visible(false)
                if (activeNode.getLayer()) activeNode.getLayer().batchDraw()
            }
        }
    }
    if (transformer) {
        transformer.nodes([])
    }
    
    // Safely moves panels back to the root tab to prevent destruction during UI redraws
    const layersTab = document.getElementById('layers-tab')
    const panels = ['text-edit-panel', 'image-edit-panel', 'filter-edit-panel', 'time-edit-panel']
    
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
    if (activeNode) confirmSelection() 
    
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

    const newNum = appLayers.find(l => l.type === 'text').objects.length + 1
    const defaultText = `New_Text_${newNum}`
    const defaultName = defaultText // syncs layer list-item name natively with default text value
    
    // instantiates inner text first to measure dimensions dynamically
    const innerTextNode = new Konva.Text({
        text: defaultText,
        fontSize: 28,
        fontFamily: 'sans-serif',
        fill: '#ffffff',
        fontStyle: 'normal',
        align: 'left',
        verticalAlign: 'top',
        stroke: 'transparent',
        strokeWidth: 0,
        shadowColor: '#000000',
        shadowBlur: 0,
        rawShadowBlur: -50,
        shadowOffsetX: -2, 
        shadowOffsetY: 2,  
        shadowOpacity: 0, 
        name: 'inner-text'
    })

    const measuredWidth = innerTextNode.width()
    const measuredHeight = innerTextNode.height()

    // groups text and background rect to enable independent scaling and fill colors
    // centers origin directly on the group explicitly to support accurate native rotation
    const textNode = new Konva.Group({
        draggable: false, // Locked by default
        name: defaultName,
        width: measuredWidth,
        height: measuredHeight,
        offsetX: measuredWidth / 2,
        offsetY: measuredHeight / 2
    })
    
    const bgRect = new Konva.Rect({
        width: measuredWidth,
        height: measuredHeight,
        fill: 'transparent',
        stroke: 'transparent',
        strokeWidth: 0,
        name: 'text-bg'
    })
    
    innerTextNode.width(measuredWidth)
    
    const reticle = new Konva.Group({
        x: measuredWidth / 2,
        y: measuredHeight / 2,
        name: 'dof-static-reticle',
        visible: false,
        listening: false
    })
    reticle.add(new Konva.Circle({ radius: 20, fill: 'transparent' }))
    reticle.add(new Konva.Line({ points: [-10, 0, 10, 0], stroke: '#2ecc71', strokeWidth: 2 }))
    reticle.add(new Konva.Line({ points: [0, -10, 0, 10], stroke: '#2ecc71', strokeWidth: 2 }))
    reticle.add(new Konva.Circle({ radius: 3, fill: '#2ecc71' }))

    textNode.add(bgRect)
    textNode.add(reticle) // Placed before text so the green crosshair renders beneath the string
    textNode.add(innerTextNode)
    
    textNode.x(stage.width() / 2)
    textNode.y(stage.height() / 2)

    // cursor only changes to grab if the node is actively editable
    textNode.on('mouseenter', () => {
        if (textNode.draggable() && stage) {
            stage.container().style.cursor = 'move'
        }
    })
    
    textNode.on('mouseleave', () => {
        if (stage) stage.container().style.cursor = 'default'
    })

    // maps transform scales back to width and height coordinates while maintaining physical offset center
    textNode.on('transform', () => {
        // safely ignores scale recalculations to prevent pixel erosion if the user is only rotating the object
        if (transformer && transformer.getActiveAnchor() === 'rotater') return

        const scaleX = Math.abs(textNode.scaleX())
        const scaleY = Math.abs(textNode.scaleY())
        
        const oldW = textNode.width()
        const oldH = textNode.height()
        const newW = oldW * scaleX
        const newH = oldH * scaleY

        // digests scale transforms directly into physical dimensions
        // integrates natively with konva's anchor locking offsets
        textNode.setAttrs({
            width: newW,
            height: newH,
            scaleX: 1,
            scaleY: 1,
            offsetX: newW / 2,
            offsetY: newH / 2
        })
        
        bgRect.setAttrs({ width: newW, height: newH })
        // locks width to boundary box but leaves height dynamic to permanently solve the bottom-drop glitch
        innerTextNode.setAttrs({ width: newW })
        
        const r = textNode.findOne('.dof-static-reticle')
        if (r) {
            r.x(newW / 2)
            r.y(newH / 2)
        }
    })

    txtLayerData.konvaLayer.add(textNode)
    const objId = 'text_' + generateId()

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

export function addShapeObject() {
    if (activeNode) confirmSelection() // Clears bird selection to allow new object creation

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

    // configures new tracking layer
    const newNum = appLayers.find(l => l.type === 'tracking').objects.length + 1
    const defaultName = `Target_${newNum}`

    // 1. create a group instead of a single rect
    const boxGroup = new Konva.Group({
        draggable: false, // locked by default
        name: defaultName,
        width: 150,
        height: 150,
        offsetX: 75,
        offsetY: 75
    })

    // 2. Add the Target Rectangle
    const boxRect = new Konva.Rect({
        width: 150,
        height: 150,
        stroke: '#9b59b6', 
        strokeWidth: 2,    
        dash: [5, 5],      
        name: 'target-rect'
    })

    // spawns red crosshair reticle in absolute center of initial box
    const reticleGroup = new Konva.Group({
        x: 75,
        y: 75,
        name: 'target-reticle'
    })
    
    // injects transparent hitbox for easier grabbing
    reticleGroup.add(new Konva.Circle({ radius: 20, fill: 'transparent' }))
    reticleGroup.add(new Konva.Circle({ radius: 20, stroke: '#f1c40f', strokeWidth: 1.5, dash: [4, 4], name: 'sample-area-circle', visible: false }))
    reticleGroup.add(new Konva.Line({ points: [-10, 0, 10, 0], stroke: 'red', strokeWidth: 2 }))
    reticleGroup.add(new Konva.Line({ points: [0, -10, 0, 10], stroke: 'red', strokeWidth: 2 }))
    reticleGroup.add(new Konva.Circle({ radius: 3, fill: 'red' }))

    // 3. Add the built-in Konva Label (Hidden until confirmed)
    const boxLabel = new Konva.Label({
        x: -2,
        y: -18,
        name: 'target-label',
        visible: false 
    })
    
    boxLabel.add(new Konva.Tag({
        fill: '#9b59b6',
        cornerRadius: [4, 4, 0, 0]
    }))
    
    boxLabel.add(new Konva.Text({
        text: defaultName,
        fontSize: 10,
        padding: 4,
        fill: 'white',
        fontStyle: 'bold',
        name: 'target-text'
    }))

    boxGroup.add(boxRect)
    boxGroup.add(reticleGroup)
    boxGroup.add(boxLabel)

    // centers group perfectly so x and y align with the offset origin
    boxGroup.x(stage.width() / 2)
    boxGroup.y(stage.height() / 2)

    boxGroup.on('mouseenter', () => {
        stage.container().style.cursor = boxGroup.draggable() ? 'move' : 'default'
    })
    
    boxGroup.on('mouseleave', () => {
        stage.container().style.cursor = 'default'
    })

    trackLayerData.konvaLayer.add(boxGroup)
    const objId = 'shape_' + generateId()

    const currentT = video.currentTime || 0

    trackLayerData.objects.push({ 
        id: objId, 
        name: defaultName, 
        node: boxGroup, 
        visible: true, 
        locked: false,
        startTime: currentT,
        endTime: currentT + 0.25,
        timeLocked: false 
    })
    
    openShapeEditor(boxGroup)
}

export function addBasicShapeObject() {
    if (activeNode) confirmSelection()

    const video = document.getElementById('main-video')
    if (video) video.pause()
    const playBtn = document.getElementById('play-pause-btn')
    if (playBtn) playBtn.innerText = 'Play'
    
    let imgLayerData = appLayers.find(l => l.name === 'Image Layer')
    if (!imgLayerData) {
        const newKonvaLayer = new Konva.Layer()
        stage.add(newKonvaLayer)
        imgLayerData = { id: 'layer_image', name: 'Image Layer', type: 'image', visible: true, locked: false, objects: [], konvaLayer: newKonvaLayer }
        appLayers.push(imgLayerData)
    }

    const newNum = appLayers.find(l => l.type === 'image').objects.length + 1
    const defaultName = `New_Shape_${newNum}`

    const colors = ['#ff0055', '#00a8ff', '#f1c40f', '#9b59b6']
    const randColor = colors[Math.floor(Math.random() * colors.length)]

    const imgNode = new Konva.Shape({
        width: 120,
        height: 120,
        fill: randColor,
        draggable: false,
        name: defaultName,
        shapeClassType: 'Rectangle',
        shadowColor: '#000000',
        shadowBlur: 0,
        shadowOffsetX: -2, 
        shadowOffsetY: 2,  
        shadowOpacity: 0,
        sceneFunc: function (context, shape) {
            const type = shape.getAttr('shapeClassType') || 'Rectangle'
            const w = shape.width()
            const h = shape.height()
            
            const bT = shape.getAttr('strokeTop') ?? true
            const bR = shape.getAttr('strokeRight') ?? true
            const bB = shape.getAttr('strokeBottom') ?? true
            const bL = shape.getAttr('strokeLeft') ?? true
            const allSides = bT && bR && bB && bL

            context.beginPath()
            
            let isRect = false
            let rY = 0, rH = h

            if (type === 'Rectangle') {
                isRect = true; rY = h * 0.25; rH = h * 0.5
                context.rect(0, rY, w, rH)
            } else if (type === 'Square') {
                isRect = true; rY = 0; rH = h
                context.rect(0, rY, w, rH)
            } else if (type === 'Circle') {
                context.ellipse(w/2, h/2, w/2, h/2, 0, 0, Math.PI * 2)
            } else if (type === 'Oval') {
                context.ellipse(w/2, h/2, w/2, h * 0.25, 0, 0, Math.PI * 2)
            } else if (type === 'Triangle') {
                context.moveTo(w/2, 0)
                context.lineTo(w, h)
                context.lineTo(0, h)
                context.closePath()
            } else if (type === 'Trapezoid') {
                context.moveTo(w*0.25, 0)
                context.lineTo(w*0.75, 0)
                context.lineTo(w, h)
                context.lineTo(0, h)
                context.closePath()
            } else if (type === 'Rhombus') {
                const skew = w * 0.25
                context.moveTo(skew, 0)
                context.lineTo(w, 0)
                context.lineTo(w - skew, h)
                context.lineTo(0, h)
                context.closePath()
            } else if (type === 'Pentagon') {
                context.moveTo(w/2, 0)
                context.lineTo(w, h*0.4)
                context.lineTo(w*0.8, h)
                context.lineTo(w*0.2, h)
                context.lineTo(0, h*0.4)
                context.closePath()
            } else if (type === 'Hexagon') {
                context.moveTo(w*0.25, 0)
                context.lineTo(w*0.75, 0)
                context.lineTo(w, h*0.5)
                context.lineTo(w*0.75, h)
                context.lineTo(w*0.25, h)
                context.lineTo(0, h*0.5)
                context.closePath()
            } else if (type === 'Octagon') {
                const cut = 0.3
                context.moveTo(w*cut, 0)
                context.lineTo(w*(1-cut), 0)
                context.lineTo(w, h*cut)
                context.lineTo(w, h*(1-cut))
                context.lineTo(w*(1-cut), h)
                context.lineTo(w*cut, h)
                context.lineTo(0, h*(1-cut))
                context.lineTo(0, h*cut)
                context.closePath()
            }

            // Fills the complete background mathematically first
            context.fillShape(shape)

            // Manually processes segmented lines if sides are disabled to prevent continuous stroking
            if (shape.strokeEnabled() && shape.stroke() && shape.stroke() !== 'transparent') {
                if (allSides || !isRect) {
                    context.strokeShape(shape)
                } else {
                    context.beginPath()
                    if (bT) { context.moveTo(0, rY); context.lineTo(w, rY) }
                    if (bR) { context.moveTo(w, rY); context.lineTo(w, rY + rH) }
                    if (bB) { context.moveTo(w, rY + rH); context.lineTo(0, rY + rH) }
                    if (bL) { context.moveTo(0, rY + rH); context.lineTo(0, rY) }
                    context.strokeShape(shape)
                }
            }
        }
    })
    
    imgNode.offsetX(60)
    imgNode.offsetY(60)
    imgNode.x(stage.width() / 2)
    imgNode.y(stage.height() / 2)

    imgNode.on('mouseenter', () => {
        if (imgNode.draggable() && stage) stage.container().style.cursor = 'move'
    })
    imgNode.on('mouseleave', () => {
        if (stage) stage.container().style.cursor = 'default'
    })

    imgLayerData.konvaLayer.add(imgNode)
    const objId = 'shape_' + generateId()

    const currentT = video ? video.currentTime : 0

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

export function addImageObject(imgUrl) {
    if (typeof imgUrl !== 'string') return
    
    if (activeNode) confirmSelection()

    const video = document.getElementById('main-video')
    if (video) video.pause()
    const playBtn = document.getElementById('play-pause-btn')
    if (playBtn) playBtn.innerText = 'Play'
    
    let imgLayerData = appLayers.find(l => l.name === 'Image Layer')
    if (!imgLayerData) {
        const newKonvaLayer = new Konva.Layer()
        stage.add(newKonvaLayer)
        imgLayerData = { id: 'layer_image', name: 'Image Layer', type: 'image', visible: true, locked: false, objects: [], konvaLayer: newKonvaLayer }
        appLayers.push(imgLayerData)
    }

    const newNum = appLayers.find(l => l.type === 'image').objects.length + 1
    const defaultName = `New_Image_${newNum}`

    const imgObj = new Image()
    imgObj.onload = () => {
        let w = imgObj.width
        let h = imgObj.height
        
        // calculates maximum boundary based on active stage dimensions
        const maxW = stage.width() * 0.95
        const maxH = stage.height() * 0.95
        
        // restricts image scale preserving aspect ratio if dimensions exceed boundary
        if (w > maxW || h > maxH) {
            const ratio = Math.min(maxW / w, maxH / h)
            w = w * ratio
            h = h * ratio
        }

        const imgNode = new Konva.Image({
            image: imgObj,
            width: w,
            height: h,
            draggable: false,
            name: defaultName,
            shadowColor: '#000000',
            shadowBlur: 0,
            shadowOffsetX: -2, 
            shadowOffsetY: 2,  
            shadowOpacity: 0,
            sceneFunc: function (context, shape) {
                const width = shape.width()
                const height = shape.height()
                const image = shape.image()
                
                if (image) {
                    context.drawImage(image, 0, 0, width, height)
                }
                
                const bT = shape.getAttr('strokeTop') ?? true
                const bR = shape.getAttr('strokeRight') ?? true
                const bB = shape.getAttr('strokeBottom') ?? true
                const bL = shape.getAttr('strokeLeft') ?? true
                const allSides = bT && bR && bB && bL

                // manually processes segmented lines if sides are disabled to prevent continuous stroking
                if (shape.strokeEnabled() && shape.stroke() && shape.stroke() !== 'transparent') {
                    if (allSides) {
                        context.beginPath()
                        context.rect(0, 0, width, height)
                        context.strokeShape(shape)
                    } else {
                        context.beginPath()
                        if (bT) { context.moveTo(0, 0); context.lineTo(width, 0) }
                        if (bR) { context.moveTo(width, 0); context.lineTo(width, height) }
                        if (bB) { context.moveTo(width, height); context.lineTo(0, height) }
                        if (bL) { context.moveTo(0, height); context.lineTo(0, 0) }
                        context.strokeShape(shape)
                    }
                }
            },
            hitFunc: function (context, shape) {
                // explicitly defines hit area as a solid rectangle to ensure accurate pointer selection
                context.beginPath()
                context.rect(0, 0, shape.width(), shape.height())
                context.closePath()
                context.fillStrokeShape(shape)
            }
        })
        
        imgNode.offsetX(w / 2)
        imgNode.offsetY(h / 2)
        imgNode.x(stage.width() / 2)
        imgNode.y(stage.height() / 2)

        imgNode.on('mouseenter', () => {
            if (imgNode.draggable() && stage) stage.container().style.cursor = 'move'
        })
        imgNode.on('mouseleave', () => {
            if (stage) stage.container().style.cursor = 'default'
        })

        imgLayerData.konvaLayer.add(imgNode)
        const objId = 'image_' + generateId()

        const currentT = video ? video.currentTime : 0

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
    imgObj.src = imgUrl
}

// spawns full canvas filter object and updates layer state
export function addFilterObject() {
    if (activeNode) confirmSelection() // Clears bird selection to allow new object creation

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

    const newNum = appLayers.find(l => l.type === 'filter').objects.length + 1
    const defaultName = `Filter_${newNum}`

    // configures konva group as a transparent timeline proxy
    const filterNode = new Konva.Group({
        x: 0,
        y: 0,
        width: stage.width(),
        height: stage.height(),
        draggable: false,
        name: defaultName
    })

    const proxyRect = new Konva.Rect({
        x: 0,
        y: 0,
        width: stage.width(),
        height: stage.height(),
        fill: 'transparent',
        listening: false,
        name: 'filter-rect'
    })
    filterNode.add(proxyRect)

    const reticle = new Konva.Group({
        x: stage.width() / 2,
        y: stage.height() / 2,
        name: 'dof-static-reticle',
        draggable: false, // Locked by default
        visible: false
    })
    
    reticle.add(new Konva.Circle({ radius: 20, fill: 'transparent' })) // invisible hitbox
    reticle.add(new Konva.Line({ points: [-10, 0, 10, 0], stroke: '#2ecc71', strokeWidth: 2 }))
    reticle.add(new Konva.Line({ points: [0, -10, 0, 10], stroke: '#2ecc71', strokeWidth: 2 }))
    reticle.add(new Konva.Circle({ radius: 3, fill: '#2ecc71' }))

    // Only shows "move" cursor if the UI has unlocked the reticle
    reticle.on('mouseenter', () => {
        if (reticle.draggable() && typeof stage !== 'undefined' && stage) stage.container().style.cursor = 'move'
    })
    reticle.on('mouseleave', () => {
        if (typeof stage !== 'undefined' && stage && !reticle.isDragging()) stage.container().style.cursor = 'default'
    })

    reticle.on('dragmove', () => {
        const w = filterNode.width()
        const h = filterNode.height()
        let newX = reticle.x()
        let newY = reticle.y()
        
        if (newX < 0) newX = 0
        if (newX > w) newX = w
        if (newY < 0) newY = 0
        if (newY > h) newY = h
        
        reticle.x(newX)
        reticle.y(newY)

        const pctX = (newX / w) * 100
        const pctY = (newY / h) * 100
        filterNode.setAttr('followX', pctX)
        filterNode.setAttr('followY', pctY)

        const sxUI = document.getElementById('static-anchor-x')
        const syUI = document.getElementById('static-anchor-y')
        if (sxUI) sxUI.innerText = Math.round(newX - (w / 2))
        if (syUI) syUI.innerText = Math.round((h / 2) - newY)

        const video = document.getElementById('main-video')
        if (video) video.dispatchEvent(new Event('timeupdate'))
    })

    filterNode.add(reticle)

    // defaults to none
    filterNode.setAttr('filterType', 'none')
    filterLayerData.konvaLayer.add(filterNode)
    const objId = 'filter_' + generateId()
    filterNode.id(objId)

    // gets exact playhead millisecond
    const currentT = video.currentTime || 0

    filterLayerData.objects.push({ 
        id: objId, 
        name: defaultName, 
        node: filterNode, 
        visible: true, 
        locked: false,
        startTime: currentT,
        endTime: currentT + 0.25,
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
            let deletedIds = [objId]
            
            if (obj.node) {
                const tGroup = obj.node.getAttr('transformGroupName')
                const cGroup = obj.node.getAttr('captionsGroupName')
                
                const isTProxy = obj.node.getAttr('isTransformGroupProxy') || (tGroup && obj.node.name() === tGroup)
                const isCProxy = obj.node.getAttr('isCaptionsGroupProxy') || (cGroup && obj.node.name() === cGroup)

                if ((isTProxy || isCProxy) && typeof appLayers !== 'undefined') {
                    // dissolves the group by stripping group attributes from all children
                    appLayers.forEach(l => {
                        if (l.objects) {
                            l.objects.forEach(sibling => {
                                if (sibling.node && sibling.node !== obj.node) {
                                    if (isTProxy && sibling.node.getAttr('transformGroupName') === tGroup) {
                                        sibling.node.setAttr('transformGroupName', null)
                                        sibling.node.setAttr('transformGroupData', null)
                                    }
                                    if (isCProxy && sibling.node.getAttr('captionsGroupName') === cGroup) {
                                        sibling.node.setAttr('captionsGroupName', null)
                                        sibling.node.setAttr('captionsGroupData', null)
                                    }
                                }
                            })
                        }
                    })
                } else if (tGroup && typeof appLayers !== 'undefined') {
                    // strictly purges the individual object from sibling transform group dictionaries to prevent ghost rows
                    appLayers.forEach(l => {
                        if (l.objects) {
                            l.objects.forEach(sibling => {
                                if (sibling.node && sibling.node !== obj.node && sibling.node.getAttr('transformGroupName') === tGroup) {
                                    let tData = sibling.node.getAttr('transformGroupData')
                                    if (tData) {
                                        const nodeKey = Object.keys(tData).find(k => tData[k].id === obj.node.id()) || obj.node.name()
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

                obj.node.destroy()
                if (layer.konvaLayer) layer.konvaLayer.draw()
            }
            
            const finalObjIdx = layer.objects.findIndex(o => o.id === objId)
            if (finalObjIdx > -1) {
                layer.objects.splice(finalObjIdx, 1)
            }
            
            // strictly prevents the editing panel from closing out if focus was successfully shifted to a sibling
            if (typeof activeNode !== 'undefined' && activeNode && deletedIds.includes(activeNode.id())) {
                confirmSelection()
            }
            
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

// calculates base physical dimensions for the video element
function calculateBaseDimensions() {
    const videoRatio = DOM.video.videoWidth / DOM.video.videoHeight
    const elementRatio = DOM.video.clientWidth / DOM.video.clientHeight
    
    if (elementRatio > videoRatio) {
        const height = DOM.video.clientHeight
        return { width: height * videoRatio, height }
    }
    const width = DOM.video.clientWidth
    return { width, height: width / videoRatio }
}

// constraints dimensions based on the applied crop ratio
function applyCropConstraints(baseWidth, baseHeight, cropRatio) {
    if (cropRatio === null) return { width: baseWidth, height: baseHeight }
    
    const currentRatio = baseWidth / baseHeight
    if (currentRatio > cropRatio) {
        const height = baseHeight
        return { width: height * cropRatio, height }
    }
    const width = baseWidth
    return { width, height: width / cropRatio }
}

// calculates physical offset to center the canvas
function calculateOffsets(baseWidth, baseHeight, finalWidth, finalHeight) {
    let offsetX = (DOM.video.clientWidth - finalWidth) / 2
    let offsetY = (DOM.video.clientHeight - finalHeight) / 2

    if (activeCropRatio !== null && activeCropLeftPct !== null && activeCropTopPct !== null) {
        const vidOffsetX = (DOM.video.clientWidth - baseWidth) / 2
        const vidOffsetY = (DOM.video.clientHeight - baseHeight) / 2
        offsetX = vidOffsetX + (baseWidth * (activeCropLeftPct / 100))
        offsetY = vidOffsetY + (baseHeight * (activeCropTopPct / 100))
    }
    return { offsetX, offsetY }
}

// applies calculated dimensions to physical dom elements
function updateDOMContainers(width, height, offsetX, offsetY) {
    if (DOM.canvasContainer) {
        DOM.canvasContainer.style.width = `${width}px`
        DOM.canvasContainer.style.height = `${height}px`
        DOM.canvasContainer.style.left = `${offsetX}px`
        DOM.canvasContainer.style.top = `${offsetY}px`
        DOM.canvasContainer.style.setProperty('clip-path', 'none', 'important')
        DOM.canvasContainer.style.setProperty('-webkit-clip-path', 'none', 'important')
    }

    if (DOM.maskLayer) {
        DOM.maskLayer.style.width = `${width}px`
        DOM.maskLayer.style.height = `${height}px`
        DOM.maskLayer.style.left = `${offsetX}px`
        DOM.maskLayer.style.top = `${offsetY}px`
    }
}

// scales specific konva nodes during resize events
function scaleKonvaNodes(finalWidth, finalHeight, baseWidth, baseHeight, offsetX, offsetY) {
    if (stage) {
        stage.width(finalWidth)
        stage.height(finalHeight)
    }

    appLayers.forEach(layer => {
        if (layer.type === 'filter') {
            layer.objects.forEach(obj => {
                if (obj.node) {
                    obj.node.width(finalWidth)
                    obj.node.height(finalHeight)
                    
                    const proxyRect = obj.node.findOne('.filter-rect')
                    if (proxyRect) {
                        proxyRect.width(finalWidth)
                        proxyRect.height(finalHeight)
                    }

                    const reticle = obj.node.findOne('.dof-static-reticle')
                    if (reticle && !reticle.isDragging()) {
                        const pctX = obj.node.getAttr('followX') ?? 50
                        const pctY = obj.node.getAttr('followY') ?? 50
                        reticle.x((pctX / 100) * finalWidth)
                        reticle.y((pctY / 100) * finalHeight)
                    }
                }
            })
        }
        
        if (layer.type === 'tracking') {
            layer.objects.forEach(obj => {
                if (obj.node && obj.node.getAttr('nativeBox')) {
                    const nativeBox = obj.node.getAttr('nativeBox')
                    const vidOffsetX = (DOM.video.clientWidth - baseWidth) / 2
                    const vidOffsetY = (DOM.video.clientHeight - baseHeight) / 2
                    const vidScaleX = baseWidth / DOM.video.videoWidth
                    const vidScaleY = baseHeight / DOM.video.videoHeight
                    
                    const scaledX = (nativeBox.x * vidScaleX) + vidOffsetX - offsetX
                    const scaledY = (nativeBox.y * vidScaleY) + vidOffsetY - offsetY
                    const scaledW = nativeBox.w * vidScaleX
                    const scaledH = nativeBox.h * vidScaleY
                    
                    obj.node.x(scaledX)
                    obj.node.y(scaledY)
                    
                    const rect = obj.node.findOne('.target-rect')
                    if (rect) {
                        rect.width(scaledW)
                        rect.height(scaledH)
                    }
                    
                    const reticle = obj.node.findOne('.target-reticle')
                    if (reticle && !reticle.isDragging()) {
                        let aX = obj.node.getAttr('anchorX') ?? 0.5
                        let aY = obj.node.getAttr('anchorY') ?? 0.5
                        
                        if (activeNode && activeNode.getAttr('followMode') === 'tracked' && activeNode.getAttr('followTargetId') === obj.id) {
                            aX = activeNode.getAttr('targetAnchorX') ?? 0.5
                            aY = activeNode.getAttr('targetAnchorY') ?? 0.5
                        }
                        reticle.x(scaledW * aX)
                        reticle.y(scaledH * aY)
                    }
                }
            })
        }
    })
}

// manages the visual blackout mask for cropped regions
function applyBlackoutMask(finalWidth, finalHeight, offsetX, offsetY) {
    if (DOM.video) DOM.video.style.clipPath = 'none' 
    
    let blackoutMask = document.getElementById('applied-crop-mask')
    if (!blackoutMask && DOM.canvasContainer) {
        blackoutMask = document.createElement('div')
        blackoutMask.id = 'applied-crop-mask'
        blackoutMask.style.position = 'absolute'
        blackoutMask.style.boxShadow = '0 0 0 9999px #000'
        blackoutMask.style.pointerEvents = 'none'
        blackoutMask.style.zIndex = '1'
        DOM.canvasContainer.parentNode.insertBefore(blackoutMask, DOM.canvasContainer)
    }

    if (blackoutMask) {
        if (activeCropRatio !== null) {
            blackoutMask.style.display = 'block'
            blackoutMask.style.width = `${finalWidth}px`
            blackoutMask.style.height = `${finalHeight}px`
            blackoutMask.style.left = `${offsetX}px`
            blackoutMask.style.top = `${offsetY}px`
        } else {
            blackoutMask.style.display = 'none'
        }
    }
}

// maps html tracking box to current video scale
function syncTrackingBox(baseWidth, baseHeight) {
    if (DOM.trackingTargetBox && DOM.trackingTargetBox.style.display !== 'none' && DOM.trackingTargetBox.dataset.initBox) {
        try {
            const initBox = JSON.parse(DOM.trackingTargetBox.dataset.initBox)
            const vidOffsetX = (DOM.video.clientWidth - baseWidth) / 2
            const vidOffsetY = (DOM.video.clientHeight - baseHeight) / 2
            const vidScaleX = baseWidth / DOM.video.videoWidth
            const vidScaleY = baseHeight / DOM.video.videoHeight
            
            const newLeft = (initBox.x * vidScaleX) + vidOffsetX
            const newTop = (initBox.y * vidScaleY) + vidOffsetY
            const newWidth = initBox.w * vidScaleX
            const newHeight = initBox.h * vidScaleY
            
            DOM.trackingTargetBox.style.left = newLeft + 'px'
            DOM.trackingTargetBox.style.top = newTop + 'px'
            DOM.trackingTargetBox.style.width = newWidth + 'px'
            DOM.trackingTargetBox.style.height = newHeight + 'px'

            if (DOM.trackBoxLabel) {
                DOM.trackBoxLabel.style.left = (newLeft - 2) + 'px'
                DOM.trackBoxLabel.style.top = (newTop - 18) + 'px'
            }
        } catch (e) {
            console.error(e)
        }
    }
}

// calculates responsive bounding box and snaps canvas directly to rendered pixels
export function syncCanvasToVideo() {
    window.blockBoxUpdate = true

    if (!DOM.video || !DOM.video.videoWidth) {
        window.blockBoxUpdate = false
        return
    }

    const { width: baseRenderWidth, height: baseRenderHeight } = calculateBaseDimensions()
    const { width: finalRenderWidth, height: finalRenderHeight } = applyCropConstraints(baseRenderWidth, baseRenderHeight, activeCropRatio)
    const { offsetX, offsetY } = calculateOffsets(baseRenderWidth, baseRenderHeight, finalRenderWidth, finalRenderHeight)

    updateDOMContainers(finalRenderWidth, finalRenderHeight, offsetX, offsetY)
    scaleKonvaNodes(finalRenderWidth, finalRenderHeight, baseRenderWidth, baseRenderHeight, offsetX, offsetY)
    applyBlackoutMask(finalRenderWidth, finalRenderHeight, offsetX, offsetY)

    const { width: previewWidth, height: previewHeight } = applyCropConstraints(baseRenderWidth, baseRenderHeight, previewCropRatio)
    
    syncTrackingBox(baseRenderWidth, baseRenderHeight)

    if (DOM.cropBox) {
        const previewOffsetX = (DOM.video.clientWidth - previewWidth) / 2
        const previewOffsetY = (DOM.video.clientHeight - previewHeight) / 2
        
        DOM.cropBox.style.width = `${previewWidth}px`
        DOM.cropBox.style.height = `${previewHeight}px`
        DOM.cropBox.style.left = `${previewOffsetX}px`
        DOM.cropBox.style.top = `${previewOffsetY}px`
        
        DOM.cropBox.style.display = (previewCropRatio !== null && previewCropRatio !== activeCropRatio) ? 'block' : 'none'
    }

    if (currentLetterbox && currentLetterbox.type !== 'none') {
        applyLetterbox(currentLetterbox.type, currentLetterbox.thickness, currentLetterbox.color)
    }

    if (typeof toggleCanvasGrid === 'function') {
        const gridToggle = document.getElementById('show-canvas-grid-toggle')
        if (gridToggle && gridToggle.checked) {
            const densityInput = document.getElementById('canvas-grid-density')
            const density = densityInput ? parseInt(densityInput.value, 10) : 20
            toggleCanvasGrid(true, density)
        }
    }

    setTimeout(() => {
        window.blockBoxUpdate = false
    }, 50)
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

// natively toggles the physical canvas pixel grid
export function toggleCanvasGrid(isVisible, density = 20) {
    if (!gridLayer || !stage) return
    
    gridLayer.destroyChildren()
    
    if (isVisible) {
        const w = stage.width()
        const h = stage.height()
        const gridSize = density
        
        for (let i = 0; i <= w / gridSize; i++) {
            gridLayer.add(new Konva.Line({
                points: [Math.round(i * gridSize) + 0.5, 0, Math.round(i * gridSize) + 0.5, h],
                stroke: 'rgba(255, 255, 255, 0.2)',
                strokeWidth: 1,
                dash: [4, 4]
            }))
        }
        for (let j = 0; j <= h / gridSize; j++) {
            gridLayer.add(new Konva.Line({
                points: [0, Math.round(j * gridSize) + 0.5, w, Math.round(j * gridSize) + 0.5],
                stroke: 'rgba(255, 255, 255, 0.2)',
                strokeWidth: 1,
                dash: [4, 4]
            }))
        }
        
        gridLayer.moveToTop()
    }
    
    gridLayer.draw()
}

// natively forces system overlays to absolute top of konva stage to bypass circular import failures
export function forceSystemOverlaysToTop() {
    if (typeof transformer !== 'undefined' && transformer && transformer.getLayer()) {
        transformer.getLayer().moveToTop()
    }
    if (typeof gridLayer !== 'undefined' && gridLayer) {
        gridLayer.moveToTop()
    }
    if (typeof letterboxLayer !== 'undefined' && letterboxLayer) {
        letterboxLayer.moveToTop()
    }
}

// natively toggles the physical letterbox mask without triggering import errors
window.toggleCropMask = function(isVisible) {
    if (typeof letterboxLayer !== 'undefined' && letterboxLayer) {
        if (isVisible) {
            letterboxLayer.show()
        } else {
            letterboxLayer.hide()
        }
        letterboxLayer.draw()
    }
}
