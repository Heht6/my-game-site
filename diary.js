// =============================================
// ЛИЧНЫЙ ИГРОВОЙ ДНЕВНИК
// =============================================

let allEntries = [];
let currentFilter = 'all';
let currentSort = 'updated';
let currentUser = null;

const STATUS_LABELS = {
    playing:   '🎮 Играю',
    completed: '✅ Пройдено',
    dropped:   '❌ Брошено',
    backlog:   '📦 Отложено',
    wishlist:  '💭 В планах'
};

// ==========================================
// СТАРТ
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    waitForAuthDiary();
    setupUIHandlers();
});

function waitForAuthDiary() {
    if (window.firebaseReady && window.auth) {
        initDiaryAuth();
    } else {
        setTimeout(waitForAuthDiary, 100);
    }
}

async function initDiaryAuth() {
    const { onAuthStateChanged } = await import(
        'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js'
    );

    onAuthStateChanged(window.auth, (user) => {
        currentUser = user;
        window.currentUser = user;

        const guestBlock = document.getElementById('diary-guest');
        const mainBlock = document.getElementById('diary-content');

        if (user) {
            console.log('👤 Дневник: пользователь', user.email);
            guestBlock.style.display = 'none';
            mainBlock.style.display = 'block';
            loadEntries();
        } else {
            console.log('👤 Дневник: гость');
            guestBlock.style.display = 'block';
            mainBlock.style.display = 'none';
        }
    });

    const guestLoginBtn = document.getElementById('guest-login-btn');
    if (guestLoginBtn) {
        guestLoginBtn.addEventListener('click', () => {
            const authModal = document.getElementById('auth-modal');
            if (authModal) authModal.classList.add('active');
        });
    }
}

// ==========================================
// UI-ОБРАБОТЧИКИ (кнопки, фильтры, модалки)
// ==========================================
function setupUIHandlers() {
    // Открыть модалку добавления
    const addBtn = document.getElementById('add-entry-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => openEditModal(null));
    }

    // Закрыть модалку редактирования
    const editClose = document.getElementById('diary-modal-close');
    const editModal = document.getElementById('diary-edit-modal');
    if (editClose) {
        editClose.addEventListener('click', () => editModal.classList.remove('active'));
    }
    if (editModal) {
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) editModal.classList.remove('active');
        });
    }

    // Закрыть модалку просмотра
    const viewClose = document.getElementById('diary-view-close');
    const viewModal = document.getElementById('diary-view-modal');
    if (viewClose) {
        viewClose.addEventListener('click', () => viewModal.classList.remove('active'));
    }
    if (viewModal) {
        viewModal.addEventListener('click', (e) => {
            if (e.target === viewModal) viewModal.classList.remove('active');
        });
    }

    // Esc — закрыть любую модалку
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (editModal && editModal.classList.contains('active')) editModal.classList.remove('active');
            if (viewModal && viewModal.classList.contains('active')) viewModal.classList.remove('active');
        }
    });

    // Вкладки-фильтры
    document.querySelectorAll('.diary-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.diary-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.status;
            renderList();
        });
    });

    // Сортировка
    const sortSelect = document.getElementById('diary-sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            currentSort = sortSelect.value;
            renderList();
        });
    }

    // Ползунок рейтинга — показывает значение
    const ratingSlider = document.getElementById('diary-rating');
    const ratingValue = document.getElementById('diary-rating-value');
    if (ratingSlider && ratingValue) {
        ratingSlider.addEventListener('input', () => {
            ratingValue.textContent = ratingSlider.value == 0
                ? '—'
                : `${ratingSlider.value}/10`;
        });
    }

    // Ползунок прогресса — показывает значение
    const progressSlider = document.getElementById('diary-progress');
    const progressValue = document.getElementById('diary-progress-value');
    if (progressSlider && progressValue) {
        progressSlider.addEventListener('input', () => {
            progressValue.textContent = progressSlider.value;
        });
    }

    // Отправка формы
    const form = document.getElementById('diary-form');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
}

