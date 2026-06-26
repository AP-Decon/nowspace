//---------------------------------------------------------
// 01. HARDWARE DETECTION & VISUAL TOGGLES
//---------------------------------------------------------
const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 2 && /MacIntel/.test(navigator.platform));

function updateVoiceTogglesVisuals(isActive) {
    document.querySelectorAll('.voice-switch-container').forEach(el => {
        const label = el.querySelector('.voice-switch-label');
        const track = el.querySelector('.voice-switch-track');
        const handle = el.querySelector('.voice-switch-handle');
        
        if (isActive) { // COMMS ARE HOT
            label.innerText = 'COMMS: LIVE';
            label.style.color = 'var(--alert-red)';
            track.style.background = 'rgba(255, 0, 85, 0.3)'; 
            track.style.borderColor = 'var(--alert-red)';
            handle.style.transform = 'translateX(20px)';
            handle.style.background = 'var(--alert-red)';
            handle.style.boxShadow = '0 0 5px var(--alert-red)';
        } else { // COMMS ARE COLD
            label.innerText = 'COMMS: OFF';
            label.style.color = '#555';
            track.style.background = '#111';
            track.style.borderColor = '#333';
            handle.style.transform = 'translateX(0px)';
            handle.style.background = '#555';
            handle.style.boxShadow = 'none';
        }
    });
}

function toggleMute() {
    isMuted = !isMuted;
    if (localStream) {
        localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
    }
    
    document.querySelectorAll('.mute-btn').forEach(btn => {
        if (!isMuted) { // MIC IS HOT
            btn.innerText = '[ 🎙️ MIC: LIVE ]';
            btn.classList.add('btn-alert');
            btn.style.color = ''; 
            btn.style.borderColor = ''; 
        } else { // MIC IS COLD
            btn.innerText = '[ 🔇 MIC: OFF ]';
            btn.classList.remove('btn-alert');
            btn.style.color = '#555'; 
            btn.style.borderColor = '#333'; 
        }
    });
}

function toggleCam() {
    isCamOn = !isCamOn;
    if (localStream) {
        localStream.getVideoTracks().forEach(track => track.enabled = isCamOn);
    }
    
    document.querySelectorAll('.cam-btn').forEach(btn => {
        if (isCamOn) { // CAM IS HOT
            btn.innerText = '[ 📷 CAM: LIVE ]';
            btn.classList.add('btn-alert');
            btn.style.color = ''; 
            btn.style.borderColor = ''; 
        } else { // CAM IS COLD
            btn.innerText = '[ 📷 CAM: OFF ]';
            btn.classList.remove('btn-alert');
            btn.style.color = '#555'; 
            btn.style.borderColor = '#333'; 
        }
    });
}

//---------------------------------------------------------
// 02. STREAM ACQUISITION & HARDWARE
//---------------------------------------------------------
function renderLocalVideo() {
    const containerId = currentRole === 'HOST' ? 'host-video-stream-container' : 'visitor-video-stream-container';
    const container = document.getElementById(containerId);
    if (!container) return;

    const existing = document.getElementById('video-local-wrapper');
    if (existing) existing.remove();

    const videoWrapper = document.createElement('div');
    videoWrapper.id = 'video-local-wrapper';
    videoWrapper.style.position = 'relative';
    videoWrapper.style.display = 'inline-block';
    videoWrapper.style.margin = '5px';
    videoWrapper.style.border = '1px dashed #fff'; 
    videoWrapper.style.backgroundColor = '#000';
    
    const vid = document.createElement('video');
    vid.id = 'video-local';
    vid.srcObject = localStream;
    vid.autoplay = true;
    vid.playsInline = true;
    vid.muted = true; 
    vid.style.width = '160px';
    vid.style.height = '120px';
    vid.style.objectFit = 'cover';
    vid.style.display = 'block';
    vid.style.transform = 'scaleX(-1)'; 
    
    vid.style.cursor = 'zoom-in';
    vid.title = '[ CLICK TO ENLARGE ]';
    vid.onclick = () => {
        if (vid.requestFullscreen) vid.requestFullscreen();
        else if (vid.webkitRequestFullscreen) vid.webkitRequestFullscreen();
        else if (vid.webkitEnterFullscreen) vid.webkitEnterFullscreen(); // iOS Safari
        else if (vid.msRequestFullscreen) vid.msRequestFullscreen(); 
    };
    
    const label = document.createElement('div');
    label.innerText = '[ LOCAL_FEED ]';
    label.style.position = 'absolute';
    label.style.bottom = '0';
    label.style.left = '0';
    label.style.width = '100%';
    label.style.background = 'rgba(255,255,255,0.2)';
    label.style.color = '#fff';
    label.style.fontSize = '0.7rem';
    label.style.textAlign = 'center';
    label.style.padding = '2px 0';
    label.style.fontFamily = 'monospace';
    
    videoWrapper.appendChild(vid);
    videoWrapper.appendChild(label);
    
    container.insertBefore(videoWrapper, container.firstChild);
}

