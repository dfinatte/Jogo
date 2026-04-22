// ─── STATE ───────────────────────────────────────────────────────────────────
let currentRound = 0;
let score = 0;
let hits = 0;
let misses = 0;
let answered = false;
let streak = 0;
let bestStreak = 0;
let gameMode = 'full';
let livesLeft = 3;
let timerInterval = null;
let timerSeconds = 30;
let bookmarks = [];
let activeQuestions = [];

// ─── PERSISTENCE ─────────────────────────────────────────────────────────────
function loadStorage() {
    const data = JSON.parse(localStorage.getItem('cineconexoes') || '{}');
    return {
        bestScore: data.bestScore || 0,
        gamesPlayed: data.gamesPlayed || 0,
        bestStreak: data.bestStreak || 0,
        totalHits: data.totalHits || 0,
        bookmarks: data.bookmarks || [],
        themeHits: data.themeHits || {},
        lastDailyDate: data.lastDailyDate || null,
        dailyStreak: data.dailyStreak || 0
    };
}

function saveStorage(update) {
    const data = loadStorage();
    localStorage.setItem('cineconexoes', JSON.stringify({ ...data, ...update }));
}

// ─── SCREEN NAVIGATION ───────────────────────────────────────────────────────
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');

    if (id === 'screen-home') updateHomeStats();
    if (id === 'screen-glossary') renderGlossary('all');
    if (id === 'screen-stats') renderStats();
    window.scrollTo(0, 0);
}

function goHome() {
    document.getElementById('quit-overlay').style.display = 'none';
    clearTimer();
    showScreen('screen-home');
}

function confirmQuit() {
    if (!answered && currentRound < activeQuestions.length) {
        document.getElementById('quit-overlay').style.display = 'flex';
    } else {
        goHome();
    }
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function selectMode(mode) {
    gameMode = mode;
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
    document.getElementById(`mode-${mode}`).classList.add('selected');
    ['full','quick','survival', 'daily'].forEach(m => {
        const check = document.getElementById(`check-${m}`);
        if(check) check.innerHTML = m === mode ? '<i class="fa-solid fa-check"></i>' : '';
    });
}

function updateHomeStats() {
    const d = loadStorage();
    document.getElementById('home-best-score').textContent = d.bestScore;
    document.getElementById('home-games-played').textContent = d.gamesPlayed;
    document.getElementById('home-best-streak').textContent = d.bestStreak;
}

// ─── GAME START ───────────────────────────────────────────────────────────────
function startGame() {
    currentRound = 0;
    score = 0;
    hits = 0;
    misses = 0;
    streak = 0;
    bestStreak = 0;
    livesLeft = 3;
    bookmarks = [];

    // Shuffle all questions
    const shuffled = [...questions].sort(() => Math.random() - 0.5);

    if (gameMode === 'quick') {
        activeQuestions = shuffled.slice(0, 5);
    } else if (gameMode === 'daily') {
        const todayStr = new Date().toISOString().split('T')[0];
        const d = loadStorage();
        if (d.lastDailyDate === todayStr) {
            showToast('Você já jogou o Desafio Diário hoje! Volte amanhã.');
            return;
        }
        // Use a determinist approach for daily (e.g. days since epoch)
        const dayIndex = Math.floor(Date.now() / 86400000);
        activeQuestions = [questions[dayIndex % questions.length]];
    } else {
        activeQuestions = shuffled;
    }

    // Mode-specific UI
    const heartsRow = document.getElementById('hearts-row');
    const timerBox = document.querySelector('.timer-box');
    if (gameMode === 'survival') {
        heartsRow.style.display = 'flex';
        timerBox.style.display = 'none';
        resetHearts();
    } else {
        heartsRow.style.display = 'none';
        timerBox.style.display = '';
    }

    document.getElementById('next-btn').style.display = '';
    showScreen('screen-quiz');
    updateStats();
    loadQuestion(0);
}

// ─── QUESTION LOAD ────────────────────────────────────────────────────────────
function loadQuestion(index) {
    if (index >= activeQuestions.length) {
        showResult();
        return;
    }

    answered = false;
    const q = activeQuestions[index];

    document.getElementById('theme-badge').textContent = `MODO: ${q.theme}`;
    document.getElementById('question-text').textContent = q.question;
    document.getElementById('movie-synopsis').textContent = q.synopsis;
    document.getElementById('movie-banner').style.backgroundImage = `url('${q.image}')`;
    document.getElementById('movie-info').style.opacity = '0';
    document.getElementById('movie-title').textContent = q.movie;
    document.getElementById('movie-meta').textContent = `${q.year} • ${q.country}`;

    // Options
    const container = document.getElementById('options-container');
    container.innerHTML = '';
    q.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = opt;
        btn.onclick = () => handleAnswer(idx);
        container.appendChild(btn);
    });

    // Reset UI elements
    document.getElementById('explanation-box').style.display = 'none';
    document.getElementById('action-buttons').style.display = 'flex';
    document.getElementById('next-btn').disabled = true;
    document.getElementById('hint-btn').disabled = false;
    document.getElementById('reveal-btn').disabled = false;
    updateBookmarkBtn(q);

    // Timer
    if (gameMode !== 'survival') startTimer();
}