// ==========================================
// ЗАГРУЗКА ЗАПИСЕЙ (только свои)
// ==========================================
async function loadEntries() {
    if (!currentUser) return;

    const list = document.getElementById('diary-list');
    list.innerHTML = '<p style="text-align:center; color:#c2c2c2; width:100%;">Загрузка...</p>';

    try {
        const { collection, query, where, orderBy, getDocs } = await import(
            'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js'
        );

        const q = query(
            collection(window.db, 'diary'),
            where('userId', '==', currentUser.uid),
            orderBy('updatedAt', 'desc')
        );

        const snapshot = await getDocs(q);

        allEntries = [];
        snapshot.forEach(doc => {
            allEntries.push({ id: doc.id, ...doc.data() });
        });

        console.log('📔 Загружено записей:', allEntries.length);
        renderAll();

    } catch (error) {
        console.error('❌ Ошибка загрузки дневника:', error);

        let message = error.message;
        if (message.includes('index') || message.includes('requires an index')) {
            message = 'Требуется создать индекс Firestore. Откройте консоль (F12) и перейдите по ссылке из ошибки.';
        }
        list.innerHTML = `<p style="color: #e74c3c; text-align: center; width: 100%;">❌ ${message}</p>`;
    }
}

// ==========================================
// ОТРИСОВКА
// ==========================================
function renderAll() {
    renderStats();
    renderNowPlaying();
    updateTabsCount(); // ← ДОБАВИЛИ ВЫЗОВ
    renderList();
}

// ==========================================
// ПОДСЧЁТ ЗАПИСЕЙ НА ВКЛАДКАХ
// ==========================================
function updateTabsCount() {
    const tabs = document.querySelectorAll('.diary-tab');
    
    // Считаем количество для каждого статуса
    const counts = {
        all: allEntries.length,
        playing: 0,
        completed: 0,
        dropped: 0,
        backlog: 0,
        wishlist: 0
    };

    allEntries.forEach(e => {
        if (counts[e.status] !== undefined) {
            counts[e.status]++;
        }
    });

    // Базовые названия вкладок (без цифр)
    const baseNames = {
        all: 'Все',
        playing: '🎮 Играю',
        completed: '✅ Пройдено',
        dropped: '❌ Брошено',
        backlog: '📦 Отложено',
        wishlist: '💭 В планах'
    };

    // Обновляем текст на кнопках (цифра + текст)
    tabs.forEach(tab => {
        const status = tab.dataset.status;
        if (baseNames[status]) {
            tab.innerHTML = `<span class="tab-count">${counts[status]}</span> ${baseNames[status]}`;
        }
    });
}

function renderStats() {
    const total = allEntries.length;
    const completed = allEntries.filter(e => e.status === 'completed').length;

    const rated = allEntries.filter(e => typeof e.rating === 'number' && e.rating > 0);
    const avgRating = rated.length
        ? (rated.reduce((s, e) => s + e.rating, 0) / rated.length).toFixed(1)
        : '—';

    const totalHours = allEntries.reduce((s, e) => s + (Number(e.playtimeHours) || 0), 0);
    const totalSpent = allEntries.reduce((s, e) => s + (Number(e.price) || 0), 0);

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-completed').textContent = completed;
    document.getElementById('stat-avg-rating').textContent = avgRating;
    document.getElementById('stat-hours').textContent = `${totalHours}ч`;
    document.getElementById('stat-spent').textContent =
        totalSpent.toLocaleString('ru-RU') + ' ₽';
}

