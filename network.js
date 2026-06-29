//---------------------------------------------------------
// 01. NODE ROUTING & CONNECTION MANAGEMENT
//---------------------------------------------------------
function broadcastToAll(packet) {
    if (currentRole !== 'HOST' || !peer) return;
    for (let id in peer.connections) {
        peer.connections[id].forEach(c => {
            if (c.open && typeof c.send === 'function') c.send(packet);
        });
    }
}

function broadcastOnlineUsers() {
    if (currentRole !== 'HOST') return;
    const hostAlias = document.getElementById('my-alias').value.trim() || 'NODE-ALPHA';
    const onlineUsers = [{ id: peer.id, alias: hostAlias, isHost: true }];
    const activePeers = Object.keys(peer.connections).filter(id => peer.connections[id][0] && peer.connections[id][0].open);
    activePeers.forEach(id => {
        if (peerFingerprintMap[id]) onlineUsers.push({ id: id, alias: peerFingerprintMap[id].alias, isHost: false });
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
                if (typeof c.send === 'function') c.send({type: 'BANNED'}); 
                setTimeout(() => { c.close(); }, 500); 
            });
        }
        renderActivePeers(); renderBannedPeers(); broadcastOnlineUsers();
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
clearTimeout(window.dialTimer);
    if (activeCalls.length > 0) { activeCalls.forEach(c => c.close()); activeCalls = []; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (peer) { peer.destroy(); peer = null; }

    if (currentRole === 'VISITOR') {
        wallData = [];
        const vWall = document.getElementById('datastream-output');
        if (vWall) vWall.innerHTML = '';
        const vOnline = document.getElementById('render-online-users');
        if (vOnline) vOnline.innerHTML = 'Scanning for active signals...';
        if (typeof wipeCanvas === "function") wipeCanvas(false);
        if (typeof clearTacticalMap === "function") clearTacticalMap(false);
    }
    
    activeConn = null; currentRole = null; activePoll = null;
    peerFingerprintMap = {};
    incomingFiles = {};
    
    document.getElementById('visitor-view').style.display = 'none'; 
    document.getElementById('host-live-wall-panel').style.display = 'none';
    document.getElementById('host-setup-panel').style.display = 'block'; 
    document.getElementById('visitor-connect-panel').style.display = 'block';
    document.getElementById('btn-go-online').disabled = false;
    document.getElementById('my-id-display').style.display = 'none';
    globalDisconnectBtn.style.display = 'none'; 
    isScreenSharing = false;
    
    if(typeof updateVoiceTogglesVisuals === "function") updateVoiceTogglesVisuals(false);
    document.querySelectorAll('.mute-btn, .cam-btn, .screen-btn').forEach(b => { b.style.display = 'none'; b.classList.remove('btn-alert'); });
    document.querySelectorAll('.screen-btn').forEach(b => { b.innerText = "[ 🖥️ SCREEN ]"; });
    document.getElementById('host-video-stream-container').innerHTML = '';
    document.getElementById('visitor-video-stream-container').innerHTML = '';
    statusDisplay.innerText = "[ STATUS: OFFLINE ]"; 
    window.history.pushState({}, document.title, window.location.pathname);
}

