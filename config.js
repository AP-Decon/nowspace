//---------------------------------------------------------
// 01. GLOBAL SYSTEM VARIABLES & STATE
//---------------------------------------------------------
let peer = null;
let activeConn = null;
let wallData = [];
let currentRole = null;

let activeSlot = localStorage.getItem('nowspace_active_slot') || '1';
let top8 = JSON.parse(localStorage.getItem('nowspace_top8')) || [];
let bannedFingerprints = JSON.parse(localStorage.getItem('nowspace_banned')) || [];
let peerFingerprintMap = {}; 
let globalVolume = 0.5;
let activePoll = null;

let featureToggles = { 
    scanlines: true, 
    soundboard: true, 
    gallery: true, 
    top8: true, 
    usernames: true, 
    voicecomms: true, 
    polls: true 
};

// Identity & Security
let myFingerprint = localStorage.getItem('nowspace_identity_key') || ('TID-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36));
localStorage.setItem('nowspace_identity_key', myFingerprint);
let currentHostEncryptedPwd = '';

// A/V Comms State
let localStream = null;
let activeCalls = [];
let isMuted = false;
let isCamOn = false;
let isScreenSharing = false;
let currentNetworkPeers = [];

// Hardware & Memory Buffers
let incomingFiles = {};
let radarEnabled = false;

//---------------------------------------------------------
// 02. CONSTANTS & DOM REFERENCES
//---------------------------------------------------------
const MSG_TYPE_PROFILE = 'PROFILE_INITIAL_LOAD';
const MSG_TYPE_WALL_POST = 'NEW_WALL_PACKET';
const MSG_TYPE_WALL_UPDATE = 'WALL_DATASTREAM_UPDATE';
const MSG_TYPE_SOUNDBOARD = 'SOUNDBOARD_PLAY'; 
const MSG_TYPE_FEATURE_UPDATE = 'FEATURE_TOGGLE_UPDATE';
const MSG_TYPE_POLL_NEW = 'POLL_NEW';
const MSG_TYPE_POLL_VOTE = 'POLL_VOTE';
const MSG_TYPE_POLL_UPDATE = 'POLL_UPDATE';
const MSG_TYPE_USER_LIST = 'ONLINE_USER_LIST';
const MSG_TYPE_DRAWING = 'SYNC_DRAWING'; 
const MSG_TYPE_CANVAS_WIPE = 'CANVAS_WIPE';
const MSG_TYPE_TYPING = 'TYPING_INDICATOR';
const MSG_TYPE_CANVAS_BG = 'CANVAS_BACKGROUND'; 

const statusDisplay = document.getElementById('connection-status');
const globalDisconnectBtn = document.getElementById('global-disconnect-btn');

const SOUND_ASSETS = {
    'airhorn': 'https://www.myinstants.com/media/sounds/mlg-airhorn.mp3',
    'boom': 'https://www.myinstants.com/media/sounds/vine-boom.mp3',
    'bruh': 'https://www.myinstants.com/media/sounds/movie_1.mp3',
    'alert': 'https://www.myinstants.com/media/sounds/efecto-de-sonido-metal-gear-solid-sonido-de-alerta.mp3'
};

const MANUAL_DATABASE = [
    { h3: "WHAT IS NOWSPACE?", p: "NOWSPACE is a decentralized, peer-to-peer communication terminal." },
    { h3: "PRIVACY & LOCAL DATA", p: "<b>We do not use tracking cookies.</b> This terminal is built on a strictly necessary data model." },
    { h3: "SLASH COMMAND PROTOCOLS", p: "Type these directly into the transmit bar:<br><b style='color:var(--main-cyan)'>/w [Alias] [Msg]</b> : Secure whisper.<br><b style='color:var(--main-cyan)'>/clear</b> : Wipes local screen.<br><b style='color:#ff0055'>/burn [sec] [Msg]</b> : Self-destructing packet.<br><b style='color:var(--main-cyan)'>/glitch [Msg]</b> : Applies visual distortion.<br><b style='color:var(--main-cyan)'>/vapor [Msg]</b> : ＦＵＬＬＷＩＤＴＨ text.<br><b style='color:#0f0'>/roll [sides]*[count]</b> : RNG generator.<br><b style='color:#0f0'>/8ball [Question]</b> : Consult the oracle." },
    { h3: "NETWORK GAMES", p: "Spawn interactive modules directly on the wall:<br><b style='color:#0f0'>/tictactoe</b> : Classic GRID_WARS.EXE.<br><b style='color:#0f0'>/connect4</b> : Advanced gravity mechanics.<br><b style='color:#0f0'>/rps [rock/paper/scissors]</b> : Initiates a blind, secure duel against the next peer to accept." }
];

const peerConfig = {
    config: {
        'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: "stun:stun.relay.metered.ca:80" },
            {
                urls: "turn:standard.relay.metered.ca:80",
                username: "",
                credential: ""
            },
            {
                urls: "turn:standard.relay.metered.ca:80?transport=tcp",
                username: "",
                credential: ""
            },
            {
                urls: "turn:standard.relay.metered.ca:443",
                username: "",
                credential: ""
            },
            {
                urls: "turns:standard.relay.metered.ca:443?transport=tcp",
                username: "",
                credential: ""
            }
        ]
    }
};

