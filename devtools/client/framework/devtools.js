/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const Services = require("Services");
const promise = require("promise");

// Load gDevToolsBrowser toolbox lazily as they need gDevTools to be fully initialized
loader.lazyRequireGetter(this, "Toolbox", "devtools/client/framework/toolbox", true);
loader.lazyRequireGetter(this, "gDevToolsBrowser", "devtools/client/framework/devtools-browser", true);

const {defaultTools: DefaultTools, defaultThemes: DefaultThemes} =
  require("devtools/client/definitions");
const EventEmitter = require("devtools/shared/event-emitter");
const Telemetry = require("devtools/client/shared/telemetry");
const {JsonView} = require("devtools/client/jsonview/main");

const TABS_OPEN_PEAK_HISTOGRAM = "DEVTOOLS_TABS_OPEN_PEAK_LINEAR";
const TABS_OPEN_AVG_HISTOGRAM = "DEVTOOLS_TABS_OPEN_AVERAGE_LINEAR";
const TABS_PINNED_PEAK_HISTOGRAM = "DEVTOOLS_TABS_PINNED_PEAK_LINEAR";
const TABS_PINNED_AVG_HISTOGRAM = "DEVTOOLS_TABS_PINNED_AVERAGE_LINEAR";

const FORBIDDEN_IDS = new Set(["toolbox", ""]);
const MAX_ORDINAL = 99;

/**
 * DevTools is a class that represents a set of developer tools, it holds a
 * set of tools and keeps track of open toolboxes in the browser.
 */
this.DevTools = function DevTools() {
  this._tools = new Map();     // Map<toolId, tool>
  this._themes = new Map();    // Map<themeId, theme>
  this._toolboxes = new Map(); // Map<target, toolbox>
  this._telemetry = new Telemetry();

  // destroy() is an observer's handler so we need to preserve context.
  this.destroy = this.destroy.bind(this);
  this._teardown = this._teardown.bind(this);

  // JSON Viewer for 'application/json' documents.
  JsonView.initialize();

  EventEmitter.decorate(this);

  Services.obs.addObserver(this._teardown, "devtools-unloaded", false);
  Services.obs.addObserver(this.destroy, "quit-application", false);
};

