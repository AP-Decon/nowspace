// === 01. GLOBAL VARIABLES & STATE ===
let peer = null, activeConn = null, wallData = [], currentRole = null;
let top8 = JSON.parse(localStorage.getItem('nowspace_top8')) || [];
let bannedFingerprints = JSON.parse(localStorage.getItem('nowspace_banned')) || [];
let peerFingerprintMap = {}; 
let globalVolume = 0.5, activePoll = null;
let featureToggles = { scanlines: true, soundboard: true, gallery: true, top8: true, usernames: true, voicecomms: true, polls: true };

// Identity & Security
let myFingerprint = localStorage.getItem('nowspace_identity_key') || ('TID-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36));
localStorage.setItem('nowspace_identity_key', myFingerprint);
let currentHostEncryptedPwd = '';

// A/V Comms State
let localStream = null, activeCalls = [], isMuted = false, isCamOn = false, isScreenSharing = false, currentNetworkPeers = [];

// Hardware & Memory Buffers
let incomingFiles = {};
let radarEnabled = false;

// === 02. CONSTANTS ===
const MSG_TYPE_PROFILE = 'PROFILE_INITIAL_LOAD', MSG_TYPE_WALL_POST = 'NEW_WALL_PACKET';
const MSG_TYPE_WALL_UPDATE = 'WALL_DATASTREAM_UPDATE', MSG_TYPE_SOUNDBOARD = 'SOUNDBOARD_PLAY'; 
const MSG_TYPE_FEATURE_UPDATE = 'FEATURE_TOGGLE_UPDATE', MSG_TYPE_POLL_NEW = 'POLL_NEW';
const MSG_TYPE_POLL_VOTE = 'POLL_VOTE', MSG_TYPE_POLL_UPDATE = 'POLL_UPDATE';
const MSG_TYPE_USER_LIST = 'ONLINE_USER_LIST';

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

const peerConfig = {
    config: {
        'iceServers': [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: "stun:stun.relay.metered.ca:80" },
            {
                urls: "turn:global.relay.metered.ca:80",
                username: "PASTE_YOUR_USERNAME_HERE",
                credential: "PASTE_YOUR_CREDENTIAL_HERE"
            },
            {
                urls: "turns:global.relay.metered.ca:443",
                username: "PASTE_YOUR_USERNAME_HERE",
                credential: "PASTE_YOUR_CREDENTIAL_HERE"
            }
        ]
    }
};

// DOM References loaded globally
const statusDisplay = document.getElementById('connection-status');
const globalDisconnectBtn = document.getElementById('global-disconnect-btn');