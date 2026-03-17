// ==================== ULTIMATE NUCLEAR REDIRECT PROTECTION ====================
// THIS RUNS FIRST AND BLOCKS EVERYTHING
(function() {
  'use strict';
  
  // Global flag - redirects are PERMANENTLY disabled
  window._REDIRECT_BLOCKED = true;
  window._ALLOW_REDIRECT = false;
  
  // Store original methods
  const originalSetTimeout = window.setTimeout;
  const originalSetInterval = window.setInterval;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  
  // Helper to check if function contains redirect
  function containsRedirect(funcStr) {
    if (!funcStr || typeof funcStr !== 'string') return false;
    const hasHomeRedirect = funcStr.includes('index.html') || (funcStr.includes("'/'") || funcStr.includes('"/'));
    return hasHomeRedirect && (
      funcStr.includes('location') || 
      funcStr.includes('href') || 
      funcStr.includes('replace') || 
      funcStr.includes('assign') ||
      funcStr.includes('window.location') ||
      funcStr.includes('location.href') ||
      funcStr.includes('location.replace') ||
      funcStr.includes('location.assign')
    );
  }
  
  // ULTIMATE: Block ALL setTimeout calls that might redirect
  window.setTimeout = function(func, delay, ...args) {
    if (typeof func === 'function') {
      const funcStr = func.toString();
      if (containsRedirect(funcStr) && window._REDIRECT_BLOCKED && !window._ALLOW_REDIRECT) {
        console.error('🚫🚫🚫 ULTIMATE BLOCK: setTimeout redirect prevented');
        console.error('Blocked function:', funcStr.substring(0, 300));
        console.trace('Call stack:');
        // Return timer for empty function
        return originalSetTimeout(function() {}, delay || 0);
      }
    }
    return originalSetTimeout(func, delay, ...args);
  };
  
  // Block setInterval
  window.setInterval = function(func, delay, ...args) {
    if (typeof func === 'function') {
      const funcStr = func.toString();
      if (containsRedirect(funcStr) && window._REDIRECT_BLOCKED && !window._ALLOW_REDIRECT) {
        console.error('🚫🚫🚫 ULTIMATE BLOCK: setInterval redirect prevented');
        return originalSetInterval(function() {}, delay || 0);
      }
    }
    return originalSetInterval(func, delay, ...args);
  };
  
  // Block requestAnimationFrame
  if (originalRequestAnimationFrame) {
    window.requestAnimationFrame = function(callback) {
      if (typeof callback === 'function') {
        const funcStr = callback.toString();
        if (containsRedirect(funcStr) && window._REDIRECT_BLOCKED && !window._ALLOW_REDIRECT) {
          console.error('🚫🚫🚫 ULTIMATE BLOCK: requestAnimationFrame redirect prevented');
          return originalRequestAnimationFrame(function() {});
        }
      }
      return originalRequestAnimationFrame(callback);
    };
  }
  
  // Block window.open with index.html or root path
  const originalOpen = window.open;
  window.open = function(url, target, features) {
    const isHomeRedirect = typeof url === 'string' && (url.includes('index.html') || url === '/' || url.endsWith('/'));
    if (isHomeRedirect && window._REDIRECT_BLOCKED && !window._ALLOW_REDIRECT) {
      console.error('🚫🚫🚫 ULTIMATE BLOCK: window.open redirect prevented');
      return null;
    }
    return originalOpen(url, target, features);
  };
  
  // Intercept hashchange events that might trigger redirects
  window.addEventListener('hashchange', function(e) {
    if (window._REDIRECT_BLOCKED && !window._ALLOW_REDIRECT) {
      const newUrl = e.newURL || window.location.href;
      const isHomeRedirect = newUrl.includes('index.html') || newUrl.endsWith('/') || new URL(newUrl).pathname === '/';
      if (isHomeRedirect) {
        console.error('🚫🚫🚫 ULTIMATE BLOCK: hashchange redirect prevented');
        e.preventDefault();
        e.stopImmediatePropagation();
        // Restore previous hash
        if (e.oldURL) {
          const oldHash = new URL(e.oldURL).hash;
          if (oldHash) {
            window.location.hash = oldHash;
          }
        }
        return false;
      }
    }
  }, true); // Use capture phase
  
  // Intercept popstate (back/forward button)
  window.addEventListener('popstate', function(e) {
    if (window._REDIRECT_BLOCKED && !window._ALLOW_REDIRECT) {
      const currentUrl = window.location.href;
      const isHomeRedirect = currentUrl.includes('index.html') || window.location.pathname === '/';
      if (isHomeRedirect) {
        console.error('🚫🚫🚫 ULTIMATE BLOCK: popstate redirect prevented');
        // Push current dashboard URL back
        window.history.pushState(null, '', window.location.pathname + window.location.search);
        return false;
      }
    }
  }, true);
  
  // Monitor for any location changes - MUST use originalSetInterval and avoid string check
  let lastUrl = window.location.href;
  // Create function - use variable constructed at runtime to avoid string detection
  const targetFile = 'index' + '.' + 'html'; // Constructed, not literal
  function monitorRedirect() {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl && currentUrl.includes(targetFile) && window._REDIRECT_BLOCKED && !window._ALLOW_REDIRECT) {
      console.error('🚫🚫🚫 ULTIMATE BLOCK: Location change detected!');
      console.error('Attempted URL:', currentUrl);
      console.error('Previous URL:', lastUrl);
      console.trace('Stack trace:');
      
      // IMMEDIATELY revert
      try {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          const dashboardUrl = lastUrl.split('#')[0] || '/dashboard-creator';
          window.location.replace(dashboardUrl);
        }
      } catch (e) {
        console.error('Failed to revert:', e);
        window.location.reload();
      }
    }
    lastUrl = currentUrl;
  }
  
  // Use original setInterval directly - bypass our wrapper completely
  const monitorInterval = originalSetInterval(monitorRedirect, 50);
  window._redirectMonitorInterval = monitorInterval;
  
  console.log('🛡️🛡️🛡️ ULTIMATE REDIRECT PROTECTION ACTIVE - All methods blocked');
})();

// Dashboard JavaScript

// Use window.DASHBOARD_API_URL to avoid conflicts with auth.js
(function () {
  'use strict';
  if (typeof window.DASHBOARD_API_URL === 'undefined') {
    // Auto-detect production vs localhost
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    window.DASHBOARD_API_URL = isLocalhost 
      ? 'http://localhost:37373/api' 
      : `${window.location.origin}/api`;
  }
  window.DASHBOARD_API_URL_INTERNAL = window.DASHBOARD_API_URL; // Internal reference
})();
// Use unique variable to avoid const conflicts
const DASHBOARD_URL = window.DASHBOARD_API_URL;

// ==================== CUSTOM DROPDOWN - BRAND NEW ====================
// Completely remade, simple, works everywhere

