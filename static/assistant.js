// static/assistant.js

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// -------------------- CONFIG (tweakable)
const CONFIG = {
    VISEME_SCALE: 0.25,
    MORPH_LERP: 0.72,
    JAW_DRIVE_STRENGTH: 0.15,
    ANALYSER_SMOOTH: 0.60,
    FFT_SIZE: 2048,
    MIN_VOICE_RMS: 0.004,
    TIMELINE_RECORD: false,
    // eyes
    EYE_MAX: 1.95,
    EYE_HORZ_BOOST: 1.95,
    EYE_SMOOTH: 0.12,
    EYE_FOCUS_DIST: 0.45,
    // blinking
    BLINK_MIN: 3.8,
    BLINK_MAX: 5.2,
    BLINK_DURATION: 0.12,
    BLINK_TALK_PAUSE_WINDOW: 0.28,
    // saccades 
    SACC_MIN: 0.25,
    SACC_MAX: 0.9,
    SACC_MAG: 0.12,
    SACC_DURATION: 0.06,
    // head movement
    HEAD_YAW_MAX: 0.16,
    HEAD_PITCH_MAX: 0.18,
    HEAD_SMOOTH: 0.12,
    HEAD_TALK_BOOST: 0.6,
    HEAD_IDLE_BOB: 0.01
};

// -------------------- DOM refs
const container = document.getElementById('container');
const waveCanvas = document.getElementById('wave-canvas');
const chatMessages = document.getElementById('chat-messages');
const clearChatBtn = document.getElementById('clear-chat-btn');
const queryInput = document.getElementById('query-input');
const textSubmit = document.getElementById('text-submit');
const soundBars = document.getElementById('sound-bars');
const stopBtn = document.getElementById('stop-btn');
const listenBtn = document.getElementById('listen-btn');
const micIndicator = document.getElementById('mic-indicator');
const typingIndicator = document.getElementById('typing-indicator');

