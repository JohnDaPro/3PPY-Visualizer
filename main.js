import * as THREE from 'three';

// ─── UI Elements ───────────────────────────────────────────────────────────────
const launchScreen  = document.getElementById('launch-screen');
const dropZone      = document.getElementById('drop-zone');
const fileInput     = document.getElementById('file-input');
const browseBtn     = document.getElementById('browse-btn');
const filePreview   = document.getElementById('file-preview');
const fileName      = document.getElementById('file-name');
const clearFileBtn  = document.getElementById('clear-file');
const startBtn      = document.getElementById('start-btn');
const sliderWrap    = document.getElementById('slider-wrap');
const songSlider    = document.getElementById('song-slider');

// ─── File Selection ────────────────────────────────────────────────────────────
let selectedFile = null;

const SUPPORTED_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']);

function setFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) return;
    selectedFile = file;
    fileName.textContent = file.name;
    filePreview.classList.remove('hidden');
    dropZone.classList.add('hidden');
    startBtn.disabled = false;
}

function clearFile() {
    selectedFile = null;
    fileInput.value = '';
    filePreview.classList.add('hidden');
    dropZone.classList.remove('hidden');
    startBtn.disabled = true;
}

browseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => setFile(fileInput.files[0]));
clearFileBtn.addEventListener('click', clearFile);

// Drag & Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    setFile(e.dataTransfer.files[0]);
});

dropZone.addEventListener('click', () => fileInput.click());

// ─── Launch ────────────────────────────────────────────────────────────────────
startBtn.addEventListener('click', () => {
    if (!selectedFile) return;
    launchScreen.style.transition = 'opacity 0.8s';
    launchScreen.style.opacity = '0';
    setTimeout(() => {
        launchScreen.style.display = 'none';
        startVisualizer(selectedFile);
    }, 800);
});