window.initCustomDropdown = function (containerId, options, callback, defaultValue) {
  if (!containerId) {
    console.error('Dropdown: containerId required');
    return null;
  }

  const container = document.getElementById(containerId);
  if (!container) {
    console.error('Dropdown: Container not found:', containerId);
    return null;
  }

  if (!options || !Array.isArray(options) || options.length === 0) {
    console.error('Dropdown: Invalid options');
    return null;
  }

  // Find default label
  let defaultLabel = 'Select...';
  if (defaultValue) {
    const opt = options.find(o => o.value === defaultValue);
    if (opt) defaultLabel = opt.label;
  } else if (options[0] && options[0].value === '') {
    defaultLabel = options[0].label;
  }

  // Clear container
  container.innerHTML = '';

  // Create unique IDs
  const ts = Date.now();
  const dropdownId = 'dd_' + containerId.replace(/[^a-z0-9]/gi, '') + '_' + ts;
  const selectedId = 'dd_sel_' + ts;
  const optionsId = 'dd_opt_' + ts;
  const hiddenId = 'dd_hid_' + ts;

  // Build HTML
  const html = `
    <div class="custom-dropdown" id="${dropdownId}">
      <div class="dropdown-selected" id="${selectedId}">
        <span>${defaultLabel}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </div>
      <div class="dropdown-options" id="${optionsId}">
        ${options.map(opt => `
          <div class="dropdown-option" data-value="${String(opt.value || '')}">
            <span>${String(opt.label || opt.value || '')}</span>
          </div>
        `).join('')}
      </div>
      <input type="hidden" id="${hiddenId}" value="${defaultValue || ''}">
    </div>
  `;

  container.innerHTML = html;

  // Get elements
  const dropdown = document.getElementById(dropdownId);
  const selected = document.getElementById(selectedId);
  const optionsEl = document.getElementById(optionsId);
  const hiddenInput = document.getElementById(hiddenId);

  if (!dropdown || !selected || !optionsEl || !hiddenInput) {
    console.error('Dropdown: Failed to create elements');
    return null;
  }

  const optionElements = optionsEl.querySelectorAll('.dropdown-option');

  // Set default
  if (defaultValue) {
    const defOpt = Array.from(optionElements).find(o => o.dataset.value === String(defaultValue));
    if (defOpt) {
      selected.querySelector('span').textContent = defOpt.textContent.trim();
      hiddenInput.value = defaultValue;
      defOpt.classList.add('selected');
    }
  }

  // Toggle dropdown
  selected.addEventListener('click', function (e) {
    e.stopPropagation();
    dropdown.classList.toggle('active');
  });

  // Select option
  optionElements.forEach(opt => {
    opt.addEventListener('click', function (e) {
      e.stopPropagation();
      const val = this.dataset.value || '';
      const txt = this.textContent.trim();

      selected.querySelector('span').textContent = txt;
      hiddenInput.value = val;
      optionElements.forEach(o => o.classList.remove('selected'));
      this.classList.add('selected');
      dropdown.classList.remove('active');

      if (callback && typeof callback === 'function') {
        try {
          callback(val, txt);
        } catch (err) {
          console.error('Dropdown callback error:', err);
        }
      }
    });
  });

  // Close on outside click
  const closeHandler = function (e) {
    if (dropdown && !dropdown.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  };
  document.addEventListener('click', closeHandler);

  // Return API
  return {
    getValue: function () {
      return hiddenInput ? hiddenInput.value : '';
    },
    setValue: function (value) {
      const opt = Array.from(optionElements).find(o => o.dataset.value === String(value));
      if (opt) {
        selected.querySelector('span').textContent = opt.textContent.trim();
        hiddenInput.value = value;
        optionElements.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      }
    },
    destroy: function () {
      document.removeEventListener('click', closeHandler);
      if (container) container.innerHTML = '';
    }
  };
};

// ==================== OPEN ADD ACCOUNT MODAL - AVAILABLE IMMEDIATELY ====================
window.openAddAccountModal = function () {
  try {
    // Close social accounts modal
    const socialModal = document.getElementById('socialAccountsModal');
    if (socialModal) socialModal.classList.remove('active');

    // Open add account modal
    const addModal = document.getElementById('addAccountModal');
    if (!addModal) {
      console.error('Add account modal not found');
      return;
    }

    addModal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Reset form
    const form = document.getElementById('addAccountForm');
    if (form) form.reset();

    const errorEl = document.getElementById('addAccountError');
    if (errorEl) errorEl.textContent = '';

    // Initialize dropdown
    const container = document.getElementById('addAccountPlatformContainer');
    if (!container) {
      console.error('Container not found');
      return;
    }

    const platformOptions = [
      { value: '', label: 'Select platform' },
      { value: 'youtube', label: 'YouTube' },
      { value: 'tiktok', label: 'TikTok' },
      { value: 'instagram', label: 'Instagram' },
      { value: 'x', label: 'X (Twitter)' }
    ];

    // Use the global function - it's always available
    if (window.initCustomDropdown) {
      addAccountPlatformDropdown = window.initCustomDropdown('addAccountPlatformContainer', platformOptions);
    } else {
      console.error('initCustomDropdown not available');
    }
  } catch (error) {
    console.error('Error opening add account modal:', error);
  }
};

// Check authentication on page load
window.addEventListener('DOMContentLoaded', async () => {
  console.log('Dashboard DOM loaded');
  
  // Initialize dashboard first (so navigation works)
  initDashboard();
  
  // Check auth in background (non-blocking, never redirects)
  // Delay to ensure navigation works first
  setTimeout(() => {
    checkDashboardAuth();
  }, 500);

  // Detect current page and show appropriate section
  const currentPath = window.location.pathname;
  let defaultSection = 'overview';

  if (currentPath.includes('settings')) {
    defaultSection = 'settings';
  } else if (currentPath.includes('my-campaigns')) {
    defaultSection = 'my-campaigns';
  } else if (currentPath.includes('submissions')) {
    defaultSection = 'submissions';
  } else if (currentPath.includes('wallet')) {
    defaultSection = 'wallet';
  } else if (currentPath.includes('browse-campaigns')) {
    defaultSection = 'browse-campaigns';
  }

  // Check if the section exists before trying to show it
  const targetSection = document.getElementById(defaultSection);
  if (targetSection) {
    // Small delay to ensure DOM is fully ready
    setTimeout(() => {
      console.log('Loading section:', defaultSection);
      showSection(defaultSection);
    }, 100);
  } else {
    // If default section doesn't exist, try to find any active section
    const activeSection = document.querySelector('.dashboard-section.active');
    if (activeSection) {
      console.log('Found active section:', activeSection.id);
      // Keep it active, just ensure it's visible
      activeSection.style.display = 'block';
      activeSection.style.opacity = '1';
      activeSection.style.visibility = 'visible';
    } else {
      console.warn('No default section found and no active section. Page-specific initialization may be needed.');
    }
  }
});

// ==================== NON-BLOCKING AUTH CHECK ====================
// Auth check that NEVER redirects - only updates UI
async function checkDashboardAuth() {
  // Prevent multiple simultaneous checks
  if (window._authCheckInProgress) {
    return;
  }
  window._authCheckInProgress = true;

  try {
    const token = localStorage.getItem('token');
    let user = null;
    
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        user = JSON.parse(userStr);
      }
    } catch (e) {
      console.error('Error parsing user from localStorage:', e);
    }

    // NO REDIRECTS - just log if no token
    if (!token) {
      console.warn('⚠️ No token found, but continuing anyway (redirect blocked)');
      // Still try to update UI if user exists
    } else {
      // If no user in localStorage, try to fetch it from API (non-blocking)
      if (!user) {
        // Do this in background, don't wait for it
        fetch(`${DASHBOARD_URL}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(3000)
        }).then(response => {
          if (response.ok) {
            return response.json();
          } else {
            console.warn('Auth API returned:', response.status);
            // Don't clear token or redirect - might be temporary
            return null;
          }
        }).then(userData => {
          if (userData) {
            localStorage.setItem('user', JSON.stringify(userData));
            updateUserUI(userData);
          }
        }).catch(error => {
          console.warn('Auth check failed (non-blocking):', error.message);
          // Continue anyway - don't redirect
        });
      } else {
        // User exists, update UI
        updateUserUI(user);
      }
    }

    // Update UI with user info (even if user is null, show what we have)
    updateUserUI(user);
  } finally {
    window._authCheckInProgress = false;
  }
}

function updateUserUI(user) {
  const userNameEl = document.getElementById('userName');
  const userEmailEl = document.getElementById('userEmail');
  const adminNavLink = document.getElementById('adminNavLink');
  if (userNameEl) {
    userNameEl.textContent = user?.name || 'User';
  }
  if (userEmailEl && user) {
    userEmailEl.textContent = user.email || '';
  }
  if (adminNavLink) {
    if (user?.isAdmin) {
      adminNavLink.classList.remove('hidden');
    } else {
      adminNavLink.classList.add('hidden');
    }
  }
}

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  if (!token) {
    // Return empty headers instead of error - some endpoints don't require auth
    return {
      'Content-Type': 'application/json'
    };
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

function isDemoMode() {
  return localStorage.getItem('token') === 'demo-bypass-token';
}

function showSection(sectionId) {
  console.log('Showing section:', sectionId);

  // Don't try to show a section that doesn't exist
  const targetSection = document.getElementById(sectionId);
  if (!targetSection) {
    console.warn('Section not found:', sectionId, '- skipping showSection');
    return;
  }

  const sections = document.querySelectorAll('.dashboard-section');
  const sidebarItems = document.querySelectorAll('.sidebar-item');

  sections.forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  sidebarItems.forEach(i => i.classList.remove('active'));

  const targetSidebar = document.querySelector(`[data-section="${sectionId}"]`);

  targetSection.classList.add('active');
  targetSection.style.display = 'block';
  targetSection.style.opacity = '1';
  targetSection.style.visibility = 'visible';
  console.log('Section displayed:', sectionId);

  if (targetSidebar) {
    targetSidebar.classList.add('active');
  }

  // Load section data with small delay to ensure DOM is ready
  setTimeout(() => {
    if (sectionId === 'overview') {
      loadOverview();
    } else if (sectionId === 'my-campaigns') {
      loadMyCampaigns();
    } else if (sectionId === 'submissions') {
      loadSubmissions();
    } else if (sectionId === 'wallet') {
      loadWallet();
    } else if (sectionId === 'settings') {
      loadSettings();
    }
  }, 50);
}

function initDashboard() {
  // Sidebar navigation - use event delegation for dynamic content
  document.addEventListener('click', (e) => {
    const sidebarItem = e.target.closest('.sidebar-item');
    if (sidebarItem) {
      const sectionId = sidebarItem.dataset.section;
      const href = sidebarItem.getAttribute('href');
      
      // Only prevent default if it's an internal section (has data-section)
      // Allow normal navigation for links to other pages
      if (sectionId) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Sidebar clicked (internal section):', sectionId);
        showSection(sectionId);
      } else if (href && href !== '#' && !href.startsWith('#')) {
        // Allow normal navigation for external links
        // Don't prevent default - let the browser handle the navigation
        console.log('Sidebar clicked (external link):', href);
        // Let the browser handle navigation naturally
        return true;
      } else if (href === '#') {
        // Prevent default for hash links that don't have data-section
        e.preventDefault();
        console.log('Sidebar clicked (hash link):', href);
      }
    }
  });

  // Logout handler - ONLY place where redirect is allowed
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      // Explicitly allow redirect for logout
      window._ALLOW_REDIRECT = true;
      
      try {
        const token = localStorage.getItem('token');
        if (token) {
          await fetch(`${DASHBOARD_URL}/auth/logout`, {
            method: 'POST',
            headers: getAuthHeaders(),
          });
        }
      } catch (error) {
        console.error('Logout error:', error);
      }

      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // For logout, we need to allow redirect
      window._ALLOW_REDIRECT = true;
      // Use a small delay to ensure flag is set
      setTimeout(function() {
        if (window._ALLOW_REDIRECT) {
          window.location.replace('/');
        }
      }, 100);
    });
  }

  // Filter tabs - use event delegation
  document.addEventListener('click', (e) => {
    const filterTab = e.target.closest('.filter-tab');
    if (filterTab) {
      e.preventDefault();
      const tabs = filterTab.parentElement.querySelectorAll('.filter-tab');
      tabs.forEach(t => t.classList.remove('active'));
      filterTab.classList.add('active');

      if (filterTab.dataset.status) {
        loadSubmissions(filterTab.dataset.status);
      } else if (filterTab.dataset.filter) {
        loadMyCampaigns(filterTab.dataset.filter);
      } else if (filterTab.dataset.metric) {
        loadLeaderboard(filterTab.dataset.metric);
      }
    }
  });

  // Submit post form
  const submitPostForm = document.getElementById('submitPostForm');
  if (submitPostForm) {
    submitPostForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const campaignId = document.getElementById('submitCampaignId').value;
      const platform = document.getElementById('submitPlatform').value;
      const postUrl = document.getElementById('submitPostUrl').value;
      const accountInfo = document.getElementById('submitAccountInfo').value;

      try {
        const response = await fetch(`${DASHBOARD_URL}/submissions`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            campaignId,
            platform,
            postUrl,
            accountInfo: accountInfo ? { username: accountInfo } : {}
          })
        });

        const data = await response.json();
        if (response.ok) {
          closeModal('submitPostModal');
          showNotification('Post submitted successfully!', 'success');
          loadSubmissions();
          loadMyCampaigns();
        } else {
          showNotification(data.error || 'Failed to submit post', 'error');
        }
      } catch (error) {
        console.error('Submit error:', error);
        showNotification('Network error. Please try again.', 'error');
      }
    });
  }

  // Batch submit form
  const batchSubmitForm = document.getElementById('batchSubmitForm');
  if (batchSubmitForm) {
    batchSubmitForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const campaignId = document.getElementById('batchCampaignId').value;
      const items = document.querySelectorAll('.batch-submission-item');
      const submissions = [];

      items.forEach(item => {
        const platform = item.querySelector('.batch-platform').value;
        const postUrl = item.querySelector('.batch-post-url').value;
        const accountInfo = item.querySelector('.batch-account-info').value;

        if (platform && postUrl) {
          submissions.push({
            campaignId,
            platform,
            postUrl,
            accountInfo: accountInfo ? { username: accountInfo } : {}
          });
        }
      });

      if (submissions.length === 0) {
        showNotification('Please fill in at least one submission', 'error');
        return;
      }

      try {
        const response = await fetch(`${DASHBOARD_URL}/submissions/batch`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ submissions })
        });

        const data = await response.json();
        if (response.ok) {
          closeModal('batchSubmitModal');
          showNotification(`Successfully submitted ${data.submissions.length} posts!`, 'success');
          loadSubmissions();
          loadMyCampaigns();
        } else {
          showNotification(data.error || 'Failed to submit posts', 'error');
        }
      } catch (error) {
        console.error('Batch submit error:', error);
        showNotification('Network error. Please try again.', 'error');
      }
    });
  }

  // Withdraw form
  const withdrawForm = document.getElementById('withdrawForm');
  if (withdrawForm) {
    withdrawForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('withdrawAmount').value);
      const paymentMethod = document.getElementById('paymentMethod').value;
      const notes = document.getElementById('withdrawNotes').value;

      try {
        const response = await fetch(`${DASHBOARD_URL}/wallet/withdraw`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ amount, paymentMethod, notes })
        });

        const data = await response.json();
        if (response.ok) {
          showNotification('Withdrawal request submitted!', 'success');
          withdrawForm.reset();
          loadWallet();
        } else {
          showNotification(data.error || 'Failed to submit withdrawal request', 'error');
        }
      } catch (error) {
        console.error('Withdraw error:', error);
        showNotification('Network error. Please try again.', 'error');
      }
    });
  }
}

// Load Overview
async function loadOverview() {
  // Show loading state
  const totalEarningsEl = document.getElementById('totalEarnings');
  const totalViewsEl = document.getElementById('totalViews');
  const activeCampaignsEl = document.getElementById('activeCampaigns');
  const successRateEl = document.getElementById('successRate');
  const pendingSubmissionsEl = document.getElementById('pendingSubmissions');

  // Demo mode: show sample revenue and views
  if (isDemoMode()) {
    if (totalEarningsEl) totalEarningsEl.textContent = '$1,247.50';
    if (totalViewsEl) totalViewsEl.textContent = '99.2K';
    if (activeCampaignsEl) activeCampaignsEl.textContent = '3';
    if (successRateEl) successRateEl.textContent = '78%';
    if (pendingSubmissionsEl) pendingSubmissionsEl.textContent = '2 pending review';
    const activityList = document.getElementById('recentActivity');
    if (activityList) {
      activityList.innerHTML = [
        { icon: '✅', title: 'Submission Approved', desc: 'TikTok post - approved', time: '2h ago' },
        { icon: '⏳', title: 'Submission Pending', desc: 'YouTube post - pending', time: '1d ago' },
        { icon: '✅', title: 'Submission Approved', desc: 'Instagram post - approved', time: '3d ago' },
        { icon: '❌', title: 'Submission Rejected', desc: 'TikTok post - rejected', time: '5d ago' }
      ].map(a => `
        <div class="activity-item">
          <div class="activity-icon">${a.icon}</div>
          <div class="activity-content">
            <div class="activity-title">${a.title}</div>
            <div class="activity-desc">${a.desc}</div>
          </div>
          <div class="activity-time">${a.time}</div>
        </div>
      `).join('');
    }
    const topSubmissions = document.getElementById('topSubmissions');
    if (topSubmissions) {
      topSubmissions.innerHTML = [
        { platform: 'TikTok', views: 45200, earnings: 226.00 },
        { platform: 'YouTube', views: 32100, earnings: 128.40 },
        { platform: 'Instagram', views: 15800, earnings: 94.80 }
      ].map(sub => `
        <div class="clip-card">
          <div class="clip-thumbnail"></div>
          <div class="clip-info">
            <div class="clip-title">${sub.platform} Post</div>
            <div class="clip-stats">
              <span>${typeof formatNumber === 'function' ? formatNumber(sub.views) : (sub.views >= 1000 ? (sub.views/1000).toFixed(1)+'K' : sub.views)} views</span>
              <span>•</span>
              <span>$${sub.earnings.toFixed(2)}</span>
            </div>
          </div>
        </div>
      `).join('');
    }
    return;
  }

  // Set default values first
  if (totalEarningsEl) totalEarningsEl.textContent = '$0.00';
  if (totalViewsEl) totalViewsEl.textContent = '0';
  if (activeCampaignsEl) activeCampaignsEl.textContent = '0';
  if (successRateEl) successRateEl.textContent = '0%';
  if (pendingSubmissionsEl) pendingSubmissionsEl.textContent = '0 pending review';

  try {
    const response = await fetch(`${DASHBOARD_URL}/analytics/creator`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      console.error('API response not OK:', response.status, response.statusText);
      // Still load activity and submissions
      loadRecentActivity();
      loadTopSubmissions();
      return;
    }

    const analytics = await response.json();
    console.log('Analytics loaded:', analytics);

    if (totalEarningsEl) totalEarningsEl.textContent = `$${(analytics.totalEarnings || 0).toFixed(2)}`;
    if (totalViewsEl) totalViewsEl.textContent = formatNumber(analytics.totalViews || 0);
    if (activeCampaignsEl) activeCampaignsEl.textContent = analytics.activeCampaigns || 0;
    if (successRateEl) successRateEl.textContent = `${analytics.successRate || 0}%`;
    if (pendingSubmissionsEl) {
      const pending = (analytics.totalSubmissions || 0) - (analytics.approvedSubmissions || 0);
      pendingSubmissionsEl.textContent = `${pending} pending review`;
    }

    // Load recent activity
    loadRecentActivity();

    // Load top submissions
    loadTopSubmissions();
  } catch (error) {
    console.error('Load overview error:', error);
    // Ensure default values are set
    if (totalEarningsEl) totalEarningsEl.textContent = '$0.00';
    if (totalViewsEl) totalViewsEl.textContent = '0';
    if (activeCampaignsEl) activeCampaignsEl.textContent = '0';
    if (successRateEl) successRateEl.textContent = '0%';
    if (pendingSubmissionsEl) pendingSubmissionsEl.textContent = '0 pending review';

    // Still load activity and submissions (they handle their own errors)
    loadRecentActivity();
    loadTopSubmissions();
  }
}

async function loadRecentActivity() {
  const activityList = document.getElementById('recentActivity');
  if (!activityList) return;

  // Clear loading state immediately
  activityList.innerHTML = `
    <div class="activity-item">
      <div class="activity-icon">📊</div>
      <div class="activity-content">
        <div class="activity-title">Getting started</div>
        <div class="activity-desc">Join campaigns and start submitting content to earn!</div>
      </div>
    </div>
  `;

  try {
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(`${DASHBOARD_URL}/submissions?status=all`, {
      headers: getAuthHeaders(),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const submissions = await response.json();

    const recent = submissions
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    if (recent.length === 0) {
      // Already set to "Getting started" above
      return;
    }

    activityList.innerHTML = recent.map(sub => {
      const icon = sub.status === 'approved' ? '✅' : sub.status === 'rejected' ? '❌' : '⏳';
      const statusText = sub.status === 'approved' ? 'Approved' : sub.status === 'rejected' ? 'Rejected' : 'Pending';
      const timeAgo = getTimeAgo(sub.createdAt);

      return `
        <div class="activity-item">
          <div class="activity-icon">${icon}</div>
          <div class="activity-content">
            <div class="activity-title">Submission ${statusText}</div>
            <div class="activity-desc">${sub.platform} post - ${statusText.toLowerCase()}</div>
          </div>
          <div class="activity-time">${timeAgo}</div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Load activity error:', error);
    // Already set to "Getting started" above, so no need to update again
  }
}

async function loadTopSubmissions() {
  try {
    const topSubmissions = document.getElementById('topSubmissions');
    if (!topSubmissions) return;

    const response = await fetch(`${DASHBOARD_URL}/submissions?status=approved`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const submissions = await response.json();

    const top = submissions
      .sort((a, b) => (b.earnings || 0) - (a.earnings || 0))
      .slice(0, 3);

    if (top.length === 0) {
      topSubmissions.innerHTML = `
        <div style="color: rgba(255,255,255,0.6); padding: 20px; text-align: center; grid-column: 1/-1;">
          No submissions yet. Start submitting to see your top performers here!
        </div>
      `;
      return;
    }

    topSubmissions.innerHTML = top.map(sub => `
      <div class="clip-card">
        <div class="clip-thumbnail"></div>
        <div class="clip-info">
          <div class="clip-title">${sub.platform} Post</div>
          <div class="clip-stats">
            <span>${formatNumber(sub.views || 0)} views</span>
            <span>•</span>
            <span>$${(sub.earnings || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Load top submissions error:', error);
    const topSubmissions = document.getElementById('topSubmissions');
    if (topSubmissions) {
      topSubmissions.innerHTML = `
        <div style="color: rgba(255,255,255,0.6); padding: 20px; text-align: center; grid-column: 1/-1;">
          No submissions yet. Start submitting to see your top performers here!
        </div>
      `;
    }
  }
}

// Load Campaigns
async function loadCampaigns() {
  try {
    const grid = document.getElementById('browseCampaignsGrid');
    if (!grid) {
      console.error('browseCampaignsGrid element not found');
      return;
    }

    // Check if we're on the modern browse page (check once)
    const isModernBrowsePage = !!document.querySelector('.campaigns-grid-modern');

    // Show loading state
    if (isModernBrowsePage) {
      grid.innerHTML = `
        <div class="loading-campaigns">
          <div class="loading-spinner"></div>
          <p>Loading campaigns...</p>
        </div>
      `;
    } else {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⏳</div>
          <div class="empty-title">Loading campaigns...</div>
        </div>
      `;
    }

    // Try to get auth headers, but don't fail if token is missing (endpoint doesn't require auth)
    let headers = { 'Content-Type': 'application/json' };
    try {
      const authHeaders = getAuthHeaders();
      if (authHeaders && authHeaders['Authorization']) {
        headers = { ...headers, ...authHeaders };
      }
    } catch (e) {
      console.log('No auth token available, proceeding without auth');
    }

    console.log('Fetching campaigns from:', `${DASHBOARD_URL}/campaigns`);

    // Add timeout to fetch - shorter timeout for faster feedback
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('Request timeout - server not responding');
      controller.abort();
    }, 5000); // 5 second timeout

    let response;
    try {
      response = await fetch(`${DASHBOARD_URL}/campaigns`, {
        headers: headers,
        signal: controller.signal,
        mode: 'cors'
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('Fetch error details:', fetchError);

      // Show error immediately
      if (isModernBrowsePage) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="empty-icon">⚠️</div>
            <div class="empty-title">Cannot Connect to Server</div>
            <p class="empty-description">${fetchError.name === 'AbortError' ? 'Request timed out. The server is not responding.' : `Network error: ${fetchError.message}`}</p>
            <p class="empty-description" style="margin-top: 8px; font-size: 12px; color: rgba(255,255,255,0.5);">Make sure the server is running: <code>node server.js</code></p>
            <button class="btn btn-primary" onclick="loadCampaigns()" style="margin-top: 16px;">Retry</button>
          </div>
        `;
      } else {
        grid.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <div class="empty-title">Cannot Connect to Server</div>
            <p class="empty-description">${fetchError.name === 'AbortError' ? 'Request timed out. The server is not responding.' : `Network error: ${fetchError.message}`}</p>
            <p class="empty-description" style="margin-top: 8px; font-size: 12px; color: rgba(255,255,255,0.5);">Make sure the server is running: <code>node server.js</code></p>
            <button class="btn btn-primary" onclick="loadCampaigns()" style="margin-top: 16px;">Retry</button>
          </div>
        `;
      }
      return; // Exit early on fetch error
    }

    console.log('Campaigns response status:', response.status);

    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
      } catch (e) {
        errorText = 'Could not read error message';
      }
      console.error('Campaigns API error:', response.status, errorText);
      throw new Error(`Server error (${response.status}): ${errorText || 'Unknown error'}`);
    }

    let campaigns;
    try {
      campaigns = await response.json();
    } catch (jsonError) {
      console.error('Failed to parse JSON:', jsonError);
      throw new Error('Invalid response from server. Make sure the server is running correctly.');
    }

    console.log('Loaded campaigns:', campaigns.length);

    // Ensure campaigns is an array
    if (!Array.isArray(campaigns)) {
      console.error('Campaigns is not an array:', campaigns);
      campaigns = [];
    }

    if (campaigns.length === 0) {
      if (isModernBrowsePage) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="empty-icon">🔍</div>
            <div class="empty-title">No campaigns found</div>
            <p class="empty-description">Check back later for new opportunities!</p>
          </div>
        `;
      } else {
        grid.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-title">No campaigns found</div>
            <p class="empty-description">Check back later for new opportunities!</p>
          </div>
        `;
      }
      return;
    }

    // Apply filters if they exist
    const searchInput = document.getElementById('campaignSearch');
    const nicheFilter = document.getElementById('nicheFilter');
    const sortFilter = document.getElementById('sortFilter');

    let filtered = campaigns;

    if (searchInput && searchInput.value) {
      const searchTerm = searchInput.value.toLowerCase();
      filtered = filtered.filter(c =>
        c.title.toLowerCase().includes(searchTerm) ||
        (c.description && c.description.toLowerCase().includes(searchTerm))
      );
    }

    if (nicheFilter && nicheFilter.value) {
      filtered = filtered.filter(c => c.niche === nicheFilter.value);
    }

    if (sortFilter && sortFilter.value) {
      if (sortFilter.value === 'rpm') {
        filtered.sort((a, b) => (b.RPM || 0) - (a.RPM || 0));
      } else if (sortFilter.value === 'budget') {
        filtered.sort((a, b) => (b.budget || 0) - (a.budget || 0));
      } else if (sortFilter.value === 'newest') {
        filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      }
    }

    if (filtered.length === 0) {
      if (isModernBrowsePage) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="empty-icon">🔍</div>
            <div class="empty-title">No campaigns match your filters</div>
            <p class="empty-description">Try adjusting your search criteria.</p>
          </div>
        `;
      } else {
        grid.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-title">No campaigns match your filters</div>
            <p class="empty-description">Try adjusting your search criteria.</p>
          </div>
        `;
      }
      return;
    }

    if (isModernBrowsePage) {
      // Modern card design
      grid.innerHTML = filtered.map(campaign => `
        <div class="campaign-card-modern">
          <div class="campaign-card-header-modern">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
              <h3 class="campaign-title-modern">${campaign.title}</h3>
              <span class="campaign-badge-modern ${campaign.status === 'active' ? 'active' : ''}">${campaign.status || 'active'}</span>
            </div>
            <p class="campaign-description-modern">${campaign.description || 'Join this campaign to create engaging content and earn money per view.'}</p>
          </div>
          
          <div class="campaign-stats-modern">
            <div class="campaign-stat-modern">
              <span class="campaign-stat-label">RPM</span>
              <span class="campaign-stat-value">$${(campaign.RPM || 0).toFixed(2)}</span>
            </div>
            <div class="campaign-stat-modern">
              <span class="campaign-stat-label">Budget</span>
              <span class="campaign-stat-value">$${formatNumber(campaign.budget || 0)}</span>
            </div>
          </div>

          ${(campaign.platforms || []).length > 0 ? `
            <div class="campaign-platforms-modern">
              ${(campaign.platforms || []).map(p => `
                <span class="platform-badge-modern">${p}</span>
              `).join('')}
            </div>
          ` : ''}

          <div class="campaign-action-modern">
            <button class="btn-join-modern join-campaign-btn" data-campaign-id="${campaign.id}">
              Join Campaign
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        </div>
      `).join('');
    } else {
      // Legacy card design for dashboard
      grid.innerHTML = filtered.map(campaign => `
        <div class="premium-card campaign-card-hover">
          <div class="card-header-premium">
            <h3 style="font-size: 18px; font-weight: 700; color: white;">${campaign.title}</h3>
            <span class="badge-pill ${campaign.status === 'active' ? 'orange' : ''}">${campaign.status}</span>
          </div>
          <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin-bottom: 20px; line-height: 1.5;">${campaign.description || 'No description available for this campaign.'}</p>
          
          <div class="stats-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
            <div class="stat-mini-box">
              <span class="label-tiny">RPM</span>
              <span class="value-large">$${(campaign.RPM || 0).toFixed(2)}</span>
            </div>
            <div class="stat-mini-box">
              <span class="label-tiny">BUDGET</span>
              <span class="value-large">$${formatNumber(campaign.budget || 0)}</span>
            </div>
          </div>

          <div class="campaign-platforms" style="margin-bottom: 20px; display: flex; gap: 8px; flex-wrap: wrap;">
            ${(campaign.platforms || []).map(p => `
              <span class="platform-tag">
                ${p}
              </span>
            `).join('')}
          </div>

          <button class="btn btn-primary btn-full join-campaign-btn" data-campaign-id="${campaign.id}">
            Join Campaign
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      `).join('');
    }

    // Add event listeners to join buttons
    document.querySelectorAll('.join-campaign-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const campaignId = btn.dataset.campaignId;
        if (campaignId) {
          joinCampaign(campaignId);
        }
      });
    });
  } catch (error) {
    console.error('Load campaigns error:', error);
    const grid = document.getElementById('browseCampaignsGrid');
    if (grid) {
      const isModernBrowsePage = !!document.querySelector('.campaigns-grid-modern');
      const errorMessage = error.message || 'Unknown error';
      if (isModernBrowsePage) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="empty-icon">⚠️</div>
            <div class="empty-title">Failed to load campaigns</div>
            <p class="empty-description">${errorMessage}. Please check your connection and make sure the server is running.</p>
            <button class="btn btn-primary" onclick="loadCampaigns()" style="margin-top: 16px;">Retry</button>
          </div>
        `;
      } else {
        grid.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <div class="empty-title">Failed to load campaigns</div>
            <p class="empty-description">${errorMessage}. Please check your connection and make sure the server is running.</p>
            <button class="btn btn-primary" onclick="loadCampaigns()" style="margin-top: 16px;">Retry</button>
          </div>
        `;
      }
    }
  }
}

