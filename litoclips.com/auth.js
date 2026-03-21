// Authentication JavaScript

// Use window.AUTH_API_URL for API base
if (typeof window.AUTH_API_URL === 'undefined') {
  // Auto-detect production vs localhost
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  window.AUTH_API_URL = isLocalhost 
    ? 'http://localhost:37373/api/auth' 
    : `${window.location.origin}/api/auth`;
}
// Use window object to avoid const conflicts on dashboard pages
window.AUTH_API_URL_LOCAL = window.AUTH_API_URL;

// Wrap in IIFE to avoid polluting global scope
(function() {
  const API_URL = window.AUTH_API_URL_LOCAL;

// ---------- LOGIN BYPASS (demo mode): add ?bypass=1 or ?demo=1 to URL to view as logged in ----------
function isBypassMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('bypass') === '1' || params.get('demo') === '1';
}
function getBypassUserType() {
  const params = new URLSearchParams(window.location.search);
  return params.get('bypass') === 'brand' ? 'brand' : 'creator';
}
function applyLoginBypass() {
  if (!isBypassMode()) return false;
  const userType = getBypassUserType();
  const fakeUser = { name: 'Demo User', userType, email: 'demo@litoclips.com' };
  localStorage.setItem('token', 'demo-bypass-token');
  localStorage.setItem('user', JSON.stringify(fakeUser));
  localStorage.setItem('userType', userType);
  updateUI(fakeUser);
  console.log('🔓 Login bypass active — viewing as', userType);
  return true;
}
function getDashboardHref(userType) {
  var u = typeof userType === 'string' ? userType : (JSON.parse(localStorage.getItem('user') || '{}').userType || 'creator');
  if (u === 'sponsor') return 'sponsor-dashboard.html';
  // Creator and brand both get the dashboard with calendar (brand-overview → campaign-track)
  return 'brand-overview.html';
}

// Check if user is logged in on page load
window.addEventListener('DOMContentLoaded', () => {
  // Skip auth redirect logic on dashboard/auth pages
  const isDashboardPage = window.location.pathname.includes('dashboard') ||
    window.location.pathname.includes('brand-') ||
    window.location.pathname.includes('sponsor-dashboard') ||
    window.location.pathname.includes('wallet') ||
    window.location.pathname.includes('settings');
  
  if (isDashboardPage) {
    // Completely skip auth.js on dashboard pages to prevent any redirects
    console.log('🚫 auth.js skipped on dashboard page');
    return;
  }
  
  // OAuth callback: if URL has ?token=..., store it and fetch /me to check onboarding
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const urlUserType = urlParams.get('userType');
  if (token) {
    localStorage.setItem('token', token);
    fetch(`${API_URL}/me`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(user => {
        if (user) {
          localStorage.setItem('user', JSON.stringify(user));
          localStorage.setItem('userType', user.userType || urlUserType || 'creator');
          if (user.needsOnboarding) {
            window.location.replace('onboarding.html?from=google');
          } else {
            window.location.replace(getDashboardHref(user.userType));
          }
        } else {
          const userType = ['creator', 'brand', 'sponsor'].includes(urlUserType) ? urlUserType : 'creator';
          localStorage.setItem('userType', userType);
          localStorage.setItem('user', JSON.stringify({ userType }));
          window.location.replace('onboarding.html?from=google');
        }
      })
      .catch(() => {
        const userType = ['creator', 'brand', 'sponsor'].includes(urlUserType) ? urlUserType : 'creator';
        localStorage.setItem('userType', userType);
        localStorage.setItem('user', JSON.stringify({ userType }));
        window.location.replace('onboarding.html?from=google');
      });
    return;
  }
  
  // Check for OAuth errors in URL
  const error = urlParams.get('error');
  if (error) {
    showOAuthError(error);
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  
  // Login bypass: if ?bypass=1 or ?demo=1, fake logged-in state (no API call)
  if (applyLoginBypass()) {
    initAuthHandlers();
    initLogoutHandler();
    return;
  }
  
  // Only run on non-dashboard pages
  checkAuthStatus();
  initAuthHandlers();
  initLogoutHandler();
});

// Show OAuth error message
function showOAuthError(error) {
  const errorMessages = {
    'discord_no_code': 'Discord did not provide an authorization code. Please try again.',
    'discord_no_email': 'Could not get your email from Discord. Make sure your Discord account has a verified email address.',
    'discord_failed': 'Discord authentication failed. Please check the server logs for details and try again.',
    'google_no_code': 'Google did not provide an authorization code. Please try again.',
    'google_no_email': 'Could not get your email from Google. Please try again.',
    'google_failed': 'Google authentication failed. Please check the server logs for details and try again.'
  };
  
  const message = errorMessages[error] || 'Authentication failed. Please try again.';
  
  // Show error in login modal or as a toast
  const loginModal = document.getElementById('loginModal');
  const loginError = document.getElementById('loginError');
  
  if (loginModal && loginError) {
    loginError.textContent = message;
    loginError.style.display = 'block';
    openModal(loginModal);
  } else {
    // Fallback: show alert
    alert(message);
  }
}

// Initialize all auth handlers
function initAuthHandlers() {
  // Modal open/close handlers
  const loginBtn = document.getElementById('loginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const closeLoginModal = document.getElementById('closeLoginModal');
  const closeSignupModal = document.getElementById('closeSignupModal');
  const switchToSignup = document.getElementById('switchToSignup');
  const switchToLogin = document.getElementById('switchToLogin');
  const loginModal = document.getElementById('loginModal');
  const signupModal = document.getElementById('signupModal');

  if (loginBtn) {
    loginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = 'login.html';
    });
  }

  if (signupBtn) {
    signupBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = 'signup.html';
    });
  }

  if (closeLoginModal) {
    closeLoginModal.addEventListener('click', () => {
      closeModal(loginModal);
    });
  }

  if (closeSignupModal) {
    closeSignupModal.addEventListener('click', () => {
      closeModal(signupModal);
    });
  }

  if (switchToSignup) {
    switchToSignup.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal(loginModal);
      window.location.href = 'signup.html';
    });
  }

  if (switchToLogin) {
    switchToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal(signupModal);
      setTimeout(() => openModal(loginModal), 300);
    });
  }

  // Close modal when clicking outside
  if (loginModal) {
    loginModal.addEventListener('click', (e) => {
      if (e.target === loginModal) {
        closeModal(loginModal);
      }
    });
  }

  if (signupModal) {
    signupModal.addEventListener('click', (e) => {
      if (e.target === signupModal) {
        closeModal(signupModal);
      }
    });
  }

  // Initialize custom dropdown
  initCustomDropdown();

  // Use our backend OAuth URLs when using API (localhost or same origin)
  var oauthBase = (typeof window.AUTH_API_URL !== 'undefined' ? window.AUTH_API_URL : '').replace(/\/api\/auth\/?$/, '');
  if (oauthBase) {
    document.querySelectorAll('a.oauth-btn.discord').forEach(function (a) {
      a.href = oauthBase + '/auth/discord';
    });
    document.querySelectorAll('a.oauth-btn.google').forEach(function (a) {
      a.href = oauthBase + '/auth/google';
    });
  }

  // Connect creator "Join" buttons to signup modal
  // Brand buttons link directly to Google Form (handled by href)
  const signupButtons = [
    'heroSignupCreator',
    'howSignupBtn',
    'creatorSignupBtn',
    'finalCreatorBtn'
  ];

  signupButtons.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'signup.html';
      });
    }
  });

  // Form submissions
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const loginError = document.getElementById('loginError');
  const signupError = document.getElementById('signupError');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (loginError) loginError.textContent = '';

      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;

      try {
        const response = await fetch(`${API_URL}/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (response.ok) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          closeModal(loginModal);
          updateUI(data.user);
          showNotification('Login successful!', 'success');
          // Redirect to dashboard
          redirectToDashboard(data.user.userType);
        } else {
          if (loginError) loginError.textContent = data.error || 'Login failed';
        }
      } catch (error) {
        console.error('Login error:', error);
        if (loginError) loginError.textContent = 'Network error. Please try again.';
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (signupError) signupError.textContent = '';

      const name = document.getElementById('signupName').value;
      const email = document.getElementById('signupEmail').value;
      const password = document.getElementById('signupPassword').value;
      const userType = document.getElementById('userType').value;

      try {
        const response = await fetch(`${API_URL}/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name, email, password, userType }),
        });

        const data = await response.json();

        if (response.ok) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          closeModal(signupModal);
          updateUI(data.user);
          showNotification('Account created successfully!', 'success');
          // Redirect to dashboard
          redirectToDashboard(data.user.userType);
        } else {
          if (signupError) signupError.textContent = data.error || 'Signup failed';
        }
      } catch (error) {
        console.error('Signup error:', error);
        if (signupError) signupError.textContent = 'Network error. Please try again.';
      }
    });
  }
}

