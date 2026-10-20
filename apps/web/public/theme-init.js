(function () {
  try {
    var stored = localStorage.getItem('nutripals-theme');
    document.documentElement.dataset.theme = stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch (error) {
    document.documentElement.dataset.theme = 'system';
  }
})();