//---------------------------------------------------------
// 03. SECURITY, ENCRYPTION & RADAR UTILS
//---------------------------------------------------------
async function hashPassword(str) {
    if (!str) return '';
    if (!window.crypto || !window.crypto.subtle) {
        console.warn("[ SYSTEM ] Secure context missing. Using fallback encryption.");
        return btoa(unescape(encodeURIComponent(str))); 
    }
    try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        return btoa(unescape(encodeURIComponent(str)));
    }
}

let notificationsEnabled = false;

function toggleNotifications() {
    if (!("Notification" in window)) {
        return alert("[ SYSTEM_ERROR ] This browser does not support desktop notifications.");
    }
    
    if (notificationsEnabled) { 
        notificationsEnabled = false; 
        updateNotificationUI(); 
        return; 
    }
    
    if (Notification.permission === "granted") {
        notificationsEnabled = true; 
        updateNotificationUI();
        fireSafeNotification("NOWSPACE Terminal", "Background alerts activated successfully.");
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") { 
                notificationsEnabled = true; 
                updateNotificationUI(); 
                fireSafeNotification("NOWSPACE Terminal", "Background alerts activated successfully.");
            } else { 
                alert("[ ACCESS_DENIED ] Notification permission was rejected."); 
            }
        });
    } else {
        alert("[ ACCESS_DENIED ] Notifications are blocked by your browser settings for this domain.");
    }
}

function updateNotificationUI() {
    const btn = document.getElementById('notification-toggle-btn');
    if (!btn) return;
    if (notificationsEnabled) { 
        btn.innerText = "[ 🔔 NOTIFICATIONS: ON ]"; 
        btn.classList.add('btn-alert'); 
    } else { 
        btn.innerText = "[ 🔔 NOTIFICATIONS: OFF ]"; 
        btn.classList.remove('btn-alert'); 
    }
}

function triggerBackgroundAlert(title, message) {
    if (notificationsEnabled && document.hidden) {
        fireSafeNotification(title, message);
    }
}

// PWA-Safe Mobile Router
function fireSafeNotification(title, message) {
    try {
        const options = { body: message, icon: '/icon-192.png' };
        
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then(reg => {
                if (reg && reg.showNotification) {
                    reg.showNotification(title, options).catch(e => console.warn("SW Alert Error:", e));
                } else {
                    safeDesktopAlert(title, options);
                }
            }).catch(() => safeDesktopAlert(title, options));
        } else {
            safeDesktopAlert(title, options);
        }
    } catch (err) {
        console.warn("[ SYSTEM_ERROR ] Alert failed entirely.", err);
    }
}

