//---------------------------------------------------------
// 01. LOCAL MEDIA CONTROLS & INITIALIZATION
//---------------------------------------------------------
async function toggleVoice() {
    if (!featureToggles.voicecomms) {
        return alert("A/V Comms are disabled on this node.");
    }

    if (localStream) {
        // Turning OFF
        if (activeCalls.length > 0) { 
            activeCalls.forEach(call => call.close()); 
            activeCalls = []; 
        }
        
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
        updateVoiceTogglesVisuals(false);
        
        const containerId = currentRole === 'HOST' ? 'host-video-stream-container' : 'visitor-video-stream-container';
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = '';
        return;
    }

    // Turning ON
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        // Start with Camera OFF and Mic ON by default
        isMuted = false;
        isCamOn = false;
        localStream.getVideoTracks().forEach(t => t.enabled = false);

        updateVoiceTogglesVisuals(true);
        renderLocalStream();

        // Broadcast to all active peers
        if (currentRole === 'HOST') {
            const activePeers = Object.keys(peer.connections).filter(id => peer.connections[id][0] && peer.connections[id][0].open);
            activePeers.forEach(id => {
                let call = peer.call(id, localStream);
                activeCalls.push(call);
                handleCallEvent(call);
            });
        } else if (currentRole === 'VISITOR') {
            currentNetworkPeers.forEach(id => {
                let call = peer.call(id, localStream);
                activeCalls.push(call);
                handleCallEvent(call);
            });
        }
    } catch (err) {
        alert("[ HARDWARE ERROR ] Could not access camera/microphone.\n" + err.message);
    }
}

function updateVoiceTogglesVisuals(isActive) {
    document.querySelectorAll('.voice-switch-label').forEach(el => {
        el.innerText = isActive ? "COMMS: ON" : "COMMS: OFF";
    });
    
    document.querySelectorAll('.voice-switch-container').forEach(el => {
        el.classList.toggle('active', isActive);
    });
    
    document.querySelectorAll('.mute-btn, .cam-btn, .screen-btn').forEach(b => {
        b.style.display = isActive ? 'inline-block' : 'none';
    });

    if (!isActive) {
        document.querySelectorAll('.mute-btn').forEach(b => { 
            b.innerText = "[ 🔊 MUTE ]"; 
            b.classList.remove('btn-alert'); 
        });
        document.querySelectorAll('.cam-btn').forEach(b => { 
            b.innerText = "[ 📷 CAM: OFF ]"; 
            b.classList.add('btn-alert'); 
        });
        document.querySelectorAll('.screen-btn').forEach(b => { 
            b.innerText = "[ 🖥️ SCREEN ]"; 
            b.classList.remove('btn-alert'); 
        });
    }
}

function toggleMute() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    
    document.querySelectorAll('.mute-btn').forEach(b => {
        b.innerText = isMuted ? "[ 🔇 UNMUTE ]" : "[ 🔊 MUTE ]";
        if(isMuted) {
            b.classList.add('btn-alert'); 
        } else {
            b.classList.remove('btn-alert');
        }
    });
}

function toggleCam() {
    if (!localStream) return;
    if (isScreenSharing) {
        alert("Please stop Screen Sharing before toggling the camera.");
        return;
    }
    
    isCamOn = !isCamOn;
    localStream.getVideoTracks().forEach(t => t.enabled = isCamOn);
    
    document.querySelectorAll('.cam-btn').forEach(b => {
        b.innerText = isCamOn ? "[ 📷 CAM: ON ]" : "[ 📷 CAM: OFF ]";
        if(!isCamOn) {
            b.classList.add('btn-alert'); 
        } else {
            b.classList.remove('btn-alert');
        }
    });
}

async function toggleScreen() {
    if (!localStream) return;
    
    if (isScreenSharing) {
        // Revert to camera
        try {
            const newCamStream = await navigator.mediaDevices.getUserMedia({ video: true });
            const videoTrack = newCamStream.getVideoTracks()[0];
            const senderVideo = localStream.getVideoTracks()[0];
            
            localStream.removeTrack(senderVideo);
            localStream.addTrack(videoTrack);
            
            activeCalls.forEach(call => {
                const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                if (sender) sender.replaceTrack(videoTrack);
            });
            
            videoTrack.enabled = isCamOn;
            isScreenSharing = false;
            
            document.querySelectorAll('.screen-btn').forEach(b => {
                b.innerText = "[ 🖥️ SCREEN ]";
                b.classList.remove('btn-alert');
            });
            
            const localVid = document.getElementById('local-video-preview');
            if (localVid) localVid.srcObject = localStream;
            
        } catch (err) {
            console.error("Failed to revert to camera:", err);
        }
    } else {
        // Switch to Screen Share
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];
            const senderVideo = localStream.getVideoTracks()[0];
            
            localStream.removeTrack(senderVideo);
            localStream.addTrack(screenTrack);
            
            activeCalls.forEach(call => {
                const sender = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
            });
            
            isScreenSharing = true;
            
            // If they click "Stop Sharing" on the browser's system popup
            screenTrack.onended = () => { 
                if(isScreenSharing) toggleScreen(); 
            };
            
            document.querySelectorAll('.screen-btn').forEach(b => {
                b.innerText = "[ 🛑 STOP SHARE ]";
                b.classList.add('btn-alert');
            });
            
            const localVid = document.getElementById('local-video-preview');
            if (localVid) localVid.srcObject = localStream;
            
        } catch (err) {
            console.error("Screen share failed:", err);
        }
    }
}

