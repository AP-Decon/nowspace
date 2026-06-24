//---------------------------------------------------------
// 01. GLOBAL SYSTEM VARIABLES & STATE
//---------------------------------------------------------
let peer = null;
let activeConn = null;
let wallData = [];
let currentRole = null;

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

function toggleRadar() {
    if (!("Notification" in window)) {
        return alert("[ SYSTEM_ERROR ] Browser does not support background radar.");
    }
    
    if (radarEnabled) {
        radarEnabled = false;
        updateRadarUI();
        return;
    }
    
    if (Notification.permission === "granted") {
        radarEnabled = true;
        updateRadarUI();
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(p => {
            if (p === "granted") { 
                radarEnabled = true; 
                updateRadarUI(); 
            } else { 
                alert("[ ACCESS_DENIED ] Permission rejected."); 
            }
        });
    } else {
        alert("[ ACCESS_DENIED ] Notifications are permanently blocked by your browser settings.");
    }
}

function updateRadarUI() {
    const btn = document.getElementById('radar-btn');
    if (!btn) return;
    
    if (radarEnabled) {
        btn.innerText = "[ 📡 RADAR: ON ]";
        btn.classList.add('btn-alert');
    } else {
        btn.innerText = "[ 📡 RADAR: OFF ]";
        btn.classList.remove('btn-alert');
    }
}

function systemPing(title, body) {
    if (radarEnabled && document.hidden) {
        new Notification(title, { body: body });
    }
}

//---------------------------------------------------------
// 04. THEME EXPORT, IMPORT & NODE REFRESH
//---------------------------------------------------------
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
            alert("[ SYSTEM ] Profile data successfully imported.");
            
        } catch (err) { 
            alert("[ SYSTEM_ERROR ] Failed to parse theme file."); 
        } finally { 
            inputElement.value = ''; 
        }
    }; 
    
    reader.onerror = function() { 
        alert("[ SYSTEM_ERROR ] Operating system blocked file read."); 
        inputElement.value = ''; 
    };
    
    reader.readAsText(file);
}

function saveLocalData() {
    if (currentRole !== 'HOST') return;
    
    const saveData = { 
        alias: document.getElementById('my-alias').value, 
        customId: document.getElementById('my-custom-id').value, 
        bio: document.getElementById('my-bio').value, 
        audio: document.getElementById('my-audio').value, 
        gallery: document.getElementById('my-gallery').value, 
        css: document.getElementById('my-css').value, 
        customSound: document.getElementById('my-custom-sound').value, 
        bgUrl: document.getElementById('my-bg-url').value, 
        wall: wallData, 
        features: featureToggles, 
        password: document.getElementById('my-password').value 
    };
    
    localStorage.setItem('nowspace_save', JSON.stringify(saveData));
}

function copyMagicLink() { 
    const input = document.getElementById('magic-link-input'); 
    input.select(); 
    navigator.clipboard.writeText(input.value); 
}

function resetDefaultTemplate() { 
    if(confirm("Purge node memory cache?")) { 
        localStorage.clear(); 
        window.location.reload(); 
    } 
}

//---------------------------------------------------------
// 05. INITIALIZATION (window.onload)
//---------------------------------------------------------
window.onload = () => {
    let saved = null;
    
    try {
        const savedStr = localStorage.getItem('nowspace_save');
        if (savedStr) saved = JSON.parse(savedStr);
    } catch(e) {
        console.warn("[ SYSTEM ] Local storage cache corrupted. Proceeding with defaults.");
    }
    
    const vAlias = localStorage.getItem('nowspace_visitor_alias');
    if (vAlias && document.getElementById('visitor-alias-input')) {
        document.getElementById('visitor-alias-input').value = vAlias;
    }
    
    if (saved) {
        document.getElementById('my-alias').value = saved.alias || 'NODE-ALPHA'; 
        document.getElementById('my-custom-id').value = saved.customId || '';
        document.getElementById('my-bio').value = saved.bio || ''; 
        document.getElementById('my-audio').value = saved.audio || '';
        document.getElementById('my-gallery').value = saved.gallery || ''; 
        document.getElementById('my-css').value = saved.css || '';
        document.getElementById('my-custom-sound').value = saved.customSound || ''; 
        
        wallData = saved.wall || []; 
        featureToggles = saved.features || featureToggles;
        
        if (document.getElementById('my-bg-url')) {
            document.getElementById('my-bg-url').value = saved.bgUrl || '';
        }
        if (saved.password && document.getElementById('my-password')) {
            document.getElementById('my-password').value = saved.password;
        }
        
        if (typeof applyBackground === "function") applyBackground(saved.bgUrl || '');
        if (typeof applyFeatures === "function") applyFeatures(featureToggles); 
        if (typeof renderWall === "function") renderWall();
    }
    
    const cssInput = document.getElementById('my-css');
    if (cssInput) {
        cssInput.addEventListener('input', (e) => { 
            const inject = document.getElementById('custom-injected-css'); 
            if(inject) inject.innerText = e.target.value; 
        });
    }
    
    const urlNode = new URLSearchParams(window.location.search).get('node'); 
    if (urlNode) { 
        document.getElementById('host-setup-panel').style.display = 'none'; 
        document.getElementById('friend-id').value = urlNode; 
        document.getElementById('visitor-password').focus(); 
    }
};
// END