// Strictly caught desktop fallback
function safeDesktopAlert(title, options) {
    try { 
        new Notification(title, options); 
    } catch (e) { 
        console.warn("[ SYSTEM_ERROR ] Device blocked native notification.", e); 
    }
}
//---------------------------------------------------------
// 04. PROFILE MULTI-SLOT MEMORY MANAGEMENT
//---------------------------------------------------------
function switchProfile(slotId) {
    saveLocalData();
    activeSlot = slotId;
    localStorage.setItem('nowspace_active_slot', activeSlot);
    loadLocalData();
}

function loadLocalData() {
    let saved = null;
    try {
        if (activeSlot === '1' && !localStorage.getItem('nowspace_save_1') && localStorage.getItem('nowspace_save')) {
            saved = JSON.parse(localStorage.getItem('nowspace_save'));
            localStorage.setItem('nowspace_save_1', localStorage.getItem('nowspace_save'));
        } else {
            const savedStr = localStorage.getItem('nowspace_save_' + activeSlot);
            if (savedStr) saved = JSON.parse(savedStr);
        }
    } catch(e) { console.warn("[ SYSTEM ] Local storage cache corrupted."); }

    if (saved) {
        document.getElementById('my-alias').value = saved.alias || 'NODE-ALPHA'; 
        document.getElementById('my-custom-id').value = saved.customId || '';
        document.getElementById('my-bio').value = saved.bio || ''; 
        document.getElementById('my-audio').value = saved.audio || '';
        document.getElementById('my-gallery').value = saved.gallery || ''; 
        document.getElementById('my-top8').value = saved.top8 || ''; 
        document.getElementById('my-css').value = saved.css || '';
        document.getElementById('my-custom-sound').value = saved.customSound || ''; 
        
        wallData = saved.wall || []; 
        featureToggles = saved.features || { scanlines: true, soundboard: true, gallery: true, top8: true, usernames: true, voicecomms: true, polls: true };
        
        if (document.getElementById('my-bg-url')) document.getElementById('my-bg-url').value = saved.bgUrl || '';
        if (document.getElementById('my-password')) document.getElementById('my-password').value = saved.password || '';
        
        if (typeof applyBackground === "function") applyBackground(saved.bgUrl || '');
        if (typeof applyFeatures === "function") {
            ['scanlines', 'soundboard', 'gallery', 'top8', 'usernames', 'voicecomms', 'polls'].forEach(f => {
                const cb = document.getElementById('toggle-' + f); 
                if (cb) cb.checked = featureToggles[f];
            });
            applyFeatures(featureToggles);
        }
        if (typeof renderWall === "function") renderWall();
        
        const inject = document.getElementById('custom-injected-css'); 
        if(inject) inject.innerText = saved.css || ''; 
    } else {
        // DEFAULT THEMES PER SLOT OVERRIDE
        let defAlias = '', defBio = '', defAudio = '', defGallery = '', defCss = '', defBgUrl = '';

        if (activeSlot === '1') {
            defAlias = 'NODE-ALPHA';
            defBio = 'SYSTEM_STATUS: ONLINE // Mainframe Override.';
            defAudio = 'https://www.youtube.com/watch?v=hMxlPYStVVY';
            defGallery = 'https://media.giphy.com/media/LeGnsKiiTcYMl05PCU/giphy.gif';
            defBgUrl = 'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3dHplb2VodG8wcm5sbXVzd3R5NGl2Z3R4c3c4ZnZteW14bmhhb25tMSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/4knozU8q9AXvpod9qy/giphy.gif';
            defCss = `:root {\n    --bg-color: #020204;\n    --text-color: #00e5ff;\n    --main-cyan: #00e5ff;\n    --alert-red: #ff2a75;\n    --bright-magenta: #d900ff;\n    --dark-magenta: #590066;\n    --panel-bg: rgba(10, 10, 15, 0.85);\n    --text-glow: 0 0 8px rgba(0, 229, 255, 0.6);\n}\nbody { font-family: "Courier New", Courier, monospace; }\n.panel { border: 1px solid var(--main-cyan); box-shadow: inset 0 0 15px rgba(0,229,255,0.05), 0 0 15px rgba(0,229,255,0.1); border-radius: 2px; }\nbutton, .btn-small { background: transparent; color: var(--main-cyan); border: 1px solid var(--main-cyan); text-transform: uppercase; letter-spacing: 1px; transition: all 0.2s ease-in-out; }\nbutton:hover, .btn-small:hover { background: rgba(0, 229, 255, 0.1); box-shadow: var(--text-glow); }\n.btn-alert { color: var(--alert-red); border-color: var(--alert-red); }\n.btn-alert:hover { background: rgba(255, 42, 117, 0.1); box-shadow: 0 0 8px rgba(255, 42, 117, 0.6); }\ninput, textarea, select { background: rgba(0,0,0,0.8); border: 1px solid #333; color: var(--text-color); font-family: monospace; }\ninput:focus, textarea:focus { border-color: var(--main-cyan); outline: none; box-shadow: var(--text-glow); }`;
        } else if (activeSlot === '2') {
            defAlias = 'SPARTAN-117';
            defBio = 'UNSC SECURE CHANNEL // ENCRYPTION LEVEL: ONYX';
            defAudio = 'https://www.youtube.com/watch?v=0jXTBAGv9ZQ'; 
            defGallery = 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZTl5Ynh0dHAwZmdvMGI5a2EyYm92bjNmd3dod2RjYmp3Ynk1aG5iMiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/4pNT1cebCSqmk0NAqi/giphy.gif';
            defBgUrl = 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZTl5Ynh0dHAwZmdvMGI5a2EyYm92bjNmd3dod2RjYmp3Ynk1aG5iMiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/NqS20k14f2QEVx9wWX/giphy.gif';
            defCss = `:root {\n    --bg-color: #0a0d0a;\n    --text-color: #6eb99a;\n    --main-cyan: #74d6a8;\n    --alert-red: #ff9d00;\n    --bright-magenta: #d4a017;\n    --dark-magenta: #5c470a;\n    --panel-bg: rgba(14, 20, 14, 0.95);\n    --text-glow: 0 0 4px rgba(116, 214, 168, 0.4);\n}\nbody { font-family: "Trebuchet MS", sans-serif; text-transform: uppercase; }\n.panel { border: 2px solid #2a3d2a; border-top: 2px solid var(--main-cyan); border-radius: 0; }\nbutton, .btn-small { background: rgba(116, 214, 168, 0.05); color: var(--main-cyan); border: 1px solid #2a3d2a; font-weight: bold; border-radius: 0; }\nbutton:hover, .btn-small:hover { background: rgba(116, 214, 168, 0.2); border-color: var(--main-cyan); }\n.btn-alert { color: var(--alert-red); border-color: rgba(255, 157, 0, 0.3); background: rgba(255, 157, 0, 0.05); }\n.btn-alert:hover { border-color: var(--alert-red); background: rgba(255, 157, 0, 0.2); }\ninput, textarea, select { background: rgba(0,0,0,0.5); border: 1px solid #2a3d2a; color: var(--text-color); }\ninput:focus, textarea:focus { border-color: var(--main-cyan); }\n.glitch-text { text-shadow: 2px 2px 0px #000; letter-spacing: 2px; }\n.wall-post { border-left: 3px solid #2a3d2a; padding-left: 10px; margin-bottom: 8px; background: rgba(0,0,0,0.2); }`;
        } else {
            defAlias = 'NIGHT_OWL';
            defBio = 'chill beats to study/code to...';
            defAudio = 'https://www.youtube.com/watch?v=jfKfPfyJRdk';
            defGallery = 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbzYycDRkMXMzbGNiY3QzZjkzMXN3czc5cmpmb2RhdTRjOWl5MW1lZSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/CW16nFVXLSQxSMUEMd/giphy.gif';
            defBgUrl = 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbzYycDRkMXMzbGNiY3QzZjkzMXN3czc5cmpmb2RhdTRjOWl5MW1lZSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/k8kITi9SAwe9JWbUaH/giphy.gif';
            defCss = `:root {\n    --bg-color: #161625;\n    --text-color: #e2e2cd;\n    --main-cyan: #a8dadc;\n    --alert-red: #ffb5a7;\n    --bright-magenta: #cdb4db;\n    --dark-magenta: #6c5b7b;\n    --panel-bg: rgba(28, 28, 45, 0.7);\n    --text-glow: 0 0 12px rgba(168, 218, 220, 0.3);\n}\nbody { font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; color: #f8f9fa; }\n.panel { border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4); backdrop-filter: blur(8px); }\nbutton, .btn-small { background: rgba(255,255,255,0.03); color: var(--main-cyan); border: 1px solid rgba(168, 218, 220, 0.2); border-radius: 8px; font-weight: 500; transition: all 0.3s ease; }\nbutton:hover, .btn-small:hover { background: rgba(168, 218, 220, 0.15); border-color: var(--main-cyan); transform: translateY(-2px); }\n.btn-alert { color: var(--alert-red); border-color: rgba(255, 181, 167, 0.2); }\n.btn-alert:hover { background: rgba(255, 181, 167, 0.15); border-color: var(--alert-red); }\ninput, textarea, select { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; color: #fff; padding: 8px; }\ninput:focus, textarea:focus { border-color: var(--bright-magenta); outline: none; box-shadow: 0 0 8px rgba(205, 180, 219, 0.4); }\n.glitch-text { color: var(--bright-magenta); text-shadow: 2px 2px 4px rgba(0,0,0,0.5); }\n.wall-post { background: rgba(255,255,255,0.02); border-radius: 8px; padding: 10px; border: 1px solid rgba(255,255,255,0.03); }`;
        }

        document.getElementById('my-alias').value = defAlias; 
        document.getElementById('my-custom-id').value = '';
        document.getElementById('my-bio').value = defBio; 
        document.getElementById('my-audio').value = defAudio;
        document.getElementById('my-gallery').value = defGallery; 
        document.getElementById('my-top8').value = 'node-alpha\ncyber-deck-2';
        document.getElementById('my-css').value = defCss;
        document.getElementById('my-custom-sound').value = ''; 
        
        // Populate Background Image URL box
        if (document.getElementById('my-bg-url')) document.getElementById('my-bg-url').value = defBgUrl;
        if (document.getElementById('my-password')) document.getElementById('my-password').value = '';
        
        wallData = [];
        featureToggles = { scanlines: true, soundboard: true, gallery: true, top8: true, usernames: true, voicecomms: true, polls: true };
        
        // Trigger the background render
        if (typeof applyBackground === "function") applyBackground(defBgUrl);
        
        if (typeof applyFeatures === "function") {
            ['scanlines', 'soundboard', 'gallery', 'top8', 'usernames', 'voicecomms', 'polls'].forEach(f => {
                const cb = document.getElementById('toggle-' + f); 
                if (cb) cb.checked = true;
            });
            applyFeatures(featureToggles);
        }
        if (typeof renderWall === "function") renderWall();
        
        const inject = document.getElementById('custom-injected-css'); 
        if(inject) inject.innerText = defCss; 
        
        saveLocalData();
    }
}

