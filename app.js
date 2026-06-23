// === SYSTEM GLOBAL DATABASE ENGINE ===
let peer = null, activeConn = null, wallData = [], currentRole = null;
let top8 = JSON.parse(localStorage.getItem('nowspace_top8')) || [];
let bannedFingerprints = JSON.parse(localStorage.getItem('nowspace_banned')) || [];
let peerFingerprintMap = {}; 
let globalVolume = 0.5, activePoll = null;

let featureToggles = { scanlines: true, soundboard: true, gallery: true, top8: true, usernames: true, voicecomms: true, polls: true };

let myFingerprint = localStorage.getItem('nowspace_identity_key') || ('TID-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36));
localStorage.setItem('nowspace_identity_key', myFingerprint);

let localStream = null, activeCalls = [], isMuted = false, isCamOn = false, currentNetworkPeers = [];

// NEW: FILE CHUNKING MEMORY BUFFER
let incomingFiles = {};

// PROTOCOL DEFINITIONS
const MSG_TYPE_PROFILE = 'PROFILE_INITIAL_LOAD', MSG_TYPE_WALL_POST = 'NEW_WALL_PACKET';
const MSG_TYPE_WALL_UPDATE = 'WALL_DATASTREAM_UPDATE', MSG_TYPE_SOUNDBOARD = 'SOUNDBOARD_PLAY'; 
const MSG_TYPE_FEATURE_UPDATE = 'FEATURE_TOGGLE_UPDATE', MSG_TYPE_POLL_NEW = 'POLL_NEW';
const MSG_TYPE_POLL_VOTE = 'POLL_VOTE', MSG_TYPE_POLL_UPDATE = 'POLL_UPDATE';
const MSG_TYPE_USER_LIST = 'ONLINE_USER_LIST';

const statusDisplay = document.getElementById('connection-status');
const globalDisconnectBtn = document.getElementById('global-disconnect-btn');

const SOUND_ASSETS = {
    'airhorn': 'https://www.myinstants.com/media/sounds/mlg-airhorn.mp3',
    'boom': 'https://www.myinstants.com/media/sounds/vine-boom.mp3',
    'bruh': 'https://www.myinstants.com/media/sounds/movie_1.mp3',
    'alert': 'https://www.myinstants.com/media/sounds/efecto-de-sonido-metal-gear-solid-sonido-de-alerta.mp3'
};

const MANUAL_DATABASE = [
    { h3: "WHAT IS NOWSPACE?", p: "NOWSPACE is a decentralized, peer-to-peer communication terminal. When you connect to a node, your data flows directly between your machine and the host. There are no central servers intercepting, storing, or monitoring your conversations." },
    { h3: "PRIVACY & LOCAL DATA USAGE", p: "<b>We do not use tracking cookies.</b> This terminal is built on a strictly necessary data model to protect your privacy. Small data preferences are saved entirely inside your local browser cache." },
    { h3: "HOW TO OPERATE: HOSTING", p: "Configure profile variables. Click INITIALIZE_NODE. Copy your generated Magic Link and pass it to peers to form explicit communication nodes." },
    { h3: "HOW TO OPERATE: VISITING", p: "Connect using an explicit hash pointer. Media structures matching raw image matrices, YouTube domains, or Giphy strings will auto-render straight down the wall pipeline." },
    { h3: "SLASH COMMAND PROTOCOLS", p: "Type these directly into the transmit bar:<br><b style='color:var(--main-cyan)'>/w [Alias] [Msg]</b> : Sends a secure whisper.<br><b style='color:var(--main-cyan)'>/clear</b> : Wipes your local screen.<br><b style='color:var(--main-cyan)'>/roll [sides]*[count]</b> : RNG generator (e.g. /roll 20*2).<br><b style='color:var(--main-cyan)'>/glitch [Msg]</b> : Applies visual distortion.<br><b style='color:var(--main-cyan)'>/vapor [Msg]</b> : ＦＵＬＬＷＩＤＴＨ text.<br><b style='color:#ff0055'>/burn [seconds] [Msg]</b> : Self-destructing packet.<br><b style='color:#0f0'>/tictactoe</b> : Spawns an interactive game board on the wall." }
];

// === WEBRTC GATEWAY CONFIGURATION ===
const peerConfig = {
    config: {
        'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: "stun:stun.relay.metered.ca:80" },
            {
                urls: "turn:global.relay.metered.ca:80",
                username: "a2c8cb5b5df48328de43a219",
                credential: "cn5bJg9evQNfOc/k"
            },
            {
                urls: "turns:global.relay.metered.ca:443",
                username: "a2c8cb5b5df48328de43a219",
                credential: "cn5bJg9evQNfOc/k"
            }
        ]
    }
};

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
}
document.getElementById('my-bg-url')?.addEventListener('input', (e) => applyBackground(e.target.value));