// ─── TIMER ────────────────────────────────────────────────────────────────────
function startTimer() {
    clearTimer();
    timerSeconds = 30;
    updateTimerDisplay();
    const timerBox = document.querySelector('.timer-box');
    timerBox.classList.remove('danger');

    timerInterval = setInterval(() => {
        timerSeconds--;
        updateTimerDisplay();
        if (timerSeconds <= 10) timerBox.classList.add('danger');
        if (timerSeconds <= 0) {
            clearTimer();
            showToast('⏰ Tempo esgotado! -100 pontos');
            score = Math.max(0, score - 100);
            handleAnswer(-2); // timeout — counts as miss, reveals correct
        }
    }, 1000);
}

function clearTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    document.querySelector('.timer-box')?.classList.remove('danger');
}

function updateTimerDisplay() {
    document.getElementById('timer-display').textContent = timerSeconds;
}

// ─── ANSWER ───────────────────────────────────────────────────────────────────
function handleAnswer(selectedIndex) {
    if (answered) return;
    answered = true;
    clearTimer();

    const q = activeQuestions[currentRound];
    const isCorrect = selectedIndex === q.correct;
    const optionBtns = document.querySelectorAll('.option-btn');

    // Mark options
    optionBtns.forEach(b => b.disabled = true);
    if (selectedIndex >= 0) optionBtns[selectedIndex]?.classList.add(isCorrect ? 'correct' : 'wrong');
    if (!isCorrect) optionBtns[q.correct]?.classList.add('correct');

    if (isCorrect) {
        streak++;
        if (streak > bestStreak) bestStreak = streak;
        const bonus = streak >= 3 ? 50 : 0;
        score += 200 + bonus;
        hits++;
        if (streak >= 3) showCombo(streak);
    } else {
        streak = 0;
        misses++;
        if (gameMode === 'survival') {
            livesLeft--;
            updateHearts();
        }
    }

    // Streak badge
    const sb = document.getElementById('streak-badge');
    if (streak >= 2) {
        sb.style.display = '';
        document.getElementById('streak-count').textContent = streak;
    } else {
        sb.style.display = 'none';
    }

    // Reveal movie title
    document.getElementById('movie-info').style.opacity = '1';

    // Show explanation inline
    setTimeout(() => {
        document.getElementById('action-buttons').style.display = 'none';
        document.getElementById('explanation-text').textContent = q.explanation;
        document.getElementById('explanation-box').style.display = 'block';
    }, 600);

    updateStats();

    // Survival check
    if (gameMode === 'survival' && livesLeft <= 0) {
        setTimeout(() => showResult(), 1800);
        return;
    }

    document.getElementById('next-btn').disabled = false;
}

// ─── STATS UPDATE ─────────────────────────────────────────────────────────────
function updateStats() {
    document.getElementById('score').textContent = score;
    document.getElementById('round-display').textContent =
        `${String(currentRound + 1).padStart(2, '0')}/${String(activeQuestions.length).padStart(2, '0')}`;
    document.getElementById('hits-display').textContent = String(hits).padStart(2, '0');
    document.getElementById('misses-display').textContent = String(misses).padStart(2, '0');
    document.getElementById('progress-bar').style.width =
        `${(currentRound / activeQuestions.length) * 100}%`;
}

// ─── HEARTS (SURVIVAL) ────────────────────────────────────────────────────────
function resetHearts() {
    for (let i = 1; i <= 3; i++) {
        document.getElementById(`heart-${i}`).classList.remove('lost');
    }
}

function updateHearts() {
    const lost = 3 - livesLeft;
    for (let i = 3; i > 3 - lost; i--) {
        document.getElementById(`heart-${i}`).classList.add('lost');
    }
}

