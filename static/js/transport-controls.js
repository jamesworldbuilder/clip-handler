// imports dom references
import { video, scrubber, scrubberProgress, scrubberWrap, scrubberTooltip, hoverTooltip } from './dom-elements.js'

let isHoveringScrubber = false
let animationFrameId = null

// formats raw seconds into digital time string
export function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00:00"
    const h = Math.floor(Math.abs(seconds) / 3600).toString().padStart(2, '0')
    const m = Math.floor((Math.abs(seconds) % 3600) / 60).toString().padStart(2, '0')
    const s = Math.floor(Math.abs(seconds) % 60).toString().padStart(2, '0')
    return `${h}:${m}:${s}`
}

// syncs ui values continuously during video playback
function renderScrubberAnimation() {
    if (!video.paused) {
        const percent = video.currentTime / (video.duration || 1)
        scrubber.value = video.currentTime
        scrubberProgress.style.width = `${percent * 100}%`
        
        document.getElementById('time-display').innerText = `${formatTime(video.currentTime)} / ${formatTime(video.duration || 0)}`
        
        const rect = scrubberWrap.getBoundingClientRect()
        const pos = percent * rect.width
        const remainingInSeconds = (video.duration || 0) - video.currentTime
        
        scrubberTooltip.style.left = `${pos}px`
        scrubberTooltip.innerText = `-${formatTime(video.currentTime)} / ${formatTime(remainingInSeconds)}`
        scrubberTooltip.style.opacity = '1'

        animationFrameId = requestAnimationFrame(renderScrubberAnimation)
    }
}

// attaches transport event listeners
export function initTransport() {
    // assigns max value manually since metadata already loaded
    scrubber.max = video.duration || 100
    document.getElementById('time-display').innerText = `00:00:00 / ${formatTime(video.duration || 0)}`

    // registers hover state
    scrubberWrap.addEventListener('mouseenter', () => {
        isHoveringScrubber = true
    })

    // updates tooltip position and times on hover
    scrubberWrap.addEventListener('mousemove', (e) => {
        const rect = scrubberWrap.getBoundingClientRect()
        const pos = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
        const percent = pos / rect.width
        const timeInSeconds = percent * (video.duration || 0)
        
        hoverTooltip.style.left = `${pos}px`
        hoverTooltip.innerText = formatTime(timeInSeconds)
        hoverTooltip.style.opacity = '1'

        if (video.paused) {
            const thumbPos = (scrubber.value / (video.duration || 1)) * rect.width
            const remainingInSeconds = (video.duration || 0) - scrubber.value
            scrubberTooltip.style.left = `${thumbPos}px`
            scrubberTooltip.innerText = `-${formatTime(scrubber.value)} / ${formatTime(remainingInSeconds)}`
            scrubberTooltip.style.opacity = '1'
        }
    })

    // clears tooltips on mouse exit
    scrubberWrap.addEventListener('mouseleave', () => {
        isHoveringScrubber = false
        hoverTooltip.style.opacity = '0'
        if (video.paused) {
            scrubberTooltip.style.opacity = '0'
        }
    })

    // handles play and pause toggle
    document.getElementById('play-pause-btn').addEventListener('click', (e) => {
        if (video.paused) {
            video.play()
            e.target.innerText = 'Pause'
            animationFrameId = requestAnimationFrame(renderScrubberAnimation)
        } else {
            video.pause()
            e.target.innerText = 'Play'
            cancelAnimationFrame(animationFrameId)
        }
    })

    // hides tooltip when paused without hover
    video.addEventListener('pause', () => {
        if (!isHoveringScrubber) {
            scrubberTooltip.style.opacity = '0'
        }
    })

    // syncs mute toggle
    document.getElementById('mute-toggle').addEventListener('change', (e) => {
        video.muted = e.target.checked
    })

    // handles manual scrubber input
    scrubber.addEventListener('input', () => {
        video.currentTime = scrubber.value
        const percent = (scrubber.value / (video.duration || 1)) * 100
        scrubberProgress.style.width = `${percent}%`
        
        document.getElementById('time-display').innerText = `${formatTime(video.currentTime)} / ${formatTime(video.duration || 0)}`
        
        const rect = scrubberWrap.getBoundingClientRect()
        const pos = (percent / 100) * rect.width
        const remainingInSeconds = (video.duration || 0) - video.currentTime
        
        scrubberTooltip.style.left = `${pos}px`
        scrubberTooltip.innerText = `-${formatTime(video.currentTime)} / ${formatTime(remainingInSeconds)}`
        scrubberTooltip.style.opacity = '1'
    })
}
