(function () {
  'use strict';

  // ---------- Config ----------
  var runtimeConfig = window.__ATOMOS_CONFIG__ || {};
  var API_BASE = (runtimeConfig.API_URL || '').trim().replace(/\/+$/, '') + '/api';

  var refreshTimers = [];
  var chartInstance = null;
  var chartRange = '24h';
  var currentAddress = null;

  // ---------- Formatters (same conventions as the original dashboard) ----------
  function hashSuffix(value) {
    var suffixes = [' H/s', ' KH/s', ' MH/s', ' GH/s', ' TH/s', ' PH/s', ' EH/s', ' ZH/s', ' YH/s'];
    if (value == null || value < 0) return '0 H/s';
    if (value === 0) return '0 H/s';
    var power = Math.floor(Math.log10(value) / 3);
    if (power < 0) power = 0;
    if (power >= suffixes.length) power = suffixes.length - 1;
    return (value / Math.pow(1000, power)).toFixed(1) + suffixes[power];
  }

  function numberSuffix(value) {
    var suffixes = ['', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'];
    if (value == null || value <= 0) return '0';
    var power = Math.floor(Math.log10(value) / 3);
    if (power < 0) power = 0;
    if (power >= suffixes.length) power = suffixes.length - 1;
    return (value / Math.pow(1000, power)).toFixed(2) + suffixes[power];
  }

  function formatUSD(value) {
    if (value == null) return '$0.00';
    return '$' + Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function dateAgo(dateStr) {
    if (!dateStr) return '-';
    var diffMs = Date.now() - new Date(dateStr).getTime();
    var seconds = Math.max(0, Math.floor(diffMs / 1000));
    if (seconds < 60) return seconds.toFixed(0) + ' seconds';
    var minutes = seconds / 60;
    if (minutes < 60) return minutes.toFixed(1) + ' minutes';
    var hours = minutes / 60;
    if (hours < 24) return hours.toFixed(1) + ' hours';
    return (hours / 24).toFixed(1) + ' days';
  }

  function averageTimeToBlock(hashRate, difficulty) {
    if (!hashRate || hashRate <= 0 || !difficulty) return 'n/a';
    var seconds = (difficulty * Math.pow(2, 32)) / hashRate;
    var years = seconds / (365.25 * 24 * 3600);
    if (years >= 1) return years.toFixed(1) + ' years';
    var days = seconds / (24 * 3600);
    if (days >= 1) return days.toFixed(1) + ' days';
    var hours = seconds / 3600;
    return hours.toFixed(1) + ' hours';
  }

  function isValidBitcoinAddress(value) {
    if (!value) return false;
    value = value.trim();
    // Basic format check (not cryptographic validation): legacy P2PKH/P2SH or bech32
    return /^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(value) || /^(bc1|tb1)[a-z0-9]{25,90}$/i.test(value);
  }

  // ---------- API helpers ----------
  function apiGet(path) {
    return fetch(API_BASE + path).then(function (res) {
      if (!res.ok) throw new Error('Request failed: ' + path);
      return res.json();
    });
  }

  function apiPatch(path, body) {
    return fetch(API_BASE + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) throw new Error('Request failed: ' + path);
      return res.json();
    });
  }

  function apiPost(path, body) {
    return fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      if (!res.ok) throw new Error('Request failed: ' + path);
      return res.json();
    });
  }

  // ---------- Toast ----------
  function showToast(message, isError) {
    var el = document.createElement('div');
    el.className = 'toast' + (isError ? ' is-error' : '');
    el.textContent = message;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }

  // ---------- Copy to clipboard ----------
  function copyText(value, label) {
    var complete = function () { showToast(label + ' copied'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(complete, function () { fallbackCopy(value, complete); });
    } else {
      fallbackCopy(value, complete);
    }
  }

  function fallbackCopy(value, complete) {
    var textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(textarea);
    complete();
  }

  // ---------- Confetti ----------
  var confettiCanvas = document.getElementById('confetti-canvas');
  var confettiCtx = confettiCanvas ? confettiCanvas.getContext('2d') : null;
  var confettiParticles = [];
  var confettiAnimationId = null;
  var confettiColors = ['#00e5ff', '#ff2d8a', '#00e5b0', '#e0e2e8', '#ffd700'];

  function resizeConfettiCanvas() {
    if (!confettiCanvas) return;
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }

  function spawnConfettiParticles() {
    confettiParticles = [];
    var count = 160;
    for (var i = 0; i < count; i++) {
      confettiParticles.push({
        x: Math.random() * window.innerWidth,
        y: -20 - Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 2,
        vy: 2 + Math.random() * 3,
        size: 5 + Math.random() * 6,
        color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10
      });
    }
  }

  function animateConfetti() {
    if (!confettiCtx) return;
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

    confettiParticles.forEach(function (p) {
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;

      if (p.y > confettiCanvas.height + 20) {
        p.y = -20;
        p.x = Math.random() * confettiCanvas.width;
      }

      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate((p.rotation * Math.PI) / 180);
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      confettiCtx.restore();
    });

    confettiAnimationId = requestAnimationFrame(animateConfetti);
  }

  function startConfetti() {
    if (!confettiCtx) return;
    resizeConfettiCanvas();
    spawnConfettiParticles();
    if (confettiAnimationId == null) {
      animateConfetti();
    }
  }

  function stopConfetti() {
    if (confettiAnimationId != null) {
      cancelAnimationFrame(confettiAnimationId);
      confettiAnimationId = null;
    }
    if (confettiCtx) {
      confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
  }

  window.addEventListener('resize', resizeConfettiCanvas);

  // ---------- Block-found overlay ----------
  var BLOCK_COUNT_KEY = 'atomos-last-cleared-block-count';

  function showBlockFoundOverlay() {
    document.getElementById('block-found-overlay').style.display = 'flex';
    startConfetti();
  }

  function hideBlockFoundOverlay(persistCount) {
    document.getElementById('block-found-overlay').style.display = 'none';
    stopConfetti();
    if (persistCount != null) {
      localStorage.setItem(BLOCK_COUNT_KEY, String(persistCount));
    }
  }

  function checkForNewBlock(blocksFoundCount) {
    if (blocksFoundCount == null) return;
    var stored = localStorage.getItem(BLOCK_COUNT_KEY);
    if (stored == null) {
      // First time this dashboard has ever checked - don't flash for blocks
      // that were already found before this was installed, just set the baseline.
      localStorage.setItem(BLOCK_COUNT_KEY, String(blocksFoundCount));
      return;
    }
    if (blocksFoundCount > Number(stored)) {
      showBlockFoundOverlay();
    }
  }

  document.getElementById('block-found-clear').addEventListener('click', function () {
    var count = lastClientInfo ? lastClientInfo.blocksFoundCount : 0;
    hideBlockFoundOverlay(count);
  });


  function renderSetup() {
    clearTimers();
    var root = document.getElementById('app-root');
    root.innerHTML =
      '<div class="setup-screen">' +
      '  <img src="assets/logo.svg" alt="ATOMOS">' +
      '  <p>One-time setup. Enter the Bitcoin address you want this dashboard to track - it\'s saved so you land straight on your dashboard every time after this.</p>' +
      '  <input id="setup-address" type="text" placeholder="bc1...">' +
      '  <button id="setup-submit" disabled>Save & Continue</button>' +
      '  <div id="setup-error" class="setup-error"></div>' +
      '</div>';

    var input = document.getElementById('setup-address');
    var button = document.getElementById('setup-submit');
    var errorEl = document.getElementById('setup-error');

    input.addEventListener('input', function () {
      button.disabled = !isValidBitcoinAddress(input.value);
      errorEl.textContent = '';
    });

    button.addEventListener('click', function () {
      var address = input.value.trim();
      if (!isValidBitcoinAddress(address)) return;
      button.disabled = true;
      apiPatch('/settings', { btcAddress: address }).then(function () {
        currentAddress = address;
        renderDashboardShell();
      }).catch(function () {
        errorEl.textContent = 'Could not save address - check the server connection and try again.';
        button.disabled = false;
      });
    });
  }

  function clearTimers() {
    refreshTimers.forEach(function (t) { clearInterval(t); });
    refreshTimers = [];
  }

  // ---------- Dashboard ----------
  function renderDashboardShell() {
    clearTimers();
    var root = document.getElementById('app-root');
    root.innerHTML =
      '<div class="page">' +
      '  <div class="card header-bar">' +
      '    <div class="header-address"><span>Address</span><div>' + currentAddress + '</div></div>' +
      '    <div class="header-status">' +
      '      <span class="status-pill is-live" id="node-status"><span class="live-dot"></span> Checking node...</span>' +
      '      <span class="status-pill" id="uptime-status">Uptime -</span>' +
      '    </div>' +
      '  </div>' +

      '  <div class="card">' +
      '    <div class="card-header"><h4>Connection</h4></div>' +
      '    <div class="conn-row"><span>Stratum V1</span><code id="conn-stratum">-</code><button data-copy-target="conn-stratum" data-copy-label="Stratum URL">Copy</button></div>' +
      '    <div class="conn-row"><span>Miner Username</span><code>&lt;your BTC address&gt;.&lt;worker name&gt;</code><button id="copy-username">Copy</button></div>' +
      '  </div>' +

      '  <div class="reward-row">' +
      '    <div class="card reward-card"><div class="card-label"><i>&#8383;</i> BTC Reward Tracker</div><div class="card-value is-cyan">3.12500000 <span>BTC</span></div><div class="card-sub">Total block reward</div></div>' +
      '    <div class="card reward-card"><div class="card-value is-cyan" id="price-value">-</div><div class="card-sub">BTC/USD <span id="price-change"></span></div></div>' +
      '    <div class="card reward-card"><div class="card-value is-cyan" id="price-per-block">-</div><div class="card-sub">&#8776; per block reward</div></div>' +
      '    <div class="card reward-card is-accent"><div class="card-label">Next Halving</div><div class="card-value is-pink" id="halving-days">-</div><div class="card-sub" id="halving-sub"></div></div>' +
      '  </div>' +

      '  <div class="stat-row">' +
      '    <div class="card stat-card"><div class="card-label">Total Hashrate</div><div class="card-value" id="stat-hashrate">-</div></div>' +
      '    <div class="card stat-card"><div class="card-label">Active Workers</div><div class="card-value" id="stat-workers">-</div></div>' +
      '    <div class="card stat-card"><div class="card-label">Blocks Found</div><div class="card-value" id="stat-blocks">-</div></div>' +
      '    <div class="card stat-card"><div class="card-label">Block Reward</div><div class="card-value" id="stat-reward">-</div></div>' +
      '    <div class="card stat-card"><div class="card-label">Total Earned (est.)</div><div class="card-value" id="stat-earned">-</div></div>' +
      '  </div>' +

      '  <div class="card">' +
      '    <div class="network-card-header">' +
      '      <div><span class="card-label">Block Height</span><div class="card-value is-large" id="net-height">-</div></div>' +
      '      <span class="card-sub" id="net-weight"></span>' +
      '    </div>' +
      '    <div class="network-card-grid">' +
      '      <div class="network-metric"><span>Network Difficulty</span><strong class="is-cyan" id="net-difficulty">-</strong><small id="net-hashrate-sub"></small></div>' +
      '      <div class="network-metric"><span>Best Difficulty</span><strong class="is-pink" id="net-best-diff">-</strong><small>Best submitted difficulty for this address</small></div>' +
      '    </div>' +
      '  </div>' +

      '  <div class="card">' +
      '    <div class="card-header"><div><h4>Live Worker Activity</h4><span>Grouped by worker name.</span></div></div>' +
      '    <table>' +
      '      <thead><tr><th>Name</th><th class="numeric-cell">Hashrate</th><th class="numeric-cell">Best Difficulty</th><th class="numeric-cell">Last Seen</th><th class="numeric-cell">Reset</th></tr></thead>' +
      '      <tbody id="worker-table-body"><tr><td colspan="5">Loading...</td></tr></tbody>' +
      '    </table>' +
      '  </div>' +

      '  <div class="card">' +
      '    <div class="card-header">' +
      '      <div><h4>Peak Share Difficulty</h4><span id="peak-diff-summary">-</span></div>' +
      '      <div class="range-toggle">' +
      '        <button data-range="24h" class="active">24H</button>' +
      '        <button data-range="3d">3D</button>' +
      '        <button data-range="7d">7D</button>' +
      '      </div>' +
      '    </div>' +
      '    <div class="chart-container"><canvas id="hashrate-chart"></canvas><div id="chart-placeholder" class="chart-placeholder"><div class="scan-bar"></div><span id="chart-placeholder-text">Collecting share data&#8230;</span></div></div>' +
      '  </div>' +

      '  <div class="panel-row">' +
      '    <div class="card"><h4 class="panel-title is-cyan">Share History <small>(24h)</small></h4>' +
      '      <div class="panel-stat"><span>Accepted Shares</span><strong id="panel-shares">-</strong></div>' +
      '      <div class="panel-stat"><span>Active Workers</span><strong id="panel-workers">-</strong></div>' +
      '      <div class="panel-stat"><span>Best Hash</span><strong id="panel-best-hash">-</strong></div>' +
      '    </div>' +
      '    <div class="card"><h4 class="panel-title is-teal">Block Probability</h4>' +
      '      <div class="panel-stat"><span>Network Share</span><strong id="panel-network-share">-</strong></div>' +
      '      <div class="panel-stat"><span>Est. Time To Find</span><strong id="panel-time-to-find">-</strong></div>' +
      '      <div class="probability-bar"><div class="probability-fill" id="panel-progress" style="width:0%"></div></div>' +
      '    </div>' +
      '    <div class="card"><h4 class="panel-title is-pink">Block History</h4><div id="panel-blocks"><div class="panel-empty">No blocks found yet</div></div></div>' +
      '  </div>' +

      '  <div class="card footer-bar">' +
      '    <span>ATOMOS OS</span>' +
      '    <span class="is-teal" id="footer-stratum">STRATUM: CHECKING</span>' +
      '    <span id="footer-difficulty">DIFFICULTY: -</span>' +
      '    <span id="footer-best">BEST SHARE: -</span>' +
      '    <span class="is-pink">SOLO MODE: ENABLED</span>' +
      '  </div>' +
      '</div>';

    document.querySelectorAll('.range-toggle button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.range-toggle button').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        chartRange = btn.getAttribute('data-range');
        refreshChart();
      });
    });

    document.getElementById('copy-username').addEventListener('click', function () {
      copyText(currentAddress + '.worker1', 'Miner username');
    });

    document.getElementById('worker-table-body').addEventListener('click', function (e) {
      var btn = e.target.closest('.reset-diff-btn');
      if (!btn) return;

      var sessionIds = (btn.getAttribute('data-session-ids') || '').split(',').filter(Boolean);
      var workerName = btn.getAttribute('data-worker-name');

      if (sessionIds.length === 0) return;

      if (!confirm('Reset best difficulty for ' + workerName + '? This cannot be undone.')) {
        return;
      }

      btn.disabled = true;
      btn.textContent = '...';

      Promise.all(sessionIds.map(function (sessionId) {
        return apiPost('/client/' + encodeURIComponent(currentAddress) + '/' + encodeURIComponent(sessionId) + '/reset-difficulty');
      }))
        .then(function () {
          showToast('Best difficulty reset for ' + workerName + '.');
          refreshClientInfo();
        })
        .catch(function () {
          showToast('Could not reset difficulty - try again.', true);
          btn.disabled = false;
          btn.textContent = 'Reset';
        });
    });

    // Initial connection info (stratum URL from runtime config, same-origin hostname fallback)
    var stratumUrl = (runtimeConfig.STRATUM_URL || (window.location.hostname + ':2018'));
    document.getElementById('conn-stratum').textContent = 'stratum+tcp://' + stratumUrl;
    document.querySelector('[data-copy-target="conn-stratum"]').addEventListener('click', function () {
      copyText('stratum+tcp://' + stratumUrl, 'Stratum URL');
    });

    // Kick off polling
    refreshClientInfo();
    refreshNetworkInfo();
    refreshPrice();
    refreshHalving();
    refreshChart();

    refreshTimers.push(setInterval(refreshClientInfo, 10000));
    refreshTimers.push(setInterval(refreshNetworkInfo, 10000));
    refreshTimers.push(setInterval(refreshChart, 10000));
    refreshTimers.push(setInterval(refreshPrice, 60000));
    refreshTimers.push(setInterval(refreshHalving, 300000));
  }

  var lastClientInfo = null;
  var lastNetworkInfo = null;

  function refreshClientInfo() {
    apiGet('/client/' + encodeURIComponent(currentAddress)).then(function (info) {
      lastClientInfo = info;

      var activeGrouped = getActiveGroupedWorkers(info.workers || []);
      var totalHashRate = activeGrouped.reduce(function (sum, w) { return sum + w.hashRate; }, 0);

      setText('stat-hashrate', hashSuffix(totalHashRate));
      setText('stat-workers', activeGrouped.length);
      setText('stat-blocks', info.blocksFoundCount != null ? info.blocksFoundCount : 0);
      setText('stat-reward', info.currentBlockReward != null ? info.currentBlockReward.toFixed(3) : '-');
      setText('stat-earned', info.totalEarnedEstimate != null ? info.totalEarnedEstimate.toFixed(8) : '-');
      setText('net-best-diff', numberSuffix(info.bestDifficulty));
      setText('panel-shares', info.acceptedSharesLast24h != null ? info.acceptedSharesLast24h.toLocaleString() : '-');
      setText('panel-workers', activeGrouped.length);
      setText('panel-best-hash', numberSuffix(info.bestDifficulty));
      setText('footer-best', numberSuffix(info.bestDifficulty));

      renderWorkerTable(info.workers || []);
      renderBlockHistory(info.blocksFound || []);
      checkForNewBlock(info.blocksFoundCount);

      if (lastNetworkInfo) {
        updateBlockProbability(totalHashRate, lastNetworkInfo, info.bestDifficulty);
      }

      document.getElementById('node-status').innerHTML = '<span class="live-dot"></span> Node Connected';
    }).catch(function () {
      document.getElementById('node-status').innerHTML = '<span class="live-dot is-error"></span> Connection Error';
    });
  }

  function refreshNetworkInfo() {
    apiGet('/network').then(function (info) {
      lastNetworkInfo = info;
      setText('net-height', Number(info.blocks).toLocaleString());
      setText('net-weight', 'Current block weight ' + Number(info.currentblockweight || 0).toLocaleString());
      setText('net-difficulty', numberSuffix(info.difficulty));
      setText('net-hashrate-sub', hashSuffix(info.networkhashps) + ' network hashrate');
      setText('footer-difficulty', 'DIFFICULTY: ' + numberSuffix(info.difficulty));
      setText('footer-stratum', 'STRATUM: CONNECTED');

      if (lastClientInfo) {
        var totalHashRate = getActiveGroupedWorkers(lastClientInfo.workers || []).reduce(function (sum, w) { return sum + w.hashRate; }, 0);
        updateBlockProbability(totalHashRate, info, lastClientInfo.bestDifficulty);
      }
    }).catch(function () {
      setText('footer-stratum', 'STRATUM: ERROR');
    });
  }

  function updateBlockProbability(hashRate, networkInfo, bestDifficulty) {
    var sharePercent = (networkInfo.networkhashps && hashRate > 0) ? (hashRate / networkInfo.networkhashps) * 100 : 0;
    setText('panel-network-share', sharePercent.toFixed(8) + '%');
    setText('panel-time-to-find', averageTimeToBlock(hashRate, networkInfo.difficulty));
    var progress = (bestDifficulty && networkInfo.difficulty) ? Math.min(100, (bestDifficulty / networkInfo.difficulty) * 100) : 0;
    var progressEl = document.getElementById('panel-progress');
    if (progressEl) progressEl.style.width = progress + '%';
  }

  function refreshPrice() {
    apiGet('/price').then(function (price) {
      setText('price-value', formatUSD(price.usd));
      setText('price-per-block', formatUSD(price.usd * 3.125));
      var changeEl = document.getElementById('price-change');
      if (changeEl) {
        var up = price.usd_24h_change >= 0;
        changeEl.innerHTML = '<span class="price-change ' + (up ? 'is-up' : 'is-down') + '">' + (up ? '\u25B2' : '\u25BC') + ' ' + Math.abs(price.usd_24h_change).toFixed(2) + '%</span>';
      }
    }).catch(function () { setText('price-value', 'n/a'); });
  }

  function refreshHalving() {
    apiGet('/halving').then(function (halving) {
      setText('halving-days', '~' + halving.estimatedDaysRemaining.toFixed(1) + ' days');
      setText('halving-sub', 'Est. time to block ' + Number(halving.nextHalvingHeight).toLocaleString());
    }).catch(function () { setText('halving-days', 'n/a'); });
  }

  function refreshChart() {
    apiGet('/client/' + encodeURIComponent(currentAddress) + '/difficulty-history?range=' + chartRange).then(function (data) {
      console.log('[ATOMOS] /difficulty-history raw response (range=' + chartRange + '):', data);
      renderChart(data || [], null);
    }).catch(function (err) {
      console.error('[ATOMOS] /difficulty-history request failed:', err);
      renderChart([], 'error');
    });
  }

  function renderChart(points, state) {
    var ctx = document.getElementById('hashrate-chart');
    var placeholder = document.getElementById('chart-placeholder');
    var placeholderText = document.getElementById('chart-placeholder-text');
    var summaryEl = document.getElementById('peak-diff-summary');
    if (!ctx || typeof Chart === 'undefined') return;

    if (points.length === 0) {
      if (placeholder) {
        placeholder.style.display = 'flex';
        if (placeholderText) {
          placeholderText.textContent = state === 'error'
            ? 'Could not load share data - retrying...'
            : 'Collecting share data\u2026 (fills in as shares are submitted)';
        }
        placeholder.classList.toggle('is-error', state === 'error');
      }
      if (summaryEl) summaryEl.textContent = '-';
      return;
    }

    if (placeholder) placeholder.style.display = 'none';

    var bestPoint = points.reduce(function (best, p) {
      return (Number(p.peakDifficulty) > Number(best.peakDifficulty)) ? p : best;
    }, points[0]);

    if (summaryEl) {
      summaryEl.innerHTML = numberSuffix(bestPoint.peakDifficulty) + ' <strong style="color:var(--text);font-weight:400;">best</strong> \u00b7 ' + chartRange.toUpperCase();
    }

    var labels = points.map(function (p) {
      var d = new Date(Number(p.time));
      return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });
    var values = points.map(function (p) { return Number(p.peakDifficulty) || 0; });

    if (chartInstance) {
      chartInstance.data.labels = labels;
      chartInstance.data.datasets[0].data = values;
      chartInstance.data.datasets[0]._points = points;
      chartInstance.update('none');
      return;
    }

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Peak Difficulty',
          data: values,
          _points: points,
          backgroundColor: '#00e5ff',
          borderRadius: 2,
          maxBarThickness: 14
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0c1018',
            borderColor: '#1a2230',
            borderWidth: 1,
            titleColor: '#e0e2e8',
            bodyColor: '#8890a0',
            padding: 10,
            callbacks: {
              title: function (items) {
                return items[0].label;
              },
              label: function (item) {
                var p = item.dataset._points[item.dataIndex];
                return [
                  'Peak diff: ' + numberSuffix(p.peakDifficulty),
                  'Shares: ' + (p.totalShares != null ? Number(p.totalShares).toLocaleString() : '-'),
                  'Worker: ' + (p.worker || 'unknown')
                ];
              }
            }
          }
        },
        scales: {
          x: { ticks: { color: '#8890a0', maxTicksLimit: 8 }, grid: { display: false } },
          y: { ticks: { color: '#8890a0', callback: function (value) { return numberSuffix(value); } }, grid: { color: '#1a2230' } }
        }
      }
    });
  }

  var INACTIVE_CUTOFF_MS = 3 * 60 * 1000;

  // Shared by the stat cards and the table, so both always agree on what
  // counts as "active" and never show conflicting numbers.
  function getActiveGroupedWorkers(workers) {
    var now = Date.now();

    var active = (workers || []).filter(function (w) {
      var lastSeenMs = new Date(w.lastSeen).getTime();
      return (now - lastSeenMs) < INACTIVE_CUTOFF_MS;
    });

    var groups = {};
    active.forEach(function (w) {
      var key = w.name || 'unknown';
      if (!groups[key]) {
        groups[key] = {
          name: key,
          hashRate: 0,
          bestDifficulty: 0,
          lastSeen: w.lastSeen,
          sessionIds: []
        };
      }
      var g = groups[key];
      g.hashRate += Math.floor(w.hashRate || 0);
      g.bestDifficulty = Math.max(g.bestDifficulty, Number(w.bestDifficulty) || 0);
      if (new Date(w.lastSeen).getTime() > new Date(g.lastSeen).getTime()) {
        g.lastSeen = w.lastSeen;
      }
      g.sessionIds.push(w.sessionId);
    });

    var grouped = Object.keys(groups).map(function (key) { return groups[key]; });

    grouped.sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
    });

    return grouped;
  }

  function renderWorkerTable(workers) {
    var tbody = document.getElementById('worker-table-body');
    if (!tbody) return;

    var grouped = getActiveGroupedWorkers(workers);

    if (grouped.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5">No workers connected yet.</td></tr>';
      return;
    }

    tbody.innerHTML = grouped.map(function (w) {
      return '<tr>' +
        '<td>' + escapeHtml(w.name) + ' <span class="solo-badge">SOLO</span></td>' +
        '<td class="numeric-cell">' + hashSuffix(w.hashRate) + '</td>' +
        '<td class="numeric-cell">' + numberSuffix(w.bestDifficulty) + '</td>' +
        '<td class="numeric-cell">' + dateAgo(w.lastSeen) + '</td>' +
        '<td class="numeric-cell"><button class="reset-diff-btn" data-session-ids="' + escapeHtml(w.sessionIds.join(',')) + '" data-worker-name="' + escapeHtml(w.name) + '">Reset</button></td>' +
        '</tr>';
    }).join('');
  }

  function renderBlockHistory(blocks) {
    var el = document.getElementById('panel-blocks');
    if (!el) return;
    if (!blocks || blocks.length === 0) {
      el.innerHTML = '<div class="panel-empty">No blocks found yet</div>';
      return;
    }
    el.innerHTML = blocks.map(function (b) {
      return '<div class="panel-stat"><span>#' + b.height + '</span><strong>' + escapeHtml(b.worker || '') + '</strong></div>';
    }).join('');
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  // ---------- Settings modal ----------
  function openSettingsModal() {
    apiGet('/settings').then(function (settings) {
      var backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML =
        '<div class="modal">' +
        '  <h3>Settings</h3>' +
        '  <div class="modal-section">' +
        '    <label>Discord Webhook URL</label>' +
        '    <input type="password" id="s-webhook" placeholder="' + (settings.hasWebhookConfigured ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (saved - leave blank to keep it)' : 'https://discord.com/api/webhooks/...') + '">' +
        '    <small>Server Settings &gt; Integrations &gt; Webhooks &gt; New Webhook &gt; Copy URL.</small>' +
        '  </div>' +
        '  <div class="modal-section">' +
        '    <label>BTC Address</label>' +
        '    <input type="text" id="s-address" value="' + escapeHtml(settings.btcAddress || '') + '">' +
        '  </div>' +
        '  <div class="modal-section">' +
        '    <button class="btn btn-outline" id="s-test-webhook">Test Webhook</button>' +
        '    <small>Tests the currently saved webhook - save changes above first if you just entered a new URL.</small>' +
        '  </div>' +
        '  <div class="modal-section">' +
        '    <button class="btn btn-outline" id="s-test-animation">Test Block-Found Animation</button>' +
        '    <small>Previews the full-screen alert without affecting your real block count.</small>' +
        '  </div>' +
        '  <div class="modal-section">' +
        '    <label>Alerts</label>' +
        '    <div class="toggle-row"><span>Block found</span>' + toggleHtml('s-alert-block', settings.alertBlockFound) + '</div>' +
        '    <div class="toggle-row"><span>New best difficulty</span>' + toggleHtml('s-alert-diff', settings.alertBestDifficulty) + '</div>' +
        '    <div class="toggle-row"><span>Server restart</span>' + toggleHtml('s-alert-restart', settings.alertRestart) + '</div>' +
        '  </div>' +
        '  <div class="modal-buttons">' +
        '    <button class="btn" id="s-cancel">Cancel</button>' +
        '    <button class="btn btn-primary" id="s-save">Save</button>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(backdrop);

      document.getElementById('s-cancel').addEventListener('click', function () { backdrop.remove(); });
      backdrop.addEventListener('click', function (e) { if (e.target === backdrop) backdrop.remove(); });

      document.getElementById('s-test-webhook').addEventListener('click', function () {
        apiPost('/settings/test-webhook').then(function (result) {
          if (result.success) showToast('Test sent - check your Discord channel.');
          else showToast('Test failed: ' + (result.error || 'unknown error'), true);
        }).catch(function () { showToast('Test failed - could not reach the server.', true); });
      });

      document.getElementById('s-test-animation').addEventListener('click', function () {
        showBlockFoundOverlay();
      });

      document.getElementById('s-save').addEventListener('click', function () {
        var payload = {
          btcAddress: document.getElementById('s-address').value.trim(),
          alertBlockFound: document.getElementById('s-alert-block').checked,
          alertBestDifficulty: document.getElementById('s-alert-diff').checked,
          alertRestart: document.getElementById('s-alert-restart').checked
        };
        var webhookVal = document.getElementById('s-webhook').value.trim();
        if (webhookVal.length > 0) payload.discordWebhookUrl = webhookVal;

        apiPatch('/settings', payload).then(function () {
          showToast('Settings saved.');
          backdrop.remove();
          if (payload.btcAddress && payload.btcAddress !== currentAddress) {
            currentAddress = payload.btcAddress;
            renderDashboardShell();
          }
        }).catch(function () { showToast('Could not save settings.', true); });
      });
    }).catch(function () { showToast('Could not load settings.', true); });
  }

  function toggleHtml(id, checked) {
    return '<label class="switch"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '><span class="slider"></span></label>';
  }

  // ---------- Init ----------
  document.getElementById('settings-btn').addEventListener('click', openSettingsModal);

  apiGet('/settings').then(function (settings) {
    if (settings.btcAddress && settings.btcAddress.length > 0) {
      currentAddress = settings.btcAddress;
      renderDashboardShell();
    } else {
      renderSetup();
    }
  }).catch(function () {
    renderSetup();
  });

})();
