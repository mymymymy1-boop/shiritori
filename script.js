// ====== 設定・変数定義 ======
const Engine = Matter.Engine,
    Render = Matter.Render,
    Runner = Matter.Runner,
    MouseConstraint = Matter.MouseConstraint,
    Mouse = Matter.Mouse,
    World = Matter.World,
    Bodies = Matter.Bodies,
    Composite = Matter.Composite,
    Events = Matter.Events;

let engine, render, runner, world;
let shiritoriData = [];
let targetKana = '？';
let score = 0;

// キャンバス設定
const canvas = document.getElementById('game-canvas');

// DOM 要素
const currentKanaEl = document.getElementById('current-kana');
const scoreEl = document.getElementById('score-value');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const messageOverlay = document.getElementById('message-overlay');
const messageBox = document.getElementById('message-box');

// 音声合成
const synth = window.speechSynthesis;

// ====== ユーティリティ関数 ======
// 小文字を大文字に、長音符を除外した「しりとり用」の最後の文字を取得
function getLastKana(reading) {
    if (!reading) return '';
    let text = reading.replace(/ー/g, ''); // 長音符削除
    const char = text.charAt(text.length - 1);
    const smallMap = {
        'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
        'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ'
    };
    return smallMap[char] || char;
}

function getFirstKana(reading) {
    return reading.charAt(0);
}

function speakWord(text) {
    synth.cancel();
    const utterThis = new SpeechSynthesisUtterance(text);
    utterThis.lang = 'ja-JP';
    utterThis.rate = 0.9;
    utterThis.pitch = 1.2;
    synth.speak(utterThis);
}

// ====== Matter.js 初期化 ======
function initPhysics() {
    engine = Engine.create();
    world = engine.world;
    engine.world.gravity.y = 0.3; // ふわふわ落ちるアンチグラビティ風

    render = Render.create({
        canvas: canvas,
        engine: engine,
        options: {
            width: window.innerWidth,
            height: window.innerHeight,
            background: 'transparent',
            wireframes: false,
            pixelRatio: window.devicePixelRatio
        }
    });

    Render.run(render);
    runner = Runner.create();
    Runner.run(runner, engine);

    const wallOptions = { isStatic: true, render: { visible: false } };
    const w = window.innerWidth;
    const h = window.innerHeight;
    const thickness = 60;

    World.add(world, [
        Bodies.rectangle(w / 2, h + thickness / 2, w + 200, thickness, wallOptions),
        Bodies.rectangle(-thickness / 2, h / 2, thickness, h * 2, wallOptions),
        Bodies.rectangle(w + thickness / 2, h / 2, thickness, h * 2, wallOptions)
    ]);

    const mouse = Mouse.create(render.canvas);
    const mouseConstraint = MouseConstraint.create(engine, {
        mouse: mouse,
        constraint: {
            stiffness: 0.2,
            render: { visible: false }
        }
    });
    World.add(world, mouseConstraint);
    render.mouse = mouse;

    let mousedownPosition = null;
    let mousedownTime = 0;

    Events.on(mouseConstraint, 'mousedown', (event) => {
        const body = mouseConstraint.body;
        if (body && body.wordData) {
            mousedownPosition = { x: mouse.position.x, y: mouse.position.y };
            mousedownTime = new Date().getTime();
        }
    });

    Events.on(mouseConstraint, 'mouseup', (event) => {
        const body = mouseConstraint.body;
        if (body && body.wordData && mousedownPosition) {
            const dx = mouse.position.x - mousedownPosition.x;
            const dy = mouse.position.y - mousedownPosition.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const timeDiff = new Date().getTime() - mousedownTime;

            // タップ判定
            if (distance < 20 && timeDiff < 500) {
                handleCardTap(body);
            }
        }
        mousedownPosition = null;
    });

    // カスタム描画
    Events.on(render, 'afterRender', () => {
        const context = render.context;
        const bodies = Composite.allBodies(world);

        bodies.forEach(body => {
            if (body.wordData) {
                const x = body.position.x;
                const y = body.position.y;
                const angle = body.angle;
                const word = body.wordData;
                const size = body.circleRadius * 2 || body.bounds.max.x - body.bounds.min.x;

                context.translate(x, y);
                context.rotate(angle);

                context.fillStyle = 'rgba(255, 255, 255, 0.9)';
                context.shadowColor = 'rgba(0, 0, 0, 0.15)';
                context.shadowBlur = 15;
                context.shadowOffsetY = 8;

                context.beginPath();
                context.arc(0, 0, size / 2, 0, 2 * Math.PI);
                context.fill();

                context.shadowColor = 'transparent';

                context.lineWidth = 4;
                context.strokeStyle = word.is_trap ? '#ff4757' : '#7bed9f';
                context.stroke();

                context.fillStyle = '#2D3142';
                context.textAlign = 'center';
                context.textBaseline = 'middle';

                let fontSize = size * 0.25;
                if (word.name.length > 4) fontSize = size * 0.18;
                if (word.name.length > 6) fontSize = size * 0.13;

                context.font = `900 ${fontSize}px 'Zen Maru Gothic', sans-serif`;
                context.fillText(word.name, 0, 0);

                context.rotate(-angle);
                context.translate(-x, -y);
            }
        });
    });
}

