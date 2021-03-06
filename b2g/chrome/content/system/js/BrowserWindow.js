/**
 * Browser Window.
 *
 * A browser window includes a URL bar and a mozbrowser frame.
 */

/**
 * Browser Window Constructor.
 */
var BrowserWindow = function(id, url) {
  if (id === undefined) {
    return null;
  }
  this.container = document.getElementById('windows');
  this.id = id;
  this.currentURL = '';
  this.currentTitle = '';
  this.render(url);
  return this;
};

/** 
 * Window View.
 */
BrowserWindow.prototype.view = function() {
  return '<div id="window' + this.id + '" class="browser-window">' +
    '<menu type="toolbar" class="browser-chrome">' +
    '<form id="url-bar-form-' + this.id + '"" novalidate>' +
    '<input type="url" id="url-bar-' + this.id + '" type="text"></input>' +
    '</form>' +
    '<button class="menu-button">' +
    '<button id="close-button-' + this.id + '" class="close-button">' +
    '</menu>' +
    '<iframe id="window-frame-' + this.id + '" mozbrowser remote></iframe>' +
    '<div id="window-scrim-' + this.id + '" class="window-scrim"></div>' +
    '</div>';
};

/**
 * Render the window.
 *
 * @param {String} url URL to navigate window to.
 */
BrowserWindow.prototype.render = function(url) {
  this.container.insertAdjacentHTML('beforeend', this.view());

  // Get DOM elements
  this.element = document.getElementById('window' + this.id);
  this.urlBar = document.getElementById('url-bar-' + this.id);
  this.urlBarForm = document.getElementById('url-bar-form-' + this.id);
  this.frame = document.getElementById('window-frame-' + this.id);
  this.closeButton = document.getElementById('close-button-' + this.id);
  this.scrim = document.getElementById('window-scrim-' + this.id);

  // Add event listeners
 this.frame.addEventListener('mozbrowserlocationchange',
    this.handleLocationChange.bind(this));
 this.frame.addEventListener('mozbrowseropenwindow',
    this.handleOpenWindow.bind(this));
 this.urlBar.addEventListener('focus', this.handleUrlBarFocus.bind(this));
 this.urlBar.addEventListener('blur', this.handleUrlBarBlur.bind(this));
 this.urlBarForm.addEventListener('submit',
    this.handleUrlSubmit.bind(this));
 this.closeButton.addEventListener('click', this.close.bind(this));
 this.scrim.addEventListener('click', this.handleScrimClick.bind(this));

 // Navigate to URL
 if (url) {
  this.frame.src = url;
 } else {
  this.frame.src="about:newtab";
 }
};

/**
 * Show the Window.
 */
BrowserWindow.prototype.show = function() {
  this.element.classList.remove('hidden');
};

/**
 * Hide the window.
 */
BrowserWindow.prototype.hide = function() {
  this.element.classList.add('hidden');
};

/**
 * Close the window.
 */
BrowserWindow.prototype.close = function() {
  var e = new CustomEvent('_closewindow', {
    detail: {
      id: this.id
    }
  });
  window.dispatchEvent(e);
};

/**
 * Delete the element from the DOM.
 */
BrowserWindow.prototype.destroy = function() {
  this.container.removeChild(this.element);
};

/**
 * Handle location change.
 *
 * @param {Event} e mozbrowserlocationchange event.
 */
BrowserWindow.prototype.handleLocationChange = function(e) {
  var url = e.detail;
  if (url == 'about:blank' || url =='about:newtab') {
     this.urlBar.focus();
     return;
  }
  this.currentURL = url;
  var hostname = new URL(url).hostname;
  this.currentTitle = hostname;
  this.urlBar.value = hostname;

  Places.updateSite(url);
};

/**
 * Handle open window.
 *
 * @param {Event} mozbrowseropenwindow event.
 */
BrowserWindow.prototype.handleOpenWindow = function(e) {
  e.preventDefault();
  window.dispatchEvent(new CustomEvent('_openwindow', {
    'detail': e.detail
  }));
};

/**
 *  Handle focus of URL bar.
 *
 *  @param {Event} e focus event.
 */
BrowserWindow.prototype.handleUrlBarFocus = function (e) {
  this.urlBar.value = this.currentURL;
  this.urlBar.select();
};

/**
 *  Handle URL bar losing focus.
 *
 *  @param {Event} e blur event.
 */
BrowserWindow.prototype.handleUrlBarBlur = function (e) {
  this.urlBar.value = this.currentTitle;
};

/**
 * Handle URL submission.
 *
 * If URL is invald, prepend "http://".
 *
 * @param {Event} e submit event.
 */
BrowserWindow.prototype.handleUrlSubmit = function (e) {
  e.preventDefault();
  if (this.urlBar.validity.valid) {
    this.frame.src = this.urlBar.value;
  } else {
    this.frame.src = 'http://' + this.urlBar.value;
  }
  this.urlBar.blur();
};

/**
 * Navigate back in session history.
 */
BrowserWindow.prototype.goBack = function() {
  this.frame.goBack();
};

/**
 * Handle click on window scrim.
 */
BrowserWindow.prototype.handleScrimClick = function() {
  var e = new CustomEvent('_openwindow', {
    detail: {
      id: this.id
    }
  });
  window.dispatchEvent(e);
};