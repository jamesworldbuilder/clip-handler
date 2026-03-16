// initializes global state array for layers and objects
export let appLayers = [
    { id: 'layer_base', name: 'Background', type: 'base', visible: true, locked: true, objects: [{ id: 'video-main', name: 'Raw Video', node: null, visible: true, locked: true }] }
]

// tracks currently selected canvas node
export let activeNode = null

// tracks currently selected layer
export let activeLayerId = 'layer_base'

// assigns provided node to active state
export function setActiveNode(node) {
    activeNode = node
}

// assigns provided layer id to active state
export function setActiveLayerId(id) {
    activeLayerId = id
}

// nullifies active node state
export function clearActiveNode() {
    activeNode = null
}