// ─── Visualizer ────────────────────────────────────────────────────────────────
function startVisualizer(audioFile) {

    // ── Renderer ────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // ── Scene & Camera ──────────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(0, 0, 30);

    // ── Lights ──────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    scene.add(new THREE.PointLight(0xffffff, 1000, 5000, 1.2));

    // ── Audio Setup ─────────────────────────────────────────────────────────
    const listener    = new THREE.AudioListener();
    const sound       = new THREE.Audio(listener);
    const audioLoader = new THREE.AudioLoader();
    const FFT_SIZE    = 4096;
    const analyser    = new THREE.AudioAnalyser(sound, FFT_SIZE);

    camera.add(listener);

    let freqs = new Float32Array(FFT_SIZE / 2).fill(0);
    let bass, mids, highs;

    function getAvgVolume(startHz, endHz) {
        const nyquist  = analyser.analyser.context.sampleRate / 2;
        const binSize  = nyquist / analyser.analyser.frequencyBinCount;
        const startBin = Math.floor(startHz / binSize);
        const endBin   = Math.ceil(endHz  / binSize);
        let sum = 0;
        for (let i = startBin; i <= endBin; i++) sum += freqs[i];
        return sum / (endBin - startBin + 1);
    }

    // Load the local file via object URL
    const objectUrl = URL.createObjectURL(audioFile);
    let startTime = 0;

    audioLoader.load(objectUrl, (buffer) => {
        sound.setBuffer(buffer);
        sound.setVolume(1);
        sound.play();
        songSlider.max   = buffer.duration;
        songSlider.value = 0;
        renderer.setAnimationLoop(animate);

        // Show slider, then fade it out
        sliderWrap.style.opacity = '1';
        setTimeout(() => { sliderWrap.style.opacity = '0'; }, 3000);

        URL.revokeObjectURL(objectUrl); // free memory once loaded
    });

    function seekTo(seconds) {
        if (sound.isPlaying) sound.stop();
        sound.offset  = seconds;
        startTime     = sound.context.currentTime;
        songSlider.value = seconds;
        sound.play();
    }

    songSlider.addEventListener('input', () => seekTo(parseFloat(songSlider.value)));

    // ── Sphere ──────────────────────────────────────────────────────────────
    const sphereGeo = new THREE.SphereGeometry(5, 64, 64);
    const sphereMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        wireframe: true,
        side: THREE.BackSide,
        transparent: true,
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(sphere);

    const origSpherePos = sphereGeo.attributes.position.array.slice();
    const offsets  = new Float32Array(origSpherePos.length);
    const phases   = new Float32Array(origSpherePos.length);
    for (let i = 0; i < origSpherePos.length; i++) {
        offsets[i] = Math.random() * 0.2 - 0.1;
        phases[i]  = Math.random() * Math.PI * 2;
    }

    // ── Room Planes ─────────────────────────────────────────────────────────
    const ROOM = 500;
    const planeGeo = new THREE.PlaneGeometry(ROOM, ROOM, 50, 50);
    const planeMat = new THREE.MeshStandardMaterial({ wireframe: true, vertexColors: true });

    const vertexCount = planeGeo.attributes.position.count;
    const colors      = new Float32Array(vertexCount * 3);
    const prevHeight  = new Float32Array(vertexCount * 3);
    planeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    function makePlane(posX, posY, posZ, rotX, rotY) {
        const m = new THREE.Mesh(planeGeo, planeMat);
        m.position.set(posX, posY, posZ);
        m.rotation.set(rotX, rotY, 0);
        m.frustumCulled = false;
        scene.add(m);
        return m;
    }

    const plane = makePlane(0, 0, -ROOM / 2, 0, 0);

    planeGeo.computeBoundingSphere();

    makePlane(-ROOM / 2, 0, 0, 0, Math.PI / 2);
    makePlane( ROOM / 2, 0, 0, 0, -Math.PI / 2);
    makePlane(0, ROOM / 2, 0, Math.PI / 2, 0);
    makePlane(0, 0, ROOM / 2, 0, Math.PI);
    makePlane(0, -ROOM / 2, 0, -Math.PI / 2, 0);

    const origPlanePos = planeGeo.attributes.position.array.slice();

    // ── Pulse System ────────────────────────────────────────────────────────
    let pulses = [];
    let decay  = null;

    // ── Time ────────────────────────────────────────────────────────────────
    let t = 0, dt = 0;

    // ── Animation Loop ──────────────────────────────────────────────────────
    function animate(time) {
        time *= 0.001;
        dt = time - t;
        t  = time;

        // Slider sync
        songSlider.value = sound.context.currentTime + sound.offset - startTime;

        // Frequency data
        freqs = analyser.getFrequencyData();
        bass  = Math.exp(getAvgVolume(20, 250) / 255) * 1.5;
        mids  = Math.exp(getAvgVolume(250, 2000) / 255);
        highs = Math.exp(getAvgVolume(2000, 8000) / 255) * 1.6;

        let avgfreq = analyser.getAverageFrequency() / 255 * 5 + 1;
        avgfreq *= Math.exp(avgfreq / 20);

        // Sphere colour
        sphereMat.color.setHSL((time / 50 + bass * mids * highs * 0.05) % 1, 1, 0.5);

        // Sphere rotation
        sphere.rotation.x +=  dt / 10 + Math.exp(bass * highs * mids * 0.2) / 1000;
        sphere.rotation.z -= dt / 10 + Math.exp(bass * highs * mids * 0.2) / 1000;

        // Camera orbit
        camera.position.set(
            Math.sin(time / 2) * 60,
           -Math.cos(time / 3) * 60,
            Math.cos(time / 2) * 60,
        );
        camera.lookAt(0, 0, 0);

        // Pulse update
        for (let p = pulses.length - 1; p >= 0; p--) {
            pulses[p].time += dt * 3;
            if (pulses[p].time > 1) {
                pulses.splice(p, 1);
                if (pulses.length === 0)
                    decay = { time: 0, strength: Math.random() * 0.25 + 0.25 };
            }
        }

        let pulseSum = 0;
        for (const p of pulses) pulseSum += Math.sin(Math.PI * p.time) * p.strength;
        const pulseScale = 1 + pulseSum;

        let decayStrength = 0;
        if (decay && pulses.length === 0) {
            decay.time  += dt;
            decayStrength = -Math.sin(decay.time * 10) * Math.exp(-decay.time * 2) * decay.strength;
            if (decay.time > 5) { decay = null; decayStrength = 0; }
        }

        // Sphere vertex deform
        const positions = sphere.geometry.attributes.position;

        for (let i = 0; i < positions.count; i++) {

            const ox = origSpherePos[i * 3];
            const oy = origSpherePos[i * 3 + 1];
            const oz = origSpherePos[i * 3 + 2];

            positions.setXYZ(
                i,
                (ox * pulseScale + Math.sin(time * 10 + phases[i * 3]) * offsets[i * 3] * Math.exp(bass) / 8) * (1 + decayStrength) * (bass * mids * highs * 0.2 + 1),
                (oy * pulseScale + Math.sin(time * 10 + phases[i * 3 + 1]) * offsets[i * 3 + 1] * Math.exp(bass) / 8) * (1 + decayStrength) * (bass * mids * highs * 0.2 + 1),
                (oz * pulseScale + Math.sin(time * 10 + phases[i * 3 + 2]) * offsets[i * 3 + 2] * Math.exp(bass) / 8) * (1 + decayStrength) * (bass * mids * highs * 0.2 + 1),
            );
        }


        // Wrap seam
        const { widthSegments, heightSegments } = sphereGeo.parameters;
        for (let y = 0; y <= heightSegments; y++) {
            const first = y * (widthSegments + 1);
            positions.setXYZ(first + widthSegments,
                positions.getX(first), positions.getY(first), positions.getZ(first));
        }
        positions.needsUpdate = true;

        // Plane vertex deform
        const planePos = plane.geometry.attributes.position;

        for (let i = 0; i < planePos.count; i++) {

            const ox = origPlanePos[i * 3];
            const oy = origPlanePos[i * 3 + 1];
            const oz = origPlanePos[i * 3 + 2];

            let maxDist = Math.sqrt((ROOM) ** 2 + (ROOM) ** 2);
            let distNorm = Math.sqrt(ox * ox + oy * oy) / maxDist;

            let dist = Math.floor(distNorm * (freqs.length / 2 - 1));
            dist = Math.max(0, Math.min(dist, freqs.length / 2 - 1));

            let offset = freqs[dist];

            // Color assignment
            let color = new THREE.Color().setHSL(1 - offset / 128, 1, 0.5);

            colors[i * 3]     = color.r * (0.4 - dist / maxDist) * 2;
            colors[i * 3 + 1] = color.g * (0.4 - dist / maxDist) * 2;
            colors[i * 3 + 2] = color.b * (0.4 - dist / maxDist) * 2;

            // Set maximum to each frequency for smoothness
            if (oz + offset * 0.8 > prevHeight[i * 3 + 2]) {

                planePos.setXYZ(
                    i,
                    ox,
                    oy,
                    oz + offset * 0.8,
                );

                prevHeight[i * 3 + 2] = oz + offset * 0.8;

            } else {

                prevHeight[i * 3 + 2] -= dt * 300;

                planePos.setXYZ(
                    i,
                    ox,
                    oy,
                    prevHeight[i * 3 + 2],
                );
            }
        }

        planePos.needsUpdate = true;
        planeGeo.attributes.color.needsUpdate = true;

        renderer.render(scene, camera);
    }

    // ── Resize Handler ──────────────────────────────────────────────────────
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // ── Keyboard Triggers ───────────────────────────────────────────────────
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Enter')
            pulses.push({ time: 0, strength: Math.random() * 0.5 + 0.25 });
    });
}