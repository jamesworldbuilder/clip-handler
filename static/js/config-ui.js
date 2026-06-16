import { appLayers } from './state-manager.js'

// Dynamically generates and binds the configuration export UI panel
export function initConfigTabBindings() {
    const configTab = document.getElementById('config-tab')
    if (!configTab) return

    // Maps configuration categories to their respective UI property data tags
    const configCategories = {
        "Typography & Colors": [
            { id: "edit-font-family", label: "Font Family" },
            { id: "edit-font-size", label: "Font Size" },
            { id: "edit-font-style", label: "Font Style" },
            { id: "edit-text-align", label: "Text Alignment" },
            { id: "edit-shared-color", label: "Primary Color" },
            { id: "edit-text-transparency", label: "Transparency" }
        ],
        "Shadows & Borders": [
            { id: "edit-shadow-color", label: "Shadow Color" },
            { id: "edit-shadow-blur", label: "Shadow Softness" },
            { id: "edit-shadow-thickness", label: "Shadow Thickness" },
            { id: "edit-shape-stroke", label: "Border Color" },
            { id: "edit-shape-stroke-width", label: "Border Thickness" },
            { id: "edit-shape-stroke-style", label: "Border Style" }
        ],
        "Transform & Sizing": [
            { id: "edit-text-width", label: "Object Width" },
            { id: "edit-text-height", label: "Object Height" },
            { id: "text-ratio-lock", label: "Aspect Ratio Lock" }
        ],
        "Captions & Timing": [
            { id: "captions-mode-select", label: "Captions Mode" },
            { id: "existing-groups-select", label: "Target Caption Group" },
            { id: "edit-time-lock", label: "Interval Lock" },
            { id: "edit-start-time-group", label: "Start Time" },
            { id: "edit-end-time-group", label: "End Time" }
        ],
        "Canvas & Filters": [
            { id: "edit-filter-type", label: "Filter Type" },
            { id: "dof-blur-input", label: "DOF Blur" },
            { id: "dof-core-input", label: "DOF Focal Size" },
            { id: "letterbox-color", label: "Letterbox Color" },
            { id: "letterbox-thickness", label: "Letterbox Thickness" }
        ],
        "Tracking & Motion": [
            { id: "follow-mode-select", label: "Tracking Mode" },
            { id: "show-track-box-toggle", label: "Show Target Boundaries" },
            { id: "follow-smooth-input", label: "Motion Smoothing" },
            { id: "follow-radius-input", label: "Sample Accuracy" },
            { id: "show-sample-area-toggle", label: "Show Sample Area" },
            { id: "track-prop-alpha", label: "Tracking Trust" },
            { id: "show-canvas-grid-toggle", label: "Show Canvas Grid" },
            { id: "canvas-grid-density", label: "Grid Density" }
        ]
    }

    const switchStyles = `
    <style>
        .config-switch-label { display:flex; align-items:center; font-size:11px; color:#ccc; cursor:pointer; justify-content:space-between; transition:0.2s; margin-top: 4px; }
        .config-switch-wrap { position:relative; display:inline-block; width:26px; height:14px; margin-right:8px; flex-shrink:0; }
        .config-switch-wrap input { opacity:0; width:0; height:0; }
        .config-switch-slider { position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:#555; transition:.2s; border-radius:14px; }
        .config-switch-slider:before { position:absolute; content:""; height:10px; width:10px; left:2px; bottom:2px; background-color:white; transition:.2s; border-radius:50%; }
        .config-switch-wrap input:checked + .config-switch-slider { background-color:#00a8ff; }
        .config-switch-wrap input:checked + .config-switch-slider:before { transform:translateX(12px); }
        
        .val-scroll-wrap { width:75px; flex-shrink:0; overflow:hidden; display:flex; justify-content:flex-end; }
        .config-val-display { color:#fff; font-weight:bold; font-family:monospace; white-space:nowrap; display:inline-block; transition:color 0.2s; }
        .config-switch-label.disabled-val .config-val-display { color:#ffffff !important; opacity:0.6; }
        .config-switch-label.disabled-val .config-item-name { color:#666; }
        
        .collapse-btn:hover { color:#f1c40f !important; text-decoration:underline; }
    </style>`

    let configUI = switchStyles + `<div id="config-export-panel" style="margin-top:0px; padding-top:0px; border-top:none;">
        <h3 style="margin-bottom:15px; color:#f39c12;">Batch Configuration</h3>
        <p style="font-size:11px; color:#aaa; margin-bottom:15px;">Select the properties to capture from the current project layout</p>
        <div id="config-categories-wrap" style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">`

    configUI += `<div id="config-project-hierarchy" class="config-category">
        <div style="font-size:12px; font-weight:bold; color:#00a8ff; margin-bottom:6px; text-transform:uppercase; display:flex; align-items:center;">PROJECT HIERARCHY <button class="collapse-btn sect-toggle-btn" data-target="config-sect-1" style="background:none; border:none; color:#f39c12; cursor:pointer; font-size:9px; margin-left:6px; padding:0;">(expand)</button></div>
        <div id="config-sect-1" style="display:block; display:flex; flex-direction:column; gap:2px;"></div>
    </div>`

    configUI += `<div id="config-object-properties" class="config-category">
        <div style="font-size:12px; font-weight:bold; color:#00a8ff; margin-bottom:6px; text-transform:uppercase; display:flex; align-items:center;">OBJECT PROPERTIES <button class="collapse-btn sect-toggle-btn" data-target="config-sect-2" style="background:none; border:none; color:#f39c12; cursor:pointer; font-size:9px; margin-left:6px; padding:0;">(expand)</button></div>
        <div id="config-sect-2" style="display:block; display:flex; flex-direction:column; gap:2px;"></div>
    </div>`

    Object.keys(configCategories).forEach(cat => {
        configUI += `<div class="config-category">
            <div style="font-size:12px; font-weight:bold; color:#00a8ff; margin-bottom:6px; text-transform:uppercase; display:flex; align-items:center;">${cat}</div>
            <div style="display:flex; flex-direction:column; gap:2px;">`
        
        configCategories[cat].forEach(item => {
            const indentStyle = item.parent ? 'margin-left:12px; border-left:1px solid #444; padding-left:8px;' : ''
            const parentAttr = item.parent ? `data-parent-id="${item.parent}"` : ''
            
            configUI += `<label class="config-switch-label" id="label-wrap-${item.id}" style="${indentStyle}">
                <div style="display:flex; align-items:center; flex:1; min-width:0; padding-right:2px; justify-content: space-between;">
                    <div class="name-scroll-wrap" style="overflow:hidden; display:flex; flex:1; min-width:0;">
                        <span class="config-item-name" style="white-space:nowrap; display:block; overflow:hidden; width:100%; text-overflow:ellipsis;">${item.label}</span>
                    </div>
                    <div style="margin-left:8px; margin-right:16px; display:flex; align-items:center; flex-shrink:0; visibility:hidden;"><button class="collapse-btn" style="font-size:9px; padding:0;">(show/hide)</button></div>
                    <div style="display:flex; align-items:center; flex-shrink:0;">
                        <div class="val-scroll-wrap" style="width:75px; justify-content:flex-end; margin-right:8px;">
                            <span class="config-val-display" id="val-disp-${item.id}" style="display:block; white-space:nowrap; overflow:hidden; width:100%; text-align:right; text-overflow:ellipsis;">-</span>
                        </div>
                        <div class="config-switch-wrap" style="margin-right:0;">
                            <input type="checkbox" class="config-export-checkbox" data-target-id="${item.id}" ${parentAttr} checked>
                            <span class="config-switch-slider"></span>
                        </div>
                    </div>
                </div>
            </label>`
        })
        
        configUI += `</div></div>`
    })

    configUI += `</div>
        <div style="display:flex; gap:10px;">
            <button id="export-config-btn" class="action-btn" style="flex:1; background-color:#9b59b6; margin:0;">Export Template</button>
            <button id="import-config-btn" class="action-btn" style="flex:1; background-color:#34495e; margin:0;">Load Template</button>
        </div>
        <input type="file" id="config-file-input" accept=".json" style="display:none;">
    </div>`

    configTab.innerHTML = ''
    configTab.insertAdjacentHTML('beforeend', configUI)

    // Bind sect-toggle-btn master logic for static config categories
    configTab.querySelectorAll('.sect-toggle-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault()
            e.stopPropagation()
            const targetEl = document.getElementById(btn.dataset.target)
            if (targetEl) {
                if (btn.innerText === '(expand)') {
                    const nestedBtns = targetEl.querySelectorAll('.collapse-btn:not(.sect-toggle-btn)')
                    nestedBtns.forEach(nBtn => {
                        const nTarget = document.getElementById(nBtn.dataset.target)
                        if (nTarget) nTarget.style.display = 'block'
                        nBtn.innerText = '(hide)'
                    })
                    btn.innerText = '(hide)'
                } else {
                    const nestedBtns = targetEl.querySelectorAll('.collapse-btn:not(.sect-toggle-btn)')
                    nestedBtns.forEach(nBtn => {
                        const nTarget = document.getElementById(nBtn.dataset.target)
                        if (nTarget) nTarget.style.display = 'none'
                        nBtn.innerText = '(show)'
                    })
                    btn.innerText = '(expand)'
                }
            }
        }
    })

    // Generates HTML strictly formatted with toggles on the right for dynamic components
    const buildAdvHTML = (id, label, val, isParent, parentId = '', preserveName = false, extraHtml = '', isChecked = true) => {
        const indentStyle = parentId ? 'margin-left:6px; border-left:1px solid #444; padding-left:6px;' : ''
        const parentAttr = parentId ? `data-parent-id="${parentId}"` : ''
        
        const lowerLabel = label.toLowerCase()
        if (lowerLabel.includes('color') || lowerLabel.includes('fill') || lowerLabel.includes('stroke') || lowerLabel.includes('shadow')) {
            if (Array.isArray(val)) {
                if (val.length === 4) val = `rgba(${val.join(', ')})`
                else if (val.length === 3) val = `rgb(${val.join(', ')})`
            } else if (typeof val === 'string' && /^[\d\s\.]+,[\d\s\.]+,[\d\s\.]+(,[\d\s\.]+)?$/.test(val)) {
                val = val.split(',').length === 4 ? `rgba(${val})` : `rgb(${val})`
            }
        } else if (Array.isArray(val)) {
            val = `[${val.join(', ')}]`
        }

        let displayVal = val === '' || val === null || val === undefined ? '-' : String(val)
        let valColor = '#ffffff'
        
        if (typeof val === 'string') {
            const checkVal = val.trim().toLowerCase()
            if (checkVal.startsWith('#') || checkVal.startsWith('rgb') || checkVal.startsWith('hsl')) {
                valColor = isChecked ? val.trim() : '#ffffff'
                displayVal = val.trim().toUpperCase()
            }
        }
        
        if (isParent) {
            displayVal = isChecked ? 'On' : 'Off'
            valColor = isChecked ? '#00a8ff' : '#ffffff'
        }

        const prettyLabel = preserveName ? label : label.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim().replace(/\b\w/g, c => c.toUpperCase())
        const safeVal = encodeURIComponent(String(val))
        const checkedAttr = isChecked ? 'checked' : ''
        const disabledClass = isChecked ? '' : 'disabled-val'
        
        return `<label class="config-switch-label ${disabledClass}" id="label-wrap-${id}" style="${indentStyle}">
            <div style="display:flex; align-items:center; flex:1; min-width:0; padding-right:2px;">
                <div style="display:flex; align-items:center; overflow:hidden; flex:1;">
                    <div class="name-scroll-wrap" style="overflow:hidden; display:flex; flex:1; min-width:0;">
                        <span class="config-item-name" style="white-space:nowrap; display:block; overflow:hidden; width:100%; text-overflow:ellipsis;">${prettyLabel}</span>
                    </div>
                </div>
                ${extraHtml ? `<div style="margin-left:8px; margin-right:16px; display:flex; align-items:center; flex-shrink:0;">${extraHtml}</div>` : `<div style="margin-left:8px; margin-right:16px; display:flex; align-items:center; flex-shrink:0; visibility:hidden;"><button class="collapse-btn" style="font-size:9px; padding:0;">(show)</button></div>`}
                <div style="display:flex; align-items:center; flex-shrink:0;">
                    <div class="val-scroll-wrap" style="width:75px; justify-content:flex-end; margin-right:8px; display:${isParent ? 'none' : 'flex'};">
                        <span class="config-val-display" id="val-disp-${id}" style="color:${valColor}; display:block; white-space:nowrap; overflow:hidden; width:100%; text-align:right; text-overflow:ellipsis;">${displayVal}</span>
                    </div>
                    <div class="config-switch-wrap" style="margin-right:0;">
                        <input type="checkbox" class="config-export-checkbox dynamic-adv-cb" data-target-id="${id}" data-dynamic-val="${safeVal}" ${parentAttr} ${checkedAttr}>
                        <span class="config-switch-slider"></span>
                    </div>
                </div>
            </div>
        </label>`
    }

    // scans available ui bounds and maps appropriate scrolling animations
    const applyMarqueeEffects = (container) => {
        container.querySelectorAll('.config-item-name, .config-val-display').forEach(el => {
            if (window.marqueeObserver) window.marqueeObserver.observe(el)
            if (window.applyMarquee) setTimeout(() => window.applyMarquee(el), 50)
        })
    }

    // Binds state toggling logic and recursive select-all propagation
    const bindDynamicCheckboxes = (container) => {
        container.querySelectorAll('.config-export-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const targetId = e.target.dataset.targetId
                const isChecked = e.target.checked
                const labelWrap = document.getElementById(`label-wrap-${targetId}`)
                const valDisp = document.getElementById(`val-disp-${targetId}`)
                
                if (labelWrap) {
                    if (isChecked) labelWrap.classList.remove('disabled-val')
                    else labelWrap.classList.add('disabled-val')
                }
                
                if (valDisp) {
                    if (valDisp.innerText === 'On' || valDisp.innerText === 'Off' || !e.target.hasAttribute('data-parent-id')) {
                        valDisp.innerText = isChecked ? 'On' : 'Off'
                        valDisp.style.color = isChecked ? '#00a8ff' : '#ffffff'
                    }
                }

                // Recursive function to propagate toggle state to all deep descendants
                const cascadeToggle = (parentId, state) => {
                    const children = document.querySelectorAll(`.config-export-checkbox[data-parent-id="${parentId}"]`)
                    children.forEach(child => {
                        child.checked = state
                        const childId = child.dataset.targetId
                        const childWrap = document.getElementById(`label-wrap-${childId}`)
                        const cValDisp = document.getElementById(`val-disp-${childId}`)
                        
                        if (childWrap) {
                            if (state) childWrap.classList.remove('disabled-val')
                            else childWrap.classList.add('disabled-val')
                        }
                        if (cValDisp) {
                            if (cValDisp.innerText === 'On' || cValDisp.innerText === 'Off' || !child.hasAttribute('data-parent-id')) {
                                cValDisp.innerText = state ? 'On' : 'Off'
                                cValDisp.style.color = state ? '#00a8ff' : '#ffffff'
                            }
                        }
                        // Recurse deeper
                        cascadeToggle(childId, state)
                    })
                }
                
                cascadeToggle(targetId, isChecked)
            })
        })
    }
    
    // Scrapes DOM inputs and native JSON data to populate UI
    function refreshConfigValues() {
        // Process standard DOM element inputs
        document.querySelectorAll('.config-export-checkbox:not(.dynamic-adv-cb)').forEach(cb => {
            const targetId = cb.dataset.targetId
            const el = document.getElementById(targetId) || document.querySelector(`[data-config-id="${targetId}"]`)
            const valDisp = document.getElementById(`val-disp-${targetId}`)
            const labelWrap = document.getElementById(`label-wrap-${targetId}`)
            
            let displayStr = '-'
            let valColor = '#ffffff'
            let hasValue = false
            
            if (el) {
                if (el.tagName === 'INPUT') {
                    if (el.type === 'checkbox') {
                        displayStr = el.checked ? 'On' : 'Off'
                        hasValue = true
                    }
                    else if (el.type === 'color') {
                        displayStr = el.value.toUpperCase()
                        valColor = el.value
                        hasValue = true
                    }
                    else {
                        displayStr = el.value
                        if (displayStr !== '') hasValue = true
                    }
                } else if (el.tagName === 'SELECT') {
                    displayStr = el.options[el.selectedIndex]?.text || el.value
                    if (el.value) hasValue = true
                } else if (el.classList.contains('active') || el.classList.contains('shadow-active') || el.classList.contains('transform-active')) {
                    displayStr = 'On'
                    hasValue = true
                } else {
                    displayStr = el.innerText || el.value || 'Off'
                    if (displayStr !== 'Off' && displayStr !== '-' && displayStr !== '') hasValue = true
                }
            }

            if (!hasValue || displayStr === '-' || displayStr === '') {
                cb.checked = false
                displayStr = 'Off'
                valColor = '#ffffff'
            }

            if (valDisp) {
                valDisp.innerText = displayStr
                valDisp.title = displayStr
                valDisp.style.color = valColor
            }
            
            if (labelWrap) {
                if (cb.checked) labelWrap.classList.remove('disabled-val')
                else labelWrap.classList.add('disabled-val')
            }
        })

        // Process global hierarchy dynamically filtering by exact target bucket IDs
        const hierarchyContainer1 = document.getElementById('config-sect-1')
        const hierarchyContainer2 = document.getElementById('config-sect-2')
        
        if (hierarchyContainer1 && hierarchyContainer2) {
            let hHTML = ''
            const targetBuckets = ['Text', 'Image', 'Filter', 'Background']
            
            targetBuckets.forEach(bucket => {
                const layerId = `layer_${bucket.toLowerCase()}`
                
                let layerObjs = []
                if (typeof appLayers !== 'undefined') {
                    appLayers.forEach(layer => {
                        if (layer.name && layer.name.toLowerCase().includes(bucket.toLowerCase())) {
                            if (layer.objects) layerObjs.push(...layer.objects)
                        } else if (layer.type && layer.type.toLowerCase().includes(bucket.toLowerCase())) {
                            if (layer.objects) layerObjs.push(...layer.objects)
                        }
                    })
                }

                const layerExists = layerObjs.length > 0
                const collapseId = `collapse_${layerId}`
                const layerMetricsBtn = `<button class="collapse-btn" data-target="${collapseId}" style="background:none; border:none; color:#f39c12; cursor:pointer; font-size:9px; margin-left:6px; padding:0;">(show)</button>`

                hHTML += `<div id="${bucket.toLowerCase()}-layer-toggles" style="margin-bottom: 8px; padding: 6px 8px; background: #1a252f; border: 1px solid #34495e; border-radius: 4px;">`
                hHTML += buildAdvHTML(layerId, `<span style="color:#444; margin-right:4px;">|</span><span style="color:#ffffff;">${bucket} Layer</span>`, true, true, '', true, layerMetricsBtn, layerExists)
                
                hHTML += `<div id="${collapseId}" style="display:none; margin-top: 4px; margin-left: 6px; padding-left: 8px; border-left: 1px solid #34495e;">`
                
                if (bucket === 'Background') {
                    const rawVideoId = `${layerId}_rawvideo`
                    hHTML += buildAdvHTML(rawVideoId, `"Raw Video"`, true, true, layerId, true, '', layerExists)
                } else {
                    const cGroups = {}
                    const tGroups = {}
                    const indObjs = []
                    
                    layerObjs.forEach(obj => {
                        if (!obj || !obj.node) return
                        const tGroup = obj.node.getAttr('transformGroupName')
                        const cGroup = obj.node.getAttr('captionsGroupName') || obj.node.getAttr('captionGroupId')
                        
                        if (cGroup) {
                            if (!cGroups[cGroup]) cGroups[cGroup] = []
                            cGroups[cGroup].push(obj)
                        } else if (tGroup) {
                            if (!tGroups[tGroup]) tGroups[tGroup] = []
                            tGroups[tGroup].push(obj)
                        } else {
                            indObjs.push(obj)
                        }
                    })

                    // formats independent objects hierarchy with array counts and dynamic bounding spacers
                    if (indObjs.length > 0) {
                        const groupedIndObjs = {}
                        indObjs.forEach(obj => {
                            let subBucket = `${bucket} Objects`
                            if (bucket === 'Image') {
                                if (obj.node && obj.node.getClassName() === 'Image') {
                                    subBucket = 'Image Objects'
                                } else {
                                    subBucket = 'Shape Objects'
                                }
                            }
                            if (!groupedIndObjs[subBucket]) groupedIndObjs[subBucket] = []
                            groupedIndObjs[subBucket].push(obj)
                        })

                        Object.keys(groupedIndObjs).forEach(subBucketName => {
                            const subObjs = groupedIndObjs[subBucketName]
                            const safeBucketId = subBucketName.replace(/\s+/g, '').toLowerCase()
                            const typeId = `${layerId}_${safeBucketId}`
                            const indCollapseId = `collapse_ind_${typeId}`
                            const objCnt = subObjs.length
                            const objMetricsBtn = `<button class="collapse-btn" data-target="${indCollapseId}" style="background:none; border:none; color:#f39c12; cursor:pointer; font-size:9px; margin-left:0; padding:0;">(show)</button>`

                            hHTML += buildAdvHTML(typeId, `<span style="color:#ffffff;">${subBucketName}</span>`, true, true, layerId, true, '', layerExists)
                            hHTML += `<div style="margin-top: 2px; margin-left: 6px; padding-left: 8px; border-left: 1px dashed #444; margin-bottom: 8px;">`
                            
                            hHTML += `<div style="margin-bottom:2px; color:#aaa; font-size:10px;">Total Objects: <span style="color:#2ecc71;">${objCnt}</span></div>`
                            
                            hHTML += `<div style="margin-bottom:2px; margin-left:6px; display:flex; align-items:center; padding-right:2px;">
                                <div style="display:flex; align-items:center; overflow:hidden; flex:1;">
                                    <div class="name-scroll-wrap" style="overflow:hidden; display:flex; flex:1; min-width:0;">
                                        <span class="config-item-name" style="font-family:monospace; white-space:nowrap; display:block; overflow:hidden; width:100%; text-overflow:ellipsis; color:#aaa; font-size:10px;">"objects": [<span style="color:#2ecc71;">${objCnt}</span>]</span>
                                    </div>
                                </div>
                                <div style="margin-left:8px; margin-right:16px; display:flex; align-items:center; flex-shrink:0;">${objMetricsBtn}</div>
                                <div style="display:flex; align-items:center; flex-shrink:0;">
                                    <div class="val-scroll-wrap" style="width:75px; justify-content:flex-end; margin-right:8px; display:none;"></div>
                                    <div class="config-switch-wrap" style="visibility:hidden; margin-right:0;">
                                        <input type="checkbox"><span class="config-switch-slider"></span>
                                    </div>
                                </div>
                            </div>`
                            
                            hHTML += `<div id="${indCollapseId}" style="display:none; margin-left: 12px; padding-left: 8px; border-left: 1px solid #555; margin-top:2px; margin-bottom:4px;">`
                            
                            subObjs.forEach(obj => {
                                const objId = `obj_${obj.id || obj.node._id}`
                                let valStr = obj.name || obj.node.name() || `Object`
                                const innerText = typeof obj.node.findOne === 'function' ? obj.node.findOne('.inner-text') : null
                                if (innerText && typeof innerText.text === 'function' && innerText.text()) valStr = innerText.text()
                                
                                const propStr = bucket === 'Filter' ? '{}' : '{Blocking, Styling}'
                                hHTML += buildAdvHTML(objId, `<span style="color:#2ecc71;">- "${valStr}"</span><span style="color:#aaa; font-family:monospace;">: ${propStr}</span>`, true, true, typeId, true, '', layerExists)
                            })
                            hHTML += `</div></div>`
                        })
                    }

                    // groups assembly
                    if (bucket !== 'Filter') {
                        const groupsId = `${layerId}_groups`
                        const hasGroups = Object.keys(cGroups).length > 0 || Object.keys(tGroups).length > 0
                        hHTML += buildAdvHTML(groupsId, `<span style="color:#ffffff;">Groups</span>`, true, true, layerId, true, '', hasGroups)
                        hHTML += `<div style="margin-top: 2px; margin-left: 6px; padding-left: 8px; border-left: 1px solid #34495e;">`

                    // caption groups assembly
                    const cgContainerId = `${groupsId}_cg`
                    const hasCGroups = Object.keys(cGroups).length > 0
                    hHTML += buildAdvHTML(cgContainerId, `<span style="color:#ffffff;">Caption Groups</span>`, true, true, groupsId, true, '', hasCGroups)
                    hHTML += `<div style="margin-top: 2px; margin-left: 6px; padding-left: 8px; border-left: 1px dashed #444; margin-bottom: 8px;">`
                    
                    if (hasCGroups) {
                        Object.keys(cGroups).forEach(cgName => {
                            const cgId = `cg_${cgName.replace(/\W/g, '')}`
                            const cgCollapseId = `collapse_${cgId}`
                            
                            let totalCaps = 0
                            cGroups[cgName].forEach(obj => {
                                const capList = obj.node.getAttr('captionsList') || obj.node.getAttr('captionData') || []
                                totalCaps += capList.length || 1
                            })

                            const metricsBtn = `<button class="collapse-btn" data-target="${cgCollapseId}" style="background:none; border:none; color:#f39c12; cursor:pointer; font-size:9px; margin-left:6px; padding:0;">(show)</button>`
                            hHTML += buildAdvHTML(cgId, `"${cgName}"`, true, true, cgContainerId, true, metricsBtn, true)
                            
                            hHTML += `<div id="${cgCollapseId}" style="display:none; margin-left: 6px; padding-left: 8px; color:#aaa; font-family:monospace; font-size:10px; margin-top:2px; margin-bottom:4px;">`
                            hHTML += `<div style="margin-bottom:4px;">Total Captions: <span style="color:#2ecc71;">${totalCaps}</span></div>`
                            
                            cGroups[cgName].forEach(obj => {
                                const objId = `obj_${obj.id || obj.node._id}`
                                
                                const capList = obj.node.getAttr('captionsList') || obj.node.getAttr('captionData') || []
                                const capCollapseId = `collapse_cap_${objId}`
                                const capBtn = `<button class="collapse-btn" data-target="${capCollapseId}" style="background:none; border:none; color:#f39c12; cursor:pointer; font-size:9px; margin-left:0; padding:0;">(show)</button>`
                                
                                hHTML += `<div style="margin-bottom:2px; margin-left:6px; display:flex; align-items:center; padding-right:2px;">
                                    <div style="display:flex; align-items:center; overflow:hidden; flex:1;">
                                        <div class="name-scroll-wrap" style="overflow:hidden; display:flex; flex:1; min-width:0;">
                                            <span class="config-item-name" style="font-family:monospace; white-space:nowrap; display:block; overflow:hidden; width:100%; text-overflow:ellipsis;">"captionsList": [<span style="color:#2ecc71;">${capList.length}</span>]</span>
                                        </div>
                                    </div>
                                    <div style="margin-left:8px; margin-right:16px; display:flex; align-items:center; flex-shrink:0;">${capBtn}</div>
                                    <div style="display:flex; align-items:center; flex-shrink:0;">
                                        <div class="val-scroll-wrap" style="width:75px; justify-content:flex-end; margin-right:8px; display:none;"></div>
                                        <div class="config-switch-wrap" style="visibility:hidden; margin-right:0;">
                                            <input type="checkbox"><span class="config-switch-slider"></span>
                                        </div>
                                    </div>
                                </div>`
                                hHTML += `<div id="${capCollapseId}" style="display:none; margin-left:12px; padding-left:8px; border-left:1px solid #555; color:#2ecc71;">`
                                capList.forEach(cap => hHTML += `<div style="margin-top:2px; display:flex; align-items:center; padding-right:2px;">
                                    <div style="display:flex; align-items:center; overflow:hidden; flex:1;">
                                        <div class="name-scroll-wrap" style="overflow:hidden; display:flex; flex:1; min-width:0;">
                                            <span class="config-item-name" style="white-space:nowrap; display:block; overflow:hidden; width:100%; text-overflow:ellipsis;">- "${cap}"</span>
                                        </div>
                                    </div>
                                    <div style="margin-left:8px; margin-right:16px; display:flex; align-items:center; flex-shrink:0; visibility:hidden;"><button class="collapse-btn" style="font-size:9px; padding:0;">(show)</button></div>
                                    <div style="display:flex; align-items:center; flex-shrink:0;">
                                        <div class="val-scroll-wrap" style="width:75px; justify-content:flex-end; margin-right:8px; display:none;"></div>
                                        <div class="config-switch-wrap" style="visibility:hidden; margin-right:0;">
                                            <input type="checkbox"><span class="config-switch-slider"></span>
                                        </div>
                                    </div>
                                </div>`)
                                hHTML += `</div>`
                            })
                            hHTML += `</div>`
                        })
                    } else {
                        hHTML += `<div style="font-size:10px; color:#777; font-style:italic; padding-left:6px; margin-bottom:2px;">No caption groups</div>`
                    }
                    hHTML += `</div>`

                    // transform groups assembly
                    const tgContainerId = `${groupsId}_tg`
                    const hasTGroups = Object.keys(tGroups).length > 0
                    hHTML += buildAdvHTML(tgContainerId, `<span style="color:#ffffff;">Transform Groups</span>`, true, true, groupsId, true, '', hasTGroups)
                    hHTML += `<div style="margin-top: 2px; margin-left: 6px; padding-left: 8px; border-left: 1px dashed #444;">`
                    
                    if (hasTGroups) {
                        Object.keys(tGroups).forEach(tgName => {
                            const tgId = `tg_${tgName.replace(/\W/g, '')}`
                            const tgCollapseId = `collapse_${tgId}`
                            
                            // excludes the parent group container from being listed as its own child
                            const childObjs = tGroups[tgName].filter(obj => {
                                const nName = obj.name || (obj.node && obj.node.name()) || ''
                                return nName !== tgName
                            })
                            const objCnt = childObjs.length
                            
                            const objCntCollapseId = `collapse_obj_${tgId}`
                            const objMetricsBtn = `<button class="collapse-btn" data-target="${objCntCollapseId}" style="background:none; border:none; color:#f39c12; cursor:pointer; font-size:9px; margin-left:0; padding:0;">(show)</button>`

                            const metricsBtn = `<button class="collapse-btn" data-target="${tgCollapseId}" style="background:none; border:none; color:#f39c12; cursor:pointer; font-size:9px; margin-left:0; padding:0;">(show)</button>`
                            hHTML += buildAdvHTML(tgId, `"${tgName}"`, true, true, tgContainerId, true, metricsBtn, true)

                            hHTML += `<div id="${tgCollapseId}" style="display:none; margin-left: 6px; padding-left: 8px; border-left: 1px solid #555; color:#aaa; font-size:10px; margin-top:2px; margin-bottom:4px;">`
                            hHTML += `<div style="margin-bottom:2px;">Total Objects: <span style="color:#2ecc71;">${objCnt}</span></div>`
                            
                            hHTML += `<div style="margin-bottom:2px; margin-left:6px; display:flex; align-items:center; padding-right:2px;">
                                <div style="display:flex; align-items:center; overflow:hidden; flex:1;">
                                    <div class="name-scroll-wrap" style="overflow:hidden; display:flex; flex:1; min-width:0;">
                                        <span class="config-item-name" style="font-family:monospace; white-space:nowrap; display:block; overflow:hidden; width:100%; text-overflow:ellipsis;">"objects": [<span style="color:#2ecc71;">${objCnt}</span>]</span>
                                    </div>
                                </div>
                                <div style="margin-left:8px; margin-right:16px; display:flex; align-items:center; flex-shrink:0;">${objMetricsBtn}</div>
                                <div style="display:flex; align-items:center; flex-shrink:0;">
                                    <div class="val-scroll-wrap" style="width:75px; justify-content:flex-end; margin-right:8px; display:none;"></div>
                                    <div class="config-switch-wrap" style="visibility:hidden; margin-right:0;">
                                        <input type="checkbox"><span class="config-switch-slider"></span>
                                    </div>
                                </div>
                            </div>`
                            
                            hHTML += `<div id="${objCntCollapseId}" style="display:none; margin-left: 12px; padding-left: 8px; border-left: 1px solid #555; margin-top:2px; margin-bottom:4px;">`
                            
                            childObjs.forEach(obj => {
                                const targetNode = obj.node
                                const objId = `obj_${obj.id || targetNode._id}`
                                let valStr = obj.name || targetNode.name() || `Object`
                                const innerText = typeof targetNode.findOne === 'function' ? targetNode.findOne('.inner-text') : null
                                if (innerText && typeof innerText.text === 'function' && innerText.text()) valStr = innerText.text()
                                
                                const fullData = targetNode.getAttr('transformGroupData') || {}
                                let tData = null
                                if (fullData[valStr] && fullData[valStr].transformGroupData) tData = fullData[valStr].transformGroupData
                                else if (Object.keys(fullData).some(k => !isNaN(k))) tData = fullData
                                const elmCnt = tData ? Object.keys(tData).filter(k => !isNaN(k)).length : 0

                                hHTML += buildAdvHTML(objId, `<span style="color:#2ecc71;">- "${valStr}"</span>`, true, true, tgId, true, '', true)
                                hHTML += `<div style="margin-left: 6px; padding-left: 8px; margin-top:2px; margin-bottom:6px;">
                                    <div style="display:flex; align-items:center; padding-right:2px;">
                                        <div style="display:flex; align-items:center; overflow:hidden; flex:1;">
                                            <div class="name-scroll-wrap" style="overflow:hidden; display:flex; flex:1; min-width:0;">
                                                <span class="config-item-name" style="font-family:monospace; white-space:nowrap; display:block; overflow:hidden; width:100%; text-overflow:ellipsis;">"transformations-matrix":</span>
                                            </div>
                                        </div>
                                        <div style="margin-left:8px; margin-right:16px; display:flex; align-items:center; flex-shrink:0; visibility:hidden;"><button class="collapse-btn" style="font-size:9px; padding:0;">(show/hide)</button></div>
                                        <div style="display:flex; align-items:center; flex-shrink:0;">
                                            <div class="val-scroll-wrap" style="width:75px; justify-content:flex-end; margin-right:8px; display:none;"></div>
                                            <div class="config-switch-wrap" style="visibility:hidden; margin-right:0;">
                                                <input type="checkbox"><span class="config-switch-slider"></span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style="display:flex; align-items:center; padding-right:2px; margin-top:2px; margin-left:12px;">
                                        <div style="display:flex; align-items:center; overflow:hidden; flex:1;">
                                            <div class="name-scroll-wrap" style="overflow:hidden; display:flex; flex:1; min-width:0;">
                                                <span class="config-item-name" style="font-family:monospace; white-space:nowrap; display:block; overflow:hidden; width:100%; text-overflow:ellipsis;">[<span style="color:#00a8ff;">${elmCnt}</span>]</span>
                                            </div>
                                        </div>
                                        <div style="margin-left:8px; margin-right:16px; display:flex; align-items:center; flex-shrink:0; visibility:hidden;"><button class="collapse-btn" style="font-size:9px; padding:0;">(show/hide)</button></div>
                                        <div style="display:flex; align-items:center; flex-shrink:0;">
                                            <div class="val-scroll-wrap" style="width:75px; justify-content:flex-end; margin-right:8px; display:none;"></div>
                                            <div class="config-switch-wrap" style="visibility:hidden; margin-right:0;">
                                                <input type="checkbox"><span class="config-switch-slider"></span>
                                            </div>
                                        </div>
                                    </div>
                                </div>`
                            })
                            hHTML += `</div></div>`
                        })
                    } else {
                        hHTML += `<div style="font-size:10px; color:#777; font-style:italic; padding-left:6px; margin-bottom:2px;">No transform groups</div>`
                    }
                    hHTML += `</div>` // close transform groups

                    hHTML += `</div>` // close groups
                    } // closes bucket filter logic
                }
                
                hHTML += `</div>` // close layer collapse container
                hHTML += `</div>` // close outer layer toggles wrapper
            })

            hierarchyContainer1.innerHTML = hHTML
            hHTML = '' // Reset for Object Properties
            
            const opGroups = { 'Text Objects': [], 'Image Objects': [], 'Shape Objects': [], 'Filter Objects': [] }
            appLayers.forEach(layer => {
                if (!layer.objects) return
                const lName = layer.id
                const tGroupNamesImg = new Set()
                const tGroupNamesShape = new Set()

                layer.objects.forEach(obj => {
                    const tGroup = obj.node ? obj.node.getAttr('transformGroupName') : null
                    if (lName === 'layer_text') opGroups['Text Objects'].push({ type: 'obj', obj })
                    else if (lName === 'layer_filter') opGroups['Filter Objects'].push({ type: 'obj', obj })
                    else if (lName === 'layer_image') {
                        if (obj.node && obj.node.getClassName() === 'Image') {
                            if (tGroup) tGroupNamesImg.add(tGroup)
                            else opGroups['Image Objects'].push({ type: 'obj', obj })
                        } else {
                            if (tGroup) tGroupNamesShape.add(tGroup)
                            else opGroups['Shape Objects'].push({ type: 'obj', obj })
                        }
                    }
                })
                tGroupNamesImg.forEach(tg => opGroups['Image Objects'].push({ type: 'tg', name: tg }))
                tGroupNamesShape.forEach(tg => opGroups['Shape Objects'].push({ type: 'tg', name: tg }))
            })

            Object.keys(opGroups).forEach(cat => {
                const items = opGroups[cat]
                if (items.length === 0) return
                
                const catId = `op_cat_${cat.replace(/\s+/g, '')}`
                const catCollapseId = `collapse_${catId}`
                
                // dynamically maps string prefixes to generate explicit structural container IDs
                const togglesId = `${cat.split(' ')[0].toLowerCase()}-obj-toggles`
                
                const catBtn = `<button class="collapse-btn" data-target="${catCollapseId}" style="background:none; border:none; color:#f39c12; cursor:pointer; font-size:9px; margin-left:6px; padding:0;">(show)</button>`
                
                hHTML += `<div id="${togglesId}" style="margin-bottom: 8px; padding: 6px 8px; background: #1a252f; border: 1px solid #34495e; border-radius: 4px;">`
                hHTML += buildAdvHTML(catId, `<span style="color:#ffffff;">${cat}</span>`, true, true, 'layer_obj_props', true, catBtn, true)
                hHTML += `<div id="${catCollapseId}" style="display:none; margin-top: 4px; margin-left: 6px; padding-left: 8px; border-left: 1px solid #34495e;">`
                
                items.forEach(item => {
                    if (item.type === 'obj') {
                        const obj = item.obj
                        const objId = `op_obj_${obj.id || (obj.node && obj.node._id) || Math.random()}`
                        let valStr = obj.name || (obj.node ? obj.node.name() : '') || `Object`
                        const innerText = obj.node && typeof obj.node.findOne === 'function' ? obj.node.findOne('.inner-text') : null
                        if (innerText && typeof innerText.text === 'function' && innerText.text()) valStr = innerText.text()
                        
                        let propsStr = cat === 'Filter Objects' ? '{}' : (cat === 'Text Objects' ? '{Blocking:{}, Styling:{}}' : '{Blocking, Styling}')
                        hHTML += buildAdvHTML(objId, `"${valStr}": <span style="color:#aaa; font-family:monospace;">${propsStr}</span>`, true, true, catId, true, '', true)
                    } else if (item.type === 'tg') {
                        const tgId = `op_tg_${item.name.replace(/\W/g, '')}_${cat.replace(/\s+/g, '')}`
                        const btn = `<button class="collapse-btn" data-target="collapse_${tgId}" style="background:none; border:none; color:#f39c12; cursor:pointer; font-size:9px; margin-left:0; padding:0;">(show)</button>`
                        hHTML += buildAdvHTML(tgId, `"${item.name}": <span style="color:#aaa; font-family:monospace;">{Blocking, Styling}</span>`, true, true, catId, true, btn, true)
                        hHTML += `<div id="collapse_${tgId}" style="display:none; margin-left: 12px; padding-left: 8px; border-left: 1px solid #555; margin-top:2px; margin-bottom:4px;"></div>`
                    }
                })
                hHTML += `</div></div>`
            })
            
            hierarchyContainer2.innerHTML = hHTML;

            // Activates native show/hide payload mechanics and implements 3-state expand logic
            [hierarchyContainer1, hierarchyContainer2].forEach(container => {
                container.querySelectorAll('.collapse-btn').forEach(btn => {
                    btn.onclick = (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const targetEl = document.getElementById(btn.dataset.target)
                        if (targetEl) {
                            if (btn.classList.contains('sect-toggle-btn')) {
                                if (btn.innerText === '(expand)') {
                                    const nestedBtns = targetEl.querySelectorAll('.collapse-btn:not(.sect-toggle-btn)')
                                    nestedBtns.forEach(nBtn => {
                                        const nTarget = document.getElementById(nBtn.dataset.target)
                                        if (nTarget) nTarget.style.display = 'block'
                                        nBtn.innerText = '(hide)'
                                    })
                                    btn.innerText = '(hide)'
                                } else {
                                    const nestedBtns = targetEl.querySelectorAll('.collapse-btn:not(.sect-toggle-btn)')
                                    nestedBtns.forEach(nBtn => {
                                        const nTarget = document.getElementById(nBtn.dataset.target)
                                        if (nTarget) nTarget.style.display = 'none'
                                        nBtn.innerText = '(show)'
                                    })
                                    btn.innerText = '(expand)'
                                }
                                return
                            }

                            const hasNestedLinks = targetEl.querySelector('.collapse-btn') !== null
                            
                            if (btn.innerText === '(show)') {
                                targetEl.style.display = 'block'
                                
                                const hasHiddenNested = Array.from(targetEl.querySelectorAll('.collapse-btn')).every(nBtn => {
                                    const nTarget = document.getElementById(nBtn.dataset.target)
                                    return nTarget && nTarget.style.display === 'none'
                                })
                                btn.innerText = (hasNestedLinks && hasHiddenNested) ? '(expand)' : '(hide)'
                            }
                            else if (btn.innerText === '(expand)') {
                                const nestedBtns = targetEl.querySelectorAll('.collapse-btn')
                                nestedBtns.forEach(nBtn => {
                                    const nTarget = document.getElementById(nBtn.dataset.target)
                                    if (nTarget) nTarget.style.display = 'block'
                                    nBtn.innerText = '(hide)'
                                })
                                btn.innerText = '(hide)'
                            } 
                            else {
                                targetEl.style.display = 'none'
                                btn.innerText = '(show)'
                            }
                        }
                    }
                })

                // Initializes button texts accurately on load based on their initial HTML visibility states
                container.querySelectorAll('.collapse-btn').forEach(btn => {
                    const targetEl = document.getElementById(btn.dataset.target)
                    if (targetEl) {
                        if (btn.classList.contains('sect-toggle-btn')) {
                            btn.innerText = '(expand)'
                            return
                        }

                        const isHidden = targetEl.style.display === 'none'
                        if (isHidden) {
                            btn.innerText = '(show)'
                        } else {
                            const hasNestedLinks = targetEl.querySelector('.collapse-btn') !== null
                            const hasHiddenNested = Array.from(targetEl.querySelectorAll('.collapse-btn')).every(nBtn => {
                                const nTarget = document.getElementById(nBtn.dataset.target)
                                return nTarget && nTarget.style.display === 'none'
                            })
                            btn.innerText = (hasNestedLinks && hasHiddenNested) ? '(expand)' : '(hide)'
                        }
                    }
                })

                bindDynamicCheckboxes(container)
            })
            
            const projBtn = document.querySelector('#config-sect-1 .sect-toggle-btn')
            if (projBtn) projBtn.innerText = '(expand)'
            
            const objPropsBtn = document.querySelector('#config-sect-2 .sect-toggle-btn')
            if (objPropsBtn) objPropsBtn.innerText = '(expand)'
        }

        applyMarqueeEffects(configTab)
    }

    // Establishes event delegation bindings
    bindDynamicCheckboxes(configTab)

    const tabBtn = document.querySelector('[data-config-id="tab-config"]')
    if (tabBtn) tabBtn.addEventListener('click', refreshConfigValues)
    
    refreshConfigValues()

    // Aggregates checked UI values into a JSON dictionary and triggers local download
    document.getElementById('export-config-btn').addEventListener('click', () => {
        const template = {
            metadata: {
                type: "ClipHandler_Template",
                timestamp: new Date().toISOString()
            },
            settings: {}
        }

        document.querySelectorAll('.config-export-checkbox:checked').forEach(cb => {
            const targetId = cb.dataset.targetId
            
            if (cb.classList.contains('dynamic-adv-cb')) {
                let dVal = cb.dataset.dynamicVal ? decodeURIComponent(cb.dataset.dynamicVal) : ''
                if (!isNaN(dVal) && dVal !== '') dVal = Number(dVal)
                else if (dVal === 'true') dVal = true
                else if (dVal === 'false') dVal = false
                
                if (!cb.hasAttribute('data-parent-id')) {
                     template.settings[targetId] = true
                } else {
                     template.settings[targetId] = dVal
                }
                return
            }

            const el = document.getElementById(targetId) || document.querySelector(`[data-config-id="${targetId}"]`)
            if (el) {
                if (el.tagName === 'INPUT') {
                    if (el.type === 'checkbox') template.settings[targetId] = el.checked
                    else if (el.type === 'number' || el.type === 'range') template.settings[targetId] = Number(el.value)
                    else template.settings[targetId] = el.value
                } else if (el.tagName === 'SELECT') {
                    template.settings[targetId] = el.value
                } else if (el.classList.contains('active') || el.classList.contains('shadow-active') || el.classList.contains('transform-active')) {
                    template.settings[targetId] = true
                } else {
                    template.settings[targetId] = el.innerText || el.value || false
                }
            }
        })

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(template, null, 2))
        const downloadAnchorNode = document.createElement('a')
        downloadAnchorNode.setAttribute("href", dataStr)
        downloadAnchorNode.setAttribute("download", "clip_template_" + Math.floor(Date.now() / 1000) + ".json")
        document.body.appendChild(downloadAnchorNode)
        downloadAnchorNode.click()
        downloadAnchorNode.remove()
    })

    document.getElementById('import-config-btn').addEventListener('click', () => {
        document.getElementById('config-file-input').click()
    })

    document.getElementById('config-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0]
        if (!file) return
        
        const reader = new FileReader()
        reader.onload = (event) => {
            try {
                const template = JSON.parse(event.target.result)
                if (template.settings) {
                    Object.keys(template.settings).forEach(key => {
                        const el = document.getElementById(key) || document.querySelector(`[data-config-id="${key}"]`) || document.querySelector(`[data-target-id="${key}"]`)
                        if (el) {
                            const val = template.settings[key]
                            if (el.tagName === 'INPUT') {
                                if (el.type === 'checkbox') el.checked = val
                                else el.value = val
                            } else if (el.tagName === 'SELECT') {
                                el.value = val
                            }
                            el.dispatchEvent(new Event('input', { bubbles: true }))
                            el.dispatchEvent(new Event('change', { bubbles: true }))
                        }
                    })
                }
            } catch (err) {}
            e.target.value = ''
        }
        reader.readAsText(file)
    })
}
