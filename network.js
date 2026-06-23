//---------------------------------------------------------
// 01. NODE ROUTING & CONNECTION MANAGEMENT
//---------------------------------------------------------
function broadcastOnlineUsers() {
    if (currentRole !== 'HOST') return;
    const hostAlias = document.getElementById('my-alias').value.trim() || 'NODE-ALPHA';
    const onlineUsers = [{ id: peer.id, alias: hostAlias, isHost: true }];
    
    const activePeers = Object.keys(peer.connections).filter(id => peer.connections[id][0] && peer.connections[id][0].open);
    activePeers.forEach(id => {
        if (peerFingerprintMap[id]) {
            onlineUsers.push({ id: id, alias: peerFingerprintMap[id].alias, isHost: false });
        }
    });

    currentNetworkPeers = onlineUsers.map(u => u.id).filter(id => id !== peer.id);
    broadcastToAll({ type: MSG_TYPE_USER_LIST, users: onlineUsers });
}

function renderActivePeers() {
    const container = document.getElementById('host-active-peers');
    if(!container) return;
    const peers = Object.keys(peer.connections).filter(id => peer.connections[id][0] && peer.connections[id][0].open);
    if(peers.length === 0) { container.innerHTML = "No active peers."; return; }
    container.innerHTML = peers.map(id => {
        const data = peerFingerprintMap[id] || {alias: 'Unknown'};
        return `<div style="display:flex; justify-content:space-between; margin-bottom:5px; border-bottom:1px dashed #333; padding-bottom:3px; align-items:center;">
            <span>${data.alias} <span style="color:#555;font-size:0.7rem;">(${id.substring(0,6)})</span></span>
            <button class="btn-small btn-alert" onclick="kickAndBan('${id}')">[ BAN ]</button>
        </div>`;
    }).join('');
}

function kickAndBan(targetPeerId) {
    if(confirm("BANISH THIS VISITOR? Their fingerprint will be permanently blocked from this node.")) {
        const fp = peerFingerprintMap[targetPeerId]?.fingerprint;
        if (fp && !bannedFingerprints.includes(fp)) { 
            bannedFingerprints.push(fp); 
            localStorage.setItem('nowspace_banned', JSON.stringify(bannedFingerprints)); 
        }
        if (peer.connections[targetPeerId]) { 
            peer.connections[targetPeerId].forEach(c => { 
                c.send({type: 'BANNED'}); setTimeout(() => c.close(), 500); 
            }); 
        }
        renderActivePeers();
        renderBannedPeers();
        broadcastOnlineUsers();
    }
}

function renderBannedPeers() {
    const container = document.getElementById('host-banned-list');
    if(!container) return;
    if(bannedFingerprints.length === 0) { container.innerHTML = "No active bans."; return; }
    container.innerHTML = bannedFingerprints.map(fp => {
        return `<div style="display:flex; justify-content:space-between; margin-bottom:5px; border-bottom:1px dashed #333; padding-bottom:3px; align-items:center;">
            <span style="color:#555;font-size:0.7rem;">${fp}</span>
            <button class="btn-small" style="border-color:#0f0; color:#0f0;" onclick="unbanFingerprint('${fp}')">[ UNBAN ]</button>
        </div>`;
    }).join('');
}

function unbanFingerprint(fp) {
    bannedFingerprints = bannedFingerprints.filter(f => f !== fp);
    localStorage.setItem('nowspace_banned', JSON.stringify(bannedFingerprints));
    renderBannedPeers();
}

function disconnectNode() {
    if (activeCalls.length > 0) activeCalls.forEach(c => c.close()); activeCalls = [];
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (peer) peer.destroy(); peer = null; activeConn = null; currentRole = null; activePoll = null;
    document.getElementById('visitor-view').style.display = 'none'; document.getElementById('host-live-wall-panel').style.display = 'none';
    document.getElementById('host-setup-panel').style.display = 'block'; document.getElementById('visitor-connect-panel').style.display = 'block';
    document.getElementById('btn-go-online').disabled = false; document.getElementById('my-id-display').style.display = 'none';
    globalDisconnectBtn.style.display = 'none'; 
    isScreenSharing = false;
    
    if(typeof updateVoiceTogglesVisuals === "function") updateVoiceTogglesVisuals(false); 
    
    document.querySelectorAll('.mute-btn, .cam-btn, .screen-btn').forEach(b => {
        b.style.display = 'none';
        b.classList.remove('btn-alert');
    });
    document.querySelectorAll('.screen-btn').forEach(b => b.innerText = "[ 🖥️ SCREEN ]");
    document.getElementById('host-video-stream-container').innerHTML = '';
    document.getElementById('visitor-video-stream-container').innerHTML = '';
    statusDisplay.innerText = "[ STATUS: OFFLINE ]"; window.history.pushState({}, document.title, window.location.pathname);
}