//---------------------------------------------------------
// 02. MAIN HANDSHAKE & CRASH CATCHERS
//---------------------------------------------------------
async function startHosting() {
    try {
        currentRole = 'HOST'; 
        document.getElementById('btn-go-online').disabled = true; 
        if(typeof saveLocalData === "function") saveLocalData();
        
        const rawPwd = document.getElementById('my-password').value;
        currentHostEncryptedPwd = await hashPassword(rawPwd);

        const customId = document.getElementById('my-custom-id').value.trim().replace(/\s+/g, '-');
        peer = customId ? new Peer(customId, peerConfig) : new Peer(peerConfig); 
        
        if(typeof setupPeerCallListener === "function") setupPeerCallListener(); 
        
        peer.on('open', (id) => {
            statusDisplay.innerText = "[ STATUS: NODE_ACTIVE ]"; 
            globalDisconnectBtn.style.display = 'block';
            document.getElementById('my-id').innerText = id; 
            document.getElementById('my-id-display').style.display = 'block';
            document.getElementById('host-live-wall-panel').style.display = 'block'; 
            document.getElementById('visitor-connect-panel').style.display = 'none';
            
            if(typeof renderWall === "function") renderWall(); 
            renderActivePeers(); renderBannedPeers();
            if(typeof renderHostAudio === "function") renderHostAudio();
            
            const magicLinkStr = window.location.href.split('?')[0] + "?node=" + id;
            document.getElementById('magic-link-container').innerHTML = `
                <div style="margin-top:15px; display:flex; gap:10px;">
                    <input type="text" id="magic-link-input" value="${magicLinkStr}" readonly style="border-color:#0f0; color:#0f0; margin-bottom:0;">
                    <button onclick="copyMagicLink()" style="border-color:#0f0; color:#0f0; margin-bottom:0;">COPY</button>
                </div>`;
        });
        
        peer.on('error', (err) => {
            console.warn("[ PEER_ERROR ]", err.type, err);

            // AUTO-DIALER: If the Host is offline or hasn't booted up yet
            if (err.type === 'peer-unavailable') {
                if (currentRole === 'VISITOR') {
                    const statusDisplay = document.getElementById('connection-status');
                    if (statusDisplay) {
                        statusDisplay.innerText = "[ HOST OFFLINE // REDIALING IN 3 SECONDS... ]";
                        statusDisplay.style.color = "var(--alert-red)";
                    }
                    
                    // Wait 3 seconds and try the connection again
                   window.dialTimer = setTimeout(() => {
                        if (statusDisplay) {
                            statusDisplay.innerText = "[ DIALING HOST... ]";
                            statusDisplay.style.color = "var(--main-cyan)";
                        }
                        if (typeof visitFriend === "function") visitFriend();
                    }, 3000);
                }
            } 
            // Handle disconnected network state
            else if (err.type === 'network' || err.type === 'disconnected') {
                const statusDisplay = document.getElementById('connection-status');
                if (statusDisplay) {
                    statusDisplay.innerText = "[ NETWORK DISCONNECT // CHECK CONNECTION ]";
                    statusDisplay.style.color = "var(--alert-red)";
                }
            }
            // Catch-all for Browser Shields (Opera GX, Brave, Safari Strict)
            else {
                alert(`[ FATAL_NODE_ERROR ] ${err.type}\nIf you are using Opera GX, Brave, or strict privacy settings, please disable your Shields/Tracker Blockers for this domain so WebRTC can connect.`);
                document.getElementById('btn-go-online').disabled = false;
                if (statusDisplay) {
                    statusDisplay.innerText = "[ STATUS: OFFLINE ]";
                    statusDisplay.style.color = "var(--alert-red)";
                }
            }
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
            
            // Apply identical shield protection to the visitor's Peer instance
            peer.on('error', (err) => {
                console.warn("[ PEER_ERROR ]", err.type, err);
                if (err.type === 'peer-unavailable') {
                    const statusDisplay = document.getElementById('connection-status');
                    if (statusDisplay) {
                        statusDisplay.innerText = "[ HOST OFFLINE // REDIALING IN 3 SECONDS... ]";
                        statusDisplay.style.color = "var(--alert-red)";
                    }
                    window.dialTimer = setTimeout(() => {
                        if (statusDisplay) {
                            statusDisplay.innerText = "[ DIALING HOST... ]";
                            statusDisplay.style.color = "var(--main-cyan)";
                        }
                        if (typeof visitFriend === "function") visitFriend();
                    }, 3000);
                } else if (err.type === 'network' || err.type === 'disconnected') {
                    const statusDisplay = document.getElementById('connection-status');
                    if (statusDisplay) {
                        statusDisplay.innerText = "[ NETWORK DISCONNECT // CHECK CONNECTION ]";
                        statusDisplay.style.color = "var(--alert-red)";
                    }
                } else {
                    alert(`[ FATAL_NODE_ERROR ] ${err.type}\nIf you are using Opera GX, Brave, or strict privacy settings, please disable your Shields/Tracker Blockers for this domain so WebRTC can connect.`);
                    globalDisconnectBtn.style.display = 'none';
                }
            });
            
        } else { executeConnection(fId); }
    } catch(err) { alert("[ CONNECTION_ERROR ] " + err.message); }
}

function executeConnection(fId) {
    activeConn = peer.connect(fId, { reliable: true });
    activeConn.on('data', (data) => handleIncomingP2PPacket(data, activeConn)); 
    activeConn.on('close', () => { disconnectNode(); });
    
    activeConn.on('open', async () => { 
        try {
            statusDisplay.innerText = "[ STATUS: AUTHENTICATING... ]"; 
            const pwdInput = document.getElementById('visitor-password');
            const hashedVisitorPwd = await hashPassword(pwdInput ? pwdInput.value : '');
            const aliasInput = document.getElementById('visitor-alias-input');
            
            activeConn.send({ 
                type: 'VISITOR_HANDSHAKE', fingerprint: myFingerprint, 
                alias: aliasInput ? aliasInput.value : 'Unknown', password: hashedVisitorPwd 
            });
        } catch(err) { alert("[ AUTH_CRASH ] " + err.message); }
    });
    
    activeConn.on('error', (err) => { alert("[ CONNECTION_ERROR ] " + err.message); });
}

//---------------------------------------------------------
// 03. INCOMING PACKET ROUTER
//---------------------------------------------------------
function handleIncomingP2PPacket(p, conn) {
    try {
        const senderId = conn.peer;
        switch(p.type) {
            case 'VISITOR_HANDSHAKE':
                if (currentRole === 'HOST') {
                    if (currentHostEncryptedPwd && p.password !== currentHostEncryptedPwd) {
                        conn.send({type: 'AUTH_FAILED'});
                        setTimeout(() => { conn.close(); }, 500); return;
                    }
                    if (bannedFingerprints.includes(p.fingerprint)) {
                        conn.send({type: 'BANNED'});
                        setTimeout(() => { conn.close(); }, 500); return;
                    }
                    
                    peerFingerprintMap[senderId] = { fingerprint: p.fingerprint, alias: p.alias };
                    if(typeof triggerBackgroundAlert === "function") triggerBackgroundAlert("NOWSPACE Link Established", `Terminal ${p.alias} has connected to your node.`);
                    
                    renderActivePeers(); broadcastOnlineUsers();
                    setTimeout(() => {
                        conn.send({ 
                            type: MSG_TYPE_PROFILE, 
                            alias: document.getElementById('my-alias') ? document.getElementById('my-alias').value : 'Unknown', 
                            bio: document.getElementById('my-bio') ? document.getElementById('my-bio').value : '', 
                            css: document.getElementById('my-css') ? document.getElementById('my-css').value : '', 
                            audio: document.getElementById('my-audio') ? document.getElementById('my-audio').value : '', 
                            gallery: document.getElementById('my-gallery') ? document.getElementById('my-gallery').value : '', 
                            top8: top8, currentWall: wallData, features: featureToggles, hostFingerprint: myFingerprint, activePoll: activePoll, 
                            bgUrl: document.getElementById('my-bg-url') ? document.getElementById('my-bg-url').value : '' 
                        });
                    }, 600);
                    
                    if (localStream) {
                        let call = peer.call(senderId, localStream);
                        activeCalls.push(call);
                        if(typeof handleCallEvent === "function") handleCallEvent(call);
                    }
                } break;
            case 'AUTH_FAILED':
                alert("ACCESS DENIED: INCORRECT NODE PASSWORD.");
                disconnectNode(); 
                document.getElementById('render-profile-header').innerHTML = "<h2 style='color:var(--alert-red);'>[ 401 // UNAUTHORIZED_ACCESS ]</h2>"; 
                break;
            case MSG_TYPE_PROFILE:
                if (statusDisplay) statusDisplay.innerText = "[ STATUS: SECURE LINK ESTABLISHED ]";
                const rAlias = document.getElementById('render-alias');
                if (rAlias) rAlias.innerText = p.alias; 
                
                const rBio = document.getElementById('datarender-bio');
                if (rBio) rBio.innerText = p.bio;
                if (p.bgUrl && typeof applyBackground === "function") applyBackground(p.bgUrl);
                
                const rCss = document.getElementById('custom-injected-css');
                if (p.css && rCss) rCss.innerText = p.css;
                const rAudio = document.getElementById('audio-container');
                if (p.audio && rAudio && typeof renderAudioEmbed === "function") {
                    rAudio.innerHTML = renderAudioEmbed(p.audio);
                }
                
                featureToggles = p.features || featureToggles; 
                activePoll = p.activePoll || null;
                
                if (typeof applyFeatures === "function") applyFeatures(featureToggles); 
                if (typeof buildVisitorGallery === "function") buildVisitorGallery(p.gallery);
                if (typeof buildVisitorTop8Grid === "function") buildVisitorTop8Grid(p.top8); 
                
                wallData = p.currentWall; 
                if (typeof renderWall === "function") renderWall(); 
                break;
            case MSG_TYPE_USER_LIST:
                if (currentRole === 'VISITOR') {
                    const newPeers = p.users.map(u => u.id).filter(id => id !== peer.id);
                    if (localStream) {
                        newPeers.forEach(newPeerId => {
                            if (!currentNetworkPeers.includes(newPeerId)) {
                                let call = peer.call(newPeerId, localStream); activeCalls.push(call);
                                if(typeof handleCallEvent === "function") handleCallEvent(call);
                            }
                        });
                    }
                    currentNetworkPeers = newPeers;
                    const container = document.getElementById('render-online-users');
                    if (container) {
                        container.innerHTML = p.users.map(u => `<span style="display:inline-block; margin-right:15px; margin-bottom:5px;"><span style="color:${u.isHost ? 'var(--main-cyan)' : '#0f0'}; text-shadow:0 0 5px ${u.isHost ? 'var(--main-cyan)' : '#0f0'};">●</span> <b style="color:${u.isHost ? 'var(--main-cyan)' : '#fff'};">${u.alias} ${u.isHost ? '[HOST]' : ''}</b></span>`).join('');
                    }
                } break;
            case 'RELAY_WHISPER':
                if (currentRole === 'HOST') {
                    let targetConnId = null;
                    for (let id in peerFingerprintMap) { if (peerFingerprintMap[id].alias.toLowerCase() === p.targetAlias.toLowerCase()) { targetConnId = id; break; } }
                    if (targetConnId && peer.connections[targetConnId]) {
                        peer.connections[targetConnId].forEach(c => { if(c.open && typeof c.send === 'function') c.send({ type: 'INCOMING_WHISPER', senderAlias: p.senderAlias, text: p.text }); });
                        const hostDiv = document.getElementById('host-datastream-output');
                        hostDiv.innerHTML += `<div class="wall-post" style="padding: 2px 5px;"><span style="color:#555; font-size:0.8rem;">[ ROUTER: ${p.senderAlias} whispered ${p.targetAlias} ]</span></div>`;
                        hostDiv.scrollTop = hostDiv.scrollHeight;
                    } else { conn.send({ type: 'INCOMING_WHISPER', senderAlias: 'SYSTEM', text: `ERR: User '${p.targetAlias}' not found in node.` }); }
                } break;
            case 'INCOMING_WHISPER':
                if (currentRole === 'VISITOR') {
                    if(typeof triggerBackgroundAlert === "function") triggerBackgroundAlert("SECURE TRANSMISSION", `Incoming Whisper from ${p.senderAlias}`);
                    wallData.push({ sender: p.senderAlias, text: p.text, isLocalWhisper: true, timestamp: new Date().toLocaleTimeString() });
                    if(typeof renderWall === "function") renderWall();
                } break;
            case 'GAME_MOVE':
                if (currentRole === 'HOST') { if(typeof processGameMove === "function") processGameMove(p); } break;
                
            case MSG_TYPE_DRAWING:
                if (typeof executeDraw === "function") executeDraw(p.x0, p.y0, p.x1, p.y1, p.color, p.size);
                if (currentRole === 'HOST') broadcastToAll(p); break;
                
            case MSG_TYPE_CANVAS_WIPE:
                if (typeof wipeCanvas === "function") wipeCanvas(false);
                if (currentRole === 'HOST') broadcastToAll(p); break;

            case MSG_TYPE_TYPING:
                if (typeof showTypingIndicator === "function") showTypingIndicator(p.sender, p.isTyping);
                if (currentRole === 'HOST') broadcastToAll(p); break;
                
            case MSG_TYPE_CANVAS_BG:
                if (typeof applyTacticalMap === "function") applyTacticalMap(p.bgData);
                if (currentRole === 'HOST') broadcastToAll(p); break;

            case MSG_TYPE_WALL_POST:
                if (currentRole === 'HOST') {
                    if (bannedFingerprints.includes(p.fingerprint)) return;
                    
                    // Track the sender for potential banning
                    const senderId = conn ? conn.peer : p.fingerprint;
                    if (senderId) peerFingerprintMap[senderId] = { fingerprint: p.fingerprint, alias: p.sender };
                    
                    // --- ARCADE: RPS MATCHMAKING ROUTER ---
                    if (p.isGame === 'rps') {
                        let openDuel = wallData.find(w => w.isGame === 'rps' && !w.winner && w.players.p1.fp !== p.fingerprint);
                        if (openDuel) {
                            openDuel.players.p2 = { alias: p.sender, fp: p.fingerprint, move: p.gamePayload };
                            let m1 = openDuel.players.p1.move, m2 = openDuel.players.p2.move;
                            if (m1 === m2) openDuel.winner = 'DRAW // STALEMATE';
                            else if ((m1==='rock'&&m2==='scissors')||(m1==='paper'&&m2==='rock')||(m1==='scissors'&&m2==='paper')) openDuel.winner = openDuel.players.p1.alias.toUpperCase() + ' WINS';
                            else openDuel.winner = openDuel.players.p2.alias.toUpperCase() + ' WINS';

                            openDuel.text = `<span style="color:var(--bright-magenta);"><b style="color:var(--main-cyan);">${openDuel.players.p1.alias}</b> (${m1.toUpperCase()}) vs <b style="color:var(--main-cyan);">${openDuel.players.p2.alias}</b> (${m2.toUpperCase()})<br>> ${openDuel.winner}</span>`;
                            if(typeof saveLocalData === "function") saveLocalData();
                            if(typeof renderWall === "function") renderWall();
                            broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
                            
                            // NOTIFICATION HOOK: Someone joined a duel!
                            if (typeof triggerBackgroundAlert === 'function') {
                                triggerBackgroundAlert("Arcade Alert", `${p.sender} answered a duel request!`); 
                            }
                            return; 
                        }
                    }

                    // Standard message / New Game creation
                    const packet = { 
                        sender: p.sender, 
                        text: p.text, 
                        isPrivate: p.isPrivate, 
                        timestamp: new Date().toLocaleTimeString(), 
                        burnAt: p.burnSec ? Date.now() + (p.burnSec * 1000) : null, 
                        isGame: p.isGame, 
                        gameId: p.isGame ? Date.now().toString() : null, 
                        board: p.isGame === 'tictactoe' ? Array(9).fill(null) : (p.isGame === 'connect4' ? Array(42).fill(null) : null), 
                        turn: p.isGame === 'tictactoe' ? 'X' : (p.isGame === 'connect4' ? 'R' : null), 
                        winner: null,
                        players: p.isGame === 'tictactoe' ? { X: null, O: null } : (p.isGame === 'connect4' ? { R: null, Y: null } : (p.isGame === 'rps' ? { p1: { alias: p.sender, fp: p.fingerprint, move: p.gamePayload }, p2: null } : null))
                    };

                    wallData.push(packet); 
                    
                    if(typeof saveLocalData === "function") saveLocalData(); 
                    if(typeof renderWall === "function") renderWall(); 
                    broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData }); 
                    
                    // NOTIFICATION HOOK: Standard Message or New Game!
                    if (typeof triggerBackgroundAlert === 'function' && !packet.isLocalWhisper) {
                        let alertText = packet.isGame ? `[ NEW ${packet.isGame.toUpperCase()} MODULE DEPLOYED ]` : packet.text.replace(/<[^>]*>?/gm, '');
                        triggerBackgroundAlert("Incoming Transmission", `${packet.sender}: ${alertText}`); 
                    }
                } 
                break;

            case MSG_TYPE_WALL_UPDATE:
                if (currentRole === 'VISITOR') { 
                    // NOTIFICATION HOOK: Check if the newest post was from someone else
                    if (p.updatedWall && p.updatedWall.length > wallData.length) {
                        const newPost = p.updatedWall[p.updatedWall.length - 1];
                        const myAlias = document.getElementById('visitor-alias-input') ? document.getElementById('visitor-alias-input').value.trim() : 'GUEST_NODE';
                        
                        if (newPost.sender !== myAlias && typeof triggerBackgroundAlert === 'function') {
                            let alertText = newPost.isGame ? `[ NEW ${newPost.isGame.toUpperCase()} MODULE DEPLOYED ]` : newPost.text.replace(/<[^>]*>?/gm, '');
                            triggerBackgroundAlert("Incoming Transmission", `${newPost.sender}: ${alertText}`);
                        }
                    }
                    
                    const localWhispers = wallData.filter(m => m.isLocalWhisper);
                    wallData = p.updatedWall; 
                    if (localWhispers.length > 0) wallData.push(...localWhispers); 
                    if(typeof renderWall === "function") renderWall(); 
                } 
                break;

            case 'FILE_START':
                incomingFiles[p.id] = { chunks: [], received: 0, total: p.size, name: p.name, type: p.fileType };
                if (currentRole === 'HOST') {
                    broadcastToAll(p);
                    const uiHTML = `<div id="file-${p.id}" style="border: 1px dashed var(--main-cyan); padding: 10px; margin-top: 5px; background: rgba(0,255,255,0.05); display: inline-block;"><span style="color:var(--main-cyan);">[ ⚠️ INCOMING DATA ]</span><br><b style="color:#fff;">${p.name}</b><br><div style="width:150px; height:10px; background:#333; margin-top:5px;"><div id="bar-${p.id}" style="width:0%; height:100%; background:var(--main-cyan);"></div></div><span id="pct-${p.id}" style="font-size:0.8rem; color:#aaa;">0%</span></div>`;
                    wallData.push({ sender: p.senderAlias, text: uiHTML, isPrivate: false, timestamp: new Date().toLocaleTimeString() });
                    if(typeof renderWall === "function") renderWall();
                } break;
            case 'FILE_CHUNK':
                if (incomingFiles[p.id]) {
                    incomingFiles[p.id].chunks.push(p.data);
                    incomingFiles[p.id].received += p.data.byteLength;
                    let pct = Math.floor((incomingFiles[p.id].received / incomingFiles[p.id].total) * 100);
                    let bar = document.getElementById(`bar-${p.id}`); let txt = document.getElementById(`pct-${p.id}`);
                    if(bar) bar.style.width = pct + '%'; if(txt) txt.innerText = pct + '%';
                    if (currentRole === 'HOST') broadcastToAll(p);
                } break;
            case 'FILE_END':
                if (incomingFiles[p.id]) {
                    const blob = new Blob(incomingFiles[p.id].chunks, { type: incomingFiles[p.id].type });
                    const url = URL.createObjectURL(blob);
                    let fileUI = document.getElementById(`file-${p.id}`);
                    if (fileUI) fileUI.innerHTML = `<span style="color:var(--main-cyan);">[ 💾 P2P_TRANSFER ]</span><br><b style="color:#fff;">${incomingFiles[p.id].name}</b><br><a href="${url}" download="${incomingFiles[p.id].name}" class="btn-small" style="display:inline-block; margin-top:8px; text-decoration:none; color:#000; background:var(--main-cyan);">[ DOWNLOAD DATA ]</a>`;
                    if (currentRole === 'HOST') {
                        let entry = wallData.find(w => w.text.includes(`id="file-${p.id}"`));
                        if (entry) entry.text = fileUI.outerHTML;
                        if(typeof saveLocalData === "function") saveLocalData();
                        broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
                        broadcastToAll(p);
                    }
                    delete incomingFiles[p.id];
                } break;

            case MSG_TYPE_SOUNDBOARD: 
                if(typeof triggerSound === "function") triggerSound(p.soundId, false, p.sender, p.customUrl);
                break;
            case MSG_TYPE_FEATURE_UPDATE: 
                if (currentRole === 'VISITOR') { featureToggles = p.features;
                if(typeof applyFeatures === "function") applyFeatures(featureToggles); } break;
            case MSG_TYPE_POLL_NEW:
            case MSG_TYPE_POLL_UPDATE: 
                if (currentRole === 'VISITOR') { activePoll = p.poll;
                if(typeof renderVisitorPoll === "function") renderVisitorPoll(); } break;
            case MSG_TYPE_POLL_VOTE:
                if (currentRole === 'HOST' && activePoll && !activePoll.voters.includes(p.voterId)) { 
                    activePoll.voters.push(p.voterId);
                    activePoll.options[p.optionIndex].votes++; 
                    if(typeof renderHostPoll === "function") renderHostPoll(); broadcastToAll({ type: MSG_TYPE_POLL_UPDATE, poll: activePoll }); 
                } break;
            case 'BANNED':
                alert("ACCESS DENIED: THE HOST HAS PERMANENTLY BANISHED YOU FROM THIS NODE.");
                disconnectNode(); 
                document.getElementById('render-profile-header').innerHTML = "<h2 style='color:var(--alert-red);'>[ 403 // BANNED_FROM_NODE ]</h2>"; break;
        }
    } catch(err) { alert("[ DATASTREAM ERROR ] Packet router crashed!\n" + err.message); }
}