async function toggleVoice() {
    if (!featureToggles.voicecomms) return alert("[ SYSTEM_ERROR ] Communications module is currently disabled by Host.");
    
    if (localStream) {
        // KILL CONNECTION
        if (activeCalls.length > 0) { activeCalls.forEach(call => call.close()); activeCalls = []; }
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
        updateVoiceTogglesVisuals(false);
        document.querySelectorAll('.mute-btn, .cam-btn, .screen-btn').forEach(btn => btn.style.display = 'none');
        document.getElementById('host-video-stream-container').innerHTML = '';
        document.getElementById('visitor-video-stream-container').innerHTML = '';
    } else {
        // INITIALIZE CONNECTION
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            
            // Default hardware state to COLD so users don't hot-mic
            isMuted = true;
            isCamOn = false;
            localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
            localStream.getVideoTracks().forEach(track => track.enabled = isCamOn);

            updateVoiceTogglesVisuals(true);
            
            // Reveal buttons based on hardware
            document.querySelectorAll('.mute-btn, .cam-btn').forEach(btn => btn.style.display = 'inline-block');
            if (!isMobileDevice) {
                document.querySelectorAll('.screen-btn').forEach(btn => btn.style.display = 'inline-block');
            }
            
            // Force the UI buttons to match the cold state
            isMuted = false; toggleMute(); 
            isCamOn = true; toggleCam();

            // Render the local preview
            renderLocalVideo();

            // Broadcast to active peers dynamically
            if (currentRole === 'HOST') {
                for (let id in peer.connections) {
                    // Check if they are physically connected before calling
                    if (peer.connections[id].some(c => c.open)) {
                        let call = peer.call(id, localStream);
                        activeCalls.push(call);
                        handleCallEvent(call);
                    }
                }
            } else if (currentRole === 'VISITOR' && currentNetworkPeers.length > 0) {
                currentNetworkPeers.forEach(id => {
                    let call = peer.call(id, localStream);
                    activeCalls.push(call);
                    handleCallEvent(call);
                });
            }
        } catch (err) {
            alert("[ HARDWARE_ERROR ] Microphone or Camera access denied.\n" + err.message);
            updateVoiceTogglesVisuals(false);
        }
    }
}

async function toggleScreen() {
    if (!localStream || isMobileDevice) return;

    if (isScreenSharing) {
        // CANCEL SCREEN SHARE
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            const videoTrack = newStream.getVideoTracks()[0];
            
            activeCalls.forEach(call => {
                const sender = call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(videoTrack);
            });

            localStream.removeTrack(localStream.getVideoTracks()[0]);
            localStream.addTrack(videoTrack);
            localStream.getVideoTracks()[0].enabled = isCamOn;

            const localVid = document.getElementById('video-local');
            if (localVid) { localVid.srcObject = localStream; localVid.style.transform = 'scaleX(-1)'; }

            isScreenSharing = false;
            document.querySelectorAll('.screen-btn').forEach(btn => {
                btn.innerText = '[ 🖥️ SCREEN ]';
                btn.classList.remove('btn-alert');
                btn.style.color = '#555'; 
                btn.style.borderColor = '#333'; 
            });
        } catch (err) { console.warn("[ SYSTEM ] Reverting to camera failed.", err); }
    } else {
        // INITIATE SCREEN SHARE
        try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            const screenTrack = displayStream.getVideoTracks()[0];

            screenTrack.onended = () => { toggleScreen(); };

            activeCalls.forEach(call => {
                const sender = call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
            });

            localStream.removeTrack(localStream.getVideoTracks()[0]);
            localStream.addTrack(screenTrack);

            const localVid = document.getElementById('video-local');
            if (localVid) { localVid.srcObject = localStream; localVid.style.transform = 'none'; }

            isScreenSharing = true;
            document.querySelectorAll('.screen-btn').forEach(btn => {
                btn.innerText = '[ 🖥️ SHARING ]';
                btn.classList.add('btn-alert');
                btn.style.color = ''; 
                btn.style.borderColor = ''; 
            });
            
            isCamOn = false; toggleCam();

        } catch (err) { console.warn("[ SYSTEM ] Screen sharing canceled.", err); }
    }
}