function broadcastToAll(packet) {
    if (currentRole !== 'HOST' || !peer) return;
    for (let id in peer.connections) {
        peer.connections[id].forEach(c => {
            if (c.open) c.send(packet);
        });
    }
}

function parseSlashCommand(text, senderName) {
    if (!text.startsWith('/')) return { text: text, burnSec: null, isGame: null };
    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();
    const payload = parts.slice(1).join(' ');

    if (cmd === '/clear') {
        wallData = []; renderWall(); return { text: null, burnSec: null, isGame: null };
    }
    
    if (cmd === '/roll') {
        let max = 100;
        let diceCount = 1;
        let hasPayload = false;

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

        max = Math.max(2, max);
        diceCount = Math.max(1, Math.min(diceCount, 50)); 

        let rollsHtml = [];
        let totalSum = 0;
        let nat20Count = 0;
        let nat1Count = 0;

        for (let i = 0; i < diceCount; i++) {
            let r = Math.floor(Math.random() * max) + 1;
            totalSum += r;
            
            if (max === 20 && r === 20) {
                nat20Count++;
                rollsHtml.push(`<b class="glitch-text" style="color:#0f0; font-size:1.3em; text-shadow: 0 0 8px #0f0;">20</b>`);
            } else if (max === 20 && r === 1) {
                nat1Count++;
                rollsHtml.push(`<b style="color:var(--alert-red); font-size:1.3em;">1</b>`);
            } else {
                rollsHtml.push(r);
            }
        }

        let resultText = '';
        if (!hasPayload) {
            resultText = `a ${totalSum} (1-100)`;
        } else if (diceCount > 1) {
            resultText = `d${max} * ${diceCount} ➔ [ ${rollsHtml.join(', ')} ] = <b style="color:#fff;">${totalSum}</b>`;
        } else {
            resultText = `a d${max} ➔ ${rollsHtml[0]}`;
        }

        let extraFlair = '';
        if (nat20Count > 0) {
            let multiMultiplier = nat20Count > 1 ? ` (x${nat20Count})` : '';
            extraFlair = `<div class="glitch-text" style="color:#0f0; margin-top:8px; font-size:1.1rem; font-weight:bold; letter-spacing:1px; border-left: 3px solid #0f0; padding-left: 8px;">[ 🌟 CRITICAL OVERLOAD // NAT 20 DETECTED${multiMultiplier} 🌟 ]</div>`;
        } else if (nat1Count > 0 && diceCount === 1) {
            extraFlair = `<div style="color:var(--alert-red); margin-top:8px; font-weight:bold; letter-spacing:1px; border-left: 3px solid var(--alert-red); padding-left: 8px;">[ 💀 CRITICAL FAILURE // SYSTEM ERROR ]</div>`;
        }

        return { text: `<span style="color:#ffaa00;">[ 🎲 SYSTEM: ${senderName} rolled ${resultText} ]</span>${extraFlair}`, burnSec: null, isGame: null };
    }
    
    if (cmd === '/glitch') {
        return { text: `<span class="glitch-text" style="display:inline-block;">${payload}</span>`, burnSec: null, isGame: null };
    }
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
    if (cmd === '/tictactoe') {
        return { text: '<b style="color:#0f0;">[ SYSTEM: INITIALIZING GRID_WARS.EXE ]</b>', burnSec: null, isGame: 'tictactoe' };
    }
    return { text: text, burnSec: null, isGame: null };
}

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

function getVidContainer() {
    return currentRole === 'HOST' 
        ? document.getElementById('host-video-stream-container') 
        : document.getElementById('visitor-video-stream-container');
}

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
        document.querySelectorAll('.mute-btn').forEach(b => b.style.display = 'none');
        document.querySelectorAll('.cam-btn').forEach(b => b.style.display = 'none');
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

function updateMasterVolume(val) { globalVolume = parseFloat(val); document.querySelectorAll('.vol-slider-wrap input[type="range"]').forEach(i => i.value = val); }

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
    if (localStream && localStream.getVideoTracks().length > 0) {
        isCamOn = !isCamOn;
        localStream.getVideoTracks()[0].enabled = isCamOn;
        document.querySelectorAll('.cam-btn').forEach(b => {
            b.innerText = isCamOn ? "[ 📷 CAM: ON ]" : "[ 📷 CAM: OFF ]";
            b.classList.toggle('btn-alert', !isCamOn);
        });
    }
}