function spawnCard(x, y, data) {
    const radius = Math.min(window.innerWidth, window.innerHeight) * 0.12;
    const card = Bodies.circle(x, y, radius, {
        restitution: 0.6,
        friction: 0.1,
        density: 0.005,
        render: { visible: false }
    });

    card.wordData = data;
    World.add(world, card);
}

function fillCards(count) {
    const w = window.innerWidth;
    for (let i = 0; i < count; i++) {
        const randomWord = shiritoriData[Math.floor(Math.random() * shiritoriData.length)];
        const x = w * 0.1 + Math.random() * w * 0.8;
        const y = -100 - Math.random() * 500;
        spawnCard(x, y, randomWord);
    }
}

function showMessage(text, isError) {
    messageBox.textContent = text;
    messageBox.style.background = isError ? 'rgba(255, 75, 75, 0.95)' : 'rgba(96, 211, 148, 0.95)';
    messageOverlay.classList.remove('hidden');

    if (isError) {
        document.body.classList.add('shake');
        setTimeout(() => document.body.classList.remove('shake'), 500);
    }

    setTimeout(() => {
        messageOverlay.classList.add('hidden');
    }, 2000);
}

function fireConfetti() {
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FF7B9C', '#60D394', '#FFD166']
    });
}

function handleCardTap(body) {
    const word = body.wordData;
    speakWord(word.name);

    if (word.is_trap && getLastKana(word.reading) === 'ん') {
        showMessage('「ん」がついたよ！どかん！💣', true);
        setTimeout(() => speakWord('ん、がついたから、やりなおし！'), 1000);
        score = Math.max(0, score - 1);
        scoreEl.textContent = score;

        Composite.remove(world, body);
        fillCards(1);
        return;
    }

    const firstKana = getFirstKana(word.reading);
    const lastKana = getLastKana(word.reading);

    if (targetKana === '？' || targetKana === firstKana) {
        if (targetKana !== '？') {
            fireConfetti();
        }

        targetKana = lastKana;
        currentKanaEl.textContent = targetKana;
        score++;
        scoreEl.textContent = score;

        Composite.remove(world, body);

        spawnNextHintCard(lastKana);
        fillCards(2);

    } else {
        showMessage('ちがうよ！「' + targetKana + '」から探してね！', true);
        setTimeout(() => speakWord('ぶっぶー！'), 800);

        Matter.Body.applyForce(body, body.position, {
            x: (Math.random() - 0.5) * 0.5,
            y: -0.5
        });
    }
}

function spawnNextHintCard(startingKana) {
    const hints = shiritoriData.filter(w => getFirstKana(w.reading) === startingKana && getLastKana(w.reading) !== 'ん');
    if (hints.length > 0) {
        const hintWord = hints[Math.floor(Math.random() * hints.length)];
        const x = window.innerWidth * 0.2 + Math.random() * window.innerWidth * 0.6;
        spawnCard(x, -200, hintWord);
    }
}

async function loadDataAndStart() {
    try {
        const response = await fetch('data.json');
        shiritoriData = await response.json();
    } catch (e) {
        console.error("データの読み込みに失敗しました", e);
        shiritoriData = [
            { "id": 1, "name": "あり", "reading": "あり", "category": "昆虫", "season": "春", "is_trap": false },
            { "id": 10, "name": "みかん", "reading": "みかん", "category": "果物", "season": "冬", "is_trap": true }
        ];
    }
    initPhysics();
}

startBtn.addEventListener('click', () => {
    speakWord("しりとり、スタート！");
    startScreen.style.opacity = '0';
    setTimeout(() => {
        startScreen.style.display = 'none';
        fillCards(12);
    }, 500);
});

window.onload = loadDataAndStart;