//---------------------------------------------------------
// 04. NETWORK TRANSMITTERS
//---------------------------------------------------------
function visitorSendWallPacket() {
    const input = document.getElementById('wall-input-buffer');
    const priv = document.getElementById('private-packet-toggle');
    const aliasInput = document.getElementById('visitor-alias-input');
    const alias = aliasInput ? aliasInput.value.trim() : '';
    
    if (!input || !input.value || !activeConn) return;
    let name = alias ? alias : peer.id.substring(0,6); 
    if(alias) localStorage.setItem('nowspace_visitor_alias', alias);
    
    const rawText = input.value.trim();
    if (rawText.toLowerCase().startsWith('/w ')) {
        const parts = rawText.split(' ');
        if (parts.length >= 3) {
            const targetUser = parts[1];
            const whisperText = parts.slice(2).join(' ');
            activeConn.send({ type: 'RELAY_WHISPER', targetAlias: targetUser, text: whisperText, senderAlias: name });
            wallData.push({ sender: name, text: `TO ${targetUser.toUpperCase()}: ${whisperText}`, isLocalWhisper: true, timestamp: new Date().toLocaleTimeString() });
            if(typeof renderWall === "function") renderWall();
            input.value = ''; return;
        }
    }

    const parsed = parseSlashCommand(rawText, name);
    if (parsed.text === null) { input.value = ''; if(priv) priv.checked = false; return; }

    activeConn.send({ 
        type: typeof MSG_TYPE_WALL_POST !== 'undefined' ? MSG_TYPE_WALL_POST : 'NEW_WALL_PACKET', 
        text: parsed.text, isPrivate: priv ? priv.checked : false, sender: name, fingerprint: myFingerprint, burnSec: parsed.burnSec, isGame: parsed.isGame, gamePayload: parsed.payload
    });
    input.value = ''; if(priv) priv.checked = false;
}

