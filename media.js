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

    // Clear any existing local preview
    const existing = document.getElementById('video-local-wrapper');
    if (existing) existing.remove();

    const videoWrapper = document.createElement('div');
    videoWrapper.id = 'video-local-wrapper';
    videoWrapper.style.position = 'relative';
    videoWrapper.style.display = 'inline-block';
    videoWrapper.style.margin = '5px';
    videoWrapper.style.border = '1px dashed #fff'; // White dashed border for local feed
    videoWrapper.style.backgroundColor = '#000';
    
    const vid = document.createElement('video');
    vid.id = 'video-local';
    vid.srcObject = localStream;
    vid.autoplay = true;
    vid.playsInline = true;
    vid.muted = true; // Crucial: mutes your own mic so you don't hear an echo
    vid.style.width = '160px';
    vid.style.height = '120px';
    vid.style.objectFit = 'cover';
    vid.style.display = 'block';
    vid.style.transform = 'scaleX(-1)'; // Mirrors your preview so it feels like a real mirror
    
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
    
    // Insert local video first in the list
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

            // Render the local preview mirror!
            renderLocalVideo();

            // Broadcast to active peers
            if (currentRole === 'HOST') {
                for (let id in peer.connections) {
                    if (peer.connections[id][0] && peer.connections[id][0].open) {
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

            // Ensure the local video element recognizes the new track
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

            // Turn off mirroring when sharing a screen so text is readable
            const localVid = document.getElementById('video-local');
            if (localVid) { localVid.srcObject = localStream; localVid.style.transform = 'none'; }

            isScreenSharing = true;
            document.querySelectorAll('.screen-btn').forEach(btn => {
                btn.innerText = '[ 🖥️ SHARING ]';
                btn.classList.add('btn-alert');
                btn.style.color = ''; 
                btn.style.borderColor = ''; 
            });
            
            // Force Camera UI to hot state since video is transmitting
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
        // Exclude the local monitor from global volume changes so it stays muted
        if (el.id !== 'video-local') {
            el.volume = val;
        }
    });
}

function setupPeerCallListener() {
    peer.on('call', (call) => {
        if (localStream) {
            call.answer(localStream);
            activeCalls.push(call);
            handleCallEvent(call);
        } else {
            call.answer(); 
            activeCalls.push(call);
            handleCallEvent(call);
        }
    });
}

function handleCallEvent(call) {
    call.on('stream', (remoteStream) => {
        const containerId = currentRole === 'HOST' ? 'host-video-stream-container' : 'visitor-video-stream-container';
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const existingVideo = document.getElementById(`video-${call.peer}`);
        if (existingVideo) return; 

        const videoWrapper = document.createElement('div');
        videoWrapper.style.position = 'relative';
        videoWrapper.style.display = 'inline-block';
        videoWrapper.style.margin = '5px';
        videoWrapper.style.border = '1px solid var(--main-cyan)';
        videoWrapper.style.boxShadow = '0 0 5px var(--main-cyan)';
        videoWrapper.style.backgroundColor = '#000';
        
        const vid = document.createElement('video');
        vid.id = `video-${call.peer}`;
        vid.srcObject = remoteStream;
        vid.autoplay = true;
        vid.playsInline = true;
        vid.style.width = '160px';
        vid.style.height = '120px';
        vid.style.objectFit = 'cover';
        vid.style.display = 'block';
        
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
        const vidWrapper = document.getElementById(`video-${call.peer}`)?.parentElement;
        if (vidWrapper) vidWrapper.remove();
        activeCalls = activeCalls.filter(c => c !== call);
    });
    
    call.on('error', (err) => { console.warn("[ STREAM_ERROR ] ", err); });
}