//---------------------------------------------------------
// 02. MAIN HANDSHAKE & CRASH CATCHERS
//---------------------------------------------------------
async function startHosting() {
    try {
        currentRole = 'HOST'; 
        document.getElementById('btn-go-online').disabled = true; 
        saveLocalData();
        
        const rawPwd = document.getElementById('my-password').value;
        currentHostEncryptedPwd = await hashPassword(rawPwd);

        const customId = document.getElementById('my-custom-id').value.trim().replace(/\s+/g, '-');
        peer = customId ? new Peer(customId, peerConfig) : new Peer(peerConfig); 
        
        if(typeof setupPeerCallListener === "function") setupPeerCallListener(); 
        
        peer.on('open', (id) => {
            statusDisplay.innerText = "[ STATUS: NODE_ACTIVE ]"; globalDisconnectBtn.style.display = 'block';
            document.getElementById('my-id').innerText = id; document.getElementById('my-id-display').style.display = 'block';
            document.getElementById('host-live-wall-panel').style.display = 'block'; 
            document.getElementById('visitor-connect-panel').style.display = 'none';
            renderWall(); renderActivePeers(); renderBannedPeers();
            document.getElementById('magic-link-container').innerHTML = `<div style="margin-top:15px; display:flex; gap:10px;"><input type="text" id="magic-link-input" value="${window.location.href.split('?')[0]}?node=${id}" readonly style="border-color:#0f0; color:#0f0; margin-bottom:0;"><button onclick="copyMagicLink()" style="border-color:#0f0; color:#0f0; margin-bottom:0;">COPY</button></div>`;
        });
        
        peer.on('error', (err) => {
            alert("[ PEER_ERROR ] " + err.type + " - " + err.message);
            document.getElementById('btn-go-online').disabled = false;
        });

        peer.on('connection', (c) => {
            c.on('data', (data) => handleIncomingP2PPacket(data, c));
            c.on('close', () => { renderActivePeers(); broadcastOnlineUsers(); });
        });
        
    } catch (error) {
        alert("[ SYSTEM CRASH ] Initialize failed:\n" + error.message + "\nCheck for syntax errors in your config.js file!");
        document.getElementById('btn-go-online').disabled = false;
    }
}

function visitFriend() {
    try {
        currentRole = 'VISITOR'; 
        const fId = document.getElementById('friend-id').value.trim(); 
        if (!fId) return;
        
        document.getElementById('host-setup-panel').style.display = 'none'; 
        document.getElementById('visitor-connect-panel').style.display = 'none';
        document.getElementById('host-live-wall-panel').style.display = 'none';
        document.getElementById('visitor-view').style.display = 'block'; 
        statusDisplay.innerText = "[ STATUS: WAITING_FOR_DIAL_TONE... ]"; 
        globalDisconnectBtn.style.display = 'block';
        
        if (!peer) { 
            peer = new Peer(peerConfig); 
            if(typeof setupPeerCallListener === "function") setupPeerCallListener(); 
            peer.on('open', () => { executeConnection(fId); }); 
        } else { 
            executeConnection(fId); 
        }
    } catch(err) {
        alert("[ CONNECTION_ERROR ] " + err.message);
    }
}

function executeConnection(fId) {
    activeConn = peer.connect(fId, { reliable: true });
    activeConn.on('data', (data) => handleIncomingP2PPacket(data, activeConn)); 
    activeConn.on('close', () => { disconnectNode(); });
    
    activeConn.on('open', async () => { 
        try {
            statusDisplay.innerText = "[ STATUS: AUTHENTICATING... ]"; 
            
            const rawVisitorPwd = document.getElementById('visitor-password') ? document.getElementById('visitor-password').value : '';
            const hashedVisitorPwd = await hashPassword(rawVisitorPwd);
            const visitorAlias = document.getElementById('visitor-alias-input') ? document.getElementById('visitor-alias-input').value : '';
            
            activeConn.send({ type: 'VISITOR_HANDSHAKE', fingerprint: myFingerprint, alias: visitorAlias || 'Unknown', password: hashedVisitorPwd });
        } catch(err) {
            alert("[ AUTH_CRASH ] " + err.message);
        }
    });
}