function hostSendWallPacket() {
    const input = document.getElementById('host-wall-input');
    if (!input || !input.value) return;
    
    const rawText = input.value.trim();
    const aliasInput = document.getElementById('my-alias');
    const alias = aliasInput ? aliasInput.value.trim() || "[HOST]" : "[HOST]";
    
    const parsed = parseSlashCommand(rawText, alias);
    if (parsed.text === null) { input.value = ''; return; }

    // --- ARCADE: HOST RPS LOCAL MATCHMAKING ---
    if (parsed.isGame === 'rps') {
        let openDuel = wallData.find(w => w.isGame === 'rps' && !w.winner && w.players.p1.fp !== myFingerprint);
        if (openDuel) {
            openDuel.players.p2 = { alias: alias, fp: myFingerprint, move: parsed.payload };
            let m1 = openDuel.players.p1.move, m2 = openDuel.players.p2.move;
            if (m1 === m2) openDuel.winner = 'DRAW // STALEMATE';
            else if ((m1==='rock'&&m2==='scissors')||(m1==='paper'&&m2==='rock')||(m1==='scissors'&&m2==='paper')) openDuel.winner = openDuel.players.p1.alias.toUpperCase() + ' WINS';
            else openDuel.winner = openDuel.players.p2.alias.toUpperCase() + ' WINS';
            openDuel.text = `<span style="color:var(--bright-magenta);"><b style="color:var(--main-cyan);">${openDuel.players.p1.alias}</b> (${m1.toUpperCase()}) vs <b style="color:var(--main-cyan);">${openDuel.players.p2.alias}</b> (${m2.toUpperCase()})<br>> ${openDuel.winner}</span>`;
            if(typeof saveLocalData === "function") saveLocalData();
            if(typeof renderWall === "function") renderWall();
            broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
            input.value = '';
            return;
        }
    }

    const packet = { 
        sender: alias, text: parsed.text, isPrivate: false, timestamp: new Date().toLocaleTimeString(), burnAt: parsed.burnSec ?
        Date.now() + (parsed.burnSec * 1000) : null, isGame: parsed.isGame, gameId: parsed.isGame ?
        Date.now().toString() : null, 
        board: parsed.isGame === 'tictactoe' ?
        Array(9).fill(null) : (parsed.isGame === 'connect4' ? Array(42).fill(null) : null), 
        turn: parsed.isGame === 'tictactoe' ?
        'X' : (parsed.isGame === 'connect4' ? 'R' : null), winner: null, 
        players: parsed.isGame === 'tictactoe' ?
        { X: null, O: null } : (parsed.isGame === 'connect4' ? { R: null, Y: null } : (parsed.isGame === 'rps' ? { p1: { alias: alias, fp: myFingerprint, move: parsed.payload }, p2: null } : null))
    };
    wallData.push(packet);
    if(typeof saveLocalData === "function") saveLocalData(); 
    if(typeof renderWall === "function") renderWall(); 
    broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
    input.value = '';
}