// -------------------- small UI helpers
function addMessage(text, sender='bot'){
  if(!chatMessages) return;
  const d = document.createElement('div');
  if(sender === 'system') { d.classList.add('system-msg'); }
  else { d.classList.add('message'); if(sender==='user') d.classList.add('from-user'); else d.classList.add('from-bot'); }
  d.textContent = text;
  chatMessages.appendChild(d);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
clearChatBtn?.addEventListener('click', ()=>{ if(chatMessages) chatMessages.innerHTML=''; addMessage('Chat cleared.','system'); });

// -------------------- wave canvas
const wctx = waveCanvas.getContext('2d');
function resizeWaveCanvas() {
    const rect = waveCanvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    waveCanvas.width = Math.round(rect.width * dpr);
    waveCanvas.height = Math.round(rect.height * dpr);
    waveCanvas.style.width = rect.width + 'px';
    waveCanvas.style.height = rect.height + 'px';
    wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeWaveCanvas();
window.addEventListener('resize', resizeWaveCanvas);
window.addEventListener('wave-resize', resizeWaveCanvas);

const waves = [
    { amp: 22, freq: 0.008, speed: 0.8, offset: 0.0, lineWidth: 2, alpha: 0.16 },
    { amp: 30, freq: 0.006, speed: 0.6, offset: 1.2, lineWidth: 1.4, alpha: 0.12 },
    { amp: 40, freq: 0.004, speed: 0.4, offset: 2.8, lineWidth: 1.0, alpha: 0.08 }
];
let ttime = 0;
let lastTs = performance.now();
function drawWaves() {
    const now = performance.now();
    const dt = (now - lastTs) / 1000;
    lastTs = now;
    ttime += dt * 60;
    wctx.clearRect(0, 0, waveCanvas.clientWidth, waveCanvas.clientHeight);
    const W = waveCanvas.clientWidth;
    const H = waveCanvas.clientHeight;
    waves.forEach((w, idx) => {
        wctx.beginPath();
        wctx.lineWidth = w.lineWidth;
        wctx.lineJoin = 'round';
        wctx.lineCap = 'round';
        wctx.strokeStyle = `rgba(255,255,255,${w.alpha})`;
        const segments = Math.max(50, Math.floor(W / 6));
        for (let i = 0; i <= segments; i++) {
            const x = (i / segments) * W;
            const baseline = H * 0.62 - idx * 8;
            const phase = ttime * 0.02 * w.speed + (i / segments) * Math.PI * 2 * w.freq * 100 + w.offset;
            const y = baseline + Math.sin(phase) * w.amp * (1 + 0.08 * Math.sin(ttime * 0.01 + idx));
            if (i === 0) wctx.moveTo(x, y);
            else wctx.lineTo(x, y);
        }
        wctx.stroke();
        const grad = wctx.createLinearGradient(0, H * 0.4, 0, H);
        grad.addColorStop(0, `rgba(255,255,255,${w.alpha * 0.06})`);
        grad.addColorStop(1, `rgba(255,255,255,0.0006)`);
        wctx.fillStyle = grad;
        wctx.globalCompositeOperation = 'screen';
        wctx.beginPath();
        wctx.moveTo(0, H);
        for (let i = 0; i <= segments; i++) {
            const x = (i / segments) * W;
            const baseline = H * 0.62 - idx * 8;
            const phase = ttime * 0.02 * w.speed + (i / segments) * Math.PI * 2 * w.freq * 100 + w.offset;
            const y = baseline + Math.sin(phase) * w.amp * (1 + 0.08 * Math.sin(ttime * 0.01 + idx));
            wctx.lineTo(x, y);
        }
        wctx.lineTo(W, H);
        wctx.closePath();
        wctx.fill();
        wctx.globalCompositeOperation = 'source-over';
    });
    requestAnimationFrame(drawWaves);
}
requestAnimationFrame(drawWaves);

// -------------------- three.js setup
const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
camera.position.set(0, 1.9, 3.2);
camera.lookAt(0, 1.2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);
renderer.domElement.style.position = 'absolute';
renderer.domElement.style.inset = '0';

function resizeThree() {
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    camera.aspect = w / h;
    
    // Zoom in on smaller screens
    const windowWidth = window.innerWidth;
    if (windowWidth <= 480) {
        camera.position.z = 2.4; // Closest for mobile
    } else if (windowWidth <= 768) {
        camera.position.z = 2.8; // Closer for tablet
    } else if (windowWidth <= 1024) {
        camera.position.z = 3.0; // Medium for small desktop
    } else {
        camera.position.z = 3.2; // Default for desktop
    }
    
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
}
resizeThree();
window.addEventListener('resize', () => { resizeThree(); resizeWaveCanvas(); });
window.addEventListener('three-resize', resizeThree);

// lights
scene.add(new THREE.AmbientLight(0xffffff,1.0));
const keyLight = new THREE.DirectionalLight(0xffffff,2.4); keyLight.position.set(3,6,4); keyLight.castShadow = true; scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff,1.0); fillLight.position.set(-3,4,2); scene.add(fillLight);
const backGlow = new THREE.PointLight(0x88aaff,1.2,10); backGlow.position.set(0,2.5,-2); scene.add(backGlow);

// -------------------- model load & bookkeeping
const loader = new GLTFLoader();
let model = null, mixer = null;
let modelMorphMeshList = [], mouthMesh = null, morphNamesSample = {};
let jawBone = null, headBone = null, headRestRot = null;
let leftShoulder = null, leftShoulderRest = null, rightShoulder = null, rightShoulderRest = null;
let leftArm = null, leftArmRest = null, rightArm = null, rightArmRest = null;
let leftForeArm = null, leftForeArmRest = null, rightForeArm = null, rightForeArmRest = null;
let leftHandBone = null, leftHandRestRot = null, rightHandBone = null, rightHandRestRot = null;
let holoGroup = null;

// Gestures System
let currentGesture = 'rest';
let gestureTimer = 0;
let gestureLerp = 0;
const GESTURE_DURATIONS = {
    'rest': 3.0,
    'glasses': 2.5,
    'hair': 2.5,
    'clap': 2.0,
    'explain_one': 2.5,
    'explain_two': 3.0
};
// Store target rotations for each gesture state to smoothly lerp towards
const gestureTargets = {
    leftShoulder: new THREE.Euler(), rightShoulder: new THREE.Euler(),
    leftArm: new THREE.Euler(), rightArm: new THREE.Euler(),
    leftForeArm: new THREE.Euler(), rightForeArm: new THREE.Euler(),
    leftHand: new THREE.Euler(), rightHand: new THREE.Euler()
};

loader.load('/static/assets/model.gltf',
  (gltf) => {
    model = gltf.scene;
    window.model = model;
    model.position.set(0, -1.95, -0.45);
    model.scale.set(2.4,2.4,2.4);

    modelMorphMeshList = []; mouthMesh = null; morphNamesSample = {};
    model.traverse((c) => {
      if(c.isMesh){
        c.castShadow = true; c.receiveShadow = true;
        c.renderOrder = 50; c.material.depthTest = true;
        if(c.morphTargetDictionary && c.morphTargetInfluences){
          modelMorphMeshList.push(c);
          if(!mouthMesh){ mouthMesh = c; morphNamesSample = Object.assign({}, c.morphTargetDictionary); }
        }
      }
      if(c.isBone){
        const n = (c.name || '').toLowerCase();
        if(!jawBone && n.includes('jaw')) { jawBone = c; window.jawBone = jawBone; }
        if(!headBone && n.includes('head')) { headBone = c; headRestRot = c.rotation.clone(); }
        
        // Map arm hierarchy for gestures
        if(!leftShoulder && n === 'leftshoulder') { leftShoulder = c; leftShoulderRest = c.rotation.clone(); }
        if(!rightShoulder && n === 'rightshoulder') { rightShoulder = c; rightShoulderRest = c.rotation.clone(); }
        
        if(!leftArm && n === 'leftarm') { leftArm = c; leftArmRest = c.rotation.clone(); }
        if(!rightArm && n === 'rightarm') { rightArm = c; rightArmRest = c.rotation.clone(); }
        
        if(!leftForeArm && n === 'leftforearm') { leftForeArm = c; leftForeArmRest = c.rotation.clone(); }
        if(!rightForeArm && n === 'rightforearm') { rightForeArm = c; rightForeArmRest = c.rotation.clone(); }
        
        if(!leftHandBone && n === 'lefthand') { leftHandBone = c; leftHandRestRot = c.rotation.clone(); }
        if(!rightHandBone && n === 'righthand') { rightHandBone = c; rightHandRestRot = c.rotation.clone(); }
      }
    });

    if(gltf.animations && gltf.animations.length) mixer = new THREE.AnimationMixer(model);
    scene.add(model);
    resetAllMorphs();
    createHeadHologram();
    console.log('Model loaded. morphMeshes:', modelMorphMeshList.length, 'sample morphs:', Object.keys(morphNamesSample).slice(0,60));
  },
  undefined,
  (err) => { console.error('Model load error:', err); }
);

// -------------------- HEAD HOLOGRAM
function makeRadialTexture(size = 512, tint = '180,220,255') {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const cx = c.getContext('2d');

    const grad = cx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0.0, `rgba(${tint},0.95)`);
    grad.addColorStop(0.15, `rgba(${tint},0.55)`);
    grad.addColorStop(0.30, `rgba(${tint},0.18)`);
    grad.addColorStop(0.70, `rgba(60,80,140,0.06)`);
    grad.addColorStop(1.0, 'rgba(20,30,60,0.0)');

    cx.fillStyle = grad;
    cx.fillRect(0,0,size,size);

    cx.globalCompositeOperation = 'lighter';
    cx.lineWidth = Math.max(1, size * 0.004);
    for (let i = 1; i <= 3; i++) {
        cx.beginPath();
        const r = (size*0.18) + i * (size*0.12);
        cx.strokeStyle = `rgba(200,230,255,${0.06 - i*0.015})`;
        cx.arc(size/2, size/2, r, 0, Math.PI*2);
        cx.stroke();
    }
    return new THREE.CanvasTexture(c);
}