//---------------------------------------------------------
// 03. INCOMING PACKET ROUTER
//---------------------------------------------------------
function handleIncomingP2PPacket(p, conn) {
    const senderId = conn.peer;
    switch(p.type) {
        case 'VISITOR_HANDSHAKE':
            if (currentRole === 'HOST') {
                if (currentHostEncryptedPwd && p.password !== currentHostEncryptedPwd) {
                    conn.send({type: 'AUTH_FAILED'}); setTimeout(() => conn.close(), 500); return;
                }
                if (bannedFingerprints.includes(p.fingerprint)) {
                    conn.send({type: 'BANNED'}); setTimeout(() => conn.close(), 500); return;
                }
                
                peerFingerprintMap[senderId] = { fingerprint: p.fingerprint, alias: p.alias };
                systemPing("NEW LINK ESTABLISHED", `Terminal ${p.alias} has connected to your node.`);
                
                renderActivePeers(); broadcastOnlineUsers();
                conn.send({ type: MSG_TYPE_PROFILE, alias: document.getElementById('my-alias').value, bio: document.getElementById('my-bio').value, css: document.getElementById('my-css').value, audio: document.getElementById('my-audio').value, gallery: document.getElementById('my-gallery').value, top8: top8, currentWall: wallData, features: featureToggles, hostFingerprint: myFingerprint, activePoll: activePoll, bgUrl: document.getElementById('my-bg-url').value });
                
                if (localStream) {
                    let call = peer.call(senderId, localStream);
                    activeCalls.push(call);
                    if(typeof handleCallEvent === "function") handleCallEvent(call);
                }
            } break;
        
        case 'AUTH_FAILED':
            alert("ACCESS DENIED: INCORRECT NODE PASSWORD.");
            disconnectNode(); document.getElementById('render-profile-header').innerHTML = "<h2 style='color:var(--alert-red);'>[ 401 // UNAUTHORIZED_ACCESS ]</h2>"; break;
            
        case MSG_TYPE_PROFILE:
            statusDisplay.innerText = "[ STATUS: SECURE LINK ESTABLISHED ]"; 
            document.getElementById('render-alias').innerText = p.alias; document.getElementById('datarender-bio').innerText = p.bio;
            if(p.bgUrl && typeof applyBackground === "function") applyBackground(p.bgUrl);
            if(p.css) document.getElementById('custom-injected-css').innerText = p.css;
            if(p.audio && typeof renderAudioEmbed === "function") document.getElementById('audio-container').innerHTML = renderAudioEmbed(p.audio);
            featureToggles = p.features || featureToggles; activePoll = p.activePoll || null;
            if(typeof applyFeatures === "function") applyFeatures(featureToggles); 
            if(typeof buildVisitorGallery === "function") buildVisitorGallery(p.gallery); 
            if(typeof buildVisitorTop8Grid === "function") buildVisitorTop8Grid(p.top8); 
            wallData = p.currentWall; 
            if(typeof renderWall === "function") renderWall(); 
            break;
        
        case MSG_TYPE_USER_LIST:
            if (currentRole === 'VISITOR') {
                const newPeers = p.users.map(u => u.id).filter(id => id !== peer.id);
                if (localStream) {
                    newPeers.forEach(newPeerId => {
                        if (!currentNetworkPeers.includes(newPeerId)) {
                            let call = peer.call(newPeerId, localStream);
                            activeCalls.push(call);
                            if(typeof handleCallEvent === "function") handleCallEvent(call);
                        }
                    });
                }
                currentNetworkPeers = newPeers; 

                const container = document.getElementById('render-online-users');
                if (container) {
                    container.innerHTML = p.users.map(u => 
                        `<span style="display:inline-block; margin-right:15px; margin-bottom:5px;">
                            <span style="color:${u.isHost ? 'var(--main-cyan)' : '#0f0'}; text-shadow:0 0 5px ${u.isHost ? 'var(--main-cyan)' : '#0f0'};">●</span> 
                            <b style="color:${u.isHost ? 'var(--main-cyan)' : '#fff'};">${u.alias} ${u.isHost ? '[HOST]' : ''}</b>
                        </span>`
                    ).join('');
                }
            } break;

        case 'RELAY_WHISPER':
            if (currentRole === 'HOST') {
                let targetConnId = null;
                for (let id in peerFingerprintMap) {
                    if (peerFingerprintMap[id].alias.toLowerCase() === p.targetAlias.toLowerCase()) { targetConnId = id; break; }
                }
                
                if (targetConnId && peer.connections[targetConnId]) {
                    peer.connections[targetConnId].forEach(c => { if(c.open) c.send({ type: 'INCOMING_WHISPER', senderAlias: p.senderAlias, text: p.text }); });
                    const hostDiv = document.getElementById('host-datastream-output');
                    hostDiv.innerHTML += `<div class="wall-post" style="padding: 2px 5px;"><span style="color:#555; font-size:0.8rem;">[ ROUTER: ${p.senderAlias} whispered ${p.targetAlias} ]</span></div>`;
                    hostDiv.scrollTop = hostDiv.scrollHeight;
                } else {
                    conn.send({ type: 'INCOMING_WHISPER', senderAlias: 'SYSTEM', text: `ERR: User '${p.targetAlias}' not found in node.` });
                }
            } break;

        case 'INCOMING_WHISPER':
            if (currentRole === 'VISITOR') {
                systemPing("SECURE TRANSMISSION", `Incoming Whisper from ${p.senderAlias}`);
                wallData.push({ sender: p.senderAlias, text: p.text, isLocalWhisper: true, timestamp: new Date().toLocaleTimeString() });
                if(typeof renderWall === "function") renderWall();
            } break;
            
        case 'GAME_MOVE':
            if (currentRole === 'HOST') { processGameMove(p); } 
            break;

        case MSG_TYPE_WALL_POST:
            if (currentRole === 'HOST') { 
                if (bannedFingerprints.includes(p.fingerprint)) return;
                peerFingerprintMap[senderId] = { fingerprint: p.fingerprint, alias: p.sender }; 
                
                const packet = { 
                    sender: p.sender, 
                    text: p.text, 
                    isPrivate: p.isPrivate, 
                    timestamp: new Date().toLocaleTimeString(),
                    burnAt: p.burnSec ? Date.now() + (p.burnSec * 1000) : null,
                    isGame: p.isGame,
                    gameId: p.isGame ? Date.now().toString() : null,
                    board: p.isGame ? Array(9).fill(null) : null,
                    turn: p.isGame ? 'X' : null,
                    winner: null,
                    players: p.isGame ? { X: null, O: null } : null
                };

                wallData.push(packet); 
                saveLocalData(); 
                if(typeof renderWall === "function") renderWall(); 
                broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData }); 
            } break;
            
        case MSG_TYPE_WALL_UPDATE:
            if (currentRole === 'VISITOR') { 
                const localWhispers = wallData.filter(m => m.isLocalWhisper);
                wallData = p.updatedWall; 
                if (localWhispers.length > 0) wallData.push(...localWhispers); 
                if(typeof renderWall === "function") renderWall(); 
            } break;
            
        case 'FILE_START':
            incomingFiles[p.id] = { chunks: [], received: 0, total: p.size, name: p.name, type: p.fileType };
            if (currentRole === 'HOST') {
                broadcastToAll(p); 
                wallData.push({ sender: p.senderAlias, text: `<div id="file-${p.id}" style="border: 1px dashed var(--main-cyan); padding: 10px; margin-top: 5px; background: rgba(0,255,255,0.05); display: inline-block;"><span style="color:var(--main-cyan);">[ ⚠️ INCOMING DATA ]</span><br><b style="color:#fff;">${p.name}</b><br><div style="width:150px; height:10px; background:#333; margin-top:5px;"><div id="bar-${p.id}" style="width:0%; height:100%; background:var(--main-cyan);"></div></div><span id="pct-${p.id}" style="font-size:0.8rem; color:#aaa;">0%</span></div>`, isPrivate: false, timestamp: new Date().toLocaleTimeString() });
                if(typeof renderWall === "function") renderWall();
            }
            break;
            
        case 'FILE_CHUNK':
            if (incomingFiles[p.id]) {
                incomingFiles[p.id].chunks.push(p.data);
                incomingFiles[p.id].received += p.data.byteLength;
                let pct = Math.floor((incomingFiles[p.id].received / incomingFiles[p.id].total) * 100);
                
                let bar = document.getElementById(`bar-${p.id}`);
                let txt = document.getElementById(`pct-${p.id}`);
                if(bar) bar.style.width = pct + '%';
                if(txt) txt.innerText = pct + '%';

                if (currentRole === 'HOST') broadcastToAll(p);
            }
            break;
            
        case 'FILE_END':
            if (incomingFiles[p.id]) {
                const blob = new Blob(incomingFiles[p.id].chunks, { type: incomingFiles[p.id].type });
                const url = URL.createObjectURL(blob);
                
                let fileUI = document.getElementById(`file-${p.id}`);
                if (fileUI) {
                    fileUI.innerHTML = `<span style="color:var(--main-cyan);">[ 💾 P2P_TRANSFER ]</span><br>
                    <b style="color:#fff;">${incomingFiles[p.id].name}</b><br>
                    <a href="${url}" download="${incomingFiles[p.id].name}" class="btn-small" style="display:inline-block; margin-top:8px; text-decoration:none; color:#000; background:var(--main-cyan);">[ DOWNLOAD DATA ]</a>`;
                }

                if (currentRole === 'HOST') {
                    let entry = wallData.find(w => w.text.includes(`id="file-${p.id}"`));
                    if (entry) entry.text = fileUI.outerHTML;
                    saveLocalData();
                    broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
                    broadcastToAll(p); 
                }
                
                delete incomingFiles[p.id]; 
            }
            break;

        case MSG_TYPE_SOUNDBOARD: if(typeof triggerSound === "function") triggerSound(p.soundId, false, p.sender, p.customUrl); break;
        case MSG_TYPE_FEATURE_UPDATE: if (currentRole === 'VISITOR') { featureToggles = p.features; if(typeof applyFeatures === "function") applyFeatures(featureToggles); } break;
        case MSG_TYPE_POLL_NEW:
        case MSG_TYPE_POLL_UPDATE: if (currentRole === 'VISITOR') { activePoll = p.poll; if(typeof renderVisitorPoll === "function") renderVisitorPoll(); } break;
        case MSG_TYPE_POLL_VOTE:
            if (currentRole === 'HOST' && activePoll && !activePoll.voters.includes(p.voterId)) { 
                activePoll.voters.push(p.voterId); 
                activePoll.options[p.optionIndex].votes++; 
                if(typeof renderHostPoll === "function") renderHostPoll(); 
                broadcastToAll({ type: MSG_TYPE_POLL_UPDATE, poll: activePoll }); 
            } break;
        case 'BANNED':
            alert("ACCESS DENIED: THE HOST HAS PERMANENTLY BANISHED YOU FROM THIS NODE.");
            disconnectNode(); document.getElementById('render-profile-header').innerHTML = "<h2 style='color:var(--alert-red);'>[ 403 // BANNED_FROM_NODE ]</h2>"; break;
    }
}