function hostClearWall() {
    if(confirm("DANGER: This will permanently wipe the chat history for you and all connected visitors. Proceed?")) {
        wallData = [];
        if(typeof saveLocalData === "function") saveLocalData(); 
        if(typeof renderWall === "function") renderWall();
        broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
    }
}

//---------------------------------------------------------
// 05. GAME ENGINES (CONNECT 4 & TIC-TAC-TOE)
//---------------------------------------------------------
function sendGameMove(gameId, cellIndex) {
    let aliasInput = document.getElementById('visitor-alias-input');
    if(!aliasInput) aliasInput = document.getElementById('my-alias');
    
    let alias = aliasInput ? aliasInput.value.trim() : '';
    if(!alias && peer) alias = peer.id.substring(0,6);
    if (currentRole === 'HOST') {
        processGameMove({ gameId: gameId, cellIndex: cellIndex, fingerprint: myFingerprint, senderAlias: alias });
    } else if (currentRole === 'VISITOR' && activeConn) {
        activeConn.send({ type: 'GAME_MOVE', gameId: gameId, cellIndex: cellIndex, fingerprint: myFingerprint, senderAlias: alias });
    }
}

function processGameMove(p) {
    let game = wallData.find(m => m.gameId === p.gameId);
    if (!game || game.winner) return;
    if (game.isGame === 'tictactoe' && !game.board[p.cellIndex]) {
        if (!game.players[game.turn]) game.players[game.turn] = { fp: p.fingerprint, alias: p.senderAlias };
        if (game.players[game.turn].fp === p.fingerprint) {
            game.board[p.cellIndex] = game.turn;
            checkTTTWinner(game);
            if (!game.winner) game.turn = game.turn === 'X' ? 'O' : 'X';
            if(typeof saveLocalData === "function") saveLocalData();
            if(typeof renderWall === "function") renderWall();
            broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
        }
    } 
    // --- ARCADE: CONNECT 4 GRAVITY ENGINE ---
    else if (game.isGame === 'connect4') {
        let col = p.cellIndex;
        let placedRow = -1;
        // Gravity Drop: Find the lowest available slot in the clicked column
        for(let r = 5; r >= 0; r--) {
            if (!game.board[r*7 + col]) { placedRow = r; break; }
        }
        if (placedRow !== -1) {
            if (!game.players[game.turn]) game.players[game.turn] = { fp: p.fingerprint, alias: p.senderAlias };
            if (game.players[game.turn].fp === p.fingerprint) {
                game.board[placedRow*7 + col] = game.turn;
                checkC4Winner(game);
                if (!game.winner) game.turn = game.turn === 'R' ? 'Y' : 'R';
                if(typeof saveLocalData === "function") saveLocalData();
                if(typeof renderWall === "function") renderWall();
                broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
            }
        }
    }
}