//---------------------------------------------------------
// 02. PEER STREAM RENDERING & INDIVIDUAL VOLUME CONTROL
//---------------------------------------------------------
function renderLocalStream() {
    const containerId = currentRole === 'HOST' ? 'host-video-stream-container' : 'visitor-video-stream-container';
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let localWrapper = document.getElementById('local-stream-wrapper');
    if (!localWrapper) {
        localWrapper = document.createElement('div');
        localWrapper.id = 'local-stream-wrapper';
        localWrapper.className = 'remote-stream-wrapper';
        localWrapper.style = 'position: relative; display: inline-block; margin: 5px; border: 1px solid #0f0; background: #000; border-radius: 4px; overflow: hidden;';
        
        const localVid = document.createElement('video');
        localVid.id = 'local-video-preview';
        localVid.srcObject = localStream;
        localVid.autoplay = true;
        localVid.muted = true; // Never play your own audio back to yourself!
        localVid.playsInline = true;
        localVid.style = 'width: 200px; height: 150px; object-fit: cover; display: block;';
        
        const label = document.createElement('div');
        label.innerText = '[ YOU ]';
        label.style = 'position: absolute; top: 5px; left: 5px; background: rgba(0,0,0,0.7); color: #0f0; font-size: 0.7rem; padding: 2px 4px; z-index: 10; pointer-events: none; border-radius: 2px;';
        
        localWrapper.appendChild(localVid);
        localWrapper.appendChild(label);
        container.appendChild(localWrapper);
    }
}

function setupPeerCallListener() {
    peer.on('call', (call) => {
        if (!localStream) {
            call.answer(); 
        } else {
            call.answer(localStream);
            activeCalls.push(call);
        }
        handleCallEvent(call);
    });
}

function handleCallEvent(call) {
    call.on('stream', (remoteStream) => {
        const containerId = currentRole === 'HOST' ? 'host-video-stream-container' : 'visitor-video-stream-container';
        const container = document.getElementById(containerId);
        if (!container) return;

        // Prevent identical streams from creating infinite duplicate boxes
        const existingEl = document.getElementById(`wrapper-${remoteStream.id}`);
        if (existingEl) return;

        // Pull their alias if available
        let alias = "PEER";
        if (peerFingerprintMap[call.peer]) {
            alias = peerFingerprintMap[call.peer].alias;
        }

        // 1. The Main Wrapper
        const wrapper = document.createElement('div');
        wrapper.id = `wrapper-${remoteStream.id}`;
        wrapper.className = 'remote-stream-wrapper';
        wrapper.style = 'position: relative; display: inline-block; margin: 5px; border: 1px solid var(--main-cyan); background: #000; width: 200px; border-radius: 4px; overflow: hidden;';

        // 2. The Video Element
        const mediaEl = document.createElement('video');
        mediaEl.id = `media-${remoteStream.id}`;
        mediaEl.srcObject = remoteStream;
        mediaEl.autoplay = true;
        mediaEl.playsInline = true;
        mediaEl.style = 'width: 200px; height: 150px; object-fit: cover; display: block;';

        // 3. The Individual Audio Control Strip
        const controlsWrap = document.createElement('div');
        controlsWrap.style = 'padding: 6px; background: rgba(0,0,0,0.9); border-top: 1px dashed #333; display: flex; align-items: center; justify-content: space-between; font-size: 0.7rem;';

        const label = document.createElement('span');
        label.innerText = `VOL:`;
        label.style.color = 'var(--main-cyan)';
        label.style.marginRight = '5px';

        const volSlider = document.createElement('input');
        volSlider.type = 'range';
        volSlider.min = '0';
        volSlider.max = '1';
        volSlider.step = '0.05';
        volSlider.value = '1'; // Default full volume
        volSlider.style.width = '70px';
        volSlider.style.margin = '0 5px';
        volSlider.style.cursor = 'pointer';
        
        // Dynamic audio adjustment
        volSlider.oninput = (e) => { 
            mediaEl.volume = e.target.value; 
        };

        const muteBtn = document.createElement('button');
        muteBtn.innerText = '🔇';
        muteBtn.className = 'btn-small';
        muteBtn.style.padding = '0 6px';
        muteBtn.style.fontSize = '0.8rem';
        
        // Mute Toggle Logic
        muteBtn.onclick = () => {
            if(mediaEl.volume > 0) {
                mediaEl.dataset.oldVol = mediaEl.volume;
                mediaEl.volume = 0;
                volSlider.value = 0;
                muteBtn.innerText = '🔊';
                muteBtn.classList.add('btn-alert');
            } else {
                mediaEl.volume = mediaEl.dataset.oldVol || 1;
                volSlider.value = mediaEl.volume;
                muteBtn.innerText = '🔇';
                muteBtn.classList.remove('btn-alert');
            }
        };

        // 4. Name Badge
        const nameTag = document.createElement('div');
        nameTag.innerText = `[ ${alias.substring(0, 12)} ]`;
        nameTag.style = 'position: absolute; top: 5px; left: 5px; background: rgba(0,0,0,0.8); color: var(--main-cyan); font-size: 0.7rem; padding: 2px 4px; z-index: 10; pointer-events: none; border-radius: 2px;';

        controlsWrap.appendChild(label);
        controlsWrap.appendChild(volSlider);
        controlsWrap.appendChild(muteBtn);

        wrapper.appendChild(nameTag);
        wrapper.appendChild(mediaEl);
        wrapper.appendChild(controlsWrap);
        
        container.appendChild(wrapper);
    });

    call.on('close', () => {
        // Automatically delete the user's video box if they hang up or disconnect
        const wrappers = document.querySelectorAll('.remote-stream-wrapper');
        wrappers.forEach(w => {
            const vid = w.querySelector('video');
            if (vid && vid.srcObject && !vid.srcObject.active) {
                w.remove();
            }
        });
    });
}
// END