// Initialize logout and dashboard handlers
function initLogoutHandler() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const token = localStorage.getItem('token');
        if (token) {
          await fetch(`${API_URL}/logout`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
        }
      } catch (error) {
        console.error('Logout error:', error);
      }

      localStorage.removeItem('token');
      localStorage.removeItem('user');
      updateUI(null);
      showNotification('Logged out successfully', 'success');

      // NO REDIRECTS on dashboard pages - user must manually navigate
      // This prevents unwanted redirects when auth.js runs
      const isDashboardPage = window.location.pathname.includes('dashboard') ||
        window.location.pathname.includes('brand-') ||
        window.location.pathname.includes('wallet') ||
        window.location.pathname.includes('settings');
      
      if (isDashboardPage) {
        // NO REDIRECTS on dashboard pages - ever
        // User must manually navigate if they want to leave
        console.log('🚫 Logout on dashboard page - redirect blocked. User must manually navigate.');
        // Don't redirect - just clear storage and let user navigate manually
      }
    });
  }

  // Dashboard button handler (uses relative paths when local or bypass mode)
  const dashboardBtn = document.getElementById('dashboardBtn');
  if (dashboardBtn) {
    dashboardBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      if (user) {
        window.location.href = getDashboardHref(user.userType);
      }
    });
  }
}