function saveLocalData() {
    if (currentRole === 'VISITOR') return;
    
    const saveData = { 
        alias: document.getElementById('my-alias').value, 
        customId: document.getElementById('my-custom-id').value, 
        bio: document.getElementById('my-bio').value, 
        audio: document.getElementById('my-audio').value, 
        gallery: document.getElementById('my-gallery').value, 
        top8: document.getElementById('my-top8') ? document.getElementById('my-top8').value : '',
        css: document.getElementById('my-css').value, 
        customSound: document.getElementById('my-custom-sound').value, 
        bgUrl: document.getElementById('my-bg-url').value, 
        wall: wallData, 
        features: featureToggles, 
        password: document.getElementById('my-password').value 
    };
    
    localStorage.setItem('nowspace_save_' + activeSlot, JSON.stringify(saveData));
}

//---------------------------------------------------------
// 05. EXPORT / IMPORT ENGINE
//---------------------------------------------------------
function exportTheme() {
    saveLocalData(); 
    const savedStr = localStorage.getItem('nowspace_save_' + activeSlot);
    if (!savedStr) return;
    
    const data = JSON.parse(savedStr);
    data.identityFingerprint = myFingerprint; 
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a'); 
    link.href = url;
    link.download = `nowspace_theme_${data.alias.toLowerCase().replace(/\s+/g, '_')}_slot${activeSlot}.json`; 
    
    document.body.appendChild(link); link.click(); document.body.removeChild(link); 
    URL.revokeObjectURL(url);
}

