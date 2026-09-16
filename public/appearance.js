// Light is the default. This key stores deliberate choices, not old automatic defaults.
try { document.documentElement.dataset.theme = localStorage.getItem('mercado-appearance-choice') === 'dark' ? 'dark' : 'light'; } catch { document.documentElement.dataset.theme = 'light'; }