// ─── COMBO ───────────────────────────────────────────────────────────────────
function showCombo(n) {
    const popup = document.getElementById('combo-popup');
    const emojis = { 3: '🔥', 4: '⚡', 5: '💥' };
    const emoji = emojis[Math.min(n, 5)] || '🌟';
    document.getElementById('combo-text').textContent = `${emoji} COMBO x${n}! +50pts`;
    popup.style.display = 'block';
    setTimeout(() => { popup.style.display = 'none'; }, 1500);
}

// ─── BOOKMARK ────────────────────────────────────────────────────────────────
function updateBookmarkBtn(q) {
    const saved = loadStorage().bookmarks.includes(q.movie);
    const btn = document.getElementById('bookmark-btn');
    btn.innerHTML = saved ? '<i class="fa-solid fa-bookmark"></i>' : '<i class="fa-regular fa-bookmark"></i>';
    btn.classList.toggle('saved', saved);
    btn.onclick = () => toggleBookmark(q);
}

function toggleBookmark(q) {
    const d = loadStorage();
    let bm = d.bookmarks || [];
    if (bm.includes(q.movie)) {
        bm = bm.filter(b => b !== q.movie);
        showToast('Removido dos salvos');
    } else {
        bm.push(q.movie);
        showToast('🔖 Filme salvo no glossário!');
    }
    saveStorage({ bookmarks: bm });
    updateBookmarkBtn(q);
}

// ─── COPY EXPLANATION ────────────────────────────────────────────────────────
function copyExplanation() {
    const text = document.getElementById('explanation-text').textContent;
    navigator.clipboard?.writeText(text).then(() => showToast('📋 Trecho copiado!')).catch(() => showToast('Não foi possível copiar'));
}

// ─── RESULT ───────────────────────────────────────────────────────────────────
function showResult() {
    clearTimer();
    const total = activeQuestions.length;
    const pct = Math.round((hits / total) * 100);

    document.getElementById('res-score').textContent = score;
    document.getElementById('res-hits').textContent = `${hits}/${total}`;
    document.getElementById('res-pct').textContent = `${pct}%`;

    let icon = '💀', title = 'Tente Novamente!', subtitle = 'Continue praticando!';
    let medal = '';
    if (pct >= 90) { icon = '🏆'; title = 'Mestre do Repertório!'; subtitle = 'Performance lendária!'; medal = '🥇 Medalha de Ouro — Mestre CineConexões'; }
    else if (pct >= 70) { icon = '🌟'; title = 'Excelente!'; subtitle = 'Seu repertório está afiado!'; medal = '🥈 Medalha de Prata — Cinéfilo Avançado'; }
    else if (pct >= 50) { icon = '👍'; title = 'Bom trabalho!'; subtitle = 'Está aprendendo bem.'; medal = '🥉 Medalha de Bronze — Aprendiz'; }

    document.getElementById('result-icon').textContent = icon;
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-subtitle').textContent = subtitle;
    document.getElementById('result-medal').textContent = medal;

    // Saved films section
    const d = loadStorage();
    const bmEl = document.getElementById('result-bookmarks');
    if (d.bookmarks.length > 0) {
        bmEl.innerHTML = `<h4>FILMES SALVOS NESTA PARTIDA</h4>` +
            d.bookmarks.slice(-5).map(m => `<div class="result-bk-item">🎬 ${m}</div>`).join('');
    } else {
        bmEl.innerHTML = '';
    }

    // Persist stats
    const prevData = loadStorage();
    const themeHits = { ...prevData.themeHits };
    activeQuestions.forEach((q, i) => {
        if (i < hits) themeHits[q.theme] = (themeHits[q.theme] || 0) + 1;
    });

    let updates = {
        bestScore: Math.max(prevData.bestScore, score),
        gamesPlayed: prevData.gamesPlayed + 1,
        bestStreak: Math.max(prevData.bestStreak, bestStreak),
        totalHits: prevData.totalHits + hits,
        themeHits
    };

    if (gameMode === 'daily') {
        const todayStr = new Date().toISOString().split('T')[0];
        const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        
        let newDailyStreak = (prevData.lastDailyDate === yesterdayStr && pct > 0) ? prevData.dailyStreak + 1 : (pct > 0 ? 1 : 0);
        
        updates.lastDailyDate = todayStr;
        updates.dailyStreak = newDailyStreak;
    }

    saveStorage(updates);

    showScreen('screen-result');
}

