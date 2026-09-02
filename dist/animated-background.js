
const Debug_Prefix = "Animated Background DEBUG: ";
const Log_Prefix = "Animated Background: "

//globals
var Root;
var Hui;
var Header;
var Lovelace;
var Animated_Config;
var Haobj = null;
var View;
var Panel_Holder;
var Debug_Mode = false;
var Loaded = false;
var View_Loaded = false;
var Meme_Remover = null;
var Meme_Count = 0;
var Refresh_Timer = null;
var Opacity = 99;

//state tracking variables
let Previous_State;
let Previous_Entity;
let Previous_Url;
let Previous_Config;
let Previous_Last_Updated;

function STATUS_MESSAGE(message, force) {
  if (!Debug_Mode) {
    console.log(Log_Prefix + message);
  }
  else {
    if (force) {
      console.log(Debug_Prefix + message);
    }
  }
}

function DEBUG_MESSAGE(message, object, only_if_view_not_loaded) {
  if (Debug_Mode) {
    if (only_if_view_not_loaded && View_Loaded) {
      return;
    }
    console.log(Debug_Prefix + message);
    if (object) {
      console.log(object);
    }
  }
}

function randomIntFromInterval(min, max) { // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

//reset all DOM variables
function getVars() {
  Root = document.querySelector("home-assistant");
  Header = Root;
  Root = Root && Root.shadowRoot;
  Root = Root && Root.querySelector("home-assistant-main");
  Root = Root && Root.shadowRoot;
  Root = Root && Root.querySelector("app-drawer-layout partial-panel-resolver, ha-drawer partial-panel-resolver");
  
  Root = (Root && Root.shadowRoot) || Root;
  Root = Root && Root.querySelector("ha-panel-lovelace");
  if (Root) {
    Panel_Holder = Root.shadowRoot;
  }
  Root = Root && Root.shadowRoot;
  Root = Root && Root.querySelector("hui-root");
  Hui = Root;

  if (Root) {
    Lovelace = Root.lovelace;
    if (Lovelace) {
      Animated_Config = Lovelace.config.animated_background;
    }
    View = Root.shadowRoot.getElementById("view");
  }
}

//Mutation observer to set the background of views to transparent each time a new tab is selected
var View_Observer = new MutationObserver(function (mutations) {
  mutations.forEach(function (mutation) {
    if (mutation.addedNodes.length > 0) {
      if (!currentConfig() && View_Loaded) {
        DEBUG_MESSAGE("No configuration found for this view");
      }
      View_Loaded = false;
      clearMemes();
      clearRefreshTimer();
      renderBackgroundHTML();
    }
  });
});

//Mutation observer to refresh video on HA refresh
var Hui_Observer = new MutationObserver(function (mutations) {
  mutations.forEach(function (mutation) {
    if (mutation.addedNodes.length > 0) {
      DEBUG_MESSAGE("Proof that this observer is not useless");
      renderBackgroundHTML();
    }
  });
});

//Mutation observer to reload on dashboard change
var Panel_Observer = new MutationObserver(function (mutations) {
  mutations.forEach(function (mutation) {
    if (mutation.removedNodes.length > 0) {
      if (mutation.removedNodes[0].nodeName.toLowerCase() == "hui-editor") {
        restart();
      }
    }
  });
});

//Current known support: iphone, ipad (if set to mobile site option), windows, macintosh, android
function deviceIncluded(element, index, array) {
  return navigator.userAgent.toLowerCase().includes(element.toLowerCase());
}

//return the currently selected lovelace view
function currentViewPath() {
  return window.location.pathname.split('/')[2];
}

//return group config by name if it exists
function getGroupConfig(name) {
  var return_config = null;
  if (name == "none") {
    return { enabled: false, reason: "current group is set to 'none'" };
  }
  if (Animated_Config.groups) {
    Animated_Config.groups.forEach(group => {
      if (group.name) {
        if (group.name == name) {
          if (group.config) {
            return_config = group.config;
          }
        }
      }
    })
  }
  return return_config;
}

//return the current view configuration or null if none is found
function currentConfig() {
  var current_view_path = currentViewPath();
  var return_config = null;
  if (current_view_path == undefined) {
    return return_config;
  }
  
  if (Animated_Config) {
    if (Animated_Config.entity || Animated_Config.default_url) {
      return_config = Animated_Config;
    }


    if (Animated_Config.views) {
      Animated_Config.views.forEach(view => {
        if (view.path == current_view_path) {
          if (view.config) {
            return_config = view.config;
          }
          else {
            STATUS_MESSAGE("Error, defined view has no config", true);
          }
        }
      });
    }

    var current_view_path = currentViewPath();
    var current_view_config = Lovelace.config.views[Lovelace.current_view];
    if (Lovelace && current_view_path) {
      for (var i = 0; Lovelace.config.views.length > i; i++) {
        if (Lovelace.config.views[i].path == current_view_path) {
          current_view_config = Lovelace.config.views[i];
        }
        else {
          if (i.toString() == current_view_path.toString()) {
            current_view_config = Lovelace.config.views[i];
          }
        }
      }

      if (current_view_config) {
        var potential_config = getGroupConfig(current_view_config.animated_background);
        if (potential_config) {
          return_config = potential_config;
        }
      }
    }

    if (return_config) {
      if (return_config.entity) {
        var current_state = getEntityState(return_config.entity);
        var current_url = return_config.state_url[current_state];
        if (current_url) {
          if (current_url == "none") {
            return_config = { enabled: false, reason: "current state('" + current_state + "') state_url is set to 'none'", entity: return_config.entity, default_url: return_config.default_url, state_url: return_config.state_url };
          }
        }
      }

    }
  }
  return return_config;
}

//logic for checking if enabled in configuration
function enabled() {
  var temp_enabled = false;
  if (Animated_Config) {
    if (Animated_Config.default_url || Animated_Config.entity || Animated_Config.views || Animated_Config.groups) {
      temp_enabled = true;
    }
  }

  if (temp_enabled == false) {
    return false;
  }

  var current_config = currentConfig();

  if (!Haobj) {
    return false;
  }

  if (!current_config) {
    return false;
  }

  //Root configuration exceptions
  if (Animated_Config.excluded_devices) {
    if (Animated_Config.excluded_devices.some(deviceIncluded)) {
      if (temp_enabled) {
        DEBUG_MESSAGE("Current device is excluded", null, true);
        temp_enabled = false;
      }
    }
  }

  if (Animated_Config.excluded_users) {
    if (Animated_Config.excluded_users.map(username => username.toLowerCase()).includes(Haobj.user.name.toLowerCase())) {
      if (temp_enabled) {
        DEBUG_MESSAGE("Current user: " + Haobj.user.name + " is excluded", null, true);
        temp_enabled = false;
      }
    }
  }

  if (Animated_Config.included_users) {
    if (Animated_Config.included_users.map(username => username.toLowerCase()).includes(Haobj.user.name.toLowerCase())) {
      temp_enabled = true;
    }
    else {
      if (temp_enabled) {
        DEBUG_MESSAGE("Current user: " + Haobj.user.name + " is not included", null, true);
        temp_enabled = false;
      }
    }
  }

  if (Animated_Config.included_devices) {
    if (Animated_Config.included_devices.some(deviceIncluded)) {
      temp_enabled = true;
    }
    else {
      if (temp_enabled) {
        DEBUG_MESSAGE("Current device is not included", null, true);
        temp_enabled = false;
      }
    }
  }

  //Current config overrides (only does anything if curre_config and Animated_Config are different)
  if (current_config.excluded_devices) {
    if (current_config.excluded_devices.some(deviceIncluded)) {
      if (temp_enabled) {
        DEBUG_MESSAGE("Current device is excluded", null, true);
        temp_enabled = false;
      }
    }
  }

  if (current_config.excluded_users) {
    if (current_config.excluded_users.map(username => username.toLowerCase()).includes(Haobj.user.name.toLowerCase())) {
      if (temp_enabled) {
        DEBUG_MESSAGE("Current user: " + Haobj.user.name + " is excluded", null, true);
        temp_enabled = false;
      }
    }
  }

  if (current_config.included_users) {
    if (current_config.included_users.map(username => username.toLowerCase()).includes(Haobj.user.name.toLowerCase())) {
      temp_enabled = true;
    }
    else {
      if (temp_enabled) {
        DEBUG_MESSAGE("Current user: " + Haobj.user.name + " is not included", null, true);
        temp_enabled = false;
      }
    }
  }

  if (current_config.included_devices) {
    if (current_config.included_devices.some(deviceIncluded)) {
      temp_enabled = true;
    }
    else {
      if (temp_enabled) {
        DEBUG_MESSAGE("Current device is not included", null, true);
        temp_enabled = false;
      }
    }
  }

  if (current_config.enabled == false) {
    temp_enabled = false;
  }
  if (current_config.enabled == true) {
    temp_enabled = true;
  }

  return temp_enabled;
}


//returns selected entity's current state if it is available
function getEntityState(entity) {
  var return_state = null;
  if (Haobj) {
    if (Haobj.states[entity]) {
      return_state = Haobj.states[entity].state;
    }
  }

  return return_state;
}

//main render function
function renderBackgroundHTML() {
  Opacity = 99;
  var current_config = currentConfig();
  var resolved_opacity = current_config && current_config.opacity !== undefined ? current_config.opacity : (Animated_Config ? Animated_Config.opacity : 99);
  if (parseInt(resolved_opacity) > 0) {
    Opacity = resolved_opacity;
  }
  var state_url = "";
  var temp_enabled = true;
  //rerender background if entity has changed (to avoid no background refresh if the new entity happens to have the same state)
  if (current_config && current_config.entity && Previous_Entity != current_config.entity) {
    Previous_State = null;
  }

  if (current_config != Previous_Config) {
    Previous_State = null;
  }

  //get state of config object
  if (current_config) {
    if (current_config.entity && current_config.state_url) {
      Previous_Entity = current_config.entity;
      var current_state = getEntityState(current_config.entity);
      if (current_config.state_url[current_state]) {
        if (Previous_State != current_state) {
          View_Loaded = false;
          DEBUG_MESSAGE("Configured entity " + current_config.entity + " is now " + current_state, true);
          if (current_config.state_url) {
            var url = current_config.state_url[current_state];
            if (Array.isArray(url)) {
              state_url = url[randomIntFromInterval(0, url.length - 1)];
            }
            else {
              state_url = current_config.state_url[current_state];
            }
          }
          Previous_State = current_state;
          if (Haobj && Haobj.states[current_config.entity]) {
            Previous_Last_Updated = Haobj.states[current_config.entity].last_updated;
          }
        }
      }
      else {
        DEBUG_MESSAGE("No state_url found for the current state '" + current_state + "'. Attempting to set default_url")
        Previous_State = current_state;
        Previous_Url = null;
        var url = current_config.default_url;
        if (url) {
          if (Array.isArray(url)) {
            state_url = url[randomIntFromInterval(0, url.length - 1)];
          }
          else {
            state_url = url;
          }
        }
        else {
          if (!current_config.reason) {
            DEBUG_MESSAGE("No default_url found, restoring lovelace theme")
          }
          temp_enabled = false;
        }
      }
    }
    else {
      var url = current_config.default_url;
      if (url) {
        if (Array.isArray(url)) {
          state_url = url[randomIntFromInterval(0, url.length - 1)];
        }
        else {
          state_url = url;
        }
      }
      else {
        if (!current_config.reason) {
          DEBUG_MESSAGE("No default_url found, restoring lovelace theme")
        }
        temp_enabled = false;
      }
    }
  }
  else {
    temp_enabled = false;
  }

  if (temp_enabled) {
    temp_enabled = enabled();
  }

  processDefaultBackground(temp_enabled);

  if (!temp_enabled || !current_config) {
    return;
  }

  Previous_Config = current_config;

  if (current_config.refresh_interval && !Refresh_Timer) {
    Refresh_Timer = setInterval(function() {
      Previous_State = null;
      Previous_Url = null;
      renderBackgroundHTML();
    }, current_config.refresh_interval * 60 * 1000);
  } else if (!current_config.refresh_interval) {
    clearRefreshTimer();
  }

  var html_to_render;
  if (state_url != "" && Hui) {
    var bg = Hui.shadowRoot.getElementById("background-iframe");
    var video_type = urlIsVideo(state_url);
    var doc_body;
    if (video_type) {
      doc_body = `<video id='cinemagraph' autoplay='' loop='' preload='' playsinline='' muted='' poster=''><source src='${state_url}' type='video/${video_type}'></video>`
    }
    else {
      doc_body = `<img src='${state_url}'>`
    }

    // Optional tint overlay drawn above the media. Resolved from the current
    // config, falling back to the root config — same pattern as opacity and
    // transparent_panel. `color` is any CSS color; `opacity` is 0..1.
    var overlay = current_config.overlay !== undefined
      ? current_config.overlay
      : (Animated_Config ? Animated_Config.overlay : null);
    var overlay_style = "";
    var overlay_html = "";
    if (overlay && (overlay.color || overlay.opacity != null)) {
      var overlay_color = overlay.color || "#000000";
      var overlay_opacity = overlay.opacity != null ? overlay.opacity : 0.3;
      overlay_style = `
        #overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: ${overlay_color};
          opacity: ${overlay_opacity};
          pointer-events: none;
        }`;
      overlay_html = `<div id='overlay'></div>`;
    }

    var source_doc = `
    <html>
    <head>
      <style type='text/css'>
        body {
          min-height: 100vh;
          min-width: 100vw;
          max-height: 100%;
          max-width: 100%;
          overflow: hidden;
          margin: 0;
          position: relative;
        }
    
        video {
          min-width: 100%;
          min-height: 100%;
          width: auto;
          height: auto;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
        
        img {
          min-width: 100%;
          min-height: 100%;
          width: auto;
          height: auto;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
        ${overlay_style}
      </style>
    </head>  
    <body id='source-body'>
    ${doc_body}
    ${overlay_html}
    </body>
    </html>`;
    if (!bg) {
      if (!current_config.entity) {
        STATUS_MESSAGE("Applying default background", true);
      }
      var style = document.createElement("style");
      style.innerHTML = `
      .bg-video{
          min-width: 100vw; 
          min-height: 100vh;    
      }
      
      #view {
          background: none;
        }
      
      .bg-wrap{
          position: fixed;
          left: 0;
          top: 0;
          min-width: 100vw; 
          min-height: 100vh;
          z-index: -12;
          pointer-events: none;
      }

      #background-iframe{
          pointer-events: none;
      }

      hui-view-background{
          background:none;
      }
      `;

      // Only apply opacity if configured - note this creates a CSS stacking
      // context which may cause overlays (e.g. Bubble Card) to appear behind
      // the background. Remove opacity: from your config if this affects you.
      if (Opacity < 99) {
        style.innerHTML += `
      hui-masonry-view,
      hui-sections-view,
      hui-panel-view {
          opacity: 0.` + Opacity + `;
      }`;
      }

// transparent for top Pannel
      var div = document.createElement("div");
      div.id = "background-video";
      div.className = "bg-wrap";
      div.innerHTML = `
       <iframe id="background-iframe" class="bg-video" frameborder="0" style="pointer-events:none;" srcdoc="${source_doc}"/> 
      
      `;
    
      Root.shadowRoot.appendChild(style);
      Root.shadowRoot.appendChild(div);
      
      View.setAttribute ("style","background:none;");
      
      Previous_Url = state_url;
    }
    else {
      if (current_config.entity || (Previous_Url != state_url)) {
        if (!current_config.entity) {
          STATUS_MESSAGE("Applying default background", true);
          Previous_Entity = null;
          Previous_State = null;
        }
        bg.srcdoc = source_doc;
        Previous_Url = state_url;
      }
    }

    }  // <-- this closes the if (state_url != "" && Hui) block

  // transparent for top Panel - evaluated on every render
  // Fall back to root Animated_Config for top-level settings not present in group/view configs
  var transparent_panel = current_config.transparent_panel !== undefined ? current_config.transparent_panel : (Animated_Config ? Animated_Config.transparent_panel : false);
  if (transparent_panel) {
    if (!Hui.shadowRoot.getElementById('animated-bg-panel-style')) {
      var ha_style = document.createElement('style');
      ha_style.id = 'animated-bg-panel-style';
      ha_style.innerHTML = `
        .header {
          background-color: transparent !important;
        }
        .toolbar {
          background-color: transparent !important;
        }`;
      Hui.shadowRoot.appendChild(ha_style);
    }
  }
  else {
    var panelStyle = Hui.shadowRoot.getElementById('animated-bg-panel-style');
    if (panelStyle) panelStyle.remove();
  }
}

function urlIsVideo(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  // Normalize URL/path and ignore query strings/hash fragments.
  var clean_url = url.split("?")[0].split("#")[0].toLowerCase();
  var last_dot = clean_url.lastIndexOf(".");
  if (last_dot === -1) {
    return false;
  }

  var extension = clean_url.slice(last_dot + 1);
  if (extension === "mp4" || extension === "webm") {
    return extension;
  }

  return false;
}

//removes lovelace theme background
function removeDefaultBackground(node, current_config) {
  var background = 'transparent';
  if (current_config.background) {
    background = current_config.background;
  }
  if (node.style.background != background) {
    node.style.background = background;
  }
}

//restores lovelace theme background
function restoreDefaultBackground(node) {
  node.style.background = null;
}


//remove background every 100 milliseconds for 2 seconds because race condition memes
function processDefaultBackground(temp_enabled) {
  if (!Meme_Remover) {
    Meme_Remover = setInterval(() => {
      getVars();
      var current_config = currentConfig();

      var view_holder;
      var view_node = null;
      var view_node_panel = null;

      if (Root) {
        view_holder = Root.shadowRoot.getElementById("view");

        if (view_holder) {
          view_node_panel = view_holder.querySelector("hui-panel-view")
          view_node = view_holder.querySelector('hui-view');
        }

        if (view_node || view_node_panel) {
          //required because ios pre 13.4 bitches out if there is nullish coalescing operator ('??')
          var iphone_bullshit_fixer = view_node;
          if (!iphone_bullshit_fixer) {
            iphone_bullshit_fixer = view_node_panel;
          }
          if (temp_enabled) {
            removeDefaultBackground(iphone_bullshit_fixer, current_config);
            DEBUG_MESSAGE("Removing view background for configuration:", currentConfig(), true);
          }
          else {
            restoreDefaultBackground(iphone_bullshit_fixer);
            if (current_config && current_config.reason) {
              DEBUG_MESSAGE("Current config is disabled because " + current_config.reason, null, true);
            }
          }
          View_Loaded = true;
        }
      }
      Meme_Count++;
      if (Meme_Count > 20) {
        clearMemes();
        Meme_Count = 0;
      }

      Loaded = true;
    }, 100);
  }
}

function clearMemes() {
  clearInterval(Meme_Remover);
  Meme_Remover = null;
}

function clearRefreshTimer() {
  clearInterval(Refresh_Timer);
  Refresh_Timer = null;
}

function setDebugMode() {
  if (Animated_Config) {
    if (Animated_Config.debug) {
      Debug_Mode = Animated_Config.debug;
      if (Animated_Config.display_user_agent) {
        if (Animated_Config.display_user_agent == true) {
          alert(navigator.userAgent);
        }
      }
    }
    else {
      Debug_Mode = false;
    }
  }
  else {
    Debug_Mode = false;
  }
}

function cleanupDOM() {
  if (Root && Root.shadowRoot) {
    var oldDiv = Root.shadowRoot.getElementById('background-video');
    if (oldDiv) oldDiv.remove();
    var oldStyles = Root.shadowRoot.querySelectorAll('style');
    oldStyles.forEach(function(s) { s.remove(); });
  }
  if (Hui && Hui.shadowRoot) {
    var panelStyle = Hui.shadowRoot.getElementById('animated-bg-panel-style');
    if (panelStyle) panelStyle.remove();
  }
}

//main function
function run() {
  getVars();
  setDebugMode();
  STATUS_MESSAGE("Starting");
  DEBUG_MESSAGE("Starting, Debug mode enabled");
  if (!Loaded) {
    if (!currentConfig()) {
      if (Debug_Mode) {
        DEBUG_MESSAGE("No configuration found");
      }
      else {
        STATUS_MESSAGE("No configuration found");
      }
    }
  }

  //subscribe to hass object to detect state changes
  if (!Haobj) {
    document.querySelector("home-assistant").provideHass({
      set hass(value) {
        if (Haobj && Haobj.panelUrl != value.panelUrl) {
          restart();
        }
        Haobj = value;
        var current_config = currentConfig();
        if (Loaded) {
          if (current_config && current_config.entity) {
            var current_state = getEntityState(current_config.entity);
            var entity_data = Haobj.states[current_config.entity];
            var current_last_updated = entity_data ? entity_data.last_updated : null;
            var state_changed = Previous_State != current_state;
            var force_refresh = current_config.refresh_on_update && current_last_updated !== Previous_Last_Updated;
            if (state_changed || force_refresh) {
              if (force_refresh && !state_changed) {
                Previous_State = null;
              }
              clearMemes();
              renderBackgroundHTML();
            }
          }

        }
        else {
          renderBackgroundHTML();
        }
      }
    });
  }
  else {
    if (!Loaded) {
      renderBackgroundHTML();
    }
  }

  if (!View) {
    restart();
    return;
  }

  View_Observer.observe(View, {
    characterData: true,
    childList: true,
    subtree: true,
    characterDataOldValue: true
  });

  Hui_Observer.disconnect();
  Hui_Observer.observe(Hui, {
    characterData: true,
    childList: true,
    subtree: true,
    characterDataOldValue: true
  });

  Panel_Observer.disconnect();
  Panel_Observer.observe(Panel_Holder, {
    characterData: true,
    childList: true,
    subtree: true,
    characterDataOldValue: true
  });
}

function restart() {
  cleanupDOM();
  clearRefreshTimer();
  clearInterval(wait_interval);
  var wait_interval = setInterval(() => {
    getVars()
    if (Hui) {
      Previous_Entity = null;
      Previous_State = null;
      Previous_Last_Updated = null;
      Loaded = false;
      View_Loaded = false;
      clearMemes();
      View_Observer.disconnect();
      run();
      clearInterval(wait_interval);
    }
  }, 200);
}

run();

// ======================================================================
// Visual Configuration Editor
//
// Registers a `custom:animated-background-editor` card. Place it on any
// view of the dashboard you want to configure. It reads the dashboard's
// root `animated_background:` config, lets you edit it in a form, and
// saves it back through hui-root's lovelace.saveConfig(). On YAML-mode
// dashboards (where saveConfig is unavailable) it instead shows the
// generated YAML block to copy into your configuration file.
// ======================================================================
(function () {
  "use strict";

  if (window.__animatedBackgroundEditorLoaded) {
    return;
  }
  window.__animatedBackgroundEditorLoaded = true;

  var KNOWN_DEVICES = ["iphone", "ipad", "windows", "macintosh", "android"];

  // -------------------- pure helpers (also used by the smoke tests) ----

  function splitLines(text) {
    return String(text == null ? "" : text)
      .split("\n")
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 0; });
  }

  // textarea content -> string | string[] | undefined (undefined = remove key)
  function linesToUrlValue(text) {
    var lines = splitLines(text);
    if (lines.length === 0) return undefined;
    if (lines.length === 1) return lines[0];
    return lines;
  }

  // config value -> textarea content
  function urlValueToLines(value) {
    if (value == null) return "";
    if (Array.isArray(value)) return value.join("\n");
    return String(value);
  }

  // "a, b\nc" -> ["a", "b", "c"]
  function textToList(text) {
    return String(text == null ? "" : text)
      .split(/[\n,]/)
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 0; });
  }

  function listToText(value) {
    if (Array.isArray(value)) return value.join(", ");
    if (value == null) return "";
    return String(value);
  }

  function stateMapToRows(map) {
    return Object.keys(map || {}).map(function (key) {
      return { state: key, urls: urlValueToLines(map[key]) };
    });
  }

  // state rows -> state_url map, or undefined when nothing is filled in
  function rowsToStateMap(rows) {
    var map = {};
    (rows || []).forEach(function (row) {
      var key = String(row.state || "").trim();
      var value = linesToUrlValue(row.urls);
      if (key && value !== undefined) {
        map[key] = value;
      }
    });
    return Object.keys(map).length > 0 ? map : undefined;
  }

  // sub-config (group/view config) -> editable sub-form
  function subFormFromConfig(cfg) {
    cfg = cfg || {};
    var overlay = cfg.overlay || {};
    return {
      entity: cfg.entity || "",
      default_url: urlValueToLines(cfg.default_url),
      states: stateMapToRows(cfg.state_url),
      overlay_enabled: !!cfg.overlay,
      overlay_color: overlay.color || "#000000",
      overlay_opacity: overlay.opacity != null ? String(overlay.opacity) : "0.3"
    };
  }

  // editable sub-form -> sub-config, or null when the form is empty
  function subConfigFromForm(sf) {
    if (!sf) return null;
    var cfg = {};
    if (String(sf.entity || "").trim()) cfg.entity = String(sf.entity).trim();
    var default_url = linesToUrlValue(sf.default_url);
    if (default_url !== undefined) cfg.default_url = default_url;
    var state_url = rowsToStateMap(sf.states);
    if (state_url) cfg.state_url = state_url;
    if (sf.overlay_enabled) {
      var parsed = parseFloat(sf.overlay_opacity);
      cfg.overlay = {
        color: String(sf.overlay_color || "#000000"),
        opacity: isNaN(parsed) ? 0.3 : Math.min(1, Math.max(0, parsed))
      };
    }
    return Object.keys(cfg).length > 0 ? cfg : null;
  }

  // root config + lovelace views -> full editable form
  function formFromConfig(cfg, lovelaceViews) {
    cfg = cfg || {};
    var overlay = cfg.overlay || {};

    var customByPath = {};
    (cfg.views || []).forEach(function (entry) {
      if (entry && entry.path != null && entry.config) {
        customByPath[String(entry.path)] = entry.config;
      }
    });

    var seen = {};
    var views = [];
    (lovelaceViews || []).forEach(function (view, index) {
      var path = view.path != null ? String(view.path) : String(index);
      seen[path] = true;
      var assignment = view.animated_background;
      var mode = "inherit";
      var group = "";
      var custom = null;
      if (customByPath[path]) {
        mode = "custom";
        custom = subFormFromConfig(customByPath[path]);
      } else if (assignment === "none") {
        mode = "none";
      } else if (typeof assignment === "string" && assignment) {
        mode = "group";
        group = assignment;
      }
      views.push({
        path: path,
        title: view.title || "",
        mode: mode,
        group: group,
        orphan: false,
        custom: custom || subFormFromConfig(null)
      });
    });
    // root `views:` entries that no longer match a dashboard view (stale)
    Object.keys(customByPath).forEach(function (path) {
      if (!seen[path]) {
        views.push({
          path: path,
          title: "(view not found in dashboard)",
          mode: "custom",
          group: "",
          orphan: true,
          custom: subFormFromConfig(customByPath[path])
        });
      }
    });

    var groups = (cfg.groups || []).map(function (group) {
      return {
        name: (group && group.name) || "",
        custom: subFormFromConfig(group && group.config)
      };
    });

    var opacity = cfg.opacity;
    return {
      enabled: cfg.enabled !== false,
      default_url: urlValueToLines(cfg.default_url),
      entity: cfg.entity || "",
      states: stateMapToRows(cfg.state_url),
      transparent_panel: !!cfg.transparent_panel,
      opacity: opacity != null ? String(opacity) : "",
      overlay_enabled: !!cfg.overlay,
      overlay_color: overlay.color || "#000000",
      overlay_opacity: overlay.opacity != null ? String(overlay.opacity) : "0.3",
      refresh_interval: cfg.refresh_interval != null ? String(cfg.refresh_interval) : "",
      refresh_on_update: !!cfg.refresh_on_update,
      included_users: listToText(cfg.included_users),
      excluded_users: listToText(cfg.excluded_users),
      included_devices: (cfg.included_devices || []).slice(),
      excluded_devices: (cfg.excluded_devices || []).slice(),
      debug: !!cfg.debug,
      display_user_agent: !!cfg.display_user_agent,
      views: views,
      groups: groups
    };
  }

  // full form -> { animated_background, assignments }
  // assignments maps dashboard view path -> group name | "none" | undefined
  // (undefined = remove the view-level key so the view inherits root/groups)
  function configFromForm(form) {
    var cfg = {};
    var assignments = {};

    if (!form.enabled) cfg.enabled = false;

    var default_url = linesToUrlValue(form.default_url);
    if (default_url !== undefined) cfg.default_url = default_url;

    if (String(form.entity || "").trim()) cfg.entity = String(form.entity).trim();

    var state_url = rowsToStateMap(form.states);
    if (state_url) cfg.state_url = state_url;

    var opacity = parseInt(form.opacity, 10);
    if (!isNaN(opacity) && opacity > 0 && opacity < 100) cfg.opacity = opacity;

    if (form.overlay_enabled) {
      var parsed = parseFloat(form.overlay_opacity);
      cfg.overlay = {
        color: String(form.overlay_color || "#000000"),
        opacity: isNaN(parsed) ? 0.3 : Math.min(1, Math.max(0, parsed))
      };
    }

    if (form.transparent_panel) cfg.transparent_panel = true;

    var refresh_interval = parseInt(form.refresh_interval, 10);
    if (!isNaN(refresh_interval) && refresh_interval > 0) cfg.refresh_interval = refresh_interval;

    if (form.refresh_on_update) cfg.refresh_on_update = true;

    var included_users = textToList(form.included_users);
    if (included_users.length) cfg.included_users = included_users;

    var excluded_users = textToList(form.excluded_users);
    if (excluded_users.length) cfg.excluded_users = excluded_users;

    if ((form.included_devices || []).length) cfg.included_devices = form.included_devices.slice();
    if ((form.excluded_devices || []).length) cfg.excluded_devices = form.excluded_devices.slice();

    if (form.debug) cfg.debug = true;
    if (form.display_user_agent) cfg.display_user_agent = true;

    var customViews = [];
    (form.views || []).forEach(function (view) {
      var path = String(view.path || "").trim();
      if (!path) return;
      if (view.mode === "custom") {
        var config = subConfigFromForm(view.custom);
        if (config) customViews.push({ path: path, config: config });
      } else if (view.mode === "group") {
        if (String(view.group || "").trim()) assignments[path] = String(view.group).trim();
      } else if (view.mode === "none") {
        assignments[path] = "none";
      } else {
        assignments[path] = undefined; // inherit: remove view-level key
      }
    });
    if (customViews.length) cfg.views = customViews;

    var groups = [];
    (form.groups || []).forEach(function (group) {
      var name = String(group.name || "").trim();
      var config = subConfigFromForm(group.custom);
      if (name && config) groups.push({ name: name, config: config });
    });
    if (groups.length) cfg.groups = groups;

    return { animated_background: cfg, assignments: assignments };
  }

  // -------------------- minimal YAML serializer ------------------------

  function yamlScalar(value) {
    if (typeof value === "number" && isFinite(value)) return String(value);
    if (typeof value === "boolean") return String(value);
    return "'" + String(value).replace(/'/g, "''") + "'";
  }

  function yamlMapLines(obj, indent) {
    var pad = new Array(indent + 1).join(" ");
    return Object.keys(obj)
      .filter(function (key) { return obj[key] !== undefined; })
      .map(function (key) {
        return pad + String(key) + ":" + yamlBlock(obj[key], indent);
      })
      .join("\n");
  }

  function yamlBlock(value, indent) {
    if (value === null || value === undefined) return " null";
    if (typeof value !== "object") return " " + yamlScalar(value);
    var pad = new Array(indent + 1).join(" ");
    if (Array.isArray(value)) {
      if (value.length === 0) return " []";
      return "\n" + value.map(function (item) {
        if (item && typeof item === "object") {
          var inner = yamlMapLines(item, indent + 2);
          return pad + "- " + inner.slice(indent + 2);
        }
        return pad + "- " + yamlScalar(item);
      }).join("\n");
    }
    var keys = Object.keys(value).filter(function (key) { return value[key] !== undefined; });
    if (keys.length === 0) return " {}";
    return "\n" + yamlMapLines(value, indent + 2);
  }

  function configToYaml(cfg) {
    var keys = Object.keys(cfg || {}).filter(function (key) { return cfg[key] !== undefined; });
    if (!keys.length) return "# animated_background is empty\n";
    return yamlMapLines(cfg, 0) + "\n";
  }

  // build the YAML snippet users must add to view definitions when the
  // editor cannot write view-level assignments itself (YAML dashboards)
  function assignmentsToYaml(assignments) {
    var paths = Object.keys(assignments || {}).filter(function (path) {
      return assignments[path] !== undefined;
    });
    if (!paths.length) return "";
    return "\n# Also set this on the matching view definitions in your dashboard:\n" +
      paths.map(function (path) {
        return "# - path: " + yamlScalar(path) + "\n#   animated_background: " + yamlScalar(assignments[path]);
      }).join("\n") + "\n";
  }

  // -------------------- lovelace access --------------------------------

  function getLovelace() {
    try {
      var node = document.querySelector("home-assistant");
      node = node && node.shadowRoot;
      node = node && node.querySelector("home-assistant-main");
      node = node && node.shadowRoot;
      node = node && node.querySelector("app-drawer-layout partial-panel-resolver, ha-drawer partial-panel-resolver");
      node = (node && node.shadowRoot) || node;
      node = node && node.querySelector && node.querySelector("ha-panel-lovelace");
      node = node && node.shadowRoot;
      node = node && node.querySelector("hui-root");
      return node ? node.lovelace : null;
    } catch (err) {
      return null;
    }
  }

  // -------------------- the card ----------------------------------------

  function defineEditor() {
    if (customElements.get("animated-background-editor")) return;

    var litBase = customElements.get("hui-view") || customElements.get("hui-masonry-view");
    var html = litBase.html;
    var css = litBase.css;
    var LitElement = Object.getPrototypeOf(litBase);

    class AnimatedBackgroundEditor extends LitElement {
      static get properties() {
        return {
          hass: { attribute: false },
          _tab: { state: true },
          _form: { state: true },
          _dirty: { state: true },
          _status: { state: true },
          _yamlOut: { state: true },
          _warnings: { state: true }
        };
      }

      static get styles() {
        return css`
          :host {
            display: block;
          }
          .head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 8px;
          }
          .title {
            font-weight: 600;
          }
          .tabs {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-bottom: 12px;
          }
          .tabs button {
            border: 1px solid var(--divider-color, #ccc);
            background: transparent;
            color: var(--primary-text-color, #111);
            border-radius: 16px;
            padding: 4px 12px;
            cursor: pointer;
            font-size: 13px;
          }
          .tabs button[active] {
            background: var(--primary-color, #03a9f4);
            border-color: var(--primary-color, #03a9f4);
            color: var(--text-on-primary-color, #fff);
          }
          .row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            flex-wrap: wrap;
          }
          .row label {
            min-width: 170px;
            font-size: 13px;
          }
          .grow {
            flex: 1;
            min-width: 200px;
          }
          input[type="text"], input[type="number"], textarea, select {
            width: 100%;
            box-sizing: border-box;
            padding: 6px 8px;
            border: 1px solid var(--divider-color, #ccc);
            border-radius: 4px;
            background: var(--card-background-color, #fff);
            color: var(--primary-text-color, #111);
            font: inherit;
          }
          textarea {
            min-height: 54px;
            resize: vertical;
          }
          textarea.urls {
            font-family: var(--code-font-family, monospace);
            font-size: 12px;
          }
          .check {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            margin: 4px 0;
          }
          .section {
            border-top: 1px solid var(--divider-color, #eee);
            margin-top: 12px;
            padding-top: 8px;
          }
          .section h4 {
            margin: 4px 0 8px;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            opacity: 0.7;
          }
          .hint {
            font-size: 12px;
            opacity: 0.7;
            margin: 2px 0 8px;
          }
          .sub {
            border: 1px solid var(--divider-color, #ccc);
            border-radius: 8px;
            padding: 8px;
            margin: 8px 0;
          }
          .actions {
            display: flex;
            gap: 8px;
            margin-top: 12px;
            flex-wrap: wrap;
          }
          button.primary, button.small {
            cursor: pointer;
            font: inherit;
            border-radius: 4px;
          }
          button.primary {
            background: var(--primary-color, #03a9f4);
            color: var(--text-on-primary-color, #fff);
            border: none;
            padding: 8px 18px;
          }
          button.small {
            background: transparent;
            border: 1px solid var(--divider-color, #ccc);
            color: var(--primary-text-color, #111);
            padding: 2px 8px;
            font-size: 12px;
          }
          .status {
            font-size: 12px;
            opacity: 0.8;
            align-self: center;
          }
          .warn {
            color: var(--warning-color, #ffa600);
            font-size: 12px;
            margin: 4px 0;
          }
          .devchips {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
          }
          .devchips label {
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 13px;
          }
          pre.yaml {
            background: var(--secondary-background-color, #f5f5f5);
            padding: 10px;
            border-radius: 6px;
            overflow: auto;
            font-size: 12px;
            max-height: 420px;
          }
        `;
      }

      constructor() {
        super();
        this._tab = "general";
        this._dirty = false;
        this._status = "";
        this._yamlOut = "";
        this._warnings = [];
        this._form = this._emptyForm();
      }

      connectedCallback() {
        super.connectedCallback();
        this._reload();
      }

      setConfig() {
        // this card is not configured through card YAML
      }

      getCardSize() {
        return 8;
      }

      _emptyForm() {
        return formFromConfig(null, null);
      }

      _reload() {
        var lovelace = getLovelace();
        var config = lovelace && lovelace.config ? lovelace.config.animated_background : null;
        var views = lovelace && lovelace.config && lovelace.config.views ? lovelace.config.views : [];
        this._form = formFromConfig(config, views);
        this._dirty = false;
        this._yamlOut = "";
        this._warnings = [];
      }

      _update(mutator) {
        mutator(this._form);
        this._dirty = true;
        this.requestUpdate();
      }

      _validate(form) {
        var warnings = [];
        if (form.entity && !rowsToStateMap(form.states)) {
          warnings.push("An entity is set but no state URLs are configured, so the default URL will always be used.");
        }
        if (!form.entity && !splitLines(form.default_url).length) {
          warnings.push("No default URL and no entity configured.");
        }
        var paths = {};
        (form.views || []).forEach(function (view) {
          var path = String(view.path || "").trim();
          if (path && paths[path] && view.mode === "custom") {
            warnings.push("More than one custom background is defined for view path '" + path + "'.");
          }
          paths[path] = true;
        });
        var names = {};
        (form.groups || []).forEach(function (group) {
          var name = String(group.name || "").trim();
          if (name && names[name]) warnings.push("Duplicate group name '" + name + "'.");
          names[name] = true;
        });
        return warnings;
      }

      _save() {
        this._warnings = this._validate(this._form);
        var lovelace = getLovelace();
        var built = configFromForm(this._form);

        if (!lovelace || typeof lovelace.saveConfig !== "function") {
          this._yamlOut = configToYaml(built.animated_background) + assignmentsToYaml(built.assignments);
          this._status = "Dashboard is YAML-mode: copy the generated block into your configuration file.";
          return;
        }

        var newConfig = JSON.parse(JSON.stringify(lovelace.config));
        if (Object.keys(built.animated_background).length > 0) {
          newConfig.animated_background = built.animated_background;
        } else {
          delete newConfig.animated_background;
        }
        newConfig.views = (newConfig.views || []).map(function (view) {
          var path = view.path != null ? String(view.path) : null;
          if (path == null || !(path in built.assignments)) return view;
          var copy = Object.assign({}, view);
          var assignment = built.assignments[path];
          if (assignment === undefined) {
            delete copy.animated_background;
          } else {
            copy.animated_background = assignment;
          }
          return copy;
        });

        try {
          lovelace.saveConfig(newConfig);
        } catch (err) {
          this._status = "Save failed: " + err;
          return;
        }

        // re-read config and redraw the background immediately
        try {
          getVars();
          Previous_Config = null;
          renderBackgroundHTML();
        } catch (err) {
          // editor still saved successfully even if the live redraw hiccups
        }

        this._yamlOut = "";
        this._dirty = false;
        this._status = "Saved " + new Date().toLocaleTimeString();
      }

      _copyYaml() {
        var text = this._yamlOut || configToYaml(configFromForm(this._form).animated_background);
        navigator.clipboard.writeText(text).then(
          function () { this._status = "YAML copied to clipboard"; this.requestUpdate(); }.bind(this),
          function () { this._status = "Copy failed, select the text manually"; this.requestUpdate(); }.bind(this)
        );
      }

      // -------------------- sub-form templates ---------------------------

      _subForm(form, onEntity, onDefaultUrl, onState, onAddState, onRemoveState, onOverlay, opts) {
        var states = form.states;
        var currentState = "";
        if (this.hass && form.entity && this.hass.states[form.entity]) {
          currentState = this.hass.states[form.entity].state;
        }
        return html`
          <div class="row">
            <label>Entity</label>
            <input class="grow" type="text" .value=${form.entity}
              list="abe-entity-list" @change=${onEntity} placeholder="e.g. weather.home">
          </div>
          ${currentState ? html`<div class="hint">Current state of ${form.entity}: ${currentState}</div>` : ""}
          ${opts && opts.hideDefaultUrl ? "" : html`
            <div class="row">
              <label>Default URL(s)</label>
              <textarea class="urls grow" .value=${form.default_url} @change=${onDefaultUrl}
                placeholder="One URL per line. Multiple lines = random choice"></textarea>
            </div>
          `}
          <div class="hint">One URL per line. Multiple lines for a state = a random URL is picked each refresh.</div>
          ${states.map(function (row, index) {
            return html`
              <div class="row">
                <input style="max-width:160px" type="text" placeholder="state" .value=${row.state}
                  @change=${function (e) { onState(index, "state", e.target.value); }}>
                <textarea class="urls grow" placeholder="URL(s) for this state" .value=${row.urls}
                  @change=${function (e) { onState(index, "urls", e.target.value); }}></textarea>
                <button class="small" type="button" @click=${function () { onRemoveState(index); }}>Remove</button>
              </div>
            `;
          })}
          <div class="row">
            <button class="small" type="button" @click=${onAddState}>Add state</button>
          </div>
          ${opts && opts.hideOverlay ? "" : html`
            <div class="check">
              <input type="checkbox" id="ovr" .checked=${form.overlay_enabled} @change=${onOverlay.toggle}>
              <label for="ovr">Tint overlay</label>
            </div>
            ${form.overlay_enabled ? html`
              <div class="row">
                <label>Overlay color</label>
                <input style="max-width:120px" type="text" .value=${form.overlay_color} @change=${onOverlay.color}>
                <label style="min-width:0">Opacity (0-1)</label>
                <input style="max-width:80px" type="number" min="0" max="1" step="0.05"
                  .value=${form.overlay_opacity} @change=${onOverlay.opacity}>
              </div>
            ` : ""}
          `}
        `;
      }

      // -------------------- tabs ------------------------------------------

      _renderGeneral() {
        var form = this._form;
        return html`
          <div class="check">
            <input type="checkbox" id="en" .checked=${form.enabled}
              @change=${function (e) { this._update(function (f) { f.enabled = e.target.checked; }); }.bind(this)}>
            <label for="en">Background enabled</label>
          </div>
          <div class="row">
            <label>Default URL(s)</label>
            <textarea class="urls grow" .value=${form.default_url}
              @change=${function (e) { this._update(function (f) { f.default_url = e.target.value; }); }.bind(this)}
              placeholder="One URL per line. Multiple lines = random choice"></textarea>
          </div>
          <div class="row">
            <label>Transparent top panel</label>
            <input type="checkbox" .checked=${form.transparent_panel}
              @change=${function (e) { this._update(function (f) { f.transparent_panel = e.target.checked; }); }.bind(this)}>
          </div>
          <div class="row">
            <label>Card opacity (1-99)</label>
            <input style="max-width:90px" type="number" min="1" max="99" .value=${form.opacity}
              @change=${function (e) { this._update(function (f) { f.opacity = e.target.value; }); }.bind(this)}>
            <span class="hint">Empty = disabled. Makes cards see-through with a compatible theme. Creates a CSS stacking context (see README).</span>
          </div>
          <div class="check">
            <input type="checkbox" id="ov" .checked=${form.overlay_enabled}
              @change=${function (e) { this._update(function (f) { f.overlay_enabled = e.target.checked; }); }.bind(this)}>
            <label for="ov">Tint overlay over the background</label>
          </div>
          ${form.overlay_enabled ? html`
            <div class="row">
              <label>Overlay color</label>
              <input style="max-width:120px" type="text" .value=${form.overlay_color}
                @change=${function (e) { this._update(function (f) { f.overlay_color = e.target.value; }); }.bind(this)}>
              <label style="min-width:0">Opacity (0-1)</label>
              <input style="max-width:80px" type="number" min="0" max="1" step="0.05" .value=${form.overlay_opacity}
                @change=${function (e) { this._update(function (f) { f.overlay_opacity = e.target.value; }); }.bind(this)}>
            </div>
          ` : ""}
          <div class="row">
            <label>Refresh interval (minutes)</label>
            <input style="max-width:90px" type="number" min="1" .value=${form.refresh_interval}
              @change=${function (e) { this._update(function (f) { f.refresh_interval = e.target.value; }); }.bind(this)}>
            <span class="hint">Empty = never. Re-picks from the current URL list.</span>
          </div>
          <div class="check">
            <input type="checkbox" id="rou" .checked=${form.refresh_on_update}
              @change=${function (e) { this._update(function (f) { f.refresh_on_update = e.target.checked; }); }.bind(this)}>
            <label for="rou">Refresh when the entity updates, even if the state is unchanged</label>
          </div>
        `;
      }

      _renderStates() {
        var form = this._form;
        var self = this;
        return html`
          ${this._subForm(
            { entity: form.entity, default_url: "", states: form.states, overlay_enabled: false,
              overlay_color: "#000000", overlay_opacity: "0.3" },
            function (e) { self._update(function (f) { f.entity = e.target.value; }); },
            function () {},
            function (index, field, value) {
              self._update(function (f) { f.states[index][field] = value; });
            },
            function () {
              self._update(function (f) { f.states.push({ state: "", urls: "" }); });
            },
            function (index) {
              self._update(function (f) { f.states.splice(index, 1); });
            },
            {
              toggle: function () {},
              color: function () {},
              opacity: function () {}
            },
            { hideDefaultUrl: true, hideOverlay: true }
          )}
          <div class="hint">Maps states of the entity above to background URLs. States without an entry fall back to the default URL. Set a state's URL to <b>none</b> to disable the background for that state.</div>
        `;
      }

      _renderViews() {
        var self = this;
        var form = this._form;
        var groupNames = (form.groups || []).map(function (g) { return g.name; }).filter(Boolean);
        return html`
          <div class="hint">Per-view overrides. "Inherit" uses the root config (and any group assigned to the view). Group/None assignments are written onto the dashboard view definitions on save.</div>
          ${(form.views || []).map(function (view, index) {
            var isCustom = view.mode === "custom";
            return html`
              <div class="sub">
                <div class="row">
                  <b>${view.title || view.path}</b>
                  <span class="hint">${view.path}${view.orphan ? " (stale entry)" : ""}</span>
                </div>
                <div class="row">
                  <label>Background</label>
                  <select .value=${view.mode}
                    @change=${function (e) {
                      self._update(function (f) { f.views[index].mode = e.target.value; });
                    }}>
                    <option value="inherit">Inherit root config</option>
                    <option value="group">Use a group</option>
                    <option value="none">Disabled ('none')</option>
                    <option value="custom">Custom config</option>
                  </select>
                  ${view.mode === "group" ? html`
                    <select .value=${view.group}
                      @change=${function (e) {
                        self._update(function (f) { f.views[index].group = e.target.value; });
                      }}>
                      <option value="">Choose group...</option>
                      ${groupNames.map(function (name) {
                        return html`<option value=${name} ?selected=${name === view.group}>${name}</option>`;
                      })}
                    </select>
                  ` : ""}
                </div>
                ${isCustom ? html`
                  <div class="sub">
                    ${self._subForm(
                      view.custom,
                      function (e) { self._update(function (f) { f.views[index].custom.entity = e.target.value; }); },
                      function (e) { self._update(function (f) { f.views[index].custom.default_url = e.target.value; }); },
                      function (si, field, value) {
                        self._update(function (f) { f.views[index].custom.states[si][field] = value; });
                      },
                      function () {
                        self._update(function (f) { f.views[index].custom.states.push({ state: "", urls: "" }); });
                      },
                      function (si) {
                        self._update(function (f) { f.views[index].custom.states.splice(si, 1); });
                      },
                      {
                        toggle: function (e) { self._update(function (f) { f.views[index].custom.overlay_enabled = e.target.checked; }); },
                        color: function (e) { self._update(function (f) { f.views[index].custom.overlay_color = e.target.value; }); },
                        opacity: function (e) { self._update(function (f) { f.views[index].custom.overlay_opacity = e.target.value; }); }
                      }
                    )}
                  </div>
                ` : ""}
              </div>
            `;
          })}
          ${(form.views || []).length === 0 ? html`<div class="hint">This dashboard has no views yet.</div>` : ""}
        `;
      }

      _renderGroups() {
        var self = this;
        var form = this._form;
        return html`
          <div class="hint">Named reusable configurations. Assign them to views in the Views tab, or set <b>animated_background: &lt;group name&gt;</b> on a view definition.</div>
          ${(form.groups || []).map(function (group, index) {
            return html`
              <div class="sub">
                <div class="row">
                  <label>Group name</label>
                  <input class="grow" type="text" .value=${group.name}
                    @change=${function (e) {
                      self._update(function (f) { f.groups[index].name = e.target.value; });
                    }}>
                  <button class="small" type="button"
                    @click=${function () { self._update(function (f) { f.groups.splice(index, 1); }); }}>Remove group</button>
                </div>
                ${self._subForm(
                  group.custom,
                  function (e) { self._update(function (f) { f.groups[index].custom.entity = e.target.value; }); },
                  function (e) { self._update(function (f) { f.groups[index].custom.default_url = e.target.value; }); },
                  function (si, field, value) {
                    self._update(function (f) { f.groups[index].custom.states[si][field] = value; });
                  },
                  function () {
                    self._update(function (f) { f.groups[index].custom.states.push({ state: "", urls: "" }); });
                  },
                  function (si) {
                    self._update(function (f) { f.groups[index].custom.states.splice(si, 1); });
                  },
                  {
                    toggle: function (e) { self._update(function (f) { f.groups[index].custom.overlay_enabled = e.target.checked; }); },
                    color: function (e) { self._update(function (f) { f.groups[index].custom.overlay_color = e.target.value; }); },
                    opacity: function (e) { self._update(function (f) { f.groups[index].custom.overlay_opacity = e.target.value; }); }
                  }
                )}
              </div>
            `;
          })}
          <div class="row">
            <button class="small" type="button"
              @click=${function () {
                self._update(function (f) {
                  f.groups.push({ name: "", custom: subFormFromConfig(null) });
                });
              }}>Add group</button>
          </div>
        `;
      }

      _renderAccess() {
        var self = this;
        var form = this._form;
        var deviceRow = function (field) {
          return html`
            <div class="devchips">
              ${KNOWN_DEVICES.map(function (device) {
                var checked = (form[field] || []).indexOf(device) !== -1;
                return html`
                  <label>
                    <input type="checkbox" .checked=${checked}
                      @change=${function (e) {
                        self._update(function (f) {
                          var list = f[field];
                          var at = list.indexOf(device);
                          if (e.target.checked && at === -1) list.push(device);
                          if (!e.target.checked && at !== -1) list.splice(at, 1);
                        });
                      }}>
                    ${device}
                  </label>
                `;
              })}
            </div>
          `;
        };
        return html`
          <div class="section">
            <h4>Included users (empty = everyone)</h4>
            <textarea class="grow" .value=${form.included_users}
              @change=${function (e) { self._update(function (f) { f.included_users = e.target.value; }); }}></textarea>
            <h4>Excluded users</h4>
            <textarea class="grow" .value=${form.excluded_users}
              @change=${function (e) { self._update(function (f) { f.excluded_users = e.target.value; }); }}></textarea>
            <div class="hint">Comma or newline separated Home Assistant usernames.</div>
          </div>
          <div class="section">
            <h4>Included devices (empty = all)</h4>
            ${deviceRow("included_devices")}
            <h4>Excluded devices</h4>
            ${deviceRow("excluded_devices")}
            <div class="hint">Device types are matched against the browser user agent. Use debug + "show user agent" on the Advanced tab to find the right value.</div>
          </div>
        `;
      }

      _renderAdvanced() {
        var self = this;
        var form = this._form;
        return html`
          <div class="check">
            <input type="checkbox" id="dbg" .checked=${form.debug}
              @change=${function (e) { self._update(function (f) { f.debug = e.target.checked; }); }}>
            <label for="dbg">Debug logging (browser console)</label>
          </div>
          <div class="check">
            <input type="checkbox" id="ua" .checked=${form.display_user_agent}
              @change=${function (e) { self._update(function (f) { f.display_user_agent = e.target.checked; }); }}>
            <label for="ua">Show my user agent on reload (for device lists)</label>
          </div>
        `;
      }

      render() {
        var self = this;
        var tabs = [
          ["general", "General"],
          ["states", "Entity & States"],
          ["views", "Views"],
          ["groups", "Groups"],
          ["access", "Access"],
          ["advanced", "Advanced"]
        ];
        var body;
        if (this._tab === "general") body = this._renderGeneral();
        else if (this._tab === "states") body = this._renderStates();
        else if (this._tab === "views") body = this._renderViews();
        else if (this._tab === "groups") body = this._renderGroups();
        else if (this._tab === "access") body = this._renderAccess();
        else body = this._renderAdvanced();

        var entityList = this.hass ? Object.keys(this.hass.states) : [];

        return html`
          <ha-card>
            <div style="padding: 12px 16px 16px">
              <div class="head">
                <span class="title">Animated Background</span>
                <span class="status">${this._status}</span>
              </div>
              <div class="tabs">
                ${tabs.map(function (tab) {
                  return html`
                    <button type="button" ?active=${self._tab === tab[0]}
                      @click=${function () { self._tab = tab[0]; self.requestUpdate(); }}>${tab[1]}</button>
                  `;
                })}
              </div>
              ${this._warnings.map(function (warning) {
                return html`<div class="warn">${warning}</div>`;
              })}
              ${body}
              ${this._yamlOut ? html`
                <div class="section">
                  <h4>Generated YAML</h4>
                  <pre class="yaml" id="abe-yaml">${this._yamlOut}</pre>
                  <div class="row">
                    <button class="small" type="button" @click=${function () { self._copyYaml(); }}>Copy YAML</button>
                  </div>
                </div>
              ` : ""}
              <div class="actions">
                <button class="primary" type="button" ?disabled=${!this._dirty}
                  @click=${function () { self._save(); }}>Save</button>
                <button class="small" type="button" @click=${function () { self._reload(); }}>Reload config</button>
                <button class="small" type="button" @click=${function () { self._copyYaml(); }}>Copy YAML</button>
              </div>
            </div>
          </ha-card>
          <datalist id="abe-entity-list">
            ${entityList.map(function (entityId) {
              return html`<option value=${entityId}></option>`;
            })}
          </datalist>
        `;
      }
    }

    customElements.define("animated-background-editor", AnimatedBackgroundEditor);

    window.customCards = window.customCards || [];
    window.customCards.push({
      type: "animated-background-editor",
      name: "Animated Background Editor",
      description: "Visual editor for the dashboard's animated_background configuration",
      preview: false
    });

    STATUS_MESSAGE("Editor card registered");
  }

  // wait for HA's Lit classes to exist before defining the card
  var attempts = 0;
  var wait_timer = setInterval(function () {
    attempts++;
    if (customElements.get("hui-view") || customElements.get("hui-masonry-view")) {
      clearInterval(wait_timer);
      try {
        defineEditor();
      } catch (err) {
        console.error("Animated Background: failed to register editor card", err);
      }
    } else if (attempts > 240) {
      clearInterval(wait_timer);
      console.warn("Animated Background: editor card not registered, HA frontend elements never appeared");
    }
  }, 500);

  // exposed for testing
  window.__animatedBackgroundEditor = {
    splitLines: splitLines,
    linesToUrlValue: linesToUrlValue,
    urlValueToLines: urlValueToLines,
    textToList: textToList,
    subFormFromConfig: subFormFromConfig,
    subConfigFromForm: subConfigFromForm,
    formFromConfig: formFromConfig,
    configFromForm: configFromForm,
    configToYaml: configToYaml
  };
})();