function createHeadHologram() {
    if (!model) return;
    if (holoGroup) { model.remove(holoGroup); holoGroup = null; }

    holoGroup = new THREE.Group();
    const size = 1.3;
    const tex = makeRadialTexture(1024);
    tex.needsUpdate = true;

    const discGeo = new THREE.PlaneGeometry(size, size, 1, 1);
    const discMat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });
    const discMesh = new THREE.Mesh(discGeo, discMat);
    discMesh.rotation.set(0, 0, 0);
    discMesh.position.set(0, 1.6, -0.35);
    discMesh.renderOrder = 0;
    holoGroup.add(discMesh);

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(size * 0.52, 0.03, 16, 120),
        new THREE.MeshBasicMaterial({
            color: 0x8fc8ff,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        })
    );
    ring.rotation.set(0, 0, 0);
    ring.position.set(0, 1.6, -0.36);
    ring.renderOrder = 1;
    holoGroup.add(ring);

    const ring2 = new THREE.Mesh(
        new THREE.TorusGeometry(size * 0.36, 0.02, 12, 120),
        new THREE.MeshBasicMaterial({
            color: 0xbfe6ff,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        })
    );
    ring2.rotation.set(Math.PI/12, 0, 0);
    ring2.position.set(0, 1.58, -0.34);
    ring2.renderOrder = 1;
    holoGroup.add(ring2);

    const lineMat = new THREE.LineBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending });
    const gridCount = 16;
    for (let i = 0; i < gridCount; i++) {
        const a = (i / gridCount) * Math.PI * 2;
        const x = Math.cos(a) * size * 0.28;
        const z = Math.sin(a) * size * 0.02;
        const pts = [ new THREE.Vector3(x * 0.6, 1.35, -0.35 + z), new THREE.Vector3(x * 0.15, 1.85, -0.35 + z * 0.2) ];
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geom, lineMat);
        holoGroup.add(line);
    }

    model.add(holoGroup);
    holoGroup.traverse((o) => { if (o.isMesh && o.material) { o.material.depthWrite = false; o.material.transparent = true; } });
}

// -------------------- morph utilities
function resetAllMorphs(){
  if(!model) return;
  model.traverse((c) => { if(c.isMesh && c.morphTargetInfluences){ const inf = c.morphTargetInfluences; for(let i=0;i<inf.length;i++) inf[i] = 0; if(c.material) c.material.needsUpdate = true; }});
}

function applyMorph(name, value, immediate=false, smooth=CONFIG.MORPH_LERP){
  if(!model) return false;
  let applied = false;
  model.traverse((c) => {
    if(!c.isMesh) return;
    const dict = c.morphTargetDictionary, inf = c.morphTargetInfluences;
    if(!dict || !inf) return;
    const idx = dict[name];
    if(idx === undefined) return;
    let v = value;
    if(name === 'mouthOpen') v = Math.min(v, 0.55);
    if(name === 'jawOpen') v = Math.min(v, 0.45);
    if(immediate) inf[idx] = v; else inf[idx] = THREE.MathUtils.lerp(inf[idx]||0, v, smooth);
    if(c.material) c.material.needsUpdate = true;
    applied = true;
  });
  return applied;
}

// -------------------- audio & viseme pipeline
let audioCtx = null, analyser = null, sourceNode = null, audioPlaying = false, talkStrength = 0.0, timeline = [];
async function ensureAudioCtx(){ if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }
let _audioResumed = false;
function tryResumeAudioCtx(){ if(_audioResumed) return; if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume().then(()=>{ _audioResumed = true; }).catch(()=>{}); }
['pointerdown','keydown','touchstart'].forEach(ev => window.addEventListener(ev, tryResumeAudioCtx, { once:true, passive:true }));

async function decodeBase64Audio(b64){
  await ensureAudioCtx();
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) arr[i] = raw.charCodeAt(i);
  return await audioCtx.decodeAudioData(arr.buffer.slice(0));
}

function mapFrameToViseme(timeDomain, freqDomain){
  let sum=0; for(let i=0;i<timeDomain.length;i++){ const v=(timeDomain[i]-128)/128; sum += v*v; }
  const rms = Math.sqrt(sum/timeDomain.length);
  let denom=0, num=0; for(let i=0;i<freqDomain.length;i++){ const m=freqDomain[i]; denom+=m; num+=m*i; }
  const centroid = denom ? num/denom : 0; const normCent = centroid / freqDomain.length;
  if(rms < CONFIG.MIN_VOICE_RMS) return { name:'viseme_sil', weight:0.0 };
  if(normCent < 0.06) return { name:'viseme_U', weight: Math.min(1, rms*28) };
  if(normCent < 0.11) return { name:'viseme_O', weight: Math.min(1, rms*28) };
  if(normCent < 0.18) return { name:'viseme_aa', weight: Math.min(1, rms*26) };
  if(normCent < 0.28) return { name:'viseme_E', weight: Math.min(1, rms*26) };
  return { name:'viseme_I', weight: Math.min(1, rms*22) };
}

