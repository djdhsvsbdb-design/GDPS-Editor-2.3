(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const DB_NAME = 'gdps-editor-music-v1';
  const STORE = 'tracks';
  const audio = $('#musicPreview');
  let metadata = null;
  let objectUrl = null;
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB недоступна'));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function storeFile(file, key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(file, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function readFile(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  function revokeUrl() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  function updateStatus(text) {
    $('#musicStatus').textContent = text;
  }

  function setMetadata(value) {
    metadata = value ? {
      key: String(value.key || ''),
      name: String(value.name || 'Музыка уровня').slice(0, 120),
      sourceUrl: String(value.sourceUrl || ''),
      author: String(value.author || ''),
      offset: Math.max(0, Number(value.offset) || 0),
      volume: Math.max(0, Math.min(1, Number(value.volume ?? 0.7)))
    } : null;
    $('#musicNgUrl').value = metadata?.sourceUrl || '';
    $('#musicAuthor').value = metadata?.author || '';
    $('#musicOffset').value = metadata?.offset || 0;
    $('#musicVolume').value = Math.round((metadata?.volume ?? 0.7) * 100);
    if (!metadata) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      revokeUrl();
      updateStatus('Музыка не выбрана');
      return;
    }
    updateStatus('Трек: ' + metadata.name + ' · сохранён в этом браузере');
    restorePreview();
  }

  async function restorePreview() {
    if (!metadata?.key) return;
    try {
      const file = await readFile(metadata.key);
      if (!file) return;
      revokeUrl();
      objectUrl = URL.createObjectURL(file);
      audio.src = objectUrl;
      audio.volume = metadata.volume;
      audio.load();
    } catch (error) {
      updateStatus('Не удалось открыть сохранённый аудиофайл');
    }
  }

  async function importFile(file) {
    if (!file || !file.type.startsWith('audio/')) {
      updateStatus('Выбери аудиофайл поддерживаемого формата');
      return;
    }
    if (!$('#musicPermission').checked) {
      updateStatus('Подтверди, что у тебя есть право использовать этот трек');
      return;
    }
    const key = 'track-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
    const sourceUrl = $('#musicNgUrl').value.trim();
    try {
      await storeFile(file, key);
      setMetadata({
        key, name: file.name, sourceUrl,
        author: $('#musicAuthor').value.trim(),
        offset: Number($('#musicOffset').value) || 0,
        volume: Number($('#musicVolume').value) / 100
      });
      updateStatus('Импортировано: ' + file.name);
    } catch (error) {
      updateStatus('Не удалось сохранить файл. Проверь свободное место браузера.');
    }
  }

  function getMetadata() {
    if (!metadata) return null;
    return {
      ...metadata,
      sourceUrl: $('#musicNgUrl').value.trim(),
      author: $('#musicAuthor').value.trim(),
      offset: Math.max(0, Number($('#musicOffset').value) || 0),
      volume: Math.max(0, Math.min(1, Number($('#musicVolume').value) / 100))
    };
  }

  function play() {
    if (!metadata?.key) return;
    restorePreview().then(() => {
      audio.volume = getMetadata().volume;
      const offset = getMetadata().offset;
      try { audio.currentTime = offset; } catch (_) {}
      audio.play().catch(() => updateStatus('Нажми воспроизведение, если браузер заблокировал автозапуск'));
    });
  }

  function pause() { audio.pause(); }
  function resume() {
    if (!metadata?.key) return;
    audio.play().catch(() => {});
  }
  function stop() {
    audio.pause();
    try { audio.currentTime = getMetadata()?.offset || 0; } catch (_) {}
  }

  $('#musicImportBtn').addEventListener('click', () => $('#musicFile').click());
  $('#musicFile').addEventListener('change', (event) => {
    importFile(event.target.files?.[0]);
    event.target.value = '';
  });
  $('#musicOpenNg').addEventListener('click', () => {
    const url = $('#musicNgUrl').value.trim();
    if (!/^https:\/\/www\.newgrounds\.com\/audio\/listen\/\d+\/?$/.test(url)) {
      updateStatus('Вставь ссылку на страницу трека Newgrounds');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  });
  $('#musicVolume').addEventListener('input', () => {
    audio.volume = Number($('#musicVolume').value) / 100;
    if (metadata) metadata.volume = audio.volume;
  });
  $('#musicOffset').addEventListener('change', () => {
    if (metadata) metadata.offset = Math.max(0, Number($('#musicOffset').value) || 0);
  });
  window.GDPSMusic = { getMetadata, setMetadata, play, pause, resume, stop };
})();