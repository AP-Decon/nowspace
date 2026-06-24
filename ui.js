//---------------------------------------------------------
// 01. MEDIA & PARSING ENGINES
//---------------------------------------------------------
function extractYouTubeId(url) {
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    return match ? match[1] : null;
}

function extractGiphyId(url) {
    const match = url.match(/giphy\.com\/gifs\/(?:.*-)?([a-zA-Z0-9]+)/i);
    return match ? match[1] : null;
}

function renderAudioEmbed(input) {
    if(!input) return ""; if(input.includes("<iframe")) return input; 
    let ytId = extractYouTubeId(input);
    return ytId ? `<iframe width="100%" height="150" src="https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>` : "";
}

function applyBackground(url) {
    if (url && url.trim() !== '') {
        let finalUrl = url;
        let gId = extractGiphyId(url);
        if (gId) finalUrl = `https://media.giphy.com/media/${gId}/giphy.gif`;
        
        document.body.style.backgroundImage = `url('${finalUrl}')`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundAttachment = 'fixed';
        
        document.querySelectorAll('.panel').forEach(p => {
            p.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
            p.style.backdropFilter = 'blur(4px)';
        });
    } else {
        document.body.style.backgroundImage = 'none';
        document.querySelectorAll('.panel').forEach(p => {
            p.style.backgroundColor = 'var(--bg-color)';
            p.style.backdropFilter = 'none';
        });
    }

    //---------------------------------------------------------
// 07. SYNCHRONIZED CANVAS ENGINE
//---------------------------------------------------------
function toggleCanvas() {
    const panel = document.getElementById('shared-canvas-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

const canvas = document.getElementById('sync-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let isDrawing = false;
let lastX = 0, lastY = 0;

function getCanvasCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX = e.clientX;
    let clientY = e.clientY;
    
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    }
    
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function startDrawing(e) {
    if (!ctx) return;
    isDrawing = true;
    const coords = getCanvasCoordinates(e);
    lastX = coords.x;
    lastY = coords.y;
}

function draw(e) {
    if (!isDrawing || !ctx) return;
    e.preventDefault(); // Prevent scrolling on touch devices
    
    const coords = getCanvasCoordinates(e);
    const color = document.getElementById('brush-color').value;
    const size = document.getElementById('brush-size').value;
    
    // Draw locally
    executeDraw(lastX, lastY, coords.x, coords.y, color, size);
    
    // Transmit to network
    const packet = {
        type: MSG_TYPE_DRAWING,
        x0: lastX, y0: lastY,
        x1: coords.x, y1: coords.y,
        color: color, size: size
    };
    
    if (currentRole === 'HOST') {
        broadcastToAll(packet);
    } else if (currentRole === 'VISITOR' && activeConn) {
        activeConn.send(packet);
    }
    
    lastX = coords.x;
    lastY = coords.y;
}

function stopDrawing() {
    isDrawing = false;
}

function executeDraw(x0, y0, x1, y1, color, size) {
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.closePath();
}

function wipeCanvas(isLocalClick = false) {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (isLocalClick) {
        const packet = { type: MSG_TYPE_CANVAS_WIPE };
        if (currentRole === 'HOST') broadcastToAll(packet);
        else if (currentRole === 'VISITOR' && activeConn) activeConn.send(packet);
    }
}

// Bind Event Listeners
if (canvas) {
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);
}
}
document.getElementById('my-bg-url')?.addEventListener('input', (e) => applyBackground(e.target.value));

//---------------------------------------------------------
// 02. SLASH COMMANDS & FORMATTING
//---------------------------------------------------------
function parseSlashCommand(text, senderName) {
    if (!text.startsWith('/')) return { text: text, burnSec: null, isGame: null };
    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();
    const payload = parts.slice(1).join(' ');

    if (cmd === '/clear') {
        wallData = []; renderWall(); return { text: null, burnSec: null, isGame: null };
    }
    
    if (cmd === '/roll') {
        let max = 100, diceCount = 1, hasPayload = false;
        if (payload.trim() !== '') {
            hasPayload = true;
            const cleanPayload = payload.replace(/\s+/g, '');
            if (cleanPayload.includes('*')) {
                const mathParts = cleanPayload.split('*');
                max = parseInt(mathParts[0], 10) || 100;
                diceCount = parseInt(mathParts[1], 10) || 1;
            } else {
                max = parseInt(cleanPayload, 10) || 100;
            }
        }
        max = Math.max(2, max); diceCount = Math.max(1, Math.min(diceCount, 50)); 
        let rollsHtml = [], totalSum = 0, nat20Count = 0, nat1Count = 0;

        for (let i = 0; i < diceCount; i++) {
            let r = Math.floor(Math.random() * max) + 1;
            totalSum += r;
            if (max === 20 && r === 20) { nat20Count++; rollsHtml.push(`<b class="glitch-text" style="color:#0f0; font-size:1.3em; text-shadow: 0 0 8px #0f0;">20</b>`); } 
            else if (max === 20 && r === 1) { nat1Count++; rollsHtml.push(`<b style="color:var(--alert-red); font-size:1.3em;">1</b>`); } 
            else { rollsHtml.push(r); }
        }

        let resultText = '';
        if (!hasPayload) resultText = `a ${totalSum} (1-100)`;
        else if (diceCount > 1) resultText = `d${max} * ${diceCount} ➔ [ ${rollsHtml.join(', ')} ] = <b style="color:#fff;">${totalSum}</b>`;
        else resultText = `a d${max} ➔ ${rollsHtml[0]}`;

        let extraFlair = '';
        if (nat20Count > 0) {
            let multiMultiplier = nat20Count > 1 ? ` (x${nat20Count})` : '';
            extraFlair = `<div class="glitch-text" style="color:#0f0; margin-top:8px; font-size:1.1rem; font-weight:bold; letter-spacing:1px; border-left: 3px solid #0f0; padding-left: 8px;">[ 🌟 CRITICAL OVERLOAD // NAT 20 DETECTED${multiMultiplier} 🌟 ]</div>`;
        } else if (nat1Count > 0 && diceCount === 1) {
            extraFlair = `<div style="color:var(--alert-red); margin-top:8px; font-weight:bold; letter-spacing:1px; border-left: 3px solid var(--alert-red); padding-left: 8px;">[ 💀 CRITICAL FAILURE // SYSTEM ERROR ]</div>`;
        }
        return { text: `<span style="color:#ffaa00;">[ 🎲 SYSTEM: ${senderName} rolled ${resultText} ]</span>${extraFlair}`, burnSec: null, isGame: null };
    }
    
    if (cmd === '/glitch') return { text: `<span class="glitch-text" style="display:inline-block;">${payload}</span>`, burnSec: null, isGame: null };
    if (cmd === '/vapor') {
        const vapor = payload.replace(/[a-zA-Z0-9!?-]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
        return { text: `<span style="color:var(--main-cyan); font-weight:bold; letter-spacing: 2px;">${vapor}</span>`, burnSec: null, isGame: null };
    }
    if (cmd === '/burn') {
        const sec = parseInt(parts[1], 10);
        if (isNaN(sec) || sec <= 0) return { text: text, burnSec: null, isGame: null }; 
        const burnMsg = parts.slice(2).join(' ');
        return { text: `<span style="color:#ff0055; font-weight:bold;">[ 🔥 BURNER PACKET (${sec}s): ${burnMsg} ]</span>`, burnSec: sec, isGame: null };
    }
    if (cmd === '/tictactoe') return { text: '<b style="color:#0f0;">[ SYSTEM: INITIALIZING GRID_WARS.EXE ]</b>', burnSec: null, isGame: 'tictactoe' };
    
    return { text: text, burnSec: null, isGame: null };
}

function formatWallMessage(text) {
    if(text.includes("[ CONSENSUS ARCHIVED ]") || text.includes("BURNER PACKET") || text.includes("INITIALIZING GRID_WARS") || text.includes("CRITICAL OVERLOAD") || text.includes("P2P_TRANSFER") || text.includes("progress-bar")) return text;
    if(text.includes("<img src=\"data:image")) return text; 
    return text.replace(/(https?:\/\/[^\s]+)/gi, (url) => {
        let ytId = extractYouTubeId(url); if (ytId) return `<br><iframe width="250" height="140" src="https://www.youtube-nocookie.com/embed/${ytId}" frameborder="0" allowfullscreen style="border: 1px solid var(--main-cyan); margin-top:5px; box-shadow: var(--text-glow);"></iframe><br>`;
        let gId = extractGiphyId(url); if (gId) return `<img src="https://media.giphy.com/media/${gId}/giphy.gif" />`;
        return url.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? `<img src="${url}" />` : `<a href="${url}" target="_blank">${url}</a>`;
    });
}

//---------------------------------------------------------
// 03. WALL DATASTREAM RENDERING
//---------------------------------------------------------
function renderWallStream(targetId, filterSecureText, decryptMode) {
    const container = document.getElementById(targetId);
    if (!container) return;
    container.innerHTML = wallData.map((post, index) => {
        if (post.isLocalWhisper) {
            return `
            <div class="wall-post private-packet" style="display:flex; align-items:flex-start; border-left-color: var(--bright-magenta); background: rgba(255, 0, 255, 0.05);">
                <div style="flex-grow:1; word-break: break-all;">
                    <span style="color:#555;">[${post.timestamp}]</span> 
                    <span class="wall-post-sender" style="color:var(--bright-magenta);">[WHISPER] ${post.sender}:</span> 
                    <span style="color:var(--bright-magenta);">${formatWallMessage(post.text)}</span>
                </div>
            </div>`;
        }

        let textOut = post.text;
        if (post.isPrivate) {
            textOut = decryptMode ? formatWallMessage(post.text) : `<span class="blurred-text">[ DIRECT_SECURE_PACKET ] ${formatWallMessage(post.text)}</span>`;
        } else {
            textOut = formatWallMessage(post.text);
        }

        if (post.isGame === 'tictactoe' && post.board) {
            let statusText = post.winner ? `<span style="color:var(--alert-red); font-weight:bold;">> ${post.winner}</span>` : `<span style="color:var(--main-cyan);">> AWAITING MOVE: PLAYER ${post.turn}</span>`;
            let grid = `<div style="display:grid; grid-template-columns: repeat(3, 40px); gap: 5px; margin-top: 10px; margin-bottom: 10px;">`;
            post.board.forEach((cell, i) => {
                let color = cell === 'X' ? 'var(--bright-magenta)' : 'var(--main-cyan)';
                grid += `<button onclick="sendGameMove('${post.gameId}', ${i})" style="width:40px; height:40px; font-size:1.2rem; background:#000; border:1px solid var(--dark-magenta); color:${color}; font-family:monospace; cursor:pointer; padding:0;">${cell || '&nbsp;'}</button>`;
            });
            grid += `</div>`;
            textOut += `<br><div style="border: 1px dashed #333; padding: 10px; display:inline-block; margin-top:5px; background:rgba(0,0,0,0.5);">
                <div style="font-size:0.8rem; margin-bottom:5px; color:#aaa;">[ GRID_WARS.EXE // TERMINAL_SYNC_ACTIVE ]</div>
                ${grid}
                <div style="font-size:0.8rem;">${statusText}</div>
            </div>`;
        }
        
        let deleteBtnHTML = decryptMode ? `<button class="btn-small btn-alert" style="padding: 0 4px; font-size: 0.6rem; margin-right: 5px; height: 18px; border-radius: 2px;" onclick="deleteWallMessage(${index})">X</button>` : '';

        return `
            <div class="wall-post ${post.isPrivate ? 'private-packet' : ''}" style="display:flex; align-items:flex-start;">
                ${deleteBtnHTML}
                <div style="flex-grow:1; word-break: break-all;">
                    <span style="color:#555;">[${post.timestamp}]</span> 
                    <span class="wall-post-sender">${post.isPrivate && decryptMode ? '[SECURE] ' : ''}${post.sender}:</span> 
                    <span style="color:#ccc;">${textOut}</span>
                </div>
            </div>
        `;
    }).join('');
    container.scrollTop = container.scrollHeight;
}

function renderWall() {
    renderWallStream('datastream-output', true, false);
    renderWallStream('host-datastream-output', false, true);
}

function deleteWallMessage(index) {
    if(confirm("DELETE THIS PACKET? It will be wiped for all connected nodes.")) {
        wallData.splice(index, 1);
        saveLocalData();
        renderWall();
        broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
    }
}

function insertEmoji(emoji) {
    if (currentRole === 'HOST') {
        const hostInput = document.getElementById('host-wall-input');
        if (hostInput) { hostInput.value += emoji; hostInput.focus(); }
    } else if (currentRole === 'VISITOR') {
        const visitorInput = document.getElementById('wall-input-buffer');
        if (visitorInput) { visitorInput.value += emoji; visitorInput.focus(); }
    }
}

//---------------------------------------------------------
// 04. FEATURE FLAGS & POLLS
//---------------------------------------------------------
function applyFeatures(features) {
    document.getElementById('crt-scanlines').style.display = features.scanlines ? 'block' : 'none';
    document.querySelectorAll('.soundboard-container').forEach(el => el.style.display = features.soundboard ? 'flex' : 'none');
    ['visitor-gallery-panel', 'visitor-top8-panel', 'visitor-poll-panel'].forEach(id => {
        const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    if (features.gallery && document.getElementById('render-gallery-grid').innerHTML !== '') document.getElementById('visitor-gallery-panel').style.display = 'block';
    if (features.top8 && document.getElementById('render-top8-grid').innerHTML !== '') document.getElementById('visitor-top8-panel').style.display = 'block';
    if (features.polls && activePoll) document.getElementById('visitor-poll-panel').style.display = 'block';
    
    const hostTop8 = document.getElementById('host-top8-wrapper'); if (hostTop8) hostTop8.style.display = features.top8 ? 'block' : 'none';
    const hostOutput = document.getElementById('host-datastream-output'); if (hostOutput) hostOutput.classList.toggle('hide-usernames', !features.usernames);
    const visitorOutput = document.getElementById('datastream-output'); if (visitorOutput) visitorOutput.classList.toggle('hide-usernames', !features.usernames);
    document.querySelectorAll('.voice-feature-group').forEach(el => el.style.display = features.voicecomms ? 'flex' : 'none');

    if (!features.voicecomms && localStream) {
        if (activeCalls.length > 0) { activeCalls.forEach(call => call.close()); activeCalls = []; }
        localStream.getTracks().forEach(t => t.stop()); localStream = null;
        updateVoiceTogglesVisuals(false); 
        document.querySelectorAll('.mute-btn, .cam-btn, .screen-btn').forEach(b => b.style.display = 'none');
        document.getElementById('host-video-stream-container').innerHTML = '';
        document.getElementById('visitor-video-stream-container').innerHTML = '';
    }
    renderVisitorPoll();
}

function updateHostFeatures() {
    ['scanlines', 'soundboard', 'gallery', 'top8', 'usernames', 'voicecomms', 'polls'].forEach(f => {
        featureToggles[f] = document.getElementById('toggle-' + f).checked;
    });
    applyFeatures(featureToggles); saveLocalData();
    broadcastToAll({ type: MSG_TYPE_FEATURE_UPDATE, features: featureToggles });
}

function deployPoll() {
    const q = document.getElementById('poll-q').value.trim(), o1 = document.getElementById('poll-o1').value.trim(), o2 = document.getElementById('poll-o2').value.trim(), o3 = document.getElementById('poll-o3').value.trim();
    if(!q || !o1 || !o2) return alert("Requires data strings.");
    let opts = [{text: o1, votes: 0}, {text: o2, votes: 0}]; if(o3) opts.push({text: o3, votes: 0});
    activePoll = { question: q, options: opts, voters: [] };
    document.getElementById('host-poll-builder').style.display = 'none'; document.getElementById('host-poll-active').style.display = 'block';
    renderHostPoll();
    broadcastToAll({ type: MSG_TYPE_POLL_NEW, poll: activePoll });
}

function closePoll() {
    if(activePoll) {
        const total = activePoll.options.reduce((sum, o) => sum + o.votes, 0);
        let txt = `<b style="color:var(--main-cyan);">[ CONSENSUS ARCHIVED ]</b><br><span style="color:#fff;">${activePoll.question}</span><br>`;
        activePoll.options.forEach(o => {
            const pct = total === 0 ? 0 : Math.round((o.votes / total) * 100);
            txt += `<span style="color:#aaa;">> ${o.text}:</span> <b style="color:var(--bright-magenta);">${pct}%</b><br>`;
        });
        wallData.push({ sender: "[SYSTEM]", text: txt, isPrivate: false, timestamp: new Date().toLocaleTimeString() });
        saveLocalData(); renderWall();
        broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
    }
    activePoll = null; ['q','o1','o2','o3'].forEach(id => document.getElementById('poll-'+id).value = '');
    document.getElementById('host-poll-builder').style.display = 'block'; document.getElementById('host-poll-active').style.display = 'none';
    broadcastToAll({ type: MSG_TYPE_POLL_NEW, poll: null });
    renderVisitorPoll();
}

function renderHostPoll() {
    if(!activePoll) return;
    const total = activePoll.options.reduce((s, o) => s + o.votes, 0);
    let html = `<div style="color:var(--main-cyan); font-weight:bold; margin-bottom:8px;">> ${activePoll.question}</div>`;
    activePoll.options.forEach(o => {
        const pct = total === 0 ? 0 : Math.round((o.votes / total) * 100);
        html += `<div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:2px;"><span>${o.text} <span style="color:#aaa;">(${pct}%)</span></span><span style="color:var(--bright-magenta);">${o.votes}</span></div><div class="poll-bar" style="width:${pct}%;"></div>`;
    });
    document.getElementById('render-host-poll-results').innerHTML = html;
}

function renderVisitorPoll() {
    const panel = document.getElementById('visitor-poll-panel'), content = document.getElementById('render-poll-content');
    if(!activePoll || !featureToggles.polls) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    const voted = activePoll.voters.includes(myFingerprint), total = activePoll.options.reduce((s, o) => s + o.votes, 0);
    let html = `<div style="color:var(--main-cyan); margin-bottom:10px; font-weight:bold;">> ${activePoll.question}</div>`;
    activePoll.options.forEach((o, idx) => {
        const pct = total === 0 ? 0 : Math.round((o.votes / total) * 100);
        html += voted ? `<div class="poll-option poll-locked"><span>${o.text} <span style="color:#aaa; font-size:0.8rem;">(${pct}%)</span></span><span style="color:var(--bright-magenta);">${o.votes}</span></div><div class="poll-bar" style="width:${pct}%;"></div>` : `<div class="poll-option" onclick="submitVote(${idx})"><span>> ${o.text}</span><span style="font-size:0.8rem; color:#555;">[ VOTE ]</span></div>`;
    });
    content.innerHTML = html;
}

function submitVote(idx) {
    if(!activePoll || !activeConn || activePoll.voters.includes(myFingerprint)) return;
    activePoll.voters.push(myFingerprint); activeConn.send({ type: MSG_TYPE_POLL_VOTE, voterId: myFingerprint, optionIndex: idx });
    renderVisitorPoll();
}

//---------------------------------------------------------
// 05. SOUNDBOARD & SYSTEM MANUAL
//---------------------------------------------------------
function updateMasterVolume(val) { 
    globalVolume = parseFloat(val); 
    document.querySelectorAll('.vol-slider-wrap input[type="range"]').forEach(i => i.value = val); 
}

function triggerSound(soundId, isLocalClick = true, originalSender = null, customUrl = null) {
    let src = (soundId === 'custom' && customUrl) ? customUrl : SOUND_ASSETS[soundId];
    if (src) { let a = new Audio(src); a.volume = globalVolume; a.play().catch(e => {}); }
    if (isLocalClick) {
        const p = { type: MSG_TYPE_SOUNDBOARD, soundId: soundId, sender: peer.id, customUrl: customUrl };
        if (currentRole === 'HOST') { broadcastToAll(p); } 
        else if (currentRole === 'VISITOR' && activeConn) { activeConn.send(p); }
    } else if (currentRole === 'HOST') {
        for (let id in peer.connections) { 
            if (id !== originalSender) { 
                peer.connections[id].forEach(c => { if(c.open) c.send({ type: MSG_TYPE_SOUNDBOARD, soundId: soundId, sender: originalSender, customUrl: customUrl }); }); 
            } 
        }
    }
}

function toggleManual() {
    const modal = document.getElementById('system-manual-modal');
    const target = document.getElementById('manual-render-target');
    if (target.innerHTML === "") {
        target.innerHTML = MANUAL_DATABASE.map(sec => `<div class="manual-section"><h3 class="manual-h3">${sec.h3}</h3><p class="manual-text">${sec.p}</p></div>`).join('');
    }
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

//---------------------------------------------------------
// 06. PROFILE VISUALS (TOP 8 & GALLERY)
//---------------------------------------------------------
function buildVisitorTop8Grid(arr) {
    const grid = document.getElementById('render-top8-grid'); grid.innerHTML = '';
    if (!arr || arr.length === 0) { document.getElementById('visitor-top8-panel').style.display = 'none'; return; }
    arr.forEach(id => { grid.innerHTML += `<div class="top8-item" onclick="jumpToNewNode('${id}')">🌐<br><b>${id.toUpperCase()}</b></div>`; });
    document.getElementById('visitor-top8-panel').style.display = featureToggles.top8 ? 'block' : 'none';
}

function jumpToNewNode(id) { 
    document.getElementById('friend-id').value = id; 
    disconnectNode(); 
    visitFriend(); 
}

function buildVisitorGallery(str) {
    const grid = document.getElementById('render-gallery-grid'), panel = document.getElementById('visitor-gallery-panel'); grid.innerHTML = '';
    if(!str || str.trim() === '') { panel.style.display = 'none'; return; }
    const urls = str.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    urls.forEach(u => { 
        let finalUrl = u, gId = extractGiphyId(u); if(gId) finalUrl = `https://media.giphy.com/media/${gId}/giphy.gif`;
        grid.innerHTML += `<div class="gallery-frame" onclick="window.open('${finalUrl}', '_blank')"><img src="${finalUrl}"></div>`; 
    });
    panel.style.display = featureToggles.gallery ? 'block' : 'none';
}

// Transmit handlers (Bound to UI input boxes)
document.getElementById('wall-input-buffer')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') visitorSendWallPacket(); });
document.getElementById('host-wall-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') hostSendWallPacket(); });

// END