// Helper functions
function openModal(modal) {
  // Handle both element and ID string
  const modalEl = typeof modal === 'string' ? document.getElementById(modal) : modal;
  if (modalEl) {
    modalEl.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(modal) {
  // Handle both element and ID string
  const modalEl = typeof modal === 'string' ? document.getElementById(modal) : modal;
  if (modalEl) {
    modalEl.classList.remove('active');
    document.body.style.overflow = '';
    // Clear form errors
    const loginError = document.getElementById('loginError');
    const signupError = document.getElementById('signupError');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');

    if (loginError) loginError.textContent = '';
    if (signupError) signupError.textContent = '';
    // Reset forms
    if (loginForm) loginForm.reset();
    if (signupForm) signupForm.reset();
  }
}

function updateUI(user) {
  const authButtons = document.getElementById('authButtons');
  const userMenu = document.getElementById('userMenu');
  const userName = document.getElementById('userName');
  const adminLink = document.getElementById('adminLink');

  if (user) {
    // Only update UI if we're on the main page (not dashboard)
    if (authButtons && userMenu) {
      authButtons.classList.add('hidden');
      userMenu.classList.remove('hidden');
      if (userName) userName.textContent = user.name;
      if (adminLink) {
        if (user.isAdmin) {
          adminLink.classList.remove('hidden');
        } else {
          adminLink.classList.add('hidden');
        }
      }
    }
  } else {
    if (authButtons && userMenu) {
      authButtons.classList.remove('hidden');
      userMenu.classList.add('hidden');
      if (adminLink) adminLink.classList.add('hidden');
    }
  }
}

async function checkAuthStatus() {
  const token = localStorage.getItem('token');
  if (!token) {
    updateUI(null);
    return;
  }

  try {
    const response = await fetch(`${API_URL}/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (response.ok) {
      const user = await response.json();
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('userType', user.userType); // Store user type for faster access
      updateUI(user);
      
      // Don't auto-redirect - let users browse the homepage while logged in
      // They can use the Dashboard button to go to their dashboard
    } else {
      // Token invalid, clear it
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('userType');
      updateUI(null);
    }
  } catch (error) {
    console.error('Auth check error:', error);
    // Don't redirect on network errors if we're on dashboard
    if (!window.location.pathname.includes('dashboard')) {
      updateUI(null);
    }
  }
}

function redirectToDashboard(userType) {
  setTimeout(() => {
    window.location.href = getDashboardHref(userType);
  }, 500);
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  // Show notification
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  // Hide and remove notification
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

// Custom Dropdown Functionality
function initCustomDropdown() {
  const dropdown = document.getElementById('userTypeDropdown');
  const selected = document.getElementById('dropdownSelected');
  const options = document.getElementById('dropdownOptions');
  const hiddenInput = document.getElementById('userType');
  const optionElements = document.querySelectorAll('.dropdown-option');

  if (!dropdown) return;

  // Toggle dropdown
  selected.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('active');
  });

  // Select option
  optionElements.forEach(option => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = option.dataset.value;
      const text = option.textContent.trim();

      // Update selected text
      selected.querySelector('span').textContent = text;

      // Update hidden input
      hiddenInput.value = value;

      // Update selected state
      optionElements.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');

      // Close dropdown
      dropdown.classList.remove('active');
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });
}

function setDropdownValue(value) {
  const dropdown = document.getElementById('userTypeDropdown');
  const selected = document.getElementById('dropdownSelected');
  const hiddenInput = document.getElementById('userType');
  const optionElements = document.querySelectorAll('.dropdown-option');

  if (!dropdown) return;

  const option = Array.from(optionElements).find(opt => opt.dataset.value === value);
  if (option) {
    const text = option.textContent.trim();
    selected.querySelector('span').textContent = text;
    hiddenInput.value = value;

    optionElements.forEach(opt => opt.classList.remove('selected'));
    option.classList.add('selected');
  }
}

// Make functions available globally
window.checkAuthStatus = checkAuthStatus;
window.initLogoutHandler = initLogoutHandler;
window.redirectToDashboard = redirectToDashboard;

})(); // End of IIFE

