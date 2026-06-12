import { appLayers, activeNode, setActiveNode } from './state-manager.js'
import { switchTab, openTextEditor, openShapeEditor, openImageEditor, openFilterEditor, updateTimePanelUI, getActiveObj, getTimeParts, formatTime } from './sidebar-ui.js'

export let isMultiTrackOpen = false

export function updateCaptionsListColorIndicators() {
    const activeObj = getActiveObj()
    if (!activeObj || !activeObj.node) return
    const captionColors = activeObj.node.getAttr('captionColors') || []
    if (captionColors.length === 0) return

    const items = document.querySelectorAll('.captions-list-item, .caption-list-item, .caption-row, .captions-row, .caption-item, .captions-item, #captions-list > div, #captions-container > div, #caption-list > div, #caption-container > div')
    items.forEach((item, idx) => {
        if (idx < captionColors.length) {
            const color = captionColors[idx]
            let indicator = item.querySelector('.caption-color-indicator')
            if (!indicator) {
                indicator = document.createElement('span')
                indicator.className = 'caption-color-indicator'
                indicator.style.cssText = 'display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; vertical-align:middle; flex-shrink:0;'
                item.insertBefore(indicator, item.firstChild)
            }
            if (indicator.style.backgroundColor !== color) {
                indicator.style.backgroundColor = color
            }
        }
    })
}

if (typeof document !== 'undefined') {
    const observer = new MutationObserver(() => {
        updateCaptionsListColorIndicators()
    })
    observer.observe(document.body, { childList: true, subtree: true })
}

export function renderMultiTrackTimeline() {
    const container = document.getElementById('multi-track-container')
    if (!container || !isMultiTrackOpen) return
    
    container.innerHTML = ''
    const video = document.getElementById('main-video')
    if (!video || !video.duration) return

    // tracks absolute iteration index for loop matching
    let globalTrackIndex = 0

    appLayers.forEach(layer => {
        if (layer.type === 'base') return
        
        let reversedObjects = [...layer.objects].reverse()
        const collapsedObjects = []
        const seenGroups = new Set()

        // dynamically collapses grouped objects into a single lane
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
            const lane = document.createElement('div')
            lane.className = 'multi-track-lane'
            
            const startPct = (obj.startTime / video.duration) * 100
            const widthPct = ((obj.endTime - obj.startTime) / video.duration) * 100
            
            const block = document.createElement('div')
            block.id = `multi-track-block-${obj.id}`
            block.className = 'multi-track-block'
            block.style.left = startPct + '%'
            block.style.width = widthPct + '%'
            
            let bgColor = '#00a8ff' 
            if (layer.type === 'image') bgColor = '#e1b12c'
            if (layer.type === 'tracking') bgColor = '#9b59b6'
            if (layer.type === 'filter') bgColor = '#8e44ad'
            
            block.style.backgroundColor = obj.timeLocked ? '#555' : bgColor

            // visually displays custom marker positions for caption groups across the block
            if (layer.type === 'text' && obj.node && obj.node.getAttr('captionsGroupName')) {
                const capList = obj.node.getAttr('captionsList')
                if (capList && capList.length > 0) {
                    let timings = obj.node.getAttr('captionTimings') || capList.map((_, i) => i / capList.length)
                    for (let i = 0; i < capList.length; i++) {
                        const marker = document.createElement('div')
                        marker.style.position = 'absolute'
                        marker.style.left = `${timings[i] * 100}%`
                        marker.style.top = '0'
                        marker.style.bottom = '0'
                        marker.style.width = '2px' // Reduced width back to standard
                        marker.style.backgroundColor = 'rgba(255, 255, 255, 0.6)'
                        marker.style.zIndex = '5'
                        
                        // Truncates string and applies native hover hint
                        const textVal = capList[i] || ''
                        const truncated = textVal.length > 15 ? textVal.substring(0, 15) + '...' : textVal
                        marker.title = `${truncated} (double-click to edit text object)`

                        marker.ondblclick = (e) => {
                            e.stopPropagation()
                            obj.node.setAttr('activeCaptionEditIndex', i)
                            
                            const video = document.getElementById('main-video')
                            if (video) {
                                const jumpTime = obj.startTime + (timings[i] * (obj.endTime - obj.startTime))
                                video.currentTime = jumpTime
                                const scrubber = document.getElementById('timeline-scrubber')
                                const progress = document.getElementById('scrubber-progress')
                                if (scrubber && progress && video.duration) {
                                    scrubber.value = jumpTime
                                    progress.style.width = (jumpTime / video.duration) * 100 + '%'
                                }
                            }
                            
                            switchTab('layers-tab')
                            openTextEditor(obj.node)
                        }
                        
                        block.appendChild(marker)
                    }
                }
            }

            // visually displays custom marker positions for transform groups across the block
            if (obj.node && obj.node.getAttr('transformGroupName')) {
                const tGroupData = obj.node.getAttr('transformGroupData')
                if (tGroupData) {
                    const tKeys = Object.keys(tGroupData)
                    if (tKeys.length > 0) {
                        let timingsObj = obj.node.getAttr('transformTimings') || []
                        if (timingsObj.length !== tKeys.length) {
                            timingsObj = tKeys.map((_, i) => i / tKeys.length)
                            if (timingsObj.length > 0) timingsObj[0] = 0 // anchors first marker
                            obj.node.setAttr('transformTimings', timingsObj)
                        }
                        for (let i = 0; i < tKeys.length; i++) {
                            const marker = document.createElement('div')
                            marker.style.position = 'absolute'
                            marker.style.left = `${timingsObj[i] * 100}%`
                            marker.style.top = '0'
                            marker.style.bottom = '0'
                            marker.style.width = '2px'
                            marker.style.backgroundColor = 'rgba(255, 255, 255, 0.6)'
                            marker.style.zIndex = '5'
                            
                            const textVal = tKeys[i] || ''
                            const truncated = textVal.length > 15 ? textVal.substring(0, 15) + '...' : textVal
                            marker.title = `${truncated} (double-click to edit transform object)`

                            marker.ondblclick = (e) => {
                                e.stopPropagation()
                                obj.node.setAttr('activeTransformEditIndex', i)
                                
                                switchTab('layers-tab')
                                
                                let targetNode = obj.node
                                const tGroup = targetNode.getAttr('transformGroupName')
                                if (tGroup && typeof appLayers !== 'undefined') {
                                    appLayers.forEach(l => {
                                        if (l.objects) {
                                            const match = l.objects.find(o => o.node && o.node.getAttr('transformGroupName') === tGroup && o.name === textVal)
                                            if (match) targetNode = match.node
                                        }
                                    })
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
                                
                                const tRows = document.getElementById('transforms-rows')
                                if (tRows && tRows.children.length > i) {
                                    const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true })
                                    tRows.children[i].dispatchEvent(dblClickEvent)
                                }
                            }
                            
                            block.appendChild(marker)
                        }
                    }
                }
            }

            // applies green border if current block matches active loop index
            if (window.loopMode === 'track' && window.loopTrackIndex === globalTrackIndex) {
                block.style.border = '2px solid #f1c40f'
                block.style.boxSizing = 'border-box'
            }
            
            const tGroupName = obj.node ? obj.node.getAttr('transformGroupName') : null
            const isCGroup = layer.type === 'text' && obj.node && obj.node.getAttr('captionsGroupName')
            
            // sets native hover hint tooltip
            block.title = isCGroup ? obj.node.getAttr('captionsGroupName') : (tGroupName ? tGroupName : obj.name)
            
            const label = document.createElement('div')
            label.className = 'multi-track-label'
            
            // uses the object's list-item value
            label.innerText = tGroupName ? tGroupName : (obj.name || '')
            
            block.appendChild(label)

            // applies color coding based on object type
            if (layer.type === 'text') {
                block.style.backgroundColor = '#3498db' // blue
            } else if (layer.type === 'filter') {
                block.style.backgroundColor = '#9b59b6' // purple
            } else if (layer.type === 'image') {
                if (obj.node && ['Rect', 'Circle', 'Oval', 'Triangle', 'Shape'].includes(obj.node.getClassName())) {
                    block.style.backgroundColor = '#e67e22' // orange
                } else {
                    block.style.backgroundColor = '#f1c40f' // yellow
                }
            }
            
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
                } else if (layer.type === 'filter') {
                    switchTab('layers-tab')
                    openFilterEditor(obj.node)
                }
            }
            
            lane.appendChild(block)
            container.appendChild(lane)
            
            // increments tracking index
            globalTrackIndex++
        })
    })
}