//---------------------------------------------------------
// 04. FILE TRANSFER ENGINE
//---------------------------------------------------------
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert("[ SYSTEM_ERROR ] Only image matrices are supported via direct upload."); event.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const MAX_WIDTH = 800; let newWidth = img.width; let newHeight = img.height;
            if (img.width > MAX_WIDTH) { const scaleSize = MAX_WIDTH / img.width; newWidth = MAX_WIDTH; newHeight = img.height * scaleSize; }
            const canvas = document.createElement('canvas'); canvas.width = newWidth; canvas.height = newHeight;
            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, newWidth, newHeight);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
            transmitCompressedImage(compressedBase64);
        }
        img.src = e.target.result;
    }
    reader.readAsDataURL(file);
}

function transmitCompressedImage(base64Str) {
    const imgTag = `<br><img src="${base64Str}" style="max-width:100%; border: 1px solid var(--main-cyan); border-radius: 4px; margin-top: 5px; box-shadow: var(--text-glow);" />`;
    if (currentRole === 'HOST') {
        wallData.push({ sender: "[HOST]", text: imgTag, isPrivate: false, timestamp: new Date().toLocaleTimeString() });
        saveLocalData(); 
        if(typeof renderWall === "function") renderWall(); 
        broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
    } else if (currentRole === 'VISITOR' && activeConn) {
        const priv = document.getElementById('private-packet-toggle');
        const alias = document.getElementById('visitor-alias-input').value.trim();
        let name = alias ? alias : peer.id.substring(0,6);
        activeConn.send({ type: MSG_TYPE_WALL_POST, text: imgTag, isPrivate: priv?.checked || false, sender: name, fingerprint: myFingerprint });
    }
    document.getElementById('hidden-file-input').value = '';
}

function handleRawFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    document.getElementById('hidden-raw-file-input').value = '';
    
    const transferId = Date.now().toString();
    let alias = '';
    if (currentRole === 'HOST') alias = document.getElementById('my-alias').value.trim() || '[HOST]';
    if (currentRole === 'VISITOR') alias = document.getElementById('visitor-alias-input').value.trim() || peer.id.substring(0,6);

    const startPacket = { 
        type: 'FILE_START', 
        id: transferId, 
        name: file.name, 
        size: file.size, 
        fileType: file.type,
        senderAlias: alias
    };

    incomingFiles[transferId] = { chunks: [], received: 0, total: file.size, name: file.name, type: file.type };
    
    let uiHTML = `<div id="file-${transferId}" style="border: 1px dashed var(--main-cyan); padding: 10px; margin-top: 5px; background: rgba(0,255,255,0.05); display: inline-block;">
        <span style="color:var(--main-cyan);">[ ⚠️ TRANSMITTING DATA ]</span><br>
        <b style="color:#fff;">${file.name}</b><br>
        <div style="width:150px; height:10px; background:#333; margin-top:5px;"><div id="bar-${transferId}" style="width:0%; height:100%; background:var(--main-cyan);"></div></div>
        <span id="pct-${transferId}" style="font-size:0.8rem; color:#aaa;">0%</span>
    </div>`;

    if (currentRole === 'HOST') {
        wallData.push({ sender: alias, text: uiHTML, isPrivate: false, timestamp: new Date().toLocaleTimeString() });
        if(typeof renderWall === "function") renderWall();
        broadcastToAll(startPacket);
    } else if (currentRole === 'VISITOR' && activeConn) {
        activeConn.send(startPacket);
    }

    const chunkSize = 16 * 1024; 
    let offset = 0;

    function readNextChunk() {
        const slice = file.slice(offset, offset + chunkSize);
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const arrayBuffer = e.target.result;
            const chunkPacket = { type: 'FILE_CHUNK', id: transferId, data: arrayBuffer };
            
            if (currentRole === 'HOST') broadcastToAll(chunkPacket);
            else if (currentRole === 'VISITOR' && activeConn) activeConn.send(chunkPacket);

            incomingFiles[transferId].chunks.push(arrayBuffer);
            incomingFiles[transferId].received += arrayBuffer.byteLength;
            let pct = Math.floor((incomingFiles[transferId].received / file.size) * 100);
            
            let bar = document.getElementById(`bar-${transferId}`);
            let txt = document.getElementById(`pct-${transferId}`);
            if(bar) bar.style.width = pct + '%';
            if(txt) txt.innerText = pct + '%';

            offset += chunkSize;
            if (offset < file.size) {
                setTimeout(readNextChunk, 1); 
            } else {
                const endPacket = { type: 'FILE_END', id: transferId };
                if (currentRole === 'HOST') broadcastToAll(endPacket);
                else if (currentRole === 'VISITOR' && activeConn) activeConn.send(endPacket);
                
                const blob = new Blob(incomingFiles[transferId].chunks, { type: file.type });
                const url = URL.createObjectURL(blob);
                let finalUI = `<span style="color:var(--main-cyan);">[ 💾 P2P_TRANSFER ]</span><br><b style="color:#fff;">${file.name}</b><br><a href="${url}" download="${file.name}" class="btn-small" style="display:inline-block; margin-top:8px; text-decoration:none; color:#000; background:var(--main-cyan);">[ DOWNLOAD DATA ]</a>`;
                
                let fileUI = document.getElementById(`file-${transferId}`);
                if (fileUI) fileUI.innerHTML = finalUI;
                
                if (currentRole === 'HOST') {
                    let entry = wallData.find(w => w.text.includes(`id="file-${transferId}"`));
                    if (entry) entry.text = fileUI.outerHTML;
                    saveLocalData();
                    broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
                }
                delete incomingFiles[transferId];
            }
        };
        reader.readAsArrayBuffer(slice);
    }
    
    readNextChunk();
}

setInterval(() => {
    if (wallData.length === 0) return;
    let changed = false; const now = Date.now();
    wallData = wallData.filter(p => {
        if (p.burnAt && now >= p.burnAt) { changed = true; return false; }
        return true;
    });
    if (changed) {
        if(typeof renderWall === "function") renderWall();
        if (currentRole === 'HOST' && peer) { saveLocalData(); broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData }); }
    }
}, 1000);
// END