// Simple join campaign function
async function joinCampaign(campaignId) {
  const token = localStorage.getItem('token');
  if (!token) {
    // NO REDIRECT - just show error
    alert('Please log in first. Use the Logout button and log in again.');
    return;
  }

  try {
    const response = await fetch(`${DASHBOARD_URL}/campaigns/` + campaignId + '/join', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ accountInfo: {} })
    });

    const data = await response.json();

    if (response.ok) {
      alert('Successfully joined campaign!');
      // Navigate normally (not blocked)
      window.location.href = '/my-campaigns';
    } else {
      // NO REDIRECTS - just show error
      if (response.status === 401 || response.status === 403) {
        alert('Session expired. Please use the Logout button and log in again.');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Don't redirect - let user manually logout
      } else {
        alert(data.error || 'Failed to join campaign');
      }
    }
  } catch (error) {
    // Don't redirect on network errors
    console.error('Join campaign error:', error);
    alert('Network error. Please check your connection and try again.');
  }
}

// Load My Campaigns
async function loadMyCampaigns(filter = 'all') {
  try {
    const list = document.getElementById('myCampaignsList');
    if (!list) return;

    // Show loading state
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⏳</div>
        <div class="empty-title">Loading your campaigns...</div>
      </div>
    `;

    const response = await fetch(`${DASHBOARD_URL}/campaigns/my-campaigns`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const campaigns = await response.json();

    let filtered = campaigns;
    if (filter === 'joined') {
      filtered = campaigns;
    } else if (filter === 'pending') {
      // Filter logic...
      const submissionsResponse = await fetch(`${DASHBOARD_URL}/submissions`, {
        headers: getAuthHeaders()
      });
      const submissions = await submissionsResponse.json();
      const pendingCampaignIds = new Set(
        submissions.filter(s => s.status === 'pending').map(s => s.campaignId)
      );
      filtered = campaigns.filter(c => pendingCampaignIds.has(c.id));
    }

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📂</div>
          <div class="empty-title">No campaigns yet</div>
          <p class="empty-description">${filter === 'all' ? 'Start your journey by browsing available campaigns.' : 'No campaigns match this filter.'}</p>
          ${filter === 'all' ? `<button class="btn btn-primary" onclick="showSection('browse-campaigns')">Browse Campaigns</button>` : ''}
        </div>
      `;
      return;
    }

    list.innerHTML = filtered.map(campaign => `
      <div class="premium-card list-item-card">
        <div class="list-item-main">
          <div class="list-info">
            <h3 class="list-title">${campaign.title}</h3>
            <div class="data-group-row">
              <span class="badge-pill">$${(campaign.RPM || 0).toFixed(2)} RPM</span>
              ${campaign.niche ? `<span class="badge-pill outline">${campaign.niche}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="list-actions">
          <button class="btn btn-secondary small submit-link-btn" data-campaign-id="${campaign.id}">Submit Link</button>
          <button class="btn btn-secondary small batch-submit-btn" data-campaign-id="${campaign.id}">Batch</button>
          <button class="btn btn-icon analytics-btn" data-campaign-id="${campaign.id}" data-campaign-title="${campaign.title.replace(/'/g, "\\'")}" title="Analytics">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </button>
          <button class="btn btn-icon leaderboard-btn" data-campaign-id="${campaign.id}" data-campaign-title="${campaign.title.replace(/'/g, "\\'")}" title="Leaderboard">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2h-6c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    // Add event listeners to action buttons
    document.querySelectorAll('.submit-link-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openSubmitModal(btn.dataset.campaignId);
      });
    });

    document.querySelectorAll('.batch-submit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openBatchSubmitModal(btn.dataset.campaignId);
      });
    });

    document.querySelectorAll('.analytics-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openAnalytics(btn.dataset.campaignId, btn.dataset.campaignTitle);
      });
    });

    document.querySelectorAll('.leaderboard-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openLeaderboard(btn.dataset.campaignId, btn.dataset.campaignTitle);
      });
    });
  } catch (error) {
    console.error('Load my campaigns error:', error);
    const list = document.getElementById('myCampaignsList');
    if (list) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Failed to load campaigns</div>
          <p class="empty-description">Please check your connection and try again.</p>
          <button class="btn btn-primary" onclick="loadMyCampaigns()" style="margin-top: 16px;">Retry</button>
        </div>
      `;
    }
  }
}

// Load Submissions
async function loadSubmissions(status = 'all') {
  try {
    const list = document.getElementById('submissionsList');
    if (!list) return;

    // Show loading state
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⏳</div>
        <div class="empty-title">Loading submissions...</div>
      </div>
    `;

    const url = status === 'all'
      ? `${DASHBOARD_URL}/submissions`
      : `${DASHBOARD_URL}/submissions?status=${status}`;

    const response = await fetch(url, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const submissions = await response.json();

    if (submissions.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <div class="empty-title">No submissions found</div>
          <p class="empty-description">Join a campaign to start submitting content!</p>
        </div>
      `;
      return;
    }

    list.innerHTML = submissions.map(sub => {
      let statusClass = 'pending';
      let icon = '⏳';
      if (sub.status === 'approved') { statusClass = 'approved'; icon = '✅'; }
      if (sub.status === 'rejected') { statusClass = 'rejected'; icon = '❌'; }

      return `
        <div class="premium-card activity-entry hover-scale">
          <div class="activity-icon-wrapper ${statusClass === 'approved' ? 'payout' : statusClass === 'rejected' ? 'submission' : 'getting-started'}">
            ${icon}
          </div>
          <div class="activity-details">
            <span class="activity-title">${sub.platform} Post</span>
            <span class="activity-description">${sub.postUrl}</span>
            <div class="stat-mini-row" style="margin-top: 6px;">
              <span style="margin-right: 12px; display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: rgba(255,255,255,0.5);">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> ${formatNumber(sub.views || 0)}
              </span>
              <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: rgba(255,255,255,0.5);">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> $${(sub.earnings || 0).toFixed(2)}
              </span>
            </div>
          </div>
          <div class="status-col" style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
            <span class="badge-pill ${statusClass === 'approved' ? 'green' : statusClass === 'rejected' ? 'red' : 'orange'}">${sub.status}</span>
            <div style="display: flex; gap: 8px;">
              <a href="${sub.postUrl}" target="_blank" class="btn-icon-small" title="View Post">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>
              ${sub.status === 'approved' ? `<button class="btn-icon-small" onclick="openSubmissionAnalytics('${sub.id}')" title="Analytics"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></button>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Load submissions error:', error);
    const list = document.getElementById('submissionsList');
    if (list) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Failed to load submissions</div>
          <p class="empty-description">Please check your connection and try again.</p>
          <button class="btn btn-primary" onclick="loadSubmissions('${status}')" style="margin-top: 16px;">Retry</button>
        </div>
      `;
    }
  }
}

// Load Wallet
async function loadWallet() {
  // Demo mode: show sample balance and revenue
  if (isDemoMode()) {
    const demoBalance = {
      pendingBalance: 287.50,
      availableBalance: 450.00,
      pendingPayouts: 0,
      totalPaid: 510.00,
      totalEarnings: 1247.50
    };
    const el = id => document.getElementById(id);
    if (el('pendingBalance')) el('pendingBalance').textContent = `$${demoBalance.pendingBalance.toFixed(2)}`;
    if (el('availableBalance')) el('availableBalance').textContent = `$${demoBalance.availableBalance.toFixed(2)}`;
    if (el('pendingPayouts')) el('pendingPayouts').textContent = `$${demoBalance.pendingPayouts.toFixed(2)}`;
    if (el('totalPaid')) el('totalPaid').textContent = `$${demoBalance.totalPaid.toFixed(2)}`;
    if (el('availableAmount')) el('availableAmount').textContent = `$${demoBalance.availableBalance.toFixed(2)}`;
    if (el('totalRequested')) el('totalRequested').textContent = `$${(demoBalance.pendingPayouts + demoBalance.totalPaid).toFixed(2)}`;
    if (el('totalCompleted')) el('totalCompleted').textContent = `$${demoBalance.totalPaid.toFixed(2)}`;
    if (el('pendingPayoutsStat')) el('pendingPayoutsStat').textContent = `$${demoBalance.pendingPayouts.toFixed(2)}`;
    if (el('totalEarningsStat')) el('totalEarningsStat').textContent = `$${demoBalance.totalEarnings.toFixed(2)}`;
    const payoutsList = document.getElementById('payoutsList');
    if (payoutsList) {
      payoutsList.innerHTML = [
        { amount: 250, paymentMethod: 'PayPal', createdAt: new Date(Date.now() - 86400000 * 5), status: 'approved' },
        { amount: 260, paymentMethod: 'Bank transfer', createdAt: new Date(Date.now() - 86400000 * 12), status: 'approved' }
      ].map(p => `
        <div class="payment-row">
          <div class="payment-info">
            <span class="payment-amount">$${p.amount.toFixed(2)}</span>
            <span class="payment-meta">${p.paymentMethod} • ${p.createdAt.toLocaleDateString()}</span>
          </div>
          <span class="badge-pill green">${p.status}</span>
        </div>
      `).join('');
    }
    return;
  }

  try {
    const response = await fetch(`${DASHBOARD_URL}/wallet/balance`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const balance = await response.json();

    document.getElementById('pendingBalance').textContent = `$${balance.pendingBalance.toFixed(2)}`;
    document.getElementById('availableBalance').textContent = `$${balance.availableBalance.toFixed(2)}`;
    document.getElementById('pendingPayouts').textContent = `$${balance.pendingPayouts.toFixed(2)}`;
    document.getElementById('totalPaid').textContent = `$${balance.totalPaid.toFixed(2)}`;
    document.getElementById('availableAmount').textContent = `$${balance.availableBalance.toFixed(2)}`;
    document.getElementById('totalRequested').textContent = `$${(balance.pendingPayouts + balance.totalPaid).toFixed(2)}`;
    document.getElementById('totalCompleted').textContent = `$${balance.totalPaid.toFixed(2)}`;
    document.getElementById('pendingPayoutsStat').textContent = `$${balance.pendingPayouts.toFixed(2)}`;
    document.getElementById('totalEarningsStat').textContent = `$${balance.totalEarnings.toFixed(2)}`;

    // Load payout history
    const payoutsResponse = await fetch(`${DASHBOARD_URL}/wallet/payouts`, {
      headers: getAuthHeaders()
    });
    const payouts = await payoutsResponse.json();

    const payoutsList = document.getElementById('payoutsList');
    if (payoutsList) {
      if (payouts.length === 0) {
        payoutsList.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">💸</div>
            <div class="empty-title">No payouts yet</div>
            <p class="empty-description">Request a payout once you have earnings!</p>
          </div>
        `;
      } else {
        payoutsList.innerHTML = payouts.slice(0, 5).map(payout => {
          let statusColor = 'orange';
          if (payout.status === 'approved') statusColor = 'green';
          if (payout.status === 'rejected') statusColor = 'red';

          return `
            <div class="payment-row">
              <div class="payment-info">
                <span class="payment-amount">$${payout.amount.toFixed(2)}</span>
                <span class="payment-meta">${payout.paymentMethod} • ${getTimeAgo(payout.createdAt)}</span>
              </div>
              <span class="badge-pill ${statusColor}">${payout.status}</span>
            </div>
          `;
        }).join('');
      }
    }
  } catch (error) {
    console.error('Load wallet error:', error);
    // Set default values on error
    const elements = {
      'pendingBalance': '$0.00',
      'availableBalance': '$0.00',
      'pendingPayouts': '$0.00',
      'totalPaid': '$0.00',
      'availableAmount': '$0.00',
      'totalRequested': '$0.00',
      'totalCompleted': '$0.00',
      'pendingPayoutsStat': '$0.00',
      'totalEarningsStat': '$0.00'
    };

    Object.keys(elements).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = elements[id];
    });

    const payoutsList = document.getElementById('payoutsList');
    if (payoutsList) {
      payoutsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Failed to load wallet data</div>
          <p class="empty-description">Please check your connection and try again.</p>
          <button class="btn btn-primary" onclick="loadWallet()" style="margin-top: 16px;">Retry</button>
        </div>
      `;
    }
  }
}

// Load Settings
async function loadSettings() {
  try {
    // Load user data
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user) {
      const userEmailEl = document.getElementById('userEmail');
      if (userEmailEl) {
        userEmailEl.textContent = user.email || 'Not set';
      }
    }

    // Load social accounts if endpoint exists
    try {
      const response = await fetch(`${DASHBOARD_URL}/social-accounts`, {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const accounts = await response.json();

        // Update stats
        const totalAccountsEl = document.getElementById('totalAccounts');
        const verifiedAccountsEl = document.getElementById('verifiedAccounts');
        const pendingAccountsEl = document.getElementById('pendingAccounts');
        const platformsCountEl = document.getElementById('platformsCount');

        if (totalAccountsEl) totalAccountsEl.textContent = accounts.length || 0;

        const verified = accounts.filter(a => a.status === 'verified').length;
        const pending = accounts.filter(a => a.status === 'pending').length;
        const platforms = new Set(accounts.map(a => a.platform)).size;

        if (verifiedAccountsEl) verifiedAccountsEl.textContent = verified;
        if (pendingAccountsEl) pendingAccountsEl.textContent = pending;
        if (platformsCountEl) platformsCountEl.textContent = platforms;
      }
    } catch (error) {
      console.log('Social accounts endpoint not available');
      // Set defaults
      const totalAccountsEl = document.getElementById('totalAccounts');
      const verifiedAccountsEl = document.getElementById('verifiedAccounts');
      const pendingAccountsEl = document.getElementById('pendingAccounts');
      const platformsCountEl = document.getElementById('platformsCount');

      if (totalAccountsEl) totalAccountsEl.textContent = '0';
      if (verifiedAccountsEl) verifiedAccountsEl.textContent = '0';
      if (pendingAccountsEl) pendingAccountsEl.textContent = '0';
      if (platformsCountEl) platformsCountEl.textContent = '0';
    }
  } catch (error) {
    console.error('Load settings error:', error);
  }
}

// Modal Functions
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function openSubmitModal(campaignId) {
  document.getElementById('submitCampaignId').value = campaignId;
  document.getElementById('submitPostForm').reset();
  openModal('submitPostModal');
}

function openBatchSubmitModal(campaignId) {
  document.getElementById('batchCampaignId').value = campaignId;
  document.getElementById('batchSubmissionsContainer').innerHTML = `
    <div class="batch-submission-item">
      <div class="form-group">
        <label>Platform</label>
        <select class="batch-platform" required>
          <option value="">Select platform</option>
          <option value="youtube">YouTube</option>
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram</option>
          <option value="x">X (Twitter)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Post URL</label>
        <input type="url" class="batch-post-url" placeholder="https://..." required>
      </div>
      <div class="form-group">
        <label>Account Username (Optional)</label>
        <input type="text" class="batch-account-info" placeholder="@username">
      </div>
    </div>
  `;
  openModal('batchSubmitModal');
}

function addBatchSubmission() {
  const container = document.getElementById('batchSubmissionsContainer');
  const newItem = document.createElement('div');
  newItem.className = 'batch-submission-item';
  newItem.innerHTML = `
    <div class="form-group">
      <label>Platform</label>
      <select class="batch-platform" required>
        <option value="">Select platform</option>
        <option value="youtube">YouTube</option>
        <option value="tiktok">TikTok</option>
        <option value="instagram">Instagram</option>
        <option value="x">X (Twitter)</option>
      </select>
    </div>
    <div class="form-group">
      <label>Post URL</label>
      <input type="url" class="batch-post-url" placeholder="https://..." required>
    </div>
    <div class="form-group">
      <label>Account Username (Optional)</label>
      <input type="text" class="batch-account-info" placeholder="@username">
    </div>
  `;
  container.appendChild(newItem);
}

async function openAnalytics(campaignId, campaignTitle) {
  try {
    const response = await fetch(`${DASHBOARD_URL}/analytics/campaign/${campaignId}`, {
      headers: getAuthHeaders()
    });
    const analytics = await response.json();

    document.getElementById('analyticsCampaignTitle').textContent = campaignTitle;
    const content = document.getElementById('analyticsContent');

    content.innerHTML = `
      <div class="stats-grid" style="margin-bottom: 24px;">
        <div class="stat-card">
          <div class="stat-label">Total Earnings</div>
          <div class="stat-value">$${analytics.totalEarnings.toFixed(2)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Views</div>
          <div class="stat-value">${formatNumber(analytics.totalViews)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Submissions</div>
          <div class="stat-value">${analytics.submissionCount}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Approved</div>
          <div class="stat-value">${analytics.approvedCount}</div>
        </div>
      </div>
      <div class="dashboard-card">
        <h3>Submission Details</h3>
        <div class="submissions-list">
          ${analytics.submissions.map(sub => `
            <div class="campaign-list-item">
              <div>
                <div style="font-weight: 600;">${sub.platform} Post</div>
                <div style="font-size: 13px; color: rgba(255,255,255,0.6); margin-top: 4px;">
                  Views: ${formatNumber(sub.views || 0)} • Earnings: $${(sub.earnings || 0).toFixed(2)}
                </div>
              </div>
              <span class="campaign-badge ${sub.status}">${sub.status}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    openModal('analyticsModal');
  } catch (error) {
    console.error('Load analytics error:', error);
    showNotification('Failed to load analytics', 'error');
  }
}

async function loadLeaderboard(metric = 'earnings') {
  try {
    const content = document.getElementById('leaderboardContent');
    if (!content) return;

    content.innerHTML = '<div style="padding: 40px; text-align: center; color: rgba(255,255,255,0.6);">Loading leaderboard...</div>';

    const response = await fetch(`${DASHBOARD_URL}/analytics/leaderboard?metric=${metric}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const leaderboard = await response.json();

    if (leaderboard.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <div class="empty-title">No leaderboard data yet</div>
          <p class="empty-description">Be the first to submit content!</p>
        </div>
      `;
      return;
    }

    content.innerHTML = `
      <div class="leaderboard-list">
        ${leaderboard.slice(0, 20).map((entry, index) => `
          <div class="leaderboard-item ${index < 3 ? 'top-three' : ''}">
            <div class="leaderboard-rank">#${entry.rank || index + 1}</div>
            <div class="leaderboard-name">${entry.creatorName || 'Anonymous'}</div>
            <div class="leaderboard-value">
              ${metric === 'earnings' ? `$${(entry.earnings || 0).toFixed(2)}` :
        metric === 'views' ? formatNumber(entry.views || 0) :
          entry.submissions || 0}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    console.error('Load leaderboard error:', error);
    const content = document.getElementById('leaderboardContent');
    if (content) {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Failed to load leaderboard</div>
          <p class="empty-description">Please try again later.</p>
        </div>
      `;
    }
  }
}

function openLeaderboard(campaignId, campaignTitle) {
  const titleEl = document.getElementById('leaderboardCampaignTitle');
  if (titleEl) {
    titleEl.textContent = campaignTitle || 'Campaign Leaderboard';
  }
  loadLeaderboard('earnings');
  openModal('leaderboardModal');
}

// Social Account Functions
let currentAccountId = null;
let currentVerificationCode = null;
let addAccountPlatformDropdown = null;

function openSocialAccountsModal() {
  openModal('socialAccountsModal');
  loadSocialAccounts();
}

// Function already defined at top of file (line ~163)

async function generateVerificationCode() {
  const platform = addAccountPlatformDropdown ? addAccountPlatformDropdown.getValue() : '';
  const handle = document.getElementById('addAccountHandle').value.trim();
  const errorEl = document.getElementById('addAccountError');

  errorEl.textContent = '';

  if (!platform) {
    errorEl.textContent = 'Please select a platform';
    return;
  }

  if (!handle) {
    errorEl.textContent = 'Please enter your handle';
    return;
  }

  try {
    const response = await fetch(`${DASHBOARD_URL}/social-accounts/generate-code`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ platform, handle })
    });

    const data = await response.json();

    if (response.ok) {
      currentAccountId = data.accountId;
      currentVerificationCode = data.code;

      // Show verification code modal
      document.getElementById('verificationCodeDisplay').textContent = data.code;
      const platformNames = {
        youtube: 'YouTube',
        tiktok: 'TikTok',
        instagram: 'Instagram',
        x: 'X (Twitter)'
      };
      document.getElementById('verificationPlatformName').textContent = platformNames[platform] || platform;
      document.getElementById('verificationError').textContent = '';

      closeModal('addAccountModal');
      openModal('verificationCodeModal');
    } else {
      errorEl.textContent = data.error || 'Failed to generate code';
    }
  } catch (error) {
    console.error('Generate code error:', error);
    errorEl.textContent = 'Network error. Please try again.';
  }
}

async function verifyAccount(skipApiCheck = false) {
  const errorEl = document.getElementById('verificationError');
  errorEl.textContent = '';

  if (!currentAccountId || !currentVerificationCode) {
    errorEl.textContent = 'No verification code found. Please generate a new code.';
    return;
  }

  // Show loading state
  const verifyBtn = document.querySelector('#verificationCodeModal .btn-primary');
  const originalText = verifyBtn ? verifyBtn.textContent : 'Verify Account';
  if (verifyBtn) {
    verifyBtn.disabled = true;
    verifyBtn.textContent = skipApiCheck ? 'Verifying (Manual)...' : 'Verifying...';
  }

  try {
    const response = await fetch(`${DASHBOARD_URL}/social-accounts/verify`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        accountId: currentAccountId,
        code: currentVerificationCode,
        skipApiCheck: skipApiCheck
      })
    });

    const data = await response.json();

    if (response.ok) {
      if (typeof showNotification === 'function') {
        showNotification('Account verified successfully!', 'success');
      } else {
        alert('Account verified successfully!');
      }
      closeModal('verificationCodeModal');
      openModal('socialAccountsModal');
      loadSocialAccounts();
      loadSettings(); // Refresh stats
      currentAccountId = null;
      currentVerificationCode = null;
    } else {
      // Show error with option to skip verification
      const errorMessage = data.error || 'Verification failed';
      errorEl.innerHTML = `
        <div style="color: #ef4444; margin-bottom: 12px;">${errorMessage}</div>
        ${!skipApiCheck ? `
          <div style="color: rgba(255,255,255,0.6); font-size: 13px; margin-bottom: 12px;">
            ${data.suggestion || 'If the verification service is unavailable, you can verify manually.'}
          </div>
          <button type="button" class="btn btn-secondary" onclick="verifyAccount(true)" style="width: 100%; margin-top: 8px;">
            Skip API Check (Manual Verify)
          </button>
        ` : ''}
      `;
    }
  } catch (error) {
    console.error('Verify account error:', error);
    errorEl.innerHTML = `
      <div style="color: #ef4444; margin-bottom: 12px;">Network error. Please try again.</div>
      <button type="button" class="btn btn-secondary" onclick="verifyAccount(true)" style="width: 100%; margin-top: 8px;">
        Skip API Check (Manual Verify)
      </button>
    `;
  } finally {
    if (verifyBtn) {
      verifyBtn.disabled = false;
      verifyBtn.textContent = originalText;
    }
  }
}

async function loadSocialAccounts() {
  const list = document.getElementById('socialAccountsList');
  if (!list) return;

  try {
    const response = await fetch(`${DASHBOARD_URL}/social-accounts`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to load accounts');
    }

    const accounts = await response.json();

    if (accounts.length === 0) {
      list.innerHTML = `
        <div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.6);">
          <p>No social accounts connected yet.</p>
          <p style="margin-top: 8px; font-size: 14px;">Click "Add Account" to get started.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = accounts.map(acc => {
      const statusColors = {
        verified: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', text: 'Verified' },
        pending: { bg: 'rgba(234,179,8,0.15)', color: '#eab308', text: 'Pending' },
        failed: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', text: 'Failed' }
      };
      const status = statusColors[acc.status] || statusColors.pending;
      const platformNames = {
        youtube: 'YouTube',
        tiktok: 'TikTok',
        instagram: 'Instagram',
        x: 'X (Twitter)'
      };

      return `
        <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div>
              <div style="font-weight: 600; color: white; margin-bottom: 4px;">${platformNames[acc.platform] || acc.platform}</div>
              <div style="font-size: 14px; color: rgba(255,255,255,0.6);">${acc.handle}</div>
            </div>
            <span style="background: ${status.bg}; color: ${status.color}; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 600;">${status.text}</span>
          </div>
          ${acc.status === 'pending' ? `
            <div style="background: rgba(37, 99, 235, 0.1); border: 1px solid rgba(37, 99, 235, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
              <div style="font-size: 12px; color: rgba(255,255,255,0.8); margin-bottom: 8px;">Verification Code:</div>
              <div style="font-size: 18px; font-weight: 700; color: #2563eb; letter-spacing: 2px; font-family: 'Courier New', monospace;">${acc.verificationCode}</div>
            </div>
          ` : ''}
          <button class="btn btn-secondary" style="width: 100%;" onclick="deleteSocialAccount('${acc.id}')">Remove</button>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Load social accounts error:', error);
    list.innerHTML = `
      <div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.6);">
        <p>Failed to load accounts. Please try again.</p>
      </div>
    `;
  }
}

async function deleteSocialAccount(accountId) {
  if (!confirm('Are you sure you want to remove this account?')) return;

  try {
    const response = await fetch(`${DASHBOARD_URL}/social-accounts/${accountId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (response.ok) {
      if (typeof showNotification === 'function') {
        showNotification('Account removed successfully', 'success');
      } else {
        alert('Account removed successfully');
      }
      loadSocialAccounts();
      loadSettings(); // Refresh stats
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to remove account');
    }
  } catch (error) {
    console.error('Delete account error:', error);
    alert('Network error. Please try again.');
  }
}

function addSocialAccount() {
  openAddAccountModal();
}

// Utility Functions
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

function getTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => notification.classList.add('show'), 10);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Add search functionality for campaigns - use event delegation
document.addEventListener('keypress', (e) => {
  if (e.target.id === 'campaignSearch' && e.key === 'Enter') {
    e.preventDefault();
    loadCampaigns();
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'nicheFilter' || e.target.id === 'sortFilter') {
    loadCampaigns();
  }
});

// Handle all button clicks with event delegation
document.addEventListener('click', (e) => {
  // Join Campaign buttons - handle both .join-campaign-btn and buttons with onclick
  const joinBtn = e.target.closest('.join-campaign-btn');
  if (joinBtn) {
    e.preventDefault();
    e.stopPropagation();
    const campaignId = joinBtn.dataset.campaignId;
    if (campaignId) {
      joinCampaign(campaignId);
      return;
    }
  }

  // Legacy onclick handler
  if (e.target.closest('.btn-primary') && e.target.closest('.btn-primary').onclick) {
    const btn = e.target.closest('.btn-primary');
    const onclick = btn.getAttribute('onclick');
    if (onclick && onclick.includes('joinCampaign')) {
      e.preventDefault();
      const match = onclick.match(/joinCampaign\('([^']+)'\)/);
      if (match) {
        joinCampaign(match[1]);
      }
    }
  }

  // Retry buttons
  if (e.target.textContent.includes('Retry') && e.target.classList.contains('btn')) {
    const onclick = e.target.getAttribute('onclick');
    if (onclick) {
      e.preventDefault();
      eval(onclick);
    }
  }

  // View All buttons
  if (e.target.closest('.view-all-btn') || e.target.closest('.view-all')) {
    const btn = e.target.closest('.view-all-btn') || e.target.closest('.view-all');
    const onclick = btn.getAttribute('onclick');
    if (onclick && onclick.includes('showSection')) {
      e.preventDefault();
      const match = onclick.match(/showSection\('([^']+)'\)/);
      if (match) {
        showSection(match[1]);
      }
    }
  }
});

// Make functions globally available
window.showSection = showSection;
window.joinCampaign = joinCampaign;
window.loadCampaigns = loadCampaigns;
window.loadMyCampaigns = loadMyCampaigns;
window.loadSubmissions = loadSubmissions;
window.loadWallet = loadWallet;
window.loadSettings = loadSettings;
window.openSubmitModal = openSubmitModal;
window.openBatchSubmitModal = openBatchSubmitModal;
window.openAnalytics = openAnalytics;
window.openLeaderboard = openLeaderboard;
window.openSocialAccountsModal = openSocialAccountsModal;
window.addBatchSubmission = addBatchSubmission;
window.loadLeaderboard = loadLeaderboard;
window.openLeaderboard = openLeaderboard;
window.loadLeaderboard = loadLeaderboard;
window.addBatchSubmission = addBatchSubmission;
window.closeModal = closeModal;
window.openModal = openModal;
window.openSocialAccountsModal = openSocialAccountsModal;
window.addSocialAccount = addSocialAccount;
// Already exported above at line 1506
window.generateVerificationCode = generateVerificationCode;
window.verifyAccount = verifyAccount;
window.deleteSocialAccount = deleteSocialAccount;
window.loadSocialAccounts = loadSocialAccounts;
window.initCustomDropdown = initCustomDropdown;
window.showNotification = showNotification;
window.loadOverview = loadOverview;
window.getAuthHeaders = getAuthHeaders;
window.API_URL = DASHBOARD_URL;
window.getTimeAgo = getTimeAgo;
window.formatNumber = formatNumber;