function checkTTTWinner(game) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (let line of lines) {
        const [a,b,c] = line;
        if (game.board[a] && game.board[a] === game.board[b] && game.board[a] === game.board[c]) {
            game.winner = (game.players[game.board[a]] ? game.players[game.board[a]].alias : "PLAYER " + game.board[a]).toUpperCase() + " WINS";
            return;
        }
    }
    if (!game.board.includes(null)) game.winner = 'DRAW // STALEMATE';
}

function checkC4Winner(game) {
    const b = game.board;
    for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 7; c++) {
            let idx = r * 7 + c;
            let t = b[idx];
            if (!t) continue;
            // horizontal right
            if (c <= 3 && t === b[idx+1] && t === b[idx+2] && t === b[idx+3]) { game.winner = game.players[t].alias.toUpperCase() + " WINS"; return; } 
            // vertical down
            if (r <= 2 && t === b[idx+7] && t === b[idx+14] && t === b[idx+21]) { game.winner = game.players[t].alias.toUpperCase() + " WINS"; return; } 
            // diag down-right
            if (r <= 2 && c <= 3 && t === b[idx+8] && t === b[idx+16] && t === b[idx+24]) { game.winner = game.players[t].alias.toUpperCase() + " WINS"; return; } 
            // diag down-left
            if (r <= 2 && c >= 3 && t === b[idx+6] && t === b[idx+12] && t === b[idx+18]) { game.winner = game.players[t].alias.toUpperCase() + " WINS"; return; } 
        }
    }
    if (!b.includes(null)) game.winner = 'DRAW // STALEMATE';
}

