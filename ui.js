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
    if(!input) return ""; 
    if(input.includes("<iframe")) return input; 
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
        // --- AUTO-ADD TO GALLERY ---
        const gallery = document.getElementById('my-gallery');
        if (gallery && typeof currentRole !== 'undefined' && currentRole === 'HOST') {
            const rawUrl = url.trim();
            let existingUrls = gallery.value.split('\n').map(u => u.trim());
            
            // If the URL isn't already in the gallery, append it to a new line
            if (!existingUrls.includes(rawUrl)) {
                gallery.value = gallery.value + (gallery.value ? '\n' : '') + rawUrl;
                if (typeof saveLocalData === "function") saveLocalData();
            }
        }
        // ---------------------------
    } else {
        document.body.style.backgroundImage = 'none';
        document.querySelectorAll('.panel').forEach(p => {
            p.style.backgroundColor = 'var(--bg-color)';
            p.style.backdropFilter = 'none';
        });
    }
}
document.getElementById('my-bg-url')?.addEventListener('input', (e) => applyBackground(e.target.value));

//---------------------------------------------------------
// 02. SLASH COMMANDS & FORMATTING
//---------------------------------------------------------
function parseSlashCommand(text, senderName) {
    if (!text.startsWith('/')) return { text: text, burnSec: null, isGame: null, payload: null };
    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();
    const payload = parts.slice(1).join(' ');

    if (cmd === '/clear') {
        wallData = []; renderWall(); return { text: null, burnSec: null, isGame: null, payload: null };
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
        return { text: `<span style="color:#ffaa00;">[ 🎲 SYSTEM: ${senderName} rolled ${resultText} ]</span>${extraFlair}`, burnSec: null, isGame: null, payload: null };
    }
    
    // ARCADE: THE ORACLE
    if (cmd === '/8ball') {
        const answers = ["PROBABILITY OF CATASTROPHE IS HIGH", "OUTCOME LOOKS OPTIMAL", "SYSTEM ERROR: CANNOT COMPUTE", "SIGNS POINT TO YES", "GHOSTS IN THE MACHINE SAY NO", "AWAIT FURTHER DATA", "ACCESS GRANTED", "ACCESS DENIED"];
        const ans = answers[Math.floor(Math.random() * answers.length)];
        return { text: `<span style="color:#ffaa00;">[ 🔮 THE ORACLE DECLARES: ${ans} ]</span>`, burnSec: null, isGame: null, payload: null };
    }

    if (cmd === '/glitch') return { text: `<span class="glitch-text" style="display:inline-block;">${payload}</span>`, burnSec: null, isGame: null, payload: null };
    
    if (cmd === '/vapor') {
        const vapor = payload.replace(/[a-zA-Z0-9!?-]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
        return { text: `<span style="color:var(--main-cyan); font-weight:bold; letter-spacing: 2px;">${vapor}</span>`, burnSec: null, isGame: null, payload: null };
    }
    
    if (cmd === '/burn') {
        const sec = parseInt(parts[1], 10);
        if (isNaN(sec) || sec <= 0) return { text: text, burnSec: null, isGame: null, payload: null }; 
        const burnMsg = parts.slice(2).join(' ');
        return { text: `<span style="color:#ff0055; font-weight:bold;">[ 🔥 BURNER PACKET (${sec}s): ${burnMsg} ]</span>`, burnSec: sec, isGame: null, payload: null };
    }
    
    // ARCADE: MULTIPLAYER MODULES
    if (cmd === '/tictactoe') return { text: '<b style="color:#0f0;">[ SYSTEM: INITIALIZING GRID_WARS.EXE ]</b>', burnSec: null, isGame: 'tictactoe', payload: null };
    if (cmd === '/connect4') return { text: '<b style="color:#0f0;">[ SYSTEM: INITIALIZING CONNECT_4.EXE ]</b>', burnSec: null, isGame: 'connect4', payload: null };
    if (cmd === '/rps') {
        const w = payload.toLowerCase();
        if (!['rock','paper','scissors'].includes(w)) return { text: null, burnSec: null, isGame: null, payload: null };
        return { text: '[ INIT SECURE DUEL ]', burnSec: null, isGame: 'rps', payload: w };
    }
    
    return { text: text, burnSec: null, isGame: null, payload: null };
}

function formatWallMessage(text) {
    if(text.includes("[ CONSENSUS ARCHIVED ]") || text.includes("BURNER PACKET") || text.includes("INITIALIZING GRID_WARS") || text.includes("INITIALIZING CONNECT_4") || text.includes("CRITICAL OVERLOAD") || text.includes("P2P_TRANSFER") || text.includes("SECURE DUEL") || text.includes("progress-bar")) return text;
    if(text.includes("<img src=\"data:image")) return text; 
    
    return text.replace(/(https?:\/\/[^\s]+)/gi, (url) => {
        let ytId = extractYouTubeId(url); 
        if (ytId) return `<br><div style="display:inline-block; resize:both; overflow:hidden; width:250px; min-width:150px; max-width:100%; border:1px solid var(--main-cyan); margin-top:5px; box-shadow:var(--text-glow);"><iframe width="100%" height="100%" style="min-height:140px;" src="https://www.youtube-nocookie.com/embed/${ytId}" frameborder="0" allowfullscreen></iframe></div><br>`;
        
        let gId = extractGiphyId(url); 
        if (gId) return `<br><div style="display:inline-block; resize:both; overflow:hidden; width:250px; min-width:100px; max-width:100%;"><img src="https://media.giphy.com/media/${gId}/giphy.gif" style="width:100%; height:100%; object-fit:contain; display:block;" /></div>`;
        
        return url.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? 
            `<br><div style="display:inline-block; resize:both; overflow:hidden; width:250px; min-width:100px; max-width:100%; border:1px solid var(--main-cyan); border-radius:4px; margin-top:5px;"><img src="${url}" style="width:100%; height:100%; object-fit:contain; display:block;" /></div>` 
            : `<a href="${url}" target="_blank">${url}</a>`;
    });
}

//---------------------------------------------------------
// 03. WALL DATASTREAM RENDERING
//---------------------------------------------------------
function renderWallStream(targetId, filterSecureText, decryptMode) {
    const container = document.getElementById(targetId);
    if (!container) return;
    
    container.innerHTML = wallData.map((post, index) => {
        // Render Whispers
        if (post.isLocalWhisper) {
            return `
            <div class="wall-post private-packet" style="display:flex; align-items:flex-start; border-left-color: var(--bright-magenta); background: rgba(255, 0, 255, 0.05);">
                <div style="flex-grow:1; min-width: 0;">
                    <div style="font-size: 0.85rem; margin-bottom: 4px; overflow-wrap: break-word;">
                        <span style="color:#555;">[${post.timestamp}]</span><br>
                        <b class="wall-post-sender" style="color:var(--bright-magenta);">[WHISPER] ${post.sender}</b>
                    </div>
                    <div style="color:var(--bright-magenta); overflow-wrap: anywhere; word-break: break-word;">
                        ${formatWallMessage(post.text)}
                    </div>
                </div>
            </div>`;
        }

        // Render Standard & Secure Packets
        let textOut = post.text;
        let secureBadge = '';

        if (post.isPrivate) {
            if (decryptMode) {
                textOut = formatWallMessage(post.text);
                secureBadge = `<span style="color:var(--alert-red); margin-right:5px; text-shadow: 0 0 5px var(--alert-red);" title="Secure Packet">🔒</span>`;
            } else {
                textOut = `<span class="blurred-text" style="color:#555; letter-spacing: 2px;">🔒 ENCRYPTED</span>`;
            }
        } else {
            textOut = formatWallMessage(post.text);
        }

        // --- GAME RENDERING MODULE ---
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
        
        if (post.isGame === 'connect4' && post.board) {
            let statusText = post.winner ? `<span style="color:var(--alert-red); font-weight:bold;">> ${post.winner}</span>` : `<span style="color:var(--main-cyan);">> AWAITING DROP: PLAYER ${post.turn}</span>`;
            let grid = `<div style="display:grid; grid-template-columns: repeat(7, 30px); gap: 4px; margin-top: 10px; margin-bottom: 10px; background:#222; padding:5px; border-radius:4px; border:1px solid #555;">`;
            post.board.forEach((cell, i) => {
                let colIndex = i % 7;
                let color = '#000';
                let shadow = 'none';
                if (cell === 'R') { color = 'var(--alert-red)'; shadow = '0 0 5px var(--alert-red)'; }
                else if (cell === 'Y') { color = '#ffeb3b'; shadow = '0 0 5px #ffeb3b'; }
                
                let clickAttr = `onclick="sendGameMove('${post.gameId}', ${colIndex})"`;
                grid += `<div ${clickAttr} style="width:30px; height:30px; border-radius:50%; background:${color}; box-shadow:${shadow}; border:1px solid #111; cursor:pointer;"></div>`;
            });
            grid += `</div>`;
            textOut += `<br><div style="border: 1px dashed #333; padding: 10px; display:inline-block; margin-top:5px; background:rgba(0,0,0,0.5);">
                <div style="font-size:0.8rem; margin-bottom:5px; color:#aaa;">[ CONNECT_4.EXE // GRAVITY_MATRIX_ACTIVE ]</div>
                ${grid}
                <div style="font-size:0.8rem;">${statusText}</div>
            </div>`;
        }
        
        let deleteBtnHTML = decryptMode ? `<button class="btn-small btn-alert" style="padding: 0 4px; font-size: 0.6rem; margin-right: 8px; height: 18px; border-radius: 2px;" onclick="deleteWallMessage(${index})">X</button>` : '';

        return `
            <div class="wall-post ${post.isPrivate ? 'private-packet' : ''}" style="display:flex; align-items:flex-start;">
                ${deleteBtnHTML}
                <div style="flex-grow:1; min-width: 0;">
                    <div style="font-size: 0.85rem; margin-bottom: 4px; overflow-wrap: break-word;">
                        <span style="color:#555;">[${post.timestamp}]</span><br>
                        ${secureBadge}<b class="wall-post-sender" style="color:var(--main-cyan);">${post.sender}</b>
                    </div>
                    <div style="color:#ccc; overflow-wrap: anywhere; word-break: break-word;">
                        ${textOut}
                    </div>
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
        if(typeof saveLocalData === "function") saveLocalData();
        renderWall();
        if(typeof broadcastToAll === "function") broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
    }
}

function insertEmoji(emoji) {
    const formattedEmoji = `<span style="font-size: 1.5rem; line-height: 1;">${emoji}</span>`;
    
    if (currentRole === 'HOST') {
        const aliasInput = document.getElementById('my-alias');
        const alias = aliasInput ? aliasInput.value.trim() || "[HOST]" : "[HOST]";
        
        const packet = { 
            sender: alias, 
            text: formattedEmoji, 
            isPrivate: false, 
            timestamp: new Date().toLocaleTimeString(),
            burnAt: null, isGame: null, gameId: null, board: null, turn: null, winner: null, players: null
        };

        wallData.push(packet);
        if(typeof saveLocalData === "function") saveLocalData(); 
        if(typeof renderWall === "function") renderWall(); 
        if(typeof broadcastToAll === "function") broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
        
    } else if (currentRole === 'VISITOR' && typeof activeConn !== 'undefined' && activeConn) {
        const priv = document.getElementById('private-packet-toggle');
        const aliasInput = document.getElementById('visitor-alias-input');
        const alias = aliasInput ? aliasInput.value.trim() || peer.id.substring(0,6) : peer.id.substring(0,6);
        
        activeConn.send({ 
            type: typeof MSG_TYPE_WALL_POST !== 'undefined' ? MSG_TYPE_WALL_POST : 'NEW_WALL_PACKET', 
            text: formattedEmoji, 
            isPrivate: priv ? priv.checked : false, 
            sender: alias, 
            fingerprint: typeof myFingerprint !== 'undefined' ? myFingerprint : 'unknown', 
            burnSec: null, 
            isGame: null 
        });
    }
}

//---------------------------------------------------------
// 04. TYPING INDICATOR ENGINE (RADAR)
//---------------------------------------------------------
let typingTimeout = null;
let activeTypers = new Set();

function sendTypingState(isTyping) {
    const aliasInput = document.getElementById(currentRole === 'HOST' ? 'my-alias' : 'visitor-alias-input');
    const alias = aliasInput ? aliasInput.value.trim() || 'PEER' : 'PEER';
    
    if (typeof MSG_TYPE_TYPING !== 'undefined') {
        const p = { type: MSG_TYPE_TYPING, isTyping: isTyping, sender: alias };
        if (currentRole === 'HOST' && typeof broadcastToAll === "function") broadcastToAll(p);
        else if (currentRole === 'VISITOR' && activeConn) activeConn.send(p);
    }
}

function handleTypingEvent() {
    sendTypingState(true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        sendTypingState(false);
    }, 2000); 
}

function showTypingIndicator(sender, isTyping) {
    const indHost = document.getElementById('host-typing-indicator');
    const indVis = document.getElementById('visitor-typing-indicator');
    
    if (isTyping) activeTypers.add(sender);
    else activeTypers.delete(sender);

    const txt = activeTypers.size > 0 ? `[ 📡 ${Array.from(activeTypers).join(', ')} is transmitting... ]` : '';
    if (indHost) indHost.innerText = txt;
    if (indVis) indVis.innerText = txt;
}

window.addEventListener('load', () => {
    const vInput = document.getElementById('wall-input-buffer');
    if (vInput) {
        vInput.addEventListener('keypress', (e) => { 
            if (e.key === 'Enter') {
                clearTimeout(typingTimeout);
                sendTypingState(false);
                if(typeof visitorSendWallPacket === 'function') visitorSendWallPacket(); 
            }
        });
        vInput.addEventListener('input', handleTypingEvent);
    }

    const hInput = document.getElementById('host-wall-input');
    if (hInput) {
        hInput.addEventListener('keypress', (e) => { 
            if (e.key === 'Enter') {
                clearTimeout(typingTimeout);
                sendTypingState(false);
                if(typeof hostSendWallPacket === 'function') hostSendWallPacket(); 
            }
        });
        hInput.addEventListener('input', handleTypingEvent);
    }

    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
        if(btn.innerText === 'TRANSMIT') {
            btn.addEventListener('click', () => {
                clearTimeout(typingTimeout);
                sendTypingState(false);
            });
        }
    });
});

//---------------------------------------------------------
// 05. FEATURE FLAGS & POLLS
//---------------------------------------------------------
function applyFeatures(features) {
    const crt = document.getElementById('crt-scanlines');
    if (crt) crt.style.display = features.scanlines ? 'block' : 'none';
    
    document.querySelectorAll('.soundboard-container').forEach(el => el.style.display = features.soundboard ? 'flex' : 'none');
    
    ['visitor-gallery-panel', 'visitor-top8-panel', 'visitor-poll-panel'].forEach(id => {
        const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    
    const galleryGrid = document.getElementById('render-gallery-grid');
    if (features.gallery && galleryGrid && galleryGrid.innerHTML !== '') {
        const p = document.getElementById('visitor-gallery-panel'); if (p) p.style.display = 'block';
    }
    
    const top8Grid = document.getElementById('render-top8-grid');
    if (features.top8 && top8Grid && top8Grid.innerHTML !== '') {
        const p = document.getElementById('visitor-top8-panel'); if (p) p.style.display = 'block';
    }
    
    const pollPanel = document.getElementById('visitor-poll-panel');
    if (features.polls && activePoll && pollPanel) pollPanel.style.display = 'block';
    
    const hostTop8 = document.getElementById('host-top8-wrapper'); 
    if (hostTop8) hostTop8.style.display = features.top8 ? 'block' : 'none';
    
    const hostOutput = document.getElementById('host-datastream-output'); 
    if (hostOutput) hostOutput.classList.toggle('hide-usernames', !features.usernames);
    
    const visitorOutput = document.getElementById('datastream-output'); 
    if (visitorOutput) visitorOutput.classList.toggle('hide-usernames', !features.usernames);
    
    document.querySelectorAll('.voice-feature-group').forEach(el => el.style.display = features.voicecomms ? 'flex' : 'none');

    if (!features.voicecomms && typeof localStream !== 'undefined' && localStream) {
        if (activeCalls.length > 0) { activeCalls.forEach(call => call.close()); activeCalls = []; }
        localStream.getTracks().forEach(t => t.stop()); localStream = null;
        if(typeof updateVoiceTogglesVisuals === "function") updateVoiceTogglesVisuals(false); 
        document.querySelectorAll('.mute-btn, .cam-btn, .screen-btn').forEach(b => b.style.display = 'none');
        document.getElementById('host-video-stream-container').innerHTML = '';
        document.getElementById('visitor-video-stream-container').innerHTML = '';
    }
    renderVisitorPoll();
}

function updateHostFeatures() {
    ['scanlines', 'soundboard', 'gallery', 'top8', 'usernames', 'voicecomms', 'polls'].forEach(f => {
        const cb = document.getElementById('toggle-' + f);
        if (cb) featureToggles[f] = cb.checked;
    });
    applyFeatures(featureToggles); 
    if(typeof saveLocalData === "function") saveLocalData();
    if(typeof broadcastToAll === "function") broadcastToAll({ type: MSG_TYPE_FEATURE_UPDATE, features: featureToggles });
}

function deployPoll() {
    const q = document.getElementById('poll-q').value.trim();
    const o1 = document.getElementById('poll-o1').value.trim();
    const o2 = document.getElementById('poll-o2').value.trim();
    const o3 = document.getElementById('poll-o3').value.trim();
    
    if(!q || !o1 || !o2) return alert("Requires data strings.");
    
    let opts = [{text: o1, votes: 0}, {text: o2, votes: 0}]; 
    if(o3) opts.push({text: o3, votes: 0});
    
    activePoll = { question: q, options: opts, voters: [] };
    
    document.getElementById('host-poll-builder').style.display = 'none'; 
    document.getElementById('host-poll-active').style.display = 'block';
    
    renderHostPoll();
    if(typeof broadcastToAll === "function") broadcastToAll({ type: MSG_TYPE_POLL_NEW, poll: activePoll });
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
        if(typeof saveLocalData === "function") saveLocalData(); 
        renderWall();
        if(typeof broadcastToAll === "function") broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
    }
    activePoll = null; 
    ['q','o1','o2','o3'].forEach(id => { const el = document.getElementById('poll-'+id); if(el) el.value = ''; });
    
    document.getElementById('host-poll-builder').style.display = 'block'; 
    document.getElementById('host-poll-active').style.display = 'none';
    
    if(typeof broadcastToAll === "function") broadcastToAll({ type: MSG_TYPE_POLL_NEW, poll: null });
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
    const res = document.getElementById('render-host-poll-results');
    if (res) res.innerHTML = html;
}

function renderVisitorPoll() {
    const panel = document.getElementById('visitor-poll-panel');
    const content = document.getElementById('render-poll-content');
    if(!panel || !content) return;
    
    if(!activePoll || !featureToggles.polls) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    
    const voted = activePoll.voters.includes(myFingerprint);
    const total = activePoll.options.reduce((s, o) => s + o.votes, 0);
    
    let html = `<div style="color:var(--main-cyan); margin-bottom:10px; font-weight:bold;">> ${activePoll.question}</div>`;
    activePoll.options.forEach((o, idx) => {
        const pct = total === 0 ? 0 : Math.round((o.votes / total) * 100);
        html += voted 
            ? `<div class="poll-option poll-locked"><span>${o.text} <span style="color:#aaa; font-size:0.8rem;">(${pct}%)</span></span><span style="color:var(--bright-magenta);">${o.votes}</span></div><div class="poll-bar" style="width:${pct}%;"></div>` 
            : `<div class="poll-option" onclick="submitVote(${idx})"><span>> ${o.text}</span><span style="font-size:0.8rem; color:#555;">[ VOTE ]</span></div>`;
    });
    content.innerHTML = html;
}

function submitVote(idx) {
    if(!activePoll || !activeConn || activePoll.voters.includes(myFingerprint)) return;
    activePoll.voters.push(myFingerprint); 
    activeConn.send({ type: MSG_TYPE_POLL_VOTE, voterId: myFingerprint, optionIndex: idx });
    renderVisitorPoll();
}

function triggerSound(soundId, isLocalClick = true, originalSender = null, customUrl = null) {
    let src = (soundId === 'custom' && customUrl) ? customUrl : SOUND_ASSETS[soundId];
    if (src) { let a = new Audio(src); a.volume = globalVolume; a.play().catch(e => {}); }
    
    if (isLocalClick && typeof MSG_TYPE_SOUNDBOARD !== 'undefined') {
        const p = { type: MSG_TYPE_SOUNDBOARD, soundId: soundId, sender: (peer ? peer.id : 'unknown'), customUrl: customUrl };
        if (currentRole === 'HOST' && typeof broadcastToAll === "function") { 
            broadcastToAll(p); 
        } else if (currentRole === 'VISITOR' && activeConn) { 
            activeConn.send(p); 
        }
    } else if (currentRole === 'HOST' && peer) {
        for (let id in peer.connections) { 
            if (id !== originalSender) { 
                peer.connections[id].forEach(c => { 
                    if(c.open && typeof c.send === 'function') c.send({ type: MSG_TYPE_SOUNDBOARD, soundId: soundId, sender: originalSender, customUrl: customUrl }); 
                }); 
            } 
        }
    }
}

function toggleManual() {
    const modal = document.getElementById('system-manual-modal');
    const target = document.getElementById('manual-render-target');
    if (!modal || !target) return;
    
    if (target.innerHTML === "") {
        target.innerHTML = MANUAL_DATABASE.map(sec => `<div class="manual-section"><h3 class="manual-h3">${sec.h3}</h3><p class="manual-text">${sec.p}</p></div>`).join('');
    }
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

//---------------------------------------------------------
// 07. PROFILE VISUALS (TOP 8 / FAVOURITE PLACES, GALLERY & AUDIO)
//---------------------------------------------------------
function buildVisitorTop8Grid(str) {
    const grid = document.getElementById('render-top8-grid'); 
    const panel = document.getElementById('visitor-top8-panel');
    if(!grid || !panel) return;
    
    grid.innerHTML = '';
    
    // SAFETY: Convert old arrays to strings, ignore nulls
    if (Array.isArray(str)) { str = str.join('\n'); }
    if (typeof str !== 'string') { str = ''; }
    
    if (!str || str.trim() === '') { panel.style.display = 'none'; return; }
    
    // Parse the lines as Node IDs
    const nodes = str.split('\n').map(n => n.trim()).filter(n => n.length > 0);
    nodes.forEach(n => { 
        grid.innerHTML += `<div class="top8-item" onclick="jumpToNewNode('${n}')" style="cursor:pointer; border:1px solid var(--main-cyan); padding:10px; margin:5px; display:inline-block; text-align:center; box-shadow: 0 0 5px rgba(0,255,255,0.2);">
            📡<br><b style="font-size:0.75rem; word-break:break-all;">${n.toUpperCase()}</b>
        </div>`; 
    });
    panel.style.display = featureToggles.top8 ? 'block' : 'none';
}
function jumpToNewNode(id) { 
    const fInput = document.getElementById('friend-id');
    if(fInput) fInput.value = id; 
    if(typeof disconnectNode === "function") disconnectNode(); 
    if(typeof visitFriend === "function") visitFriend(); 
}

function buildVisitorGallery(str) {
    const grid = document.getElementById('render-gallery-grid');
    const panel = document.getElementById('visitor-gallery-panel'); 
    if(!grid || !panel) return;
    
    grid.innerHTML = '';
    
    // SAFETY: Convert old arrays to strings, ignore nulls
    if (Array.isArray(str)) { str = str.join('\n'); }
    if (typeof str !== 'string') { str = ''; }
    
    if(!str || str.trim() === '') { panel.style.display = 'none'; return; }
    
    const urls = str.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    urls.forEach(u => { 
        let finalUrl = u;
        let gId = extractGiphyId(u); 
        if(gId) finalUrl = `https://media.giphy.com/media/${gId}/giphy.gif`;
        grid.innerHTML += `<div class="gallery-frame" onclick="window.open('${finalUrl}', '_blank')"><img src="${finalUrl}"></div>`; 
    });
    panel.style.display = featureToggles.gallery ? 'block' : 'none';
}

//---------------------------------------------------------
// 08. SYNCHRONIZED CANVAS & TACTICAL MAP ENGINE
//---------------------------------------------------------
function toggleCanvas() {
    const panel = document.getElementById('shared-canvas-panel');
    if(panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
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
    e.preventDefault(); 
    
    const coords = getCanvasCoordinates(e);
    const colorInput = document.getElementById('brush-color');
    const sizeInput = document.getElementById('brush-size');
    
    const color = colorInput ? colorInput.value : '#00ffff';
    const size = sizeInput ? sizeInput.value : 3;
    
    executeDraw(lastX, lastY, coords.x, coords.y, color, size);
    
    if (typeof MSG_TYPE_DRAWING !== 'undefined') {
        const packet = { type: MSG_TYPE_DRAWING, x0: lastX, y0: lastY, x1: coords.x, y1: coords.y, color: color, size: size };
        if (currentRole === 'HOST' && typeof broadcastToAll === "function") broadcastToAll(packet);
        else if (currentRole === 'VISITOR' && activeConn) activeConn.send(packet);
    }
    
    lastX = coords.x;
    lastY = coords.y;
}

function stopDrawing() { isDrawing = false; }

function executeDraw(x0, y0, x1, y1, color, size) {
    if (!ctx) return;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round';
    ctx.stroke(); ctx.closePath();
}

function wipeCanvas(isLocalClick = false) {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (isLocalClick && typeof MSG_TYPE_CANVAS_WIPE !== 'undefined') {
        const packet = { type: MSG_TYPE_CANVAS_WIPE };
        if (currentRole === 'HOST' && typeof broadcastToAll === "function") broadcastToAll(packet);
        else if (currentRole === 'VISITOR' && activeConn) activeConn.send(packet);
    }
}

function handleMapUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const MAX_WIDTH = 1000; 
            let newWidth = img.width; 
            let newHeight = img.height;
            if (img.width > MAX_WIDTH) { 
                const scaleSize = MAX_WIDTH / img.width; 
                newWidth = MAX_WIDTH; 
                newHeight = img.height * scaleSize; 
            }
            const tmpCanvas = document.createElement('canvas'); 
            tmpCanvas.width = newWidth; 
            tmpCanvas.height = newHeight;
            const tCtx = tmpCanvas.getContext('2d'); 
            tCtx.drawImage(img, 0, 0, newWidth, newHeight);
            
            const base64Str = tmpCanvas.toDataURL('image/jpeg', 0.6);
            applyTacticalMap(base64Str);
            
            if (typeof MSG_TYPE_CANVAS_BG !== 'undefined') {
                const packet = { type: MSG_TYPE_CANVAS_BG, bgData: base64Str };
                if (currentRole === 'HOST' && typeof broadcastToAll === "function") broadcastToAll(packet);
                else if (currentRole === 'VISITOR' && activeConn) activeConn.send(packet);
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = ''; 
}

function applyTacticalMap(base64Str) {
    const canvasEl = document.getElementById('sync-canvas');
    if(canvasEl) {
        if(base64Str) canvasEl.style.backgroundImage = `url('${base64Str}')`;
        else canvasEl.style.backgroundImage = 'none';
    }
}

function clearTacticalMap(isLocalClick = false) {
    applyTacticalMap(null);
    if(isLocalClick && typeof MSG_TYPE_CANVAS_BG !== 'undefined') {
        const packet = { type: MSG_TYPE_CANVAS_BG, bgData: null };
        if (currentRole === 'HOST' && typeof broadcastToAll === "function") broadcastToAll(packet);
        else if (currentRole === 'VISITOR' && activeConn) activeConn.send(packet);
    }
}

if (canvas) {
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);
}
//---------------------------------------------------------
// 09. UI TOGGLES & BACKGROUND SYNC
//---------------------------------------------------------

// 1. The Collapsible Drawer Logic
window.toggleHostSettings = function() {
    const wrapper = document.getElementById('host-settings-wrapper');
    const btn = document.getElementById('btn-toggle-settings');
    
    if (!wrapper || !btn) return;

    if (wrapper.style.display === 'none' || wrapper.style.display === '') {
        wrapper.style.display = 'block';
        btn.innerText = '[ - COLLAPSE NODE SETTINGS ]';
        btn.style.color = "#000";
        btn.style.backgroundColor = "var(--main-cyan)";
        btn.style.borderColor = "var(--main-cyan)";
    } else {
        wrapper.style.display = 'none';
        btn.innerText = '[ + EXPAND NODE SETTINGS ]';
        btn.style.color = "#aaa";
        btn.style.backgroundColor = "transparent";
        btn.style.borderColor = "#555";
    }
};

// 2. The Giphy Profile Bug Fix
// This listens for you changing the Memory Slot and updates the background instantly 
// without us having to find or edit the switchProfile() function!
document.getElementById('profile-slot')?.addEventListener('change', () => {
    setTimeout(() => {
        const newBgUrl = document.getElementById('my-bg-url');
        if (newBgUrl && typeof applyBackground === "function") {
            applyBackground(newBgUrl.value);
        }
    }, 100); // 100ms delay lets switchProfile finish loading the text first
});
//---------------------------------------------------------
// 10. GLOBAL BACKGROUND CYCLE ENGINE
//---------------------------------------------------------
let bgCycleTimer = null;
let bgCycleIndex = 0;
let isBgCycling = false;

window.toggleBgCycle = function() {
    const btn = document.getElementById('btn-cycle-bg');
    
    // If the cycle is currently running, stop it
    if (isBgCycling) {
        clearInterval(bgCycleTimer);
        isBgCycling = false;
        if (btn) {
            btn.innerText = '[ CYCLE_BG ]';
            btn.style.color = "var(--main-cyan)";
            btn.style.borderColor = "var(--main-cyan)";
        }
        return;
    }

    const galleryInput = document.getElementById('my-gallery');
    if (!galleryInput || !galleryInput.value.trim()) {
        alert("[ SYSTEM_ERROR ] Media Gallery is empty. Please add URLs to cycle.");
        return;
    }

    let urls = galleryInput.value.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    if (urls.length === 0) return;

    // Start the cycle!
    isBgCycling = true;
    if (btn) {
        btn.innerText = '[ STOP_CYCLE ]';
        btn.style.color = "var(--alert-red)";
        btn.style.borderColor = "var(--alert-red)";
    }

    // SMART START: Find out what image is currently on the screen
    const currentBg = document.getElementById('my-bg-url').value.trim();
    bgCycleIndex = urls.indexOf(currentBg);
    
    // Instantly push to the NEXT image in the list
    bgCycleIndex = (bgCycleIndex + 1) % urls.length;
    window.triggerBgUpdate(urls[bgCycleIndex]);

    // Loop the background every 15 seconds
    bgCycleTimer = setInterval(() => {
        urls = galleryInput.value.split('\n').map(u => u.trim()).filter(u => u.length > 0);
        if(urls.length === 0) { window.toggleBgCycle(); return; }

        bgCycleIndex = (bgCycleIndex + 1) % urls.length;
        window.triggerBgUpdate(urls[bgCycleIndex]);
    }, 15000); 
};

window.triggerBgUpdate = function(url) {
    const bgInput = document.getElementById('my-bg-url');
    if (bgInput) bgInput.value = url;
    
    if (typeof applyBackground === 'function') applyBackground(url);

    if (typeof currentRole !== 'undefined' && currentRole === 'HOST' && typeof broadcastToAll === 'function') {
        broadcastToAll({ type: 'LIVE_BG_UPDATE', bgUrl: url });
    }
};
// --- AUTO-PAINT BACKGROUND ON BOOT ---
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const bgUrl = document.getElementById('my-bg-url');
        if (bgUrl && bgUrl.value && typeof applyBackground === 'function') {
            applyBackground(bgUrl.value);
        }
    }, 500); // 500ms delay ensures local storage finishes loading first
});
// --- AUTO-HEAL NETWORK PROTOCOL (VISIBILITY WAKE-UP) ---
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        console.log("[ SYSTEM ] Terminal focus restored. Checking network pulse...");
        
        // 1. Reconnect the main Peer signaling if it dropped
        if (typeof peer !== 'undefined' && peer !== null) {
            if (peer.disconnected && !peer.destroyed) {
                console.log("[ SYSTEM ] Network suspended. Forcing auto-reconnect...");
                peer.reconnect();
            }
        }

        // 2. Clear out any stuck typing indicators
        if (typeof showTypingIndicator === 'function') {
            activeTypers.clear();
            showTypingIndicator('', false);
        }
    }
});