function updateVoiceTogglesVisuals(isLive) {
    document.querySelectorAll('.voice-switch-container').forEach(sw => {
        sw.classList.toggle('active', isLive); sw.querySelector('.voice-switch-label').innerText = isLive ? "COMMS: LIVE" : "COMMS: OFF";
    });
}

async function toggleVoice() {
    if (activeCalls.length > 0 || localStream) {
        activeCalls.forEach(c => c.close()); activeCalls = [];
        if(localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
        updateVoiceTogglesVisuals(false); 
        document.querySelectorAll('.mute-btn').forEach(b => b.style.display = 'none'); 
        document.querySelectorAll('.cam-btn').forEach(b => b.style.display = 'none');
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
        localStream.getVideoTracks().forEach(t => t.enabled = false);

        document.querySelectorAll('.mute-btn').forEach(b => { b.style.display = 'inline-block'; b.innerText = "[ 🔊 MUTE ]"; b.classList.remove('btn-alert'); });
        document.querySelectorAll('.cam-btn').forEach(b => { b.style.display = 'inline-block'; b.innerText = "[ 📷 CAM: OFF ]"; b.classList.add('btn-alert'); });

        let localVid = document.createElement('video');
        localVid.srcObject = localStream;
        localVid.autoplay = true;
        localVid.muted = true;
        localVid.classList.add('video-feed', 'local-video');
        localVid.id = 'local-video-node';
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
            v.playsInline = true;
            v.id = 'video-node-' + call.peer;
            v.classList.add('video-feed');
            getVidContainer().appendChild(v);
        }
        v.srcObject = remote;
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

function toggleManual() {
    const modal = document.getElementById('system-manual-modal');
    const target = document.getElementById('manual-render-target');
    if (target.innerHTML === "") {
        target.innerHTML = MANUAL_DATABASE.map(sec => `<div class="manual-section"><h3 class="manual-h3">${sec.h3}</h3><p class="manual-text">${sec.p}</p></div>`).join('');
    }
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

function exportTheme() {
    const data = { 
        alias: document.getElementById('my-alias').value, 
        customId: document.getElementById('my-custom-id').value, 
        bio: document.getElementById('my-bio').value, 
        audio: document.getElementById('my-audio').value, 
        gallery: document.getElementById('my-gallery').value, 
        css: document.getElementById('my-css').value, 
        customSound: document.getElementById('my-custom-sound').value, 
        bgUrl: document.getElementById('my-bg-url').value, 
        features: featureToggles, 
        identityFingerprint: myFingerprint 
    };
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); 
    link.href = url;
    link.download = `nowspace_theme_${data.alias.toLowerCase().replace(/\s+/g, '_')}.json`; 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function importTheme(event) {
    const file = event.target.files[0]; if (!file) return; const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const p = JSON.parse(e.target.result);
            if(p.alias) document.getElementById('my-alias').value = p.alias;
            if(p.bio) document.getElementById('my-bio').value = p.bio;
            if(p.bgUrl !== undefined) { document.getElementById('my-bg-url').value = p.bgUrl; applyBackground(p.bgUrl); }
            if(p.css) { document.getElementById('my-css').value = p.css; document.getElementById('custom-injected-css').innerText = p.css; }
            if(p.features) { featureToggles = p.features; applyFeatures(featureToggles); }
            saveLocalData(); alert("SUCCESS.");
        } catch (err) { alert("FAIL."); }
    }; reader.readAsText(file);
}

function buildVisitorTop8Grid(arr) {
    const grid = document.getElementById('render-top8-grid'); grid.innerHTML = '';
    if (!arr || arr.length === 0) { document.getElementById('visitor-top8-panel').style.display = 'none'; return; }
    arr.forEach(id => { grid.innerHTML += `<div class="top8-item" onclick="jumpToNewNode('${id}')">🌐<br><b>${id.toUpperCase()}</b></div>`; });
    document.getElementById('visitor-top8-panel').style.display = featureToggles.top8 ? 'block' : 'none';
}
function jumpToNewNode(id) { document.getElementById('friend-id').value = id; disconnectNode(); visitFriend(); }

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

// Updated Wall formatter to ignore our new chunking tags
function formatWallMessage(text) {
    if(text.includes("[ CONSENSUS ARCHIVED ]") || text.includes("BURNER PACKET") || text.includes("INITIALIZING GRID_WARS") || text.includes("CRITICAL OVERLOAD") || text.includes("P2P_TRANSFER") || text.includes("progress-bar")) return text;
    if(text.includes("<img src=\"data:image")) return text; 
    return text.replace(/(https?:\/\/[^\s]+)/gi, (url) => {
        let ytId = extractYouTubeId(url); if (ytId) return `<br><iframe width="250" height="140" src="https://www.youtube-nocookie.com/embed/${ytId}" frameborder="0" allowfullscreen style="border: 1px solid var(--main-cyan); margin-top:5px; box-shadow: var(--text-glow);"></iframe><br>`;
        let gId = extractGiphyId(url); if (gId) return `<img src="https://media.giphy.com/media/${gId}/giphy.gif" />`;
        return url.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? `<img src="${url}" />` : `<a href="${url}" target="_blank">${url}</a>`;
    });
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

function disconnectNode() {
    if (activeCalls.length > 0) activeCalls.forEach(c => c.close()); activeCalls = [];
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (peer) peer.destroy(); peer = null; activeConn = null; currentRole = null; activePoll = null;
    document.getElementById('visitor-view').style.display = 'none'; document.getElementById('host-live-wall-panel').style.display = 'none';
    document.getElementById('host-setup-panel').style.display = 'block'; document.getElementById('visitor-connect-panel').style.display = 'block';
    document.getElementById('btn-go-online').disabled = false; document.getElementById('my-id-display').style.display = 'none';
    globalDisconnectBtn.style.display = 'none'; 
    updateVoiceTogglesVisuals(false); 
    document.querySelectorAll('.mute-btn').forEach(b => b.style.display = 'none');
    document.querySelectorAll('.cam-btn').forEach(b => b.style.display = 'none');
    document.getElementById('host-video-stream-container').innerHTML = '';
    document.getElementById('visitor-video-stream-container').innerHTML = '';
    statusDisplay.innerText = "[ STATUS: OFFLINE ]"; window.history.pushState({}, document.title, window.location.pathname);
}

function startHosting() {
    currentRole = 'HOST'; document.getElementById('btn-go-online').disabled = true; saveLocalData();
    const customId = document.getElementById('my-custom-id').value.trim().replace(/\s+/g, '-');
    peer = customId ? new Peer(customId, peerConfig) : new Peer(peerConfig); setupPeerCallListener(); 
    peer.on('open', (id) => {
        statusDisplay.innerText = "[ STATUS: NODE_ACTIVE ]"; globalDisconnectBtn.style.display = 'block';
        document.getElementById('my-id').innerText = id; document.getElementById('my-id-display').style.display = 'block';
        document.getElementById('host-live-wall-panel').style.display = 'block'; 
        document.getElementById('visitor-connect-panel').style.display = 'none';
        renderWall(); renderActivePeers(); renderBannedPeers();
        document.getElementById('magic-link-container').innerHTML = `<div style="margin-top:15px; display:flex; gap:10px;"><input type="text" id="magic-link-input" value="${window.location.href.split('?')[0]}?node=${id}" readonly style="border-color:#0f0; color:#0f0; margin-bottom:0;"><button onclick="copyMagicLink()" style="border-color:#0f0; color:#0f0; margin-bottom:0;">COPY</button></div>`;
    });
    peer.on('connection', (c) => {
        c.on('data', (data) => handleIncomingP2PPacket(data, c));
        c.on('close', () => { renderActivePeers(); broadcastOnlineUsers(); });
    });
}

function visitFriend() {
    currentRole = 'VISITOR'; const fId = document.getElementById('friend-id').value.trim(); if (!fId) return;
    document.getElementById('host-setup-panel').style.display = 'none'; 
    document.getElementById('visitor-connect-panel').style.display = 'none';
    document.getElementById('host-live-wall-panel').style.display = 'none';
    document.getElementById('visitor-view').style.display = 'block'; 
    statusDisplay.innerText = "[ STATUS: WAITING_FOR_DIAL_TONE... ]"; globalDisconnectBtn.style.display = 'block';
    if (!peer) { peer = new Peer(peerConfig); setupPeerCallListener(); peer.on('open', () => { executeConnection(fId); }); } else { executeConnection(fId); }
}

function executeConnection(fId) {
    activeConn = peer.connect(fId, { reliable: true });
    activeConn.on('data', (data) => handleIncomingP2PPacket(data, activeConn)); 
    activeConn.on('close', () => { disconnectNode(); });
    
    activeConn.on('open', () => { 
        statusDisplay.innerText = "[ STATUS: AUTHENTICATING... ]"; 
        const visitorPwd = document.getElementById('visitor-password') ? document.getElementById('visitor-password').value : '';
        const visitorAlias = document.getElementById('visitor-alias-input') ? document.getElementById('visitor-alias-input').value : '';
        activeConn.send({ type: 'VISITOR_HANDSHAKE', fingerprint: myFingerprint, alias: visitorAlias || 'Unknown', password: visitorPwd });
    });
}

function handleIncomingP2PPacket(p, conn) {
    const senderId = conn.peer;
    switch(p.type) {
        case 'VISITOR_HANDSHAKE':
            if (currentRole === 'HOST') {
                const hostPwd = document.getElementById('my-password').value;
                if (hostPwd && p.password !== hostPwd) {
                    conn.send({type: 'AUTH_FAILED'}); setTimeout(() => conn.close(), 500); return;
                }
                if (bannedFingerprints.includes(p.fingerprint)) {
                    conn.send({type: 'BANNED'}); setTimeout(() => conn.close(), 500); return;
                }
                
                peerFingerprintMap[senderId] = { fingerprint: p.fingerprint, alias: p.alias };
                renderActivePeers(); broadcastOnlineUsers();
                conn.send({ type: MSG_TYPE_PROFILE, alias: document.getElementById('my-alias').value, bio: document.getElementById('my-bio').value, css: document.getElementById('my-css').value, audio: document.getElementById('my-audio').value, gallery: document.getElementById('my-gallery').value, top8: top8, currentWall: wallData, features: featureToggles, hostFingerprint: myFingerprint, activePoll: activePoll, bgUrl: document.getElementById('my-bg-url').value });
                
                if (localStream) {
                    let call = peer.call(senderId, localStream);
                    activeCalls.push(call);
                    handleCallEvent(call);
                }
            } break;
        
        case 'AUTH_FAILED':
            alert("ACCESS DENIED: INCORRECT NODE PASSWORD.");
            disconnectNode(); document.getElementById('render-profile-header').innerHTML = "<h2 style='color:var(--alert-red);'>[ 401 // UNAUTHORIZED_ACCESS ]</h2>"; break;
            
        case MSG_TYPE_PROFILE:
            statusDisplay.innerText = "[ STATUS: SECURE LINK ESTABLISHED ]"; 
            document.getElementById('render-alias').innerText = p.alias; document.getElementById('datarender-bio').innerText = p.bio;
            if(p.bgUrl) applyBackground(p.bgUrl);
            if(p.css) document.getElementById('custom-injected-css').innerText = p.css;
            if(p.audio) document.getElementById('audio-container').innerHTML = renderAudioEmbed(p.audio);
            featureToggles = p.features || featureToggles; activePoll = p.activePoll || null;
            applyFeatures(featureToggles); buildVisitorGallery(p.gallery); buildVisitorTop8Grid(p.top8); wallData = p.currentWall; renderWall(); break;
        
        case MSG_TYPE_USER_LIST:
            if (currentRole === 'VISITOR') {
                const newPeers = p.users.map(u => u.id).filter(id => id !== peer.id);
                if (localStream) {
                    newPeers.forEach(newPeerId => {
                        if (!currentNetworkPeers.includes(newPeerId)) {
                            let call = peer.call(newPeerId, localStream);
                            activeCalls.push(call);
                            handleCallEvent(call);
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
                wallData.push({ sender: p.senderAlias, text: p.text, isLocalWhisper: true, timestamp: new Date().toLocaleTimeString() });
                renderWall();
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
                saveLocalData(); renderWall(); 
                broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData }); 
            } break;
            
        case MSG_TYPE_WALL_UPDATE:
            if (currentRole === 'VISITOR') { 
                const localWhispers = wallData.filter(m => m.isLocalWhisper);
                wallData = p.updatedWall; 
                if (localWhispers.length > 0) wallData.push(...localWhispers); 
                renderWall(); 
            } break;
            
        // === RECEIVING FILE CHUNKS (MESH ROUTER) ===
        case 'FILE_START':
            incomingFiles[p.id] = { chunks: [], received: 0, total: p.size, name: p.name, type: p.fileType };
            // Host acts as router, forwards chunking metadata to everyone else
            if (currentRole === 'HOST') {
                broadcastToAll(p); 
                wallData.push({ sender: p.senderAlias, text: `<div id="file-${p.id}" style="border: 1px dashed var(--main-cyan); padding: 10px; margin-top: 5px; background: rgba(0,255,255,0.05); display: inline-block;"><span style="color:var(--main-cyan);">[ ⚠️ INCOMING DATA ]</span><br><b style="color:#fff;">${p.name}</b><br><div style="width:150px; height:10px; background:#333; margin-top:5px;"><div id="bar-${p.id}" style="width:0%; height:100%; background:var(--main-cyan);"></div></div><span id="pct-${p.id}" style="font-size:0.8rem; color:#aaa;">0%</span></div>`, isPrivate: false, timestamp: new Date().toLocaleTimeString() });
                renderWall();
            }
            break;
            
        case 'FILE_CHUNK':
            if (incomingFiles[p.id]) {
                incomingFiles[p.id].chunks.push(p.data);
                incomingFiles[p.id].received += p.data.byteLength;
                let pct = Math.floor((incomingFiles[p.id].received / incomingFiles[p.id].total) * 100);
                
                // Update local UI
                let bar = document.getElementById(`bar-${p.id}`);
                let txt = document.getElementById(`pct-${p.id}`);
                if(bar) bar.style.width = pct + '%';
                if(txt) txt.innerText = pct + '%';

                // Host forwards the binary array chunk to the room
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

                // If host, update the master wall array so new joiners get the download link too
                if (currentRole === 'HOST') {
                    let entry = wallData.find(w => w.text.includes(`id="file-${p.id}"`));
                    if (entry) entry.text = fileUI.outerHTML;
                    saveLocalData();
                    broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
                    broadcastToAll(p); // Send FILE_END signal
                }
                
                delete incomingFiles[p.id]; // Free RAM
            }
            break;

        case MSG_TYPE_SOUNDBOARD: triggerSound(p.soundId, false, p.sender, p.customUrl); break;
        case MSG_TYPE_FEATURE_UPDATE: if (currentRole === 'VISITOR') { featureToggles = p.features; applyFeatures(featureToggles); } break;
        case MSG_TYPE_POLL_NEW:
        case MSG_TYPE_POLL_UPDATE: if (currentRole === 'VISITOR') { activePoll = p.poll; renderVisitorPoll(); } break;
        case MSG_TYPE_POLL_VOTE:
            if (currentRole === 'HOST' && activePoll && !activePoll.voters.includes(p.voterId)) { activePoll.voters.push(p.voterId); activePoll.options[p.optionIndex].votes++; renderHostPoll(); broadcastToAll({ type: MSG_TYPE_POLL_UPDATE, poll: activePoll }); } break;
        case 'BANNED':
            alert("ACCESS DENIED: THE HOST HAS PERMANENTLY BANISHED YOU FROM THIS NODE.");
            disconnectNode(); document.getElementById('render-profile-header').innerHTML = "<h2 style='color:var(--alert-red);'>[ 403 // BANNED_FROM_NODE ]</h2>"; break;
    }
}

function visitorSendWallPacket() {
    const input = document.getElementById('wall-input-buffer');
    const priv = document.getElementById('private-packet-toggle');
    const alias = document.getElementById('visitor-alias-input').value.trim();
    if (!input.value || !activeConn) return;
    
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
            renderWall();
            input.value = ''; return;
        }
    }

    const parsed = parseSlashCommand(rawText, name);
    if (parsed.text === null) {
        input.value = ''; priv.checked = false; return;
    }

    activeConn.send({ type: MSG_TYPE_WALL_POST, text: parsed.text, isPrivate: priv.checked, sender: name, fingerprint: myFingerprint, burnSec: parsed.burnSec, isGame: parsed.isGame });
    input.value = ''; priv.checked = false;
}

function hostSendWallPacket() {
    const input = document.getElementById('host-wall-input'); 
    if (!input.value) return;
    
    const rawText = input.value.trim();
    const alias = document.getElementById('my-alias').value.trim() || "[HOST]";
    
    const parsed = parseSlashCommand(rawText, alias);
    if (parsed.text === null) {
        input.value = ''; return;
    }

    const packet = { 
        sender: alias, 
        text: parsed.text, 
        isPrivate: false, 
        timestamp: new Date().toLocaleTimeString(),
        burnAt: parsed.burnSec ? Date.now() + (parsed.burnSec * 1000) : null,
        isGame: parsed.isGame,
        gameId: parsed.isGame ? Date.now().toString() : null,
        board: parsed.isGame ? Array(9).fill(null) : null,
        turn: parsed.isGame ? 'X' : null,
        winner: null,
        players: parsed.isGame ? { X: null, O: null } : null
    };

    wallData.push(packet);
    saveLocalData(); renderWall(); 
    broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
    input.value = '';
}

function hostClearWall() {
    if(confirm("DANGER: This will permanently wipe the chat history for you and all connected visitors. Proceed?")) {
        wallData = []; 
        saveLocalData(); renderWall();
        broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
    }
}

function sendGameMove(gameId, cellIndex) {
    let alias = document.getElementById('visitor-alias-input') ? document.getElementById('visitor-alias-input').value.trim() : document.getElementById('my-alias').value.trim();
    if(!alias && peer) alias = peer.id.substring(0,6);
    
    if (currentRole === 'HOST') {
        processGameMove({ gameId: gameId, cellIndex: cellIndex, fingerprint: myFingerprint, senderAlias: alias });
    } else if (currentRole === 'VISITOR' && activeConn) {
        activeConn.send({ type: 'GAME_MOVE', gameId: gameId, cellIndex: cellIndex, fingerprint: myFingerprint, senderAlias: alias });
    }
}

function processGameMove(p) {
    let game = wallData.find(m => m.gameId === p.gameId);
    if (game && !game.winner && !game.board[p.cellIndex]) {
        if (!game.players[game.turn]) {
            game.players[game.turn] = { fp: p.fingerprint, alias: p.senderAlias };
        }
        
        if (game.players[game.turn].fp === p.fingerprint) {
            game.board[p.cellIndex] = game.turn;
            checkGameWinner(game);
            game.turn = game.turn === 'X' ? 'O' : 'X';
            
            saveLocalData(); renderWall();
            broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
        }
    }
}

function checkGameWinner(game) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (let line of lines) {
        const [a,b,c] = line;
        if (game.board[a] && game.board[a] === game.board[b] && game.board[a] === game.board[c]) {
            const winnerAlias = game.players[game.board[a]] ? game.players[game.board[a]].alias : "PLAYER " + game.board[a];
            game.winner = winnerAlias.toUpperCase() + " WINS";
            return;
        }
    }
    if (!game.board.includes(null)) game.winner = 'DRAW // STALEMATE';
}

setInterval(() => {
    if (wallData.length === 0) return;
    let changed = false; const now = Date.now();
    wallData = wallData.filter(p => {
        if (p.burnAt && now >= p.burnAt) { changed = true; return false; }
        return true;
    });
    if (changed) {
        renderWall();
        if (currentRole === 'HOST' && peer) { saveLocalData(); broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData }); }
    }
}, 1000);