function importTheme(event) {
    const inputElement = event.target;
    const file = inputElement.files[0]; 
    if (!file) return; 
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const p = JSON.parse(e.target.result);
            if(p.alias !== undefined) document.getElementById('my-alias').value = p.alias;
            if(p.customId !== undefined) document.getElementById('my-custom-id').value = p.customId;
            if(p.bio !== undefined) document.getElementById('my-bio').value = p.bio;
            if(p.audio !== undefined) document.getElementById('my-audio').value = p.audio;
            if(p.gallery !== undefined) document.getElementById('my-gallery').value = p.gallery;
            if(p.top8 !== undefined) document.getElementById('my-top8').value = p.top8;
            if(p.customSound !== undefined) document.getElementById('my-custom-sound').value = p.customSound;
            
            if(p.bgUrl !== undefined) { 
                document.getElementById('my-bg-url').value = p.bgUrl; 
                if(typeof applyBackground === "function") applyBackground(p.bgUrl); 
            }
            if(p.css !== undefined) { 
                document.getElementById('my-css').value = p.css; 
                const inject = document.getElementById('custom-injected-css');
                if (inject) inject.innerText = p.css; 
            }
            if(p.features) { 
                featureToggles = p.features; 
                ['scanlines', 'soundboard', 'gallery', 'top8', 'usernames', 'voicecomms', 'polls'].forEach(f => {
                    const cb = document.getElementById('toggle-' + f); 
                    if (cb) cb.checked = featureToggles[f];
                });
                if(typeof applyFeatures === "function") applyFeatures(featureToggles); 
            }
            saveLocalData(); 
            alert(`[ SYSTEM ] Profile data successfully imported to Memory Slot ${activeSlot}.`);
        } catch (err) { alert("[ SYSTEM_ERROR ] Failed to parse theme file."); } 
        finally { inputElement.value = ''; }
    }; 
    reader.onerror = function() { alert("[ SYSTEM_ERROR ] Operating system blocked file read."); inputElement.value = ''; };
    reader.readAsText(file);
}

