// main.js — all components bundled, no ES modules
// Requires data/words.js to be loaded first (WORDS and LEVEL_META globals).

(function () {
  "use strict";

  // ═══════════════════════════════════════════════════════════════════════════
  // WinAnimation
  // ═══════════════════════════════════════════════════════════════════════════

  var WIN_MESSAGES = [
    "Amazing! You did it!",
    "Brilliant spelling!",
    "Wow, you're so smart!",
    "Fantastic work!",
    "You're a spell master!",
    "Incredible job!",
    "Super duper spelling!",
  ];

  function showWin(word, onDone) {
    var existing = document.getElementById("win-overlay");
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.id = "win-overlay";

    var msg = WIN_MESSAGES[Math.floor(Math.random() * WIN_MESSAGES.length)];

    overlay.innerHTML =
      '<div class="win-emoji">🎉</div>' +
      '<div class="win-message">' + msg + '</div>' +
      '<div class="win-stars">⭐ ⭐ ⭐</div>';

    document.body.appendChild(overlay);

    if (window.speechSynthesis) {
      var utt = new SpeechSynthesisUtterance(msg + " You spelled " + word + "!");
      utt.rate  = 0.9;
      utt.pitch = 1.2;
      window.speechSynthesis.speak(utt);
    }

    setTimeout(function () {
      overlay.style.transition = "opacity .3s";
      overlay.style.opacity    = "0";
      setTimeout(function () {
        overlay.remove();
        onDone();
      }, 300);
    }, 2000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LetterTile  (drag + touch)
  // ═══════════════════════════════════════════════════════════════════════════

  var _touchClone = null;
  var _touchTile  = null;
  var _touchOffX  = 0;
  var _touchOffY  = 0;

  function createLetterTile(letter, id) {
    var tile = document.createElement("div");
    tile.className   = "letter-tile";
    tile.textContent = letter.toUpperCase();
    tile.draggable   = true;
    tile.dataset.letter = letter.toLowerCase();
    tile.dataset.tileId = id;

    tile.addEventListener("dragstart", function (e) {
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
      requestAnimationFrame(function () { tile.classList.add("dragging"); });
    });

    tile.addEventListener("dragend", function () {
      tile.classList.remove("dragging");
    });

    tile.addEventListener("touchstart", onTouchStart, { passive: true });

    return tile;
  }

  function onTouchStart(e) {
    var tile = e.currentTarget;
    if (tile.classList.contains("used")) return;

    var touch  = e.touches[0];
    var rect   = tile.getBoundingClientRect();
    _touchOffX = touch.clientX - rect.left;
    _touchOffY = touch.clientY - rect.top;
    _touchTile = tile;

    _touchClone = tile.cloneNode(true);
    _touchClone.style.cssText =
      "position:fixed;" +
      "width:"  + rect.width  + "px;" +
      "height:" + rect.height + "px;" +
      "left:"   + rect.left   + "px;" +
      "top:"    + rect.top    + "px;" +
      "z-index:9999;" +
      "pointer-events:none;" +
      "opacity:0.85;" +
      "transform:scale(1.08);" +
      "transition:none;";
    document.body.appendChild(_touchClone);
    tile.classList.add("dragging");

    document.addEventListener("touchmove",   onTouchMove,  { passive: false });
    document.addEventListener("touchend",    onTouchEnd,   { once: true });
    document.addEventListener("touchcancel", onTouchEnd,   { once: true });
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (!_touchClone) return;
    var touch = e.touches[0];
    _touchClone.style.left = (touch.clientX - _touchOffX) + "px";
    _touchClone.style.top  = (touch.clientY - _touchOffY) + "px";
  }

  function onTouchEnd(e) {
    document.removeEventListener("touchmove", onTouchMove);
    if (!_touchClone || !_touchTile) return;

    var touch = e.changedTouches[0];
    _touchClone.style.display = "none";
    var target = document.elementFromPoint(touch.clientX, touch.clientY);
    _touchClone.remove();
    _touchClone = null;

    _touchTile.classList.remove("dragging");

    var slot = target && target.closest && target.closest(".letter-slot");
    if (slot) {
      var ev = new CustomEvent("tile-dropped", {
        bubbles: true,
        detail: { tileId: _touchTile.dataset.tileId, slot: slot },
      });
      slot.dispatchEvent(ev);
    }

    _touchTile = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LetterSlot
  // ═══════════════════════════════════════════════════════════════════════════

  function createLetterSlot(index, expected) {
    var slot = document.createElement("div");
    slot.className        = "letter-slot";
    slot.dataset.index    = index;
    slot.dataset.expected = expected;
    slot.dataset.filled   = "false";

    slot.addEventListener("dragover", function (e) {
      e.preventDefault();
      if (slot.dataset.filled === "false") slot.classList.add("drag-over");
    });

    slot.addEventListener("dragleave", function () {
      slot.classList.remove("drag-over");
    });

    slot.addEventListener("drop", function (e) {
      e.preventDefault();
      slot.classList.remove("drag-over");
      if (slot.dataset.filled !== "false") return;
      var tileId = e.dataTransfer.getData("text/plain");
      fireSlotDrop(slot, tileId);
    });

    slot.addEventListener("tile-dropped", function (e) {
      if (slot.dataset.filled !== "false") return;
      fireSlotDrop(slot, e.detail.tileId);
    });

    return slot;
  }

  function fireSlotDrop(slot, tileId) {
    slot.dispatchEvent(new CustomEvent("slot-drop", {
      bubbles: true,
      detail: { tileId: tileId, slotIndex: Number(slot.dataset.index) },
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GameBoard
  // ═══════════════════════════════════════════════════════════════════════════

  var _app       = null;
  var _level     = 1;
  var _queue     = [];
  var _wordIndex = 0;
  var _tiles     = {};
  var _slots     = [];
  var _hintUsed  = false;
  var _onBack    = null;

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function getStars() {
    return Number(localStorage.getItem("spellStars") || 0);
  }

  function addStars(n) {
    var total = getStars() + n;
    localStorage.setItem("spellStars", total);
    return total;
  }

  function updateStarDisplay(total) {
    var el = document.getElementById("star-count");
    if (el) el.textContent = total;
  }

  function mountGameBoard(appEl, level, onBack) {
    _app       = appEl;
    _level     = level;
    _onBack    = onBack;
    _queue     = shuffle(WORDS.filter(function (w) { return w.level === level; }));
    _wordIndex = 0;
    renderRound();
  }

  function renderRound() {
    if (_wordIndex >= _queue.length) {
      _onBack();
      return;
    }

    var entry  = _queue[_wordIndex];
    var word   = entry.word;
    _hintUsed  = false;
    _tiles     = {};
    _slots     = [];

    var letters = shuffle(word.split(""));

    _app.innerHTML = "";

    var board = document.createElement("div");
    board.id  = "game-board";

    // ── Header ──
    var header = document.createElement("div");
    header.id  = "game-header";

    var backBtn = document.createElement("button");
    backBtn.id          = "back-btn";
    backBtn.textContent = "← Back";
    backBtn.addEventListener("click", _onBack);

    var progressLabel = document.createElement("div");
    progressLabel.id          = "progress-label";
    progressLabel.textContent = (_wordIndex + 1) + " / " + _queue.length;

    header.appendChild(backBtn);
    header.appendChild(progressLabel);
    board.appendChild(header);

    // ── Creature card ──
    var card = document.createElement("div");
    card.id  = "creature-card";

    var img = document.createElement("img");
    img.id  = "creature-image";
    img.alt = word;
    img.src = entry.image;
    img.addEventListener("error", function () {
      var ph = document.createElement("div");
      ph.className   = "creature-placeholder";
      ph.textContent = word[0].toUpperCase();
      img.parentNode && img.parentNode.replaceChild(ph, img);
    });

    var prompt = document.createElement("div");
    prompt.id          = "prompt-text";
    prompt.textContent = "Spell the summon!";

    card.appendChild(img);
    card.appendChild(prompt);
    board.appendChild(card);

    // ── Action buttons ──
    var actionRow = document.createElement("div");
    actionRow.id  = "action-btns";

    var hearBtn = document.createElement("button");
    hearBtn.className   = "action-btn";
    hearBtn.innerHTML   = "🔊 Hear the word";
    hearBtn.addEventListener("click", function () { speakWord(word); });

    var hintBtn = document.createElement("button");
    hintBtn.className   = "action-btn";
    hintBtn.innerHTML   = "💡 Show a hint";
    hintBtn.addEventListener("click", revealHint);

    actionRow.appendChild(hearBtn);
    actionRow.appendChild(hintBtn);
    board.appendChild(actionRow);

    // ── Slots ──
    var slotsRow = document.createElement("div");
    slotsRow.id  = "slots-row";

    word.split("").forEach(function (letter, i) {
      var slot = createLetterSlot(i, letter);
      _slots.push(slot);
      slotsRow.appendChild(slot);
    });

    board.appendChild(slotsRow);

    // ── Tiles tray ──
    var tray = document.createElement("div");
    tray.id  = "tiles-tray";

    letters.forEach(function (letter, i) {
      var id   = "tile-" + i;
      var tile = createLetterTile(letter, id);
      _tiles[id] = { element: tile, letter: letter.toLowerCase() };
      tray.appendChild(tile);
    });

    board.appendChild(tray);

    // ── Drop event delegation ──
    board.addEventListener("slot-drop", onSlotDrop);

    _app.appendChild(board);

    // Auto-speak the word after a short delay ("hear it → see it → spell it")
    setTimeout(function () { speakWord(word); }, 800);
  }

  function onSlotDrop(e) {
    var tileId    = e.detail.tileId;
    var slotIndex = e.detail.slotIndex;
    var tileData  = _tiles[tileId];
    var slot      = _slots[slotIndex];

    if (!tileData || !slot) return;
    if (slot.dataset.filled !== "false") return;

    var correct = tileData.letter === slot.dataset.expected;

    if (correct) {
      slot.textContent    = tileData.letter.toUpperCase();
      slot.dataset.filled = "true";
      slot.classList.add("filled");
      slot.classList.remove("hint");

      tileData.element.classList.add("used");

      var allFilled = _slots.every(function (s) { return s.dataset.filled === "true"; });
      if (allFilled) {
        var earned = _hintUsed ? 2 : 3;
        var total  = addStars(earned);
        updateStarDisplay(total);
        var word = _queue[_wordIndex].word;
        showWin(word, function () {
          _wordIndex++;
          renderRound();
        });
      }
    } else {
      slot.classList.remove("drag-over");
      slot.classList.add("wrong");
      setTimeout(function () { slot.classList.remove("wrong"); }, 400);
    }
  }

  function revealHint() {
    if (_hintUsed) return;
    _hintUsed = true;

    var firstSlot = _slots[0];
    if (!firstSlot || firstSlot.dataset.filled !== "false") return;

    firstSlot.textContent    = firstSlot.dataset.expected.toUpperCase();
    firstSlot.dataset.filled = "hint";
    firstSlot.classList.add("hint");

    // Dim the matching tile in the tray
    var keys = Object.keys(_tiles);
    for (var i = 0; i < keys.length; i++) {
      var t = _tiles[keys[i]];
      if (t.letter === firstSlot.dataset.expected && !t.element.classList.contains("used")) {
        t.element.style.opacity = "0.4";
        break;
      }
    }
  }

  function speakWord(word) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    var utt  = new SpeechSynthesisUtterance(word);
    utt.rate  = 0.8;
    utt.pitch = 1.1;
    window.speechSynthesis.speak(utt);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LevelSelect
  // ═══════════════════════════════════════════════════════════════════════════

  function mountLevelSelect(appEl, onSelect) {
    appEl.innerHTML = "";

    var container = document.createElement("div");
    container.id  = "level-select";

    var h1 = document.createElement("h1");
    h1.textContent = "Choose Your Level";
    container.appendChild(h1);

    var sub = document.createElement("p");
    sub.textContent = "Drag letters to spell the creature's name!";
    container.appendChild(sub);

    [1, 2, 3].forEach(function (level) {
      var meta      = LEVEL_META[level];
      var wordCount = WORDS.filter(function (w) { return w.level === level; }).length;
      var stars     = "★".repeat(level);

      var btn = document.createElement("button");
      btn.className = "level-btn";
      btn.setAttribute("aria-label", "Level " + level + ": " + meta.name);

      btn.innerHTML =
        '<span class="level-icon">'  + meta.icon + '</span>' +
        '<span class="level-info">'  +
          '<span class="level-name">Level ' + level + ': ' + meta.name + '</span>' +
          '<span class="level-desc">' + meta.desc + '</span>' +
        '</span>' +
        '<span class="level-stars">' + stars + ' <small>(' + wordCount + ' words)</small></span>';

      btn.addEventListener("click", function () { onSelect(level); });
      container.appendChild(btn);
    });

    appEl.appendChild(container);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // App entry point
  // ═══════════════════════════════════════════════════════════════════════════

  function refreshStars() {
    var el = document.getElementById("star-count");
    if (el) el.textContent = getStars();
  }

  function showLevelSelect() {
    refreshStars();
    mountLevelSelect(document.getElementById("app"), function (level) {
      showGameBoard(level);
    });
  }

  function showGameBoard(level) {
    mountGameBoard(document.getElementById("app"), level, function () {
      showLevelSelect();
    });
  }

  refreshStars();
  showLevelSelect();

}());
