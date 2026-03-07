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
let targetWord = null;
let targetKana = '？';
let score = 0;
let isAnimating = false; // 〇×アニメーション中はタップ無効化

// キャンバス設定
const canvas = document.getElementById('game-canvas');

// DOM 要素
const targetImageEl = document.getElementById('target-image');
const targetNameEl = document.getElementById('target-name');
const targetKanaHintEl = document.getElementById('target-kana-hint');
const scoreEl = document.getElementById('score-value');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const feedbackOverlay = document.getElementById('feedback-overlay');
const feedbackMark = document.getElementById('feedback-mark');
const feedbackText = document.getElementById('feedback-text');

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

// ====== クイズ進行管理 ======
function setTargetWord(wordData) {
    targetWord = wordData;
    targetKana = getLastKana(wordData.reading);

    targetNameEl.textContent = wordData.name;

    // お題画像のキャッシュ対策
    if (wordData.image) {
        // 画像読み込みエラー時のフォールバック用に onerror を登録する
        targetImageEl.onerror = () => {
            targetImageEl.style.display = 'none';
            targetNameEl.style.fontSize = '40px';
        };
        targetImageEl.onload = () => {
            targetImageEl.style.display = 'block';
            targetNameEl.style.fontSize = '24px';
        };
        targetImageEl.src = `img/${encodeURIComponent(wordData.image)}?t=${new Date().getTime()}`;
    } else {
        targetImageEl.style.display = 'none';
        targetImageEl.src = "";
        targetNameEl.style.fontSize = '40px';
    }

    targetKanaHintEl.textContent = targetKana;
}

function showFeedback(isCorrect, tappedWordData, physicsBody) {
    isAnimating = true;

    feedbackMark.textContent = isCorrect ? '〇' : '×';
    feedbackMark.className = isCorrect ? 'correct' : 'incorrect';
    feedbackText.textContent = tappedWordData.reading;

    feedbackOverlay.classList.remove('hidden');
    feedbackOverlay.classList.add('anim-pop');

    if (isCorrect) {
        speakWord("せいかい！" + tappedWordData.name);
        fireConfetti();
        score++;
        scoreEl.textContent = score;
    } else {
        speakWord("ぶっぶー！" + tappedWordData.name);
        document.body.classList.add('shake');
        setTimeout(() => document.body.classList.remove('shake'), 500);

        // 不正解の場合は減点
        score = Math.max(0, score - 1);
        scoreEl.textContent = score;
    }

    // アニメーション終了時の処理 (1.5秒後)
    setTimeout(() => {
        feedbackOverlay.classList.add('hidden');
        feedbackOverlay.classList.remove('anim-pop');

        if (isCorrect) {
            // 正解したカードを消して、それをお題にする
            Composite.remove(world, physicsBody);
            setTargetWord(tappedWordData);

            // 新しい正解候補(必ず1つは含まれる)とダミーを少し降らせる
            spawnNextHintCards(getLastKana(tappedWordData.reading), 5);
        } else {
            // 不正解のカードは上に弾き飛ばす
            Matter.Body.applyForce(physicsBody, physicsBody.position, {
                x: (Math.random() - 0.5) * 0.5,
                y: -1.0
            });
        }

        isAnimating = false;
    }, 1500);
}

function fireConfetti() {
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FF7B9C', '#60D394', '#FFD166']
    });
}

// ====== Matter.js 初期化 ======
function initPhysics() {
    engine = Engine.create();
    world = engine.world;
    engine.world.gravity.y = 0.2; // 少しゆっくり落ちる設定

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

    // 独自のクリック処理の実装（MouseConstraintの誤動作を完全に防ぐ）
    const getClickedBody = (x, y) => {
        const bodies = Composite.allBodies(world).filter(b => b.wordData);
        const clickedBodies = Matter.Query.point(bodies, { x, y });
        return clickedBodies.length > 0 ? clickedBodies[0] : null;
    };

    // スマホのタップとPCのクリック両方に対応
    canvas.addEventListener('pointerdown', (e) => {
        if (isAnimating) return;
        mousedownPosition = { x: e.clientX, y: e.clientY };
        mousedownTime = new Date().getTime();
    });

    canvas.addEventListener('pointerup', (e) => {
        if (isAnimating || !mousedownPosition) return;

        const x = e.clientX;
        const y = e.clientY;
        const dx = x - mousedownPosition.x;
        const dy = y - mousedownPosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const timeDiff = new Date().getTime() - mousedownTime;

        // ドラッグではなく「クリック」とみなす
        if (distance < 30 && timeDiff < 1000) {
            const body = getClickedBody(x, y);
            if (body) {
                handleCardTap(body);
            }
        }
        mousedownPosition = null;
    });

    // カスタム描画 (カードの見た目。画像があれば画像、なければ文字)
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

                // カードの背景（白ベース）
                context.fillStyle = 'rgba(255, 255, 255, 0.95)';
                context.shadowColor = 'rgba(0, 0, 0, 0.2)';
                context.shadowBlur = 15;
                context.shadowOffsetY = 8;

                // 角丸四角形じゃなく円ベースでいきます（可愛いので）
                context.beginPath();
                context.arc(0, 0, size / 2, 0, 2 * Math.PI);
                context.fill();

                context.shadowColor = 'transparent';

                // トラップ（ん）は赤い枠線
                context.lineWidth = 4;
                context.strokeStyle = word.is_trap ? '#ff4757' : '#60D394';
                context.stroke();

                // 画像表示を優先、なければまたは読み込み失敗ならテキスト描画
                if (word.image && word.imageLoaded && word.imgElement && word.imgElement.complete && word.imgElement.naturalWidth !== 0) {
                    // クリップ用のパスを作成して画像を円形に切り抜く
                    context.save();
                    context.beginPath();
                    context.arc(0, 0, size / 2 * 0.9, 0, 2 * Math.PI); // 少し小さめにクリップして枠線を残す
                    context.clip();
                    // 画像を描画 (中央配置)
                    const imgSize = size * 0.9;
                    context.drawImage(word.imgElement, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
                    context.restore();
                } else {
                    // 画像がない or 読み込み中の場合はテキスト表示
                    context.fillStyle = '#2D3142';
                    context.textAlign = 'center';
                    context.textBaseline = 'middle';

                    let fontSize = size * 0.25;
                    if (word.name.length > 4) fontSize = size * 0.18;
                    if (word.name.length > 6) fontSize = size * 0.13;

                    context.font = `900 ${fontSize}px 'Zen Maru Gothic', sans-serif`;
                    context.fillText(word.name, 0, 0);
                }

                context.rotate(-angle);
                context.translate(-x, -y);
            }
        });
    });
}