export function renderTimelineIntervals() {
    const lane = document.getElementById('active-obj-lane')
    if (!lane) return
    
    lane.innerHTML = ''
    
    const oldVisibilityContainer = document.getElementById('tmarker-grp-visibility-container')
    if (oldVisibilityContainer) {
        oldVisibilityContainer.style.display = 'none'
        oldVisibilityContainer.innerHTML = ''
    }

    const video = document.getElementById('main-video')
    if (!activeNode || !video || !video.duration) return

    const activeObj = getActiveObj()
    if (!activeObj) return

    const startPct = (activeObj.startTime / video.duration) * 100
    const widthPct = ((activeObj.endTime - activeObj.startTime) / video.duration) * 100

    const intervalBlock = document.createElement('div')
    intervalBlock.className = 'obj-interval-block'
    intervalBlock.id = 'obj-interval-block'
    
    let initialTransform = ''
    let initialZIndex = ''
    if (window.isIntervalBlockZoomed) {
        initialTransform = ' transform:scaleY(2.5); transform-origin:left center;'
        initialZIndex = ' z-index:100;'
    }
    
    intervalBlock.style.cssText = `position:absolute; left:${startPct}%; top:0; width:${widthPct}%; height:100%; pointer-events:auto;${initialTransform}${initialZIndex}`

    intervalBlock.addEventListener('mousemove', (e) => {
        if (e.target !== intervalBlock && e.target !== durationLine) {
            const blockTooltip = document.getElementById('interval-block-tooltip')
            if (blockTooltip) blockTooltip.style.display = 'none'
            return
        }
        
        let blockTooltip = document.getElementById('interval-block-tooltip')
        if (!blockTooltip) {
            blockTooltip = document.createElement('div')
            blockTooltip.id = 'interval-block-tooltip'
            blockTooltip.style.cssText = 'position:fixed; background:#2a2a2a; color:#fff; border:1px solid #555; padding:4px 8px; font-size:10px; font-family:monospace; border-radius:3px; pointer-events:none; z-index:10000;'
            document.body.appendChild(blockTooltip)
        }
        blockTooltip.innerText = window.isIntervalBlockZoomed ? 'double-click to revert' : 'double-click to enhance'
        blockTooltip.style.left = (e.clientX + 10) + 'px'
        blockTooltip.style.top = (e.clientY + 15) + 'px'
        blockTooltip.style.display = 'block'
    })

    intervalBlock.addEventListener('mouseleave', () => {
        const blockTooltip = document.getElementById('interval-block-tooltip')
        if (blockTooltip) blockTooltip.style.display = 'none'
    })

    const durationLine = document.createElement('div')

    window.isIntervalBlockZoomed = window.isIntervalBlockZoomed || false

    const updateRulerTicks = () => {
        let ruler = intervalBlock.querySelector('.zoom-ruler')
        if (!ruler) return
        
        ruler.innerHTML = '' // flushes old ticks
        
        const sTime = activeObj.startTime
        const eTime = activeObj.endTime
        const dur = eTime - sTime
        
        if (dur <= 0) return
        
        // scales step density intervals to prevent textual collision under 2 seconds
        let step = 0.5
        if (dur > 10) step = 1.0
        else if (dur > 5) step = 0.5
        else if (dur > 2) step = 0.25
        else if (dur > 1) step = 0.2
        else if (dur > 0.5) step = 0.1
        else if (dur > 0.2) step = 0.05
        else step = 0.02
        
        const firstTick = Math.ceil(sTime / step) * step
        
        let rulerTooltip = document.getElementById('ruler-hover-tooltip')
        if (!rulerTooltip) {
            rulerTooltip = document.createElement('div')
            rulerTooltip.id = 'ruler-hover-tooltip'
            rulerTooltip.style.cssText = 'position:fixed; background:rgba(0,0,0,0.8); color:#aaa; border:1px solid #555; padding:4px 8px; font-size:10px; font-family:monospace; border-radius:3px; pointer-events:none; z-index:999999; display:none; transform:translateX(-50%); white-space:nowrap;'
            document.body.appendChild(rulerTooltip)
        }

        // dynamically adapts font sizes and hiding thresholds based on absolute screen width 
        const isCompactScreen = window.innerWidth < 970
        const isSmallScreen = window.innerWidth < 1200
        let fontSize = '8px'
        let hideThreshold = 1

        if (isCompactScreen) {
            fontSize = '7px'
            hideThreshold = 2.5
        } else if (isSmallScreen) {
            fontSize = '8px'
            hideThreshold = 1.5
        } else if (dur < 2) {
            fontSize = '8px'
        }
        
        for (let t = firstTick; t <= eTime - 0.001; t += step) {
            const pct = ((t - sTime) / dur) * 100
            const tick = document.createElement('div')
            tick.className = 'default-ruler-tick'
            tick.style.cssText = `position:absolute; left:${pct}%; bottom:0; height:4px; width:1px; background-color:rgba(255, 255, 255, 0.4); transform:translateX(-50%); z-index:1;`
            
            const timeStr = (Math.round(t * 100) / 100).toFixed(2) + 's'
            
            const label = document.createElement('span')
            label.style.cssText = `position:absolute; left:4px; bottom:2px; color:#aaa; font-size:${fontSize}; font-family:monospace; transform-origin:left bottom;`
            label.innerText = timeStr
            
            // identifies collision boundary to prevent text overlap beneath transparent end label
            const isCollisionZone = t > eTime - (dur * 0.12)
            
            if (dur < hideThreshold || isCollisionZone) {
                label.style.display = 'none'
                
                // prevents tooltip block over the zero mark so scrubber handle remains selectable
                if (t >= 0.001) {
                    // expands hit area for the tooltip interaction
                    const hitArea = document.createElement('div')
                    hitArea.style.cssText = 'position:absolute; bottom:0; left:-4px; right:-4px; height:15px; background:transparent; cursor:pointer; pointer-events:auto;'
                    tick.appendChild(hitArea)
                    
                    hitArea.addEventListener('mouseenter', () => {
                        const rect = tick.getBoundingClientRect()
                        rulerTooltip.innerText = timeStr
                        rulerTooltip.style.left = rect.left + 'px'
                        rulerTooltip.style.top = (rect.top - 20) + 'px'
                        rulerTooltip.style.display = 'block'
                    })
                    hitArea.addEventListener('mouseleave', () => {
                        rulerTooltip.style.display = 'none'
                    })
                }
            }
            
            tick.appendChild(label)
            ruler.appendChild(tick)
        }

        const endTick = document.createElement('div')
        endTick.className = 'end-ruler-tick'
        endTick.style.cssText = `position:absolute; left:100%; bottom:0; height:4px; width:1px; background-color:rgba(255, 255, 255, 0.4); transform:translateX(-50%); z-index:10;`
        
        const endLabel = document.createElement('span')
        endLabel.style.cssText = `position:absolute; left:4px; bottom:2px; color:#aaa; font-size:${fontSize}; font-family:monospace; transform-origin:left bottom; z-index:10;`
        endLabel.innerText = (Math.round(eTime * 100) / 100).toFixed(2) + 's'
        
        endTick.appendChild(endLabel)
        ruler.appendChild(endTick)

        // Render active caption marker on the ruler if selected
        if (activeObj.node && activeObj.node.getAttr('captionsGroupName')) {
            const activeIdx = activeObj.node.getAttr('activeCaptionEditIndex')
            if (activeIdx !== undefined && activeIdx !== null) {
                const capList = activeObj.node.getAttr('captionsList') || []
                const timings = activeObj.node.getAttr('captionTimings') || []
                if (activeIdx >= 0 && activeIdx < capList.length && timings[activeIdx] !== undefined) {
                    const captionColors = activeObj.node.getAttr('captionColors') || []
                    const mColor = captionColors[activeIdx] || '#ffffff'
                    const markerTime = activeObj.startTime + (timings[activeIdx] * (activeObj.endTime - activeObj.startTime))
                    const markerPctVal = timings[activeIdx]
                    
                    // Hide nearby standard ticks
                    const timePerPixel = (activeObj.endTime - activeObj.startTime) / (ruler.getBoundingClientRect().width || 1000)
                    const thresholdTime = timePerPixel * 35
                    
                    ruler.querySelectorAll('.default-ruler-tick span, .end-ruler-tick span').forEach(span => {
                        const tickTime = parseFloat(span.innerText)
                        if (!isNaN(tickTime) && Math.abs(tickTime - markerTime) < thresholdTime) {
                            span.style.opacity = '0'
                        }
                    })
                    
                    let capDyn = ruler.querySelector('.cap-dyn-ruler-val')
                    if (!capDyn) {
                        capDyn = document.createElement('span')
                        capDyn.className = 'cap-dyn-ruler-val'
                        capDyn.style.cssText = `position:absolute; bottom:2px; color:${mColor}; font-size:8px; font-family:monospace; transform-origin:left bottom; z-index:20; pointer-events:none;`
                        ruler.appendChild(capDyn)
                    }
                    capDyn.innerText = markerTime.toFixed(3) + 's'
                    capDyn.style.left = `calc(${markerPctVal * 100}% + 4px)`
                    
                    const hasActiveTMarker = intervalBlock.querySelector('.active-thread-label') !== null
                    capDyn.style.display = hasActiveTMarker ? 'none' : 'block'
                }
            }
        }
    }
    
    const applyZoomState = () => {
        let ruler = intervalBlock.querySelector('.zoom-ruler')
        const syncWrap = document.getElementById('zoom-sync-wrap')
        const scaleTarget = document.getElementById('zoom-scale-target')
        const activeObj = getActiveObj()
        const video = document.getElementById('main-video')
        
        const capTooltip = document.getElementById('captions-tooltip')
        if (capTooltip) capTooltip.style.display = 'none'
        
        const toggleMultiBtn = document.getElementById('toggle-multi-track-btn')
        const bottomControls = document.getElementById('bottom-controls')
        const visContainer = document.getElementById('tmarker-grp-visibility-container')

        if (window.isIntervalBlockZoomed) {
            intervalBlock.style.transformOrigin = 'left center'
            intervalBlock.style.transform = 'scaleY(2.5)' // Expands height for marker labels
            intervalBlock.style.zIndex = '100'
            
            if (toggleMultiBtn) {
                toggleMultiBtn.style.transition = 'margin-top 0.2s ease'
                toggleMultiBtn.style.marginTop = '8px'
            }
            
            if (visContainer) {
                visContainer.style.transition = 'margin-top 0.2s ease'
                visContainer.style.marginTop = '20px'
            }
            
            if (bottomControls) {
                bottomControls.style.transition = 'padding-top 0.2s ease'
                bottomControls.style.paddingTop = '12.5px'
            }
            
            if (syncWrap && scaleTarget) {
                syncWrap.style.overflowX = 'auto'
                syncWrap.style.paddingTop = '60px'
                syncWrap.style.marginTop = '-60px'
                scaleTarget.style.width = '250%'
                
                let scrollStyle = document.getElementById('zoom-scroll-style')
                if (!scrollStyle) {
                    scrollStyle = document.createElement('style')
                    scrollStyle.id = 'zoom-scroll-style'
                    scrollStyle.innerHTML = `
                        #zoom-sync-wrap { scrollbar-width: thin; }
                        #zoom-sync-wrap::-webkit-scrollbar { height: 8px; }
                        #zoom-sync-wrap::-webkit-scrollbar-track { background: transparent; }
                        #zoom-sync-wrap::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.3); border-radius: 4px; border: 2px solid transparent; background-clip: padding-box; }
                        #zoom-sync-wrap::-webkit-scrollbar-thumb:hover { background-color: rgba(255, 255, 255, 0.6); }
                    `
                    document.head.appendChild(scrollStyle)
                }

                if (activeObj && video && video.duration) {
                    setTimeout(() => {
                        const startPct = activeObj.startTime / video.duration
                        syncWrap.scrollLeft = startPct * 1.5 * syncWrap.clientWidth
                    }, 0)
                }
            }
            
            if (ruler) ruler.remove()
            
            ruler = document.createElement('div')
            ruler.className = 'zoom-ruler'
            ruler.style.cssText = 'position:absolute; top:-15px; left:0; width:100%; height:15px; pointer-events:none; border-bottom:1px solid rgba(255, 255, 255, 0.2); overflow:visible;'
            intervalBlock.appendChild(ruler)
            
            updateRulerTicks()
            ruler.style.display = 'block'
        } else {
            intervalBlock.style.transform = 'scale(1)'
            intervalBlock.style.zIndex = ''
            if (ruler) ruler.style.display = 'none'
            
            if (toggleMultiBtn) {
                toggleMultiBtn.style.transition = 'margin-top 0.2s ease'
                toggleMultiBtn.style.marginTop = '0px'
            }
            
            if (visContainer) {
                visContainer.style.transition = 'margin-top 0.2s ease'
                visContainer.style.marginTop = '8px'
            }
            
            if (bottomControls) {
                bottomControls.style.transition = 'padding-top 0.2s ease'
                bottomControls.style.paddingTop = '0px'
            }
            
            if (syncWrap && scaleTarget) {
                syncWrap.scrollLeft = 0
                syncWrap.style.overflowX = 'hidden'
                syncWrap.style.paddingTop = '40px'
                syncWrap.style.marginTop = '-40px'
                scaleTarget.style.width = '100%'
                
                const zoomTooltip = document.getElementById('zoom-hover-tooltip')
                if (zoomTooltip) zoomTooltip.style.display = 'none'
            }
        }
        
        // Prevents text stretching by counter-scaling labels against the container's transform ratio
        const counterScale = window.isIntervalBlockZoomed ? 0.4 : 1
        document.querySelectorAll('.tmarker-thread-label').forEach(lbl => {
            lbl.style.transform = `scaleY(${counterScale})`
            lbl.style.display = window.isIntervalBlockZoomed ? 'block' : 'none'
        })
        
        const scrubberTooltip = document.getElementById('scrubber-tooltip')
        if (scrubberTooltip) {
            scrubberTooltip.style.transition = 'margin-top 0.2s ease'
            scrubberTooltip.style.marginTop = window.isIntervalBlockZoomed ? '-20px' : '0px'
            scrubberTooltip.style.zIndex = window.isIntervalBlockZoomed ? '999999' : ''
        }
        
        const sWrap = document.getElementById('scrubber-wrap')
        if (sWrap) {
            sWrap.style.zIndex = window.isIntervalBlockZoomed ? '105' : ''
            sWrap.style.overflow = window.isIntervalBlockZoomed ? 'visible' : ''
            if (window.isIntervalBlockZoomed && window.getComputedStyle(sWrap).position === 'static') {
                sWrap.style.position = 'relative'
            }
        }
    }

    intervalBlock.addEventListener('dblclick', (e) => {
        if (e.target !== intervalBlock && e.target !== durationLine) return
        e.stopPropagation()
        intervalBlock.style.transition = 'transform 0.2s ease'
        window.isIntervalBlockZoomed = !window.isIntervalBlockZoomed
        applyZoomState()
        
        if (!window.isIntervalBlockZoomed) {
            document.querySelectorAll('.tmarker-thread-label.active-thread-label').forEach(lbl => {
                lbl.classList.remove('active-thread-label')
                lbl.style.opacity = '0.8'
                lbl.style.color = '#000'
                lbl.style.backgroundColor = 'rgba(255,255,255,0.7)'
                lbl.style.padding = '0 2px'
            })
            document.querySelectorAll('.tmarker-arrow').forEach(arr => {
                if (arr.style.borderLeftColor) arr.style.borderLeftColor = '#000'
                if (arr.style.borderRightColor) arr.style.borderRightColor = '#000'
            })
            document.querySelectorAll('.tmarker-handle').forEach(m => {
                m.style.pointerEvents = 'auto'
                m.style.cursor = 'pointer'
                m.style.top = '0'
            })
            document.querySelectorAll('.s-dyn-ruler-val, .e-dyn-ruler-val').forEach(el => el.remove())
            window.activeTMarkerThreadRenderer = null
        }
        
        const blockTooltip = document.getElementById('interval-block-tooltip')
        if (blockTooltip) {
            blockTooltip.innerText = window.isIntervalBlockZoomed ? 'double-click to revert' : 'double-click to enhance'
        }
    })
    
    // defers immediate application to ensure all markers are successfully appended to the DOM block first
    setTimeout(() => {
        applyZoomState()
        updateCaptionsListColorIndicators()
        
        if ((window.isIntervalBlockZoomed || window._forceTimelineAutoSelect) && activeObj && activeObj.node && activeObj.node.getAttr('transformGroupName')) {
            const tRows = document.getElementById('transforms-rows')
            let activeRowKey = null
            let activeMatrixIdx = 0
            if (tRows) {
                const activeRow = Array.from(tRows.children).find(r => r.style.borderLeftColor === 'rgb(0, 168, 255)' || r.style.borderLeftColor === '#00a8ff')
                if (activeRow) {
                    activeRowKey = activeRow.dataset.transformKey
                    try {
                        activeMatrixIdx = JSON.parse(activeRow.dataset.transformConfig).activeTransformEditIndex || 0
                    } catch(e) {}
                }
            }
            
            if (activeRowKey) {
                const threads = intervalBlock.querySelectorAll('.tmarker-thread')
                threads.forEach(thread => {
                    if (thread.dataset.transformKey === activeRowKey && parseInt(thread.dataset.matrixIndex, 10) === activeMatrixIdx) {
                        if (typeof thread.ondblclick === 'function') {
                            thread.ondblclick({ preventDefault: () => {}, stopPropagation: () => {}, isSyntheticAutoSelect: true })
                        }
                    }
                })
            }
            window._forceTimelineAutoSelect = false
        }
    }, 10)

    durationLine.style.position = 'absolute'
    durationLine.style.left = '0%'
    durationLine.style.width = '100%'
    durationLine.style.height = '6px'
    durationLine.style.top = '3px'
    durationLine.style.backgroundColor = activeObj.timeLocked ? '#aaa' : '#2ecc71'
    durationLine.style.borderRadius = '3px'
    durationLine.style.cursor = activeObj.timeLocked ? 'default' : 'grab'
    if (activeObj.timeLocked) durationLine.title = 'Locked'

    // maps evenly spaced visual markers for caption groups across the active duration line
    if (activeObj.node && activeObj.node.getAttr('captionsGroupName')) {
        const capList = activeObj.node.getAttr('captionsList')
        if (capList && capList.length > 0) {
            
            // Fetches or initializes custom timings array
            let timings = activeObj.node.getAttr('captionTimings') || []
            if (timings.length !== capList.length) {
                timings = capList.map((_, i) => i / capList.length)
                activeObj.node.setAttr('captionTimings', timings)
            }

            let captionColors = activeObj.node.getAttr('captionColors') || []
            if (captionColors.length !== capList.length) {
                const getRandomColor = (index) => {
                    const types = ['cyan', 'magenta', 'yellow']
                    const type = types[index % 3]
                    const high = () => Math.floor(Math.random() * 76) + 180
                    const low = () => Math.floor(Math.random() * 51)
                    let r, g, b
                    if (type === 'cyan') {
                        r = low()
                        g = high()
                        b = high()
                    } else if (type === 'magenta') {
                        r = high()
                        g = low()
                        b = high()
                    } else {
                        r = high()
                        g = high()
                        b = low()
                    }
                    const hex = (val) => val.toString(16).padStart(2, '0')
                    return `#${hex(r)}${hex(g)}${hex(b)}`
                }
                while (captionColors.length < capList.length) {
                    captionColors.push(getRandomColor(captionColors.length))
                }
                activeObj.node.setAttr('captionColors', captionColors)
            }

            // Immediately tears down any active tmarker selection to unblock the measurement ruler
            const clearTMarkerSelection = () => {
                document.querySelectorAll('.tmarker-thread-label.active-thread-label').forEach(lbl => {
                    lbl.classList.remove('active-thread-label')
                    lbl.style.opacity = '0.8'
                    lbl.style.color = '#000'
                    lbl.style.backgroundColor = 'rgba(255,255,255,0.7)'
                    lbl.style.padding = '0 2px'
                })
                document.querySelectorAll('.tmarker-arrow').forEach(arr => {
                    if (arr.style.borderLeftColor) arr.style.borderLeftColor = '#000'
                    if (arr.style.borderRightColor) arr.style.borderRightColor = '#000'
                })
                document.querySelectorAll('.tmarker-handle').forEach(m => {
                    m.style.pointerEvents = 'auto'
                    m.style.cursor = 'pointer'
                    m.style.top = '0'
                })
                window.activeTMarkerThreadRenderer = null
            }

            for (let i = 0; i < capList.length; i++) {
                const marker = document.createElement('div')
                marker.style.position = 'absolute'
                const markerPct = timings[i] * 100
                marker.style.left = `${markerPct}%`
                marker.style.top = '0'
                marker.style.bottom = '0'
                marker.style.width = '12px'
                marker.style.padding = '0 5px'
                marker.style.boxSizing = 'border-box'
                marker.style.backgroundClip = 'content-box'
                marker.style.transform = 'translateX(-50%)'
                
                const markerColor = captionColors[i] || '#ffffff'
                marker.style.backgroundColor = markerColor
                marker.style.cursor = 'ew-resize'
                marker.style.zIndex = '30'
                marker.style.pointerEvents = 'auto'
                
                // Truncates string and applies native hover hint
                const textVal = capList[i] || ''
                const truncated = textVal.length > 15 ? textVal.substring(0, 15) + '...' : textVal
                marker.title = `${truncated} (double-click to edit text object)`

                marker.addEventListener('mouseenter', (e) => {
                    if (window.isIntervalBlockZoomed) return
                    let capTooltip = document.getElementById('captions-tooltip')
                    if (!capTooltip) {
                        capTooltip = document.createElement('div')
                        capTooltip.id = 'captions-tooltip'
                        capTooltip.style.cssText = 'position:fixed; background:#2a2a2a; color:#fff; border:1px solid #555; padding:4px 8px; font-size:10px; font-family:monospace; border-radius:3px; pointer-events:none; z-index:10000;'
                        document.body.appendChild(capTooltip)
                    }
                    const markerTime = activeObj.startTime + (timings[i] * (activeObj.endTime - activeObj.startTime))
                    capTooltip.innerText = markerTime.toFixed(2) + 's'
                    capTooltip.style.left = (e.clientX + 10) + 'px'
                    capTooltip.style.top = (e.clientY + 15) + 'px'
                    capTooltip.style.display = 'block'
                })

                marker.addEventListener('mousemove', (e) => {
                    if (window.isIntervalBlockZoomed) {
                        const capTooltip = document.getElementById('captions-tooltip')
                        if (capTooltip) capTooltip.style.display = 'none'
                        return
                    }
                    const capTooltip = document.getElementById('captions-tooltip')
                    if (capTooltip) {
                        const markerTime = activeObj.startTime + (timings[i] * (activeObj.endTime - activeObj.startTime))
                        capTooltip.innerText = markerTime.toFixed(2) + 's'
                        capTooltip.style.left = (e.clientX + 10) + 'px'
                        capTooltip.style.top = (e.clientY + 15) + 'px'
                    }
                })

                marker.addEventListener('mouseleave', () => {
                    const capTooltip = document.getElementById('captions-tooltip')
                    if (capTooltip) capTooltip.style.display = 'none'
                })
                
                marker.onclick = (e) => {
                    e.stopPropagation()
                    clearTMarkerSelection()
                    activeObj.node.setAttr('activeCaptionEditIndex', i)
                    if (window.isIntervalBlockZoomed) {
                        updateRulerTicks()
                    }
                    setTimeout(updateCaptionsListColorIndicators, 50)
                }

                marker.ondblclick = (e) => {
                    e.stopPropagation()
                    clearTMarkerSelection()
                    activeObj.node.setAttr('activeCaptionEditIndex', i)
                    
                    const video = document.getElementById('main-video')
                    if (video) {
                        const jumpTime = activeObj.startTime + (timings[i] * (activeObj.endTime - activeObj.startTime))
                        video.currentTime = jumpTime
                        const scrubber = document.getElementById('timeline-scrubber')
                        const progress = document.getElementById('scrubber-progress')
                        if (scrubber && progress && video.duration) {
                            scrubber.value = jumpTime
                            progress.style.width = (jumpTime / video.duration) * 100 + '%'
                        }
                    }
                    
                    if (window.isIntervalBlockZoomed) {
                        updateRulerTicks()
                    }
                    
                    switchTab('layers-tab')
                    openTextEditor(activeObj.node)
                }
                
                // Enables lateral dragging without passing neighbors
                marker.onmousedown = (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    
                    clearTMarkerSelection()
                    activeObj.node.setAttr('activeCaptionEditIndex', i)
                    if (window.isIntervalBlockZoomed) {
                        updateRulerTicks()
                    }
                    setTimeout(updateCaptionsListColorIndicators, 50)
                    
                    const startX = e.clientX
                    const startPctVal = timings[i]
                    const parentRect = durationLine.getBoundingClientRect()
                    
                    const onMouseMove = (moveEvent) => {
                        const delta = (moveEvent.clientX - startX) / parentRect.width
                        let newPct = startPctVal + delta
                        
                        // Enforces strict boundaries between neighbor markers (2% padding)
                        const minPct = i === 0 ? 0 : timings[i - 1] + 0.02
                        const maxPct = i === capList.length - 1 ? 1 : timings[i + 1] - 0.02
                        
                        newPct = Math.max(minPct, Math.min(newPct, maxPct))
                        
                        timings[i] = newPct
                        const currentMarkerPct = newPct * 100
                        marker.style.left = `${currentMarkerPct}%`
                        
                        if (window.isIntervalBlockZoomed) {
                            updateRulerTicks()
                        } else {
                            const capTooltip = document.getElementById('captions-tooltip')
                            if (capTooltip) {
                                const markerTime = activeObj.startTime + (newPct * (activeObj.endTime - activeObj.startTime))
                                capTooltip.innerText = markerTime.toFixed(2) + 's'
                                capTooltip.style.left = (moveEvent.clientX + 10) + 'px'
                                capTooltip.style.top = (moveEvent.clientY + 15) + 'px'
                            }
                        }
                    }
                    
                    const onMouseUp = () => {
                        document.removeEventListener('mousemove', onMouseMove)
                        document.removeEventListener('mouseup', onMouseUp)
                        activeObj.node.setAttr('captionTimings', timings)
                        
                        const capTooltip = document.getElementById('captions-tooltip')
                        if (capTooltip) capTooltip.style.display = 'none'
                        
                        // Force multi-track timeline sync to visually reflect new marker positions
                        if (typeof renderMultiTrackTimeline === 'function') renderMultiTrackTimeline()
                    }
                    
                    document.addEventListener('mousemove', onMouseMove)
                    document.addEventListener('mouseup', onMouseUp)
                }
                
                intervalBlock.appendChild(marker)
            }
        }
    }
    
    // maps evenly spaced visual markers for transform groups across the active duration line
    if (activeObj.node && activeObj.node.getAttr('transformGroupName')) {
        const tGroupData = activeObj.node.getAttr('transformGroupData')
        if (tGroupData) {
            const tKeys = Object.keys(tGroupData)
            
            const tRows = document.getElementById('transforms-rows')
            let currentActiveRowKey = null
            if (tRows) {
                const activeRow = Array.from(tRows.children).find(r => r.style.borderLeftColor === 'rgb(0, 168, 255)' || r.style.borderLeftColor === '#00a8ff')
                if (activeRow) currentActiveRowKey = activeRow.dataset.transformKey
            }
            
            if (currentActiveRowKey && currentActiveRowKey !== window._prevActiveRowKey) {
                window._activeTmarkerGrp = currentActiveRowKey
                window._forceTimelineAutoSelect = true
            }
            window._prevActiveRowKey = currentActiveRowKey
            
            if (tKeys.length > 1) {
                if (window._activeTmarkerGrp && !tKeys.includes(window._activeTmarkerGrp)) {
                    window._activeTmarkerGrp = null
                }
                if (!window._activeTmarkerGrp && tKeys.length > 0) {
                    window._activeTmarkerGrp = tKeys[0]
                }
                
                let visibilityContainer = document.getElementById('tmarker-grp-visibility-container')
                if (!visibilityContainer) {
                    visibilityContainer = document.createElement('div')
                    visibilityContainer.id = 'tmarker-grp-visibility-container'
                    
                    const syncWrap = document.getElementById('zoom-sync-wrap')
                    if (syncWrap) {
                        syncWrap.parentNode.insertBefore(visibilityContainer, syncWrap.nextSibling)
                    } else {
                        lane.parentNode.insertBefore(visibilityContainer, lane.nextSibling)
                    }
                }
                
                const mt = window.isIntervalBlockZoomed ? '20px' : '8px'
                visibilityContainer.style.cssText = `display:flex; gap:8px; align-items:center; padding-top:4px; margin-top:${mt}; margin-bottom:8px; width:100%;`
                
                tKeys.forEach((tKey, index) => {
                    const tConfig = tGroupData[tKey]
                    const markerColor = tConfig.markerColor || '#ffffff'
                    const btn = document.createElement('button')
                    btn.id = `tmarker-grp-visibility-toggle-${index + 1}`
                    btn.className = 'tmarker-grp-visibility-toggle'
                    btn.title = `Toggle visibility for ${tKey}`
                    btn.style.cssText = `width:20px; height:20px; padding:0; border:1px solid ${markerColor}; border-radius:2px; display:flex; justify-content:center; align-items:center; cursor:pointer; background:transparent; transition:all 0.2s ease; box-sizing:border-box;`
                    
                    const isSelected = window._activeTmarkerGrp === tKey
                    const iconColor = isSelected ? markerColor : '#aaa'
                    
                    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" style="width:12px; height:12px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
                    
                    btn.onclick = (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (window._activeTmarkerGrp === tKey) {
                            window._activeTmarkerGrp = null
                        } else {
                            window._activeTmarkerGrp = tKey
                            const tRows = document.getElementById('transforms-rows')
                            if (tRows) {
                                const row = Array.from(tRows.children).find(r => r.dataset.transformKey === tKey)
                                if (row) row.click()
                            }
                        }
                        renderTimelineIntervals()
                    }
                    visibilityContainer.appendChild(btn)
                })
            }
            
            Object.keys(tGroupData).forEach(tKey => {
                if (window._activeTmarkerGrp && window._activeTmarkerGrp !== tKey) return
                
                const tConfig = tGroupData[tKey]
                if (tConfig && tConfig.transformGroupData) {
                    const matrixKeys = Object.keys(tConfig.transformGroupData)
                    
                    for (let i = 0; i < matrixKeys.length; i++) {
                        const mKey = matrixKeys[i]
                        const tEl = tConfig.transformGroupData[mKey]
                        if (!tEl) continue
                        
                        if (!tEl.transform_interval) {
                            tEl.transform_interval = tEl.interval ? { ...tEl.interval } : { start: "0.050s", end: "0.250s" }
                        }
                    }
                    
                    const overlapsContainer = document.createElement('div')
                    overlapsContainer.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:16;'
                    intervalBlock.appendChild(overlapsContainer)

                    const labelsContainer = document.createElement('div')
                    labelsContainer.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:25;'
                    intervalBlock.appendChild(labelsContainer)
                    
                    const renderOverlaps = () => {
                        overlapsContainer.innerHTML = ''
                        const currentIntervals = []
                        matrixKeys.forEach(mKey => {
                            const tEl = tConfig.transformGroupData[mKey]
                            if (tEl && tEl.transform_interval) {
                                currentIntervals.push({
                                    start: parseFloat(tEl.transform_interval.start),
                                    end: parseFloat(tEl.transform_interval.end)
                                })
                            }
                        })
                        
                        for (let i = 0; i < currentIntervals.length; i++) {
                            for (let j = i + 1; j < currentIntervals.length; j++) {
                                const start = Math.max(currentIntervals[i].start, currentIntervals[j].start)
                                const end = Math.min(currentIntervals[i].end, currentIntervals[j].end)
                                if (start < end) {
                                    const sPct = (start - activeObj.startTime) / (activeObj.endTime - activeObj.startTime)
                                    const ePct = (end - activeObj.startTime) / (activeObj.endTime - activeObj.startTime)
                                    
                                    const overlapDiv = document.createElement('div')
                                    overlapDiv.style.position = 'absolute'
                                    overlapDiv.style.left = `${sPct * 100}%`
                                    overlapDiv.style.width = `${(ePct - sPct) * 100}%`
                                    overlapDiv.style.height = '6px'
                                    overlapDiv.style.top = '3px'
                                    overlapDiv.style.backgroundImage = 'repeating-linear-gradient(45deg, rgba(255,255,255,0.6), rgba(255,255,255,0.6) 2px, transparent 2px, transparent 4px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.6), rgba(255,255,255,0.6) 2px, transparent 2px, transparent 4px)'
                                    overlapDiv.style.backgroundSize = 'auto'
                                    overlapDiv.style.backgroundColor = 'transparent'
                                    overlapsContainer.appendChild(overlapDiv)
                                }
                            }
                        }
                    }
                    renderOverlaps()

                    for (let i = 0; i < matrixKeys.length; i++) {
                        const matrixKey = matrixKeys[i]
                        const tElementConfig = tConfig.transformGroupData[matrixKey]
                        if (!tElementConfig) continue
                        
                        const tInterval = tElementConfig.transform_interval
                        const markerColor = tConfig.markerColor || '#ffffff'
                        const sTimeVal = parseFloat(tInterval.start)
                        const eTimeVal = parseFloat(tInterval.end)
                        const sPct = (sTimeVal - activeObj.startTime) / (activeObj.endTime - activeObj.startTime)
                        const ePct = (eTimeVal - activeObj.startTime) / (activeObj.endTime - activeObj.startTime)

                        const tmarkerThread = document.createElement('div')
                        tmarkerThread.className = 'tmarker-thread'
                        tmarkerThread.dataset.matrixIndex = i
                        tmarkerThread.dataset.transformKey = tKey
                        tmarkerThread.style.position = 'absolute'
                        tmarkerThread.style.left = `${sPct * 100}%`
                        tmarkerThread.style.width = `${(ePct - sPct) * 100}%`
                        tmarkerThread.style.height = '6px'
                        tmarkerThread.style.top = '3px'
                        tmarkerThread.style.zIndex = '15'
                        tmarkerThread.style.pointerEvents = 'auto'
                        tmarkerThread.style.cursor = 'pointer'
                        tmarkerThread.style.userSelect = 'none'
                        tmarkerThread.style.webkitUserSelect = 'none'
                        
                        tmarkerThread.style.backgroundColor = markerColor
                        tmarkerThread.style.backgroundImage = 'none'
                        tmarkerThread.style.setProperty('opacity', '1', 'important')
                        
                        const threadLabelContainer = document.createElement('div')
                        threadLabelContainer.className = 'tmarker-thread-label-container'
                        threadLabelContainer.dataset.matrixIndex = i
                        threadLabelContainer.dataset.transformKey = tKey
                        threadLabelContainer.style.position = 'absolute'
                        threadLabelContainer.style.left = `${sPct * 100}%`
                        threadLabelContainer.style.width = `${(ePct - sPct) * 100}%`
                        threadLabelContainer.style.height = '6px'
                        threadLabelContainer.style.top = '3px'
                        threadLabelContainer.style.display = 'flex'
                        threadLabelContainer.style.alignItems = 'center'
                        threadLabelContainer.style.justifyContent = 'center'
                        threadLabelContainer.style.pointerEvents = 'none'

                        const threadLabel = document.createElement('span')
                        threadLabel.className = 'tmarker-thread-label'
                        threadLabel.innerText = (i + 1).toString()
                        const counterScale = window.isIntervalBlockZoomed ? 0.4 : 1
                        threadLabel.style.cssText = `position: relative; z-index: 7; color: #000; font-size: 8px; font-weight: bold; font-family: monospace; pointer-events: none; user-select: none; opacity: 0.8; background-color: rgba(255,255,255,0.7); padding: 0 2px; border-radius: 2px; transition: all 0.2s; transform: scaleY(${counterScale}); display: ${window.isIntervalBlockZoomed ? 'block' : 'none'};`
                        
                        threadLabelContainer.appendChild(threadLabel)
                        labelsContainer.appendChild(threadLabelContainer)

                        tmarkerThread.addEventListener('mousemove', (e) => {
                            if (e.buttons > 0) {
                                const threadTooltip = document.getElementById('tmarker-thread-tooltip')
                                if (threadTooltip) threadTooltip.style.display = 'none'
                                return
                            }
                            
                            let threadTooltip = document.getElementById('tmarker-thread-tooltip')
                            if (!threadTooltip) {
                                threadTooltip = document.createElement('div')
                                threadTooltip.id = 'tmarker-thread-tooltip'
                                threadTooltip.style.cssText = 'position:fixed; background:#2a2a2a; color:#fff; border:1px solid #555; padding:4px 8px; font-size:10px; font-family:monospace; border-radius:3px; pointer-events:none; z-index:10000;'
                                document.body.appendChild(threadTooltip)
                            }
                            
                            const isActive = threadLabel.classList.contains('active-thread-label')
                            threadTooltip.innerText = isActive ? 'double-click to de-select element' : 'double-click to select element'
                            threadTooltip.style.left = (e.clientX + 10) + 'px'
                            threadTooltip.style.top = (e.clientY + 15) + 'px'
                            threadTooltip.style.display = 'block'
                        })

                        tmarkerThread.addEventListener('mouseleave', () => {
                            const threadTooltip = document.getElementById('tmarker-thread-tooltip')
                            if (threadTooltip) threadTooltip.style.display = 'none'
                        })

                        intervalBlock.appendChild(tmarkerThread)

                        const createInteractiveMarker = (isStart, currentPct) => {
                            const marker = document.createElement('div')
                            marker.className = 'tmarker-handle'
                            marker.dataset.isStart = isStart
                            marker.dataset.matrixIndex = i
                            marker.dataset.transformKey = tKey
                            marker.style.position = 'absolute'
                            const markerPct = currentPct * 100
                            marker.style.left = `${markerPct}%`
                            marker.style.top = '0'
                            marker.style.bottom = '0'
                            marker.style.width = '12px'
                            marker.style.padding = '0 5px'
                            marker.style.boxSizing = 'border-box'
                            marker.style.backgroundClip = 'content-box'
                            marker.style.transform = 'translateX(-50%)'
                            marker.style.backgroundColor = markerColor
                            
                            const arrow = document.createElement('div')
                            arrow.className = 'tmarker-arrow'
                            arrow.style.position = 'absolute'
                            arrow.style.top = '50%'
                            arrow.style.transform = 'translateY(-50%)'
                            arrow.style.width = '0'
                            arrow.style.height = '0'
                            arrow.style.borderTop = '2px solid transparent'
                            arrow.style.borderBottom = '2px solid transparent'
                            
                            if (isStart) {
                                arrow.style.left = '7px'
                                arrow.style.borderLeft = '3px solid #000'
                            } else {
                                arrow.style.right = '7px'
                                arrow.style.borderRight = '3px solid #000'
                            }
                            marker.appendChild(arrow)
                            
                            // Initializes unlocked to allow direct double-click selection while dragging requires active state
                            marker.style.cursor = 'pointer'
                            marker.style.zIndex = '30'
                            marker.style.pointerEvents = 'auto'
                            
                            marker.title = `Transform Element ${i + 1} (${isStart ? 'Start' : 'End'}) (double-click to edit transform object)`

                            marker.ondblclick = (e) => {
                                e.stopPropagation()
                                const tRows = document.getElementById('transforms-rows')
                                if (tRows) {
                                    const row = Array.from(tRows.children).find(r => r.dataset.transformKey === tKey)
                                    if (row) {
                                        const cfg = JSON.parse(row.dataset.transformConfig || '{}')
                                        cfg.activeTransformEditIndex = i
                                        row.dataset.transformConfig = JSON.stringify(cfg)
                                        if (typeof row.renderMatrixGrid === 'function') row.renderMatrixGrid()
                                        row.click()
                                    }
                                }
                                tmarkerThread.ondblclick(e)
                            }
                            
                            marker.onmousedown = (e) => {
                                const isActive = threadLabel.classList.contains('active-thread-label')
                                if (!isActive) return
                                
                                e.preventDefault()
                                e.stopPropagation()
                                marker.isDragging = true
                                
                                // Elevates the active thread and its label to the top of the z-index stack during drag to ensure it overlaps
                                if (tmarkerThread.parentNode) {
                                    tmarkerThread.parentNode.appendChild(tmarkerThread)
                                }
                                if (threadLabelContainer.parentNode) {
                                    threadLabelContainer.parentNode.appendChild(threadLabelContainer)
                                }
                                
                                const startX = e.clientX
                                const initialPct = (isStart ? parseFloat(tInterval.start) - activeObj.startTime : parseFloat(tInterval.end) - activeObj.startTime) / (activeObj.endTime - activeObj.startTime)
                                const parentRect = durationLine.getBoundingClientRect()
                                
                                // Caches the DOM queries outside the high-frequency mousemove listener to prevent layout blocking
                                const tRows = document.getElementById('transforms-rows')
                                let cachedSidebarGroup = null
                                if (tRows) {
                                    const row = Array.from(tRows.children).find(r => r.dataset.transformKey === tKey)
                                    if (row) {
                                        cachedSidebarGroup = row.querySelector(isStart ? '[data-target="start"]' : '[data-target="end"]')
                                    }
                                }
                                
                                const onMouseMove = (moveEvent) => {
                                    const delta = (moveEvent.clientX - startX) / parentRect.width
                                    let newPct = initialPct + delta
                                    
                                    newPct = Math.max(0, Math.min(newPct, 1))
                                    
                                    if (isStart) {
                                        const endPct = (parseFloat(tInterval.end) - activeObj.startTime) / (activeObj.endTime - activeObj.startTime)
                                        newPct = Math.min(newPct, endPct)
                                    } else {
                                        const startPctVal = (parseFloat(tInterval.start) - activeObj.startTime) / (activeObj.endTime - activeObj.startTime)
                                        newPct = Math.max(newPct, startPctVal)
                                    }
                                    
                                    const currentMarkerPct = newPct * 100
                                    marker.style.left = `${currentMarkerPct}%`
                                    marker.style.top = '0'
                                    
                                    const newTime = activeObj.startTime + (newPct * (activeObj.endTime - activeObj.startTime))
                                    if (isStart) tInterval.start = newTime.toFixed(3) + 's'
                                    else tInterval.end = newTime.toFixed(3) + 's'
                                    
                                    // Dynamically updates JSON config silently to prevent UI blocking
                                    activeObj.node.setAttr('transformGroupData', tGroupData)
                                    
                                    // Dynamically shrinks or stretches the physical tmarker thread as boundaries shift
                                    if (isStart) {
                                        tmarkerThread.style.left = `${currentMarkerPct}%`
                                        threadLabelContainer.style.left = `${currentMarkerPct}%`
                                        const endPctVal = (parseFloat(tInterval.end) - activeObj.startTime) / (activeObj.endTime - activeObj.startTime)
                                        tmarkerThread.style.width = `${(endPctVal - newPct) * 100}%`
                                        threadLabelContainer.style.width = `${(endPctVal - newPct) * 100}%`
                                    } else {
                                        const startPctVal = (parseFloat(tInterval.start) - activeObj.startTime) / (activeObj.endTime - activeObj.startTime)
                                        tmarkerThread.style.width = `${(newPct - startPctVal) * 100}%`
                                        threadLabelContainer.style.width = `${(newPct - startPctVal) * 100}%`
                                    }
                                    
                                    // Invokes rendering engine to update marker labels in real-time
                                    if (window.activeTMarkerThreadRenderer) window.activeTMarkerThreadRenderer()
                                    renderOverlaps()
                                    
                                    if (cachedSidebarGroup) {
                                        const p = getTimeParts(isStart ? parseFloat(tInterval.start) : parseFloat(tInterval.end))
                                        cachedSidebarGroup.querySelector('[data-type="h"]').innerText = p.h
                                        cachedSidebarGroup.querySelector('[data-type="m"]').innerText = p.m
                                        cachedSidebarGroup.querySelector('[data-type="s"]').innerText = p.s
                                        cachedSidebarGroup.querySelector('[data-type="ms"]').innerText = p.ms
                                    }
                                }
                                
                                const onMouseUp = () => {
                                    marker.isDragging = false
                                    document.removeEventListener('mousemove', onMouseMove)
                                    document.removeEventListener('mouseup', onMouseUp)
                                    
                                    activeObj.node.setAttr('transformGroupData', tGroupData)
                                    const tRows = document.getElementById('transforms-rows')
                                    if (tRows) {
                                        const row = Array.from(tRows.children).find(r => r.dataset.transformKey === tKey)
                                        if (row) {
                                            row.dataset.transformConfig = JSON.stringify(tConfig)
                                            const sGroup = row.querySelector('[data-target="start"]')
                                            const eGroup = row.querySelector('[data-target="end"]')
                                            if (tInterval) {
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
                                    }
                                    // Heavy JSON stringification shifted entirely to mouseup to keep drag buttery smooth
                                    if (window.updateAdvancedConfigDisplay) window.updateAdvancedConfigDisplay()
                                    if (typeof renderMultiTrackTimeline === 'function') renderMultiTrackTimeline()
                                }
                                
                                document.addEventListener('mousemove', onMouseMove)
                                document.addEventListener('mouseup', onMouseUp)
                            }
                            
                            intervalBlock.appendChild(marker)
                            return marker
                        }

                        const sMarker = createInteractiveMarker(true, sPct)
                        const eMarker = createInteractiveMarker(false, ePct)

                        tmarkerThread.ondblclick = (e) => {
                            if (e && e.preventDefault) e.preventDefault()
                            if (e && e.stopPropagation) e.stopPropagation()
                            
                            // Elevates the active thread and its label to the top of the z-index stack when selected
                            if (tmarkerThread.parentNode) {
                                tmarkerThread.parentNode.appendChild(tmarkerThread)
                            }
                            if (threadLabelContainer.parentNode) {
                                threadLabelContainer.parentNode.appendChild(threadLabelContainer)
                            }
                            
                            if (!window.isIntervalBlockZoomed) {
                                intervalBlock.style.transition = 'transform 0.2s ease'
                                window.isIntervalBlockZoomed = true
                                applyZoomState()
                                
                                const blockTooltip = document.getElementById('interval-block-tooltip')
                                if (blockTooltip) {
                                    blockTooltip.innerText = 'double-click to revert'
                                }
                            }

                            const ruler = intervalBlock.querySelector('.zoom-ruler')
                            if (!ruler) return
                            
                            const isActive = threadLabel.classList.contains('active-thread-label')
                            
                            if (isActive) {
                                if (e && e.isSyntheticAutoSelect) return
                                
                                threadLabel.classList.remove('active-thread-label')
                                threadLabel.style.opacity = '0.8'
                                threadLabel.style.color = '#000'
                                threadLabel.style.backgroundColor = 'rgba(255,255,255,0.7)'
                                threadLabel.style.padding = '0 2px'
                                
                                sMarker.style.pointerEvents = 'auto'
                                sMarker.style.cursor = 'pointer'
                                sMarker.style.top = '0'
                                const sArrow = sMarker.querySelector('.tmarker-arrow')
                                if (sArrow) sArrow.style.borderLeftColor = '#000'
                                
                                eMarker.style.pointerEvents = 'auto'
                                eMarker.style.cursor = 'pointer'
                                eMarker.style.top = '0'
                                const eArrow = eMarker.querySelector('.tmarker-arrow')
                                if (eArrow) eArrow.style.borderRightColor = '#000'
                                
                                ruler.querySelectorAll('span').forEach(span => {
                                    span.style.color = '#aaa'
                                    span.style.opacity = '1'
                                })
                                
                                ruler.querySelectorAll('.s-dyn-ruler-val, .e-dyn-ruler-val').forEach(el => el.remove())
                                
                                const threadTooltip = document.getElementById('tmarker-thread-tooltip')
                                if (threadTooltip) threadTooltip.innerText = 'double-click to select element'
                                
                                ruler.querySelectorAll('.cap-dyn-ruler-val').forEach(el => el.style.display = 'block')
                                
                                window.activeTMarkerThreadRenderer = null
                                return
                            }
                            
                            // Unlocks draggability specifically for the double-clicked thread's markers
                            document.querySelectorAll('.tmarker-handle').forEach(m => {
                                m.style.pointerEvents = 'auto'
                                m.style.cursor = 'pointer'
                                m.style.top = '0'
                            })
                            sMarker.style.pointerEvents = 'auto'
                            sMarker.style.cursor = 'ew-resize'
                            sMarker.style.top = '0'
                            eMarker.style.pointerEvents = 'auto'
                            eMarker.style.cursor = 'ew-resize'
                            eMarker.style.top = '0'

                            // Highlight this thread label, reset others
                            document.querySelectorAll('.tmarker-thread-label').forEach(lbl => {
                                lbl.classList.remove('active-thread-label')
                                lbl.style.opacity = '0.8'
                                lbl.style.color = '#000'
                                lbl.style.textShadow = 'none'
                                lbl.style.backgroundColor = 'rgba(255,255,255,0.7)'
                                lbl.style.padding = '0 2px'
                                lbl.style.borderRadius = '2px'
                                lbl.style.fontSize = '8px'
                            })
                            
                            document.querySelectorAll('.tmarker-arrow').forEach(arr => {
                                if (arr.style.borderLeftColor) arr.style.borderLeftColor = '#000'
                                if (arr.style.borderRightColor) arr.style.borderRightColor = '#000'
                            })
                            
                            threadLabel.classList.add('active-thread-label')
                            threadLabel.style.opacity = '1'
                            threadLabel.style.color = '#000'
                            threadLabel.style.backgroundColor = '#ffffff'
                            threadLabel.style.textShadow = 'none'
                            threadLabel.style.padding = '1px 3px'
                            threadLabel.style.borderRadius = '2px'
                            threadLabel.style.fontSize = '8px'
                            
                            const sArrowAct = sMarker.querySelector('.tmarker-arrow')
                            if (sArrowAct) sArrowAct.style.borderLeftColor = '#ffffff'
                            const eArrowAct = eMarker.querySelector('.tmarker-arrow')
                            if (eArrowAct) eArrowAct.style.borderRightColor = '#ffffff'
                            
                            const threadTooltip = document.getElementById('tmarker-thread-tooltip')
                            if (threadTooltip) threadTooltip.innerText = 'double-click to de-select element'
                            
                            ruler.querySelectorAll('.s-dyn-ruler-val, .e-dyn-ruler-val').forEach(el => el.remove())

                            ruler.querySelectorAll('.cap-dyn-ruler-val').forEach(el => el.style.display = 'none')

                            let cachedRulerRectWidth = null;

                            window.activeTMarkerThreadRenderer = () => {
                                const sTimeVal = parseFloat(tInterval.start)
                                const eTimeVal = parseFloat(tInterval.end)
                                const sPctVal = (sTimeVal - activeObj.startTime) / (activeObj.endTime - activeObj.startTime)
                                const ePctVal = (eTimeVal - activeObj.startTime) / (activeObj.endTime - activeObj.startTime)
                                
                                const sValLabel = sMarker.querySelector('.tmarker-val-label')
                                const eValLabel = eMarker.querySelector('.tmarker-val-label')
                                
                                if (sValLabel) sValLabel.style.display = 'none'
                                if (eValLabel) eValLabel.style.display = 'none'
                                
                                const currentRuler = intervalBlock.querySelector('.zoom-ruler')
                                if (currentRuler && window.isIntervalBlockZoomed) {
                                    // Caches the width to prevent massive layout thrashing and freezing during high-speed drag
                                    if (!cachedRulerRectWidth) {
                                        cachedRulerRectWidth = currentRuler.getBoundingClientRect().width;
                                    }
                                    
                                    const timePerPixel = (activeObj.endTime - activeObj.startTime) / (cachedRulerRectWidth || 1000)
                                    const thresholdTime = timePerPixel * 35 // 35px is the safe bounding box for the monospace time string
                                    
                                    currentRuler.querySelectorAll('.default-ruler-tick span, .end-ruler-tick span').forEach(span => {
                                        span.style.color = '#aaa'
                                        const tickTime = parseFloat(span.innerText)
                                        if (Math.abs(tickTime - sTimeVal) < thresholdTime || Math.abs(tickTime - eTimeVal) < thresholdTime) {
                                            span.style.opacity = '0'
                                        } else {
                                            span.style.opacity = '1'
                                        }
                                    })
                                    
                                    let sDyn = currentRuler.querySelector('.s-dyn-ruler-val')
                                    if (!sDyn) {
                                        sDyn = document.createElement('span')
                                        sDyn.className = 's-dyn-ruler-val'
                                        sDyn.style.cssText = `position:absolute; bottom:2px; color:${markerColor}; font-size:8px; font-family:monospace; transform-origin:left bottom; z-index:20; pointer-events:none;`
                                        currentRuler.appendChild(sDyn)
                                    }
                                    let eDyn = currentRuler.querySelector('.e-dyn-ruler-val')
                                    if (!eDyn) {
                                        eDyn = document.createElement('span')
                                        eDyn.className = 'e-dyn-ruler-val'
                                        eDyn.style.cssText = `position:absolute; bottom:2px; color:${markerColor}; font-size:8px; font-family:monospace; transform-origin:left bottom; z-index:20; pointer-events:none;`
                                        currentRuler.appendChild(eDyn)
                                    }
                                    
                                    sDyn.innerText = sTimeVal.toFixed(3) + 's'
                                    sDyn.style.left = `calc(${sPctVal * 100}% + 4px)`
                                    
                                    eDyn.innerText = eTimeVal.toFixed(3) + 's'
                                    eDyn.style.left = `calc(${ePctVal * 100}% + 4px)`
                                }
                            }
                            
                            window.activeTMarkerThreadRenderer()
                            
                            const tRows = document.getElementById('transforms-rows')
                            if (tRows && (!e || !e.isSyntheticAutoSelect)) {
                                const matchedRow = Array.from(tRows.children).find(r => r.dataset.transformKey === tKey)
                                if (matchedRow) {
                                    const mIdx = parseInt(tmarkerThread.dataset.matrixIndex, 10)
                                    const matrixBtn = matchedRow.querySelector(`.transform-element-${mIdx + 1}`)
                                    if (matrixBtn) {
                                        let needsClick = true
                                        try {
                                            const cfg = JSON.parse(matchedRow.dataset.transformConfig)
                                            if (cfg.activeTransformEditIndex === mIdx) needsClick = false
                                        } catch(err) {}
                                        if (needsClick) matrixBtn.click()
                                    }
                                }
                            }
                        }
                    }
                }
            })
        }
    }
    
    const startCursor = document.createElement('div')
    startCursor.style.position = 'absolute'
    startCursor.style.left = '0%'
    startCursor.style.width = '4px'
    startCursor.style.height = '100%'
    startCursor.style.top = '0'
    startCursor.style.transform = 'translateX(-50%)' // restores true center alignment
    startCursor.style.backgroundColor = activeObj.timeLocked ? '#aaa' : '#fff'
    startCursor.style.cursor = activeObj.timeLocked ? 'default' : 'ew-resize'
    startCursor.style.zIndex = '20'
    startCursor.title = activeObj.timeLocked ? 'Locked' : formatTime(activeObj.startTime)

    const endCursor = document.createElement('div')
    endCursor.style.position = 'absolute'
    endCursor.style.left = '100%'
    endCursor.style.width = '4px'
    endCursor.style.height = '100%'
    endCursor.style.top = '0'
    endCursor.style.transform = 'translateX(-50%)' // restores true center alignment
    endCursor.style.backgroundColor = activeObj.timeLocked ? '#aaa' : '#fff'
    endCursor.style.cursor = activeObj.timeLocked ? 'default' : 'ew-resize'
    endCursor.style.zIndex = '20'
    endCursor.title = activeObj.timeLocked ? 'Locked' : formatTime(activeObj.endTime)

    durationLine.style.pointerEvents = 'auto'
    startCursor.style.pointerEvents = 'auto'
    endCursor.style.pointerEvents = 'auto'

    intervalBlock.appendChild(durationLine)
    intervalBlock.appendChild(startCursor)
    intervalBlock.appendChild(endCursor)
    lane.appendChild(intervalBlock)


    if (activeObj.timeLocked) return

    let isDraggingBlock = false
    let dragMode = null
    let dragStartX = 0
    let initialStart = 0
    let initialEnd = 0
    let duration = 0
    let minAllowedStart = 0
    let maxAllowedStart = Infinity
    let minAllowedEnd = 0
    let maxAllowedEnd = Infinity

    const onMouseDown = (mode) => (e) => {
        // Prevents native browser ghost dragging
        e.preventDefault()
        e.stopPropagation()
        isDraggingBlock = true
        dragMode = mode
        dragStartX = e.clientX
        initialStart = activeObj.startTime
        initialEnd = activeObj.endTime
        duration = activeObj.endTime - activeObj.startTime
        
        minAllowedStart = 0
        maxAllowedStart = initialEnd - 0.3
        minAllowedEnd = initialStart + 0.3
        
        const video = document.getElementById('main-video')
        maxAllowedEnd = video && video.duration ? video.duration : Infinity
        
        if (activeObj.node && activeObj.node.getAttr('transformGroupName')) {
            const tGroupData = activeObj.node.getAttr('transformGroupData')
            if (tGroupData) {
                let earliestStart = Infinity
                let latestEnd = -Infinity
                Object.keys(tGroupData).forEach(tKey => {
                    const cfg = tGroupData[tKey]
                    if (cfg && cfg.transformGroupData) {
                        Object.keys(cfg.transformGroupData).forEach(mKey => {
                            const tInv = cfg.transformGroupData[mKey].transform_interval
                            if (tInv) {
                                if (tInv.start !== undefined) earliestStart = Math.min(earliestStart, parseFloat(tInv.start))
                                if (tInv.end !== undefined) latestEnd = Math.max(latestEnd, parseFloat(tInv.end))
                            }
                        })
                    }
                })
                if (earliestStart !== Infinity) maxAllowedStart = Math.min(maxAllowedStart, earliestStart)
                if (latestEnd !== -Infinity) minAllowedEnd = Math.max(minAllowedEnd, latestEnd)
            }
        }
        
        // Prevents text highlighting across the page while dragging the interval block
        document.body.style.userSelect = 'none'
        
        // Disables scrubber pointer events during drag to prevent interaction bleed
        const sWrap = document.getElementById('scrubber-wrap')
        if (sWrap) sWrap.style.pointerEvents = 'none'
        
        if (mode === 'move') durationLine.style.cursor = 'grabbing'
        
        if (mode === 'start' || mode === 'end') {
            const jumpTime = mode === 'start' ? activeObj.startTime : activeObj.endTime
            
            video.pause()
            const playBtn = document.getElementById('play-pause-btn')
            if (playBtn) playBtn.innerText = 'Play'
            
            // Hands off the jump request to the scrub engine
            window.targetScrubTime = jumpTime
            
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

    // bypasses drop timeout logic and jumps perfectly to interval bounds
    const onCursorDblClick = (mode) => (e) => {
        e.stopPropagation()
        if (window.endTimePreviewTimeout) {
            clearTimeout(window.endTimePreviewTimeout)
            window.endTimePreviewTimeout = null
        }
        
        const jumpTime = mode === 'start' ? activeObj.startTime : activeObj.endTime
        
        video.pause()
        const playBtn = document.getElementById('play-pause-btn')
        if (playBtn) playBtn.innerText = 'Play'
        
        window.targetScrubTime = jumpTime
        
        const scrubber = document.getElementById('timeline-scrubber')
        const progress = document.getElementById('scrubber-progress')
        if (scrubber && progress && video.duration) {
            scrubber.value = jumpTime
            progress.style.width = (jumpTime / video.duration) * 100 + '%'
        }

        // Passes marker selection logic directly to the start cursor to safely access row-1
        if (mode === 'start' && activeObj && activeObj.node) {
            if (activeObj.node.getAttr('transformGroupName')) {
                activeObj.node.setAttr('activeTransformEditIndex', 0)
                const tRows = document.getElementById('transforms-rows')
                if (tRows && tRows.children.length > 0) {
                    const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true })
                    tRows.children[0].dispatchEvent(dblClickEvent)
                }
            } else if (activeObj.node.getAttr('captionsGroupName')) {
                activeObj.node.setAttr('activeCaptionEditIndex', 0)
                switchTab('layers-tab')
                openTextEditor(activeObj.node)
            }
        }
    }

    durationLine.addEventListener('mousedown', onMouseDown('move'))
    startCursor.addEventListener('mousedown', onMouseDown('start'))
    endCursor.addEventListener('mousedown', onMouseDown('end'))
    
    startCursor.addEventListener('dblclick', onCursorDblClick('start'))
    endCursor.addEventListener('dblclick', onCursorDblClick('end'))

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
            if (newStart < minAllowedStart) newStart = minAllowedStart
            if (newStart > maxAllowedStart) newStart = maxAllowedStart
        } else if (dragMode === 'end') {
            newEnd = initialEnd + deltaTime
            if (newEnd < minAllowedEnd) newEnd = minAllowedEnd
            if (newEnd > maxAllowedEnd) newEnd = maxAllowedEnd
        }

        activeObj.startTime = newStart
        activeObj.endTime = newEnd
        
        const startPct = (newStart / video.duration) * 100
        const widthPct = ((newEnd - newStart) / video.duration) * 100
        
        intervalBlock.style.left = startPct + '%'
        intervalBlock.style.width = widthPct + '%'

        // dynamically recalculates absolute time percentages for transform markers to prevent visual stretching
        intervalBlock.querySelectorAll('.tmarker-thread, .tmarker-thread-label-container').forEach(thread => {
            const mIdx = thread.dataset.matrixIndex
            const tKey = thread.dataset.transformKey
            const tGroupData = activeObj.node.getAttr('transformGroupData')
            if (tGroupData && tGroupData[tKey] && tGroupData[tKey].transformGroupData && tGroupData[tKey].transformGroupData[mIdx]) {
                const tEl = tGroupData[tKey].transformGroupData[mIdx]
                const tInv = tEl.transform_interval
                if (tInv) {
                    const sPctVal = (parseFloat(tInv.start) - newStart) / (newEnd - newStart)
                    const ePctVal = (parseFloat(tInv.end) - newStart) / (newEnd - newStart)
                    thread.style.left = `${sPctVal * 100}%`
                    thread.style.width = `${(ePctVal - sPctVal) * 100}%`
                }
            }
        })
        
        intervalBlock.querySelectorAll('.tmarker-handle').forEach(marker => {
            const mIdx = marker.dataset.matrixIndex
            const tKey = marker.dataset.transformKey
            const isStart = marker.dataset.isStart === 'true'
            const tGroupData = activeObj.node.getAttr('transformGroupData')
            if (tGroupData && tGroupData[tKey] && tGroupData[tKey].transformGroupData && tGroupData[tKey].transformGroupData[mIdx]) {
                const tEl = tGroupData[tKey].transformGroupData[mIdx]
                const tInv = tEl.transform_interval
                if (tInv) {
                    const timeVal = isStart ? parseFloat(tInv.start) : parseFloat(tInv.end)
                    const pctVal = (timeVal - newStart) / (newEnd - newStart)
                    marker.style.left = `${pctVal * 100}%`
                }
            }
        })
        
        // dynamically synchronizes equivalent multi-track block dimensions
        const multiBlock = document.getElementById(`multi-track-block-${activeObj.id}`)
        if (multiBlock) {
            multiBlock.style.left = startPct + '%'
            multiBlock.style.width = widthPct + '%'
        }
        
        startCursor.title = formatTime(newStart)
        endCursor.title = formatTime(newEnd)

        let targetTime = video.currentTime
        if (dragMode === 'start') {
            targetTime = newStart
        } else if (dragMode === 'end') {
            targetTime = newEnd
        }

        // 1 Sync UI elements instantly without waiting for the video decoder
        if (dragMode !== 'move') {
            const scrubber = document.getElementById('timeline-scrubber')
            const progress = document.getElementById('scrubber-progress')
            if (scrubber && progress && video.duration) {
                scrubber.value = targetTime
                progress.style.width = (targetTime / video.duration) * 100 + '%'
            }
        }
        
        updateTimePanelUI(activeObj)
        
        const isVisible = targetTime >= activeObj.startTime && targetTime <= activeObj.endTime
        activeObj.node.opacity(isVisible ? 1 : 0)
        
        // 2 Dynamically redraw measurement ruler if in zoom state
        if (window.isIntervalBlockZoomed) {
            updateRulerTicks()
        }

        // 3 Feed the physical time to the background scrub engine
        if (dragMode !== 'move') {
            window.targetScrubTime = targetTime
        }
    }

    const onCursorDrop = () => {
        isDraggingBlock = false
        const droppedMode = dragMode
        dragMode = null
        durationLine.style.cursor = 'grab'
        
        // Restores default text selection behavior after dropping
        document.body.style.userSelect = ''
        
        // Restores scrubber pointer events after dropping
        const sWrap = document.getElementById('scrubber-wrap')
        if (sWrap) sWrap.style.pointerEvents = ''
        
        document.removeEventListener('mousemove', onCursorDrag)
        document.removeEventListener('mouseup', onCursorDrop)

        if (droppedMode === 'end') {
            // clears existing timeout to prevent overlapping executions
            if (window.endTimePreviewTimeout) clearTimeout(window.endTimePreviewTimeout)
            
            // delays timeline reset to provide visual confirmation of end frame
            window.endTimePreviewTimeout = setTimeout(() => {
                const video = document.getElementById('main-video')
                if (activeObj && video) {
                    window.targetScrubTime = activeObj.startTime
                    const scrubber = document.getElementById('timeline-scrubber')
                    const progress = document.getElementById('scrubber-progress')
                    if (scrubber && progress && video.duration) {
                        scrubber.value = activeObj.startTime
                        progress.style.width = (activeObj.startTime / video.duration) * 100 + '%'
                    }
                }
            }, 600)
        }
        
        renderMultiTrackTimeline()
    }
}