//---------------------------------------------------------
// 03. VOLUME & PEER ROUTING
//---------------------------------------------------------
function updateMasterVolume(val) {
    globalVolume = val;
    document.querySelectorAll('audio, video').forEach(el => {
        if (el.id !== 'video-local') el.volume = val;
    });
}

function setupPeerCallListener() {
    peer.on('call', (call) => {
        if (localStream) {
            call.answer(localStream);
        } else {
            call.answer(); // Answer passively if camera isn't on yet
        }
        activeCalls.push(call);
        handleCallEvent(call);
    });
}

function handleCallEvent(call) {
    call.on('stream', (remoteStream) => {
        const containerId = currentRole === 'HOST' ? 'host-video-stream-container' : 'visitor-video-stream-container';
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // THE FIX: If the video box already exists, inject the new stream directly into it!
        let vid = document.getElementById(`video-${call.peer}`);
        if (vid) {
            vid.srcObject = remoteStream;
            return; 
        }

        const videoWrapper = document.createElement('div');
        videoWrapper.style.position = 'relative';
        videoWrapper.style.display = 'inline-block';
        videoWrapper.style.margin = '5px';
        videoWrapper.style.border = '1px solid var(--main-cyan)';
        videoWrapper.style.boxShadow = '0 0 5px var(--main-cyan)';
        videoWrapper.style.backgroundColor = '#000';
        
        vid = document.createElement('video');
        vid.id = `video-${call.peer}`;
        vid.srcObject = remoteStream;
        vid.autoplay = true;
        vid.playsInline = true;
        vid.style.width = '160px';
        vid.style.height = '120px';
        vid.style.objectFit = 'cover';
        vid.style.display = 'block';
        
        vid.style.cursor = 'zoom-in';
        vid.title = '[ CLICK TO ENLARGE ]';
        vid.onclick = () => {
            if (vid.requestFullscreen) vid.requestFullscreen();
            else if (vid.webkitRequestFullscreen) vid.webkitRequestFullscreen();
            else if (vid.webkitEnterFullscreen) vid.webkitEnterFullscreen(); // iOS Safari
            else if (vid.msRequestFullscreen) vid.msRequestFullscreen(); 
        };
        
        const label = document.createElement('div');
        label.innerText = peerFingerprintMap[call.peer] ? peerFingerprintMap[call.peer].alias : call.peer.substring(0,6);
        label.style.position = 'absolute';
        label.style.bottom = '0';
        label.style.left = '0';
        label.style.width = '100%';
        label.style.background = 'rgba(0,0,0,0.7)';
        label.style.color = 'var(--main-cyan)';
        label.style.fontSize = '0.7rem';
        label.style.textAlign = 'center';
        label.style.padding = '2px 0';
        label.style.fontFamily = 'monospace';
        
        videoWrapper.appendChild(vid);
        videoWrapper.appendChild(label);
        container.appendChild(videoWrapper);
        
        vid.volume = globalVolume;
    });

    call.on('close', () => {
        activeCalls = activeCalls.filter(c => c !== call);
        // Smart Cleanup: Only remove the video box if there are no overlapping calls from this person
        const hasOtherCall = activeCalls.some(c => c.peer === call.peer);
        if (!hasOtherCall) {
            const vidWrapper = document.getElementById(`video-${call.peer}`)?.parentElement;
            if (vidWrapper) vidWrapper.remove();
        }
    });
    
    call.on('error', (err) => { console.warn("[ STREAM_ERROR ] ", err); });
}
