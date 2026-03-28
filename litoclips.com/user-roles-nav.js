/**
 * Shared helpers for creator / sponsor dual roles (localStorage user + /api/auth/me).
 */
(function (global) {
  function getRoles(u) {
    if (!u) return [];
    if (Array.isArray(u.userRoles) && u.userRoles.length) return u.userRoles.slice();
    var t = u.userType || u.user_type || 'creator';
    return [t];
  }

  function hasSponsorRole(u) {
    return getRoles(u).indexOf('sponsor') >= 0;
  }

  function hasCreatorRole(u) {
    var r = getRoles(u);
    return r.indexOf('creator') >= 0 || r.indexOf('brand') >= 0;
  }

  function persistUser(u) {
    if (!u) return;
    try {
      localStorage.setItem('user', JSON.stringify(u));
      if (u.userType) localStorage.setItem('userType', u.userType);
    } catch (e) {}
  }

  function switchToRole(role, dashboardHref) {
    var raw = localStorage.getItem('user');
    var u = raw ? JSON.parse(raw) : {};
    u.userType = role;
    persistUser(u);
    if (dashboardHref) window.location.href = dashboardHref;
  }

  async function syncUserFromApi(apiBase, token) {
    if (!token || !apiBase) return null;
    try {
      var r = await fetch(apiBase + '/auth/me', { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) return null;
      var me = await r.json();
      var raw = localStorage.getItem('user');
      var u = raw ? JSON.parse(raw) : {};
      u.userRoles = me.userRoles || getRoles(me);
      u.userType = me.userType;
      u.isAdmin = me.isAdmin;
      if (me.firstName != null) u.firstName = me.firstName;
      if (me.lastName != null) u.lastName = me.lastName;
      if (me.name) u.name = me.name;
      if (me.email) u.email = me.email;
      persistUser(u);
      return u;
    } catch (e) {
      return null;
    }
  }

  async function addSponsorRole(apiBase, token) {
    var r = await fetch(apiBase + '/auth/add-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ role: 'sponsor' }),
    });
    var data = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(data.error || 'Could not add sponsor role');
    var raw = localStorage.getItem('user');
    var u = raw ? JSON.parse(raw) : {};
    u.userRoles = data.userRoles || getRoles(u);
    if (u.userRoles.indexOf('sponsor') < 0) u.userRoles.push('sponsor');
    persistUser(u);
    return u;
  }

  global.LitoUserRoles = {
    getRoles: getRoles,
    hasSponsorRole: hasSponsorRole,
    hasCreatorRole: hasCreatorRole,
    persistUser: persistUser,
    switchToRole: switchToRole,
    syncUserFromApi: syncUserFromApi,
    addSponsorRole: addSponsorRole,
  };
})(typeof window !== 'undefined' ? window : this);