function spawnCard(x, y, data) {
    // 画面サイズに応じてカードの大きさを調整 (以前は0.15)
    const radius = Math.min(window.innerWidth, window.innerHeight) * 0.08;
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
        // 上から降ってくるようにマイナスのY座標に配置
        const x = w * 0.1 + Math.random() * w * 0.8;
        const y = -100 - Math.random() * 500;
        spawnCard(x, y, randomWord);
    }
}

function spawnNextHintCards(startingKana, totalCount) {
    // 次に正解となる候補を探す (ん で終わらない、かつ、ん のトラップも避ける)
    let hints = shiritoriData.filter(w => getFirstKana(w.reading) === startingKana && getLastKana(w.reading) !== 'ん');

    // もし手持ちのデータに続く言葉がない場合（行き止まり）
    if (hints.length === 0) {
        console.log("行き止まり！新しいお題に切り替えます。");
        // ん で終わらないランダムな単語を新しくお題にする
        const validWords = shiritoriData.filter(w => getLastKana(w.reading) !== 'ん');
        const newWord = validWords[Math.floor(Math.random() * validWords.length)];

        // 強制的にお題を切り替える
        setTargetWord(newWord);
        speakWord("つづく言葉がなくなったから、あたらしいお題にするね！" + newWord.name);

        // 新しいお題の続く言葉を再検索
        hints = shiritoriData.filter(w => getFirstKana(w.reading) === getLastKana(newWord.reading) && getLastKana(w.reading) !== 'ん');
    }

    // 必ず1つは正解を混ぜる
    if (hints.length > 0) {
        const hintWord = hints[Math.floor(Math.random() * hints.length)];
        const x = window.innerWidth * 0.2 + Math.random() * window.innerWidth * 0.6;
        spawnCard(x, -200, hintWord);
    }

    // 残りをランダムなダミーカードで埋める
    fillCards(totalCount - 1);
}

function handleCardTap(body) {
    const word = body.wordData;

    // ん で終わるトラップの場合は不正解扱い
    if (word.is_trap && getLastKana(word.reading) === 'ん') {
        showFeedback(false, word, body);
        return;
    }

    const firstKana = getFirstKana(word.reading);

    // 正解判定
    if (targetKana === firstKana) {
        showFeedback(true, word, body);
    } else {
        showFeedback(false, word, body);
    }
}

async function loadDataAndStart() {
    try {
        const response = await fetch('data.json');
        shiritoriData = await response.json();

        // 全ての単語に対して、画像イメージ要素を事前に生成しておく（シームレスな描画のため）
        shiritoriData.forEach(word => {
            if (word.image) {
                const img = new Image();
                img.onload = () => { word.imageLoaded = true; };
                img.onerror = () => { word.imageLoaded = false; };
                img.src = `img/${encodeURIComponent(word.image)}`;
                word.imgElement = img; // 参照を持たせておく
            }
        });
    } catch (e) {
        console.error("データの読み込みに失敗しました", e);
        // フォールバックデータ
        shiritoriData = [
            { "id": 1, "name": "あり", "reading": "あり", "category": "昆虫", "season": "春", "is_trap": false },
            { "id": 2, "name": "りす", "reading": "りす", "category": "動物", "season": "通年", "is_trap": false },
            { "id": 10, "name": "みかん", "reading": "みかん", "category": "果物", "season": "冬", "is_trap": true }
        ];
    }
    initPhysics();
}

startBtn.addEventListener('click', () => {
    // 最初の音声を再生（iOS等での音声許可）
    speakWord("しりとりクイズ、スタート！");
    startScreen.style.opacity = '0';

    setTimeout(() => {
        startScreen.style.display = 'none';

        // 最初のランダムなお題を設定
        const initialWord = shiritoriData.find(w => getLastKana(w.reading) !== 'ん');
        setTargetWord(initialWord || shiritoriData[0]);

        // 正解のカードを含めて初期カードを降らせる
        spawnNextHintCards(getLastKana(initialWord.reading), 15); // 最初は15個降らせる

    }, 500);
});

window.onload = loadDataAndStart;
