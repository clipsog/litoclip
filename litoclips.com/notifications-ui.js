// Backend-driven notifications bell dropdown
(function () {
  function isAuthed() {
    return !!localStorage.getItem('token');
  }

  function apiBase() {
    var isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocal ? 'http://localhost:37373/api' : (window.location.origin + '/api');
  }

  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var diff = Date.now() - d.getTime();
    var m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    var days = Math.floor(h / 24);
    return days + 'd ago';
  }

  function titleFor(n) {
    var t = n.type || '';
    var p = n.payload || {};
    if (t === 'new_post') return 'New post on ' + (p.campaignTitle || 'your campaign');
    if (t === 'sponsor_offer') return 'New sponsor offer';
    if (t === 'campaign_paid') return 'Campaign paid';
    if (t === 'campaign_created') return 'Campaign created';
    if (t) return t.replace(/_/g, ' ');
    return 'Notification';
  }

  function hrefFor(n) {
    var p = n.payload || {};
    if (p.campaignId) {
      var name = p.campaignTitle || p.campaignName || 'Campaign';
      return 'campaign-track.html?id=' + encodeURIComponent(p.campaignId) + '&name=' + encodeURIComponent(name);
    }
    return 'brand-overview.html';
  }

  function ensureUI(bell) {
    if (!bell || document.getElementById('notifPopover')) return;

    bell.setAttribute('aria-haspopup', 'true');
    bell.setAttribute('aria-expanded', 'false');

    var badge = document.createElement('span');
    badge.id = 'notifBadge';
    badge.className = 'notif-badge';
    badge.textContent = '0';
    badge.style.display = 'none';
    bell.style.position = 'relative';
    bell.appendChild(badge);

    var pop = document.createElement('div');
    pop.id = 'notifPopover';
    pop.className = 'notif-popover';
    pop.innerHTML =
      '<div class="notif-popover-header">' +
      '  <div class="notif-popover-title">Alerts</div>' +
      '  <button type="button" class="notif-markall" id="notifMarkAll">Mark all read</button>' +
      '</div>' +
      '<div class="notif-popover-body" id="notifList">' +
      '  <div class="notif-empty">No alerts yet.</div>' +
      '</div>';
    document.body.appendChild(pop);

    function position() {
      var r = bell.getBoundingClientRect();
      pop.style.top = (window.scrollY + r.bottom + 10) + 'px';
      pop.style.right = Math.max(12, (window.innerWidth - (r.right + window.scrollX))) + 'px';
    }
    bell._notifPosition = position;
  }

  async function fetchUnread() {
    var token = localStorage.getItem('token');
    var res = await fetch(apiBase() + '/notifications/unread-count', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return 0;
    var data = await res.json().catch(function () { return null; });
    return (data && typeof data.unread === 'number') ? data.unread : 0;
  }

  async function fetchList() {
    var token = localStorage.getItem('token');
    var res = await fetch(apiBase() + '/notifications?limit=10', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return [];
    return await res.json().catch(function () { return []; });
  }

  async function markRead(ids) {
    var token = localStorage.getItem('token');
    await fetch(apiBase() + '/notifications/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ ids: ids })
    }).catch(function () {});
  }

  async function markAllRead() {
    var token = localStorage.getItem('token');
    await fetch(apiBase() + '/notifications/mark-all-read', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    }).catch(function () {});
  }

  function setBadge(n) {
    var badge = document.getElementById('notifBadge');
    if (!badge) return;
    if (n > 0) {
      badge.textContent = String(n > 99 ? '99+' : n);
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  function renderList(items) {
    var list = document.getElementById('notifList');
    if (!list) return;
    if (!items || !items.length) {
      list.innerHTML = '<div class="notif-empty">No alerts yet.</div>';
      return;
    }
    list.innerHTML = '';
    items.forEach(function (n) {
      var a = document.createElement('a');
      a.className = 'notif-item' + (n.read ? '' : ' unread');
      a.href = hrefFor(n);
      a.innerHTML =
        '<div class="notif-item-title">' + String(titleFor(n)).replace(/</g, '&lt;') + '</div>' +
        '<div class="notif-item-meta">' + (fmtTime(n.createdAt) || '') + '</div>';
      a.addEventListener('click', function () {
        if (!n.read && n.id) markRead([n.id]);
      });
      list.appendChild(a);
    });
  }

  function open(bell) {
    var pop = document.getElementById('notifPopover');
    if (!pop) return;
    pop.classList.add('open');
    bell.setAttribute('aria-expanded', 'true');
    if (bell._notifPosition) bell._notifPosition();
  }

  function close(bell) {
    var pop = document.getElementById('notifPopover');
    if (!pop) return;
    pop.classList.remove('open');
    bell.setAttribute('aria-expanded', 'false');
  }

  window.addEventListener('DOMContentLoaded', async function () {
    if (!isAuthed()) return;
    var bell = document.querySelector('.nav-bell');
    if (!bell) return;

    ensureUI(bell);

    try {
      var unread = await fetchUnread();
      setBadge(unread);
    } catch (_) {}

    bell.addEventListener('click', async function (e) {
      e.preventDefault();
      var pop = document.getElementById('notifPopover');
      if (!pop) return;
      var isOpen = pop.classList.contains('open');
      if (isOpen) {
        close(bell);
        return;
      }
      open(bell);
      try {
        var items = await fetchList();
        renderList(items);
        var unreadIds = items.filter(function (x) { return x && !x.read && x.id; }).map(function (x) { return x.id; });
        if (unreadIds.length) {
          await markRead(unreadIds);
          setBadge(0);
        }
      } catch (_) {}
    });

    document.getElementById('notifMarkAll')?.addEventListener('click', async function () {
      await markAllRead();
      setBadge(0);
      var items = await fetchList().catch(function () { return []; });
      renderList(items.map(function (x) { x.read = true; return x; }));
    });

    window.addEventListener('resize', function () { bell._notifPosition && bell._notifPosition(); });
    window.addEventListener('scroll', function () { bell._notifPosition && bell._notifPosition(); }, { passive: true });
    document.addEventListener('click', function (e) {
      var pop = document.getElementById('notifPopover');
      if (!pop) return;
      if (!pop.classList.contains('open')) return;
      if (e.target.closest && (e.target.closest('.nav-bell') || e.target.closest('#notifPopover'))) return;
      close(bell);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close(bell);
    });
  });
})();

