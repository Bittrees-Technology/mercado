// Apply a remembered appearance before styles render; dark is the default.
try { document.documentElement.dataset.theme = localStorage.getItem('mercado-theme') === 'light' ? 'light' : 'dark'; } catch { document.documentElement.dataset.theme = 'dark'; }