function renderNowPlaying() {
    const section = document.getElementById('diary-now-playing-section');
    const list = document.getElementById('diary-now-playing-list');

    // Ищем все игры со статусом "playing"
    const active = allEntries
        .filter(e => e.status === 'playing')
        .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));

    // Если активных игр нет — скрываем секцию целиком
    if (active.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    // Рендерим каждую игру как мини-карточку
    list.innerHTML = active.map(game => {
        // Безопасный URL (на случай кавычек в ссылке)
        const safeCover = escapeHtml(game.coverUrl);
        const cover = safeCover || 'https://via.placeholder.com/80x80/535353/ffffff?text=🎮';
        const progress = Number(game.progress) || 0;

        return `
            <div class="now-playing-card">
                <img class="cover" src="${cover}" alt="${escapeHtml(game.title)}"
                     onerror="this.src='https://via.placeholder.com/80x80/535353/ffffff?text=🎮'">
                <div class="info">
                    <h3>${escapeHtml(game.title)}</h3>
                    <div class="meta">
                        ${game.genre ? escapeHtml(game.genre) + ' · ' : ''}
                        ${game.platform ? escapeHtml(game.platform) : ''}
                        ${game.playtimeHours ? ' · ⏱ ' + game.playtimeHours + 'ч' : ''}
                    </div>
                    ${game.progress != null ? `
                        <div class="diary-progress">
                            <div class="diary-progress-fill" style="width:${progress}%"></div>
                        </div>
                        <div class="diary-progress-label">Прогресс: ${progress}%</div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderList() {
    const list = document.getElementById('diary-list');
    const empty = document.getElementById('diary-empty');

    let filtered = [...allEntries];

    if (currentFilter !== 'all') {
        filtered = filtered.filter(e => e.status === currentFilter);
    }

    switch (currentSort) {
        case 'rating':
            filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
            break;
        case 'playtime':
            filtered.sort((a, b) => (b.playtimeHours || 0) - (a.playtimeHours || 0));
            break;
        case 'title':
            filtered.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'));
            break;
        case 'updated':
        default:
            filtered.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
    }

    if (filtered.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    list.innerHTML = filtered.map(renderCard).join('');
    attachCardHandlers();
}

function renderCard(entry) {
    // Безопасный URL (на случай кавычек в ссылке)
    const safeCover = escapeHtml(entry.coverUrl);
    const cover = safeCover || 'https://via.placeholder.com/280x280/535353/ffffff?text=🎮';
    const statusLabel = STATUS_LABELS[entry.status] || entry.status;

    const rating = entry.rating != null && entry.rating > 0
        ? `<span class="diary-rating-big">⭐ ${entry.rating}</span>`
        : '';

    const hours = entry.playtimeHours
        ? `<span class="diary-hours">⏱ ${entry.playtimeHours}ч</span>`
        : '';

    const metaParts = [];
    if (entry.genre) metaParts.push(escapeHtml(entry.genre));
    if (entry.platform) metaParts.push(escapeHtml(entry.platform));

    return `
        <div class="game-card diary-card" data-id="${entry.id}">
            <span class="diary-status-badge ${entry.status}">${statusLabel}</span>
            <img src="${cover}" alt="${escapeHtml(entry.title)}"
                 class="game-image"
                 onerror="this.src='https://via.placeholder.com/280x280/535353/ffffff?text=🎮'">
            <h3 class="game-title">${escapeHtml(entry.title)}</h3>
            ${metaParts.length ? `<p class="diary-meta">${metaParts.join(' · ')}</p>` : ''}
            <p>${rating} ${hours}</p>
            <div class="diary-card-actions">
                <button class="btn-view" data-id="${entry.id}">Подробнее</button>
                <button class="btn-edit" data-id="${entry.id}">✏️</button>
                <button class="btn-delete" data-id="${entry.id}">🗑️</button>
            </div>
        </div>
    `;
}

function attachCardHandlers() {
    document.querySelectorAll('.diary-card .btn-view').forEach(btn => {
        btn.addEventListener('click', () => openViewModal(btn.dataset.id));
    });
    document.querySelectorAll('.diary-card .btn-edit').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    document.querySelectorAll('.diary-card .btn-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteEntry(btn.dataset.id));
    });
}

// ==========================================
// МОДАЛКА ДОБАВЛЕНИЯ / РЕДАКТИРОВАНИЯ
// ==========================================
function openEditModal(id) {
    const form = document.getElementById('diary-form');
    const titleEl = document.getElementById('diary-modal-title');
    const modal = document.getElementById('diary-edit-modal');

    form.reset();
    document.getElementById('diary-rating-value').textContent = '—';
    document.getElementById('diary-progress-value').textContent = '0';

    if (id) {
        // Редактирование
        const entry = allEntries.find(e => e.id === id);
        if (!entry) return;

        titleEl.textContent = '✏️ Редактировать запись';
        document.getElementById('diary-id').value = id;
        document.getElementById('diary-title').value = entry.title || '';
        document.getElementById('diary-genre').value = entry.genre || '';
        document.getElementById('diary-platform').value = entry.platform || '';
        document.getElementById('diary-cover').value = entry.coverUrl || '';
        document.getElementById('diary-status').value = entry.status || 'playing';
        document.getElementById('diary-rating').value = entry.rating || 0;
        document.getElementById('diary-rating-value').textContent =
            entry.rating > 0 ? `${entry.rating}/10` : '—';
        document.getElementById('diary-progress').value = entry.progress || 0;
        document.getElementById('diary-progress-value').textContent = entry.progress || 0;
        document.getElementById('diary-playtime').value = entry.playtimeHours || '';
        document.getElementById('diary-price').value = entry.price || '';
        document.getElementById('diary-notes').value = entry.notes || '';

        if (entry.startedAt) {
            document.getElementById('diary-started').value = toDateInput(entry.startedAt);
        }
        if (entry.finishedAt) {
            document.getElementById('diary-finished').value = toDateInput(entry.finishedAt);
        }
    } else {
        // Добавление
        titleEl.textContent = '➕ Новая запись';
        document.getElementById('diary-id').value = '';
    }

    modal.classList.add('active');
}

function toDateInput(ts) {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function handleFormSubmit(e) {
    e.preventDefault();
    if (!currentUser) return;

    const id = document.getElementById('diary-id').value;
    const title = document.getElementById('diary-title').value.trim();
    if (!title) {
        alert('❌ Название игры обязательно');
        return;
    }

    const { addDoc, doc, updateDoc, Timestamp, serverTimestamp, collection } = await import(
        'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js'
    );

    // Собираем данные
    const data = {
        title,
        genre: document.getElementById('diary-genre').value.trim(),
        platform: document.getElementById('diary-platform').value,
        coverUrl: document.getElementById('diary-cover').value.trim(),
        status: document.getElementById('diary-status').value,
        rating: parseFloat(document.getElementById('diary-rating').value) || 0,
        progress: parseInt(document.getElementById('diary-progress').value) || 0,
        playtimeHours: parseFloat(document.getElementById('diary-playtime').value) || 0,
        price: parseInt(document.getElementById('diary-price').value) || 0,
        notes: document.getElementById('diary-notes').value.trim(),
        userId: currentUser.uid,
        updatedAt: serverTimestamp()
    };

    // Даты
    const startedVal = document.getElementById('diary-started').value;
    const finishedVal = document.getElementById('diary-finished').value;
    data.startedAt = startedVal ? Timestamp.fromDate(new Date(startedVal)) : null;
    data.finishedAt = finishedVal ? Timestamp.fromDate(new Date(finishedVal)) : null;

    try {
        if (id) {
            await updateDoc(doc(window.db, 'diary', id), data);
            console.log('✅ Запись обновлена');
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(window.db, 'diary'), data);
            console.log('✅ Запись создана');
        }

        document.getElementById('diary-edit-modal').classList.remove('active');
        loadEntries();

    } catch (error) {
        console.error('❌ Ошибка сохранения:', error);
        alert('❌ Ошибка: ' + error.message);
    }
}

// ==========================================
// УДАЛЕНИЕ
// ==========================================
async function deleteEntry(id) {
    if (!confirm('Удалить эту запись?')) return;

    try {
        const { doc, deleteDoc } = await import(
            'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js'
        );
        await deleteDoc(doc(window.db, 'diary', id));
        console.log('✅ Запись удалена');
        loadEntries();
    } catch (error) {
        console.error('❌ Ошибка удаления:', error);
        alert('❌ Ошибка: ' + error.message);
    }
}

// ==========================================
// ПРОСМОТР ЗАПИСИ
// ==========================================
function openViewModal(id) {
    const entry = allEntries.find(e => e.id === id);
    if (!entry) return;

    const modal = document.getElementById('diary-view-modal');
    const body = document.getElementById('diary-view-body');
    const statusLabel = STATUS_LABELS[entry.status] || entry.status;

    const dates = [];
    if (entry.startedAt) dates.push(`Начато: ${formatDate(entry.startedAt)}`);
    if (entry.finishedAt) dates.push(`Завершено: ${formatDate(entry.finishedAt)}`);

    body.innerHTML = `
        <h2>${escapeHtml(entry.title)}</h2>
        <div class="view-meta">
            <p><strong>Статус:</strong> <span class="diary-status-badge ${entry.status}"
                style="position:static; display:inline-block;">${statusLabel}</span></p>
            ${entry.genre ? `<p><strong>Жанр:</strong> ${escapeHtml(entry.genre)}</p>` : ''}
            ${entry.platform ? `<p><strong>Платформа:</strong> ${escapeHtml(entry.platform)}</p>` : ''}
            ${entry.rating > 0 ? `<p><strong>Оценка:</strong> ⭐ ${entry.rating}/10</p>` : ''}
            ${entry.playtimeHours ? `<p><strong>Часов:</strong> ${entry.playtimeHours}ч</p>` : ''}
            ${entry.price ? `<p><strong>Цена:</strong> ${entry.price} ₽</p>` : ''}
            ${entry.progress ? `<p><strong>Прогресс:</strong> ${entry.progress}%</p>` : ''}
            ${dates.length ? `<p>${dates.join(' · ')}</p>` : ''}
        </div>
        ${entry.notes ? `<div class="view-notes">${escapeHtml(entry.notes)}</div>` : ''}
    `;

    modal.classList.add('active');
}

function formatDate(ts) {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ==========================================
// УТИЛИТЫ
// ==========================================
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