function saveLocalData() {
    if (currentRole !== 'HOST') return;
    localStorage.setItem('nowspace_save', JSON.stringify({ alias: document.getElementById('my-alias').value, customId: document.getElementById('my-custom-id').value, bio: document.getElementById('my-bio').value, audio: document.getElementById('my-audio').value, gallery: document.getElementById('my-gallery').value, css: document.getElementById('my-css').value, customSound: document.getElementById('my-custom-sound').value, bgUrl: document.getElementById('my-bg-url').value, wall: wallData, features: featureToggles, password: document.getElementById('my-password').value }));
}

function copyMagicLink() { const input = document.getElementById('magic-link-input'); input.select(); navigator.clipboard.writeText(input.value); }
function resetDefaultTemplate() { if(confirm("Purge node memory cache?")) { localStorage.clear(); window.location.reload(); } }

window.onload = () => {
    const saved = JSON.parse(localStorage.getItem('nowspace_save')), vAlias = localStorage.getItem('nowspace_visitor_alias');
    if (vAlias && document.getElementById('visitor-alias-input')) document.getElementById('visitor-alias-input').value = vAlias;
    if (saved) {
        document.getElementById('my-alias').value = saved.alias || 'NODE-ALPHA'; document.getElementById('my-custom-id').value = saved.customId || '';
        document.getElementById('my-bio').value = saved.bio || ''; document.getElementById('my-audio').value = saved.audio || '';
        document.getElementById('my-gallery').value = saved.gallery || ''; document.getElementById('my-css').value = saved.css || '';
        document.getElementById('my-custom-sound').value = saved.customSound || ''; wallData = saved.wall || []; featureToggles = saved.features || featureToggles;
        if (document.getElementById('my-bg-url')) document.getElementById('my-bg-url').value = saved.bgUrl || '';
        if (saved.password && document.getElementById('my-password')) document.getElementById('my-password').value = saved.password;
        applyBackground(saved.bgUrl || '');
        applyFeatures(featureToggles); renderWall();
    }
    document.getElementById('my-css').addEventListener('input', (e) => { document.getElementById('custom-injected-css').innerText = e.target.value; });
    const urlNode = new URLSearchParams(window.location.search).get('node'); 
    if (urlNode) { 
        document.getElementById('host-setup-panel').style.display = 'none';
        document.getElementById('friend-id').value = urlNode; 
        document.getElementById('visitor-password').focus(); 
    }
};
document.getElementById('wall-input-buffer')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') visitorSendWallPacket(); });
document.getElementById('host-wall-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') hostSendWallPacket(); });

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
        saveLocalData(); renderWall(); broadcastToAll({ type: MSG_TYPE_WALL_UPDATE, updatedWall: wallData });
    } else if (currentRole === 'VISITOR' && activeConn) {
        const priv = document.getElementById('private-packet-toggle');
        const alias = document.getElementById('visitor-alias-input').value.trim();
        let name = alias ? alias : peer.id.substring(0,6);
        activeConn.send({ type: MSG_TYPE_WALL_POST, text: imgTag, isPrivate: priv?.checked || false, sender: name, fingerprint: myFingerprint });
    }
    document.getElementById('hidden-file-input').value = '';
}