async function playAudioWithVisemesFromBase64(b64){
  try {
    await ensureAudioCtx(); tryResumeAudioCtx();
    if(!b64) return;
    if(audioPlaying && sourceNode){ try{ sourceNode.stop(); }catch(e){} sourceNode.disconnect(); sourceNode = null; }

    const buffer = await decodeBase64Audio(b64);
    sourceNode = audioCtx.createBufferSource(); sourceNode.buffer = buffer;
    analyser = audioCtx.createAnalyser(); analyser.fftSize = CONFIG.FFT_SIZE; analyser.smoothingTimeConstant = CONFIG.ANALYSER_SMOOTH;
    const gain = audioCtx.createGain(); gain.gain.value = 1.0;
    sourceNode.connect(gain); gain.connect(analyser); analyser.connect(audioCtx.destination);

    const timeDomain = new Uint8Array(analyser.fftSize);
    const freqDomain = new Uint8Array(analyser.frequencyBinCount);

    audioPlaying = true; talkStrength = 0; if(soundBars) soundBars.classList.add('talking');
    if(CONFIG.TIMELINE_RECORD) timeline = [];
    sourceNode.start(0); const startTime = audioCtx.currentTime;
    sourceNode.onended = ()=>{ audioPlaying=false; if(soundBars) soundBars.classList.remove('talking'); setTimeout(()=>{ talkStrength=0; resetAllMorphs(); }, 120); if(CONFIG.TIMELINE_RECORD && timeline.length) console.log('[viseme] timeline', timeline.length); };

    let prevTalkHigh = false;
    const loop = ()=>{
      if(!audioPlaying || !analyser) return;
      analyser.getByteTimeDomainData(timeDomain); analyser.getByteFrequencyData(freqDomain);
      const frame = mapFrameToViseme(timeDomain, freqDomain);
      let viseme = frame.name; let weight = Math.min(1, frame.weight * CONFIG.VISEME_SCALE);
      if(CONFIG.TIMELINE_RECORD){ const now = audioCtx.currentTime - startTime; if(weight>0.02) timeline.push({ t: now, viseme, weight: Number(weight.toFixed(3)) }); }

      const target = weight > 0.02 ? 1.0 : 0.0;
      talkStrength += (target - talkStrength) * 0.12;

      const justStoppedTalking = prevTalkHigh && talkStrength < 0.15;
      if(justStoppedTalking) scheduleBlink(0.06 + Math.random() * 0.18);
      prevTalkHigh = talkStrength > 0.45;

      if(model){
        model.traverse(m => { if(m.isMesh && m.morphTargetInfluences){ for(let i=0;i<m.morphTargetInfluences.length;i++) m.morphTargetInfluences[i] = Math.max(0, m.morphTargetInfluences[i] * 0.88); }});
      }

      const applied = applyMorph(viseme, weight, false, CONFIG.MORPH_LERP);
      if(!applied){
        const fallback = Math.min(0.55, weight * 0.9);
        if(!applyMorph('mouthOpen', fallback, false, CONFIG.MORPH_LERP)){
          applyMorph('jawOpen', Math.min(0.45, fallback*0.9), false, CONFIG.MORPH_LERP);
        }
      } else {
        applyMorph('jawOpen', Math.min(0.45, weight * 0.45), false, CONFIG.MORPH_LERP);
      }

      if(jawBone){
        const jawTarget = -0.04 * (weight * CONFIG.JAW_DRIVE_STRENGTH + talkStrength * 0.18);
        jawBone.rotation.x += (jawTarget - jawBone.rotation.x) * 0.16;
      }

      if(weight > 0.02) soundBars?.classList.add('talking'); else soundBars?.classList.remove('talking');
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

  } catch(e){ console.error('playAudioWithVisemesFromBase64 error', e); }
}

// -------------------- Eye + Head system
let mouseX = 0, mouseY = 0, lastMouseTime = 0;
let eyeTargetX = 0, eyeTargetY = 0, eyeCurrentX = 0, eyeCurrentY = 0;
let saccadeTarget = {x:0,y:0}, saccadeStart = 0, saccadeEnd = 0, saccadeFrom = {x:0,y:0};
let nextSaccadeAt = performance.now() + (Math.random()*(CONFIG.SACC_MAX-CONFIG.SACC_MIN)+CONFIG.SACC_MIN)*1000;
let blinkState = { active:false, start:0, duration: CONFIG.BLINK_DURATION*1000 };
let nextBlinkAt = performance.now() + (Math.random()*(CONFIG.BLINK_MAX-CONFIG.BLINK_MIN)+CONFIG.BLINK_MIN)*1000;
let lastBlinkTrigger = 0;
let headTargetYaw = 0, headTargetPitch = 0;
let headCurrentYaw = 0, headCurrentPitch = 0;

window.addEventListener('mousemove', (e) => {
  const rect = container.getBoundingClientRect();
  if(rect.width <= 0 || rect.height <= 0) return;
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  mouseX = (x - 0.5) * 2;
  mouseY = (y - 0.5) * -2;
  lastMouseTime = performance.now();
});
window.addEventListener('touchmove', (ev)=>{ if(!ev.touches||!ev.touches[0]) return; const t = ev.touches[0]; const rect = container.getBoundingClientRect(); const x=(t.clientX-rect.left)/rect.width; const y=(t.clientY-rect.top)/rect.height; mouseX=(x-0.5)*2; mouseY=(y-0.5)*-2; lastMouseTime=performance.now(); }, { passive:true });

function scheduleBlink(delaySec){
  const now = performance.now();
  const t = now + Math.max(0.02, delaySec) * 1000;
  if(t > nextBlinkAt - 40) nextBlinkAt = t;
}
function applyBlink(value){
  applyMorph('eyeBlinkLeft', value, false, 0.2);
  applyMorph('eyeBlinkRight', value, false, 0.2);
}
function maybeStartSaccade(now){
  if(now < nextSaccadeAt) return;
  const mag = CONFIG.SACC_MAG * (0.3 + Math.random()*0.7);
  saccadeFrom = { x: saccadeTarget.x || 0, y: saccadeTarget.y || 0 };
  saccadeTarget = { x: Math.max(-1, Math.min(1, (Math.random()*2-1)*mag)), y: Math.max(-1, Math.min(1, (Math.random()*2-1)*mag)) };
  saccadeStart = now; saccadeEnd = now + CONFIG.SACC_DURATION*1000;
  nextSaccadeAt = now + (Math.random()*(CONFIG.SACC_MAX-CONFIG.SACC_MIN)+CONFIG.SACC_MIN)*1000;
}

function updateEyeAndHeadTargets(){
  const now = performance.now();
  const timeSinceMouse = now - lastMouseTime;
  const mouseInContainer = (timeSinceMouse < 2200);
  let mx = mouseInContainer ? mouseX : 0;
  let my = mouseInContainer ? mouseY : 0;

  mx = THREE.MathUtils.clamp(mx, -1, 1);
  my = THREE.MathUtils.clamp(my, -1, 1);

  mx = THREE.MathUtils.clamp(mx * CONFIG.EYE_HORZ_BOOST, -1.6, 1.6);

  const nowMs = performance.now();
  if (saccadeEnd > nowMs) {
    const u = (nowMs - saccadeStart) / (saccadeEnd - saccadeStart);
    const ease = 0.5 - 0.5 * Math.cos(Math.PI * u);
    const sx = THREE.MathUtils.lerp(saccadeFrom.x, saccadeTarget.x, ease);
    const sy = THREE.MathUtils.lerp(saccadeFrom.y, saccadeTarget.y, ease);
    mx += sx; my += sy;
  } else {
    mx += saccadeTarget.x || 0; my += saccadeTarget.y || 0;
  }

  const dist = Math.sqrt(mx*mx + my*my);
  const focusFactor = dist > CONFIG.EYE_FOCUS_DIST ? THREE.MathUtils.mapLinear(dist, CONFIG.EYE_FOCUS_DIST, 1.6, 1, 0.0) : 1.0;

  const finalEyeX = THREE.MathUtils.clamp(mx * CONFIG.EYE_MAX * focusFactor, -CONFIG.EYE_MAX, CONFIG.EYE_MAX);
  const finalEyeY = THREE.MathUtils.clamp(my * CONFIG.EYE_MAX * focusFactor, -CONFIG.EYE_MAX, CONFIG.EYE_MAX);
  eyeTargetX = finalEyeX; eyeTargetY = finalEyeY;

  const talkBoost = 1.0 + CONFIG.HEAD_TALK_BOOST * Math.min(1, talkStrength);

  const headYawFromEyes = - finalEyeX * (CONFIG.HEAD_YAW_MAX / CONFIG.EYE_MAX) * talkBoost;
  const headPitchFromEyes = finalEyeY * (CONFIG.HEAD_PITCH_MAX / CONFIG.EYE_MAX) * talkBoost;

  headTargetYaw  = THREE.MathUtils.clamp(headYawFromEyes, -CONFIG.HEAD_YAW_MAX, CONFIG.HEAD_YAW_MAX);
  headTargetPitch = THREE.MathUtils.clamp(headPitchFromEyes, -CONFIG.HEAD_PITCH_MAX, CONFIG.HEAD_PITCH_MAX);
}

function applyEyeMorphs(){
  const effX = THREE.MathUtils.clamp(eyeCurrentX, -CONFIG.EYE_MAX, CONFIG.EYE_MAX);
  const leftOut = Math.max(0, effX), leftIn = Math.max(0, -effX);
  const rightOut = Math.max(0, -effX), rightIn = Math.max(0, effX);
  const upVal = Math.max(0, eyeCurrentY), downVal = Math.max(0, -eyeCurrentY);
  const eyeNames = ['eyeLookOutLeft','eyeLookInLeft','eyeLookOutRight','eyeLookInRight','eyeLookUpLeft','eyeLookUpRight','eyeLookDownLeft','eyeLookDownRight'];
  eyeNames.forEach(n=>applyMorph(n, 0, false, CONFIG.EYE_SMOOTH));
  applyMorph('eyeLookOutLeft', leftOut * CONFIG.EYE_MAX, false, CONFIG.EYE_SMOOTH);
  applyMorph('eyeLookInLeft', leftIn * CONFIG.EYE_MAX, false, CONFIG.EYE_SMOOTH);
  applyMorph('eyeLookOutRight', rightOut * CONFIG.EYE_MAX, false, CONFIG.EYE_SMOOTH);
  applyMorph('eyeLookInRight', rightIn * CONFIG.EYE_MAX, false, CONFIG.EYE_SMOOTH);
  applyMorph('eyeLookUpLeft', upVal * CONFIG.EYE_MAX, false, CONFIG.EYE_SMOOTH);
  applyMorph('eyeLookUpRight', upVal * CONFIG.EYE_MAX, false, CONFIG.EYE_SMOOTH);
  applyMorph('eyeLookDownLeft', downVal * CONFIG.EYE_MAX, false, CONFIG.EYE_SMOOTH);
  applyMorph('eyeLookDownRight', downVal * CONFIG.EYE_MAX, false, CONFIG.EYE_SMOOTH);
}

function updateEyeBehavior(dt){
  const now = performance.now();
  maybeStartSaccade(now);
  updateEyeAndHeadTargets();

  const lerpEye = 1 - Math.pow(1 - CONFIG.EYE_SMOOTH, dt * 60);
  eyeCurrentX = THREE.MathUtils.lerp(eyeCurrentX, eyeTargetX, lerpEye);
  eyeCurrentY = THREE.MathUtils.lerp(eyeCurrentY, eyeTargetY, lerpEye);

  if(!blinkState.active && now >= nextBlinkAt){
    blinkState.active = true; blinkState.start = now; blinkState.duration = CONFIG.BLINK_DURATION*1000; lastBlinkTrigger = now;
    nextBlinkAt = now + (Math.random()*(CONFIG.BLINK_MAX-CONFIG.BLINK_MIN)+CONFIG.BLINK_MIN)*1000;
  }
  if(blinkState.active){
    const t = (now - blinkState.start) / blinkState.duration;
    if(t >= 1.0){ blinkState.active = false; applyBlink(0); }
    else {
      let v;
      if(t < 0.5) v = (t/0.5); else v = (1 - ((t-0.5)/0.5));
      v = Math.sin(v * Math.PI * 0.5);
      applyBlink(v);
    }
  }
  if(!blinkState.active && now - lastBlinkTrigger > 14000) scheduleBlink(0.02);

  applyEyeMorphs();

  const lerpHead = 1 - Math.pow(1 - CONFIG.HEAD_SMOOTH, dt * 60);
  headCurrentYaw  = THREE.MathUtils.lerp(headCurrentYaw, headTargetYaw, lerpHead);
  headCurrentPitch = THREE.MathUtils.lerp(headCurrentPitch, headTargetPitch, lerpHead);

  const idle = CONFIG.HEAD_IDLE_BOB * Math.sin(performance.now() * 0.0012);
  headCurrentYaw += idle * 0.25;
}

// -------------------- Body / Head update
function updateBodyMotion(elapsed){
  if(!model) return;
  model.rotation.set(0,0,0);

  if(headBone){
    if(headRestRot){
      headBone.rotation.copy(headRestRot);
      headBone.rotation.y += headCurrentYaw;
      headBone.rotation.x += headCurrentPitch;
    } else {
      headBone.rotation.y = headCurrentYaw;
      headBone.rotation.x = headCurrentPitch;
    }
  }

  if(!audioPlaying && talkStrength < 0.05){
    // Reset gesture state when not talking
    currentGesture = 'rest';
    gestureLerp = 0;
    
    // Return to rest gradually
    if(leftShoulder && leftShoulderRest) { leftShoulder.rotation.x += (leftShoulderRest.x - leftShoulder.rotation.x) * 0.1; leftShoulder.rotation.y += (leftShoulderRest.y - leftShoulder.rotation.y) * 0.1; leftShoulder.rotation.z += (leftShoulderRest.z - leftShoulder.rotation.z) * 0.1; }
    if(rightShoulder && rightShoulderRest) { rightShoulder.rotation.x += (rightShoulderRest.x - rightShoulder.rotation.x) * 0.1; rightShoulder.rotation.y += (rightShoulderRest.y - rightShoulder.rotation.y) * 0.1; rightShoulder.rotation.z += (rightShoulderRest.z - rightShoulder.rotation.z) * 0.1; }
    if(leftArm && leftArmRest) { leftArm.rotation.x += (leftArmRest.x - leftArm.rotation.x) * 0.1; leftArm.rotation.y += (leftArmRest.y - leftArm.rotation.y) * 0.1; leftArm.rotation.z += (leftArmRest.z - leftArm.rotation.z) * 0.1; }
    if(rightArm && rightArmRest) { rightArm.rotation.x += (rightArmRest.x - rightArm.rotation.x) * 0.1; rightArm.rotation.y += (rightArmRest.y - rightArm.rotation.y) * 0.1; rightArm.rotation.z += (rightArmRest.z - rightArm.rotation.z) * 0.1; }
    if(leftForeArm && leftForeArmRest) { leftForeArm.rotation.x += (leftForeArmRest.x - leftForeArm.rotation.x) * 0.1; leftForeArm.rotation.y += (leftForeArmRest.y - leftForeArm.rotation.y) * 0.1; leftForeArm.rotation.z += (leftForeArmRest.z - leftForeArm.rotation.z) * 0.1; }
    if(rightForeArm && rightForeArmRest) { rightForeArm.rotation.x += (rightForeArmRest.x - rightForeArm.rotation.x) * 0.1; rightForeArm.rotation.y += (rightForeArmRest.y - rightForeArm.rotation.y) * 0.1; rightForeArm.rotation.z += (rightForeArmRest.z - rightForeArm.rotation.z) * 0.1; }
    if(leftHandBone && leftHandRestRot) { leftHandBone.rotation.x += (leftHandRestRot.x - leftHandBone.rotation.x) * 0.1; leftHandBone.rotation.y += (leftHandRestRot.y - leftHandBone.rotation.y) * 0.1; leftHandBone.rotation.z += (leftHandRestRot.z - leftHandBone.rotation.z) * 0.1; }
    if(rightHandBone && rightHandRestRot) { rightHandBone.rotation.x += (rightHandRestRot.x - rightHandBone.rotation.x) * 0.1; rightHandBone.rotation.y += (rightHandRestRot.y - rightHandBone.rotation.y) * 0.1; rightHandBone.rotation.z += (rightHandRestRot.z - rightHandBone.rotation.z) * 0.1; }
  } else {
    const t = elapsed;
    const s = Math.min(1, talkStrength + 0.02);
    
    if(headBone && headRestRot){
      headBone.rotation.y += 0.06 * s * Math.sin(t * 1.8);
      headBone.rotation.x += 0.03 * s * Math.sin(t * 1.1);
    }
    
    // ----------------------------------------------------------------
    // Advanced Gesture State Machine
    // ----------------------------------------------------------------
    gestureTimer -= delta; // assuming `delta` is available from clock (we will use 1/60 approximation since we only have `elapsed` here easily, wait we can just use elapsed to trigger)
    
    // Very simple state machine based on `elapsed`
    // Cycle gestures every few seconds when talking strongly
    const period = 4.0;
    const phase = (elapsed % period) / period;
    
    // Choose gesture once per cycle
    if (phase < 0.05 && s > 0.3 && gestureTimer <= 0) {
        const gestures = ['glasses', 'hair', 'clap', 'explain_one', 'explain_two', 'rest', 'rest'];
        currentGesture = gestures[Math.floor(Math.random() * gestures.length)];
        gestureTimer = 0.5; // lock for half a sec so we don't trigger multiple times in phase < 0.05
    } else if (phase > 0.1) {
        gestureTimer = 0;
    }
    
    // Default targets are the resting poses
    if(leftShoulderRest) gestureTargets.leftShoulder.copy(leftShoulderRest);
    if(rightShoulderRest) gestureTargets.rightShoulder.copy(rightShoulderRest);
    if(leftArmRest) gestureTargets.leftArm.copy(leftArmRest);
    if(rightArmRest) gestureTargets.rightArm.copy(rightArmRest);
    if(leftForeArmRest) gestureTargets.leftForeArm.copy(leftForeArmRest);
    if(rightForeArmRest) gestureTargets.rightForeArm.copy(rightForeArmRest);
    if(leftHandRestRot) gestureTargets.leftHand.copy(leftHandRestRot);
    if(rightHandRestRot) gestureTargets.rightHand.copy(rightHandRestRot);

    // Apply specific poses based on current gesture
    const isPlayingGesture = currentGesture !== 'rest';
    const gStrength = isPlayingGesture ? Math.sin(phase * Math.PI) : 0; // Curve 0->1->0 over the period

    // Add breathing to shoulders regardless
    gestureTargets.leftShoulder.x += Math.sin(t * 1.2) * 0.02 * s;
    gestureTargets.rightShoulder.x += Math.sin(t * 1.2) * 0.02 * s;

    if (currentGesture === 'glasses' && leftArmRest && leftForeArmRest) {
        // Left hand comes up to face/glasses
        gestureTargets.leftArm.x -= 0.8 * gStrength;
        gestureTargets.leftArm.y += 0.4 * gStrength;
        gestureTargets.leftArm.z += 0.5 * gStrength;
        
        gestureTargets.leftForeArm.x -= 1.8 * gStrength;
        gestureTargets.leftForeArm.z -= 0.3 * gStrength;
        
        gestureTargets.leftHand.y += 0.6 * gStrength;
    } 
    else if (currentGesture === 'hair' && rightArmRest && rightForeArmRest) {
        // Right hand brushes hair behind ear
        gestureTargets.rightArm.x -= 1.0 * gStrength;
        gestureTargets.rightArm.y -= 0.3 * gStrength;
        gestureTargets.rightArm.z -= 0.6 * gStrength;
        
        gestureTargets.rightForeArm.x -= 2.0 * gStrength;
        gestureTargets.rightForeArm.y += 0.5 * gStrength;
        
        gestureTargets.rightHand.x += 0.6 * gStrength;
        gestureTargets.rightHand.z += 0.5 * gStrength;
    }
    else if (currentGesture === 'clap' && leftArmRest && rightArmRest) {
        // Both hands come together in front of chest (like a reporter)
        gestureTargets.leftArm.x -= 0.4 * gStrength;
        gestureTargets.leftArm.z += 0.4 * gStrength;
        gestureTargets.rightArm.x -= 0.4 * gStrength;
        gestureTargets.rightArm.z -= 0.4 * gStrength;
        
        gestureTargets.leftForeArm.x -= 1.2 * gStrength;
        gestureTargets.leftForeArm.z -= 0.6 * gStrength;
        gestureTargets.rightForeArm.x -= 1.2 * gStrength;
        gestureTargets.rightForeArm.z += 0.6 * gStrength;
        
        // Add minimal up/down motion for emphasis
        gestureTargets.leftArm.x += Math.sin(t * 8) * 0.05 * gStrength;
        gestureTargets.rightArm.x += Math.sin(t * 8) * 0.05 * gStrength;
    }
    else if (currentGesture === 'explain_one' && rightArmRest) {
        // One hand outward palm open
        gestureTargets.rightArm.x -= 0.3 * gStrength;
        gestureTargets.rightArm.z += 0.3 * gStrength;
        gestureTargets.rightForeArm.x -= 1.0 * gStrength;
        gestureTargets.rightForeArm.y -= 0.5 * gStrength; // Palm up
        
        gestureTargets.rightHand.y -= 0.4 * gStrength;
        
        // Add speaking emphasis bobbing
        gestureTargets.rightArm.x += Math.sin(t * 6) * 0.08 * gStrength;
    }
    else if (currentGesture === 'explain_two' && leftArmRest && rightArmRest) {
        // Both hands outward explaining
        gestureTargets.leftArm.x -= 0.2 * gStrength;
        gestureTargets.leftArm.z += 0.5 * gStrength;
        gestureTargets.rightArm.x -= 0.2 * gStrength;
        gestureTargets.rightArm.z -= 0.5 * gStrength;
        
        gestureTargets.leftForeArm.x -= 0.8 * gStrength;
        gestureTargets.rightForeArm.x -= 0.8 * gStrength;
        
        // Add speaking emphasis bobbing
        gestureTargets.leftArm.x += Math.sin(t * 4) * 0.06 * gStrength;
        gestureTargets.rightArm.x += Math.sin(t * 4.2) * 0.06 * gStrength;
    }
    else {
        // Default talking micro-movements (rest state while talking)
        const micro = 0.5 * s;
        if(leftArmRest) { gestureTargets.leftArm.x -= Math.sin(t * 1.5) * 0.1 * micro; gestureTargets.leftArm.z -= Math.abs(Math.sin(t * 0.75)) * 0.15 * micro; }
        if(rightArmRest) { gestureTargets.rightArm.x -= Math.sin(t * 1.5 + 0.5) * 0.1 * micro; gestureTargets.rightArm.z += Math.abs(Math.sin(t * 0.75 + 0.5)) * 0.15 * micro; }
        if(leftForeArmRest) { gestureTargets.leftForeArm.x -= Math.abs(Math.sin(t * 1.65)) * 0.2 * micro; gestureTargets.leftForeArm.z += Math.sin(t * 1.2) * 0.1 * micro; }
        if(rightForeArmRest) { gestureTargets.rightForeArm.x -= Math.abs(Math.sin(t * 1.65 + 0.5)) * 0.2 * micro; gestureTargets.rightForeArm.z -= Math.sin(t * 1.2 + 0.3) * 0.1 * micro; }
    }

    // Smoothly apply targets to actual bones
    const lerpRate = 0.12; // Speed of transition
    if(leftShoulder) { leftShoulder.rotation.x += (gestureTargets.leftShoulder.x - leftShoulder.rotation.x) * lerpRate; leftShoulder.rotation.y += (gestureTargets.leftShoulder.y - leftShoulder.rotation.y) * lerpRate; leftShoulder.rotation.z += (gestureTargets.leftShoulder.z - leftShoulder.rotation.z) * lerpRate; }
    if(rightShoulder) { rightShoulder.rotation.x += (gestureTargets.rightShoulder.x - rightShoulder.rotation.x) * lerpRate; rightShoulder.rotation.y += (gestureTargets.rightShoulder.y - rightShoulder.rotation.y) * lerpRate; rightShoulder.rotation.z += (gestureTargets.rightShoulder.z - rightShoulder.rotation.z) * lerpRate; }
    if(leftArm) { leftArm.rotation.x += (gestureTargets.leftArm.x - leftArm.rotation.x) * lerpRate; leftArm.rotation.y += (gestureTargets.leftArm.y - leftArm.rotation.y) * lerpRate; leftArm.rotation.z += (gestureTargets.leftArm.z - leftArm.rotation.z) * lerpRate; }
    if(rightArm) { rightArm.rotation.x += (gestureTargets.rightArm.x - rightArm.rotation.x) * lerpRate; rightArm.rotation.y += (gestureTargets.rightArm.y - rightArm.rotation.y) * lerpRate; rightArm.rotation.z += (gestureTargets.rightArm.z - rightArm.rotation.z) * lerpRate; }
    if(leftForeArm) { leftForeArm.rotation.x += (gestureTargets.leftForeArm.x - leftForeArm.rotation.x) * lerpRate; leftForeArm.rotation.y += (gestureTargets.leftForeArm.y - leftForeArm.rotation.y) * lerpRate; leftForeArm.rotation.z += (gestureTargets.leftForeArm.z - leftForeArm.rotation.z) * lerpRate; }
    if(rightForeArm) { rightForeArm.rotation.x += (gestureTargets.rightForeArm.x - rightForeArm.rotation.x) * lerpRate; rightForeArm.rotation.y += (gestureTargets.rightForeArm.y - rightForeArm.rotation.y) * lerpRate; rightForeArm.rotation.z += (gestureTargets.rightForeArm.z - rightForeArm.rotation.z) * lerpRate; }
    if(leftHandBone) { leftHandBone.rotation.x += (gestureTargets.leftHand.x - leftHandBone.rotation.x) * lerpRate; leftHandBone.rotation.y += (gestureTargets.leftHand.y - leftHandBone.rotation.y) * lerpRate; leftHandBone.rotation.z += (gestureTargets.leftHand.z - leftHandBone.rotation.z) * lerpRate; }
    if(rightHandBone) { rightHandBone.rotation.x += (gestureTargets.rightHand.x - rightHandBone.rotation.x) * lerpRate; rightHandBone.rotation.y += (gestureTargets.rightHand.y - rightHandBone.rotation.y) * lerpRate; rightHandBone.rotation.z += (gestureTargets.rightHand.z - rightHandBone.rotation.z) * lerpRate; }
  }

  if(keyLight && backGlow){
    const kx = THREE.MathUtils.clamp(mouseX * 4.0, -6, 6);
    const ky = THREE.MathUtils.clamp(1.6 + mouseY * 2.6, 0.8, 6);
    keyLight.position.x += (kx - keyLight.position.x) * 0.08;
    keyLight.position.y += (ky - keyLight.position.y) * 0.08;
    backGlow.position.x += (mouseX * 2.6 - backGlow.position.x) * 0.06;
    backGlow.position.y += (1.8 + mouseY * 1.4 - backGlow.position.y) * 0.06;
  }
}

// -------------------- SOCKET + SpeechRecognition (MIC) wiring
const socket = io();
socket.on('connect', ()=> console.log('[socket] connected'));

// existing text submit
textSubmit?.addEventListener('click', ()=>{
  const q = queryInput.value.trim(); if(!q) return; addMessage(q,'user'); textSubmit.disabled=true; textSubmit.classList.add('loading'); textSubmit.textContent=''; if(typingIndicator) typingIndicator.classList.add('visible'); socket.emit('text_query',{ query: q }); queryInput.value='';
});
queryInput?.addEventListener('keypress', (e)=> { if(e.key === 'Enter') textSubmit.click(); });

// stop playback
stopBtn?.addEventListener('click', ()=> {
  if(recognitionActive) stopSpeechRecognition();
  if(sourceNode){ try{ sourceNode.stop(); }catch(e){} } audioPlaying=false; soundBars?.classList.remove('talking'); talkStrength=0;
});

// when server responds
socket.on('response', (data)=>{
  console.log('[socket] response', data ? { hasAudio: !!data.audio, textLen: (data.text||'').length } : data);
  if(typingIndicator) typingIndicator.classList.remove('visible');
  const text = data.text || '(no text)'; addMessage(text,'bot');
  if(data.audio) playAudioWithVisemesFromBase64(data.audio);
  textSubmit.disabled=false; textSubmit.classList.remove('loading'); textSubmit.textContent='Send';
});

// ---------- SPEECH RECOGNITION SETUP ----------
let recognition = null;
let recognitionActive = false;
let interimTranscript = '';
let finalTranscript = '';

function browserSupportsSpeechRecognition(){
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
function makeRecognition(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR) return null;
  const r = new SR();
  r.lang = navigator.language && navigator.language.startsWith('hi') ? 'hi-IN' : 'hi-IN'; // use 'hi-IN' to favor Hindi+Hinglish; change to 'en-IN' if you prefer English-first
  r.interimResults = true;
  r.maxAlternatives = 1;
  r.continuous = false; // better UX: single utterance then final result
  return r;
}

function startSpeechRecognition(){
  if(!browserSupportsSpeechRecognition()){
    addMessage('Microphone not supported in this browser. Use Chrome/Edge or fallback to typing.','system');
    return;
  }
  if(!recognition) recognition = makeRecognition();
  if(!recognition){
    addMessage('SpeechRecognition unavailable.','system');
    return;
  }

  recognitionActive = true;
  listenBtn.classList.add('listening');
  if(micIndicator) micIndicator.style.display = 'block';

  interimTranscript = ''; finalTranscript = '';

  recognition.onstart = () => {
    console.log('SR started');
    addMessage('Listening... (speak now)','system');
  };
  recognition.onerror = (ev) => {
    console.warn('SR error', ev);
    addMessage('Microphone error: ' + (ev.error || 'unknown'), 'system');
    stopSpeechRecognition();
  };
  recognition.onend = () => {
    // called when recognition stops (either because of silence or stop)
    console.log('SR ended');
    recognitionActive = false;
    listenBtn.classList.remove('listening');
    if(micIndicator) micIndicator.style.display = 'none';
  };
  recognition.onresult = (ev) => {
    interimTranscript = '';
    for(let i = ev.resultIndex; i < ev.results.length; ++i){
      const res = ev.results[i];
      if(res.isFinal){
        finalTranscript += res[0].transcript;
      } else {
        interimTranscript += res[0].transcript;
      }
    }
    // show interim result as system message (small)
    if(interimTranscript) {
      // update or add temporary node
      const existing = document.getElementById('interim-msg');
      if(existing) existing.textContent = interimTranscript;
      else {
        const node = document.createElement('div');
        node.classList.add('system-msg');
        node.id = 'interim-msg';
        node.textContent = interimTranscript;
        chatMessages.appendChild(node);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    } else {
      const existing = document.getElementById('interim-msg');
      if(existing) existing.remove();
    }

    if(finalTranscript && finalTranscript.trim().length){
      // remove interim message if any
      const existing = document.getElementById('interim-msg');
      if(existing) existing.remove();

      const userText = finalTranscript.trim();
      addMessage(userText, 'user');
      // send to server as usual
      textSubmit.disabled=true; textSubmit.classList.add('loading'); textSubmit.textContent=''; if(typingIndicator) typingIndicator.classList.add('visible');
      socket.emit('text_query', { query: userText });
      finalTranscript = ''; interimTranscript = '';
      stopSpeechRecognition(); // single-shot behaviour — restart on user tap again
    }
  };

  try{
    recognition.start();
  }catch(e){
    console.warn('SR start failed', e);
    recognitionActive = false;
    listenBtn.classList.remove('listening');
    if(micIndicator) micIndicator.style.display = 'none';
    addMessage('Could not start microphone. Please allow mic permissions and try again.','system');
  }
}

function stopSpeechRecognition(){
  if(!recognition) return;
  try{ recognition.stop(); }catch(e){}
  recognitionActive = false;
  listenBtn.classList.remove('listening');
  if(micIndicator) micIndicator.style.display = 'none';
}

// toggle listen button
listenBtn?.addEventListener('click', ()=>{
  if(recognitionActive) stopSpeechRecognition();
  else startSpeechRecognition();
});

// helpful fallback message if no support
if(!browserSupportsSpeechRecognition()){
  // mark button visually to show not supported
  listenBtn.title = 'Microphone listening not supported in this browser';
  listenBtn.style.opacity = '0.6';
}

// -------------------- animate
const clock = new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;
  if(mixer) mixer.update(delta);
  updateBodyMotion(elapsed);
  updateEyeBehavior(delta);
  if(holoGroup){
      holoGroup.rotation.y = Math.sin(elapsed * 0.8) * 0.06;
      const baseScale = 1.0;
      const pulse = baseScale * (1.0 + 0.015 * Math.sin(elapsed * 3.5) + 0.05 * (audioPlaying ? talkStrength : 0));
      holoGroup.scale.set(pulse, pulse, pulse);

      holoGroup.traverse((obj) => {
          if (obj.isMesh && obj.material && obj.material.opacity !== undefined) {
              const target = audioPlaying ? 0.95 : 0.70;
              obj.material.opacity = THREE.MathUtils.lerp(obj.material.opacity, target, 0.05);
              obj.material.depthWrite = false;
          }
      });
  }
  renderer.render(scene, camera);
}
animate();

// -------------------- utils
function downloadTimelineJSON(){ if(!CONFIG.TIMELINE_RECORD || !timeline.length){ console.log('no timeline'); return; } const blob = new Blob([JSON.stringify({ recordedAt: new Date().toISOString(), timeline }, null, 2)], { type:'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `viseme_timeline_${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