// ─── GLOSSARY ─────────────────────────────────────────────────────────────────
function renderGlossary(filter) {
    const d = loadStorage();
    const list = filter === 'bookmarked'
        ? questions.filter(q => d.bookmarks.includes(q.movie))
        : questions;

    const el = document.getElementById('glossary-list');
    if (list.length === 0) {
        el.innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px">Nenhum filme salvo ainda.<br>Jogue e clique em 🔖 para salvar!</p>';
        return;
    }
    el.innerHTML = list.map(q => {
        const saved = d.bookmarks.includes(q.movie);
        return `<div class="glossary-item">
            <div class="glossary-img" style="background-image:url('${q.image}')">
                <div class="glossary-img-overlay">
                    <div>
                        <h3>${q.movie}</h3>
                        <span>${q.year} • ${q.country}</span>
                    </div>
                </div>
                <button class="glossary-bookmark-btn ${saved ? 'saved' : ''}" onclick="toggleGlossaryBookmark('${q.movie}', this)" style="position:absolute;top:8px;right:10px;background:rgba(0,0,0,.5);border-radius:6px;padding:4px 8px;">
                    <i class="fa-${saved ? 'solid' : 'regular'} fa-bookmark"></i>
                </button>
            </div>
            <div class="glossary-body">
                <div class="glossary-theme">${q.theme}</div>
                <p class="glossary-exp">${q.explanation}</p>
            </div>
        </div>`;
    }).join('');
}

function filterGlossary(type, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderGlossary(type);
}

function toggleGlossaryBookmark(movieTitle, btn) {
    const d = loadStorage();
    let bm = d.bookmarks || [];
    if (bm.includes(movieTitle)) {
        bm = bm.filter(b => b !== movieTitle);
        btn.innerHTML = '<i class="fa-regular fa-bookmark"></i>';
        btn.classList.remove('saved');
        showToast('Removido dos salvos');
    } else {
        bm.push(movieTitle);
        btn.innerHTML = '<i class="fa-solid fa-bookmark"></i>';
        btn.classList.add('saved');
        showToast('🔖 Salvo!');
    }
    saveStorage({ bookmarks: bm });
}

// ─── STATS PAGE ───────────────────────────────────────────────────────────────
function renderStats() {
    const d = loadStorage();
    document.getElementById('st-games').textContent = d.gamesPlayed;
    document.getElementById('st-best').textContent = d.bestScore;
    document.getElementById('st-total-hits').textContent = d.totalHits;
    document.getElementById('st-streak').textContent = d.bestStreak;

    const breakdown = document.getElementById('theme-breakdown');
    const themes = Object.entries(d.themeHits || {}).sort((a, b) => b[1] - a[1]);
    const max = themes.length > 0 ? themes[0][1] : 1;
    breakdown.innerHTML = themes.length > 0
        ? themes.map(([theme, count]) => `
            <div class="theme-row">
                <span>${theme}</span>
                <div class="theme-bar-bg"><div class="theme-bar-fill" style="width:${(count/max)*100}%"></div></div>
                <span style="color:var(--green);font-weight:700">${count}</span>
            </div>`).join('')
        : '<p style="color:var(--muted);font-size:.85rem">Jogue para ver suas estatísticas por tema.</p>';
}

function resetStats() {
    if (confirm('Tem certeza? Todos os dados serão apagados.')) {
        localStorage.removeItem('cineconexoes');
        renderStats();
        updateHomeStats();
        showToast('Dados resetados!');
    }
}

// ─── HINT / REVEAL ────────────────────────────────────────────────────────────
document.getElementById('hint-btn').addEventListener('click', () => {
    if (answered) return;
    const d = loadStorage();
    if (score < 50) { showToast('Pontos insuficientes!'); return; }
    score -= 50;
    document.getElementById('score').textContent = score;
    showToast(`💡 Dica: ${activeQuestions[currentRound].hint}`);
    document.getElementById('hint-btn').disabled = true;
});

document.getElementById('reveal-btn').addEventListener('click', () => {
    if (answered) return;
    score = Math.max(0, score - 100);
    handleAnswer(-1); // reveal correct, counts as miss
});

// ─── NEXT ─────────────────────────────────────────────────────────────────────
document.getElementById('next-btn').addEventListener('click', () => {
    currentRound++;
    updateStats();
    loadQuestion(currentRound);
    window.scrollTo(0, 0);
});

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg) {
    const t = document.getElementById('hint-toast');
    document.getElementById('hint-text').textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3500);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
updateHomeStats();