// binds interactions for the timeline and time scrubbing
export function initTimelineBindings() {
    // dynamically tracks the physical thumb position to restrict the hover hint display
    const scrubberWrap = document.getElementById('scrubber-wrap')
    const scrubber = document.getElementById('timeline-scrubber')
    const video = document.getElementById('main-video')
    
    if (scrubberWrap && scrubber && video) {
        window.isDraggingScrubber = false

        document.addEventListener('mouseup', () => {
            if (window.isDraggingScrubber) {
                window.isDraggingScrubber = false
                const hoverTooltip = document.getElementById('hover-tooltip')
                if (hoverTooltip) hoverTooltip.style.display = ''
                
                // Safely dismisses the enlarged tooltip if the drag ends outside the hover boundary
                if (window.isIntervalBlockZoomed) {
                    if (scrubberWrap && !scrubberWrap.matches(':hover')) {
                        const zoomTooltip = document.getElementById('zoom-hover-tooltip')
                        if (zoomTooltip) zoomTooltip.style.display = 'none'
                    }
                }
            }
        })

        scrubberWrap.addEventListener('dblclick', () => scrubberWrap.classList.add('hide-hint'))
        scrubberWrap.addEventListener('mouseleave', () => {
            // Actively prevents the tooltip from disappearing if cursor strays while dragging in zoom state
            if (window.isDraggingScrubber && window.isIntervalBlockZoomed) return

            scrubberWrap.classList.remove('hide-hint')
            scrubberWrap.classList.remove('hover-handle')
            
            const zoomTooltip = document.getElementById('zoom-hover-tooltip')
            if (zoomTooltip) zoomTooltip.style.display = 'none'
            
            // Safely resets the native tooltip's visibility state when the mouse completely leaves the track
            const hoverTooltip = document.getElementById('hover-tooltip')
            if (hoverTooltip) hoverTooltip.style.display = ''
        })

        scrubberWrap.addEventListener('mousemove', (e) => {
            if (!video.duration) return
            
            const rect = scrubberWrap.getBoundingClientRect() 
            
            const hoverX = e.clientX - rect.left
            const thumbX = (scrubber.value / video.duration) * rect.width
            
            const isHoveringHandle = Math.abs(hoverX - thumbX) < 15
            
            if (isHoveringHandle || window.isIntervalBlockZoomed) {
                scrubberWrap.classList.add('hover-handle')
                scrubber.classList.add('hover-handle')
            } else {
                scrubberWrap.classList.remove('hover-handle')
                scrubber.classList.remove('hover-handle')
            }

            let hoverTime = (hoverX / rect.width) * video.duration
            
            hoverTime = Math.max(0, Math.min(hoverTime, video.duration))
            hoverTime = Math.round(hoverTime * 1000) / 1000
            const p = getTimeParts(hoverTime)
            
            let msStr = ''
            if (window.isIntervalBlockZoomed) {
                const msVal = String(p.ms || '0').padStart(3, '0')
                msStr = ':' + msVal.substring(0, 2)
            }
            
            const finalStr = `${p.h}:${p.m}:${p.s}${msStr}`
            
            scrubber.setAttribute('hover-tooltip', finalStr)
            scrubberWrap.setAttribute('hover-tooltip', finalStr)
            
            const hoverTooltip = document.getElementById('hover-tooltip')
            let zoomTooltip = document.getElementById('zoom-hover-tooltip')
            
            if (window.isIntervalBlockZoomed) {
                if (!zoomTooltip) {
                    zoomTooltip = document.createElement('div')
                    zoomTooltip.id = 'zoom-hover-tooltip'
                    zoomTooltip.style.cssText = 'position:fixed; background:#2a2a2a; color:#fff; border:1px solid #555; padding:4px 8px; font-size:10px; font-family:monospace; border-radius:3px; pointer-events:none; z-index:999999;'
                    document.body.appendChild(zoomTooltip)
                }
                
                zoomTooltip.innerText = finalStr
                zoomTooltip.style.left = e.clientX + 'px'
                const wrapRect = scrubberWrap.getBoundingClientRect()
                zoomTooltip.style.top = (wrapRect.top - 25) + 'px'
                zoomTooltip.style.transform = 'translateX(-50%)'
                zoomTooltip.style.display = 'block'
                
                if (hoverTooltip) hoverTooltip.style.display = 'none'
            } else {
                if (zoomTooltip) zoomTooltip.style.display = 'none'
                
                if (hoverTooltip) {
                    hoverTooltip.innerText = finalStr
                    
                    if (window.isDraggingScrubber || isHoveringHandle) {
                        hoverTooltip.style.display = 'none'
                    } else {
                        hoverTooltip.style.display = 'block'
                        hoverTooltip.style.zIndex = '100' // Ensures it visually displays over top of the static scrubber-tooltip
                    }
                }
            }
        })

        if (!window.scrubEngine) {
            window.scrubEngine = true
            window.targetScrubTime = null
            
            const processScrub = () => {
                const vid = document.getElementById('main-video')
                if (vid && window.targetScrubTime !== null) {
                    if (!vid.seeking) {
                        vid.currentTime = window.targetScrubTime
                        window.targetScrubTime = null
                    }
                }
                requestAnimationFrame(processScrub)
            }
            requestAnimationFrame(processScrub)
        }

        if (window.scrubSeekHandler) {
            video.removeEventListener('seeked', window.scrubSeekHandler)
            window.scrubSeekHandler = null
        }

        scrubber.addEventListener('mousedown', () => {
            window.isDraggingScrubber = true
            
            if (!window.isIntervalBlockZoomed) {
                const hoverTooltip = document.getElementById('hover-tooltip')
                if (hoverTooltip) hoverTooltip.style.display = 'none'
            }
            
            video.pause()
            const playBtn = document.getElementById('play-pause-btn')
            if (playBtn) playBtn.innerText = 'Play'
        })

        scrubber.addEventListener('input', (e) => {
            const newTime = parseFloat(e.target.value)
            if (!isNaN(newTime)) {
                const progress = document.getElementById('scrubber-progress')
                if (progress && video.duration) {
                    progress.style.width = (newTime / video.duration) * 100 + '%'
                }
                window.targetScrubTime = newTime
                
                // Mathematically locks the enlarged tooltip to the moving thumb coordinates to bypass mouseleave clipping 
                if (window.isIntervalBlockZoomed && window.isDraggingScrubber) {
                    const zoomTooltip = document.getElementById('zoom-hover-tooltip')
                    if (zoomTooltip && scrubberWrap) {
                        const rect = scrubberWrap.getBoundingClientRect()
                        const thumbX = (newTime / video.duration) * rect.width
                        const absoluteX = rect.left + thumbX
                        
                        const p = getTimeParts(newTime)
                        const msVal = String(p.ms || '0').padStart(3, '0')
                        const msStr = ':' + msVal.substring(0, 2)
                        const finalStr = `${p.h}:${p.m}:${p.s}${msStr}`
                        
                        zoomTooltip.innerText = finalStr
                        zoomTooltip.style.left = absoluteX + 'px'
                        zoomTooltip.style.top = (rect.top - 25) + 'px'
                        zoomTooltip.style.display = 'block'
                    }
                }
            }
        })
    }
    
    // creates floating arrow UI container
    let arrowControls = document.getElementById('time-segment-arrows')
    if (!arrowControls) {
        arrowControls = document.createElement('div')
        arrowControls.id = 'time-segment-arrows'
        arrowControls.style.cssText = 'position:absolute; display:none; flex-direction:column; background:#2a2a2a; border:1px solid #555; border-radius:2px; z-index:9999; box-sizing:border-box;'
        
        // Ensures both buttons are identical and perfectly spaced from the container edges
        arrowControls.innerHTML = `
            <button id="ts-up" style="background:none; border:none; color:#aaa; font-size:8px; cursor:pointer; padding:0; width:16px; flex:1; display:flex; align-items:center; justify-content:center; line-height:1; box-sizing:border-box; border-bottom:1px solid #444;">▲</button>
            <button id="ts-down" style="background:none; border:none; color:#aaa; font-size:8px; cursor:pointer; padding:0; width:16px; flex:1; display:flex; align-items:center; justify-content:center; line-height:1; box-sizing:border-box;">▼</button>
        `
        document.body.appendChild(arrowControls)
    }

    let activeTimeSegment = null
    let isDraggingTime = false
    let dragStartY = 0
    let accumulatedDelta = 0
    
    // extracts apply logic for reuse between drag and click
    const applyTimeChange = (segment, isIncrement) => {
        const video = document.getElementById('main-video')
        if (!video || !video.duration) return
        
        const group = segment.closest('.time-spinner-group')
        const targetType = group.dataset.target
        const timeType = segment.dataset.type
        
        const getNewTime = (currentSeconds) => {
            const p = getTimeParts(currentSeconds)
            let h = parseInt(p.h, 10) || 0
            let m = parseInt(p.m, 10) || 0
            let s = parseInt(p.s, 10) || 0
            let ms = parseInt(p.ms, 10) || 0

            // limits segment values to isolate time adjustments
            if (timeType === 'h') {
                h += isIncrement ? 1 : -1
                if (h < 0) h = 0
            } else if (timeType === 'm') {
                m += isIncrement ? 1 : -1
                if (m > 59) m = 59
                if (m < 0) m = 0
            } else if (timeType === 's') {
                s += isIncrement ? 1 : -1
                if (s > 59) s = 59
                if (s < 0) s = 0
            } else if (timeType === 'ms') {
                ms += isIncrement ? 50 : -50
                if (ms > 950) ms = 950
                if (ms < 0) ms = 0
            }
            
            return (h * 3600) + (m * 60) + s + (ms / 1000)
        }

        const tRow = group.closest('.transforms-list-item')
        if (tRow) {
            const cfg = JSON.parse(tRow.dataset.transformConfig)
            const activeIdx = cfg.activeTransformEditIndex || 0
            
            if (!cfg.transformGroupData) cfg.transformGroupData = {}
            if (!cfg.transformGroupData[activeIdx]) cfg.transformGroupData[activeIdx] = {}
            
            let tInterval = cfg.transformGroupData[activeIdx].transform_interval
            if (!tInterval) {
                tInterval = { start: "0.050s", end: "0.250s" }
                cfg.transformGroupData[activeIdx].transform_interval = tInterval
            }
            
            let val = getNewTime(parseFloat(tInterval[targetType] || 0))
            
            const obj = getActiveObj()
            const sBound = obj ? obj.startTime : 0
            const eBound = obj ? obj.endTime : video.duration

            // strictly enforces absolute start and end caps verifying collision limits dont mathematically push outside bounds
            if (targetType === 'start') {
                if (val < sBound) val = sBound
                if (tInterval.end !== undefined && val >= parseFloat(tInterval.end)) val = parseFloat(tInterval.end) - 0.1
                if (val < sBound) val = sBound
            } else if (targetType === 'end') {
                if (val > eBound) val = eBound
                if (tInterval.start !== undefined && val <= parseFloat(tInterval.start)) val = parseFloat(tInterval.start) + 0.1
                if (val > eBound) val = eBound
            }

            tInterval[targetType] = val.toFixed(3) + 's'
            tRow.dataset.transformConfig = JSON.stringify(cfg)
            
            const p = getTimeParts(parseFloat(tInterval[targetType]))
            group.querySelector('[data-type="h"]').innerText = p.h
            group.querySelector('[data-type="m"]').innerText = p.m
            group.querySelector('[data-type="s"]').innerText = p.s
            group.querySelector('[data-type="ms"]').innerText = p.ms
            
            if (typeof activeNode !== 'undefined' && activeNode) {
                let existingData = activeNode.getAttr('transformGroupData')
                const tKey = tRow.dataset.transformKey
                if (existingData && existingData[tKey]) {
                    existingData[tKey] = cfg
                    activeNode.setAttr('transformGroupData', existingData)
                    
                    if (window.updateAdvancedConfigDisplay) window.updateAdvancedConfigDisplay()
                    if (typeof renderTimelineIntervals === 'function') renderTimelineIntervals()
                    if (typeof renderMultiTrackTimeline === 'function') renderMultiTrackTimeline()
                }
            }
            
            segment.classList.add('active-segment')
            return
        }
        
        const obj = getActiveObj()
        if (!obj || obj.timeLocked) return

        if (targetType === 'start') {
            let newTime = getNewTime(obj.startTime)
            if (newTime < 0) newTime = 0
            if (newTime > video.duration) newTime = video.duration
            
            // strictly limits boundary collisions to enforce the 300ms gap
            if (newTime >= obj.endTime - 0.3) newTime = obj.endTime - 0.3
            
            obj.startTime = newTime
            video.currentTime = newTime
            const scrubber = document.getElementById('timeline-scrubber')
            const progress = document.getElementById('scrubber-progress')
            if (scrubber && progress) {
                scrubber.value = newTime
                progress.style.width = (newTime / video.duration) * 100 + '%'
            }
        } else if (targetType === 'end') {
            let newTime = getNewTime(obj.endTime)
            if (newTime > video.duration) newTime = video.duration
            if (newTime < 0) newTime = 0
            
            // strictly limits boundary collisions to enforce the 300ms gap
            if (newTime <= obj.startTime + 0.3) newTime = obj.startTime + 0.3
            
            obj.endTime = newTime
            video.currentTime = newTime
            const scrubber = document.getElementById('timeline-scrubber')
            const progress = document.getElementById('scrubber-progress')
            if (scrubber && progress) {
                scrubber.value = newTime
                progress.style.width = (newTime / video.duration) * 100 + '%'
            }
            
            if (window.endTimePreviewTimeout) clearTimeout(window.endTimePreviewTimeout)
            window.endTimePreviewTimeout = setTimeout(() => {
                video.currentTime = obj.startTime
                if (scrubber && progress) {
                    scrubber.value = obj.startTime
                    progress.style.width = (obj.startTime / video.duration) * 100 + '%'
                }
            }, 600)
        }
        
        renderTimelineIntervals()
        updateTimePanelUI(obj)
        renderMultiTrackTimeline()
        
        segment.classList.add('active-segment')
    }

    // evaluates mousedown for segment selection or arrow click
    document.addEventListener('mousedown', (e) => {
        if (e.target.closest('#time-segment-arrows')) {
            e.preventDefault()
            if (activeTimeSegment) {
                const btn = e.target.closest('button')
                if (btn) {
                    const isUp = btn.id === 'ts-up'
                    applyTimeChange(activeTimeSegment, isUp)
                }
            }
            return
        }

        document.querySelectorAll('.time-segment').forEach(el => el.classList.remove('active-segment'))
        if (arrowControls) arrowControls.style.display = 'none'
        activeTimeSegment = null
        
        if (e.target.classList.contains('time-segment')) {
            const tRow = e.target.closest('.transforms-list-item')
            if (!tRow) {
                const obj = getActiveObj()
                if (!obj || obj.timeLocked) return
            }

            activeTimeSegment = e.target
            activeTimeSegment.classList.add('active-segment')
            
            const group = activeTimeSegment.closest('.time-spinner-group')
            
            // uniformly anchors the absolute element relative to the group container for all panels
            group.style.position = 'relative'
            if (arrowControls.parentNode !== group) {
                group.appendChild(arrowControls)
            }
            
            // matches positioning exactly to the parent group bounds
            arrowControls.style.left = 'calc(100% + 4px)'
            arrowControls.style.right = 'auto'
            arrowControls.style.top = '-1px'
            arrowControls.style.transform = 'none'
            arrowControls.style.height = 'calc(100% + 2px)'
            arrowControls.style.display = 'flex'
            
            isDraggingTime = true
            dragStartY = e.clientY
            accumulatedDelta = 0
            e.preventDefault()
        }
    })

    // translates vertical mouse movement into incremental updates
    document.addEventListener('mousemove', (e) => {
        if (!isDraggingTime || !activeTimeSegment) return
        
        const currentY = e.clientY
        const deltaY = dragStartY - currentY
        accumulatedDelta += deltaY
        dragStartY = currentY
        
        const threshold = 10
        if (Math.abs(accumulatedDelta) >= threshold) {
            const ticks = Math.trunc(accumulatedDelta / threshold)
            for (let i = 0; i < Math.abs(ticks); i++) {
                applyTimeChange(activeTimeSegment, ticks > 0)
            }
            accumulatedDelta -= (ticks * threshold)
        }
    })

    // releases drag state
    document.addEventListener('mouseup', () => {
        isDraggingTime = false
    })

    // toggles time lock state for active object
    document.getElementById('edit-time-lock').addEventListener('click', () => {
        const obj = getActiveObj()
        if (obj) {
            obj.timeLocked = !obj.timeLocked
            updateTimePanelUI(obj)
            renderTimelineIntervals()
        }
    })

    // natively intercepts video playback to dynamically apply transform interval states in real-time
    if (!window._transformPlaybackLoopBound) {
        window._transformPlaybackLoopBound = true
        
        let lastAppliedTime = -1
        
        const transformAnimationLoop = () => {
            const video = document.getElementById('main-video')
            if (video && video.currentTime !== lastAppliedTime) {
                lastAppliedTime = video.currentTime
                const currentTime = video.currentTime
                let layerRedrawNeeded = false
                
                if (typeof appLayers !== 'undefined') {
                    appLayers.forEach(layer => {
                        if (!layer.objects) return
                        layer.objects.forEach(obj => {
                            const node = obj.node
                            if (!node) return
                            const tGroupData = node.getAttr('transformGroupData')
                            if (!tGroupData) return
                            
                            Object.keys(tGroupData).forEach(tKey => {
                                const cfg = tGroupData[tKey]
                                if (!cfg || !cfg.transformGroupData) return
                                
                                let activeElement = null
                                Object.keys(cfg.transformGroupData).forEach(mKey => {
                                    const tEl = cfg.transformGroupData[mKey]
                                    const tInv = tEl.transform_interval
                                    if (tInv) {
                                        const start = parseFloat(tInv.start)
                                        const end = parseFloat(tInv.end)
                                        if (currentTime >= start && currentTime <= end) {
                                            activeElement = tEl
                                        }
                                    }
                                })
                                
                                if (activeElement) {
                                    const blocking = activeElement.Blocking || cfg.Blocking
                                    const styling = activeElement.Styling || cfg.Styling
                                    
                                    if (blocking) {
                                        node.x(blocking.x)
                                        node.y(blocking.y)
                                        node.width(blocking.width)
                                        node.height(blocking.height)
                                        node.scaleX(blocking.scaleX)
                                        node.scaleY(blocking.scaleY)
                                        node.rotation(blocking.rotation)
                                        node.offsetX(blocking.offsetX)
                                        node.offsetY(blocking.offsetY)
                                    }
                                    
                                    if (styling) {
                                        node.opacity(styling.opacity !== undefined ? styling.opacity : 1)
                                        const innerText = typeof node.findOne === 'function' ? node.findOne('.inner-text') : null
                                        if (innerText && styling.Text) {
                                            innerText.fontFamily(styling.Text.fontFamily)
                                            innerText.fontSize(styling.Text.fontSize)
                                            innerText.fontStyle(styling.Text.fontStyle)
                                            innerText.align(styling.Text.align)
                                            innerText.fill(styling.Text.fill)
                                            innerText.stroke(styling.Text.stroke || 'transparent')
                                            innerText.strokeWidth(styling.Text.strokeWidth || 0)
                                        } else if (styling.Shape) {
                                            if (node.fill) node.fill(styling.Shape.fill)
                                        }
                                        
                                        if (styling.Border && !innerText) {
                                            if (node.stroke) node.stroke(styling.Border.color)
                                            if (node.strokeWidth) node.strokeWidth(styling.Border.thickness)
                                            if (node.dash) node.dash(styling.Border.dash || [])
                                        } else if (!innerText) {
                                            if (node.stroke) node.stroke('transparent')
                                        }
                                        
                                        const shadowTarget = innerText || node
                                        if (styling.Shadow) {
                                            shadowTarget.shadowColor(styling.Shadow.color)
                                            shadowTarget.shadowBlur(styling.Shadow.blur)
                                            shadowTarget.shadowOffsetX(styling.Shadow.offsetX)
                                            shadowTarget.shadowOffsetY(styling.Shadow.offsetY)
                                            shadowTarget.shadowOpacity(styling.Shadow.opacity)
                                        } else {
                                            shadowTarget.shadowOpacity(0)
                                        }
                                    }
                                    layerRedrawNeeded = true
                                }
                            })
                        })
                    })
                    
                    if (layerRedrawNeeded) {
                        if (typeof transformer !== 'undefined' && transformer) transformer.forceUpdate()
                        appLayers.forEach(l => {
                            if (l.konvaLayer) l.konvaLayer.batchDraw()
                        })
                    }
                }
            }
            requestAnimationFrame(transformAnimationLoop)
        }
        requestAnimationFrame(transformAnimationLoop)
    }

    // toggles visibility of the multi-track timeline container
    const toggleMultiBtn = document.getElementById('toggle-multi-track-btn')
    if (toggleMultiBtn) {
        toggleMultiBtn.addEventListener('click', (e) => {
            isMultiTrackOpen = !isMultiTrackOpen
            e.target.innerText = isMultiTrackOpen ? '▲ Hide All Tracks' : '▼ Show All Tracks'
            document.getElementById('multi-track-container').style.display = isMultiTrackOpen ? 'flex' : 'none'
            if (isMultiTrackOpen) renderMultiTrackTimeline()
        })
    }
    
    // forcefully triggers dynamic layout recalculations for the ruler when the window resizes
    let resizeTimeout
    window.addEventListener('resize', () => {
        if (resizeTimeout) clearTimeout(resizeTimeout)
        resizeTimeout = setTimeout(() => {
            if (window.isIntervalBlockZoomed && typeof renderTimelineIntervals === 'function') {
                renderTimelineIntervals()
            }
        }, 100)
    })
}