function copyMagicLink() { 
    const input = document.getElementById('magic-link-input'); 
    input.select(); navigator.clipboard.writeText(input.value); 
}

function resetDefaultTemplate() { 
    if(confirm(`Purge Memory Slot ${activeSlot} cache?`)) { 
        localStorage.removeItem('nowspace_save_' + activeSlot);
        window.location.reload(); 
    } 
}

//---------------------------------------------------------
// 06. INITIALIZATION (window.onload)
//---------------------------------------------------------
window.onload = () => {
    const slotSelect = document.getElementById('profile-slot');
    if (slotSelect) slotSelect.value = activeSlot;

    const vAlias = localStorage.getItem('nowspace_visitor_alias');
    if (vAlias && document.getElementById('visitor-alias-input')) {
        document.getElementById('visitor-alias-input').value = vAlias;
    }
    
    loadLocalData();
    
    const cssInput = document.getElementById('my-css');
    if (cssInput) {
        cssInput.addEventListener('input', (e) => { 
            const inject = document.getElementById('custom-injected-css'); 
            if(inject) inject.innerText = e.target.value; 
            saveLocalData();
        });
    }
    
    const urlNode = new URLSearchParams(window.location.search).get('node'); 
    if (urlNode) { 
        document.getElementById('host-setup-panel').style.display = 'none'; 
        document.getElementById('friend-id').value = urlNode; 
        document.getElementById('visitor-password').focus(); 
    }

    // --- AUTO-ENABLE NOTIFICATIONS IF PREVIOUSLY GRANTED ---
    if ("Notification" in window && Notification.permission === "granted") {
        notificationsEnabled = true;
        updateNotificationUI();
    }
};