// === NEW: MASSIVE FILE CHUNKING TRANSFER ENGINE ===
function handleRawFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Clear input so you can send the same file twice if needed
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

    // Initialize local receiver so we see our own progress bar
    incomingFiles[transferId] = { chunks: [], received: 0, total: file.size, name: file.name, type: file.type };
    
    let uiHTML = `<div id="file-${transferId}" style="border: 1px dashed var(--main-cyan); padding: 10px; margin-top: 5px; background: rgba(0,255,255,0.05); display: inline-block;">
        <span style="color:var(--main-cyan);">[ ⚠️ TRANSMITTING DATA ]</span><br>
        <b style="color:#fff;">${file.name}</b><br>
        <div style="width:150px; height:10px; background:#333; margin-top:5px;"><div id="bar-${transferId}" style="width:0%; height:100%; background:var(--main-cyan);"></div></div>
        <span id="pct-${transferId}" style="font-size:0.8rem; color:#aaa;">0%</span>
    </div>`;

    if (currentRole === 'HOST') {
        wallData.push({ sender: alias, text: uiHTML, isPrivate: false, timestamp: new Date().toLocaleTimeString() });
        renderWall();
        broadcastToAll(startPacket);
    } else if (currentRole === 'VISITOR' && activeConn) {
        // Visitor just sends the command up to the host router
        activeConn.send(startPacket);
    }

    // Begin asynchronous chunking
    const chunkSize = 16 * 1024; // 16KB per chunk (Safe for WebRTC buffers)
    let offset = 0;

    function readNextChunk() {
        const slice = file.slice(offset, offset + chunkSize);
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const arrayBuffer = e.target.result;
            const chunkPacket = { type: 'FILE_CHUNK', id: transferId, data: arrayBuffer };
            
            // Route packet
            if (currentRole === 'HOST') broadcastToAll(chunkPacket);
            else if (currentRole === 'VISITOR' && activeConn) activeConn.send(chunkPacket);

            // Update local UI
            incomingFiles[transferId].chunks.push(arrayBuffer);
            incomingFiles[transferId].received += arrayBuffer.byteLength;
            let pct = Math.floor((incomingFiles[transferId].received / file.size) * 100);
            
            let bar = document.getElementById(`bar-${transferId}`);
            let txt = document.getElementById(`pct-${transferId}`);
            if(bar) bar.style.width = pct + '%';
            if(txt) txt.innerText = pct + '%';

            offset += chunkSize;
            if (offset < file.size) {
                // Short timeout prevents freezing the browser main thread!
                setTimeout(readNextChunk, 1); 
            } else {
                const endPacket = { type: 'FILE_END', id: transferId };
                if (currentRole === 'HOST') broadcastToAll(endPacket);
                else if (currentRole === 'VISITOR' && activeConn) activeConn.send(endPacket);
                
                // Finalize local file
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
    
    // Kick off the slice loop
    readNextChunk();
}
