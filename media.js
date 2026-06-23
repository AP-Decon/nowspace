// === AUDIO / VISUAL COMMS ENGINE & FULLSCREEN ===
function getVidContainer() {
    return currentRole === 'HOST' 
        ? document.getElementById('host-video-stream-container') 
        : document.getElementById('visitor-video-stream-container');
}

function makeFullscreen(elem) {
    if (elem.requestFullscreen) { elem.requestFullscreen().catch(err => console.log(err)); } 
    else if (elem.webkitRequestFullscreen) { elem.webkitRequestFullscreen(); } 
    else if (elem.webkitEnterFullscreen) { elem.webkitEnterFullscreen(); } 
    else if (elem.msRequestFullscreen) { elem.msRequestFullscreen(); }
}

function toggleMute() {
    if (localStream && localStream.getAudioTracks().length > 0) {
        isMuted = !isMuted; 
        localStream.getAudioTracks()[0].enabled = !isMuted;
        document.querySelectorAll('.mute-btn').forEach(b => {
            b.innerText = isMuted ? "[ 🔇 UNMUTE ]" : "[ 🔊 MUTE ]";
            b.classList.toggle('btn-alert', isMuted);
        });
    }
}

function toggleCam() {
    if (!localStream) return;
    if (isScreenSharing) return alert("[ SYSTEM NOTICE ] Cannot activate camera while screen sharing is active.");
    
    isCamOn = !isCamOn;
    localStream.getVideoTracks()[0].enabled = isCamOn;
    document.querySelectorAll('.cam-btn').forEach(b => {
        b.innerText = isCamOn ? "[ 📷 CAM: ON ]" : "[ 📷 CAM: OFF ]";
        b.classList.toggle('btn-alert', !isCamOn);
    });
}

function updateVoiceTogglesVisuals(isLive) {
    document.querySelectorAll('.voice-switch-container').forEach(sw => {
        sw.classList.toggle('active', isLive); sw.querySelector('.voice-switch-label').innerText = isLive ? "COMMS: LIVE" : "COMMS: OFF";
    });
}

async function toggleScreen() {
    if (!localStream) return alert("[ SYSTEM_ERROR ] You must enable COMMS before broadcasting your display.");

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        return alert("[ OS_RESTRICTION ] Screen broadcasting is blocked by this device's operating system.");
    }

    if (isScreenSharing) {
        try {
            const newCamStream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, frameRate: 15 } });
            const newCamTrack = newCamStream.getVideoTracks()[0];
            newCamTrack.enabled = isCamOn; 
            
            const oldVideoTrack = localStream.getVideoTracks()[0];
            
            activeCalls.forEach(call => {
                const sender = call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(newCamTrack);
            });
            
            localStream.removeTrack(oldVideoTrack);
            localStream.addTrack(newCamTrack);
            oldVideoTrack.stop(); 

            const localVid = document.getElementById('local-video-node');
            if (localVid) localVid.srcObject = localStream;
            
            isScreenSharing = false;
            document.querySelectorAll('.screen-btn').forEach(b => {
                b.innerText = "[ 🖥️ SCREEN ]";
                b.classList.remove('btn-alert');
            });
        } catch(e) { console.error("Failed to revert to camera stream:", e); }
        return;
    }

    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 } });
        const screenTrack = screenStream.getVideoTracks()[0];
        const oldVideoTrack = localStream.getVideoTracks()[0];
        
        activeCalls.forEach(call => {
            const sender = call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) sender.replaceTrack(screenTrack);
        });

        localStream.removeTrack(oldVideoTrack);
        localStream.addTrack(screenTrack);
        oldVideoTrack.stop(); 

        const localVid = document.getElementById('local-video-node');
        if (localVid) localVid.srcObject = localStream;

        screenTrack.onended = () => { if(isScreenSharing) toggleScreen(); };

        isScreenSharing = true;
        if (!isCamOn) toggleCam();

        document.querySelectorAll('.screen-btn').forEach(b => {
            b.innerText = "[ 🖥️ SHARING ]";
            b.classList.add('btn-alert');
        });
    } catch (err) {
        console.error("Screen share deployment skipped or rejected:", err);
    }
}

async function toggleVoice() {
    if (activeCalls.length > 0 || localStream) {
        activeCalls.forEach(c => c.close()); activeCalls = [];
        if(localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
        updateVoiceTogglesVisuals(false); 
        isScreenSharing = false;
        document.querySelectorAll('.mute-btn, .cam-btn, .screen-btn').forEach(b => {
            b.style.display = 'none';
            b.classList.remove('btn-alert');
        });
        document.querySelectorAll('.screen-btn').forEach(b => b.innerText = "[ 🖥️ SCREEN ]");
        getVidContainer().innerHTML = '';
        return;
    }
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: { width: 320, height: 240, frameRate: 15 } 
        });
        
        updateVoiceTogglesVisuals(true); 
        isMuted = false;
        isCamOn = false;
        isScreenSharing = false;
        localStream.getVideoTracks().forEach(t => t.enabled = false);

        document.querySelectorAll('.mute-btn').forEach(b => { b.style.display = 'inline-block'; b.innerText = "[ 🔊 MUTE ]"; b.classList.remove('btn-alert');});
        document.querySelectorAll('.cam-btn').forEach(b => { b.style.display = 'inline-block'; b.innerText = "[ 📷 CAM: OFF ]"; b.classList.add('btn-alert'); });
        
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
            document.querySelectorAll('.screen-btn').forEach(b => { b.style.display = 'inline-block'; });
        }

        let localVid = document.createElement('video');
        localVid.srcObject = localStream;
        localVid.autoplay = true;
        localVid.muted = true;
        localVid.setAttribute('playsinline', '');
        localVid.classList.add('video-feed', 'local-video');
        localVid.id = 'local-video-node';
        
        localVid.style.cursor = 'pointer';
        localVid.title = "Tap to Expand";
        localVid.addEventListener('click', () => { makeFullscreen(localVid); });

        getVidContainer().appendChild(localVid);

        if (currentNetworkPeers.length > 0) {
            currentNetworkPeers.forEach(pId => {
                let call = peer.call(pId, localStream);
                activeCalls.push(call);
                handleCallEvent(call);
            });
        }
    } catch(e) { updateVoiceTogglesVisuals(false); }
}

function handleCallEvent(call) {
    call.on('stream', (remote) => {
        let v = document.getElementById('video-node-' + call.peer);
        if(!v) {
            v = document.createElement('video');
            v.autoplay = true;
            v.setAttribute('playsinline', '');
            v.id = 'video-node-' + call.peer;
            v.classList.add('video-feed');
            
            v.style.cursor = 'pointer';
            v.title = "Tap to Expand";
            v.addEventListener('click', () => { makeFullscreen(v); });

            getVidContainer().appendChild(v);
        }
        v.srcObject = remote;
        v.play().catch(e => console.warn("Mobile autoplay restriction intercepted stream:", e));
    });
    call.on('close', () => {
        let v = document.getElementById('video-node-' + call.peer); if(v) v.remove();
        activeCalls = activeCalls.filter(c => c !== call);
    });
}

function setupPeerCallListener() {
    peer.on('call', (call) => {
        if(!featureToggles.voicecomms) { call.close(); return; }
        call.answer(localStream || undefined);
        activeCalls.push(call); 
        handleCallEvent(call);
    });
}