DevTools.prototype = {
  /**
   * Register a new developer tool.
   *
   * A definition is a light object that holds different information about a
   * developer tool. This object is not supposed to have any operational code.
   * See it as a "manifest".
   * The only actual code lives in the build() function, which will be used to
   * start an instance of this tool.
   *
   * Each toolDefinition has the following properties:
   * - id: Unique identifier for this tool (string|required)
   * - visibilityswitch: Property name to allow us to hide this tool from the
   *                     DevTools Toolbox.
   *                     A falsy value indicates that it cannot be hidden.
   * - icon: URL pointing to a graphic which will be used as the src for an
   *         16x16 img tag (string|required)
   * - invertIconForLightTheme: The icon can automatically have an inversion
   *         filter applied (default is false).  All builtin tools are true, but
   *         addons may omit this to prevent unwanted changes to the `icon`
   *         image. filter: invert(1) is applied to the image (boolean|optional)
   * - url: URL pointing to a XUL/XHTML document containing the user interface
   *        (string|required)
   * - label: Localized name for the tool to be displayed to the user
   *          (string|required)
   * - hideInOptions: Boolean indicating whether or not this tool should be
                      shown in toolbox options or not. Defaults to false.
   *                  (boolean)
   * - build: Function that takes an iframe, which has been populated with the
   *          markup from |url|, and also the toolbox containing the panel.
   *          And returns an instance of ToolPanel (function|required)
   */
  registerTool: function DT_registerTool(toolDefinition) {
    let toolId = toolDefinition.id;

    if (!toolId || FORBIDDEN_IDS.has(toolId)) {
      throw new Error("Invalid definition.id");
    }

    // Make sure that additional tools will always be able to be hidden.
    // When being called from main.js, defaultTools has not yet been exported.
    // But, we can assume that in this case, it is a default tool.
    if (DefaultTools && DefaultTools.indexOf(toolDefinition) == -1) {
      toolDefinition.visibilityswitch = "devtools." + toolId + ".enabled";
    }

    this._tools.set(toolId, toolDefinition);

    this.emit("tool-registered", toolId);
  },

  /**
   * Removes all tools that match the given |toolId|
   * Needed so that add-ons can remove themselves when they are deactivated
   *
   * @param {string|object} tool
   *        Definition or the id of the tool to unregister. Passing the
   *        tool id should be avoided as it is a temporary measure.
   * @param {boolean} isQuitApplication
   *        true to indicate that the call is due to app quit, so we should not
   *        cause a cascade of costly events
   */
  unregisterTool: function DT_unregisterTool(tool, isQuitApplication) {
    let toolId = null;
    if (typeof tool == "string") {
      toolId = tool;
      tool = this._tools.get(tool);
    }
    else {
      toolId = tool.id;
    }
    this._tools.delete(toolId);

    if (!isQuitApplication) {
      this.emit("tool-unregistered", tool);
    }
  },

  /**
   * Sorting function used for sorting tools based on their ordinals.
   */
  ordinalSort: function DT_ordinalSort(d1, d2) {
    let o1 = (typeof d1.ordinal == "number") ? d1.ordinal : MAX_ORDINAL;
    let o2 = (typeof d2.ordinal == "number") ? d2.ordinal : MAX_ORDINAL;
    return o1 - o2;
  },

  getDefaultTools: function DT_getDefaultTools() {
    return DefaultTools.sort(this.ordinalSort);
  },

  getAdditionalTools: function DT_getAdditionalTools() {
    let tools = [];
    for (let [key, value] of this._tools) {
      if (DefaultTools.indexOf(value) == -1) {
        tools.push(value);
      }
    }
    return tools.sort(this.ordinalSort);
  },

  /**
   * Get a tool definition if it exists and is enabled.
   *
   * @param {string} toolId
   *        The id of the tool to show
   *
   * @return {ToolDefinition|null} tool
   *         The ToolDefinition for the id or null.
   */
  getToolDefinition: function DT_getToolDefinition(toolId) {
    let tool = this._tools.get(toolId);
    if (!tool) {
      return null;
    } else if (!tool.visibilityswitch) {
      return tool;
    }

    let enabled;
    try {
      enabled = Services.prefs.getBoolPref(tool.visibilityswitch);
    } catch (e) {
      enabled = true;
    }

    return enabled ? tool : null;
  },

  /**
   * Allow ToolBoxes to get at the list of tools that they should populate
   * themselves with.
   *
   * @return {Map} tools
   *         A map of the the tool definitions registered in this instance
   */
  getToolDefinitionMap: function DT_getToolDefinitionMap() {
    let tools = new Map();

    for (let [id, definition] of this._tools) {
      if (this.getToolDefinition(id)) {
        tools.set(id, definition);
      }
    }

    return tools;
  },

  /**
   * Tools have an inherent ordering that can't be represented in a Map so
   * getToolDefinitionArray provides an alternative representation of the
   * definitions sorted by ordinal value.
   *
   * @return {Array} tools
   *         A sorted array of the tool definitions registered in this instance
   */
  getToolDefinitionArray: function DT_getToolDefinitionArray() {
    let definitions = [];

    for (let [id, definition] of this._tools) {
      if (this.getToolDefinition(id)) {
        definitions.push(definition);
      }
    }

    return definitions.sort(this.ordinalSort);
  },

  /**
   * Register a new theme for developer tools toolbox.
   *
   * A definition is a light object that holds various information about a
   * theme.
   *
   * Each themeDefinition has the following properties:
   * - id: Unique identifier for this theme (string|required)
   * - label: Localized name for the theme to be displayed to the user
   *          (string|required)
   * - stylesheets: Array of URLs pointing to a CSS document(s) containing
   *                the theme style rules (array|required)
   * - classList: Array of class names identifying the theme within a document.
   *              These names are set to document element when applying
   *              the theme (array|required)
   * - onApply: Function that is executed by the framework when the theme
   *            is applied. The function takes the current iframe window
   *            and the previous theme id as arguments (function)
   * - onUnapply: Function that is executed by the framework when the theme
   *            is unapplied. The function takes the current iframe window
   *            and the new theme id as arguments (function)
   */
  registerTheme: function DT_registerTheme(themeDefinition) {
    let themeId = themeDefinition.id;

    if (!themeId) {
      throw new Error("Invalid theme id");
    }

    if (this._themes.get(themeId)) {
      throw new Error("Theme with the same id is already registered");
    }

    this._themes.set(themeId, themeDefinition);

    this.emit("theme-registered", themeId);
  },

  /**
   * Removes an existing theme from the list of registered themes.
   * Needed so that add-ons can remove themselves when they are deactivated
   *
   * @param {string|object} theme
   *        Definition or the id of the theme to unregister.
   */
  unregisterTheme: function DT_unregisterTheme(theme) {
    let themeId = null;
    if (typeof theme == "string") {
      themeId = theme;
      theme = this._themes.get(theme);
    }
    else {
      themeId = theme.id;
    }

    let currTheme = Services.prefs.getCharPref("devtools.theme");

    // Note that we can't check if `theme` is an item
    // of `DefaultThemes` as we end up reloading definitions
    // module and end up with different theme objects
    let isCoreTheme = DefaultThemes.some(t => t.id === themeId);

    // Reset the theme if an extension theme that's currently applied
    // is being removed.
    // Ignore shutdown since addons get disabled during that time.
    if (!Services.startup.shuttingDown &&
        !isCoreTheme &&
        theme.id == currTheme) {
      Services.prefs.setCharPref("devtools.theme", "light");

      let data = {
        pref: "devtools.theme",
        newValue: "light",
        oldValue: currTheme
      };

      this.emit("pref-changed", data);

      this.emit("theme-unregistered", theme);
    }

    this._themes.delete(themeId);
  },

  /**
   * Get a theme definition if it exists.
   *
   * @param {string} themeId
   *        The id of the theme
   *
   * @return {ThemeDefinition|null} theme
   *         The ThemeDefinition for the id or null.
   */
  getThemeDefinition: function DT_getThemeDefinition(themeId) {
    let theme = this._themes.get(themeId);
    if (!theme) {
      return null;
    }
    return theme;
  },

  /**
   * Get map of registered themes.
   *
   * @return {Map} themes
   *         A map of the the theme definitions registered in this instance
   */
  getThemeDefinitionMap: function DT_getThemeDefinitionMap() {
    let themes = new Map();

    for (let [id, definition] of this._themes) {
      if (this.getThemeDefinition(id)) {
        themes.set(id, definition);
      }
    }

    return themes;
  },

  /**
   * Get registered themes definitions sorted by ordinal value.
   *
   * @return {Array} themes
   *         A sorted array of the theme definitions registered in this instance
   */
  getThemeDefinitionArray: function DT_getThemeDefinitionArray() {
    let definitions = [];

    for (let [id, definition] of this._themes) {
      if (this.getThemeDefinition(id)) {
        definitions.push(definition);
      }
    }

    return definitions.sort(this.ordinalSort);
  },

  /**
   * Show a Toolbox for a target (either by creating a new one, or if a toolbox
   * already exists for the target, by bring to the front the existing one)
   * If |toolId| is specified then the displayed toolbox will have the
   * specified tool selected.
   * If |hostType| is specified then the toolbox will be displayed using the
   * specified HostType.
   *
   * @param {Target} target
   *         The target the toolbox will debug
   * @param {string} toolId
   *        The id of the tool to show
   * @param {Toolbox.HostType} hostType
   *        The type of host (bottom, window, side)
   * @param {object} hostOptions
   *        Options for host specifically
   *
   * @return {Toolbox} toolbox
   *        The toolbox that was opened
   */
  showToolbox: function(target, toolId, hostType, hostOptions) {
    let deferred = promise.defer();

    let toolbox = this._toolboxes.get(target);
    if (toolbox) {

      let hostPromise = (hostType != null && toolbox.hostType != hostType) ?
          toolbox.switchHost(hostType) :
          promise.resolve(null);

      if (toolId != null && toolbox.currentToolId != toolId) {
        hostPromise = hostPromise.then(function() {
          return toolbox.selectTool(toolId);
        });
      }

      return hostPromise.then(function() {
        toolbox.raise();
        return toolbox;
      });
    }
    else {
      // No toolbox for target, create one
      toolbox = new Toolbox(target, toolId, hostType, hostOptions);

      this.emit("toolbox-created", toolbox);

      this._toolboxes.set(target, toolbox);

      toolbox.once("destroy", () => {
        this.emit("toolbox-destroy", target);
      });

      toolbox.once("destroyed", () => {
        this._toolboxes.delete(target);
        this.emit("toolbox-destroyed", target);
      });

      // If toolId was passed in, it will already be selected before the
      // open promise resolves.
      toolbox.open().then(() => {
        deferred.resolve(toolbox);
        this.emit("toolbox-ready", toolbox);
      });
    }

    return deferred.promise;
  },

  /**
   * Return the toolbox for a given target.
   *
   * @param  {object} target
   *         Target value e.g. the target that owns this toolbox
   *
   * @return {Toolbox} toolbox
   *         The toolbox that is debugging the given target
   */
  getToolbox: function DT_getToolbox(target) {
    return this._toolboxes.get(target);
  },

  /**
   * Close the toolbox for a given target
   *
   * @return promise
   *         This promise will resolve to false if no toolbox was found
   *         associated to the target. true, if the toolbox was successfully
   *         closed.
   */
  closeToolbox: function DT_closeToolbox(target) {
    let toolbox = this._toolboxes.get(target);
    if (toolbox == null) {
      return promise.resolve(false);
    }
    return toolbox.destroy().then(() => true);
  },

  _pingTelemetry: function() {
    let mean = function(arr) {
      if (arr.length === 0) {
        return 0;
      }

      let total = arr.reduce((a, b) => a + b);
      return Math.ceil(total / arr.length);
    };

    let tabStats = gDevToolsBrowser._tabStats;
    this._telemetry.log(TABS_OPEN_PEAK_HISTOGRAM, tabStats.peakOpen);
    this._telemetry.log(TABS_OPEN_AVG_HISTOGRAM, mean(tabStats.histOpen));
    this._telemetry.log(TABS_PINNED_PEAK_HISTOGRAM, tabStats.peakPinned);
    this._telemetry.log(TABS_PINNED_AVG_HISTOGRAM, mean(tabStats.histPinned));
  },

  /**
   * Called to tear down a tools provider.
   */
  _teardown: function DT_teardown() {
    for (let [target, toolbox] of this._toolboxes) {
      toolbox.destroy();
    }
  },

  /**
   * All browser windows have been closed, tidy up remaining objects.
   */
  destroy: function() {
    Services.obs.removeObserver(this.destroy, "quit-application");
    Services.obs.removeObserver(this._teardown, "devtools-unloaded");

    for (let [key, tool] of this.getToolDefinitionMap()) {
      this.unregisterTool(key, true);
    }

    JsonView.destroy();

    this._pingTelemetry();
    this._telemetry = null;

    // Cleaning down the toolboxes: i.e.
    //   for (let [target, toolbox] of this._toolboxes) toolbox.destroy();
    // Is taken care of by the gDevToolsBrowser.forgetBrowserWindow
  },

  /**
   * Iterator that yields each of the toolboxes.
   */
  *[Symbol.iterator]() {
    for (let toolbox of this._toolboxes) {
      yield toolbox;
    }
  }
};

exports.gDevTools = new DevTools();