//---------------------------------------------------------
// 06. FILE TRANSFER ENGINE
//---------------------------------------------------------
function transmitCompressedImage(base64Str) {
    const imgTag = `<br><div style="display:inline-block; resize:both; overflow:hidden; min-width:100px; min-height:100px; width:300px; max-width:100%; border:1px solid var(--main-cyan); border-radius:4px; margin-top:5px; box-shadow:var(--text-glow); background:#000;"><img src="${base64Str}" style="width:100%; height:100%; object-fit:contain; display:block;" /></div>`;
    
    if (currentRole === 'HOST') {
        wallData.push({ sender: "[HOST]", text: imgTag, isPrivate: false, timestamp: new Date().toLocaleTimeString() });
        if(typeof saveLocalData === "function") saveLocalData(); 
        if(typeof renderWall === "function") renderWall(); 
        broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
    } else if (currentRole === 'VISITOR' && activeConn) {
        const priv = document.getElementById('private-packet-toggle');
        const aliasInput = document.getElementById('visitor-alias-input');
        const alias = aliasInput ? aliasInput.value.trim() : '';
        let name = alias ? alias : peer.id.substring(0,6);
        activeConn.send({ 
            type: typeof MSG_TYPE_WALL_POST !== 'undefined' ? MSG_TYPE_WALL_POST : 'NEW_WALL_PACKET', 
            text: imgTag, isPrivate: priv ? priv.checked : false, sender: name, fingerprint: typeof myFingerprint !== 'undefined' ? myFingerprint : 'unknown' 
        });
    }
    document.getElementById('hidden-file-input').value = '';
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert("[ SYSTEM_ERROR ] Only image matrices are supported via direct upload."); event.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const MAX_WIDTH = 800;
            let newWidth = img.width; let newHeight = img.height;
            if (img.width > MAX_WIDTH) { const scaleSize = MAX_WIDTH / img.width; newWidth = MAX_WIDTH; newHeight = img.height * scaleSize; }
            const canvas = document.createElement('canvas');
            canvas.width = newWidth; canvas.height = newHeight;
            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, newWidth, newHeight);
            transmitCompressedImage(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function handleRawFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    document.getElementById('hidden-raw-file-input').value = '';
    const transferId = Date.now().toString();
    let alias = '';
    
    if (currentRole === 'HOST') { const aliasInput = document.getElementById('my-alias');
    alias = aliasInput ? aliasInput.value.trim() || '[HOST]' : '[HOST]'; } 
    else if (currentRole === 'VISITOR') { const aliasInput = document.getElementById('visitor-alias-input');
    alias = aliasInput ? aliasInput.value.trim() || peer.id.substring(0,6) : peer.id.substring(0,6); }

    const startPacket = { type: 'FILE_START', id: transferId, name: file.name, size: file.size, fileType: file.type, senderAlias: alias };
    incomingFiles[transferId] = { chunks: [], received: 0, total: file.size, name: file.name, type: file.type };
    let uiHTML = `<div id="file-${transferId}" style="border: 1px dashed var(--main-cyan); padding: 10px; margin-top: 5px; background: rgba(0,255,255,0.05); display: inline-block;"><span style="color:var(--main-cyan);">[ ⚠️ TRANSMITTING DATA ]</span><br><b style="color:#fff;">${file.name}</b><br><div style="width:150px; height:10px; background:#333; margin-top:5px;"><div id="bar-${transferId}" style="width:0%; height:100%; background:var(--main-cyan);"></div></div><span id="pct-${transferId}" style="font-size:0.8rem; color:#aaa;">0%</span></div>`;
    if (currentRole === 'HOST') { wallData.push({ sender: alias, text: uiHTML, isPrivate: false, timestamp: new Date().toLocaleTimeString() });
    if(typeof renderWall === "function") renderWall(); broadcastToAll(startPacket); } 
    else if (currentRole === 'VISITOR' && activeConn) activeConn.send(startPacket);
    
    const chunkSize = 16 * 1024; let offset = 0;
    function readNextChunk() {
        const slice = file.slice(offset, offset + chunkSize);
        const reader = new FileReader();
        reader.onload = function(e) {
            const arrayBuffer = e.target.result;
            const chunkPacket = { type: 'FILE_CHUNK', id: transferId, data: arrayBuffer };
            if (currentRole === 'HOST') broadcastToAll(chunkPacket);
            else if (currentRole === 'VISITOR' && activeConn) activeConn.send(chunkPacket);
            incomingFiles[transferId].chunks.push(arrayBuffer); incomingFiles[transferId].received += arrayBuffer.byteLength;
            let pct = Math.floor((incomingFiles[transferId].received / file.size) * 100);
            let bar = document.getElementById(`bar-${transferId}`); let txt = document.getElementById(`pct-${transferId}`);
            if(bar) bar.style.width = pct + '%'; if(txt) txt.innerText = pct + '%';
            offset += chunkSize;
            if (offset < file.size) { setTimeout(readNextChunk, 1);
            } else {
                const endPacket = { type: 'FILE_END', id: transferId };
                if (currentRole === 'HOST') broadcastToAll(endPacket); else if (currentRole === 'VISITOR' && activeConn) activeConn.send(endPacket);
                const blob = new Blob(incomingFiles[transferId].chunks, { type: file.type }); const url = URL.createObjectURL(blob);
                let finalUI = `<span style="color:var(--main-cyan);">[ 💾 P2P_TRANSFER ]</span><br><b style="color:#fff;">${file.name}</b><br><a href="${url}" download="${file.name}" class="btn-small" style="display:inline-block; margin-top:8px; text-decoration:none; color:#000; background:var(--main-cyan);">[ DOWNLOAD DATA ]</a>`;
                let fileUI = document.getElementById(`file-${transferId}`); if (fileUI) fileUI.innerHTML = finalUI;
                if (currentRole === 'HOST') {
                    let entry = wallData.find(w => w.text.includes(`id="file-${transferId}"`));
                    if (entry) entry.text = fileUI.outerHTML; if(typeof saveLocalData === "function") saveLocalData();
                    broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
                }
                delete incomingFiles[transferId];
            }
        };
        reader.readAsArrayBuffer(slice);
    }
    readNextChunk();
}

//---------------------------------------------------------
// 07. GARBAGE COLLECTION LOOP
//---------------------------------------------------------
setInterval(() => {
    if (wallData.length === 0) return;
    let changed = false; const now = Date.now();
    wallData = wallData.filter(p => { if (p.burnAt && now >= p.burnAt) { changed = true; return false; } return true; });
    if (changed) {
        if(typeof renderWall === "function") renderWall();
        if (currentRole === 'HOST' && peer) { 
            if(typeof saveLocalData === "function") saveLocalData(); broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData }); 
        }
    }
}, 1000);

//---------------------------------------------------------
// 08. ESCAPE HATCH 
//---------------------------------------------------------
function abortAndReturnHome() {
    clearTimeout(window.dialTimer);
try {
    if (peer){
        peer.destroy();
        peer = null;
    }
} catch (e) {
    console.warn("[ SYSTEM ] Non-fatal error destroyng peer.",e);
}
  try {
      window.history.replaceState({}, document.title, window.location.pathname);
      window.locate.href = window.location.pathname;
      
    
  } catch (e) {
      window.location.reload();
}
}
